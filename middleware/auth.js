import fs from "fs";
import { randomBytes, timingSafeEqual } from "crypto";
import { User } from "../models/userModel.js";
import { ensureDatabase } from "../services/database.js";
import { asyncHandler, HttpError } from "./http.js";

export const attachUser = asyncHandler(async (req, res, next) => {
  if (req.session.userId) {
    await ensureDatabase();
    const user = await User.findByPk(req.session.userId);
    if (!user || user.accountStatus !== "active" || !["staff", "admin"].includes(user.role)) {
      req.session.userId = null;
    } else {
      req.user = user;
      res.locals.currentUser = user;
    }
  }

  if (req.session.csrfToken) {
    res.locals.csrfToken = req.session.csrfToken;
  } else {
    req.session.csrfToken = randomBytes(32).toString("hex");
    res.locals.csrfToken = req.session.csrfToken;
  }

  next();
});

export const requireAuth = (req, res, next) => {
  if (!req.user) return res.redirect("/login");
  next();
};

export const requireStaff = (req, res, next) => {
  if (!req.user) return res.redirect("/login");
  if (!["staff", "admin"].includes(req.user.role)) return next(new HttpError(403, "Staff access is required."));
  next();
};

export const requireAdmin = (req, res, next) => {
  if (!req.user) return res.redirect("/login");
  if (req.user.role !== "admin") return next(new HttpError(403, "Administrator access is required."));
  next();
};

export const verifyCsrf = (req, res, next) => {
  const reject = async (error) => {
    try {
      if (req.file?.path) await fs.promises.unlink(req.file.path);
      next(error);
    } catch (cleanupError) {
      next(cleanupError);
    }
  };
  const expected = req.session.csrfToken;
  const provided = req.body?._csrf;
  if (typeof expected !== "string" || typeof provided !== "string") {
    return reject(new HttpError(403, "Your form session expired. Reload the page and try again."));
  }
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    return reject(new HttpError(403, "Your form session expired. Reload the page and try again."));
  }
  next();
};
