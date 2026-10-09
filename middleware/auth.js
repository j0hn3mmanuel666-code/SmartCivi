import { User, Role, Permission, RolePermission } from '../models/index.js';

export const isAuthenticated = (req, res, next) => {
  if (!req.session.userId) {
    req.flash('error_msg', 'Please log in first');
    return res.redirect('/login');
  }
  res.locals.userId = req.session.userId;
  res.locals.username = req.session.username;
  res.locals.role = req.session.role;
  res.locals.permissions = req.session.permissions || [];
  next();
};

export const hasPermission = (permissionName) => {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const permissions = req.session.permissions || [];
    if (!permissions.includes(permissionName)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }
    
    next();
  };
};

export const adminOnly = hasPermission('view_all_users');
