import { fail } from './platformRules.js';

export function normalizeUsername(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') fail('Enter a valid username.');
  const username = value.trim().toLowerCase();
  if (!username) return null;
  if (!/^[a-z][a-z0-9._-]{2,39}$/.test(username)) fail('Username must be 3–40 characters, start with a letter and contain only letters, numbers, dots, underscores or hyphens.');
  return username;
}
export function accountStatus(value, fallback = true) {
  if (value === undefined) return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  fail('Choose Active or Inactive for the account status.');
}
export function identityWhere(value) {
  const identity = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return identity.includes('@') ? { email: identity } : { username: identity };
}
