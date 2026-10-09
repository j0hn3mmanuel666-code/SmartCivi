import { ResidentActivity, Resident, User } from '../models/index.js';

export const listResidentActivities = async (req, res) => {
  try {
    const { resident_id = '', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = {};

    // Filter by resident if id in query
    if (resident_id) {
      whereClause.resident_id = parseInt(resident_id);
    }

    const { count, rows } = await ResidentActivity.findAndCountAll({
      where: whereClause,
      include: [
        { model: Resident, as: 'Resident', attributes: ['id', 'resident_id', 'first_name', 'last_name'] },
        { model: User, as: 'User', attributes: ['id', 'username'] }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(count / limit);

    res.render('resident-activities', {
      activities: rows,
      currentPage: parseInt(page),
      totalPages,
      selectedResidentId: resident_id,
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error listing resident activities:', error);
    req.flash('error_msg', 'Error loading activities');
    res.redirect('/dashboard');
  }
};
