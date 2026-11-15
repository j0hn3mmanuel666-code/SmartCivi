import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { OAuth2Client } from 'google-auth-library';
import nodemailer from 'nodemailer';

// Native development uses a separate file so Docker database settings stay separate.
const local = existsSync('.env.auth') ? parseEnv(readFileSync('.env.auth', 'utf8')) : {};
const keys = ['PUBLIC_ORIGIN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM'];
export function authConfiguration(env = process.env) {
  const values = Object.fromEntries(keys.map(key => [key, env[key] ?? (env === process.env ? local[key] : '') ?? '']));
  let origin = '';
  if (values.PUBLIC_ORIGIN) {
    const url = new URL(values.PUBLIC_ORIGIN);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin (HTTP is allowed for localhost only).');
    origin = url.origin;
  }
  return { ...values, origin, googleReady: Boolean(origin && values.GOOGLE_CLIENT_ID && values.GOOGLE_CLIENT_SECRET), mailReady: Boolean(origin && values.SMTP_HOST && values.MAIL_FROM) };
}
export const verificationDigest = token => createHash('sha256').update(token).digest('hex');
export const randomToken = () => randomBytes(32).toString('hex');
export function googleClient(config = authConfiguration()) {
  return new OAuth2Client({ clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET, redirectUri: `${config.origin}/auth/google/callback` });
}
export function googleAuthorization(client, flow) {
  return client.generateAuthUrl({ scope: ['openid', 'email', 'profile'], state: flow.state, nonce: flow.nonce, code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' });
}
export async function googleProfile(client, code, flow, audience) {
  const { tokens } = await client.getToken({ code, codeVerifier: flow.verifier });
  if (!tokens.id_token) throw new Error('Missing identity token');
  // The official library validates signature, issuer, audience and expiration.
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience });
  const profile = ticket.getPayload();
  if (!profile || !profile.sub || profile.nonce !== flow.nonce || profile.email_verified !== true || typeof profile.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) throw new Error('Google identity was not verified');
  return { subject: profile.sub, email: profile.email.trim().toLowerCase(), name: String(profile.name || profile.email.split('@')[0]).slice(0, 255) };
}
export function mailTransport(config = authConfiguration()) {
  if (!config.mailReady) throw new Error('Verification email is not configured');
  return nodemailer.createTransport({ host: config.SMTP_HOST, port: Number(config.SMTP_PORT || 587), secure: config.SMTP_SECURE === 'true', requireTLS: config.SMTP_SECURE !== 'true', ...(config.SMTP_USER ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } } : {}), connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
}
export async function sendVerificationEmail(user, token, transport = mailTransport(), config = authConfiguration()) {
  const url = `${config.origin}/verify-email?token=${token}`;
  await transport.sendMail({ from: config.MAIL_FROM, to: user.email, subject: 'Verify your SmartCivi email address', text: `Welcome to SmartCivi.\n\nVerify your email address to finish creating your citizen account:\n${url}\n\nThis link expires in 30 minutes and can be used once. If you did not register, ignore this email.\n\nMunicipal Civil Registry, Bansud, Oriental Mindoro` });
}
