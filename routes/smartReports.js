import express from 'express';
import { Op } from 'sequelize';
import { CitizenReport, Notice, sequelize } from '../models/Platform.js';
import { requireFeature } from '../middleware/platformSecurity.js';
import { audit, notifyStaff, pagination } from '../services/platform.js';
import { fail, integer, text } from '../services/platformRules.js';

const citizenPath = '/dashboard/smartreports';
const adminPath = '/admin/smartreports';
const statuses = ['Submitted', 'Under Review', 'Resolved', 'Closed'];
const adminOnly = requireFeature('smartReports');
const signedIn = (req, res, next) => req.session.user ? next() : res.redirect('/login');
const run = handler => (req, res, next) => handler(req, res).catch(next);
const when = value => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(value);
const columns = ['Report ID', 'Title', 'Status', 'Submitted'];
const cells = row => [row.id, row.title, row.status, when(row.createdAt)];
export const smartReportsDataset = { model: CitizenReport, feature: 'smartReports', title: 'SmartReports submissions', columns, cells };
export const smartReports = express.Router();

function reportStatus(value) {
  if (!statuses.includes(value)) fail('Choose a valid report status.');
  return value;
}

async function findReport(req, admin, transaction) {
  const where = { id: integer(req.params.id, 'Report', 1) };
  if (!admin) where.userId = req.session.user.id;
  const report = await CitizenReport.findOne({ where, transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!report) fail('Report not found.', 404);
  return report;
}

function list(admin) {
  return run(async (req, res) => {
    const base = admin ? adminPath : citizenPath;
    const page = pagination(req.query);
    const q = text(req.query.q, 'Search', false, 100);
    const filter = admin && req.query.filter ? reportStatus(req.query.filter) : '';
    const where = {};
    if (q) where.title = { [Op.like]: `%${q.replace(/[\\%_]/g, '\\$&')}%` };
    if (admin && filter) where.status = filter;
    if (!admin) where.userId = req.session.user.id;
    const result = await CitizenReport.findAndCountAll({ where, ...page, order: [['id', 'DESC']] });
    const pageUrl = number => base + '?' + new URLSearchParams({ q: q || '', filter, page: number });
    res.render('platformList', {
      title: admin ? 'SmartReports' : 'My reports',
      description: admin ? 'Review submitted reports and track their progress.' : 'Submit a report and follow its progress.',
      base, q, filter, filterLabel: admin ? 'status' : null, columns,
      newUrl: admin ? null : citizenPath + '/new', singular: 'report',
      generateUrl: admin ? '/admin/reports?dataset=smartreports' : null,
      rows: result.rows.map(row => ({ cells: cells(row), url: base + '/' + row.id })),
      count: result.count, page: page.page, pages: Math.max(1, Math.ceil(result.count / page.limit)),
      previous: page.page > 1 ? pageUrl(page.page - 1) : null,
      next: result.count > page.offset + page.limit ? pageUrl(page.page + 1) : null,
    });
  });
}

function detail(admin) {
  return run(async (req, res) => {
    const report = await findReport(req, admin);
    res.render('smartReport', {
      title: report.title, report: report.toJSON(), submitted: when(report.createdAt),
      base: admin ? adminPath : citizenPath, review: admin,
      statuses: statuses.map(value => ({ value, selected: value === report.status })),
    });
  });
}

smartReports.get(citizenPath, signedIn, list(false));
smartReports.get(citizenPath + '/new', signedIn, (_req, res) => {
  res.render('smartReport', { title: 'Submit a report', base: citizenPath, submitting: true });
});
smartReports.get(citizenPath + '/:id', signedIn, detail(false));
smartReports.post(citizenPath, signedIn, run(async (req, res) => {
  const title = text(req.body.title, 'Title', true, 200);
  const description = text(req.body.description, 'Description', true, 3000);
  const report = await sequelize.transaction(async transaction => {
    const created = await CitizenReport.create({ userId: req.session.user.id, title, description }, { transaction });
    await notifyStaff('smartReports', 'New SmartReports submission', `Report #${created.id} is awaiting review.`, adminPath + '/' + created.id, transaction);
    return created;
  });
  req.flash('success_msg', 'Report submitted.');
  res.redirect(citizenPath + '/' + report.id);
}));

smartReports.get(adminPath, adminOnly, list(true));
smartReports.get(adminPath + '/:id', adminOnly, detail(true));
smartReports.post(adminPath + '/:id/status', adminOnly, run(async (req, res) => {
  const status = reportStatus(req.body.status);
  const changed = await sequelize.transaction(async transaction => {
    const report = await findReport(req, true, transaction);
    if (report.status === status) return false;
    await report.update({ status }, { transaction });
    await Notice.create({
      userId: report.userId, title: `Report #${report.id} updated`,
      message: `Your report status is now ${status}.`, url: citizenPath + '/' + report.id,
    }, { transaction });
    await audit(req, 'citizen_report.status_updated', 'citizen_report', report.id, status, transaction);
    return true;
  });
  req.flash('success_msg', changed ? 'Status updated and notification sent.' : 'The report already has this status.');
  res.redirect(adminPath + '/' + req.params.id);
}));

smartReports.post(adminPath + '/:id/notify', adminOnly, run(async (req, res) => {
  const message = text(req.body.message, 'Message', true, 3000);
  await sequelize.transaction(async transaction => {
    const report = await findReport(req, true, transaction);
    await Notice.create({
      userId: report.userId, title: `Message about report #${report.id}`,
      message, url: citizenPath + '/' + report.id,
    }, { transaction });
    await audit(req, 'citizen_report.notification_sent', 'citizen_report', report.id, null, transaction);
  });
  req.flash('success_msg', 'Notification sent to the report submitter.');
  res.redirect(adminPath + '/' + req.params.id);
}));
