import { Resident, Barangay } from '../models/index.js';
import { Op } from 'sequelize';

export const residentReport = async (req, res) => {
  try {
    const { barangay = '', sex = '', status = 'active' } = req.query;

    let whereClause = {};

    // Filter by barangay
    if (barangay && barangay !== 'all') {
      whereClause.barangay_id = parseInt(barangay);
    }

    // Filter by sex
    if (sex && sex !== 'all') {
      whereClause.sex = sex;
    }

    // Filter by status
    if (status && status !== 'all') {
      whereClause.status = status;
    }

    const residents = await Resident.findAll({
      where: whereClause,
      include: [{ model: Barangay, as: 'Barangay' }],
      order: [['last_name', 'ASC']]
    });

    const barangays = await Barangay.findAll();

    // Calculate statistics
    const totalResidents = residents.length;
    const maleCount = residents.filter(r => r.sex === 'Male').length;
    const femaleCount = residents.filter(r => r.sex === 'Female').length;

    res.render('reports-residents', {
      residents,
      barangays,
      selectedBarangay: barangay,
      selectedSex: sex,
      selectedStatus: status,
      totalResidents,
      maleCount,
      femaleCount
    });
  } catch (error) {
    console.error('Error loading resident report:', error);
    req.flash('error_msg', 'Error loading report');
    res.redirect('/dashboard');
  }
};

export const exportResidentsCSV = async (req, res) => {
  try {
    const { barangay = '', sex = '', status = 'active' } = req.query;

    let whereClause = {};

    // Filter by barangay
    if (barangay && barangay !== 'all') {
      whereClause.barangay_id = parseInt(barangay);
    }

    // Filter by sex
    if (sex && sex !== 'all') {
      whereClause.sex = sex;
    }

    // Filter by status
    if (status && status !== 'all') {
      whereClause.status = status;
    }

    const residents = await Resident.findAll({
      where: whereClause,
      include: [{ model: Barangay, as: 'Barangay', attributes: ['name'] }],
      order: [['last_name', 'ASC']]
    });

    // Build CSV content
    const headers = ['Resident ID', 'First Name', 'Middle Name', 'Last Name', 'Birthdate', 'Sex', 'Civil Status', 'Address', 'Barangay', 'Contact Number', 'Email', 'Status', 'Created At'];
    const csvContent = [headers.join(',')];

    residents.forEach(resident => {
      const row = [
        resident.resident_id,
        resident.first_name,
        resident.middle_name || '',
        resident.last_name,
        resident.birthdate ? resident.birthdate.toISOString().split('T')[0] : '',
        resident.sex,
        resident.civil_status,
        resident.address.replace(/,/g, ';'), // Escape commas in address
        resident.Barangay ? resident.Barangay.name : '',
        resident.contact_number || '',
        resident.email || '',
        resident.status,
        resident.createdAt ? resident.createdAt.toISOString() : ''
      ];
      csvContent.push(row.map(cell => `"${cell}"`).join(','));
    });

    // Set response headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="residents-report.csv"');

    // Send CSV
    res.send(csvContent.join('\n'));
  } catch (error) {
    console.error('Error exporting residents CSV:', error);
    req.flash('error_msg', 'Error exporting report');
    res.redirect('/reports/residents');
  }
};
