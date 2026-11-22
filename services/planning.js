import { Op, col, where as sqlWhere } from 'sequelize';
import { BudgetItem } from '../models/Planning.js';
import { Resource, Allocation, sequelize } from '../models/Platform.js';
import { audit, saveResource } from './platform.js';
import { fail, integer, text } from './platformRules.js';

export const currentFiscalYear = () => Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date()));
export function fiscalYearInput(value = currentFiscalYear()) {
  const year = integer(value, 'Fiscal year', 1900);
  if (year > 9999) fail('Fiscal year must be between 1900 and 9999.');
  return year;
}
export function moneyCents(value, label = 'Amount') {
  const amount = String(value ?? '').trim();
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(amount)) fail(`${label} must be a nonnegative amount with at most two decimal places and 13 whole digits.`);
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function formatCents(cents) {
  const sign = cents < 0n ? '-' : '';
  const value = cents < 0n ? -cents : cents;
  return `${sign}${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}
export function peso(amount) {
  const value = String(amount);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) fail('Enter a valid peso amount.');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  return `${negative ? '-' : ''}₱${whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`;
}
export function enforceExportLimit(count) {
  if (count > 10000) fail('Exports are limited to 10,000 records. Narrow your filters and try again.');
}
export function budgetInput(body) {
  return { department: text(body.department, 'Department', true, 150), item: text(body.item, 'Budget item', true, 255), fiscalYear: fiscalYearInput(body.fiscalYear), allocated: formatCents(moneyCents(body.allocated, 'Allocated budget')), spent: formatCents(moneyCents(body.spent, 'Spent amount')) };
}
export function summarizeBudget(items) {
  const departments = new Map();
  for (const item of items) {
    const row = departments.get(item.department) || { allocated: 0n, spent: 0n };
    row.allocated += moneyCents(item.allocated); row.spent += moneyCents(item.spent);
    departments.set(item.department, row);
  }
  return [...departments].sort(([a], [b]) => a.localeCompare(b)).map(([department, row]) => ({ department, allocated: formatCents(row.allocated), spent: formatCents(row.spent), remaining: formatCents(row.allocated - row.spent), usedPercent: row.allocated ? formatCents((row.spent * 10000n + row.allocated / 2n) / row.allocated) : null, overBudget: row.spent > row.allocated }));
}
export async function planningSummary(fiscalYear = currentFiscalYear()) {
  return summarizeBudget(await BudgetItem.findAll({ where: { archivedAt: null, fiscalYear: fiscalYearInput(fiscalYear) }, raw: true }));
}
export async function saveBudget(req, id) {
  const data = budgetInput(req.body);
  return sequelize.transaction(async transaction => {
    let row;
    if (id) {
      row = await BudgetItem.findByPk(integer(id, 'Budget item', 1), { transaction, lock: transaction.LOCK.UPDATE });
      if (!row || row.archivedAt) fail('Active budget item not found.', 404);
      await row.update(data, { transaction });
    } else row = await BudgetItem.create(data, { transaction });
    await audit(req, id ? 'budget.updated' : 'budget.created', 'budget_items', row.id, 'Budget saved', transaction);
    return row;
  });
}
export async function savePersonnel(req, id) {
  let row;
  if (id) {
    row = await Resource.findByPk(integer(id, 'Personnel', 1));
    if (!row || row.category !== 'personnel' || row.archivedAt) fail('Active personnel record not found.', 404);
  }
  const body = { name: text(req.body.fullName, 'Full name', true, 255), position: text(req.body.position, 'Position', true, 150), department: text(req.body.department, 'Department', true, 150), contactNumber: text(req.body.contactNumber, 'Contact number', !id, 40), employeeStatus: req.body.employeeStatus || 'active', category: 'personnel', unit: 'person', quantity: row?.quantity ?? 1, minimum: 0, condition: row?.condition || 'serviceable', code: row?.code || '', notes: row?.notes || '', location: row?.location || '' };
  if (!['active', 'on_leave', 'inactive'].includes(body.employeeStatus)) fail('Choose a valid employee status.');
  return saveResource({ ...req, body }, id);
}
export async function archivePlanning(req, kind, id) {
  return sequelize.transaction(async transaction => {
    const model = kind === 'budget' ? BudgetItem : Resource;
    const row = await model.findByPk(integer(id, 'Record', 1), { transaction, lock: transaction.LOCK.UPDATE });
    if (!row || (kind === 'personnel' && row.category !== 'personnel')) fail('Record not found.', 404);
    if (kind === 'personnel' && !row.archivedAt && await Allocation.count({ where: { resourceId: row.id, [Op.and]: [sqlWhere(col('returned'), Op.lt, col('quantity'))] }, transaction })) fail('Return outstanding assignments before archiving this employee.');
    await row.update({ archivedAt: row.archivedAt ? null : new Date() }, { transaction });
    await audit(req, row.archivedAt ? `${kind}.archived` : `${kind}.restored`, kind, row.id, 'Archive state changed; history retained', transaction);
  });
}
