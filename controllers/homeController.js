/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// controllers/homeController.js

import { Request } from "../models/Request.js";
import { User } from "../models/User.js";
import { Op } from "sequelize";
import bcrypt from "bcrypt";
import { sequelize, Notice, RequestEvent, Resident, CivilRecord } from '../models/Platform.js';
import { audit, notifyStaff, requestEvent } from '../services/platform.js';
import { can, date, fail, integer, requestStatus, roles, text, paymentComplete } from '../services/platformRules.js';

export const homePage = (req, res) => {
  res.render("home", { title: "SmartCivi" });
};

export const browsePage = (req, res) => {
  // Show services/browse page; expose user when available
  res.render('browse', { title: 'Services', user: req.session && req.session.user ? req.session.user : null });
};

export const adminPage = async (req, res) => {
  try {
    // Fetch all data for dashboard analytics
    const requests = await Request.findAll({ order: [['createdAt', 'DESC']] });
    const users = await User.findAll({ attributes: ['id', 'name', 'email', 'role'] });

    // Calculate statistics
    const stats = {
      totalRequests: requests.length,
      totalUsers: users.length,
      pendingRequests: requests.filter(r => r.status === 'pending').length,
      processingRequests: requests.filter(r => r.status === 'processing').length,
      approvedRequests: requests.filter(r => r.status === 'approved').length,
      paidRequests: requests.filter(r => r.status === 'paid').length,
      rejectedRequests: requests.filter(r => r.status === 'rejected').length,
      completedRequests: requests.filter(r => r.status === 'paid' || r.status === 'approved').length,

      // Document type counts
      birthCount: requests.filter(r => r.documentType === 'birth').length,
      marriageCount: requests.filter(r => r.documentType === 'marriage').length,
      deathCount: requests.filter(r => r.documentType === 'death').length
    };

    // Get recent requests (last 5)
    const recentRequests = requests.slice(0, 5).map(r => {
      const data = r.toJSON();
      data.createdAt = new Date(data.createdAt).toLocaleDateString();
      return data;
    });

    res.render('adminDashboard', {
      title: 'Admin Dashboard',
      stats: stats,
      recentRequests: recentRequests
    });
  } catch (err) {
    console.error('Error loading admin dashboard:', err);
    req.flash('error_msg', 'Failed to load admin dashboard');
    return res.redirect('/');
  }
};

export const adminPanelPage = async (req, res) => {
  try {
    // This is the old admin panel with requests table
    const requests = await Request.findAll({ order: [['createdAt', 'DESC']] });
    const users = await User.findAll({ attributes: ['id', 'name', 'email', 'role'] });

    const requestsData = requests.map(r => {
      const data = r.toJSON();
      // Format the date for better display
      data.createdAt = new Date(data.createdAt).toLocaleDateString();
      return data;
    });

    res.render('adminside', {
      title: 'Admin Panel',
      requests: requestsData,
      users: users.map(u => u.toJSON())
    });
  } catch (err) {
    console.error('Error loading admin panel:', err);
    req.flash('error_msg', 'Failed to load admin panel');
    return res.redirect('/');
  }
};

export const requestPage = (req, res) => {
  // Require login before showing the online request form
  if (!req.session.user) return res.redirect('/login');
  // render the appointment view (file is `appoint.xian`)
  res.render("appoint");
};

// Render the submit-request flow (separate from appointment)
export const requestSubmitPage = (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('request');
};

export const toolPage = (req, res) => {
  res.render("adminTool");
};

// Handle POST /request - create a new civil registry request
export const createRequest = async (req, res) => {
  try {
    // Ensure user is authenticated before allowing POST
    if (!req.session.user) {
      req.flash('error_msg', 'Please login to submit a request');
      return res.redirect('/login');
    }
    const { fullName, phone, documentType, purpose } = req.body;
    const email = req.session.user.email;

    // Basic validation
    if (!fullName || !email || !phone || !documentType || !purpose) {
      req.flash('error_msg', 'All fields are required');
      return res.redirect('/request');
    }

    if (!['birth', 'marriage', 'death'].includes(documentType)) fail('Choose a supported certificate type.');
    text(fullName, 'Full name', true); text(phone, 'Phone', true, 40); text(purpose, 'Purpose', true, 3000);
    let appointmentDate = null;
    if (req.body.appointmentDate) {
      appointmentDate = new Date(`${date(req.body.appointmentDate, 'Appointment date', true, false)}T08:00:00+08:00`);
      if (!Number.isFinite(appointmentDate.getTime()) || appointmentDate < new Date()) fail('Choose a future appointment date.');
    }
    const newReq = await sequelize.transaction(async transaction => {
      const created = await Request.create({
      fullName,
      email,
      phone,
      documentType,
      purpose,
      status: 'pending', appointmentDate, appointmentStatus: appointmentDate ? 'scheduled' : null
      }, { transaction });
      await requestEvent(req, created, appointmentDate ? 'Appointment and document request submitted' : 'Document request submitted', transaction);
      await notifyStaff('requests', 'New document request', `Request #${created.id} is awaiting review.`, `/admin/requests/${created.id}`, transaction);
      return created;
    });

    req.flash('success_msg', 'Request submitted successfully');
    // Redirect to print confirmation page
    return res.redirect(`/request/${newReq.id}/confirmation`);
  } catch (error) {
    console.error('Error creating request:', error);
    req.flash('error_msg', 'Failed to submit request');
    return res.redirect('/request');
  }
};
// Admin Requests Page Controller
export const adminRequestsPage = async (req, res) => {
  try {
    const requests = await Request.findAll({
      order: [['createdAt', 'DESC']]
    });

    const requestsData = requests.map(req => {
      const data = req.toJSON();
      // Format the date for better display
      data.createdAt = new Date(data.createdAt).toLocaleDateString();
      return data;
    });

    res.render("adminRequests", {
      title: "Manage Civil Registry Requests",
      requests: requestsData
    });
  } catch (error) {
    console.error("Error loading admin requests:", error);
    req.flash('error_msg', 'Failed to load request data');
    res.redirect('/admin');
  }
};

