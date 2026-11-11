import express from 'express';
import { Op, col, where as sqlWhere } from 'sequelize';
import { Resident, CivilRecord, Resource, Allocation, Movement, Audit, Notice, Request, RequestEvent, User, sequelize } from '../models/Platform.js';
import { audit, pagination, searchWhere, saveResident, saveRecord, saveResource, moveResource, requestEvent } from '../services/platform.js';
import { can, csv, date, fail, integer, SYSTEM_TITLE, text, paymentComplete } from '../services/platformRules.js';
import { requireFeature, ownRequest } from '../middleware/platformSecurity.js';

const router = express.Router();
const run = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const plain = row => row.toJSON();
const displayDate = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '—';
const name = resident => `${resident.firstName} ${resident.lastName}`;
const configs = {
  residents: { model: Resident, feature: 'residents', title: 'Residents', singular: 'resident', description: 'One master profile connects each resident to their civil records and transactions.', search: ['residentCode', 'firstName', 'lastName', 'barangay'], columns: ['Resident ID', 'Name', 'Birth date', 'Barangay'], cells: row => [row.residentCode, name(row), row.birthDate, row.barangay], save: saveResident },
  registry: { model: CivilRecord, feature: 'registry', title: 'Civil registry', singular: 'civil record', description: 'Register and maintain birth, marriage, death and other civil records.', search: ['registryNumber', 'type', 'eventPlace'], columns: ['Registry number', 'Resident', 'Type', 'Event date', 'Place'], cells: row => [row.registryNumber, row.Resident ? name(row.Resident) : '—', row.type, row.eventDate, row.eventPlace], save: saveRecord },
  resources: { model: Resource, feature: 'resources', title: 'Resource planning', singular: 'resource', description: 'Coordinate personnel, supplies and equipment across LGU offices.', search: ['code', 'name', 'department', 'category'], columns: ['Code', 'Resource', 'Category', 'Department', 'Available', 'Condition'], cells: row => [row.code, row.name, row.category, row.department, `${row.quantity} ${row.unit}`, row.condition], save: saveResource },
};
const input = (key, label, value, type = 'text', required = false, options = null) => ({ key, label, value: value ?? '', type, required, options: options?.map(option => ({ value: typeof option === 'object' ? String(option.value) : option, label: typeof option === 'object' ? option.label : option.replaceAll('_', ' '), selected: String(typeof option === 'object' ? option.value : option) === String(value) })), isSelect: !!options, isTextarea: type === 'textarea' });
async function fieldsFor(kind, value = {}) {
  if (kind === 'residents') return [input('residentCode', 'Resident ID', value.residentCode, 'text', true), input('firstName', 'First name', value.firstName, 'text', true), input('middleName', 'Middle name', value.middleName), input('lastName', 'Last name', value.lastName, 'text', true), input('birthDate', 'Birth date', value.birthDate, 'date', true), input('sex', 'Sex', value.sex || 'unspecified', 'text', true, ['unspecified', 'female', 'male']), input('barangay', 'Barangay', value.barangay, 'text', true), input('address', 'Street / address', value.address), input('email', 'Email', value.email, 'email'), input('phone', 'Phone', value.phone, 'tel')];
  if (kind === 'registry') {
    const residents = await Resident.findAll({ where: { archivedAt: null, ...(value.residentId ? { id: value.residentId } : { id: -1 }) }, order: [['lastName', 'ASC']] });
    return [input('residentId', 'Resident ID (select from Residents first)', value.residentId, 'text', true, [{ value: '', label: 'Open Residents and choose Register civil record' }, ...residents.map(r => ({ value: r.id, label: `${r.residentCode} · ${name(r)}` }))]), input('type', 'Record type', value.type || 'birth', 'text', true, ['birth', 'marriage', 'death', 'other']), input('registryNumber', 'Registry number', value.registryNumber, 'text', true), input('eventDate', 'Event date', value.eventDate, 'date', true), input('registeredDate', 'Registration date', value.registeredDate, 'date'), input('eventPlace', 'Event place', value.eventPlace || 'Bansud, Oriental Mindoro', 'text', true), input('fatherName', 'Father name', value.fatherName), input('motherName', 'Mother name', value.motherName), input('spouseName', 'Spouse name', value.spouseName), input('notes', 'Notes', value.notes, 'textarea')];
  }
  return [input('code', 'Resource / employee code', value.code, 'text', true), input('name', 'Resource / personnel name', value.name, 'text', true), input('category', 'Category', value.category || 'supply', 'text', true, ['supply', 'equipment', 'personnel', 'other']), input('department', 'Office / department', value.department || 'Municipal Civil Registry', 'text', true), input('position', 'Position (personnel)', value.position), input('unit', 'Unit (person, ream, piece…)', value.unit || 'piece', 'text', true), ...(!value.id ? [input('quantity', 'Opening quantity (1 for personnel)', value.quantity ?? 1, 'number', true)] : []), input('minimum', 'Low stock threshold', value.minimum ?? 0, 'number', true), input('condition', 'Condition', value.condition || 'serviceable', 'text', true, ['serviceable', 'maintenance', 'unserviceable']), input('notes', 'Notes', value.notes, 'textarea')];
}

