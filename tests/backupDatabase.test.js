import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { encryptArchive, decryptArchive } from '../services/backupArchive.js';
const execute = promisify(execFile);

test('database backups preserve barangay states and accept pre-catalog archives', { skip: !process.env.RUN_DB_TESTS }, async () => {
  assert.match(process.env.DB_NAME || '', /_test$/);
  const { default: mysql } = await import('mysql2/promise');
  const connection = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', port: Number(process.env.DB_PORT || 3306) });
  const suffix = `${Date.now()}${process.pid}`;
  const source = `rims_backup_${suffix}_test`, target = `rims_restore_${suffix}_test`, legacy = `rims_old_${suffix}_test`;
  try {
    for (const database of [source, target, legacy]) await connection.query(`CREATE DATABASE \`${database}\``);
    const directory = await mkdtemp(resolve('tmp/backup-rims-'));
    const env = { ...process.env, DB_NAME: source, BACKUP_KEY: 'ab'.repeat(32), BACKUP_DIR: directory };
    const run = (args, overrides = {}) => execute(process.execPath, args, { env: { ...env, ...overrides }, maxBuffer: 1024 * 1024 });
    await run(['--input-type=module', '-e', `import './models/Appointment.js'; import './models/Attachment.js'; import {initializePlatform,Barangay,Resident,sequelize} from './models/Platform.js'; await initializePlatform(); await Barangay.bulkCreate([{name:'Backup Active'},{name:'Backup Archived',archivedAt:new Date()}]); await Resident.create({residentCode:'OLD-KEPT',firstName:'Legacy',lastName:'Sample',birthDate:'2000-01-01',sex:'female',barangay:'Backup Active',civilStatus:'married'}); await sequelize.close();`]);
    await run(['--input-type=module', '-e', "import {BudgetItem} from './models/Planning.js';import {sequelize} from './models/db.js';await BudgetItem.create({department:'Backup budget',item:'Equipment',fiscalYear:2037,allocated:'100.10',spent:'150.20'});await sequelize.close();"]);
    await run(['scripts/backup.js']);
    const file = resolve(directory, (await readdir(directory)).find(name => name.endsWith('.scbackup')));
    const snapshot = decryptArchive(await readFile(file), env.BACKUP_KEY);
    assert.equal(snapshot.tables.barangays.length, 2); assert.equal(snapshot.tables.budget_items[0].spent, '150.20');
    await run(['scripts/backup.js', '--restore', file, '--apply'], { DB_NAME: target });
    const [catalog] = await connection.query(`SELECT name,archivedAt FROM \`${target}\`.barangays ORDER BY name`);
    assert.equal(catalog.length, 2); assert.ok(catalog.find(row => row.name === 'Backup Archived').archivedAt);
    delete snapshot.tables.barangays; delete snapshot.tables.budget_items;
    for (const resident of snapshot.tables.residents) delete resident.civilStatus;
    snapshot.tables.residents.push({ ...snapshot.tables.residents[0], id: 2, residentCode: 'OLD-VARIANT', firstName: 'Variant', barangay: 'BACKUP ACTIVE' });
    const oldFile = resolve(directory, 'pre-catalog.scbackup'); await writeFile(oldFile, encryptArchive(snapshot, env.BACKUP_KEY));
    await run(['scripts/backup.js', '--restore', oldFile, '--apply'], { DB_NAME: legacy });
    const [[restored]] = await connection.query(`SELECT residentCode,civilStatus FROM \`${legacy}\`.residents`);
    assert.equal(restored.residentCode, 'OLD-KEPT'); assert.equal(restored.civilStatus, 'not_recorded');
    const [[budgetCount]] = await connection.query(`SELECT COUNT(*) AS total FROM \`${legacy}\`.budget_items`); assert.equal(budgetCount.total, 0);
    const [locations] = await connection.query(`SELECT name FROM \`${legacy}\`.barangays`);
    assert.deepEqual(locations.map(row => row.name), ['Backup Active']);
  } finally { await connection.end(); }
});
