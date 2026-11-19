import express from 'express';
import { Op, literal, fn, col } from 'sequelize';
import { Resident, Barangay, Audit, sequelize } from '../models/Platform.js';
import { requireFeature } from '../middleware/platformSecurity.js';
import { audit, pagination } from '../services/platform.js';
import { csv, fail, integer, civilStatuses, text, date } from '../services/platformRules.js';
import { ageOn, residentLabels, populationInput } from '../services/residentRules.js';

const router = express.Router();
const run = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const fullName = row => [row.firstName, row.middleName, row.lastName].filter(Boolean).join(' ');
const when = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '—';

for (const mode of ['profile', 'print']) router.get(`/admin/residents/:id/${mode}`, requireFeature('residents'), run(async (req, res) => {
  const row = await Resident.findByPk(integer(req.params.id, 'Resident', 1));
  if (!row) fail('Resident not found.', 404);
  await audit(req, mode === 'print' ? 'resident.printed' : 'resident.viewed', 'residents', row.id, mode === 'print' ? 'Printable resident profile opened' : 'Resident profile viewed');
  res.render('residentProfile', { title: 'Resident profile', resident: row.toJSON(), fullName: fullName(row), age: ageOn(row.birthDate), civilStatus: residentLabels[row.civilStatus] || 'Not recorded', sex: residentLabels[row.sex] || 'Not recorded', archived: !!row.archivedAt, registered: when(row.createdAt), updated: when(row.updatedAt), printed: when(new Date()), printMode: mode === 'print' });
}));

router.get('/admin/population', requireFeature('population'), run(async (req, res) => {
  const filters = populationInput(req.query);
  const conditions = [];
  const where = {};
  if (filters.status !== 'all') where.archivedAt = filters.status === 'archived' ? { [Op.ne]: null } : null;
  for (const field of ['barangay', 'sex', 'civilStatus']) if (filters[field]) where[field] = filters[field];
  if (filters.q) conditions.push({ [Op.or]: ['residentCode', 'firstName', 'middleName', 'lastName'].map(field => ({ [field]: { [Op.like]: `%${filters.q}%` } })) });
  const ageExpression = `TIMESTAMPDIFF(YEAR, birthDate, ${sequelize.escape(filters.asOf)})`;
  if (filters.ageMin != null) conditions.push(literal(`${ageExpression} >= ${filters.ageMin}`));
  if (filters.ageMax != null) conditions.push(literal(`${ageExpression} <= ${filters.ageMax}`));
  // Stored timestamps use UTC; registration dates are calendar dates in the Philippines.
  if (filters.from) conditions.push(literal(`createdAt >= CONVERT_TZ(${sequelize.escape(filters.from + ' 00:00:00')}, '+08:00', '+00:00')`));
  if (filters.to) conditions.push(literal(`createdAt < DATE_ADD(CONVERT_TZ(${sequelize.escape(filters.to + ' 00:00:00')}, '+08:00', '+00:00'), INTERVAL 1 DAY)`));
  if (conditions.length) where[Op.and] = conditions;
  const columns = ['Resident ID', 'Full name', 'Birth date', 'Age', 'Sex', 'Civil status', 'Barangay', 'Record status'];
  const cells = row => [row.residentCode, fullName(row), row.birthDate, ageOn(row.birthDate, filters.asOf) ?? '—', residentLabels[row.sex] || 'Not recorded', residentLabels[row.civilStatus] || 'Not recorded', row.barangay, row.archivedAt ? 'Archived' : 'Active'];
  if (req.query.format === 'csv') {
    const count = await Resident.count({ where });
    if (count > 10000) fail('More than 10,000 records match. Narrow the filters before exporting.');
    const rows = await Resident.findAll({ where, order: [['lastName', 'ASC'], ['firstName', 'ASC'], ['id', 'ASC']], limit: 10000 });
    await audit(req, 'report.exported', 'residents', null, `Population CSV exported: ${rows.length} matching residents`);
    return res.attachment('bongabong-registered-residents.csv').type('text/csv').send('\uFEFF' + [csv(columns), ...rows.map(row => csv(cells(row)))].join('\r\n'));
  }
  const page = pagination(req.query);
  const result = await Resident.findAndCountAll({ where, order: [['lastName', 'ASC'], ['firstName', 'ASC'], ['id', 'ASC']], limit: page.limit, offset: page.offset });
  const groups = [];
  for (const field of ['barangay', 'sex', 'civilStatus']) {
    const values = await Resident.findAll({ where, attributes: [field, [fn('COUNT', col('id')), 'total']], group: [field], order: [[field, 'ASC']], raw: true });
    groups.push({ title: field === 'barangay' ? 'By barangay' : field === 'sex' ? 'By sex' : 'By civil status', rows: values.map(row => ({ label: residentLabels[row[field]] || row[field] || 'Not recorded', count: row.total })) });
  }
  const ageGroup = `CASE WHEN ${ageExpression} < 0 THEN 'Not yet born on calculation date' WHEN ${ageExpression} < 18 THEN '0–17' WHEN ${ageExpression} < 60 THEN '18–59' ELSE '60 and above' END`;
  const ages = await Resident.findAll({ where, attributes: [[literal(ageGroup), 'label'], [fn('COUNT', col('id')), 'total']], group: [literal(ageGroup)], raw: true });
  groups.push({ title: 'By age', rows: ages.map(row => ({ label: row.label, count: row.total })) });
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null));
  const pages = Math.max(1, Math.ceil(result.count / page.limit));
  const barangays = await Barangay.findAll({ order: [['name', 'ASC']], raw: true });
  res.render('populationReport', { title: 'Population statistics', filters, columns, count: result.count, groups, rows: result.rows.map(row => ({ id: row.id, cells: cells(row) })), page: page.page, pages, previous: page.page > 1 ? `/admin/population?${params}&page=${page.page - 1}` : null, next: page.page < pages ? `/admin/population?${params}&page=${page.page + 1}` : null, exportUrl: `/admin/population?${params}&format=csv`, barangays: barangays.map(row => ({ name: row.name, selected: row.name === filters.barangay })), statuses: civilStatuses.map(value => ({ value, label: residentLabels[value], selected: value === filters.civilStatus })) });
}));

