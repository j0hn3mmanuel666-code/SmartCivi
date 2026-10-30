import { ResidentActivity, Resident, StaffUser } from '../models/index.js';
import { Op } from 'sequelize';

export const listResidentActivities = async (req, res) => {
  try {
    const { resident_id = '', search = '', action = '', date_range = '', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = {};

    // Filter by resident ID
    if (resident_id) {
      whereClause.resident_id = parseInt(resident_id);
    }

    // Filter by action
    if (action) {
      whereClause.action = action;
    }

    // Filter by date range
    if (date_range) {
      const now = new Date();
      if (date_range === 'today') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        whereClause.createdAt = { [Op.gte]: startOfDay };
      } else if (date_range === 'week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - 7);
        whereClause.createdAt = { [Op.gte]: startOfWeek };
      } else if (date_range === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        whereClause.createdAt = { [Op.gte]: startOfMonth };
      }
    }

    let residentInclude = {
      model: Resident,
      as: 'Resident',
      attributes: ['id', 'resident_id', 'first_name', 'last_name']
    };

    if (search) {
      residentInclude.where = {
        [Op.or]: [
          { first_name: { [Op.like]: `%${search}%` } },
          { last_name: { [Op.like]: `%${search}%` } },
          { resident_id: { [Op.like]: `%${search}%` } }
        ]
      };
    }

    const { count, rows } = await ResidentActivity.findAndCountAll({
      where: whereClause,
      include: [
        residentInclude,
        { model: StaffUser, as: 'staff', attributes: ['id', 'username'] }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    // Compute activity summary
    const totalActivities = await ResidentActivity.count();
    const createdCount = await ResidentActivity.count({ where: { action: { [Op.in]: ['created', 'CREATED'] } } });
    const updatedCount = await ResidentActivity.count({ where: { action: { [Op.in]: ['updated', 'UPDATED'] } } });
    const archivedCount = await ResidentActivity.count({ where: { action: { [Op.in]: ['archived', 'ARCHIVED'] } } });

    const totalPages = Math.ceil(count / limit) || 1;

    res.render('resident-activities', {
      activities: rows,
      currentPage: parseInt(page),
      totalPages,
      search,
      selectedAction: action,
      selectedDateRange: date_range,
      selectedResidentId: resident_id,
      limit: parseInt(limit),
      totalActivities,
      createdCount,
      updatedCount,
      archivedCount
    });
  } catch (error) {
    console.error('Error listing resident activities:', error);
    req.flash('error_msg', 'Error loading activities');
    res.redirect('/dashboard');
  }
};
