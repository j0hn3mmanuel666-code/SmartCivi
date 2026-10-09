import { StaffUser } from '../models/index.js';

export const isAuthenticated = (req, res, next) => {
  if (!req.session.userId) {
    req.flash('error_msg', 'Please log in first');
    return res.redirect('/login');
  }
  res.locals.userId = req.session.userId;
  res.locals.username = req.session.username;
  next();
};

export const loadUser = async (req, res, next) => {
  if (req.session.userId) {
    try {
      const user = await StaffUser.findByPk(req.session.userId);
      req.user = user;
    } catch (error) {
      console.error('Error loading user:', error);
    }
  }
  next();
};

