import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetInput, enforceExportLimit, fiscalYearInput, formatCents, moneyCents, peso, summarizeBudget } from '../services/planning.js';

test('budget amounts keep exact cents through maximum decimal precision', () => {
  assert.equal(moneyCents('9999999999999.99'), 999999999999999n);
  assert.equal(formatCents(moneyCents('0.10') + moneyCents('0.20')), '0.30');
  assert.equal(formatCents(-101n), '-1.01');
  assert.equal(formatCents(moneyCents('001.2')), '1.20');
  for (const invalid of ['', '-1', '1.001', '1e3', 'NaN', 'Infinity', '1,000', '10000000000000', '1.2.3', {}, null]) assert.throws(() => moneyCents(invalid));
});
test('budget input requires identity fields and bounded fiscal years', () => {
  const data = { department: ' Planning ', item: ' Transport ', fiscalYear: '2026', allocated: '100', spent: '100.01' };
  assert.deepEqual(budgetInput(data), { department: 'Planning', item: 'Transport', fiscalYear: 2026, allocated: '100.00', spent: '100.01' });
  for (const fiscalYear of ['1899', '10000', '2026.5', 'abc']) assert.throws(() => fiscalYearInput(fiscalYear));
  assert.throws(() => budgetInput({ ...data, department: '' }));
  assert.throws(() => budgetInput({ ...data, item: 'x'.repeat(256) }));
});
test('department aggregation is exact, detects overspending, and handles zero allocation', () => {
  assert.deepEqual(summarizeBudget([
    { department: 'Office A', allocated: '0.10', spent: '0.10' }, { department: 'Office A', allocated: '0.20', spent: '0.21' },
    { department: 'Office B', allocated: '0.00', spent: '1.00' }, { department: 'Office C', allocated: '3.00', spent: '1.00' },
  ]), [
    { department: 'Office A', allocated: '0.30', spent: '0.31', remaining: '-0.01', usedPercent: '103.33', overBudget: true },
    { department: 'Office B', allocated: '0.00', spent: '1.00', remaining: '-1.00', usedPercent: null, overBudget: true },
    { department: 'Office C', allocated: '3.00', spent: '1.00', remaining: '2.00', usedPercent: '33.33', overBudget: false },
  ]);
  assert.deepEqual(summarizeBudget([]), []);
});
test('peso display groups exact decimal strings without losing aggregate precision', () => {
  assert.equal(peso('1234567890123456789.99'), '₱1,234,567,890,123,456,789.99');
  assert.equal(peso('-1234.5'), '-₱1,234.50');
  assert.equal(peso('0'), '₱0.00');
  for (const invalid of ['1e6', 'NaN', '1.001', '₱1.00', '1,000.00']) assert.throws(() => peso(invalid));
  assert.equal(enforceExportLimit(10000), undefined);
  assert.throws(() => enforceExportLimit(10001), /10,000/);
  assert.equal(summarizeBudget([{ department: 'Zero', allocated: '0', spent: '0' }])[0].usedPercent, null);
});
