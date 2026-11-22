import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function sessionSecret(directory, env = process.env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be configured in production.');
  mkdirSync(directory, { recursive: true });
  const filename = join(directory, 'session-secret');
  try { writeFileSync(filename, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const value = readFileSync(filename, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Local session key is invalid. Configure SESSION_SECRET.');
  return value;
}
