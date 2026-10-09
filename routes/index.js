import express from 'express';
import * as authController from '../controllers/authController.js';
import * as userController from '../controllers/userController.js';
import * as profileController from '../controllers/profileController.js';
import * as auditLogController from '../controllers/auditLogController.js';
import { isAuthenticated, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Auth routes
router.get('/', (req, res) => res.redirect('/login'));
router.get('/login', authController.loginPage);
router.post('/login', authController.loginUser);
router.get('/logout', isAuthenticated, authController.logoutUser);
router.get('/forgot-password', authController.forgotPasswordPage);

// Dashboard
router.get('/dashboard', isAuthenticated, authController.showDashboard);

// User profile (own)
router.get('/profile', isAuthenticated, profileController.showProfile);
router.get('/profile/edit', isAuthenticated, profileController.showEditProfilePage);
router.post('/profile/edit', isAuthenticated, profileController.updateProfile);
router.get('/profile/change-password', isAuthenticated, profileController.showChangePasswordPage);
router.post('/profile/change-password', isAuthenticated, profileController.changePassword);

// User management (admin only)
router.get('/users', isAuthenticated, adminOnly, userController.listUsers);
router.get('/users/add', isAuthenticated, adminOnly, userController.showAddUserPage);
router.post('/users/add', isAuthenticated, adminOnly, userController.createUser);
router.get('/users/:id', isAuthenticated, adminOnly, userController.showUser);
router.get('/users/:id/edit', isAuthenticated, adminOnly, userController.showEditUserPage);
router.post('/users/:id/edit', isAuthenticated, adminOnly, userController.updateUser);
router.get('/users/:id/assign-role', isAuthenticated, adminOnly, userController.showAssignRolePage);
router.post('/users/:id/assign-role', isAuthenticated, adminOnly, userController.assignRole);
router.post('/users/:id/activate', isAuthenticated, adminOnly, userController.activateUser);
router.post('/users/:id/deactivate', isAuthenticated, adminOnly, userController.deactivateUser);
router.post('/users/:id/reset-password', isAuthenticated, adminOnly, userController.resetPassword);

// Audit logs (admin only)
router.get('/audit-logs', isAuthenticated, adminOnly, auditLogController.listAuditLogs);

// 404 handler
router.use((req, res) => {
  res.status(404).render('404', { url: req.originalUrl });
});

export default router;
