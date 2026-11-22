import test from 'node:test';
import assert from 'node:assert/strict';

test('sign-out waits for session deletion and expires the session cookie', { skip: !process.env.RUN_DB_TESTS }, async () => {
  assert.match(process.env.DB_NAME || '', /_test$/);
  const { logoutUser } = await import('../controllers/authController.js');
  const { sequelize } = await import('../models/Platform.js');
  try {
    let deleted, redirect, cookie, failure;
    const req = { session: { destroy(callback) { deleted = callback; } } };
    const res = { clearCookie(name) { cookie = name; }, redirect(url) { redirect = url; } };
    logoutUser(req, res, error => { failure = error; });
    assert.equal(redirect, undefined, 'Do not redirect until the persistent session is gone');
    deleted(); assert.equal(cookie, 'smartcivi.sid'); assert.equal(redirect, '/login');
    redirect = undefined; cookie = undefined;
    logoutUser(req, res, error => { failure = error; });
    const error = new Error('Session store unavailable'); deleted(error);
    assert.equal(failure, error); assert.equal(redirect, undefined);
  } finally { await sequelize.close(); }
});
