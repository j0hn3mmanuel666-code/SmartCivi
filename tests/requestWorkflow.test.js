import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_REQUEST_STATUSES,
  REQUEST_PAUSED_STATUS,
  addBusinessDays,
  businessDaysElapsed,
  isDueSoonCase,
  isOverdueCase,
  requestCaseDefaults,
  slaStatusUpdate,
} from '../services/requestWorkflow.js';

test('new civil requests route to the registry and receive a five-business-day deadline', () => {
  const createdAt = new Date('2026-06-05T05:00:00.000Z');
  const defaults = requestCaseDefaults('birth', createdAt);
  assert.equal(defaults.office, 'Municipal Civil Registry');
  assert.equal(defaults.dueAt.toISOString(), '2026-06-12T15:59:59.000Z');
  assert.throws(() => requestCaseDefaults('other', createdAt), /Unsupported document type/);
});

test('business day calculations skip weekends and resume a paused SLA', () => {
  assert.equal(addBusinessDays(new Date('2026-06-05T05:00:00.000Z'), 1).toISOString(), '2026-06-08T15:59:59.000Z');
  assert.equal(businessDaysElapsed('2026-06-05T05:00:00.000Z', '2026-06-08T05:00:00.000Z'), 1);
  const request = { status: REQUEST_PAUSED_STATUS, slaPausedAt: new Date('2026-06-05T05:00:00.000Z'), dueAt: new Date('2026-06-12T15:59:59.000Z') };
  const update = slaStatusUpdate(request, 'processing', new Date('2026-06-08T05:00:00.000Z'));
  assert.equal(update.slaPausedAt, null);
  assert.equal(update.dueAt.toISOString(), '2026-06-15T15:59:59.000Z');
  assert.ok(slaStatusUpdate({ ...request, slaPausedAt: null }, REQUEST_PAUSED_STATUS).slaPausedAt instanceof Date);
});

test('due-soon and overdue checks exclude paused or inactive requests', () => {
  const now = new Date('2026-06-05T05:00:00.000Z');
  const active = { status: ACTIVE_REQUEST_STATUSES[0], dueAt: new Date('2026-06-08T15:59:59.000Z'), slaPausedAt: null };
  assert.equal(isDueSoonCase(active, now), true);
  assert.equal(isOverdueCase({ ...active, dueAt: new Date('2026-06-04T15:59:59.000Z') }, now), true);
  assert.equal(isOverdueCase({ ...active, slaPausedAt: now, dueAt: new Date('2026-06-04T15:59:59.000Z') }, now), false);
  assert.equal(isOverdueCase({ ...active, status: 'completed' }, now), false);
});
