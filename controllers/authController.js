
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
    
import bcrypt from "bcrypt";
import { User, sequelize } from "../models/userModel.js";
await sequelize.sync();

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
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/login');
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      req.flash('error_msg', 'Incorrect password');
      return res.redirect('/login');
    }

    req.session.userId = user.id;
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    // Redirect admin users to the admin panel, others to browse
    if (user.role === 'admin') {
      return res.redirect('/admin');
    }
    return res.redirect('/browse');
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error_msg', 'Login failed. Please try again.');
    return res.redirect('/login');
  }
};

export const registerUser = async (req, res) => {
  try {
    console.log("Registration attempt:", { ...req.body, password: '[REDACTED]' });
    
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      console.log("Missing required fields");
      req.flash('error_msg', 'All fields are required');
      return res.redirect('/register');
    }
    
    // Check if user already exists
    console.log("Checking for existing user with email:", email);
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      console.log("User already exists");
      req.flash('error_msg', 'Email already registered');
      return res.redirect('/register');
    }

    console.log("Hashing password...");
    const hashed = await bcrypt.hash(password, 10);
    
    console.log("Creating new user...");
    const user = await User.create({ 
      name, 
      email, 
      password: hashed 
    });
    
    console.log("User created successfully:", { id: user.id, name: user.name, email: user.email });
    
    req.session.userId = user.id;
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role || 'user' };
    // After successful registration, send the user to the services browsing page
    res.redirect("/browse");
  } catch (error) {
    console.error("Registration error:", error);
    req.flash('error_msg', 'Registration failed: ' + error.message);
    res.redirect('/register');
  }
};

export const logoutUser = (req, res) => {
  req.session.destroy();
  res.redirect("/login");
};