// Admin actions for requests
export const updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = requestStatus(req.body.status);
    await sequelize.transaction(async transaction => {
      const request = await Request.findByPk(integer(id, 'Request', 1), { transaction, lock: transaction.LOCK.UPDATE });
      if (!request) fail('Request not found.', 404);
      await request.update({ status, ...((status === 'paid' || request.status === 'paid') && !request.paidAt ? { paidAt: new Date() } : {}) }, { transaction });
      await requestEvent(req, request, `Status changed to ${status}`, transaction);
    });
    // If AJAX request, return JSON so client can update UI without redirect
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.json({ success: true, id, status });
    }
    req.flash('success_msg', 'Request status updated');
    return res.redirect('/admin/requests');
  } catch (err) {
    console.error('Error updating request status:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Unable to update status.' });
    }
    req.flash('error_msg', 'Failed to update status');
    return res.redirect('/admin/requests');
  }
};

export const assignRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignee } = req.body;
    text(assignee, 'Assignee', true);
    const user = await User.findOne({ where: { [Op.or]: [{ name: assignee }, { email: assignee }] } });
    if (!user || !can(user.role, 'requests')) fail('Choose an authorized registry staff member.');
    await sequelize.transaction(async transaction => {
      const request = await Request.findByPk(integer(id, 'Request', 1), { transaction, lock: transaction.LOCK.UPDATE });
      if (!request) fail('Request not found.', 404);
      await request.update({ assignee: user.name }, { transaction });
      await requestEvent(req, request, 'Request assigned to registry staff', transaction);
      await Notice.create({ userId: user.id, title: 'Request assigned to you', message: `Review request #${id}.`, url: `/admin/requests/${id}` }, { transaction });
    });
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.json({ success: true, id, assignee });
    }
    req.flash('success_msg', 'Request assigned');
    return res.redirect('/admin/requests');
  } catch (err) {
    console.error('Error assigning request:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.status(500).json({ success: false, error: err.message });
    }
    req.flash('error_msg', 'Failed to assign request');
    return res.redirect('/admin/requests');
  }
};

export const deleteRequestAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    await sequelize.transaction(async transaction => {
      const request = await Request.findByPk(integer(id, 'Request', 1), { transaction, lock: transaction.LOCK.UPDATE });
      if (!request) fail('Request not found.', 404);
      await request.update({ status: 'rejected' }, { transaction });
      await requestEvent(req, request, 'Request cancelled; history retained', transaction);
    });
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.json({ success: true, id });
    }
    req.flash('success_msg', 'Request deleted');
    return res.redirect('/admin/requests');
  } catch (err) {
    console.error('Error deleting request:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.status(500).json({ success: false, error: err.message });
    }
    req.flash('error_msg', 'Failed to delete request');
    return res.redirect('/admin/requests');
  }
};

export const recordsPage = async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  try {
    const requests = await Request.findAll({
      where: { email: req.session.user.email },
      order: [['createdAt', 'DESC']]
    });
    res.render('records', {
      title: 'My Records',
      user: req.session.user,
      requests: requests.map(r => r.toJSON())
    });
  } catch (err) {
    console.error('Error loading records:', err);
    res.status(500).send('Failed to load records');
  }
};

export const searchBirthRecord = async (req, res) => {
  const { fullname, birthdate } = req.body;
  try {
    const requests = await Request.findAll({
      where: {
        ...(!can(req.session.user.role, 'registry') ? { email: req.session.user.email } : {}),
        documentType: 'birth',
        fullName: fullname
      }
    });
    res.render('records', {
      title: "Birth Records Search Results",
      requests: requests.map(req => req.toJSON())
    });
  } catch (error) {
    console.error("Error searching birth records:", error);
    res.status(500).send("Failed to search birth records.");
  }
};

export const searchMarriageRecord = async (req, res) => {
  const { groom, bride, marriagedate } = req.body;
  try {
    const requests = await Request.findAll({
      where: {
        ...(!can(req.session.user.role, 'registry') ? { email: req.session.user.email } : {}),
        documentType: 'marriage',
        fullName: {
          [Op.or]: [groom, bride]
        }
      }
    });
    res.render('records', {
      title: "Marriage Records Search Results",
      requests: requests.map(req => req.toJSON())
    });
  } catch (error) {
    console.error("Error searching marriage records:", error);
    res.status(500).send("Failed to search marriage records.");
  }
};

