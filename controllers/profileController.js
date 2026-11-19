import { User, sequelize } from '../models/userModel.js';
import { normalizeUsername } from '../services/accountIdentity.js';
import { text, fail } from '../services/platformRules.js';
import { audit } from '../services/platform.js';

export async function updateProfile(req, res) {
  if (!req.session.user) return res.redirect('/login');
  try {
    const values = {};
    if (Object.hasOwn(req.body, 'name')) {
      values.name = text(req.body.name, 'Full name', true, 255);
      if (/[\u0000-\u001f\u007f]/.test(values.name)) fail('Full name must not contain control characters.');
    }
    if (Object.hasOwn(req.body, 'username')) values.username = normalizeUsername(req.body.username);
    if (!Object.keys(values).length) fail('Enter a name or username to update.');
    await sequelize.transaction(async transaction => {
      const account = await User.findByPk(req.session.user.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!account || account.isActive === false) fail('Account not found or inactive.', 403);
      await account.update(values, { transaction });
      await audit(req, Object.hasOwn(values, 'username') ? 'account.username-updated' : 'account.name-updated', 'account', account.id, 'Updated profile details', transaction);
    });
    Object.assign(req.session.user, values);
    req.flash('success_msg', Object.hasOwn(values, 'username') ? 'Your username has been updated.' : 'Your name has been updated.');
  } catch (error) {
    if (!error.status && error.name !== 'SequelizeUniqueConstraintError') throw error;
    req.flash('error_msg', error.name === 'SequelizeUniqueConstraintError' ? 'This username is already in use. Choose another username.' : error.message);
  }
  return res.redirect(303, '/dashboard/profile');
}
