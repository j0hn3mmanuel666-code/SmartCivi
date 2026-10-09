import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { StaffUser, Resident, Barangay } from '../models/index.js';

export const showLoginPage = (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('login');
};

export const login = async (req, res) => {
  try {
    const { username_email, password } = req.body;

    if (!username_email || !password) {
      req.flash('error_msg', 'Please provide username/email and password');
      return res.redirect('/login');
    }

    // Find staff user by email or username
    const user = await StaffUser.findOne({
      where: {
        [Op.or]: [
          { email: username_email },
          { username: username_email }
        ]
      }
    });

    if (!user) {
      req.flash('error_msg', 'Invalid username/email or password');
      return res.redirect('/login');
    }

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      req.flash('error_msg', 'Invalid username/email or password');
      return res.redirect('/login');
    }

    // Check if account is active
    if (user.status !== 'active') {
      req.flash('error_msg', 'Your account has been deactivated. Please contact your administrator.');
      return res.redirect('/login');
    }

    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.email = user.email;

    req.flash('success_msg', `Welcome, ${user.username}!`);
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    req.flash('error_msg', 'An error occurred during login');
    res.redirect('/login');
  }
};

export const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
};

export const showDashboard = async (req, res) => {
  try {
    // Get resident statistics
    const totalResidents = await Resident.count();
    const activeResidents = await Resident.count({ where: { status: 'active' } });
    const archivedResidents = await Resident.count({ where: { status: 'archived' } });
    const totalBarangays = await Barangay.count();

    // Get top barangays by resident count
    const topBarangays = await Barangay.findAll({
      attributes: {
        include: [[
          require('sequelize').fn('COUNT', require('sequelize').col('Residents.id')),
          'resident_count'
        ]]
      },
      include: [{ model: Resident, attributes: [] }],
      group: ['Barangay.id', 'Barangay.name'],
      raw: true,
      order: [[require('sequelize').fn('COUNT', require('sequelize').col('Residents.id')), 'DESC']],
      limit: 5
    });

    // Calculate statistics
    const avgResidentsPerBarangay = totalBarangays > 0 ? (totalResidents / totalBarangays).toFixed(2) : 0;
    const activeResidentsPercentage = totalResidents > 0 ? ((activeResidents / totalResidents) * 100).toFixed(1) : 0;
    const archivedResidentsPercentage = totalResidents > 0 ? ((archivedResidents / totalResidents) * 100).toFixed(1) : 0;

    res.locals.stats = {
      totalResidents,
      activeResidents,
      archivedResidents,
      totalBarangays,
      topBarangays,
      avgResidentsPerBarangay,
      activeResidentsPercentage,
      archivedResidentsPercentage
    };

    res.render('dashboard');
  } catch (error) {
    console.error('Dashboard error:', error);
    req.flash('error_msg', 'Error loading dashboard');
    res.redirect('/login');
  }
};