export const searchDeathRecord = async (req, res) => {
  const { fullname, deathdate } = req.body;
  try {
    const requests = await Request.findAll({
      where: {
        ...(!can(req.session.user.role, 'registry') ? { email: req.session.user.email } : {}),
        documentType: 'death',
        fullName: fullname
      }
    });
    res.render('records', {
      title: "Death Records Search Results",
      requests: requests.map(req => req.toJSON())
    });
  } catch (error) {
    console.error("Error searching death records:", error);
    res.status(500).send("Failed to search death records.");
  }
};
export const reportsPage = (req, res) => {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 7);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  res.render("reports", {
    title: "Generate Reports",
    todayDate: today.toISOString().split('T')[0],
    weekStartDate: weekStart.toISOString().split('T')[0],
    monthStartDate: monthStart.toISOString().split('T')[0]
  });
};

export const generateReport = async (req, res) => {
  const { reportType, startDate, endDate, format, statusFilter } = req.body;

  try {
    // Build query conditions
    let whereConditions = {
      createdAt: {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      }
    };

    // Add document type filter if not 'all'
    if (reportType && reportType !== 'all' && reportType !== 'status' && reportType !== 'monthly') {
      whereConditions.documentType = reportType;
    }

    // Add status filter if provided
    if (statusFilter) {
      const statusArray = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
      if (statusArray.length > 0) {
        whereConditions.status = { [Op.in]: statusArray };
      }
    }

    // Fetch requests
    const requests = await Request.findAll({
      where: whereConditions,
      order: [['createdAt', 'DESC']]
    });

    // Format data for display
    const reportData = requests.map(req => {
      const data = req.toJSON();
      data.createdAt = new Date(data.createdAt).toLocaleDateString();
      return data;
    });

    // Calculate summary statistics
    const reportSummary = {
      total: reportData.length,
      pending: reportData.filter(r => r.status === 'pending').length,
      processing: reportData.filter(r => r.status === 'processing').length,
      approved: reportData.filter(r => r.status === 'approved').length,
      paid: reportData.filter(r => r.status === 'paid').length,
      rejected: reportData.filter(r => r.status === 'rejected').length,
      completed: reportData.filter(r => r.status === 'paid' || r.status === 'approved').length,
      revenue: reportData
        .filter(r => r.paymentAmount)
        .reduce((sum, r) => sum + parseFloat(r.paymentAmount || 0), 0)
        .toFixed(2)
    };

    // Handle different output formats
    if (format === 'csv') {
      return generateCSVReport(res, reportData, reportType);
    } else if (format === 'pdf') {
      return generatePDFReport(res, reportData, reportSummary, reportType);
    }

    // Default HTML format
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 7);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    res.render('reports', {
      title: "Generated Report",
      reportData: reportData,
      reportSummary: reportSummary,
      reportDate: new Date().toLocaleDateString(),
      reportType,
      startDate,
      endDate,
      format,
      showPayment: reportData.some(r => r.paymentAmount),
      todayDate: today.toISOString().split('T')[0],
      weekStartDate: weekStart.toISOString().split('T')[0],
      monthStartDate: monthStart.toISOString().split('T')[0]
    });

  } catch (error) {
    console.error("Error generating report:", error);
    req.flash('error_msg', 'Failed to generate report');
    res.redirect('/admin/reports');
  }
};

