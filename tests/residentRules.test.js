import test from 'node:test';
import assert from 'node:assert/strict';
import { ageOn, populationInput } from '../services/residentRules.js';
import { can, residentInput } from '../services/platformRules.js';

test('resident ages use the birthday and report date, including leap years', () => {
  assert.equal(ageOn('2000-11-18', '2026-11-17'), 25);
  assert.equal(ageOn('2000-11-17', '2026-11-17'), 26);
  assert.equal(ageOn('2024-02-29', '2026-03-01'), 2);
  assert.equal(ageOn('2027-01-01', '2026-11-17'), null);
});
test('population filters reject inverted and invalid ranges', () => {
  assert.equal(populationInput({ ageMin: '18', ageMax: '59', sex: 'female', civilStatus: 'single' }).ageMin, 18);
  assert.throws(() => populationInput({ ageMin: '60', ageMax: '20' }));
  assert.throws(() => populationInput({ from: '2026-11-17', to: '2026-10-01' }));
  assert.throws(() => populationInput({ sex: 'invalid' }));
  assert.throws(() => populationInput({ civilStatus: 'invalid' }));
});
test('resident tools are limited to registrars and administrators', () => {
  for (const role of ['registrar', 'admin']) {
    for (const feature of ['barangays', 'population', 'residentActivity', 'reports']) assert.equal(can(role, feature), true);
  }
  for (const feature of ['residents', 'barangays', 'population', 'residentActivity', 'reports', 'audit', 'users']) assert.equal(can('staff', feature), false);
  assert.equal(can('staff', 'requests'), true);
  assert.equal(can('user', 'population'), false); assert.equal(can('resource_officer', 'residentActivity'), false);
});
test('resident creation validates civil status without requiring a typed Resident ID', () => {
  const data = { firstName: 'Ana', lastName: 'Cruz', birthDate: '2000-01-01', sex: 'female', barangay: 'Poblacion', civilStatus: 'single' };
  assert.equal(residentInput(data).civilStatus, 'single');
  assert.throws(() => residentInput({ ...data, civilStatus: '' }));
});
