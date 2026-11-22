import { DataTypes as D } from 'sequelize';
import { sequelize } from './db.js';
import { Op } from 'sequelize';
import { User } from './userModel.js';
import { Request } from './Request.js';
import './Planning.js';
import { requestCaseDefaults } from '../services/requestWorkflow.js';
const string = (size = 255, required = false) => ({ type: D.STRING(size), allowNull: !required });
export const Barangay = sequelize.define('Barangay', {
  name: { ...string(100, true), unique: true }, code: { ...string(40), unique: true }, archivedAt: D.DATE,
}, { tableName: 'barangays' });
export const Resident = sequelize.define('Resident', {
  civilStatus: { type: D.STRING(30), allowNull: false, defaultValue: 'not_recorded' },
  residentCode: { ...string(50, true), unique: true }, firstName: string(100, true), middleName: string(100), lastName: string(100, true), birthDate: { type: D.DATEONLY, allowNull: false }, sex: string(20, true), barangay: string(100, true), address: string(), email: string(), phone: string(40), archivedAt: D.DATE,
}, { tableName: 'residents', indexes: [{ fields: ['lastName', 'firstName', 'birthDate'], unique: true }] });
export const CivilRecord = sequelize.define('CivilRecord', {
  residentId: { type: D.INTEGER, allowNull: false, references: { model: 'residents', key: 'id' } }, type: string(20, true), registryNumber: { ...string(80, true), unique: true }, eventDate: { type: D.DATEONLY, allowNull: false }, registeredDate: D.DATEONLY, eventPlace: string(255, true), fatherName: string(), motherName: string(), spouseName: string(), notes: D.TEXT, archivedAt: D.DATE,
}, { tableName: 'civil_records' });
CivilRecord.belongsTo(Resident, { foreignKey: 'residentId', onDelete: 'RESTRICT' });
export const Resource = sequelize.define('Resource', {
  location: string(150), contactNumber: string(40), employeeStatus: { type: D.STRING(20), allowNull: false, defaultValue: 'active' },
  code: { ...string(50, true), unique: true }, name: string(255, true), category: string(30, true), department: string(150, true), unit: string(40, true), quantity: { type: D.INTEGER, allowNull: false }, minimum: { type: D.INTEGER, allowNull: false, defaultValue: 0 }, position: string(150), condition: string(30, true), notes: D.TEXT, archivedAt: D.DATE,
}, { tableName: 'resources' });
export const Allocation = sequelize.define('Allocation', {
  resourceId: { type: D.INTEGER, allowNull: false, references: { model: 'resources', key: 'id' } }, recipient: string(150, true), quantity: { type: D.INTEGER, allowNull: false }, returned: { type: D.INTEGER, allowNull: false, defaultValue: 0 }, dueDate: D.DATEONLY, notes: D.TEXT,
}, { tableName: 'resource_allocations' });
Allocation.belongsTo(Resource, { foreignKey: 'resourceId', onDelete: 'RESTRICT' });
export const Movement = sequelize.define('Movement', {
  resourceId: { type: D.INTEGER, allowNull: false, references: { model: 'resources', key: 'id' } }, action: string(30, true), quantity: { type: D.INTEGER, allowNull: false }, balance: { type: D.INTEGER, allowNull: false }, recipient: string(150), actorId: D.INTEGER, notes: D.TEXT,
}, { tableName: 'resource_movements' });
export const Audit = sequelize.define('Audit', {
  actorId: D.INTEGER, actorName: string(), action: string(100, true), entity: string(60, true), entityId: string(80), detail: string(255), ip: string(80),
}, { tableName: 'audit_logs', indexes: [{ fields: ['createdAt'] }] });
export const Notice = sequelize.define('Notice', {
  userId: D.INTEGER, audience: string(30), title: string(200, true), message: D.TEXT, url: string(), readAt: D.DATE,
}, { tableName: 'notifications', indexes: [{ fields: ['userId', 'readAt'] }] });
export const RequestEvent = sequelize.define('RequestEvent', {
  requestId: { type: D.INTEGER, allowNull: false, references: { model: 'civil_requests', key: 'id' } }, status: string(40, true), actorName: string(), detail: string(255),
}, { tableName: 'request_events' });
export const CitizenReport = sequelize.define('CitizenReport', {
  userId: { type: D.INTEGER, allowNull: false },
  title: string(200, true),
  description: { type: D.TEXT, allowNull: false },
  status: { ...string(30, true), defaultValue: 'Submitted' },
}, { tableName: 'citizen_reports', indexes: [{ fields: ['userId', 'id'] }, { fields: ['status', 'id'] }] });
export const RequestDraft = sequelize.define('RequestDraft', {
  userId: { type: D.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  documentType: { type: D.STRING(20), allowNull: false },
  payload: { type: D.JSON, allowNull: false },
}, { tableName: 'request_drafts', indexes: [{ fields: ['userId', 'updatedAt'] }] });
export const Session = sequelize.define('Session', {
  sid: { type: D.STRING(128), primaryKey: true }, data: { type: D.TEXT('long'), allowNull: false }, expires: { type: D.DATE, allowNull: false },
}, { tableName: 'sessions', timestamps: false });
export async function initializePlatform() {
  const qi = sequelize.getQueryInterface();
  // Early builds stored notification recipients by email. Add indexed columns
  // before sync tries to create the current userId/readAt index.
  if ((await qi.showAllTables()).includes('notifications')) {
    const notificationColumns = await qi.describeTable('notifications');
    for (const name of ['userId', 'url', 'readAt']) {
      if (!notificationColumns[name]) await qi.addColumn('notifications', name, Notice.rawAttributes[name]);
    }
    if (!notificationColumns.audience.allowNull || notificationColumns.audience.type.startsWith('ENUM')) {
      await qi.changeColumn('notifications', 'audience', Notice.rawAttributes.audience);
    }
    if (notificationColumns.recipientEmail) {
      await sequelize.query('UPDATE notifications n JOIN users u ON n.recipientEmail = u.email SET n.userId = u.id WHERE n.userId IS NULL AND n.recipientEmail IS NOT NULL');
    }
  }
  // Creates missing tables only; never drops or rewrites existing records.
  await sequelize.sync();
  const userColumns = await qi.describeTable('users');
  for (const name of ['username', 'isActive', 'emailVerifiedAt', 'emailVerificationRequired', 'googleSubject', 'verificationTokenHash', 'verificationExpiresAt', 'verificationSentAt']) {
    if (!userColumns[name]) await qi.addColumn('users', name, User.rawAttributes[name]);
  }
  const residentColumns = await qi.describeTable('residents');
  if (!residentColumns.civilStatus) await qi.addColumn('residents', 'civilStatus', Resident.rawAttributes.civilStatus);
  const resourceColumns = await qi.describeTable('resources');
  for (const name of ['location', 'contactNumber', 'employeeStatus']) {
    if (!resourceColumns[name]) await qi.addColumn('resources', name, Resource.rawAttributes[name]);
  }
  // Catalog only locations already present in this installation; never reset existing catalog states.
  const locations = await Resident.findAll({ attributes: ['barangay'], group: ['barangay'], raw: true });
  for (const location of locations) {
    if (location.barangay?.trim()) await Barangay.findOrCreate({ where: { name: location.barangay.trim() } });
  }
  const columns = await qi.describeTable('civil_requests');
  for (const name of ['residentId', 'recordId', 'assignee', 'assigneeUserId', 'office', 'dueAt', 'slaPausedAt', 'notes', 'appointmentDate', 'appointmentStatus', 'rescheduleReason', 'rescheduleRequested', 'paidAt']) {
    if (!columns[name]) await qi.addColumn('civil_requests', name, Request.rawAttributes[name]);
  }
  const requestsWithoutDeadlines = await Request.findAll({
    attributes: ['id', 'documentType', 'createdAt', 'office', 'dueAt'],
    where: { [Op.or]: [{ dueAt: null }, { office: null }] },
  });
  for (const request of requestsWithoutDeadlines) {
    const defaults = requestCaseDefaults(request.documentType, request.createdAt || new Date());
    await request.update({ office: request.office || defaults.office, dueAt: request.dueAt || defaults.dueAt });
  }
  const legacyAssignments = await Request.findAll({
    attributes: ['id', 'assignee'],
    where: { assigneeUserId: null, assignee: { [Op.ne]: null } },
  });
  for (const request of legacyAssignments) {
    const matches = (await User.findAll({ attributes: ['id', 'role'], where: { name: request.assignee, isActive: true } }))
      .filter(user => ['admin', 'staff', 'registrar'].includes(user.role));
    if (matches.length === 1) await request.update({ assigneeUserId: matches[0].id });
  }
}
export { sequelize, User, Request };
