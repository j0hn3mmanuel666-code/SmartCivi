import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { User, Profile, Role, Permission, RolePermission, AuditLog } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';

export const loginPage = (req, res) => {
  res.render('login');
};

export const loginUser = async (req, res) => {
  try {
    const { email_username, password, remember_me } = req.body;

    if (!email_username || !password) {
      req.flash('error_msg', 'Please provide email/username and password');
      return res.redirect('/login');
    }

    // Find user by email or username
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { email: email_username },
          { username: email_username }
        ]
      },
      include: {
        model: Profile,
        as: 'Profile'
      }
    });

    if (!user) {
      await logAudit(null, 'LOGIN_FAILED', null, `Failed login attempt for: ${email_username}`, req.ip);
      req.flash('error_msg', 'Invalid email/username or password');
      return res.redirect('/login');
    }

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      await logAudit(null, 'LOGIN_FAILED', null, `Failed login attempt for user: ${user.username}`, req.ip);
      req.flash('error_msg', 'Invalid email/username or password');
      return res.redirect('/login');
    }

    // Check if account is active
    if (user.status !== 'active') {
      await logAudit(user.id, 'LOGIN_FAILED', null, 'Account is inactive', req.ip);
      req.flash('error_msg', 'Your account has been deactivated. Please contact your administrator.');
      return res.redirect('/login');
    }

    // Fetch user's roles and permissions
    const userRoles = await user.getRoles();
    const rolePermissions = [];

    for (const role of userRoles) {
      const permissions = await role.getPermissions();
      permissions.forEach(perm => {
        if (!rolePermissions.includes(perm.name)) {
          rolePermissions.push(perm.name);
        }
      });
    }

    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.email = user.email;
    req.session.role = userRoles.length > 0 ? userRoles[0].name : 'User';
    req.session.permissions = rolePermissions;

    if (remember_me === 'on') {
      req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    }

    // Update last login
    user.last_login = new Date();
    await user.save();

    // Log audit entry
    await logAudit(user.id, 'LOGIN', null, `User logged in: ${user.username}`, req.ip);

    req.flash('success_msg', `Welcome back, ${user.username}!`);
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    req.flash('error_msg', 'An error occurred during login');
    res.redirect('/login');
  }
};

export const logoutUser = async (req, res) => {
  try {
    if (req.session.userId) {
      await logAudit(req.session.userId, 'LOGOUT', null, 'User logged out', req.ip);
    }

    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
      }
      res.redirect('/login');
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.redirect('/login');
  }
};

export const forgotPasswordPage = (req, res) => {
  res.render('forgot-password');
};

export const showDashboard = async (req, res) => {
  try {
    const user = await User.findByPk(req.session.userId, {
      include: [
        { model: Profile, as: 'Profile' },
        { model: Role }
      ]
    });

    if (!user) {
      return res.redirect('/login');
    }

    res.locals.user = user;
    res.locals.role = req.session.role;

    if (req.session.role === 'Administrator') {
      // Admin dashboard
      const totalUsers = await User.count();
      const activeUsers = await User.count({ where: { status: 'active' } });
      const inactiveUsers = await User.count({ where: { status: 'inactive' } });

      const adminRole = await Role.findOne({ where: { name: 'Administrator' } });
      const staffRole = await Role.findOne({ where: { name: 'LGU Staff' } });
      const residentRole = await Role.findOne({ where: { name: 'Resident' } });

      const adminCount = await adminRole.countUsers();
      const staffCount = await staffRole.countUsers();
      const residentCount = await residentRole.countUsers();

      // Get recent audit logs
      const recentLogs = await AuditLog.findAll({
        include: [{ model: User, as: 'User', include: [Profile] }],
        order: [['createdAt', 'DESC']],
        limit: 10
      });

      res.locals.stats = {
        totalUsers,
        activeUsers,
        inactiveUsers,
        adminCount,
        staffCount,
        residentCount
      };
      res.locals.recentLogs = recentLogs;
    } else {
      // Staff/Resident dashboard - get the first role name
      const userRoles = await user.getRoles();
      res.locals.userRole = userRoles.length > 0 ? userRoles[0].name : req.session.role;
    }

    res.render('dashboard');
  } catch (error) {
    console.error('Dashboard error:', error);
    req.flash('error_msg', 'Error loading dashboard');
    res.redirect('/login');
  }
};
