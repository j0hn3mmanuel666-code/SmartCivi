import bcrypt from 'bcrypt';
import { User, Profile, Role, UserRole, AuditLog } from '../models/index.js';
import { validatePassword } from '../utils/passwordValidator.js';
import { logAudit } from '../middleware/auditLog.js';
import { Op } from 'sequelize';

export const listUsers = async (req, res) => {
  try {
    const { search = '', role = '', status = '', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = {};
    let profileWhere = {};

    // Search
    if (search) {
      whereClause = {
        [Op.or]: [
          { username: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
          { '$Profile.first_name$': { [Op.like]: `%${search}%` } },
          { '$Profile.last_name$': { [Op.like]: `%${search}%` } }
        ]
      };
    }

    // Status filter
    if (status && status !== 'all') {
      whereClause.status = status;
    }

    // Role filter
    let includeClause = [
      { model: Profile, as: 'Profile' },
      { model: Role, attributes: ['id', 'name'] }
    ];

    const { count, rows } = await User.findAndCountAll({
      where: whereClause,
      include: includeClause,
      distinct: true,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    // Filter by role if needed
    let users = rows;
    if (role && role !== 'all') {
      users = rows.filter(u => u.Roles.some(r => r.name === role));
    }

    const totalPages = Math.ceil(count / limit);

    res.render('users', {
      users,
      currentPage: parseInt(page),
      totalPages,
      search,
      selectedRole: role,
      selectedStatus: status,
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error listing users:', error);
    req.flash('error_msg', 'Error loading users');
    res.redirect('/dashboard');
  }
};

export const showAddUserPage = async (req, res) => {
  try {
    const roles = await Role.findAll();
    res.render('users-add', { roles });
  } catch (error) {
    console.error('Error loading add user page:', error);
    req.flash('error_msg', 'Error loading form');
    res.redirect('/users');
  }
};

export const createUser = async (req, res) => {
  try {
    const { first_name, middle_name, last_name, contact_number, address, username, email, password, confirmPassword, role, status } = req.body;

    // Validation
    const errors = [];
    if (!first_name) errors.push('First name is required');
    if (!last_name) errors.push('Last name is required');
    if (!username) errors.push('Username is required');
    if (!email) errors.push('Email is required');
    if (!password) errors.push('Password is required');
    if (!confirmPassword) errors.push('Password confirmation is required');
    if (!role) errors.push('Role is required');

    if (password !== confirmPassword) {
      errors.push('Passwords do not match');
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      errors.push(...passwordValidation.errors);
    }

    // Check uniqueness
    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) {
      errors.push('Username already exists');
    }

    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      errors.push('Email already exists');
    }

    if (errors.length > 0) {
      req.flash('error_msg', errors.join(', '));
      return res.redirect('/users/add');
    }

    // Create user
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      username,
      email,
      password_hash: passwordHash,
      status: status || 'active'
    });

    // Create profile
    await Profile.create({
      user_id: user.id,
      first_name,
      middle_name: middle_name || '',
      last_name,
      contact_number: contact_number || '',
      address: address || ''
    });

    // Assign role
    const userRole = await Role.findOne({ where: { name: role } });
    if (userRole) {
      await UserRole.create({
        user_id: user.id,
        role_id: userRole.id
      });
    }

    // Log audit
    await logAudit(req.session.userId, 'USER_CREATED', user.id, `User created: ${username}`, req.ip);

    req.flash('success_msg', `User "${username}" created successfully`);
    res.redirect('/users');
  } catch (error) {
    console.error('Error creating user:', error);
    req.flash('error_msg', 'Error creating user');
    res.redirect('/users/add');
  }
};

export const showUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      include: [
        { model: Profile, as: 'Profile' },
        { model: Role, attributes: ['id', 'name'] }
      ]
    });

    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }

    res.render('users-profile', { user, userRole: user.Roles.length > 0 ? user.Roles[0].name : 'N/A' });
  } catch (error) {
    console.error('Error showing user:', error);
    req.flash('error_msg', 'Error loading user');
    res.redirect('/users');
  }
};

