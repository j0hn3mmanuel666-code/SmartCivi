import { Op } from 'sequelize';
import { sequelize, Resident, CivilRecord, Resource, Allocation, Movement, Audit, Notice, RequestEvent, User, Request } from '../models/Platform.js';
import { can, date, fail, integer, residentInput, recordInput, resourceInput, stockChange, text } from './platformRules.js';

export async function audit(req, action, entity, id, detail, transaction) {
  return Audit.create({ actorId: req.session?.user?.id || null, actorName: req.session?.user?.name || 'Unauthenticated', action, entity, entityId: id == null ? null : String(id), detail, ip: req.ip }, { transaction });
}
export async function notifyStaff(feature, title, message, url, transaction) {
  const users = await User.findAll({ attributes: ['id', 'role'], transaction });
  await Notice.bulkCreate(users.filter(user => can(user.role, feature)).map(user => ({ userId: user.id, title, message, url })), { transaction });
}
export async function requestEvent(req, request, detail, transaction) {
  await RequestEvent.create({ requestId: request.id, status: request.status, actorName: req.session?.user?.name, detail }, { transaction });
  const owner = await User.findOne({ where: { email: request.email }, transaction });
  if (owner) await Notice.create({ userId: owner.id, title: `Request #${request.id} updated`, message: `Your ${request.documentType} request is ${request.status}.`, url: `/request/${request.id}`, }, { transaction });
  await audit(req, 'request.updated', 'request', request.id, detail, transaction);
}
export async function saveResident(req, id) {
  const data = residentInput(req.body);
  return sequelize.transaction(async transaction => {
    let resident;
    if (id) {
      resident = await Resident.findByPk(integer(id, 'Resident', 1), { transaction, lock: transaction.LOCK.UPDATE });
      if (!resident || resident.archivedAt) fail('Active resident not found.', 404);
      await resident.update(data, { transaction });
    } else resident = await Resident.create(data, { transaction });
    await audit(req, id ? 'resident.updated' : 'resident.created', 'resident', resident.id, 'Master record saved', transaction);
    return resident;
  });
}
export async function saveRecord(req, id) {
  const data = recordInput(req.body);
  return sequelize.transaction(async transaction => {
    const resident = await Resident.findByPk(data.residentId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!resident || resident.archivedAt) fail('Select an active resident.');
    if (data.eventDate < resident.birthDate) fail('Event date cannot precede the resident birth date.');
    if (data.registeredDate && data.registeredDate < data.eventDate) fail('Registration cannot precede the event.');
    let record;
    if (id) {
      record = await CivilRecord.findByPk(integer(id, 'Record', 1), { transaction, lock: transaction.LOCK.UPDATE });
      if (!record || record.archivedAt) fail('Active civil record not found.', 404);
      if ((record.residentId !== data.residentId || record.type !== data.type) && await Request.count({ where: { recordId: record.id }, transaction })) fail('A linked request uses this record. Its resident and record type cannot be changed.');
      await record.update(data, { transaction });
    } else record = await CivilRecord.create(data, { transaction });
    await audit(req, id ? 'record.updated' : 'record.created', 'civil_record', record.id, `${record.type} record saved`, transaction);
    await notifyStaff('registry', 'Civil registry updated', `A ${record.type} record was ${id ? 'updated' : 'registered'}.`, `/admin/registry/${record.id}`, transaction);
    return record;
  });
}
export async function saveResource(req, id) {
  return sequelize.transaction(async transaction => {
    let resource;
    if (id) {
      resource = await Resource.findByPk(integer(id, 'Resource', 1), { transaction, lock: transaction.LOCK.UPDATE });
      if (!resource || resource.archivedAt) fail('Active resource not found.', 404);
      // Availability only changes through the movement ledger, never through edits.
      const data = resourceInput({ ...req.body, category: resource.category, quantity: resource.category === 'personnel' ? 1 : resource.quantity });
      delete data.quantity;
      await resource.update(data, { transaction });
    } else {
      resource = await Resource.create(resourceInput(req.body), { transaction });
      await Movement.create({ resourceId: resource.id, action: 'opening', quantity: resource.quantity, balance: resource.quantity, actorId: req.session.user.id }, { transaction });
    }
    await audit(req, id ? 'resource.updated' : 'resource.created', 'resource', resource.id, 'Resource saved', transaction);
    if (!id && resource.category === 'supply' && resource.quantity <= resource.minimum) await notifyStaff('resources', 'Low stock alert', `${resource.code} is at or below its stock threshold.`, `/admin/resources/${resource.id}`, transaction);
    return resource;
  });
}
export async function moveResource(req, id) {
  const action = req.body.action;
  const quantity = integer(req.body.quantity, 'Quantity', 1);
  return sequelize.transaction(async transaction => {
    const resource = await Resource.findByPk(integer(id, 'Resource', 1), { transaction, lock: transaction.LOCK.UPDATE });
    if (!resource || resource.archivedAt) fail('Active resource not found.', 404);
    if (action === 'allocate' && resource.condition !== 'serviceable') fail('Only serviceable resources can be allocated.');
    if (['replenish', 'consume'].includes(action) && resource.category === 'personnel') fail('Personnel can only be assigned and returned.');
    if (action === 'consume' && resource.category !== 'supply') fail('Only supplies can be consumed.');
    let allocation;
    let recipient = text(req.body.recipient, 'Recipient', action === 'allocate', 150);
    if (action === 'return') {
      allocation = await Allocation.findByPk(integer(req.body.allocationId, 'Allocation', 1), { transaction, lock: transaction.LOCK.UPDATE });
      if (!allocation || allocation.resourceId !== resource.id) fail('Select an allocation for this resource.');
      recipient = allocation.recipient;
    }
    const balance = stockChange(resource.quantity, action, quantity, allocation ? allocation.quantity - allocation.returned : 0);
    if (action === 'allocate') await Allocation.create({ resourceId: resource.id, recipient, quantity, dueDate: date(req.body.dueDate, 'Due date', false, false), notes: text(req.body.notes, 'Notes', false, 1000) }, { transaction });
    if (allocation) await allocation.update({ returned: allocation.returned + quantity }, { transaction });
    const previous = resource.quantity;
    await resource.update({ quantity: balance }, { transaction });
    await Movement.create({ resourceId: resource.id, action, quantity, balance, recipient, actorId: req.session.user.id, notes: text(req.body.notes, 'Notes', false, 1000) }, { transaction });
    await audit(req, `resource.${action}`, 'resource', resource.id, `${quantity} units; balance ${balance}`, transaction);
    if (resource.category === 'supply' && balance <= resource.minimum && previous > resource.minimum) await notifyStaff('resources', 'Low stock alert', `${resource.code} is at or below its stock threshold.`, `/admin/resources/${resource.id}`, transaction);
    return resource;
  });
}
export function pagination(query) {
  const page = integer(query.page || 1, 'Page', 1);
  return { page, limit: 25, offset: (page - 1) * 25 };
}
export function searchWhere(query, fields) {
  const where = { archivedAt: query.archived === '1' ? { [Op.ne]: null } : null };
  const q = text(query.q, 'Search', false, 100);
  if (q) where[Op.or] = fields.map(field => ({ [field]: { [Op.like]: `%${q.replace(/[\\%_]/g, '\\$&')}%` } }));
  return where;
}
