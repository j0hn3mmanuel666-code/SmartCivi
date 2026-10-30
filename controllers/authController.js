import bcrypt from "bcrypt";
import { User } from "../models/userModel.js";
import { ensureDatabase } from "../services/database.js";
import { asyncHandler, HttpError } from "../middleware/http.js";

const pageTitle = "DocuTrack: Civil Document Processing and Tracking System";

const regenerateSession = (req, user) => new Promise((resolve, reject) => {
  req.session.regenerate((error) => {
    if (error) return reject(error);
    req.session.userId = user.id;
    resolve();
  });
});

export const loginPage = (req, res) => {
  if (req.user) return res.redirect("/dashboard");
  res.render("login", { title: `Sign in | ${pageTitle}` });
};

export const forgotPasswordPage = (req, res) => res.render("forgotpassword", { title: `Password help | ${pageTitle}` });

export const loginUser = asyncHandler(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!email || !password) throw new HttpError(400, "Enter your email and password.");

  await ensureDatabase();
  const user = await User.unscoped().findOne({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    req.flash("error_msg", "Email or password is incorrect.");
    return res.redirect("/login");
  }
  if (user.accountStatus !== "active") {
    req.flash("error_msg", "This account is currently suspended. Contact a system administrator.");
    return res.redirect("/login");
  }
  if (!["staff", "admin"].includes(user.role)) {
    req.flash("error_msg", "Staff and administrators sign in here. Applicants can submit or track a request without an account.");
    return res.redirect("/login");
  }

  await regenerateSession(req, user);
  res.redirect("/dashboard");
});

export const logoutUser = (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("docutrack.sid");
    res.redirect("/login");
  });
};
