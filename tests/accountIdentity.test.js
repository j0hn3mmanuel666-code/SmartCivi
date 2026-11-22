import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsername, accountStatus, identityWhere } from '../services/accountIdentity.js';

test('optional usernames are normalized and strictly validated', () => {
  assert.equal(normalizeUsername(' Abc.ONE_2-3 '), 'abc.one_2-3');
  assert.equal(normalizeUsername(''), null);
  assert.equal(normalizeUsername(undefined), null);
  for (const value of ['ab', '1abc', 'a@bc', 'a bcd', 'a'.repeat(41), {}, ['abc']]) assert.throws(() => normalizeUsername(value));
});
test('account status accepts only explicit supported values', () => {
  assert.equal(accountStatus('true'), true); assert.equal(accountStatus('false'), false);
  assert.equal(accountStatus(undefined, false), false);
  assert.throws(() => accountStatus('maybe'));
});
test('email and username credentials use normalized separate identities', () => {
  assert.deepEqual(identityWhere(' ABC@example.test '), { email: 'abc@example.test' });
  assert.deepEqual(identityWhere(' Citizen.One '), { username: 'citizen.one' });
});
