import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcrypt';
import { User, Audit, sequelize } from '../models/Platform.js';
try {
  let email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
  if (!process.argv.includes('--from-env')) {
    const prompt = createInterface({ input: stdin, output: stdout });
    try { email = await prompt.question('Administrator email: '); password = await prompt.question('Initial password (12–72 bytes; visible in this terminal): '); } finally { prompt.close(); }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') || typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 72) throw new Error('Provide a valid ADMIN_EMAIL and ADMIN_PASSWORD of 12–72 bytes.');
  await sequelize.authenticate();
  await sequelize.transaction(async transaction => {
    if (await User.count({ where: { role: 'admin' }, transaction })) throw new Error('An administrator already exists. Use User management instead.');
    const user = await User.create({ name: 'SmartCivi Administrator', email: email.trim().toLowerCase(), password: await bcrypt.hash(password, 12), role: 'admin' }, { transaction });
    await Audit.create({ actorId: user.id, actorName: 'System', action: 'admin.bootstrapped', entity: 'account', entityId: String(user.id), detail: 'Initial local administrator created' }, { transaction });
  });
  console.log('Initial administrator created. Credentials were not printed.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await sequelize.close(); }
