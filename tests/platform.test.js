import test from 'node:test';
import assert from 'node:assert/strict';
import { can, residentInput, recordInput, resourceInput, stockChange, csv, requestStatus } from '../services/platformRules.js';

test('office permissions keep citizens and resource officers away from registry records', () => {
  assert.equal(can('user', 'registry'), false);
  assert.equal(can('resource_officer', 'registry'), false);
  assert.equal(can('registrar', 'registry'), true);
  assert.equal(can('staff', 'resources'), false);
  assert.equal(can('admin', 'users'), true);
  assert.equal(can('registrar', 'users'), false);
});
test('resident validation standardizes identifiers and rejects incomplete and future records', () => {
  const input = { residentCode: ' ban-001 ', firstName: ' Ana ', lastName: 'Cruz', birthDate: '2000-01-01', barangay: 'Poblacion' };
  assert.equal(residentInput(input).residentCode, 'BAN-001');
  assert.equal(residentInput(input).firstName, 'Ana');
  assert.throws(() => residentInput({ ...input, birthDate: '2999-01-01' }));
  assert.throws(() => residentInput({ ...input, birthDate: '2023-02-29' }));
  assert.throws(() => residentInput({ ...input, firstName: '' }));
});
test('civil records require valid resident, type, registry number and event date', () => {
  const input = { residentId: '1', type: 'birth', registryNumber: '2026-001', eventDate: '2000-01-01', eventPlace: 'Bansud' };
  assert.equal(recordInput(input).residentId, 1);
  assert.throws(() => recordInput({ ...input, type: 'fake' }));
  assert.throws(() => recordInput({ ...input, residentId: '-1' }));
});
test('resource quantities are whole units and personnel count is one', () => {
  const input = { code: 's-1', name: 'Paper', category: 'supply', department: 'Registry', unit: 'ream', quantity: '10', minimum: '2' };
  assert.equal(resourceInput(input).quantity, 10);
  assert.throws(() => resourceInput({ ...input, quantity: '-1' }));
  assert.throws(() => resourceInput({ ...input, quantity: '1.5' }));
  assert.throws(() => resourceInput({ ...input, category: 'personnel', quantity: '2' }));
});
test('allocation cannot exceed stock and returns cannot exceed outstanding allocation', () => {
  assert.equal(stockChange(10, 'allocate', 3), 7);
  assert.equal(stockChange(7, 'return', 2, 3), 9);
  assert.throws(() => stockChange(2, 'allocate', 3));
  assert.throws(() => stockChange(7, 'return', 4, 3));
  assert.throws(() => stockChange(7, 'allocate', 0));
  assert.throws(() => stockChange(7, 'destroy', 1));
});
test('CSV escapes quotes/newlines and neutralizes spreadsheet formulas', () => {
  assert.equal(csv(['=CMD()', 'a"b', 'a\nb']), '"\'=CMD()","a""b","a\nb"');
});
test('request status validates the existing and release workflows', () => {
  assert.equal(requestStatus('Processing'), 'processing');
  assert.equal(requestStatus('released'), 'released');
  assert.throws(() => requestStatus('unrecognized'));
});