router.get('/admin', requireFeature('overview'), run(async (req, res) => {
  const role = req.session.user.role;
  const stats = [];
  if (can(role, 'residents')) stats.push({ label: 'Residents', value: await Resident.count({ where: { archivedAt: null } }), url: '/admin/residents' });
  if (can(role, 'registry')) stats.push({ label: 'Civil records', value: await CivilRecord.count({ where: { archivedAt: null } }), url: '/admin/registry' });
  if (can(role, 'requests')) stats.push({ label: 'Pending requests', value: await Request.count({ where: { status: { [Op.in]: ['pending', 'Pending', 'processing'] } } }), url: '/admin/requests' });
  if (can(role, 'resources')) stats.push({ label: 'Resources', value: await Resource.count({ where: { archivedAt: null } }), url: '/admin/resources' });
  const requests = can(role, 'requests') ? await Request.findAll({ order: [['createdAt', 'DESC']], limit: 6, raw: true }) : [];
  const lowStock = can(role, 'resources') ? await Resource.findAll({ where: { archivedAt: null, category: 'supply', [Op.and]: [sqlWhere(col('quantity'), Op.lte, col('minimum'))] }, limit: 8, raw: true }) : [];
  const notices = await Notice.findAll({ where: { userId: req.session.user.id, readAt: null }, order: [['id', 'DESC']], limit: 5, raw: true });
  res.render('platformDashboard', { title: 'Office overview', stats, requests, lowStock, notices });
}));

