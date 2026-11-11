
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

import express from "express";
import {
  adminPage, adminPanelPage, homePage, requestPage, toolPage,
  adminRequestsPage,
  recordsPage,
  searchBirthRecord,
  searchMarriageRecord,
  searchDeathRecord,
  reportsPage,
  generateReport,
  usersPage,
  createOrUpdateUser,
  deleteUser,
  userActionsPage,
  statusPage,
  requestDash,
  createRequest,
  // new scaffolds
  profilePage,
  requestDetailsPage,
  myRequestsPage,
  adminRequestEditorPage,
  paymentsPage,
  processPayment,
  downloadDocument,
  myAppointmentsPage,
  adminAppointmentsPage,
  updateAppointmentStatus,
  addAppointmentNotes,
  requestAppointmentReschedule,
  officesPage,
  adminRecordsPage,
  analyticsPage,
  notificationsPage,
  helpPage,
  attachmentsPage,
  auditLogPage,
  exportPrintPage,
  apiDocsPage,
  // payments and receipts
  paymentsReceiptsPage,
  downloadReceipt,
  getPaymentDetails,
  // request confirmation
  requestConfirmationPage
} from "../controllers/homeController.js";
import { browsePage } from "../controllers/homeController.js";
import {
  loginPage, registerPage, forgotPasswordPage,
  dashboardPage, loginUser, registerUser, logoutUser
} from "../controllers/authController.js";
import { setupAdmin } from "../controllers/authController.js";
import { ensureAdmin } from "../middleware/auth.js";
import { updateRequestStatus, assignRequest, deleteRequestAdmin } from "../controllers/homeController.js";

const router = express.Router();
import { requireFeature, ownRequest } from '../middleware/platformSecurity.js';
router.use('/admin', (req, res, next) => {
  const feature = req.path.startsWith('/users') ? 'users' : req.path.startsWith('/requests') || req.path.startsWith('/appointments') ? 'requests' : req.path.startsWith('/reports') || req.path.startsWith('/analytics') ? 'reports' : 'operations';
  return requireFeature(feature)(req, res, next);
});
router.use(['/request/:id', '/payments/:id', '/receipts/:id', '/appointments/:id'], (req, res, next) => /^\d+$/.test(req.params.id) ? ownRequest(req, res, next) : next());
router.use('/records', (req, res, next) => req.session.user ? next() : res.redirect('/login'));
router.use('/reports', requireFeature('requests'));

// Home and main pages
router.get("/", homePage);
router.get("/admin", ensureAdmin, adminPage);
router.get("/admin/panel", ensureAdmin, adminPanelPage);
router.get("/browse", browsePage);
router.get("/request", requestPage);
router.get("/appoint", requestPage);
import { requestSubmitPage } from "../controllers/homeController.js";
router.get('/request/submit', requestSubmitPage);
router.post("/request", createRequest);
router.get("/tool", toolPage);
// Admin aliases and additional pages
router.get("/admin/tool", toolPage);
router.get("/admin/records", recordsPage);
router.get("/admin/reports", reportsPage);
// user landing aliases
router.get("/user", userActionsPage);
router.get("/landing", userActionsPage);

// Profile
router.get('/dashboard/profile', profilePage);

// Request details and attachments
router.get('/request/:id', requestDetailsPage);
router.get('/request/:id/confirmation', requestConfirmationPage);
router.get('/request/:id/attachments', attachmentsPage);
router.get('/request/:id/pay', paymentsPage);
router.post('/request/:id/process-payment', processPayment);
router.get('/request/:id/print', downloadDocument);

// My requests (user)
router.get('/dashboard/my-requests', myRequestsPage);

// Appointments
router.get('/my-appointments', myAppointmentsPage);
router.get('/admin/appointments', requireFeature('requests'), adminAppointmentsPage);
router.post('/admin/appointments/:id/status', requireFeature('requests'), updateAppointmentStatus);
router.post('/admin/appointments/:id/notes', requireFeature('requests'), addAppointmentNotes);
router.post('/appointments/:id/reschedule', requestAppointmentReschedule);

// Admin request editor and print/export
router.get('/admin/requests/:id', adminRequestEditorPage);
router.get('/admin/requests/:id/print', exportPrintPage);

// Admin records & analytics
router.get('/admin/records/new', adminRecordsPage);
router.get('/admin/analytics', analyticsPage);

// Notifications & help
router.get('/dashboard/notifications', notificationsPage);
router.get('/help', helpPage);

router.get("/offices", officesPage);

// Payments and Receipts
router.get('/payments', paymentsReceiptsPage);
router.get('/receipts/:id/download', downloadReceipt);
router.get('/payments/:id/details', getPaymentDetails);

// Audit & API
router.get('/admin/audit', auditLogPage);
router.get('/api', apiDocsPage);

// Auth routes
router.get("/login", loginPage);
router.post("/login", loginUser);
router.get("/register", registerPage);
router.post("/register", registerUser);
router.get("/forgot-password", forgotPasswordPage);
router.get("/dashboard", dashboardPage);
router.get("/dashboard/requests", requestDash);
router.get("/logout", logoutUser);

// New admin request page route
router.get("/admin/requests", requireFeature('requests'), adminRequestsPage);

// Admin request action routes
router.post('/admin/requests/:id/status', requireFeature('requests'), updateRequestStatus);
router.post('/admin/requests/:id/assign', requireFeature('requests'), assignRequest);
router.post('/admin/requests/:id/delete', requireFeature('requests'), deleteRequestAdmin);

// Admin users management
router.get('/admin/users', ensureAdmin, usersPage);
router.post('/admin/users', ensureAdmin, createOrUpdateUser);

router.get("/records", recordsPage);
router.post("/records/search/birth", searchBirthRecord);
router.post("/records/search/marriage", searchMarriageRecord);
router.post("/records/search/death", searchDeathRecord);

router.get("/reports", reportsPage);
router.get("/admin/reports", ensureAdmin, reportsPage);
router.post("/reports/generate", generateReport);

router.delete("/admin/users/:id", ensureAdmin, deleteUser);

// Development helper to create the development admin account
router.get('/setup-admin', setupAdmin);

router.get("/Landing", userActionsPage); // User landing page

router.get("/status", statusPage);





export default router;
