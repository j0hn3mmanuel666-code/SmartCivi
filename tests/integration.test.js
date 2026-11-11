import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

test('isolated MySQL office and citizen workflows', { skip: !process.env.RUN_DB_TESTS }, async t => {
  assert.match(process.env.DB_NAME || '', /_test$/, 'Use a disposable database ending in _test');
  process.env.ELECTRON = '1';
  const { default: app } = await import('../index.js');
  const { User, Resident, CivilRecord, Resource, Notice, Audit, Request, sequelize } = await import('../models/Platform.js');
  const { default: bcrypt } = await import('bcrypt');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await sequelize.close(); });
  const suffix = Date.now();
  const password = 'Local-test-password-123';
  const users = {};
  for (const role of ['admin', 'registrar', 'resource_officer', 'user']) users[role] = await User.create({ name: `Test ${role}`, email: `${role}${suffix}@example.test`, password: await bcrypt.hash(password, 4), role });
  const client = () => ({ cookie: '', token: '', async get(path) { return this.call(path); }, async call(path, body, method = 'GET') {
    const response = await fetch(origin + path, { redirect: 'manual', method, headers: { Cookie: this.cookie, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-Token': this.token } : {}) }, body: body ? new URLSearchParams(body) : undefined });
    if (response.headers.get('set-cookie')) this.cookie = response.headers.get('set-cookie').split(';')[0];
    const html = await response.text();
    this.token = html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || this.token;
    return { status: response.status, html, location: response.headers.get('location') };
  }, async login(role) { await this.get('/login'); const r = await this.call('/login', { email: users[role].email, password }, 'POST'); assert.equal(r.status, 302); await this.get('/login'); } });
  const admin = client(), citizen = client(), officer = client(), registrar = client();
  await admin.login('admin'); await citizen.login('user'); await officer.login('resource_officer'); await registrar.login('registrar');
  await t.test('permission and CSRF barriers', async () => {
    assert.equal((await citizen.get('/admin/residents')).status, 403);
    assert.equal((await officer.get('/admin/registry')).status, 403);
    const r = await fetch(origin + '/admin/residents', { method: 'POST', headers: { Cookie: admin.cookie } });
    assert.equal(r.status, 403);
  });
  const residentData = { residentCode: `BAN-${suffix}`, firstName: `Ana${suffix}`, lastName: 'Cruz', birthDate: '2000-01-01', barangay: 'Poblacion', sex: 'female' };
  let resident, record, resource;
  await t.test('resident creation, duplicate protection and editing', async () => {
    const r = await registrar.call('/admin/residents', residentData, 'POST');
    assert.equal(r.status, 302, r.html);
    resident = await Resident.findOne({ where: { residentCode: residentData.residentCode } });
    assert.ok(resident);
    assert.equal((await registrar.call('/admin/residents', residentData, 'POST')).status, 409);
    assert.equal((await registrar.call(`/admin/residents/${resident.id}`, { ...residentData, barangay: 'Proper Bansud' }, 'POST')).status, 302);
    assert.equal((await resident.reload()).barangay, 'Proper Bansud');
  });
  await t.test('linked civil records and role-scoped reports', async () => {
    const data = { residentId: resident.id, type: 'birth', registryNumber: `REG-${suffix}`, eventDate: '2000-01-01', eventPlace: 'Bansud' };
    assert.equal((await registrar.call('/admin/registry', data, 'POST')).status, 302);
    record = await CivilRecord.findOne({ where: { registryNumber: data.registryNumber } });
    assert.ok(record);
    assert.equal((await registrar.get('/admin/reports?dataset=registry&format=csv')).status, 200);
    assert.equal((await officer.get('/admin/reports?dataset=registry&format=csv')).status, 403);
  });
  await t.test('stock ledger serializes simultaneous allocation and bounds returns', async () => {
    const data = { code: `SUP-${suffix}`, name: 'Paper', category: 'supply', department: 'Registry', unit: 'ream', quantity: 3, minimum: 1 };
    assert.equal((await officer.call('/admin/resources', data, 'POST')).status, 302);
    resource = await Resource.findOne({ where: { code: data.code } });
    const results = await Promise.all([officer.call(`/admin/resources/${resource.id}/move`, { action: 'allocate', quantity: 2, recipient: 'Office A' }, 'POST'), officer.call(`/admin/resources/${resource.id}/move`, { action: 'allocate', quantity: 2, recipient: 'Office B' }, 'POST')]);
    assert.deepEqual(results.map(r => r.status).sort(), [302, 400]);
    assert.equal((await resource.reload()).quantity, 1);
    const { Allocation } = await import('../models/Platform.js');
    const allocation = await Allocation.findOne({ where: { resourceId: resource.id } });
    assert.equal((await officer.call(`/admin/resources/${resource.id}/move`, { action: 'return', quantity: 3, allocationId: allocation.id }, 'POST')).status, 400);
    assert.equal((await officer.call(`/admin/resources/${resource.id}/move`, { action: 'return', quantity: 2, allocationId: allocation.id }, 'POST')).status, 302);
    assert.equal((await resource.reload()).quantity, 3);
    assert.ok(await Notice.count({ where: { userId: users.resource_officer.id } }));
  });
  await t.test('citizen requests, ownership, status timeline and notices', async () => {
    const r = await citizen.call('/request', { fullName: 'Test Citizen', email: 'forged@example.test', phone: '09123456789', documentType: 'birth', purpose: 'Personal copy' }, 'POST');
    assert.equal(r.status, 302);
    const request = await Request.findOne({ where: { email: users.user.email }, order: [['id', 'DESC']] });
    assert.ok(request, 'Owner email comes from session');
    assert.equal((await admin.call(`/admin/requests/${request.id}/status`, { status: 'processing' }, 'POST')).status, 302);
    assert.match((await citizen.get(`/request/${request.id}`)).html, /processing/i);
    const other = await Request.create({ fullName: 'Other', email: 'other@example.test', phone: '0', documentType: 'birth', purpose: 'Test' });
    assert.equal((await citizen.get(`/request/${other.id}/confirmation`)).status, 404);
    assert.ok(await Notice.count({ where: { userId: users.user.id } }));
  });
  await t.test('office pages and existing citizen services render', async () => {
    for (const path of ['/admin', '/admin/residents', '/admin/registry', '/admin/resources', '/admin/reports', '/admin/audit', '/admin/operations', '/admin/integrations', '/admin/users', '/admin/requests', '/admin/appointments', '/api/v1/summary']) assert.equal((await admin.get(path)).status, 200, path);
    for (const path of ['/browse', '/dashboard', '/dashboard/my-requests', '/dashboard/profile', '/help', '/request', '/request/submit', '/my-appointments', '/payments', '/dashboard/notifications']) assert.equal((await citizen.get(path)).status, 200, path);
    assert.equal((await officer.get('/admin/reports?dataset=movements&format=csv')).status, 200);
    assert.equal((await officer.get('/admin/reports?dataset=allocations&format=csv')).status, 200);
    assert.ok(await Audit.count());
  });
  await t.test('normal HTML forms receive CSRF tokens and current roles are refreshed', async () => {
    const page = await admin.get('/admin/residents/new');
    assert.match(page.html, /name="_csrf" value="[a-f0-9]{64}"/);
    await users.registrar.update({ role: 'user' });
    assert.equal((await registrar.get('/admin/registry')).status, 403);
    await users.registrar.update({ role: 'registrar' });
    assert.equal((await registrar.get('/admin/registry')).status, 200);
  });
  await t.test('appointments keep document status separate and support reschedule requests', async () => {
    const appointmentDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const response = await citizen.call('/request', { fullName: 'Appointment client', phone: '09123456789', documentType: 'birth', purpose: 'Appointment', appointmentDate }, 'POST');
    assert.equal(response.status, 302);
    const request = await Request.findOne({ where: { email: users.user.email, purpose: 'Appointment' }, order: [['id', 'DESC']] });
    assert.equal(request.appointmentStatus, 'scheduled');
    assert.equal((await registrar.call(`/admin/appointments/${request.id}/status`, { status: 'confirmed', appointmentDate: `${appointmentDate}T10:00`, notes: 'Bring valid ID' }, 'POST')).status, 302);
    await request.reload();
    assert.equal(request.status, 'pending');
    assert.equal(request.appointmentStatus, 'confirmed');
    assert.equal((await citizen.call(`/appointments/${request.id}/reschedule`, { rescheduleReason: 'Prefer next week' }, 'POST')).status, 302);
    assert.equal((await request.reload()).rescheduleRequested, true);
  });
  await t.test('SOAP validates permissions, rejects entities and returns only record metadata', async () => {
    await record.update({ registryNumber: `REG & ${suffix}` });
    const body = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><LookupRecord xmlns="urn:smartcivi"><registryNumber>${record.registryNumber.replaceAll('&', '&amp;')}</registryNumber></LookupRecord></soap:Body></soap:Envelope>`;
    const response = await fetch(origin + '/api/v1/registry-soap', { method: 'POST', headers: { Cookie: registrar.cookie, 'Content-Type': 'text/xml', 'X-CSRF-Token': registrar.token }, body });
    assert.equal(response.status, 200);
    const xml = await response.text();
    assert.match(xml, /<type>birth<\/type>/);
    assert.equal(xml.includes(resident.firstName), false);
    const invalid = await fetch(origin + '/api/v1/registry-soap', { method: 'POST', headers: { Cookie: registrar.cookie, 'Content-Type': 'text/xml', 'X-CSRF-Token': registrar.token }, body: '<!DOCTYPE malicious>' + body });
    assert.equal(invalid.status, 400);
    assert.equal((await officer.get('/api/v1/registry-soap?wsdl')).status, 403);
  });
  await t.test('payment completion and downloads survive release without allowing unpaid downloads', async () => {
    const request = await Request.create({ fullName: 'Payment client', email: users.user.email, phone: '0', documentType: 'birth', purpose: 'Payment test', status: 'approved' });
    assert.equal((await citizen.call(`/request/${request.id}/process-payment`, { paymentMethod: 'online' }, 'POST')).status, 302);
    assert.ok((await request.reload()).paidAt);
    assert.equal((await admin.call(`/admin/requests/${request.id}/status`, { status: 'released' }, 'POST')).status, 302);
    assert.equal((await citizen.get(`/receipts/${request.id}/download`)).status, 200);
    assert.equal((await citizen.get(`/request/${request.id}/print`)).status, 200);
    const unpaid = await Request.create({ fullName: 'Unpaid client', email: users.user.email, phone: '0', documentType: 'birth', purpose: 'Unpaid test', status: 'released' });
    assert.equal((await citizen.get(`/receipts/${unpaid.id}/download`)).status, 400);
    assert.equal((await citizen.get(`/request/${unpaid.id}/print`)).status, 302);
  });
  await t.test('old outstanding allocations remain accessible after more than 100 completed cycles', async () => {
    const { Allocation } = await import('../models/Platform.js');
    assert.equal((await officer.call(`/admin/resources/${resource.id}/move`, { action: 'allocate', quantity: 1, recipient: 'Old outstanding loan' }, 'POST')).status, 302);
    await Allocation.bulkCreate(Array.from({ length: 101 }, (_, i) => ({ resourceId: resource.id, recipient: `Returned cycle ${i}`, quantity: 1, returned: 1 })));
    const page = await officer.get(`/admin/resources/${resource.id}`);
    assert.equal(page.status, 200);
    assert.match(page.html, /Old outstanding loan/);
  });
  await t.test('archived resident cannot have a civil record restored under it', async () => {
    assert.equal((await registrar.call(`/admin/residents/${resident.id}/archive`, {}, 'POST')).status, 400);
    assert.equal((await registrar.call(`/admin/registry/${record.id}/archive`, {}, 'POST')).status, 302);
    assert.equal((await registrar.call(`/admin/residents/${resident.id}/archive`, {}, 'POST')).status, 302);
    assert.equal((await registrar.call(`/admin/registry/${record.id}/archive`, {}, 'POST')).status, 400);
  });
});
