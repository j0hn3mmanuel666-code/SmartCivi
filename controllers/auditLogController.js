import { AuditLog, User, Profile } from '../models/index.js';
import { Op } from 'sequelize';

export const listAuditLogs = async (req, res) => {
  try {
    const { search = '', action = '', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = {};

    if (search) {
      whereClause = {
        [Op.or]: [
          { description: { [Op.like]: `%${search}%` } },
          { action: { [Op.like]: `%${search}%` } }
        ]
      };
    }

    if (action && action !== 'all') {
      whereClause.action = action;
    }

    const { count, rows } = await AuditLog.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'User',
          include: [{ model: Profile, as: 'Profile' }]
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const totalPages = Math.ceil(count / limit);

    res.render('audit-logs', {
      logs: rows,
      currentPage: parseInt(page),
      totalPages,
      search,
      selectedAction: action,
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error listing audit logs:', error);
    req.flash('error_msg', 'Error loading audit logs');
    res.redirect('/dashboard');
  }
};
