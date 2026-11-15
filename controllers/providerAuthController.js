import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { User } from '../models/userModel.js';
import { authConfiguration, googleClient, googleAuthorization, googleProfile, randomToken, verificationDigest, sendVerificationEmail } from '../services/authProviders.js';
import { signIn } from '../services/accountAccess.js';
import { audit } from '../services/platform.js';

const tokenValid = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
export async function issueVerification(user, transport) {
  const token = randomToken(), now = new Date();
  const [updated] = await User.update({ verificationTokenHash: verificationDigest(token), verificationExpiresAt: new Date(Date.now() + 30 * 60000), verificationSentAt: now }, { where: { id: user.id, emailVerificationRequired: true, emailVerifiedAt: null, [Op.or]: [{ verificationSentAt: null }, { verificationSentAt: { [Op.lte]: new Date(Date.now() - 60000) } }] } });
  if (!updated) return;
  try { await sendVerificationEmail(user, token, transport); }
  catch (error) {
    await User.update({ verificationSentAt: null, verificationTokenHash: null, verificationExpiresAt: null }, { where: { id: user.id, verificationTokenHash: verificationDigest(token) } });
    throw error;
  }
}
export function verificationPage(req, res) {
  res.set('Referrer-Policy', 'no-referrer');
  res.render('verifyEmail', { title: 'Verify email', verificationToken: tokenValid(req.query.token) ? req.query.token : '', pendingEmail: req.session.pendingEmail || '' });
}
export async function verifyEmail(req, res, next) {
  try {
    const token = req.body.token;
    const [updated] = tokenValid(token) ? await User.update({ emailVerifiedAt: new Date(), emailVerificationRequired: false, verificationTokenHash: null, verificationExpiresAt: null }, { where: { verificationTokenHash: verificationDigest(token), verificationExpiresAt: { [Op.gt]: new Date() }, emailVerificationRequired: true, emailVerifiedAt: null } }) : [0];
    if (!updated) { req.flash('error_msg', 'This verification link is invalid or expired. Request a new email below.'); return res.redirect('/verify-email'); }
    delete req.session.pendingEmail;
    req.flash('success_msg', 'Email verified. You can now sign in.');
    return res.redirect('/login');
  } catch (error) { next(error); }
}
export async function resendVerification(req, res) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email.length <= 255) {
      const user = await User.findOne({ where: { email, emailVerificationRequired: true, emailVerifiedAt: null } });
      if (user) await issueVerification(user, req.app.locals.mailTransport);
    }
    req.flash('success_msg', 'If this address needs verification, an email will be sent. Wait one minute before requesting another.');
  } catch {
    req.flash('error_msg', 'We could not send a verification email. Please try again later or contact the office.');
  }
  return res.redirect('/verify-email');
}
export function startGoogle(req, res) {
  const config = authConfiguration();
  if (!config.googleReady) { req.flash('error_msg', 'Google sign-in is not available yet. Please use your email and password.'); return res.redirect('/login'); }
  const linkId = req.body.intent === 'link' ? req.session.userId : null;
  if (req.body.intent === 'link' && !linkId) return res.redirect('/login');
  const flow = { state: randomToken(), nonce: randomToken(), verifier: randomToken(), createdAt: Date.now(), linkId };
  req.session.googleFlow = flow;
  return res.redirect(googleAuthorization(req.app.locals.googleClient || googleClient(config), flow));
}
export async function finishGoogle(req, res) {
  const flow = req.session.googleFlow;
  delete req.session.googleFlow;
  try {
    if (!flow || Date.now() - flow.createdAt > 10 * 60000 || typeof req.query.state !== 'string' || req.query.state !== flow.state || typeof req.query.code !== 'string' || req.query.error) throw new Error('Invalid Google response');
    const config = authConfiguration();
    if (!config.googleReady) throw new Error('Google is unavailable');
    const profile = await googleProfile(req.app.locals.googleClient || googleClient(config), req.query.code, flow, config.GOOGLE_CLIENT_ID);
    let user = await User.findOne({ where: { googleSubject: profile.subject } });
    if (flow.linkId) {
      if (req.session.userId !== flow.linkId) throw new Error('Account session changed');
      const current = await User.findByPk(flow.linkId);
      if (!current || current.email.toLowerCase() !== profile.email || (current.googleSubject && current.googleSubject !== profile.subject) || (user && user.id !== current.id)) throw new Error('Google account does not match');
      await current.update({ googleSubject: profile.subject, emailVerifiedAt: new Date(), emailVerificationRequired: false, verificationTokenHash: null, verificationExpiresAt: null });
      await audit(req, 'account.google-linked', 'account', current.id, 'Linked Google sign-in');
      req.flash('success_msg', 'Google sign-in is connected to your account.');
      return res.redirect('/dashboard/profile');
    }
    if (!user) {
      // Never link an existing email automatically, especially an LGU staff account.
      if (await User.findOne({ where: { email: profile.email } })) {
        req.flash('error_msg', 'This email already has a SmartCivi account. Sign in with your password, then connect Google from My profile.');
        return res.redirect('/login');
      }
      user = await User.create({ name: profile.name, email: profile.email, password: await bcrypt.hash(randomToken(), 10), role: 'user', googleSubject: profile.subject, emailVerifiedAt: new Date(), emailVerificationRequired: false });
    }
    return await signIn(req, res, user);
  } catch {
    req.flash('error_msg', 'Google sign-in could not be completed. Please try again and choose the matching Google account.');
    return res.redirect('/login');
  }
}

// Per-process abuse limit, with a persistent per-account resend cooldown above.
// ponytail: multi-instance deployments should move IP limits to a shared proxy/store.
const attempts = new Map();
export function limitAuth(req, res, next) {
  const now = Date.now(), key = req.ip;
  for (const [ip, entry] of attempts) if (entry.until <= now) attempts.delete(ip);
  const entry = attempts.get(key) || { count: 0, until: now + 15 * 60000 };
  if (entry.count >= 40 || (!attempts.has(key) && attempts.size >= 10000)) { res.set('Retry-After', '900'); return res.status(429).send('Too many account requests. Please try again in 15 minutes.'); }
  entry.count++; attempts.set(key, entry); next();
}
