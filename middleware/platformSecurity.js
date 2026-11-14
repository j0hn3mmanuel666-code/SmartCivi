import session from 'express-session';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Op } from 'sequelize';
import { Session, User, Request } from '../models/Platform.js';
import { can, SYSTEM_TITLE } from '../services/platformRules.js';

export class DatabaseSessionStore extends session.Store {
  get(sid, callback) { Session.findByPk(sid).then(row => callback(null, row && row.expires > new Date() ? JSON.parse(row.data) : null)).catch(callback); }
  set(sid, value, callback = () => {}) { Session.upsert({ sid, data: JSON.stringify(value), expires: value.cookie.expires || new Date(Date.now() + 1800000) }).then(() => callback()).catch(callback); }
  destroy(sid, callback = () => {}) { Session.destroy({ where: { sid } }).then(() => callback()).catch(callback); }
  touch(sid, value, callback = () => {}) { Session.update({ expires: value.cookie.expires || new Date(Date.now() + 1800000) }, { where: { sid } }).then(() => callback()).catch(callback); }
}
export async function platformSecurity(req, res, next) {
  try {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
    res.set('Cache-Control', 'no-store');
    if (req.session.user) {
      const user = await User.findByPk(req.session.user.id, { attributes: ['id', 'name', 'email', 'role'] });
      if (!user) { req.session.user = null; req.session.userId = null; }
      else req.session.user = user.toJSON();
      res.set('Cache-Control', 'no-store');
    }
    req.session.csrf ||= randomBytes(32).toString('hex');
    Object.assign(res.locals, { systemTitle: SYSTEM_TITLE, officeName: 'Municipality of Bansud, Oriental Mindoro', csrf: req.session.csrf, user: req.session.user, isStaff: can(req.session.user?.role, 'overview'), canRegistry: can(req.session.user?.role, 'registry'), canResidents: can(req.session.user?.role, 'residents'), canResources: can(req.session.user?.role, 'resources'), canRequests: can(req.session.user?.role, 'requests'), canReports: can(req.session.user?.role, 'reports'), isAdmin: req.session.user?.role === 'admin' });
    const send = res.send;
    res.send = function(body) {
      if (typeof body === 'string' && (this.getHeader('Content-Type')?.includes('text/html') || /^\s*<!doctype html>/i.test(body))) {
        body = body.replace(/<form\b[^>]*>/gi, form => `${form}<input type="hidden" name="_csrf" value="${req.session.csrf}">`);
      }
      return send.call(this, body);
    };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const token = req.get('X-CSRF-Token') || req.body?._csrf;
      if (typeof token !== 'string' || Buffer.byteLength(token) !== Buffer.byteLength(req.session.csrf) || !timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrf))) {
        if (req.method === 'POST' && req.path === '/login') {
          req.flash('error_msg', 'Your sign-in page expired. Please enter your details again.');
          return res.redirect(303, '/login');
        }
        return res.status(403).send('Your session token is missing or expired. Reload the page and try again.');
      }
    }
    next();
  } catch (error) { next(error); }
}
export const requireFeature = feature => (req, res, next) => {
  if (!req.session.user) return req.path.startsWith('/api/') ? res.status(401).json({ error: 'Sign in required.' }) : res.redirect('/login');
  if (!can(req.session.user.role, feature)) return res.status(403).send('Your role does not have access to this feature.');
  next();
};
export async function ownRequest(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  try {
    const request = await Request.findByPk(req.params.id);
    if (!request || (!can(req.session.user.role, 'requests') && request.email.toLowerCase() !== req.session.user.email.toLowerCase())) return res.status(404).send('Request not found.');
    req.ownedRequest = request;
    next();
  } catch (error) { next(error); }
}
export async function pruneSessions() { await Session.destroy({ where: { expires: { [Op.lt]: new Date() } } }); }
