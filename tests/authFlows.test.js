import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

test('registration verification and Google account boundaries', { skip: !process.env.RUN_DB_TESTS }, async t => {
  assert.match(process.env.DB_NAME || '', /_test$/);
  Object.assign(process.env, { ELECTRON: '1', PUBLIC_ORIGIN: 'http://localhost:3000', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', SMTP_HOST: 'test.invalid', MAIL_FROM: 'SmartCivi <noreply@example.test>' });
  const { default: app } = await import('../index.js');
  const { User, sequelize } = await import('../models/Platform.js');
  const { default: bcrypt } = await import('bcrypt');
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await sequelize.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`, suffix = Date.now(), password = 'Verify-this-password-123';
  const sent = []; app.locals.mailTransport = { sendMail: async mail => sent.push(mail) };
  const client = () => ({ cookie: '', csrf: '', async call(path, data) {
    const r = await fetch(origin + path, { redirect: 'manual', method: data ? 'POST' : 'GET', headers: { Cookie: this.cookie, ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body: data ? new URLSearchParams({ _csrf: this.csrf, ...data }) : undefined });
    if (r.headers.get('set-cookie')) this.cookie = r.headers.get('set-cookie').split(';')[0];
    const html = await r.text(); this.csrf = html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || this.csrf;
    return { status: r.status, location: r.headers.get('location'), html };
  } });
  const c = client(), email = `verify-${suffix}@example.test`;
  await t.test('new registration waits for email, sends one-time link and ignores posted role', async () => {
    await c.call('/register');
    assert.equal((await c.call('/register', { name: 'Citizen', email, password, role: 'admin' })).location, '/verify-email');
    const user = await User.findOne({ where: { email } });
    assert.equal(user.role, 'user'); assert.equal(user.emailVerificationRequired, true);
    assert.equal((await c.call('/dashboard')).location, '/login');
    assert.equal(sent.length, 1); assert.equal(sent[0].to, email);
    assert.match(user.verificationTokenHash, /^[a-f0-9]{64}$/);
    await c.call('/login');
    assert.equal((await c.call('/login', { email, password })).location, '/verify-email');
    await c.call('/verify-email');
    await c.call('/verify-email/resend', { email }); assert.equal(sent.length, 1, 'Persistent resend cooldown');
  });
  let token;
  await t.test('link preview does not consume token; CSRF and one-time confirmation enforced', async () => {
    token = sent[0].text.match(/token=([a-f0-9]{64})/)[1];
    const page = await c.call(`/verify-email?token=${token}`); assert.match(page.html, /Confirm email address/);
    assert.equal((await User.findOne({ where: { email } })).emailVerifiedAt, null);
    assert.equal((await c.call('/verify-email', { token, _csrf: 'wrong' })).status, 403);
    assert.equal((await c.call('/verify-email', { token })).location, '/login');
    const user = await User.findOne({ where: { email } }); assert.ok(user.emailVerifiedAt); assert.equal(user.verificationTokenHash, null);
    assert.equal((await c.call('/verify-email', { token })).location, '/verify-email');
    await c.call('/login'); assert.equal((await c.call('/login', { email, password })).location, '/browse');
  });
  await t.test('expired links fail and resend rotates the old token', async () => {
    const d = client(), email2 = `expire-${suffix}@example.test`;
    await d.call('/register'); await d.call('/register', { name: 'Other', email: email2, password });
    const old = sent.at(-1).text.match(/token=([a-f0-9]{64})/)[1];
    await User.update({ verificationExpiresAt: new Date(0), verificationSentAt: new Date(0) }, { where: { email: email2 } });
    await d.call('/verify-email'); assert.equal((await d.call('/verify-email', { token: old })).location, '/verify-email');
    await d.call('/verify-email/resend', { email: email2 });
    const replacement = sent.at(-1).text.match(/token=([a-f0-9]{64})/)[1]; assert.notEqual(old, replacement);
    assert.equal((await d.call('/verify-email', { token: old })).location, '/verify-email');
    assert.equal((await d.call('/verify-email', { token: replacement })).location, '/login');
  });
  const g = client(); let state, nonce;
  app.locals.googleClient = {
    generateAuthUrl: opts => { state = opts.state; nonce = opts.nonce; return `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`; },
    getToken: async () => ({ tokens: { id_token: 'signed-id-token' } }),
    verifyIdToken: async () => ({ getPayload: () => ({ sub: `sub-${suffix}`, nonce, email: `google-${suffix}@example.test`, name: 'Google Citizen', email_verified: true }) }),
  };
  await t.test('Google protects callbacks and creates a verified citizen', async () => {
    await g.call('/login'); assert.equal((await g.call('/auth/google', { _csrf: 'wrong' })).status, 403);
    await g.call('/auth/google', {});
    assert.equal((await g.call('/auth/google/callback?state=forged&code=code')).location, '/login');
    assert.equal(await User.count({ where: { googleSubject: `sub-${suffix}` } }), 0);
    await g.call('/login'); await g.call('/auth/google', {});
    assert.equal((await g.call(`/auth/google/callback?state=${state}&code=code`)).location, '/browse');
    const user = await User.findOne({ where: { googleSubject: `sub-${suffix}` } }); assert.equal(user.role, 'user'); assert.ok(user.emailVerifiedAt);
    assert.equal((await g.call(`/auth/google/callback?state=${state}&code=code`)).location, '/login');
  });
  await t.test('matching email never silently links an existing privileged account', async () => {
    const existing = await User.create({ name: 'Existing Admin', email: `existing-${suffix}@example.test`, password: await bcrypt.hash(password, 4), role: 'admin' });
    app.locals.googleClient.verifyIdToken = async () => ({ getPayload: () => ({ sub: `unlinked-${suffix}`, nonce, email: existing.email, email_verified: true }) });
    const d = client(); await d.call('/login'); await d.call('/auth/google', {});
    assert.equal((await d.call(`/auth/google/callback?state=${state}&code=code`)).location, '/login');
    assert.equal((await existing.reload()).googleSubject, null);
    await d.call('/login'); assert.equal((await d.call('/login', { email: existing.email, password })).location, '/admin');
    await d.call('/dashboard/profile'); await d.call('/auth/google', { intent: 'link' });
    assert.equal((await d.call(`/auth/google/callback?state=${state}&code=code`)).location, '/dashboard/profile');
    assert.equal((await existing.reload()).googleSubject, `unlinked-${suffix}`); assert.equal(existing.role, 'admin');
  });
  await t.test('mail failure leaves a recoverable pending account and clears unusable links', async () => {
    app.locals.mailTransport = { sendMail: async () => { throw new Error('Provider unavailable'); } };
    const d = client(), failedEmail = `mail-failure-${suffix}@example.test`;
    await d.call('/register');
    assert.equal((await d.call('/register', { name: 'Pending', email: failedEmail, password })).location, '/verify-email');
    const user = await User.findOne({ where: { email: failedEmail } });
    assert.equal(user.emailVerificationRequired, true); assert.equal(user.verificationTokenHash, null); assert.equal(user.verificationSentAt, null);
    app.locals.mailTransport = { sendMail: async mail => sent.push(mail) };
    await d.call('/verify-email'); await d.call('/verify-email/resend', { email: failedEmail });
    assert.equal(sent.at(-1).to, failedEmail); assert.ok((await user.reload()).verificationTokenHash);
  });
  await t.test('unconfigured providers fail safely without creating unusable accounts', async () => {
    Object.assign(process.env, { SMTP_HOST: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });
    delete app.locals.mailTransport;
    const d = client(), blockedEmail = `unconfigured-${suffix}@example.test`;
    assert.match((await d.call('/register')).html, /Email registration is temporarily unavailable/);
    assert.equal((await d.call('/register', { name: 'Blocked', email: blockedEmail, password })).location, '/register');
    assert.equal(await User.count({ where: { email: blockedEmail } }), 0);
    assert.equal((await d.call('/auth/google', {})).location, '/login');
    await d.call('/login'); assert.equal((await d.call('/login', { email, password })).location, '/browse');
  });
});
