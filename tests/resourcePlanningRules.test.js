import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceInput, can } from '../services/platformRules.js';

test('resources accept a generated ID, location and physical condition', () => {
  const body = { name: 'Desk', category: 'equipment', department: 'Planning', unit: 'piece', quantity: '2', condition: 'good', location: 'Room 2' };
  const result = resourceInput(body);
  assert.equal(result.code, null); assert.equal(result.location, 'Room 2'); assert.equal(result.condition, 'good');
  for (const condition of ['fair', 'poor', 'serviceable', 'maintenance', 'unserviceable']) assert.equal(resourceInput({ ...body, condition }).condition, condition);
  assert.throws(() => resourceInput({ ...body, condition: 'fake' }));
});
test('personnel fields and planning permissions remain role-scoped', () => {
  const body = { name: 'Staff', category: 'personnel', department: 'Registry', unit: 'person', quantity: 1, contactNumber: '09123456789', employeeStatus: 'on_leave' };
  assert.equal(resourceInput(body).employeeStatus, 'on_leave');
  assert.throws(() => resourceInput({ ...body, employeeStatus: 'fake' }));
  for (const role of ['admin', 'resource_officer']) for (const feature of ['personnel', 'budget', 'planningReports', 'diagrams']) assert.equal(can(role, feature), true);
  for (const role of ['user', 'staff', 'registrar']) for (const feature of ['personnel', 'budget', 'planningReports', 'diagrams']) assert.equal(can(role, feature), false);
});
