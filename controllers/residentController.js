import { Resident, Barangay, ResidentActivity, User } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { Op } from 'sequelize';

/**
 * Generate unique resident ID with format: BSD-YYYY-NNNNN
 */
async function generateResidentId() {
  const year = new Date().getFullYear();
  const prefix = `BSD-${year}-`;

  // Find the highest sequence number for this year
  const lastResident = await Resident.findOne({
    where: {
      resident_id: {
        [Op.like]: `${prefix}%`
      }
    },
    order: [['resident_id', 'DESC']]
  });

  let sequence = 1;
  if (lastResident) {
    const lastSeq = parseInt(lastResident.resident_id.split('-')[2]);
    sequence = lastSeq + 1;
  }

  return prefix + String(sequence).padStart(5, '0');
}

export const listResidents = async (req, res) => {
  try {
    const { search = '', barangay = '', sex = '', status = 'active', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = {};

    // Search by name or resident_id
    if (search) {
      whereClause = {
        [Op.or]: [
          { first_name: { [Op.like]: `%${search}%` } },
          { middle_name: { [Op.like]: `%${search}%` } },
          { last_name: { [Op.like]: `%${search}%` } },
          { resident_id: { [Op.like]: `%${search}%` } }
        ]
      };
    }

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

    const { count, rows } = await Resident.findAndCountAll({
      where: whereClause,
      include: [{ model: Barangay, as: 'Barangay' }],
      distinct: true,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    const barangays = await Barangay.findAll();
    const totalPages = Math.ceil(count / limit);

    res.render('residents', {
      residents: rows,
      barangays,
      currentPage: parseInt(page),
      totalPages,
      search,
      selectedBarangay: barangay,
      selectedSex: sex,
      selectedStatus: status,
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error listing residents:', error);
    req.flash('error_msg', 'Error loading residents');
    res.redirect('/dashboard');
  }
};

export const showAddResidentPage = async (req, res) => {
  try {
    const barangays = await Barangay.findAll();
    res.render('residents-add', { barangays });
  } catch (error) {
    console.error('Error loading add resident page:', error);
    req.flash('error_msg', 'Error loading form');
    res.redirect('/residents');
  }
};

export const addResident = async (req, res) => {
  try {
    const { first_name, middle_name, last_name, birthdate, sex, civil_status, address, barangay_id, contact_number, email } = req.body;

    // Validation
    const errors = [];
    if (!first_name) errors.push('First name is required');
    if (!last_name) errors.push('Last name is required');
    if (!birthdate) errors.push('Birthdate is required');
    if (!sex) errors.push('Sex is required');
    if (!civil_status) errors.push('Civil status is required');
    if (!address) errors.push('Address is required');
    if (!barangay_id) errors.push('Barangay is required');

    if (errors.length > 0) {
      req.flash('error_msg', errors.join(', '));
      return res.redirect('/residents/add');
    }

    // Generate unique resident ID
    const resident_id = await generateResidentId();

    // Create resident
    const resident = await Resident.create({
      resident_id,
      first_name,
      middle_name: middle_name || '',
      last_name,
      birthdate,
      sex,
      civil_status,
      address,
      barangay_id: parseInt(barangay_id),
      contact_number: contact_number || '',
      email: email || '',
      status: 'active'
    });

    // Log audit
    await logAudit(req.session.userId, 'RESIDENT_CREATED', resident.id, `Resident created: ${first_name} ${last_name} (${resident_id})`, req.ip);

    // Create activity log
    await ResidentActivity.create({
      resident_id: resident.id,
      action: 'created',
      description: `Resident record created for ${first_name} ${last_name}`,
      user_id: req.session.userId
    });

    req.flash('success_msg', `Resident "${first_name} ${last_name}" created successfully with ID ${resident_id}`);
    res.redirect('/residents');
  } catch (error) {
    console.error('Error creating resident:', error);
    req.flash('error_msg', 'Error creating resident');
    res.redirect('/residents/add');
  }
};

export const showResident = async (req, res) => {
  try {
    const resident = await Resident.findByPk(req.params.id, {
      include: [{ model: Barangay, as: 'Barangay' }]
    });

    if (!resident) {
      req.flash('error_msg', 'Resident not found');
      return res.redirect('/residents');
    }

    const activities = await ResidentActivity.findAll({
      where: { resident_id: req.params.id },
      include: [{ model: User, as: 'User', attributes: ['id', 'username'] }],
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    res.render('residents-profile', { resident, activities });
  } catch (error) {
    console.error('Error showing resident:', error);
    req.flash('error_msg', 'Error loading resident');
    res.redirect('/residents');
  }
};

export const showEditResidentPage = async (req, res) => {
  try {
    const resident = await Resident.findByPk(req.params.id);

    if (!resident) {
      req.flash('error_msg', 'Resident not found');
      return res.redirect('/residents');
    }

    const barangays = await Barangay.findAll();
    res.render('residents-edit', { resident, barangays });
  } catch (error) {
    console.error('Error loading edit page:', error);
    req.flash('error_msg', 'Error loading form');
    res.redirect('/residents');
  }
};

export const updateResident = async (req, res) => {
  try {
    const { first_name, middle_name, last_name, birthdate, sex, civil_status, address, barangay_id, contact_number, email } = req.body;
    const residentId = req.params.id;

    const resident = await Resident.findByPk(residentId);

    if (!resident) {
      req.flash('error_msg', 'Resident not found');
      return res.redirect('/residents');
    }

    // Update resident
    resident.first_name = first_name;
    resident.middle_name = middle_name || '';
    resident.last_name = last_name;
    resident.birthdate = birthdate;
    resident.sex = sex;
    resident.civil_status = civil_status;
    resident.address = address;
    resident.barangay_id = parseInt(barangay_id);
    resident.contact_number = contact_number || '';
    resident.email = email || '';
    await resident.save();

    // Log audit
    await logAudit(req.session.userId, 'RESIDENT_UPDATED', resident.id, `Resident updated: ${first_name} ${last_name}`, req.ip);

    // Create activity log
    await ResidentActivity.create({
      resident_id: resident.id,
      action: 'updated',
      description: `Resident information updated for ${first_name} ${last_name}`,
      user_id: req.session.userId
    });

    req.flash('success_msg', 'Resident updated successfully');
    res.redirect(`/residents/${residentId}`);
  } catch (error) {
    console.error('Error updating resident:', error);
    req.flash('error_msg', 'Error updating resident');
    res.redirect(`/residents/${req.params.id}/edit`);
  }
};

export const archiveResident = async (req, res) => {
  try {
    const resident = await Resident.findByPk(req.params.id);

    if (!resident) {
      return res.status(404).json({ success: false, error: 'Resident not found' });
    }

    resident.status = 'archived';
    await resident.save();

    // Log audit
    await logAudit(req.session.userId, 'RESIDENT_ARCHIVED', resident.id, `Resident archived: ${resident.first_name} ${resident.last_name}`, req.ip);

    // Create activity log
    await ResidentActivity.create({
      resident_id: resident.id,
      action: 'archived',
      description: `Resident record archived for ${resident.first_name} ${resident.last_name}`,
      user_id: req.session.userId
    });

    req.flash('success_msg', 'Resident archived successfully');
    res.redirect('/residents');
  } catch (error) {
    console.error('Error archiving resident:', error);
    req.flash('error_msg', 'Error archiving resident');
    res.redirect(`/residents/${req.params.id}`);
  }
};

export const restoreResident = async (req, res) => {
  try {
    const resident = await Resident.findByPk(req.params.id);

    if (!resident) {
      return res.status(404).json({ success: false, error: 'Resident not found' });
    }

    resident.status = 'active';
    await resident.save();

    // Log audit
    await logAudit(req.session.userId, 'RESIDENT_RESTORED', resident.id, `Resident restored: ${resident.first_name} ${resident.last_name}`, req.ip);

    // Create activity log
    await ResidentActivity.create({
      resident_id: resident.id,
      action: 'restored',
      description: `Resident record restored for ${resident.first_name} ${resident.last_name}`,
      user_id: req.session.userId
    });

    req.flash('success_msg', 'Resident restored successfully');
    res.redirect('/residents');
  } catch (error) {
    console.error('Error restoring resident:', error);
    req.flash('error_msg', 'Error restoring resident');
    res.redirect(`/residents/${req.params.id}`);
  }
};

export const printResident = async (req, res) => {
  try {
    const resident = await Resident.findByPk(req.params.id, {
      include: [{ model: Barangay, as: 'Barangay' }]
    });

    if (!resident) {
      return res.status(404).render('404', { url: req.originalUrl });
    }

    res.render('residents-print', { resident, layout: false });
  } catch (error) {
    console.error('Error loading print view:', error);
    res.status(500).render('404', { url: req.originalUrl });
  }
};