export const showEditUserPage = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      include: [Profile]
    });

    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }

    res.render('users-edit', { user });
  } catch (error) {
    console.error('Error loading edit page:', error);
    req.flash('error_msg', 'Error loading form');
    res.redirect('/users');
  }
};

export const updateUser = async (req, res) => {
  try {
    const { first_name, middle_name, last_name, email, contact_number, address, status } = req.body;
    const userId = req.params.id;

    const user = await User.findByPk(userId, {
      include: [Profile]
    });

    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }

    // Check email uniqueness if changed
    if (email !== user.email) {
      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) {
        req.flash('error_msg', 'Email already in use');
        return res.redirect(`/users/${userId}/edit`);
      }
    }

    // Update user
    user.email = email;
    user.status = status || user.status;
    await user.save();

    // Update profile
    if (user.Profile) {
      user.Profile.first_name = first_name;
      user.Profile.middle_name = middle_name || '';
      user.Profile.last_name = last_name;
      user.Profile.contact_number = contact_number || '';
      user.Profile.address = address || '';
      await user.Profile.save();
    }

    // Log audit
    await logAudit(req.session.userId, 'USER_UPDATED', user.id, `User updated: ${user.username}`, req.ip);

    req.flash('success_msg', 'User updated successfully');
    res.redirect(`/users/${userId}`);
  } catch (error) {
    console.error('Error updating user:', error);
    req.flash('error_msg', 'Error updating user');
    res.redirect(`/users/${req.params.id}/edit`);
  }
};

export const showAssignRolePage = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      include: [
        { model: Profile, as: 'Profile' },
        { model: Role, attributes: ['id', 'name'] }
      ]
    });

    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }

    const allRoles = await Role.findAll({
      include: [{ model: Permission }]
    });

    const currentRole = user.Roles.length > 0 ? user.Roles[0].id : null;

    res.render('users-assign-role', { user, allRoles, currentRole });
  } catch (error) {
    console.error('Error loading assign role page:', error);
    req.flash('error_msg', 'Error loading form');
    res.redirect('/users');
  }
};

export const assignRole = async (req, res) => {
  try {
    const { role_id } = req.body;
    const userId = req.params.id;

    const user = await User.findByPk(userId);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }

    const role = await Role.findByPk(role_id);
    if (!role) {
      req.flash('error_msg', 'Role not found');
      return res.redirect(`/users/${userId}`);
    }

    // Remove old role
    await UserRole.destroy({ where: { user_id: userId } });

    // Assign new role
    await UserRole.create({
      user_id: userId,
      role_id: role_id
    });

    // Log audit
    await logAudit(req.session.userId, 'ROLE_ASSIGNED', userId, `Role changed to: ${role.name}`, req.ip);

    req.flash('success_msg', `Role updated to "${role.name}"`);
    res.redirect(`/users/${userId}`);
  } catch (error) {
    console.error('Error assigning role:', error);
    req.flash('error_msg', 'Error assigning role');
    res.redirect(`/users/${req.params.id}`);
  }
};

export const activateUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.status = 'active';
    await user.save();

    await logAudit(req.session.userId, 'USER_ACTIVATED', user.id, `User activated: ${user.username}`, req.ip);

    res.json({ success: true, message: 'User activated' });
  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({ success: false, error: 'Error activating user' });
  }
};

export const deactivateUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.status = 'inactive';
    await user.save();

    await logAudit(req.session.userId, 'USER_DEACTIVATED', user.id, `User deactivated: ${user.username}`, req.ip);

    res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ success: false, error: 'Error deactivating user' });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const tempPassword = 'Temp@' + Math.random().toString(36).slice(2, 10).toUpperCase();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    user.password_hash = passwordHash;
    await user.save();

    await logAudit(req.session.userId, 'PASSWORD_RESET', user.id, `Password reset for: ${user.username}`, req.ip);

    res.json({ success: true, message: 'Password reset', tempPassword });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ success: false, error: 'Error resetting password' });
  }
};