for (const [kind, config] of Object.entries(configs)) {
  const base = `/admin/${kind}`;
  router.get(base, requireFeature(config.feature), run(async (req, res) => {
    const page = pagination(req.query);
    const where = searchWhere(req.query, kind === 'registry' ? [...config.search, '$Resident.firstName$', '$Resident.lastName$', '$Resident.residentCode$'] : config.search);
    const filter = kind === 'resources' ? 'category' : kind === 'registry' ? 'type' : 'barangay';
    if (req.query.filter) where[filter] = text(req.query.filter, 'Filter', false, 100);
    const result = await config.model.findAndCountAll({ where, ...page, order: [['id', 'DESC']], ...(kind === 'registry' ? { include: [Resident] } : {}) });
    const rows = result.rows.map(row => ({ id: row.id, cells: config.cells(row), url: `${base}/${row.id}`, registerUrl: kind === 'residents' && can(req.session.user.role, 'registry') && !row.archivedAt ? `/admin/registry/new?residentId=${row.id}` : null }));
    const params = new URLSearchParams({ q: req.query.q || '', filter: req.query.filter || '', archived: req.query.archived || '' });
    const pages = Math.max(1, Math.ceil(result.count / page.limit));
    res.render('platformList', { title: config.title, description: config.description, columns: config.columns, rows, count: result.count, page: page.page, pages, previous: page.page > 1 ? `${base}?${params}&page=${page.page - 1}` : null, next: page.page < pages ? `${base}?${params}&page=${page.page + 1}` : null, q: req.query.q, filter: req.query.filter, filterLabel: filter, archived: req.query.archived === '1', base, newUrl: `${base}/new`, singular: config.singular });
  }));
  router.get(`${base}/new`, requireFeature(config.feature), run(async (req, res) => {
    const value = kind === 'registry' && req.query.residentId ? { residentId: integer(req.query.residentId, 'Resident', 1) } : {};
    res.render('platformForm', { title: `Add ${config.singular}`, description: config.description, fields: await fieldsFor(kind, value), action: base, base });
  }));
  router.post(base, requireFeature(config.feature), run(async (req, res) => {
    const row = await config.save(req);
    req.flash('success_msg', `${config.singular} saved.`);
    res.redirect(`${base}/${row.id}`);
  }));
  router.get(`${base}/:id`, requireFeature(config.feature), run(async (req, res) => {
    const row = await config.model.findByPk(integer(req.params.id, 'ID', 1));
    if (!row) fail('Record not found.', 404);
    if (kind === 'resources') {
      const allocationPage = integer(req.query.allocationPage || 1, 'Allocation page', 1);
      const outstanding = await Allocation.findAndCountAll({ where: { resourceId: row.id, [Op.and]: [sqlWhere(col('returned'), Op.lt, col('quantity'))] }, order: [['id', 'ASC']], offset: (allocationPage - 1) * 25, limit: 25 });
      const allocations = outstanding.rows.map(a => ({ ...a.toJSON(), outstanding: a.quantity - a.returned }));
      const movements = (await Movement.findAll({ where: { resourceId: row.id }, order: [['id', 'DESC']], limit: 50 })).map(m => ({ ...m.toJSON(), when: displayDate(m.createdAt) }));
      return res.render('resourceDetail', { title: row.name, resource: row.toJSON(), allocations, allocationCount: outstanding.count, allocationNext: outstanding.count > allocationPage * 25 ? `${base}/${row.id}?allocationPage=${allocationPage + 1}` : null, allocationPrevious: allocationPage > 1 ? `${base}/${row.id}?allocationPage=${allocationPage - 1}` : null, movements, base, fields: await fieldsFor(kind, row.toJSON()), action: `${base}/${row.id}` });
    }
    const related = kind === 'residents' && can(req.session.user.role, 'registry') ? (await CivilRecord.findAll({ where: { residentId: row.id }, order: [['id', 'DESC']], limit: 30 })).map(r => ({ label: `${r.registryNumber} · ${r.type}${r.archivedAt ? ' (archived)' : ''}`, url: `/admin/registry/${r.id}` })) : [];
    res.render('platformForm', { title: `Edit ${config.singular}`, fields: await fieldsFor(kind, row.toJSON()), action: `${base}/${row.id}`, base, existing: true, archived: !!row.archivedAt, related, registerUrl: kind === 'residents' && can(req.session.user.role, 'registry') && !row.archivedAt ? `/admin/registry/new?residentId=${row.id}` : null });
  }));
  router.post(`${base}/:id`, requireFeature(config.feature), run(async (req, res) => { await config.save(req, req.params.id); req.flash('success_msg', 'Changes saved.'); res.redirect(`${base}/${req.params.id}`); }));
  router.post(`${base}/:id/archive`, requireFeature(config.feature), run(async (req, res) => {
    await sequelize.transaction(async transaction => {
      const row = await config.model.findByPk(integer(req.params.id, 'ID', 1), { transaction, lock: transaction.LOCK.UPDATE });
      if (!row) fail('Record not found.', 404);
      if (kind === 'registry' && row.archivedAt) {
        const resident = await Resident.findByPk(row.residentId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!resident || resident.archivedAt) fail('Restore the parent resident before restoring this civil record.');
      }
      if (kind === 'residents' && !row.archivedAt && await CivilRecord.count({ where: { residentId: row.id, archivedAt: null }, transaction })) fail('Archive the linked active civil records before archiving this resident.');
      if (kind === 'resources' && !row.archivedAt && await Allocation.count({ where: { resourceId: row.id, [Op.and]: [sqlWhere(col('returned'), Op.lt, col('quantity'))] }, transaction })) fail('Return outstanding allocations before archiving this resource.');
      await row.update({ archivedAt: row.archivedAt ? null : new Date() }, { transaction });
      await audit(req, row.archivedAt ? 'record.archived' : 'record.restored', kind, row.id, 'Archive state changed', transaction);
    });
    req.flash('success_msg', 'Archive state updated.'); res.redirect(base);
  }));
}
router.post('/admin/resources/:id/move', requireFeature('resources'), run(async (req, res) => { await moveResource(req, req.params.id); req.flash('success_msg', 'Resource movement recorded.'); res.redirect(`/admin/resources/${req.params.id}`); }));

