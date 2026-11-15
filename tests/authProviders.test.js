import test from 'node:test';
import assert from 'node:assert/strict';
import { googleProfile, googleAuthorization, verificationDigest, authConfiguration } from '../services/authProviders.js';

test('verification tokens use a one-way digest', () => {
  assert.match(verificationDigest('secret'), /^[a-f0-9]{64}$/);
  assert.notEqual(verificationDigest('secret'), verificationDigest('other'));
});
test('Google authorization requests state, nonce and PKCE', () => {
  const client = { generateAuthUrl: options => options };
  const result = googleAuthorization(client, { state: 'state', nonce: 'nonce', verifier: 'verifier' });
  assert.equal(result.state, 'state'); assert.equal(result.nonce, 'nonce');
  assert.equal(result.code_challenge_method, 'S256'); assert.ok(result.code_challenge);
  assert.deepEqual(result.scope, ['openid', 'email', 'profile']);
});
test('Google requires verified email, matching nonce and stable subject', async () => {
  const payload = { sub: 'google-123', email: 'CITIZEN@example.com', email_verified: true, nonce: 'nonce', name: 'Citizen', iss: 'https://accounts.google.com' };
  const client = { getToken: async () => ({ tokens: { id_token: 'signed-token' } }), verifyIdToken: async options => { assert.equal(options.audience, 'client-id'); assert.equal(options.idToken, 'signed-token'); return { getPayload: () => payload }; } };
  assert.equal((await googleProfile(client, 'code', { nonce: 'nonce', verifier: 'verifier' }, 'client-id')).email, 'citizen@example.com');
  payload.email_verified = false;
  await assert.rejects(googleProfile(client, 'code', { nonce: 'nonce' }, 'client-id'));
  payload.email_verified = true; payload.nonce = 'forged';
  await assert.rejects(googleProfile(client, 'code', { nonce: 'nonce' }, 'client-id'));
});
test('providers stay unavailable without explicit public origin and credentials', () => {
  assert.equal(authConfiguration({}).googleReady, false);
  assert.equal(authConfiguration({ SMTP_HOST: 'smtp.example.com', MAIL_FROM: 'noreply@example.com' }).mailReady, false);
  assert.throws(() => authConfiguration({ PUBLIC_ORIGIN: 'http://evil.example' }));
  assert.equal(authConfiguration({ PUBLIC_ORIGIN: 'http://localhost:3000', GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret' }).googleReady, true);
});
