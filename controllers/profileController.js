import bcrypt from 'bcrypt';
import { User, Profile, Role } from '../models/index.js';
import { validatePassword } from '../utils/passwordValidator.js';
import { logAudit } from '../middleware/auditLog.js';

export const showProfile = async (req, res) => {
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

    res.render('profile', { user, userRole: user.Roles.length > 0 ? user.Roles[0].name : 'N/A' });
  } catch (error) {
    console.error('Error showing profile:', error);
    req.flash('error_msg', 'Error loading profile');
    res.redirect('/dashboard');
  }
};

export const showEditProfilePage = async (req, res) => {
  try {
    const user = await User.findByPk(req.session.userId, {
      include: [Profile]
    });

    if (!user) {
      return res.redirect('/login');
    }

    res.render('profile-edit', { user });
  } catch (error) {
    console.error('Error loading edit profile page:', error);
    req.flash('error_msg', 'Error loading form');
    res.redirect('/profile');
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { first_name, middle_name, last_name, contact_number, address } = req.body;
    const userId = req.session.userId;

    const user = await User.findByPk(userId, {
      include: [Profile]
    });

    if (!user) {
      return res.redirect('/login');
    }

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
    await logAudit(userId, 'PROFILE_UPDATED', null, 'User updated their profile', req.ip);

    req.flash('success_msg', 'Profile updated successfully');
    res.redirect('/profile');
  } catch (error) {
    console.error('Error updating profile:', error);
    req.flash('error_msg', 'Error updating profile');
    res.redirect('/profile/edit');
  }
};

export const showChangePasswordPage = (req, res) => {
  res.render('profile-change-password');
};

export const changePassword = async (req, res) => {
  try {
    const { old_password, new_password, confirm_password } = req.body;
    const userId = req.session.userId;

    if (!old_password || !new_password || !confirm_password) {
      req.flash('error_msg', 'All fields are required');
      return res.redirect('/profile/change-password');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.redirect('/login');
    }

    // Verify old password
    const passwordMatch = await bcrypt.compare(old_password, user.password_hash);
    if (!passwordMatch) {
      req.flash('error_msg', 'Current password is incorrect');
      return res.redirect('/profile/change-password');
    }

    // Validate new password
    const passwordValidation = validatePassword(new_password);
    if (!passwordValidation.valid) {
      req.flash('error_msg', passwordValidation.errors.join(', '));
      return res.redirect('/profile/change-password');
    }

    // Check passwords match
    if (new_password !== confirm_password) {
      req.flash('error_msg', 'New passwords do not match');
      return res.redirect('/profile/change-password');
    }

    // Hash and update
    const passwordHash = await bcrypt.hash(new_password, 12);
    user.password_hash = passwordHash;
    await user.save();

    // Log audit
    await logAudit(userId, 'PASSWORD_CHANGED', null, 'User changed their password', req.ip);

    req.flash('success_msg', 'Password changed successfully');
    res.redirect('/profile');
  } catch (error) {
    console.error('Error changing password:', error);
    req.flash('error_msg', 'Error changing password');
    res.redirect('/profile/change-password');
  }
};