router.get('/admin/reports', requireFeature('reports'), run(async (req, res) => {
  const role = req.session.user.role;
  const reportConfigs = { ...configs,
    allocations: { model: Allocation, feature: 'resources', title: 'Resource allocations', columns: ['Resource', 'Recipient', 'Allocated', 'Returned', 'Outstanding', 'Due date'], cells: row => [row.Resource?.code, row.recipient, row.quantity, row.returned, row.quantity - row.returned, row.dueDate] },
    movements: { model: Movement, feature: 'resources', title: 'Resource usage and stock movements', columns: ['Resource', 'Movement', 'Quantity', 'Balance after', 'Recipient', 'Date'], cells: row => [row.Resource?.code, row.action, row.quantity, row.balance, row.recipient, displayDate(row.createdAt)] },
  };
  const options = Object.entries(reportConfigs).filter(([, config]) => can(role, config.feature)).map(([value, config]) => ({ value, label: config.title }));
  if (can(role, 'requests')) options.push({ value: 'requests', label: 'Document requests' });
  const dataset = req.query.dataset || options[0]?.value;
  if (!options.some(option => option.value === dataset)) fail('Your role cannot export this dataset.', 403);
  const config = reportConfigs[dataset];
  const model = config?.model || Request;
  const where = {};
  if (model.rawAttributes.archivedAt) where.archivedAt = null;
  const from = date(req.query.from, 'From date', false, false), to = date(req.query.to, 'To date', false, false);
  if (from && to && from > to) fail('From date must be before the end date.');
  if (from || to) where.createdAt = { ...(from ? { [Op.gte]: `${from}T00:00:00+08:00` } : {}), ...(to ? { [Op.lt]: new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000) } : {}) };
  const count = await model.count({ where });
  const rows = await model.findAll({ where, ...(dataset === 'registry' ? { include: [Resident] } : dataset === 'allocations' ? { include: [Resource] } : {}), order: [['id', 'DESC']], limit: req.query.format === 'csv' ? 10000 : 100 });
  if (dataset === 'movements') {
    const resources = await Resource.findAll({ where: { id: { [Op.in]: [...new Set(rows.map(row => row.resourceId))] } }, attributes: ['id', 'code'] });
    const byId = new Map(resources.map(resource => [resource.id, resource]));
    for (const row of rows) row.Resource = byId.get(row.resourceId);
  }
  const columns = config?.columns || ['Request ID', 'Name', 'Document', 'Status', 'Created'];
  const cells = row => config ? config.cells(row) : [row.id, row.fullName, row.documentType, row.status, displayDate(row.createdAt)];
  if (req.query.format === 'csv') {
    if (count > 10000) fail('This export exceeds 10,000 records. Narrow the date range.');
    await audit(req, 'report.exported', dataset, null, `${rows.length} rows exported`);
    return res.type('text/csv').attachment(`SmartCivi-${dataset}.csv`).send('\uFEFF' + [csv(columns), ...rows.map(row => csv(cells(row)))].join('\r\n'));
  }
  const params = new URLSearchParams({ dataset, from: from || '', to: to || '', format: 'csv' });
  res.render('platformReports', { title: 'Reports and analytics', options: options.map(option => ({ ...option, selected: option.value === dataset })), columns, rows: rows.map(row => ({ cells: cells(row) })), count, from, to, exportUrl: `/admin/reports?${params}`, truncated: count > 100 });
}));
router.get('/admin/analytics', requireFeature('reports'), (req, res) => res.redirect('/admin/reports'));
router.post('/request/:id/process-payment', ownRequest, run(async (req, res) => {
  const method = req.body.paymentMethod;
  if (!['online', 'otc', 'bank'].includes(method)) fail('Choose a supported payment method.');
  await sequelize.transaction(async transaction => {
    const request = await Request.findByPk(integer(req.params.id, 'Request', 1), { transaction, lock: transaction.LOCK.UPDATE });
    if (request.status !== 'approved' || paymentComplete(request)) fail('This request is not ready for another payment.');
    await request.update({ status: method === 'online' ? 'paid' : 'payment_pending', paidAt: method === 'online' ? new Date() : null, paymentMethod: method, paymentReference: `PAY-${Date.now()}-${request.id}`, paymentAmount: request.documentType === 'marriage' ? 210 : 155 }, { transaction });
    await requestEvent(req, request, method === 'online' ? 'Demonstration payment recorded; no funds transferred' : 'Payment reference generated; awaiting office verification', transaction);
  });
  req.flash('success_msg', method === 'online' ? 'Demonstration payment recorded. No funds were transferred.' : 'Payment reference generated. Confirm payment instructions with the LGU office.');
  res.redirect(`/request/${req.params.id}`);
}));
router.get('/admin/requests', requireFeature('requests'), run(async (req, res) => {
  const page = pagination(req.query), where = {};
  const q = text(req.query.q, 'Search', false, 100);
  if (q) where[Op.or] = ['fullName', 'email', 'documentType'].map(field => ({ [field]: { [Op.like]: `%${q.replace(/[\\%_]/g, '\\$&')}%` } }));
  if (req.query.filter) where.status = text(req.query.filter, 'Status filter', false, 30);
  const result = await Request.findAndCountAll({ where, ...page, order: [['id', 'DESC']] });
  const params = new URLSearchParams({ q: q || '', filter: req.query.filter || '' });
  res.render('platformList', { title: 'Document requests', description: 'Review requests, assign personnel, verify linked records and track each processing step.', columns: ['Request', 'Client', 'Document', 'Status', 'Assigned to', 'Submitted'], rows: result.rows.map(row => ({ cells: [`#${row.id}`, row.fullName, row.documentType, row.status, row.assignee || 'Unassigned', displayDate(row.createdAt)], url: `/admin/requests/${row.id}` })), count: result.count, base: '/admin/requests', filterLabel: 'status', filter: req.query.filter, q, page: page.page, pages: Math.max(1, Math.ceil(result.count / page.limit)), previous: page.page > 1 ? `/admin/requests?${params}&page=${page.page - 1}` : null, next: result.count > page.offset + page.limit ? `/admin/requests?${params}&page=${page.page + 1}` : null });
}));
async function appointmentsPage(req, res) {
  if (!req.session.user) return res.redirect('/login');
  const staffView = req.path === '/admin/appointments';
  const page = pagination(req.query);
  const result = await Request.findAndCountAll({ where: { appointmentDate: { [Op.ne]: null }, ...(!staffView ? { email: req.session.user.email } : {}) }, ...page, order: [['appointmentDate', 'ASC']] });
  res.render('platformAppointments', { title: staffView ? 'Manage appointments' : 'My appointments', staffView, appointments: result.rows.map(row => ({ ...row.toJSON(), when: displayDate(row.appointmentDate), appointmentStatus: row.appointmentStatus || 'scheduled', dateValue: new Date(new Date(row.appointmentDate).getTime() + 8 * 3600000).toISOString().slice(0, 16) })), count: result.count, next: result.count > page.offset + page.limit ? `${req.path}?page=${page.page + 1}` : null, previous: page.page > 1 ? `${req.path}?page=${page.page - 1}` : null });
}
router.get('/admin/appointments', requireFeature('requests'), run(appointmentsPage));
router.get('/my-appointments', run(appointmentsPage));
router.post('/admin/appointments/:id/status', requireFeature('requests'), run(async (req, res) => {
  const status = req.body.status;
  if (!['scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled'].includes(status)) fail('Choose a valid appointment status.');
  await sequelize.transaction(async transaction => {
    const request = await Request.findByPk(integer(req.params.id, 'Appointment', 1), { transaction, lock: transaction.LOCK.UPDATE });
    if (!request?.appointmentDate) fail('Appointment not found.', 404);
    let appointmentDate = request.appointmentDate;
    if (req.body.appointmentDate) {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(req.body.appointmentDate)) fail('Enter a valid appointment date and time.');
      appointmentDate = new Date(`${req.body.appointmentDate}:00+08:00`);
      if (!Number.isFinite(appointmentDate.getTime()) || (appointmentDate.getTime() !== new Date(request.appointmentDate).getTime() && appointmentDate < new Date())) fail('Choose a future appointment date.');
    }
    await request.update({ appointmentStatus: status, appointmentDate, notes: text(req.body.notes, 'Appointment notes', false, 3000), rescheduleRequested: false }, { transaction });
    await requestEvent(req, request, `Appointment ${status}; ${displayDate(appointmentDate)}`, transaction);
  });
  req.flash('success_msg', 'Appointment updated. Document processing status is unchanged.');
  res.redirect('/admin/appointments');
}));
router.post('/appointments/:id/reschedule', ownRequest, run(async (req, res) => {
  if (!req.ownedRequest.appointmentDate) fail('Appointment not found.', 404);
  await sequelize.transaction(async transaction => {
    const request = await Request.findByPk(req.ownedRequest.id, { transaction, lock: transaction.LOCK.UPDATE });
    await request.update({ rescheduleRequested: true, rescheduleReason: text(req.body.rescheduleReason, 'Reason', true, 1000) }, { transaction });
    await requestEvent(req, request, 'Appointment reschedule requested', transaction);
    const { notifyStaff } = await import('../services/platform.js');
    await notifyStaff('requests', 'Appointment reschedule requested', `Review request #${request.id}.`, '/admin/appointments', transaction);
  });
  req.flash('success_msg', 'Your reschedule request was sent to the office.');
  res.redirect('/my-appointments');
}));
router.get('/admin/requests/:id', requireFeature('requests'), run(async (req, res) => {
  const request = await Request.findByPk(integer(req.params.id, 'Request', 1));
  if (!request) fail('Request not found.', 404);
  const staff = (await User.findAll({ attributes: ['name', 'role'], order: [['name', 'ASC']] })).filter(user => can(user.role, 'requests')).map(user => ({ name: user.name, selected: user.name === request.assignee }));
  const events = (await RequestEvent.findAll({ where: { requestId: request.id }, order: [['id', 'DESC']], limit: 100 })).map(event => ({ ...event.toJSON(), when: displayDate(event.createdAt) }));
  res.render('requestReview', { title: `Review request #${request.id}`, request: request.toJSON(), staff, events });
}));
router.post('/admin/requests/:id/link', requireFeature('registry'), run(async (req, res) => {
  await sequelize.transaction(async transaction => {
    const request = await Request.findByPk(integer(req.params.id, 'Request', 1), { transaction, lock: transaction.LOCK.UPDATE });
    if (!request) fail('Request not found.', 404);
    const residentId = integer(req.body.residentId, 'Resident database ID', 1);
    const resident = await Resident.findByPk(residentId, { transaction });
    if (!resident || resident.archivedAt) fail('Choose an active resident.');
    let recordId = null;
    if (req.body.recordId) {
      const record = await CivilRecord.findByPk(integer(req.body.recordId, 'Civil record database ID', 1), { transaction });
      if (!record || record.archivedAt || record.residentId !== residentId || record.type !== request.documentType) fail('The civil record must belong to this resident and match the requested document type.');
      recordId = record.id;
    }
    await request.update({ residentId, recordId }, { transaction });
    await requestEvent(req, request, 'Resident and civil-record references verified by registry staff', transaction);
  });
  req.flash('success_msg', 'Verified records linked.'); res.redirect(`/admin/requests/${req.params.id}`);
}));
router.get('/api', requireFeature('overview'), (req, res) => res.render('platformApi', { title: 'API documentation' }));
router.get('/reports', requireFeature('reports'), (req, res) => res.redirect('/admin/reports'));
router.post('/reports/generate', requireFeature('reports'), (req, res) => {
  if (!can(req.session.user.role, 'requests')) return res.status(403).send('This role cannot export document requests.');
  res.redirect(`/admin/reports?${new URLSearchParams({ dataset: 'requests', from: req.body.startDate || '', to: req.body.endDate || '', format: req.body.format === 'csv' ? 'csv' : '' })}`);
});
router.get('/admin/records', requireFeature('registry'), (req, res) => res.redirect('/admin/registry'));
router.get('/admin/records/new', requireFeature('registry'), (req, res) => res.redirect('/admin/registry/new'));
router.get('/admin/audit', requireFeature('audit'), run(async (req, res) => {
  const page = pagination(req.query);
  const where = req.query.q ? { action: { [Op.like]: `%${text(req.query.q, 'Search', false, 100)}%` } } : {};
  const result = await Audit.findAndCountAll({ where, ...page, order: [['id', 'DESC']] });
  res.render('platformList', { title: 'Audit history', description: 'Accountability for sign-ins, record changes, exports and resource movements. Times are shown in Philippine time.', columns: ['Time', 'Actor', 'Action', 'Entity', 'Reference', 'Detail'], rows: result.rows.map(row => ({ cells: [displayDate(row.createdAt), row.actorName, row.action, row.entity, row.entityId, row.detail] })), count: result.count, q: req.query.q, page: page.page, pages: Math.max(1, Math.ceil(result.count / page.limit)), base: '/admin/audit', next: result.count > page.offset + page.limit ? `/admin/audit?page=${page.page + 1}&q=${encodeURIComponent(req.query.q || '')}` : null, previous: page.page > 1 ? `/admin/audit?page=${page.page - 1}&q=${encodeURIComponent(req.query.q || '')}` : null });
}));
router.get('/dashboard/notifications', run(async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const page = pagination(req.query);
  const result = await Notice.findAndCountAll({ where: { userId: req.session.user.id }, ...page, order: [['id', 'DESC']] });
  res.render('platformNotices', { title: 'Notifications', notices: result.rows.map(row => ({ ...row.toJSON(), when: displayDate(row.createdAt) })), next: result.count > page.offset + page.limit ? `/dashboard/notifications?page=${page.page + 1}` : null, previous: page.page > 1 ? `/dashboard/notifications?page=${page.page - 1}` : null });
}));
router.get('/dashboard/my-requests', run(async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const page = pagination(req.query), where = { email: req.session.user.email };
  const q = text(req.query.q, 'Search', false, 100);
  if (q) where[Op.or] = ['documentType', 'status'].map(field => ({ [field]: { [Op.like]: `%${q.replace(/[\\%_]/g, '\\$&')}%` } }));
  const result = await Request.findAndCountAll({ where, ...page, order: [['id', 'DESC']] });
  res.render('platformList', { title: 'My requests', base: '/dashboard/my-requests', q, description: 'Follow the progress of your document requests. Only requests submitted with your account are shown.', columns: ['Request', 'Document', 'Status', 'Submitted'], rows: result.rows.map(row => ({ cells: [`#${row.id}`, row.documentType, row.status, displayDate(row.createdAt)], url: `/request/${row.id}` })), count: result.count, page: page.page, pages: Math.max(1, Math.ceil(result.count / page.limit)), next: result.count > page.page * page.limit ? `/dashboard/my-requests?page=${page.page + 1}` : null, previous: page.page > 1 ? `/dashboard/my-requests?page=${page.page - 1}` : null });
}));
router.get('/dashboard/profile', (req, res) => req.session.user ? res.render('platformProfile', { title: 'My profile' }) : res.redirect('/login'));
router.get('/help', (req, res) => res.render('platformHelp', { title: 'Help and office guidance' }));
router.post('/dashboard/notifications/:id/read', run(async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  await Notice.update({ readAt: new Date() }, { where: { id: integer(req.params.id, 'Notification', 1), userId: req.session.user.id } });
  res.redirect('/dashboard/notifications');
}));
router.get('/admin/operations', requireFeature('operations'), run(async (req, res) => {
  await sequelize.authenticate();
  const [tables] = await sequelize.query('SHOW TABLE STATUS');
  const lastBackup = await Audit.findOne({ where: { action: 'backup.completed' }, order: [['id', 'DESC']] });
  res.render('platformOperations', { title: 'System operations', operations: true, tables: tables.map(table => ({ name: table.Name, rows: table.Rows, bytes: Number(table.Data_length) + Number(table.Index_length) })), uptime: Math.floor(process.uptime() / 60), database: 'Connected', backupConfigured: !!process.env.BACKUP_KEY, lastBackup: displayDate(lastBackup?.createdAt), secureCookies: process.env.COOKIE_SECURE === 'true', memory: Math.round(process.memoryUsage().rss / 1048576) });
}));
router.get('/admin/integrations', requireFeature('operations'), (req, res) => res.render('platformOperations', { title: 'Integration readiness', integrations: true, connections: [
  { name: 'Internal module access', status: 'Available', detail: 'One authenticated session across registry, requests and resource planning; permissions are checked on every request.' },
  { name: 'JSON API gateway', status: 'Available', detail: 'Session-authenticated /api/v1 endpoints use the same office roles. See API documentation.' },
  { name: 'SOAP / WSDL service', status: 'Available', detail: 'Authenticated civil-record lookup by registry number. WSDL at /api/v1/registry-soap?wsdl.' },
  ...['Identity-provider SSO', 'National ID verification', 'Police / Fire / Social Welfare', 'Payroll and finance synchronization', 'SMS / mobile push', 'Hybrid hosting / replication'].map(name => ({ name, status: 'Not connected', detail: 'Requires an approved provider, access credentials and deployment configuration. No live exchange is claimed.' })),
] }));
router.get('/api/v1/summary', requireFeature('overview'), run(async (req, res) => {
  const role = req.session.user.role;
  const result = { system: SYSTEM_TITLE, office: 'Bansud, Oriental Mindoro' };
  for (const [key, config] of Object.entries(configs)) if (can(role, config.feature)) result[key] = await config.model.count({ where: { archivedAt: null } });
  if (can(role, 'requests')) result.requests = await Request.count();
  res.json(result);
}));
for (const [kind, config] of Object.entries(configs)) {
  router.get(`/api/v1/${kind}`, requireFeature(config.feature), run(async (req, res) => {
    const { count, rows } = await config.model.findAndCountAll({ where: searchWhere(req.query, config.search), ...pagination(req.query), order: [['id', 'DESC']] });
    res.json({ count, page: pagination(req.query).page, records: rows.map(plain) });
  }));
  router.post(`/api/v1/${kind}`, requireFeature(config.feature), run(async (req, res) => res.status(201).json((await config.save(req)).toJSON())));
  router.post(`/api/v1/${kind}/:id`, requireFeature(config.feature), run(async (req, res) => res.json((await config.save(req, req.params.id)).toJSON())));
}
router.post('/api/v1/resources/:id/move', requireFeature('resources'), run(async (req, res) => res.json((await moveResource(req, req.params.id)).toJSON())));
router.get('/api/v1/registry-soap', requireFeature('registry'), (req, res) => res.type('application/xml').send(`<?xml version="1.0"?><definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:tns="urn:smartcivi" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" targetNamespace="urn:smartcivi"><types><xsd:schema targetNamespace="urn:smartcivi"><xsd:element name="LookupRecord"><xsd:complexType><xsd:sequence><xsd:element name="registryNumber" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element><xsd:element name="LookupRecordResponse"><xsd:complexType><xsd:sequence><xsd:element name="type" type="xsd:string"/><xsd:element name="eventDate" type="xsd:date"/></xsd:sequence></xsd:complexType></xsd:element></xsd:schema></types><message name="LookupInput"><part name="parameters" element="tns:LookupRecord"/></message><message name="LookupOutput"><part name="parameters" element="tns:LookupRecordResponse"/></message><portType name="RegistryPort"><operation name="LookupRecord"><input message="tns:LookupInput"/><output message="tns:LookupOutput"/></operation></portType><binding name="RegistryBinding" type="tns:RegistryPort"><soap:binding transport="http://schemas.xmlsoap.org/soap/http"/><operation name="LookupRecord"><soap:operation soapAction="urn:smartcivi/LookupRecord"/><input><soap:body use="literal"/></input><output><soap:body use="literal"/></output></operation></binding><service name="SmartCiviRegistry"><port name="Registry" binding="tns:RegistryBinding"><soap:address location="${process.env.PUBLIC_ORIGIN || 'http://localhost:3000'}/api/v1/registry-soap"/></port></service></definitions>`));
router.post('/api/v1/registry-soap', requireFeature('registry'), express.text({ type: ['text/xml', 'application/soap+xml'], limit: '16kb' }), run(async (req, res) => {
  const body = req.body;
  if (typeof body !== 'string' || /<!DOCTYPE|<!ENTITY/i.test(body)) fail('Unsupported SOAP envelope.');
  // Deliberately narrow SOAP contract; no entity expansion or general XML parser.
  const encoded = body.match(/<(?:[\w]+:)?registryNumber(?:\s[^>]*)?>([^<]{1,480})<\/(?:[\w]+:)?registryNumber>/)?.[1];
  if (!encoded || /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(encoded) || !/<(?:[\w]+:)?LookupRecord[\s>]/.test(body)) fail('Supply LookupRecord with a valid XML text registryNumber.');
  const value = text(encoded.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, (_match, entity) => {
    const known = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (known[entity]) return known[entity];
    const point = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (point < 32 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) fail('Invalid XML character.');
    return String.fromCodePoint(point);
  }), 'Registry number', true, 80);
  const record = await CivilRecord.findOne({ where: { registryNumber: value.toUpperCase(), archivedAt: null } });
  await audit(req, 'soap.lookup', 'civil_record', record?.id, record ? 'Record located' : 'No match');
  const payload = record ? `<LookupRecordResponse xmlns="urn:smartcivi"><type>${record.type}</type><eventDate>${record.eventDate}</eventDate></LookupRecordResponse>` : '<soap:Fault><faultcode>soap:Client</faultcode><faultstring>Record not found</faultstring></soap:Fault>';
  res.status(record ? 200 : 404).type('text/xml').send(`<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${payload}</soap:Body></soap:Envelope>`);
}));
router.use((error, req, res, next) => {
  if (!req.path.startsWith('/admin') && !req.path.startsWith('/api/v1') && !req.path.startsWith('/dashboard/notifications')) return next(error);
  let status = error.status || 500, message = error.message;
  if (error.name === 'SequelizeUniqueConstraintError') { status = 409; message = 'This identifier or resident name and birth date already exists. Search existing records before adding another.'; }
  else if (error.name === 'SequelizeForeignKeyConstraintError') { status = 400; message = 'A linked record is unavailable. Reload the page and choose an active record.'; }
  else if (status >= 500) { console.error('Platform error:', error); message = 'The operation could not be completed. Your changes were not saved. Please try again.'; }
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: message });
  res.status(status).render('platformError', { title: 'Unable to complete this action', message });
});
export default router;

