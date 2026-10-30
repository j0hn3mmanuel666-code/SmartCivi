import express from "express";
import {
  loginPage,
  forgotPasswordPage,
  loginUser,
  logoutUser,
} from "../controllers/authController.js";
import { homePage, dashboardPage, reportPage, activityPage } from "../controllers/homeController.js";
import {
  newRequestPage,
  createRequest,
  requestSubmittedPage,
  trackRequestPage,
  trackRequest,
  resubmitTrackedRequestController,
  requestDetailPage,
  updateRequest,
  downloadResult,
} from "../controllers/requestController.js";
import {
  adminPage,
  createUser,
  updateUser,
  createCategory,
  updateCategory,
  readNotification,
  exportReport,
} from "../controllers/adminController.js";
import { requireAdmin, requireAuth, requireStaff, verifyCsrf } from "../middleware/auth.js";
import { upload, validateUploadedFile } from "../middleware/upload.js";

const router = express.Router();

router.get("/", homePage);
router.get("/login", loginPage);
router.post("/login", verifyCsrf, loginUser);
router.get("/forgot-password", forgotPasswordPage);
router.post("/logout", requireAuth, verifyCsrf, logoutUser);

router.get("/dashboard", requireStaff, dashboardPage);
router.get("/requests/new", newRequestPage);
router.post("/requests", verifyCsrf, createRequest);
router.get("/requests/submitted", requestSubmittedPage);
router.get("/track", trackRequestPage);
router.post("/track", verifyCsrf, trackRequest);
router.post("/track/corrections", verifyCsrf, resubmitTrackedRequestController);
router.get("/requests/:id", requireStaff, requestDetailPage);
router.post(
  "/requests/:id/status",
  requireStaff,
  upload.single("releaseFile"),
  validateUploadedFile,
  verifyCsrf,
  updateRequest,
);
router.get("/requests/:id/result", requireStaff, downloadResult);

router.get("/activity", requireStaff, activityPage);
router.post("/notifications/:id/read", requireStaff, verifyCsrf, readNotification);
router.get("/reports", requireStaff, reportPage);
router.get("/reports.csv", requireStaff, exportReport);
router.get("/admin", requireAdmin, adminPage);
router.post("/admin/users", requireAdmin, verifyCsrf, createUser);
router.post("/admin/users/:id", requireAdmin, verifyCsrf, updateUser);
router.post("/admin/categories", requireAdmin, verifyCsrf, createCategory);
router.post("/admin/categories/:id", requireAdmin, verifyCsrf, updateCategory);

export default router;
