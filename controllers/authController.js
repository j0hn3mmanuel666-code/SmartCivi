
      /*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
    
import { normalizeUsername, identityWhere } from '../services/accountIdentity.js';
import bcrypt from "bcrypt";
import { User, sequelize } from "../models/userModel.js";
import "../models/Request.js";
import "../models/Attachment.js";
import "../models/Appointment.js";
import { initializePlatform } from '../models/Platform.js';
import { audit } from '../services/platform.js';
import { signIn } from '../services/accountAccess.js';
import { authConfiguration } from '../services/authProviders.js';
import { issueVerification } from './providerAuthController.js';
await initializePlatform();

// Development helper: create or update the dev admin user
export const setupAdmin = async (req, res) => {
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = 'Main Admin';

    if (!email || !password) {
      req.flash('error_msg', 'Admin setup is not configured');
      return res.redirect('/login');
    }

    const existingAdmin = await User.findOne({ where: { role: 'admin' } });
    if (existingAdmin) {
      req.flash('error_msg', 'An admin account already exists');
      return res.redirect('/login');
    }

    // Ensure DB has the `role` column; if not, add it to avoid SQL errors
    try {
      const qi = sequelize.getQueryInterface();
      const desc = await qi.describeTable('users');
      if (!desc.role) {
        console.log('Adding missing `role` column to `users` table...');
        await qi.addColumn('users', 'role', {
          type: 'VARCHAR(255)',
          allowNull: false,
          defaultValue: 'user'
        });
        console.log('`role` column added.');
      }
    } catch (checkErr) {
      // If describeTable fails (table missing), let the upsert attempt create via sync elsewhere
      console.warn('Could not verify/add `role` column automatically:', checkErr.message || checkErr);
    }

    const hashed = await bcrypt.hash(password, 10);

    // Use upsert; some dialects don't return created flag, so we assume success if no error
    await User.create({
      name,
      email,
      password: hashed,
      role: 'admin'
    });

    req.flash('success_msg', 'Admin user created/updated');
    return res.redirect('/login');
  } catch (err) {
    console.error('Failed to setup admin:', err);
    req.flash('error_msg', 'Failed to setup admin user');
    return res.redirect('/');
  }
};

export const loginPage = (req, res) => res.render("login", { title: "Login" });
export const registerPage = (req, res) => res.render("register", { title: "Register" });
export const forgotPasswordPage = (req, res) => res.render("forgotpassword", { title: "Forgot Password" });
export const dashboardPage = (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  res.render("dashboard", { title: "Dashboard" });
};

export const loginUser = async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = await User.findOne({ where: identityWhere(email) });
    if (!user) {
      await audit(req, 'login.failed', 'account', null, 'Invalid credentials');
      req.flash('error_msg', 'User not found');
      return res.redirect('/login');
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      await audit(req, 'login.failed', 'account', user.id, 'Invalid credentials');
      req.flash('error_msg', 'Incorrect password');
      return res.redirect('/login');
    }

    if (user.isActive === false) return await signIn(req, res, user);
    if (user.emailVerificationRequired && !user.emailVerifiedAt) {
      req.session.pendingEmail = user.email;
      req.flash('error_msg', 'Please verify your email address before signing in.');
      return res.redirect('/verify-email');
    }
    return await signIn(req, res, user);
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error_msg', 'Login failed. Please try again.');
    return res.redirect('/login');
  }
};

export const registerUser = async (req, res) => {
  try {
    const { name, password } = req.body;
    const username = normalizeUsername(req.body.username);
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255 || typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) {
      req.flash('error_msg', 'Enter your full name, a valid email and a password of at least 8 characters (up to 72 bytes).');
      return res.redirect('/register');
    }
    if (!authConfiguration().mailReady && !req.app.locals.mailTransport) {
      req.flash('error_msg', 'Email registration is temporarily unavailable. Please contact the office or use Google if available.');
      return res.redirect('/register');
    }
    if (await User.findOne({ where: { email } })) {
      req.flash('error_msg', 'This email is already registered. Sign in or request another verification email.');
      return res.redirect('/login');
    }
    const user = await User.create({ name: name.trim(), username, email, password: await bcrypt.hash(password, 10), role: 'user', emailVerificationRequired: true });
    req.session.pendingEmail = user.email;
    try {
      await issueVerification(user, req.app.locals.mailTransport);
      req.flash('success_msg', 'Check your inbox for a verification link before signing in.');
    } catch {
      req.flash('error_msg', 'Your account is waiting for verification, but we could not send the email. Please request another email later.');
    }
    return res.redirect('/verify-email');
  } catch (error) {
    if (error.status === 400 || error.name === 'SequelizeUniqueConstraintError') {
      req.flash('error_msg', error.status === 400 ? error.message : 'This email or username is already registered.');
      return res.redirect('/register');
    }
    req.flash('error_msg', 'Registration could not be completed. Please try signing in or request a verification email.');
    return res.redirect('/register');
  }
};

export const logoutUser = (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('smartcivi.sid', { path: '/' });
    res.redirect('/login');
  });
};
