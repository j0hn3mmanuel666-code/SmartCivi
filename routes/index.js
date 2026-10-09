import express from 'express';
import * as authController from '../controllers/authController.js';
import * as residentController from '../controllers/residentController.js';
import * as reportController from '../controllers/reportController.js';
import * as residentActivityController from '../controllers/residentActivityController.js';
import * as barangayController from '../controllers/barangayController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = express.Router();

// Auth routes
router.get('/', (req, res) => res.redirect('/login'));
router.get('/login', authController.showLoginPage);
router.post('/login', authController.login);
router.get('/logout', isAuthenticated, authController.logout);

// Dashboard
router.get('/dashboard', isAuthenticated, authController.showDashboard);

// Resident management (RIMS)
router.get('/residents', isAuthenticated, residentController.listResidents);
router.get('/residents/add', isAuthenticated, residentController.showAddResidentPage);
router.post('/residents/add', isAuthenticated, residentController.addResident);
router.get('/residents/:id', isAuthenticated, residentController.showResident);
router.get('/residents/:id/edit', isAuthenticated, residentController.showEditResidentPage);
router.post('/residents/:id/edit', isAuthenticated, residentController.updateResident);
router.post('/residents/:id/archive', isAuthenticated, residentController.archiveResident);
router.post('/residents/:id/restore', isAuthenticated, residentController.restoreResident);
router.get('/residents/:id/print', isAuthenticated, residentController.printResident);

// Barangay routes
router.get('/barangays', isAuthenticated, barangayController.listBarangays);

// Reports
router.get('/reports/residents', isAuthenticated, reportController.residentReport);
router.get('/reports/residents/export', isAuthenticated, reportController.exportResidentsCSV);

// Resident activities
router.get('/resident-activities', isAuthenticated, residentActivityController.listResidentActivities);

// 404 handler
router.use((req, res) => {
  res.status(404).render('404', { url: req.originalUrl });
});

export default router;
