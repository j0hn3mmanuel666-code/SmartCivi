import { audit } from './platform.js';
import { can } from './platformRules.js';

export async function signIn(req, res, user) {
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.userId = user.id;
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  await audit(req, 'login.success', 'account', user.id, 'Signed in');
  return res.redirect(can(user.role, 'overview') ? '/admin' : '/browse');
}
