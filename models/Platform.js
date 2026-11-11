import { DataTypes as D } from 'sequelize';
import { sequelize } from './db.js';
import { User } from './userModel.js';
import { Request } from './Request.js';
const string = (size = 255, required = false) => ({ type: D.STRING(size), allowNull: !required });
export const Resident = sequelize.define('Resident', {
  residentCode: { ...string(50, true), unique: true }, firstName: string(100, true), middleName: string(100), lastName: string(100, true), birthDate: { type: D.DATEONLY, allowNull: false }, sex: string(20, true), barangay: string(100, true), address: string(), email: string(), phone: string(40), archivedAt: D.DATE,
}, { tableName: 'residents', indexes: [{ fields: ['lastName', 'firstName', 'birthDate'], unique: true }] });
export const CivilRecord = sequelize.define('CivilRecord', {
  residentId: { type: D.INTEGER, allowNull: false, references: { model: 'residents', key: 'id' } }, type: string(20, true), registryNumber: { ...string(80, true), unique: true }, eventDate: { type: D.DATEONLY, allowNull: false }, registeredDate: D.DATEONLY, eventPlace: string(255, true), fatherName: string(), motherName: string(), spouseName: string(), notes: D.TEXT, archivedAt: D.DATE,
}, { tableName: 'civil_records' });
CivilRecord.belongsTo(Resident, { foreignKey: 'residentId', onDelete: 'RESTRICT' });
export const Resource = sequelize.define('Resource', {
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
export const Session = sequelize.define('Session', {
  sid: { type: D.STRING(128), primaryKey: true }, data: { type: D.TEXT('long'), allowNull: false }, expires: { type: D.DATE, allowNull: false },
}, { tableName: 'sessions', timestamps: false });
export async function initializePlatform() {
  // Creates missing tables only; never drops or rewrites existing records.
  await sequelize.sync();
  const qi = sequelize.getQueryInterface();
  const columns = await qi.describeTable('civil_requests');
  for (const name of ['residentId', 'recordId', 'assignee', 'notes', 'appointmentDate', 'appointmentStatus', 'rescheduleReason', 'rescheduleRequested', 'paidAt']) {
    if (!columns[name]) await qi.addColumn('civil_requests', name, Request.rawAttributes[name]);
  }
}
export { sequelize, User, Request };
