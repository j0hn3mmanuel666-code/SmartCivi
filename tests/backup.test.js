import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptArchive, decryptArchive } from '../services/backupArchive.js';
test('backup archive authenticates, round-trips and rejects tampering and wrong keys', () => {
  const key = 'ab'.repeat(32), data = { format: 1, tables: { residents: [{ id: 1, firstName: 'Ana' }] } };
  const archive = encryptArchive(data, key);
  assert.equal(archive.includes(Buffer.from('Ana')), false);
  assert.deepEqual(decryptArchive(archive, key), data);
  assert.throws(() => decryptArchive(archive, 'cd'.repeat(32)));
  archive[archive.length - 1] ^= 1;
  assert.throws(() => decryptArchive(archive, key));
  assert.throws(() => encryptArchive(data, 'short'));
});
