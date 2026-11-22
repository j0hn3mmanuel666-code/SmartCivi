import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

test('username login, profile edits and account activation', { skip: !process.env.RUN_DB_TESTS }, async t => {
  assert.match(process.env.DB_NAME || '', /_test$/, 'Use a disposable test database');
  process.env.ELECTRON = '1';
  const { default: app } = await import('../index.js');
  const { User, sequelize, Audit } = await import('../models/Platform.js');
  const { default: bcrypt } = await import('bcrypt');
  const password = 'Account-test-password-123', suffix = `${Date.now()}${process.pid}`;
  const hash = await bcrypt.hash(password, 4);
  const admin = await User.create({ name: 'Account test admin', email: `account-admin${suffix}@example.test`, password: hash, role: 'admin', username: `admin${suffix}` });
  const citizen = await User.create({ name: 'Account test citizen', email: `account-user${suffix}@example.test`, password: hash, role: 'user', username: `citizen${suffix}` });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await sequelize.close(); });
  const client = () => ({ cookie: '', token: '', async call(path, body) {
    const r = await fetch(origin + path, { redirect: 'manual', method: body ? 'POST' : 'GET', headers: { Cookie: this.cookie, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-Token': this.token } : {}) }, body: body ? new URLSearchParams(body) : undefined });
    if (r.headers.get('set-cookie')) this.cookie = r.headers.get('set-cookie').split(';')[0];
    const html = await r.text(); this.token = html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || this.token;
    return { status: r.status, location: r.headers.get('location'), html };
  }, async login(identity) { await this.call('/login'); const result = await this.call('/login', { email: identity, password }); await this.call('/login'); return result; } });
  const staff = client(), member = client();
  await t.test('username login is case insensitive and citizen access stays restricted', async () => {
    assert.equal((await staff.login(admin.username.toUpperCase())).location, '/admin');
    assert.equal((await member.login(citizen.username.toUpperCase())).location, '/browse');
    assert.equal((await member.call('/admin/users')).status, 403);
  });
  await t.test('self profile accepts username only, rejects duplicates and ignores forged account fields', async () => {
    assert.equal((await member.call('/dashboard/profile', { username: `changed${suffix}`, id: admin.id, role: 'admin', isActive: 'false' })).status, 303);
    await citizen.reload(); await admin.reload();
    assert.equal(citizen.username, `changed${suffix}`); assert.equal(citizen.role, 'user'); assert.equal(citizen.isActive, true); assert.equal(admin.username, `admin${suffix}`);
    await member.call('/dashboard/profile', { username: admin.username });
    assert.match((await member.call('/dashboard/profile')).html, /username is already in use/i);
    assert.equal((await citizen.reload()).username, `changed${suffix}`);
  });
  await t.test('admin updates preserve unspecified values and reject privileged mass assignment', async () => {
    await staff.call('/admin/users', { id: citizen.id, username: `managed${suffix}`, emailVerifiedAt: new Date().toISOString(), password: 'forged' });
    await citizen.reload(); assert.equal(citizen.username, `managed${suffix}`); assert.equal(citizen.name, 'Account test citizen'); assert.equal(citizen.password, hash); assert.equal(citizen.emailVerifiedAt, null);
    await staff.call('/admin/users', { id: admin.id, isActive: 'false' });
    assert.equal((await admin.reload()).isActive, true);
  });
  await t.test('inactive accounts lose existing sessions and cannot sign in by username or email', async () => {
    await staff.call('/admin/users', { id: citizen.id, isActive: 'false' });
    assert.equal((await citizen.reload()).isActive, false);
    assert.equal((await member.call('/dashboard/profile')).location, '/login');
    for (const identity of [citizen.email, citizen.username]) {
      const blocked = client(); assert.equal((await blocked.login(identity)).location, '/login');
      assert.equal((await blocked.call('/dashboard/profile')).location, '/login');
    }
    Object.assign(process.env, { PUBLIC_ORIGIN: 'http://localhost:3000', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret' });
    await citizen.update({ googleSubject: `blocked-${suffix}` });
    let state, nonce;
    app.locals.googleClient = {
      generateAuthUrl: options => { state = options.state; nonce = options.nonce; return `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`; },
      getToken: async () => ({ tokens: { id_token: 'signed-token' } }),
      verifyIdToken: async () => ({ getPayload: () => ({ sub: citizen.googleSubject, email: citizen.email, email_verified: true, nonce }) }),
    };
    const google = client(); await google.call('/login'); await google.call('/auth/google', {});
    assert.equal((await google.call(`/auth/google/callback?state=${state}&code=code`)).location, '/login');
    assert.equal((await google.call('/dashboard/profile')).location, '/login');
    assert.equal((await citizen.reload()).isActive, false);
    assert.ok(await Audit.count({ where: { entityId: String(citizen.id), action: 'login.blocked' } }));
    await staff.call('/admin/users', { id: citizen.id, isActive: 'true' });
    const restored = client(); assert.equal((await restored.login(citizen.email)).location, '/browse');
  });
  await t.test('email-only accounts retain login and optional username can be cleared', async () => {
    await staff.call('/admin/users', { id: citizen.id, username: '' });
    assert.equal((await citizen.reload()).username, null);
    const legacy = client(); assert.equal((await legacy.login(citizen.email)).location, '/browse');
  });
  await t.test('concurrent administrators cannot both deactivate each other', async () => {
    const pair = await User.bulkCreate(['a', 'b'].map(key => ({ name: `Concurrent ${key}`, email: `concurrent-${key}${suffix}@example.test`, password: hash, role: 'admin' })));
    const [first, second] = [client(), client()];
    await first.login(pair[0].email); await second.login(pair[1].email);
    await Promise.all([first.call('/admin/users', { id: pair[1].id, isActive: 'false' }), second.call('/admin/users', { id: pair[0].id, isActive: 'false' })]);
    await Promise.all(pair.map(account => account.reload()));
    assert.equal(pair.filter(account => account.isActive).length, 1);
  });
  await t.test('registration usernames retain citizen role and required email verification', async () => {
    const sent = []; app.locals.mailTransport = { sendMail: async mail => sent.push(mail) };
    const registered = client(), email = `registered-${suffix}@example.test`, username = `new${suffix}`;
    await registered.call('/register');
    assert.equal((await registered.call('/register', { name: 'Registered username', email, username: username.toUpperCase(), password, role: 'admin', isActive: 'false' })).location, '/verify-email');
    const account = await User.findOne({ where: { email } });
    assert.equal(account.username, username); assert.equal(account.role, 'user'); assert.equal(account.isActive, true); assert.equal(account.emailVerificationRequired, true);
    assert.equal((await registered.login(username)).location, '/verify-email');
    const token = sent[0].text.match(/token=([a-f0-9]{64})/)[1];
    await registered.call('/verify-email'); await registered.call('/verify-email', { token });
    assert.equal((await registered.login(username)).location, '/browse');
    const duplicate = client(); await duplicate.call('/register');
    await duplicate.call('/register', { name: 'Duplicate', email: `duplicate-${suffix}@example.test`, username, password });
    assert.match((await duplicate.call('/register')).html, /email or username is already registered/i);
    assert.equal(await User.count({ where: { email: `duplicate-${suffix}@example.test` } }), 0);
  });
});
