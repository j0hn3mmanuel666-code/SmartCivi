import { DocumentCategory } from "../models/documentModel.js";
import bcrypt from "bcrypt";
import { User, sequelize } from "../models/userModel.js";
import { asyncHandler, HttpError } from "../middleware/http.js";
import { getDashboardData, getReportData, markNotificationRead } from "../services/requestService.js";
import { getWorkspacePageData } from "../services/workspacePage.js";

const pageTitle = "DocuTrack: Civil Document Processing and Tracking System";
const allowedRoles = ["staff", "admin"];

export const adminPage = asyncHandler(async (req, res) => {
  const dashboardData = await getDashboardData(req.user);
  const data = await getWorkspacePageData(req.user, "admin", dashboardData);
  res.render("admin", {
    ...data,
    title: `Administration | ${pageTitle}`,
    users: data.users.map((user) => ({
      ...user,
      role: user.role === "visitors" ? "applicant" : user.role,
      isApplicant: user.role === "applicant" || user.role === "visitors",
      isStaff: user.role === "staff",
      isAdmin: user.role === "admin",
      isActive: user.accountStatus === "active",
      createdDate: new Date(user.createdAt).toLocaleDateString(),
    })),
    categories: data.categoryManagement,
  });
});

export const updateUser = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  const role = String(req.body.role || "");
  const accountStatus = String(req.body.accountStatus || "");
  if (!Number.isInteger(userId) || userId < 1) throw new HttpError(400, "Invalid user account.");
  if (!allowedRoles.includes(role) || !["active", "suspended"].includes(accountStatus)) {
    throw new HttpError(400, "Choose a valid role and account status.");
  }
  if (userId === req.user.id && (role !== "admin" || accountStatus !== "active")) {
    throw new HttpError(400, "You cannot remove your own administrator access or suspend your own account.");
  }

  const transaction = await sequelize.transaction();
  try {
    const activeAdmins = await User.findAll({
      where: { role: "admin", accountStatus: "active" },
      attributes: ["id"],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const target = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!target) throw new HttpError(404, "User account not found.");
    if (
      target.role === "admin" &&
      target.accountStatus === "active" &&
      activeAdmins.length <= 1 &&
      (role !== "admin" || accountStatus !== "active")
    ) {
      throw new HttpError(400, "The last active administrator cannot be demoted or suspended.");
    }

    target.role = role;
    target.accountStatus = accountStatus;
    await target.save({ transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  req.flash("success_msg", "User access settings were saved.");
  res.redirect("/admin");
});

export const createUser = asyncHandler(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const role = String(req.body.role || "");
  if (name.length < 2 || name.length > 120) throw new HttpError(400, "Enter a staff name between 2 and 120 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) throw new HttpError(400, "Enter a valid staff email address.");
  if (password.length < 8 || password.length > 72) throw new HttpError(400, "The temporary password must be between 8 and 72 characters.");
  if (!["staff", "admin"].includes(role)) throw new HttpError(400, "Choose a staff or administrator role.");
  if (await User.unscoped().findOne({ where: { email } })) throw new HttpError(409, "An account with that email address already exists.");

  await User.create({
    name,
    email,
    password: await bcrypt.hash(password, 12),
    role,
    accountStatus: "active",
  });
  req.flash("success_msg", "Staff account created. Share the temporary password with the user securely.");
  res.redirect("/admin");
});

export const createCategory = asyncHandler(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const description = String(req.body.description || "").trim();
  const requirements = String(req.body.requirements || "").trim();
  if (name.length < 2 || name.length > 100) throw new HttpError(400, "Category name must be between 2 and 100 characters.");
  if (description.length > 500 || requirements.length > 5000) throw new HttpError(400, "Category details exceed the allowed length.");
  if (await DocumentCategory.findOne({ where: { name } })) throw new HttpError(409, "That document category already exists.");
  await DocumentCategory.create({ name, description, requirements });
  req.flash("success_msg", "Document category created.");
  res.redirect("/admin");
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await DocumentCategory.findByPk(req.params.id);
  if (!category) throw new HttpError(404, "Document category not found.");
  const active = req.body.active === "true";
  category.active = active;
  await category.save();
  req.flash("success_msg", `${category.name} ${active ? "enabled" : "archived"}.`);
  res.redirect("/admin");
});

export const readNotification = asyncHandler(async (req, res) => {
  await markNotificationRead(req.params.id, req.user.id);
  res.redirect(req.get("referer")?.startsWith(`${req.protocol}://${req.get("host")}`) ? req.get("referer") : "/dashboard");
});

export const exportReport = asyncHandler(async (_req, res) => {
  const report = await getReportData();
  const rows = [["Metric", "Name", "Count"]];
  Object.entries(report.byStatus).forEach(([name, count]) => rows.push(["Status", name, String(count)]));
  Object.entries(report.byCategory).forEach(([name, count]) => rows.push(["Document type", name, String(count)]));
  Object.entries(report.monthly).sort(([a], [b]) => a.localeCompare(b))
    .forEach(([name, count]) => rows.push(["Submission month", name, String(count)]));

  const csvCell = (value) => {
    const text = String(value);
    const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  };
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="docutrack-report.csv"');
  res.send(`\uFEFF${csv}`);
});
