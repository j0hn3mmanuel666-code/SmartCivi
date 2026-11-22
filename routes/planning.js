import express from 'express';
import { Resource } from '../models/Platform.js';
import { BudgetItem } from '../models/Planning.js';
import { requireFeature } from '../middleware/platformSecurity.js';
import { csv, fail, integer } from '../services/platformRules.js';
import { audit, pagination, searchWhere } from '../services/platform.js';
import { archivePlanning, currentFiscalYear, enforceExportLimit, fiscalYearInput, formatCents, moneyCents, peso, planningSummary, saveBudget, savePersonnel } from '../services/planning.js';

const router = express.Router();
const run = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const csvResponse = (res, name, columns, rows) => res.type('text/csv').attachment(`${name}.csv`).send('\uFEFF' + [csv(columns), ...rows.map(csv)].join('\r\n'));
const configs = {
  budget: { model: BudgetItem, feature: 'budget', title: 'Budget management', singular: 'budget item', search: ['department', 'item'], save: saveBudget, columns: ['Department', 'Item', 'Fiscal year', 'Allocated (PHP)', 'Spent (PHP)', 'Remaining (PHP)'], cells: row => [row.department, row.item, row.fiscalYear, row.allocated, row.spent, formatCents(moneyCents(row.allocated) - moneyCents(row.spent))] },
  personnel: { model: Resource, feature: 'personnel', title: 'Personnel management', singular: 'employee', search: ['code', 'name', 'position', 'department', 'contactNumber'], save: savePersonnel, columns: ['Employee code', 'Full name', 'Position', 'Department', 'Contact number', 'Status', 'Available for assignment'], cells: row => [row.code, row.name, row.position, row.department, row.contactNumber, row.employeeStatus, row.archivedAt ? 'Archived' : row.employeeStatus === 'on_leave' ? 'On leave' : row.employeeStatus !== 'active' ? 'Inactive' : !['serviceable', 'good', 'fair'].includes(row.condition) ? 'Unavailable condition' : row.quantity > 0 ? 'Yes' : 'Assigned'] },
};
for (const [kind, config] of Object.entries(configs)) {
  const base = `/admin/${kind}`;
  router.get(base, requireFeature(config.feature), run(async (req, res) => {
    const page = pagination(req.query);
    const where = searchWhere(req.query, config.search);
    const fiscalYear = kind === 'budget' ? fiscalYearInput(req.query.fiscalYear || currentFiscalYear()) : null;
    if (kind === 'personnel') where.category = 'personnel';
    else where.fiscalYear = fiscalYear;
    const exporting = req.query.format === 'csv' || req.query.print === '1';
    const count = await config.model.count({ where });
    if (exporting) enforceExportLimit(count);
    const rows = await config.model.findAll({ where, limit: exporting ? 10000 : page.limit, ...(exporting ? {} : { offset: page.offset }), order: [['id', 'DESC']] });
    const result = { count, rows };
    if (req.query.format === 'csv') {
      await audit(req, 'report.exported', kind, null, `${count} records exported as CSV`);
      return csvResponse(res, kind, config.columns, rows.map(config.cells));
    }
    const params = new URLSearchParams({ q: req.query.q || '', archived: req.query.archived || '', ...(fiscalYear ? { fiscalYear: String(fiscalYear) } : {}) });
    const pages = Math.max(1, Math.ceil(result.count / page.limit));
    res.render(kind === 'budget' ? 'planningBudget' : 'planningPersonnel', { title: config.title, base, singular: config.singular, columns: config.columns, rows: result.rows.map(row => ({ id: row.id, cells: config.cells(row).map((value, index) => kind === 'budget' && index >= 3 ? peso(value) : value) })), count: result.count, page: page.page, pages, q: req.query.q, archived: req.query.archived === '1', fiscalYear, csvUrl: `${base}?${params}&format=csv`, printUrl: `${base}?${params}&print=1`, print: req.query.print === '1', previous: page.page > 1 ? `${base}?${params}&page=${page.page - 1}` : null, next: page.page < pages ? `${base}?${params}&page=${page.page + 1}` : null });
  }));
  router.get(`${base}/new`, requireFeature(config.feature), (req, res) => res.render(kind === 'budget' ? 'planningBudgetForm' : 'planningPersonnelForm', { title: `Add ${config.singular}`, base, action: base, value: { fiscalYear: currentFiscalYear(), spent: '0.00', employeeStatus: 'active' } }));
  router.post(base, requireFeature(config.feature), run(async (req, res) => { const row = await config.save(req); req.flash('success_msg', 'Record saved.'); res.redirect(`${base}/${row.id}`); }));
  router.get(`${base}/:id`, requireFeature(config.feature), run(async (req, res) => {
    const row = await config.model.findByPk(integer(req.params.id, 'Record', 1));
    if (!row || (kind === 'personnel' && row.category !== 'personnel')) fail('Record not found.', 404);
    res.render(kind === 'budget' ? 'planningBudgetForm' : 'planningPersonnelForm', { title: `Edit ${config.singular}`, base, action: `${base}/${row.id}`, value: row.toJSON(), existing: true, archived: !!row.archivedAt });
  }));
  router.post(`${base}/:id`, requireFeature(config.feature), run(async (req, res) => { await config.save(req, req.params.id); req.flash('success_msg', 'Changes saved.'); res.redirect(`${base}/${req.params.id}`); }));
  router.post(`${base}/:id/archive`, requireFeature(config.feature), run(async (req, res) => { await archivePlanning(req, kind, req.params.id); req.flash('success_msg', 'Archive state updated. History retained.'); res.redirect(base); }));
}
router.get('/admin/planning-reports', requireFeature('planningReports'), run(async (req, res) => {
  const fiscalYear = fiscalYearInput(req.query.fiscalYear || currentFiscalYear());
  if (req.query.format === 'csv' || req.query.print === '1') {
    const sourceCounts = await Promise.all([Resource.count({ where: { archivedAt: null } }), BudgetItem.count({ where: { archivedAt: null, fiscalYear } })]);
    enforceExportLimit(sourceCounts[0] + sourceCounts[1]);
  }
  const categories = (await Resource.count({ where: { archivedAt: null }, group: ['category'] })).sort((a, b) => a.category.localeCompare(b.category));
  const activePersonnel = await Resource.count({ where: { archivedAt: null, category: 'personnel', employeeStatus: 'active' } });
  const departments = await planningSummary(fiscalYear);
  if (req.query.format === 'csv') {
    await audit(req, 'report.exported', 'planning_reports', null, `Fiscal year ${fiscalYear}; ${categories.length} resource categories and ${departments.length} departments exported as CSV`);
    return csvResponse(res, `planning-${fiscalYear}`, ['Section', 'Category / department', 'Records / allocated PHP', 'Spent PHP', 'Remaining PHP', 'Used %', 'Over budget'], [...categories.map(row => ['Resources', row.category, row.count, '', '', '', '']), ['Personnel', 'Active employees', activePersonnel, '', '', '', ''], ...departments.map(row => ['Budget', row.department, row.allocated, row.spent, row.remaining, row.usedPercent, row.overBudget ? 'Yes' : 'No'])]);
  }
  res.render('planningReport', { title: 'Planning reports', fiscalYear, categories, activePersonnel, departments: departments.map(row => ({ ...row, allocatedDisplay: peso(row.allocated), spentDisplay: peso(row.spent), remainingDisplay: peso(row.remaining), usedDisplay: row.usedPercent === null ? 'Not applicable' : `${row.usedPercent}%` })), csvUrl: `/admin/planning-reports?fiscalYear=${fiscalYear}&format=csv`, printUrl: `/admin/planning-reports?fiscalYear=${fiscalYear}&print=1`, print: req.query.print === '1' });
}));
export default router;
