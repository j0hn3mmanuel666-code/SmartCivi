import test from 'node:test';
import assert from 'node:assert/strict';
import { requestDraftData, requestServiceCatalog, requestServiceDetails } from '../services/requestIntake.js';

test('service guidance avoids presenting unconfigured fees and requirements as official', () => {
  const services = requestServiceCatalog();
  assert.deepEqual(services.map(service => service.documentType), ['birth', 'marriage', 'death']);
  for (const service of services) {
    assert.match(service.requirements, /not been configured/);
    assert.match(service.fee, /Confirm the current fee/);
    assert.match(service.processingTime, /5 business days/);
  }
  assert.throws(() => requestServiceDetails('other'));
});

test('draft data is account-independent, bounded, and limited to supported request fields', () => {
  const draft = requestDraftData({ documentType: 'marriage', firstName: '  Ana  ', unexpected: 'ignore me' });
  assert.equal(draft.documentType, 'marriage');
  assert.equal(draft.payload.firstName, 'Ana');
  assert.equal(draft.payload.unexpected, undefined);
  assert.throws(() => requestDraftData({ documentType: 'fake' }));
  assert.throws(() => requestDraftData({ documentType: 'birth', reminder: 'x'.repeat(1001) }));
});
