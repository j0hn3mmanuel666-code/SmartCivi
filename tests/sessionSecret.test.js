import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionSecret } from '../services/sessionSecret.js';
test('development restarts reuse the signing key and configured keys take priority', () => {
  const directory = mkdtempSync(join(tmpdir(), 'smartcivi-session-'));
  try {
    const first = sessionSecret(directory, {});
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(sessionSecret(directory, {}), first);
    assert.equal(sessionSecret(directory, { SESSION_SECRET: 'configured-key' }), 'configured-key');
    assert.throws(() => sessionSecret(directory, { NODE_ENV: 'production' }), /SESSION_SECRET/);
  } finally { unlinkSync(join(directory, 'session-secret')); rmdirSync(directory); }
});
