import { audit } from './platform.js';
import { can } from './platformRules.js';

export async function signIn(req, res, user) {
  if (user.isActive === false) {
    await audit(req, 'login.blocked', 'account', user.id, 'Inactive account');
    req.session.user = null; req.session.userId = null;
    req.flash('error_msg', 'Your account is inactive. Contact the office administrator.');
    return res.redirect('/login');
  }
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.userId = user.id;
  req.session.user = { id: user.id, name: user.name, email: user.email, username: user.username, isActive: user.isActive, role: user.role };
  await audit(req, 'login.success', 'account', user.id, 'Signed in');
  return res.redirect(can(user.role, 'overview') ? '/admin' : '/browse');
}