// Helper function to generate CSV report
function generateCSVReport(res, data, reportType) {
  const headers = ['ID', 'Full Name', 'Email', 'Phone', 'Document Type', 'Purpose', 'Status', 'Created Date', 'Payment Amount', 'Payment Method'];

  let csv = headers.join(',') + '\n';

  data.forEach(row => {
    const csvRow = [
      row.id,
      `"${row.fullName}"`,
      row.email,
      row.phone,
      row.documentType,
      `"${row.purpose.replace(/"/g, '""')}"`,
      row.status,
      row.createdAt,
      row.paymentAmount || '',
      row.paymentMethod || ''
    ];
    csv += csvRow.join(',') + '\n';
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="smartcivi-report-${reportType}-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
}

// Helper function to generate PDF report (simplified HTML version)
function generatePDFReport(res, data, summary, reportType) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>SmartCivi Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { display: flex; justify-content: space-around; margin: 20px 0; }
        .summary div { text-align: center; padding: 10px; background: #f5f5f5; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
        .pending { background: #fef3c7; color: #92400e; }
        .approved { background: #d1fae5; color: #065f46; }
        .paid { background: #e0e7ff; color: #3730a3; }
        .rejected { background: #fee2e2; color: #991b1b; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>SmartCivi Report</h1>
        <p>Generated on ${new Date().toLocaleDateString()}</p>
        <p>Report Type: ${reportType.toUpperCase()}</p>
      </div>

      <div class="summary">
        <div><strong>${summary.total}</strong><br>Total Requests</div>
        <div><strong>${summary.pending}</strong><br>Pending</div>
        <div><strong>${summary.completed}</strong><br>Completed</div>
        <div><strong>₱${summary.revenue}</strong><br>Revenue</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Document</th>
            <th>Status</th>
            <th>Date</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(row => `
            <tr>
              <td>#${row.id}</td>
              <td>${row.fullName}</td>
              <td>${row.documentType}</td>
              <td><span class="status ${row.status}">${row.status}</span></td>
              <td>${row.createdAt}</td>
              <td>${row.paymentAmount ? '₱' + row.paymentAmount : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="smartcivi-report-${reportType}-${new Date().toISOString().split('T')[0]}.html"`);
  res.send(html);
}
export const usersPage = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'role', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC']]
    });

    res.render("users", {
      title: "User Management",
      users: users.map(user => {
        const userData = user.toJSON();
        // Format dates for display
        userData.createdAt = new Date(userData.createdAt).toLocaleDateString();
        return userData;
      })
    });
  } catch (error) {
    console.error("Error loading users:", error);
    req.flash('error_msg', 'Failed to load users');
    res.redirect('/admin');
  }
};

export const createOrUpdateUser = async (req, res) => {
  const { id, name, email, role, password } = req.body;

  try {
    if (!roles.includes(role)) fail('Choose a valid role.');
    text(name, 'Name', true); text(email, 'Email', true);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email.');
    if (id) {
      const current = await User.findByPk(integer(id, 'User', 1));
      if (!current) fail('User not found.', 404);
      if (current.id === req.session.user.id && role !== 'admin') fail('You cannot remove your own administrator access.');
      if (current.role === 'admin' && role !== 'admin' && await User.count({ where: { role: 'admin' } }) <= 1) fail('The last administrator cannot be demoted.');
    } else if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) fail('Use a password of 8–72 bytes.');
    if (id) {
      // Update existing user (no password change)
      await User.update({ name, email, role }, {
        where: { id }
      });
      req.flash('success_msg', 'User updated successfully');
    } else {
      // Create new user
      if (!password) {
        req.flash('error_msg', 'Password is required for new users');
        return res.redirect("/admin/users");
      }

      // Check if email already exists
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        req.flash('error_msg', 'Email already exists');
        return res.redirect("/admin/users");
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      await User.create({
        name,
        email,
        password: hashedPassword,
        role
      });
      req.flash('success_msg', 'User created successfully');
    }

    await audit(req, id ? 'user.updated' : 'user.created', 'account', id || null, `Role set to ${role}`);
    res.redirect("/admin/users");
  } catch (error) {
    console.error("Error managing user:", error);

    // Handle specific database errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      req.flash('error_msg', 'Email already exists');
    } else if (error.name === 'SequelizeValidationError') {
      req.flash('error_msg', 'Invalid data provided');
    } else {
      req.flash('error_msg', 'Failed to manage user');
    }

    res.redirect("/admin/users");
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    // Check if user exists
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent deleting the last admin
    if (user.role === 'admin') {
      const adminCount = await User.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete the last admin user'
        });
      }
    }

    if (Number(id) === req.session.user.id) return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    await User.destroy({ where: { id } });
    await audit(req, 'user.deleted', 'account', id, 'Account removed');

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
};

export const userActionsPage = (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  // render the `user` view (views/user.xian)
  res.render("user", {
    title: "SmartCivi | Dashboard",
    user: req.session.user
  });
};

export const statusPage = async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  try {
    const requests = await Request.findAll({
      where: {
        email: req.session.user.email
      },
      order: [['createdAt', 'DESC']]
    });

    res.render("status", {
      title: "Request Status Tracker",
      user: req.session.user,
      requests: requests.map(req => ({
        ...req.toJSON(),
        statusColor: {
          'pending': 'yellow',
          'approved': 'green',
          'rejected': 'red'
        }[req.status]
      }))
    });
  } catch (error) {
    console.error("Error loading request status:", error);
    res.status(500).send("Failed to load request status.");
  }
};

