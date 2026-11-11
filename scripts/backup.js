import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { sequelize, initializePlatform, User, Resident, CivilRecord, Request, Resource, Allocation, Movement, Audit, Notice, RequestEvent } from '../models/Platform.js';
import { Appointment } from '../models/Appointment.js';
import { Attachment } from '../models/Attachment.js';
import { encryptArchive, decryptArchive } from '../services/backupArchive.js';
import { pruneSessions } from '../middleware/platformSecurity.js';

const models = [User, Resident, CivilRecord, Request, Appointment, Attachment, Resource, Allocation, Movement, Audit, Notice, RequestEvent];
async function backup() {
  const snapshot = await sequelize.transaction({ isolationLevel: 'REPEATABLE READ' }, async transaction => {
    const tables = {};
    for (const model of models) tables[model.tableName] = await model.findAll({ raw: true, transaction });
    return { format: 1, createdAt: new Date().toISOString(), tables };
  });
  const dir = resolve(process.env.BACKUP_DIR || 'backups');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `smartcivi-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.scbackup`);
  await writeFile(path, encryptArchive(snapshot, process.env.BACKUP_KEY), { flag: 'wx', mode: 0o600 });
  await Audit.create({ actorName: 'System', action: 'backup.completed', entity: 'database', detail: 'Encrypted database snapshot saved' });
  await pruneSessions();
  console.log(`Encrypted database backup saved: ${path}`);
}
async function restore(path, apply) {
  const snapshot = decryptArchive(await readFile(resolve(path)), process.env.BACKUP_KEY);
  const expected = models.map(model => model.tableName).sort();
  if (snapshot.format !== 1 || JSON.stringify(Object.keys(snapshot.tables || {}).sort()) !== JSON.stringify(expected) || expected.some(table => !Array.isArray(snapshot.tables[table]))) throw new Error('Backup schema is incompatible with this application.');
  console.log(`Authenticated backup created ${snapshot.createdAt}; ${expected.reduce((sum, table) => sum + snapshot.tables[table].length, 0)} rows across ${expected.length} tables.`);
  if (!apply) { console.log('Verification only. To restore into an EMPTY target database, add --apply.'); return; }
  await sequelize.transaction(async transaction => {
    for (const model of models) if (await model.count({ transaction })) throw new Error(`Restore refused: target table ${model.tableName} is not empty.`);
    for (const model of models) await model.bulkCreate(snapshot.tables[model.tableName], { transaction, validate: true });
  });
  console.log('Restore completed. Sign in again; sessions are intentionally excluded.');
}
try {
  if (!/^[a-f0-9]{64}$/i.test(process.env.BACKUP_KEY || '')) throw new Error('Configure a 32-byte BACKUP_KEY as 64 hexadecimal characters.');
  const restoreIndex = process.argv.indexOf('--restore');
  if (restoreIndex >= 0 && !process.argv[restoreIndex + 1]) throw new Error('Supply --restore <archive path>.');
  if (restoreIndex >= 0 && !process.argv.includes('--apply')) await restore(process.argv[restoreIndex + 1], false);
  else {
    if (restoreIndex >= 0) await initializePlatform();
    else await sequelize.authenticate();
    if (restoreIndex >= 0) await restore(process.argv[restoreIndex + 1], true);
    else {
      await backup();
      if (process.argv.includes('--watch')) {
        const seconds = Number(process.env.BACKUP_INTERVAL_SECONDS || 86400);
        if (!Number.isInteger(seconds) || seconds < 60 || seconds > 86400 * 7) throw new Error('BACKUP_INTERVAL_SECONDS must be between 60 and 604800.');
        setInterval(() => backup().catch(error => { console.error('Scheduled backup failed:', error.message); process.exitCode = 1; }), seconds * 1000);
        await new Promise(() => {});
      }
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await sequelize.close(); }