router.get('/admin/resident-activity', requireFeature('residentActivity'), run(async (req, res) => {
  const q = text(req.query.q, 'Search', false, 100);
  const residentId = req.query.residentId ? integer(req.query.residentId, 'Resident', 1) : null;
  const from = date(req.query.from, 'From date', false, false), to = date(req.query.to, 'Through date', false, false);
  if (from && to && from > to) fail('The end date must be on or after the start date.');
  const where = residentId ? { entity: { [Op.in]: ['resident', 'residents'] }, entityId: String(residentId) } : { entity: { [Op.in]: ['resident', 'residents', 'barangays'] } };
  const conditions = [];
  if (q) conditions.push({ [Op.or]: ['actorName', 'action', 'detail', 'entityId'].map(field => ({ [field]: { [Op.like]: `%${q}%` } })) });
  if (from) conditions.push(literal(`createdAt >= CONVERT_TZ(${sequelize.escape(from + ' 00:00:00')}, '+08:00', '+00:00')`));
  if (to) conditions.push(literal(`createdAt < DATE_ADD(CONVERT_TZ(${sequelize.escape(to + ' 00:00:00')}, '+08:00', '+00:00'), INTERVAL 1 DAY)`));
  if (conditions.length) where[Op.and] = conditions;
  const page = pagination(req.query), result = await Audit.findAndCountAll({ where, ...page, order: [['id', 'DESC']] });
  const params = new URLSearchParams({ q, residentId: residentId || '', from: from || '', to: to || '' });
  const pages = Math.max(1, Math.ceil(result.count / page.limit));
  res.render('residentActivity', { title: 'Resident activity', q, residentId, from, to, count: result.count, rows: result.rows.map(row => ({ time: when(row.createdAt), ...row.toJSON(), url: ['resident', 'residents'].includes(row.entity) && row.entityId ? `/admin/residents/${row.entityId}/profile` : null })), page: page.page, pages, previous: page.page > 1 ? `/admin/resident-activity?${params}&page=${page.page - 1}` : null, next: page.page < pages ? `/admin/resident-activity?${params}&page=${page.page + 1}` : null });
}));
export default router;