export const requestDash = async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  try {
    const requests = await Request.findAll({
      where: {
        email: req.session.user.email
      },
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    res.render("dashboard", {
      title: "Request Dashboard",
      user: req.session.user,
      requests: requests.map(req => req.toJSON())
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).send("Failed to load dashboard.");
  }
};
// --- New scaffolded pages (placeholders) ---
export const profilePage = (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('profile', { title: 'Profile', user: req.session.user });
};

export const requestDetailsPage = async (req, res) => {
  const { id } = req.params;

  // Require authentication
  if (!req.session.user) return res.redirect('/login');

  try {
    const request = await Request.findByPk(id);
    if (!request) {
      return res.render('requestDetails', {
        title: 'Request Details',
        request: null
      });
    }

    // Security check: Users can only view their own requests (unless admin)
    const isAdmin = can(req.session.user.role, 'requests');
    const isOwner = request.email === req.session.user.email;

    if (!isAdmin && !isOwner) {
      return res.render('requestDetails', {
        title: 'Request Details',
        request: null
      });
    }

    res.render('requestDetails', {
      title: 'Request Details',
      request: request.toJSON(),
      events: (await RequestEvent.findAll({ where: { requestId: request.id }, order: [['id', 'ASC']] })).map(event => ({ ...event.toJSON(), when: new Date(event.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) })),
      user: req.session.user
    });
  } catch (err) {
    console.error('Error loading request details:', err);
    res.status(500).send('Failed to load request details');
  }
};

export const myRequestsPage = async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  try {
    const requests = await Request.findAll({ where: { email: req.session.user.email }, order: [['createdAt','DESC']] });
    res.render('myRequests', { title: 'My Requests', requests: requests.map(r=>r.toJSON()) });
  } catch (err) {
    console.error('Error loading my requests:', err);
    res.status(500).send('Failed to load requests');
  }
};

export const adminRequestEditorPage = async (req, res) => {
  const { id } = req.params;
  try {
    const request = await Request.findByPk(id);
    if (!request) return res.status(404).send('Request not found');
    res.render('adminRequestEditor', { title: 'Review Request', request: request.toJSON() });
  } catch (err) {
    console.error('Error loading admin request editor:', err);
    res.status(500).send('Failed to load admin request editor');
  }
};

export const paymentsPage = async (req, res) => {
  const { id } = req.params;

  // Require authentication
  if (!req.session.user) return res.redirect('/login');

  try {
    const request = await Request.findByPk(id);
    if (!request) {
      return res.render('payments', {
        title: 'Payment',
        request: null,
        requestId: id
      });
    }

    // Security check: Users can only pay for their own requests (unless admin)
    const isAdmin = can(req.session.user.role, 'requests');
    const isOwner = request.email === req.session.user.email;

    if (!isAdmin && !isOwner) {
      return res.render('payments', {
        title: 'Payment',
        request: null,
        requestId: id
      });
    }

    // Check if request is approved (only approved requests can be paid)
    if (request.status !== 'approved') {
      req.flash('error_msg', 'This request is not ready for payment yet.');
      return res.redirect(`/request/${id}`);
    }

    // Calculate payment amount based on document type
    const paymentAmounts = {
      'birth': 155.00,
      'marriage': 210.00,
      'death': 155.00
    };

    const paymentAmount = paymentAmounts[request.documentType] || 155.00;

    res.render('payments', {
      title: 'Payment',
      request: request.toJSON(),
      requestId: id,
      paymentAmount: paymentAmount.toFixed(2),
      user: req.session.user
    });
  } catch (err) {
    console.error('Error loading payment page:', err);
    res.status(500).send('Failed to load payment page');
  }
};
export const processPayment = async (req, res) => {
  const { id } = req.params;
  const { paymentMethod } = req.body;

  // Require authentication
  if (!req.session.user) return res.redirect('/login');

  try {
    const request = await Request.findByPk(id);
    if (!request) {
      req.flash('error_msg', 'Request not found');
      return res.redirect('/status');
    }

    // Security check
    const isAdmin = can(req.session.user.role, 'requests');
    const isOwner = request.email === req.session.user.email;

    if (!isAdmin && !isOwner) {
      req.flash('error_msg', 'Unauthorized access');
      return res.redirect('/status');
    }

    // Check if request is approved
    if (request.status !== 'approved') {
      req.flash('error_msg', 'This request is not ready for payment');
      return res.redirect(`/request/${id}`);
    }

    // Calculate payment amount
    const paymentAmounts = {
      'birth': 155.00,
      'marriage': 210.00,
      'death': 155.00
    };
    const paymentAmount = paymentAmounts[request.documentType] || 155.00;

    // Generate payment reference
    const paymentReference = `PAY-${Date.now()}-${id}`;

    // Handle different payment methods
    switch (paymentMethod) {
      case 'online':
        // In a real app, you'd integrate with payment gateway here
        // For demo, we'll simulate successful payment
        await Request.update({
          status: 'paid',
          paymentMethod: 'online',
          paymentReference: paymentReference,
          paymentAmount: paymentAmount
        }, { where: { id } });

        req.flash('success_msg', 'Payment successful! Your document will be processed for release.');
        return res.redirect(`/request/${id}`);

      case 'otc':
        // Generate OTC reference
        await Request.update({
          status: 'payment_pending',
          paymentMethod: 'otc',
          paymentReference: paymentReference,
          paymentAmount: paymentAmount
        }, { where: { id } });

        req.flash('success_msg', `Payment reference generated: ${paymentReference}. Please pay at any authorized payment center.`);
        return res.redirect(`/request/${id}`);

      case 'bank':
        // Bank transfer instructions
        await Request.update({
          status: 'payment_pending',
          paymentMethod: 'bank',
          paymentReference: paymentReference,
          paymentAmount: paymentAmount
        }, { where: { id } });

        req.flash('success_msg', `Bank transfer reference: ${paymentReference}. Please transfer the amount and send proof of payment.`);
        return res.redirect(`/request/${id}`);

      default:
        req.flash('error_msg', 'Invalid payment method selected');
        return res.redirect(`/request/${id}/pay`);
    }

  } catch (err) {
    console.error('Error processing payment:', err);
    req.flash('error_msg', 'Failed to process payment');
    return res.redirect(`/request/${id}/pay`);
  }
};

// Payments and Receipts Page Controller
export const paymentsReceiptsPage = async (req, res) => {
  // Require authentication
  if (!req.session.user) return res.redirect('/login');

  try {
    // Get all requests for the current user with payment information
    const requests = await Request.findAll({
      where: { email: req.session.user.email },
      order: [['updatedAt', 'DESC']]
    });

    // Filter requests that have payment information or are ready for payment
    const paymentsData = requests.filter(req =>
      req.status === 'approved' ||
      req.status === 'payment_pending' ||
      req.status === 'paid' ||
      req.paymentAmount
    );

    // Calculate summary statistics
    const summary = {
      totalPaid: paymentsData
        .filter(r => paymentComplete(r) && r.paymentAmount)
        .reduce((sum, r) => sum + parseFloat(r.paymentAmount || 0), 0)
        .toFixed(2),
      totalPending: paymentsData
        .filter(r => (r.status === 'approved' || r.status === 'payment_pending') && r.paymentAmount)
        .reduce((sum, r) => sum + parseFloat(r.paymentAmount || 0), 0)
        .toFixed(2),
      totalTransactions: paymentsData.length
    };

    // Format payments data for display
    const payments = paymentsData.map(req => {
      const data = req.toJSON();
      data.updatedAt = new Date(data.updatedAt).toLocaleDateString();
      return data;
    });

    res.render('paymentsReceipts', {
      title: 'Payments & Receipts',
      user: req.session.user,
      payments: payments,
      summary: summary
    });

  } catch (err) {
    console.error('Error loading payments and receipts:', err);
    req.flash('error_msg', 'Failed to load payments and receipts');
    res.redirect('/browse');
  }
};
// Download Receipt Controller
export const downloadReceipt = async (req, res) => {
  const { id } = req.params;

  // Require authentication
  if (!req.session.user) return res.redirect('/login');

  try {
    const request = await Request.findByPk(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // Security check
    const isAdmin = can(req.session.user.role, 'requests');
    const isOwner = request.email === req.session.user.email;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    // Check if request is paid
    if (!paymentComplete(request)) {
      return res.status(400).json({ success: false, message: 'Receipt not available. Payment not completed.' });
    }

    // Generate receipt HTML
    const receiptHtml = generateReceipt(request);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${id}.html"`);
    res.send(receiptHtml);

  } catch (err) {
    console.error('Error downloading receipt:', err);
    res.status(500).json({ success: false, message: 'Failed to download receipt' });
  }
};

// Payment Details Controller
export const getPaymentDetails = async (req, res) => {
  const { id } = req.params;

  // Require authentication
  if (!req.session.user) return res.redirect('/login');

  try {
    const request = await Request.findByPk(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // Security check
    const isAdmin = can(req.session.user.role, 'requests');
    const isOwner = request.email === req.session.user.email;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    res.json({
      success: true,
      payment: {
        id: request.id,
        documentType: request.documentType,
        paymentAmount: request.paymentAmount,
        paymentMethod: request.paymentMethod,
        paymentReference: request.paymentReference,
        status: request.status
      }
    });

  } catch (err) {
    console.error('Error getting payment details:', err);
    res.status(500).json({ success: false, message: 'Failed to get payment details' });
  }
};

// Helper function to generate receipt
function safeDocumentValues(request) {
  const data = request.toJSON ? request.toJSON() : request;
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])) : value]));
}
function generateReceipt(request) {
  request = safeDocumentValues(request);
  const today = new Date().toLocaleDateString();

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Receipt</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
        .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
        .receipt { border: 1px solid #ddd; padding: 20px; margin: 20px 0; }
        .row { display: flex; justify-content: space-between; margin: 10px 0; }
        .total { font-size: 18px; font-weight: bold; border-top: 2px solid #2563eb; padding-top: 10px; margin-top: 20px; }
        .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
        @media print { body { margin: 0; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">SmartCivi</div>
        <div>Payment Record</div>
        <div>Civil Registry Management System</div>
      </div>

      <div class="receipt">
        <h3>Payment Receipt</h3>

        <div class="row">
          <span><strong>Receipt No:</strong></span>
          <span>${request.paymentReference}</span>
        </div>

        <div class="row">
          <span><strong>Request ID:</strong></span>
          <span>#${request.id}</span>
        </div>

        <div class="row">
          <span><strong>Customer Name:</strong></span>
          <span>${request.fullName}</span>
        </div>

        <div class="row">
          <span><strong>Email:</strong></span>
          <span>${request.email}</span>
        </div>

        <div class="row">
          <span><strong>Document Type:</strong></span>
          <span>${request.documentType.charAt(0).toUpperCase() + request.documentType.slice(1)} Certificate</span>
        </div>

        <div class="row">
          <span><strong>Payment Method:</strong></span>
          <span>${request.paymentMethod ? request.paymentMethod.toUpperCase() : 'Online'}</span>
        </div>

        <div class="row">
          <span><strong>Payment Date:</strong></span>
          <span>${new Date(request.updatedAt).toLocaleDateString()}</span>
        </div>

        <div class="row total">
          <span><strong>Amount Paid:</strong></span>
          <span><strong>₱${request.paymentAmount}</strong></span>
        </div>

        <div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 5px;">
          <p><strong>Status:</strong> Payment Completed</p>
          <p><strong>Note:</strong> Online payments in this application are simulated. This generated record does not verify that funds were transferred. Confirm payment with the LGU office.</p>
        </div>
      </div>

      <div class="footer">
        <p>Generated on ${today}</p>
        <p>SmartCivi | Payment Record</p>
        <p>For inquiries, please contact our office during business hours.</p>
      </div>
    </body>
    </html>
  `;
}
export const attachmentsPage = async (req, res) => {
  const { id } = req.params;

  // Require authentication
  if (!req.session.user) return res.redirect('/login');

  try {
    const request = await Request.findByPk(id);
    if (!request) {
      return res.render('attachments', {
        title: 'Attachments',
        request: null,
        requestId: id
      });
    }

    // Security check: Users can only view attachments for their own requests (unless admin)
    const isAdmin = can(req.session.user.role, 'requests');
    const isOwner = request.email === req.session.user.email;

    if (!isAdmin && !isOwner) {
      return res.render('attachments', {
        title: 'Attachments',
        request: null,
        requestId: id
      });
    }

    res.render('attachments', {
      title: 'Attachments',
      request: request.toJSON(),
      requestId: id,
      user: req.session.user
    });
  } catch (err) {
    console.error('Error loading attachments page:', err);
    res.status(500).send('Failed to load attachments page');
  }
};

export const downloadDocument = async (req, res) => {
  const { id } = req.params;

  // Require authentication
  if (!req.session.user) return res.redirect('/login');

  try {
    const request = await Request.findByPk(id);
    if (!request) {
      req.flash('error_msg', 'Request not found');
      return res.redirect('/status');
    }

    // Security check
    const isAdmin = can(req.session.user.role, 'requests');
    const isOwner = request.email === req.session.user.email;

    if (!isAdmin && !isOwner) {
      req.flash('error_msg', 'Unauthorized access');
      return res.redirect('/status');
    }

    // Check if request is paid (only paid requests can download documents)
    if (!paymentComplete(request) || !['paid', 'completed', 'released'].includes(request.status)) {
      req.flash('error_msg', 'Document not ready for download. Payment required.');
      return res.redirect(`/request/${id}`);
    }

    // Generate certificate HTML
    const certificateHtml = generateCertificate(request);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${request.documentType}-certificate-${id}.html"`);
    res.send(certificateHtml);

  } catch (err) {
    console.error('Error downloading document:', err);
    req.flash('error_msg', 'Failed to download document');
    return res.redirect(`/request/${id}`);
  }
};

// Helper function to generate certificate
function generateCertificate(request) {
  request = safeDocumentValues(request);
  const today = new Date().toLocaleDateString();

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${request.documentType.toUpperCase()} Certificate</title>
      <style>
        body { font-family: 'Times New Roman', serif; margin: 40px; line-height: 1.6; }
        .header { text-align: center; margin-bottom: 40px; }
        .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
        .title { font-size: 20px; font-weight: bold; margin: 20px 0; }
        .certificate { border: 3px solid #2563eb; padding: 30px; margin: 20px 0; }
        .content { margin: 20px 0; }
        .footer { margin-top: 40px; text-align: right; }
        .signature { margin-top: 60px; }
        @media print { body { margin: 0; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">SmartCivi</div>
        <div>Civil Registry Management System</div>
        <div>Republic of the Philippines</div>
      </div>

      <div class="certificate">
        <div class="title" style="text-align: center;">
          CERTIFICATE OF ${request.documentType.toUpperCase()}
        </div>

        <div class="content">
          <p><strong>Certificate No:</strong> ${request.paymentReference || `CERT-${request.id}`}</p>
          <p><strong>Full Name:</strong> ${request.fullName}</p>
          <p><strong>Document Type:</strong> ${request.documentType.charAt(0).toUpperCase() + request.documentType.slice(1)} Certificate</p>
          <p><strong>Purpose:</strong> ${request.purpose}</p>
          <p><strong>Request Date:</strong> ${new Date(request.createdAt).toLocaleDateString()}</p>
          <p><strong>Issue Date:</strong> ${today}</p>
          <p><strong>Payment Reference:</strong> ${request.paymentReference}</p>
          <p><strong>Amount Paid:</strong> ₱${request.paymentAmount}</p>
        </div>

        <div style="margin-top: 40px;">
          <p>Preview generated from request details. Official issuance requires registry verification and authorized office release.</p>
        </div>

        <div class="signature">
          <div style="float: right; text-align: center;">
            <div style="border-top: 1px solid #000; width: 200px; margin-bottom: 5px;"></div>
            <div><strong>Civil Registrar</strong></div>
            <div>SmartCivi System</div>
          </div>
          <div style="clear: both;"></div>
        </div>
      </div>

      <div class="footer">
        <small>Generated on ${today} | SmartCivi Civil Registry System</small>
      </div>
    </body>
    </html>
  `;
}
export const adminRecordsPage = (req, res) => {
  res.render('adminRecords', { title: 'Records Admin' });
};

export const analyticsPage = (req, res) => {
  res.render('analytics', { title: 'Reports & Analytics' });
};

export const notificationsPage = (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('notifications', { title: 'Notifications' });
};

export const helpPage = (req, res) => {
  res.render('help', { title: 'Help & Support' });
};

export const auditLogPage = (req, res) => {
  res.render('audit', { title: 'Audit Log' });
};

export const exportPrintPage = async (req, res) => {
  const { id } = req.params;
  res.render('exportPrint', { title: 'Print / Export', requestId: id });
};

export const apiDocsPage = (req, res) => {
  res.render('api', { title: 'API' });
};

// Local offices page
export const officesPage = (req, res) => {
  const offices = [
    {
      name: 'PSA Provincial Office - Oriental Mindoro (Calapan)',
      address: 'Calapan City, Oriental Mindoro',
      phone: ''
    },
    {
      name: 'PSA Satellite Office - Pinamalayan',
      address: 'Pinamalayan, Oriental Mindoro',
      phone: ''
    },
    {
      name: 'PSA Satellite Office - Gloria',
      address: 'MIMAROPA region (check local listing)',
      phone: ''
    }
  ];

  res.render('offices', {
    title: 'Local Offices',
    offices: offices
  });
};

// Appointment Management Controllers
export const myAppointmentsPage = async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  try {
    // Get all requests for the current user that are appointments
    const appointments = await Request.findAll({
      where: {
        email: req.session.user.email
      },
      order: [['createdAt', 'DESC']]
    });

    // Format appointments data for display
    const appointmentsData = appointments.map(appointment => {
      const data = appointment.toJSON();
      data.createdAt = new Date(data.createdAt).toLocaleDateString();
      data.updatedAt = new Date(data.updatedAt).toLocaleDateString();

      // Add status styling
      data.statusClass = {
        'pending': 'bg-yellow-100 text-yellow-800',
        'approved': 'bg-green-100 text-green-800',
        'processing': 'bg-blue-100 text-blue-800',
        'paid': 'bg-purple-100 text-purple-800',
        'rejected': 'bg-red-100 text-red-800'
      }[data.status] || 'bg-gray-100 text-gray-800';

      return data;
    });

    res.render('myAppointments', {
      title: 'My Appointments',
      user: req.session.user,
      appointments: appointmentsData
    });

  } catch (err) {
    console.error('Error loading appointments:', err);
    req.flash('error_msg', 'Failed to load appointments');
    res.redirect('/browse');
  }
};

export const adminAppointmentsPage = async (req, res) => {
  try {
    // Get all requests with appointment data
    const appointments = await Request.findAll({
      order: [['createdAt', 'DESC']]
    });

    // Format appointments data for display
    const appointmentsData = appointments.map(appointment => {
      const data = appointment.toJSON();
      data.createdAt = new Date(data.createdAt).toLocaleDateString();
      data.updatedAt = new Date(data.updatedAt).toLocaleDateString();

      // Add status styling
      data.statusClass = {
        'pending': 'bg-yellow-100 text-yellow-800',
        'approved': 'bg-green-100 text-green-800',
        'processing': 'bg-blue-100 text-blue-800',
        'paid': 'bg-purple-100 text-purple-800',
        'rejected': 'bg-red-100 text-red-800'
      }[data.status] || 'bg-gray-100 text-gray-800';

      return data;
    });

    res.render('adminAppointments', {
      title: 'Manage Appointments',
      appointments: appointmentsData
    });

  } catch (err) {
    console.error('Error loading admin appointments:', err);
    req.flash('error_msg', 'Failed to load appointments');
    res.redirect('/admin');
  }
};

export const updateAppointmentStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    await Request.update({ status }, { where: { id } });

    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.json({ success: true, id, status });
    }

    req.flash('success_msg', 'Appointment status updated successfully');
    res.redirect('/admin/appointments');
  } catch (err) {
    console.error('Error updating appointment status:', err);

    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.status(500).json({ success: false, error: err.message });
    }

    req.flash('error_msg', 'Failed to update appointment status');
    res.redirect('/admin/appointments');
  }
};

export const addAppointmentNotes = async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  try {
    await Request.update({ notes }, { where: { id } });
    res.json({ success: true, id, notes });
  } catch (err) {
    console.error('Error adding appointment notes:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const requestAppointmentReschedule = async (req, res) => {
  const { id } = req.params;
  const { rescheduleReason } = req.body;

  try {
    // Add reschedule request to the appointment
    await Request.update({
      rescheduleReason,
      rescheduleRequested: true
    }, { where: { id } });

    req.flash('success_msg', 'Reschedule request submitted successfully');
    res.redirect('/my-appointments');
  } catch (err) {
    console.error('Error requesting appointment reschedule:', err);
    req.flash('error_msg', 'Failed to submit reschedule request');
    res.redirect('/my-appointments');
  }
};

// Request Confirmation Page Controller
export const requestConfirmationPage = async (req, res) => {
  const { id } = req.params;

  // Require authentication
  if (!req.session.user) return res.redirect('/login');

  try {
    const request = await Request.findByPk(id);
    if (!request) {
      req.flash('error_msg', 'Request not found');
      return res.redirect('/browse');
    }

    // Security check: Users can only view their own request confirmations (unless admin)
    const isAdmin = can(req.session.user.role, 'requests');
    const isOwner = request.email === req.session.user.email;

    if (!isAdmin && !isOwner) {
      req.flash('error_msg', 'Unauthorized access');
      return res.redirect('/browse');
    }

    // Calculate estimated processing time and fees
    const processingInfo = {
      estimatedDays: '3-5 business days',
      fees: {
        'birth': 155.00,
        'marriage': 210.00,
        'death': 155.00
      }[request.documentType] || 155.00,
      nextSteps: [
        'Your request has been submitted and is now pending review',
        'You will receive an email notification when your request is approved',
        'Once approved, you can proceed to payment',
        'After payment, your document will be processed for release'
      ]
    };

    res.render('requestConfirmation', {
      title: 'Request Confirmation',
      request: request.toJSON(),
      user: req.session.user,
      processingInfo: processingInfo,
      confirmationDate: new Date().toLocaleDateString()
    });
  } catch (err) {
    console.error('Error loading request confirmation:', err);
    req.flash('error_msg', 'Failed to load confirmation page');
    res.redirect('/browse');
  }
};
