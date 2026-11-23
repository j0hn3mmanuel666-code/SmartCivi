import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

test('isolated MySQL office and citizen workflows', { skip: !process.env.RUN_DB_TESTS }, async t => {
  assert.match(process.env.DB_NAME || '', /_test$/, 'Use a disposable database ending in _test');
  process.env.ELECTRON = '1';
  const { default: app } = await import('../index.js');
  const { User, Resident, CivilRecord, Resource, Notice, Audit, Request, RequestDraft, RequestMessage, RequestDocument, sequelize, Barangay } = await import('../models/Platform.js');
  const { default: bcrypt } = await import('bcrypt');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await sequelize.close(); });
  const suffix = Date.now();
  const password = 'Local-test-password-123';
  const users = {};
  for (const role of ['admin', 'registrar', 'staff', 'resource_officer', 'user']) users[role] = await User.create({ name: `Test ${role}`, email: `${role}${suffix}@example.test`, password: await bcrypt.hash(password, 4), role });
  const client = () => ({ cookie: '', token: '', async get(path) { return this.call(path); }, async call(path, body, method = 'GET') {
    const response = await fetch(origin + path, { redirect: 'manual', method, headers: { Cookie: this.cookie, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-Token': this.token } : {}) }, body: body ? new URLSearchParams(body) : undefined });
    if (response.headers.get('set-cookie')) this.cookie = response.headers.get('set-cookie').split(';')[0];
    const html = await response.text();
    this.token = html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || this.token;
    return { status: response.status, html, location: response.headers.get('location') };
  }, async upload(path, message, fileName, fileContent) {
    const body = new FormData();
    body.set('message', message);
    if (fileName) body.append('documents', new Blob([fileContent], { type: 'application/pdf' }), fileName);
    const response = await fetch(origin + path, { method: 'POST', headers: { Cookie: this.cookie, 'X-CSRF-Token': this.token }, body });
    if (response.headers.get('set-cookie')) this.cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, body: await response.json() };
  }, async login(role) { await this.get('/login'); const r = await this.call('/login', { email: users[role].email, password }, 'POST'); assert.equal(r.status, 302); await this.get('/login'); } });
  const admin = client(), citizen = client(), officer = client(), registrar = client(), frontDesk = client();
  await admin.login('admin'); await citizen.login('user'); await officer.login('resource_officer'); await registrar.login('registrar'); await frontDesk.login('staff');
  await t.test('SmartReports submission, review, notifications, and export', async () => {
    const title = `Lighting repair ${suffix}`;
    const submitted = await citizen.call('/dashboard/smartreports', { title, description: 'The streetlight needs repair.' }, 'POST');
    assert.equal(submitted.status, 302, submitted.html);
    assert.match(submitted.location, /^\/dashboard\/smartreports\/\d+$/);
    const adminReport = submitted.location.replace('/dashboard/', '/admin/');
    assert.match((await citizen.get(submitted.location)).html, /Submitted/);
    assert.equal((await officer.get(submitted.location)).status, 404);
    assert.equal((await citizen.get(adminReport)).status, 403);
    assert.match((await admin.get('/dashboard/notifications')).html, /New SmartReports submission/);
    for (const status of ['Under Review', 'Resolved', 'Closed']) {
      assert.equal((await admin.call(adminReport + '/status', { status }, 'POST')).status, 302);
      assert.match((await citizen.get('/dashboard/notifications')).html, new RegExp(`Your report status is now ${status}`));
    }
    assert.equal((await admin.call(adminReport + '/notify', { message: 'The repair team completed the work.' }, 'POST')).status, 302);
    assert.match((await citizen.get('/dashboard/notifications')).html, /The repair team completed the work/);
    assert.match((await admin.get('/admin/smartreports?filter=Closed')).html, new RegExp(title));
    const exported = await admin.get('/admin/reports?dataset=smartreports&format=csv');
    assert.equal(exported.status, 200);
    assert.match(exported.html, new RegExp(title + '.*Closed'));
    assert.equal((await officer.get('/admin/reports?dataset=smartreports&format=csv')).status, 403);
  });
  await t.test('permission and CSRF barriers', async () => {
    assert.equal((await citizen.get('/admin/residents')).status, 403);
    assert.equal((await officer.get('/admin/registry')).status, 403);
    const r = await fetch(origin + '/admin/residents', { method: 'POST', headers: { Cookie: admin.cookie } });
    assert.equal(r.status, 403);
  });
  await Barangay.findOrCreate({ where: { name: 'Poblacion' } });
  await Barangay.findOrCreate({ where: { name: 'Proper Bongabong' } });
  const residentData = { residentCode: `BAN-${suffix}`, firstName: `Ana${suffix}`, lastName: 'Cruz', birthDate: '2000-01-01', barangay: 'Poblacion', sex: 'female', civilStatus: 'single' };
  let resident, record, resource;
  await t.test('resident creation, duplicate protection and editing', async () => {
    const r = await registrar.call('/admin/residents', residentData, 'POST');
    assert.equal(r.status, 302, r.html);
    resident = await Resident.findOne({ where: { firstName: residentData.firstName } });
    assert.ok(resident);
    assert.equal((await registrar.call('/admin/residents', residentData, 'POST')).status, 409);
    assert.equal((await registrar.call(`/admin/residents/${resident.id}`, { ...residentData, barangay: 'Proper Bongabong' }, 'POST')).status, 302);
    assert.equal((await resident.reload()).barangay, 'Proper Bongabong');
  });
  await t.test('linked civil records and role-scoped reports', async () => {
    const data = { residentId: resident.id, type: 'birth', registryNumber: `REG-${suffix}`, eventDate: '2000-01-01', eventPlace: 'Bongabong' };
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
    const intake = await citizen.get('/request/submit');
    assert.equal(intake.status, 200);
    assert.match(intake.html, /official birth certificate document checklist has not been configured/i);
    assert.match(intake.html, /Confirm the current fee with the Municipal Civil Registry/);
    assert.match(intake.html, /5 business days/);
    assert.match(intake.html, /Save draft/);
    const saved = await citizen.call('/request/drafts', { documentType: 'birth', firstName: 'Draft Applicant', birthdate: '2000-01-01', reminder: 'Return with ID' }, 'POST');
    assert.equal(saved.status, 302);
    const draftId = Number(saved.location.match(/draftId=(\d+)/)?.[1]);
    assert.ok(draftId);
    const draft = await RequestDraft.findByPk(draftId);
    assert.equal(draft.userId, users.user.id);
    assert.equal(draft.payload.firstName, 'Draft Applicant');
    assert.equal((await admin.get(`/request/submit?draftId=${draftId}`)).status, 404);
    const resumed = await citizen.get(`/request/submit?draftId=${draftId}`);
    assert.equal(resumed.status, 200);
    assert.match(resumed.html, /Draft Applicant/);
    assert.match((await citizen.get('/dashboard/my-request-drafts')).html, /Birth certificate/);
    const r = await citizen.call('/request', { draftId: String(draftId), fullName: 'Test Citizen', email: 'forged@example.test', phone: '09123456789', documentType: 'birth', purpose: 'Personal copy' }, 'POST');
    assert.equal(r.status, 302);
    assert.equal(await RequestDraft.count({ where: { id: draftId } }), 0, 'Submitting the request consumes its saved draft');
    const request = await Request.findOne({ where: { email: users.user.email }, order: [['id', 'DESC']] });
    assert.ok(request, 'Owner email comes from session');
    assert.equal(request.office, 'Municipal Civil Registry');
    assert.ok(request.dueAt);
    assert.match((await admin.get(`/admin/requests/${request.id}`)).html, /Route and assign/);
    const staffReview = await frontDesk.get(`/admin/requests/${request.id}`);
    assert.equal(staffReview.status, 200);
    assert.doesNotMatch(staffReview.html, /Route and assign/);
    const assignment = { office: 'Municipal Civil Registry', assigneeUserId: String(users.registrar.id), dueAt: '2030-01-15' };
    assert.equal((await frontDesk.call(`/admin/requests/${request.id}/assign`, assignment, 'POST')).status, 403);
    assert.equal((await admin.call(`/admin/requests/${request.id}/assign`, {
      office: 'Municipal Civil Registry',
      assigneeUserId: String(users.registrar.id),
      dueAt: '2030-01-15',
    }, 'POST')).status, 302);
    await request.reload();
    assert.equal(request.assigneeUserId, users.registrar.id);
    assert.equal(request.dueAt.toISOString(), '2030-01-15T15:59:59.000Z');
    assert.match((await admin.get(`/admin/requests?office=Municipal%20Civil%20Registry&owner=${users.registrar.id}`)).html, new RegExp(`#${request.id}`));
    assert.ok(await Notice.findOne({ where: { userId: users.registrar.id, title: 'Request assigned to you' } }));
    assert.equal((await admin.call(`/admin/requests/${request.id}/status`, { status: 'waiting_for_applicant', requesterMessage: 'Please upload a clearer copy.' }, 'POST')).status, 302);
    await request.reload();
    assert.equal(request.status, 'waiting_for_applicant');
    assert.ok(request.slaPausedAt);
    assert.match((await citizen.get('/dashboard/notifications')).html, /Please upload a clearer copy/);
    const tracking = await citizen.get(`/request/${request.id}`);
    assert.match(tracking.html, /The office needs more information/);
    assert.match(tracking.html, /Please upload a clearer copy/);
    assert.match(tracking.html, /applicant-response-form/);
    const previousDueAt = request.dueAt;
    await request.update({ slaPausedAt: new Date(Date.now() - 10 * 86400000) });
    const rejectedUpload = await citizen.upload(`/request/${request.id}/respond`, 'Reply', 'not-a-pdf.pdf', 'not a pdf');
    assert.equal(rejectedUpload.status, 400);
    const response = await citizen.upload(`/request/${request.id}/respond`, 'Here is the clearer copy.', 'supporting-document.pdf', '%PDF-1.7\nsample');
    assert.equal(response.status, 201);
    await request.reload();
    assert.equal(request.slaPausedAt, null);
    assert.equal(request.status, 'processing');
    assert.ok(request.dueAt > previousDueAt, 'Resuming extends the deadline by elapsed business days');
    assert.equal((await admin.call(`/admin/requests/${request.id}/status`, { status: 'processing' }, 'POST')).status, 302);
    const responsePage = await citizen.get(`/request/${request.id}`);
    assert.match(responsePage.html, /Here is the clearer copy/);
    assert.match(responsePage.html, /supporting-document\.pdf/);
    const uploaded = await RequestDocument.findOne({ where: { requestId: request.id } });
    assert.ok(uploaded.content.equals(Buffer.from('%PDF-1.7\nsample')));
    const downloaded = await fetch(`${origin}/request/${request.id}/documents/${uploaded.id}`, { headers: { Cookie: citizen.cookie } });
    assert.equal(downloaded.status, 200);
    assert.match(downloaded.headers.get('content-disposition'), /supporting-document\.pdf/);
    assert.equal(Buffer.from(await downloaded.arrayBuffer()).toString(), '%PDF-1.7\nsample');
    assert.equal((await officer.get(`/request/${request.id}/documents/${uploaded.id}`)).status, 404);
    assert.match((await admin.get(`/admin/requests/${request.id}`)).html, /Here is the clearer copy/);
    assert.ok(await Notice.findOne({ where: { userId: users.registrar.id, title: 'Applicant responded' } }));
    assert.ok(await RequestMessage.findOne({ where: { requestId: request.id, kind: 'information_request' } }));
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
  await t.test('citizen transaction pages share workspace headings and local styles', async () => {
    for (const path of ['/payments', '/records', '/status', '/offices']) {
      const page = await citizen.get(path);
      assert.equal(page.status, 200, path);
      assert.equal(page.html.includes('cdn.tailwindcss.com'), false, `${path} does not compile styles in the browser`);
      assert.match(page.html, /href="\/utilities.css"/, path);
      assert.ok(page.html.indexOf('<main') < page.html.indexOf('<h1'), `${path} heading belongs inside main content`);
      assert.match(page.html, /class="page-heading"/);
      assert.match(page.html, /class="office-footer"/);
    }
  });
  await t.test('account directory search and pagination keep large user lists manageable', async () => {
    const prefix = `ui-directory-${suffix}`;
    const fixtures = await User.bulkCreate(Array.from({ length: 26 }, (_, index) => ({ name: `${prefix} ${index}`, email: `${prefix}.${index}@example.test`, password: users.user.password, role: 'user' })));
    try {
      const first = await admin.get(`/admin/users?q=${prefix}`);
      assert.match(first.html, /Showing 1–25 of 26 accounts/);
      assert.match(first.html, /Page 1 of 2/);
      const firstTable = first.html.match(/<table id="accountsTable"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)[1];
      assert.equal((firstTable.match(/<tr>/g) || []).length, 25);
      const second = await admin.get(`/admin/users?q=${prefix}&page=2`);
      assert.match(second.html, /Showing 26–26 of 26 accounts/);
      assert.equal((second.html.match(/<table id="accountsTable"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)[1].match(/<tr>/g) || []).length, 1);
      assert.match(second.html, new RegExp(`${prefix} 0`));
      assert.equal((await citizen.get('/admin/users')).status, 403);
    } finally { await User.destroy({ where: { id: fixtures.map(user => user.id) } }); }
  });
  await t.test('normal HTML forms receive CSRF tokens and current roles are refreshed', async () => {
    const login = await admin.get('/login');
    assert.match(login.html, /class="auth-page"/);
    assert.equal(login.html.includes('cdn.tailwindcss.com'), false);
    assert.match(login.html, /data-password-toggle/);
    const freshLogin = await fetch(origin + '/login');
    assert.match(freshLogin.headers.get('cache-control'), /no-store/);
    const expired = await fetch(origin + '/login', { method: 'POST', redirect: 'manual', headers: { Cookie: admin.cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: users.admin.email, password, _csrf: 'stale' }) });
    assert.equal(expired.status, 303);
    assert.equal(expired.headers.get('location'), '/login');
    const overview = await admin.get('/admin');
    assert.equal(overview.html.includes('cdn.tailwindcss.com'), false, 'Native office screens do not need the browser CSS compiler');
    assert.match(overview.html, /id="workspace-navigation"/);
    assert.match(overview.html, /data-sidebar-toggle/);
    const dashboard = await citizen.get('/dashboard');
    assert.equal(dashboard.html.includes('cdn.tailwindcss.com'), false);
    assert.match(dashboard.html, /href="\/request\/submit"/);
    for (const path of ['/browse', '/offices']) {
      const page = await citizen.get(path);
      assert.match(page.html, /id="workspace-navigation"/, `${path} shares the signed-in sidebar`);
      assert.match(page.html, /data-sidebar-toggle/);
      assert.equal(/<body[^>]*style="background-image/.test(page.html), false);
    }
    const page = await admin.get('/admin/residents/new');
    assert.match(page.html, /name="_csrf" value="[a-f0-9]{64}"/);
    await users.registrar.update({ role: 'user' });
    assert.equal((await registrar.get('/admin/registry')).status, 403);
    await users.registrar.update({ role: 'registrar' });
    assert.equal((await registrar.get('/admin/registry')).status, 200);
  });
  await t.test('pages provide role-appropriate Back links without JavaScript', async () => {
    for (const path of ['/dashboard/my-requests', '/dashboard/profile', '/browse', '/request/submit', '/help']) {
      const page = await citizen.get(path);
      assert.match(page.html, /class="page-back-link" href="\/dashboard" data-page-back/, path);
      assert.equal((page.html.match(/data-page-back/g) || []).length, 1);
    }
    assert.match((await admin.get('/admin/residents/new')).html, /class="page-back-link" href="\/admin" data-page-back/);
    assert.match((await client().get('/login')).html, /class="page-back-link" href="\/" data-page-back/);
  });
  await t.test('profile name editing is validated, saved and restricted to the signed-in account', async () => {
    for (const [browser, role] of [[citizen, 'user'], [admin, 'admin']]) {
      const old = users[role].toJSON();
      await browser.get('/dashboard/profile');
      const r = await browser.call('/dashboard/profile', { name: '  Maria Isabel Dela Cruz  ', id: users.registrar.id, email: 'forged@example.test', role: 'admin' }, 'POST');
      assert.equal(r.status, 303); assert.equal(r.location, '/dashboard/profile');
      const saved = await users[role].reload();
      assert.equal(saved.name, 'Maria Isabel Dela Cruz'); assert.equal(saved.email, old.email); assert.equal(saved.role, old.role);
      assert.equal(saved.password, old.password);
      const page = await browser.get('/dashboard/profile');
      assert.match(page.html, /Your name has been updated/);
      assert.match(page.html, /value="Maria Isabel Dela Cruz"/);
      assert.match(page.html, /<strong[^>]*>Maria Isabel Dela Cruz<\/strong>/);
      assert.equal((await browser.call('/dashboard/profile', { name: saved.name }, 'POST')).status, 303, 'Saving an unchanged name succeeds');
      for (const name of ['   ', 'x'.repeat(256), 'Invalid\u0000Name']) {
        assert.equal((await browser.call('/dashboard/profile', { name }, 'POST')).status, 303);
        assert.equal((await saved.reload()).name, 'Maria Isabel Dela Cruz');
      }
      assert.equal((await browser.call('/dashboard/profile', { 'name[]': 'Array value' }, 'POST')).status, 303);
      const csrf = await fetch(origin + '/dashboard/profile', { method: 'POST', headers: { Cookie: browser.cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: 'Forged without CSRF' }) });
      assert.equal(csrf.status, 403);
      assert.equal((await saved.reload()).name, 'Maria Isabel Dela Cruz');
      assert.ok(await Audit.count({ where: { actorId: saved.id, action: 'account.name-updated' } }));
    }
    assert.equal((await users.registrar.reload()).name, 'Test registrar');
    const guest = client(); await guest.get('/login');
    assert.equal((await guest.call('/dashboard/profile', { name: 'Unauthenticated' }, 'POST')).location, '/login');
  });
  await t.test('audit pagination limits rows, retains search and handles page boundaries', async () => {
    const action = `pagination.${suffix}`;
    await Audit.bulkCreate(Array.from({ length: 31 }, (_, index) => ({ action, entity: 'test', detail: `Audit page entry ${index}`, actorName: 'Pagination test' })));
    try {
      const countRows = html => (html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1].match(/<tr>/g) || []).length;
      const first = await admin.get(`/admin/audit?q=${action}`);
      assert.equal(countRows(first.html), 10);
      assert.match(first.html, /Showing 1–10 of 31 entries/);
      assert.match(first.html, /Audit page entry 30/);
      assert.equal(first.html.includes('Audit page entry 20<'), false);
      assert.match(first.html, /aria-current="page"[^>]*>1<\/span>/);
      const link = first.html.replaceAll('&#x3D;', '=').match(/href="([^\"]*page=2[^\"]*)"/)[1].replaceAll('&amp;', '&');
      const url = new URL(link, origin);
      assert.equal(url.searchParams.get('q'), action); assert.equal(url.searchParams.get('limit'), '10');
      const second = await admin.get(url.pathname + url.search);
      assert.equal(countRows(second.html), 10); assert.match(second.html, /Showing 11–20 of 31 entries/);
      const last = await admin.get(`/admin/audit?q=${action}&page=99`);
      assert.equal(countRows(last.html), 1); assert.match(last.html, /Showing 31–31 of 31 entries/);
      assert.match(last.html, /Page 4 of 4/);
      const larger = await admin.get(`/admin/audit?q=${action}&limit=25`);
      assert.equal(countRows(larger.html), 25); assert.match(larger.html, /Page 1 of 2/);
      const empty = await admin.get(`/admin/audit?q=missing-${suffix}&page=99`);
      assert.equal(countRows(empty.html), 0); assert.match(empty.html, /No audit entries found/); assert.match(empty.html, /Page 1 of 1/);
      assert.equal((await citizen.get('/admin/audit')).status, 403);
    } finally { await Audit.destroy({ where: { action } }); }
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
