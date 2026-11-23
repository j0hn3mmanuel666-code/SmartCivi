import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

test('resident information workflows and population access boundaries', { skip: !process.env.RUN_DB_TESTS }, async t => {
  assert.match(process.env.DB_NAME || '', /_test$/);
  process.env.ELECTRON = '1';
  const { default: app } = await import('../index.js');
  const { User, Barangay, Resident, CivilRecord, Audit, sequelize } = await import('../models/Platform.js');
  const { default: bcrypt } = await import('bcrypt');
  const suffix = `${Date.now()}${process.pid}`, password = 'Resident-test-password-123';
  const users = {};
  for (const role of ['staff', 'registrar', 'resource_officer', 'user']) users[role] = await User.create({ name: `RIMS ${role}`, email: `rims-${role}${suffix}@example.test`, password: await bcrypt.hash(password, 4), role });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await sequelize.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const client = () => ({ cookie: '', token: '', async call(path, body) {
    const r = await fetch(origin + path, { redirect: 'manual', method: body ? 'POST' : 'GET', headers: { Cookie: this.cookie, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-Token': this.token } : {}) }, body: body ? new URLSearchParams(body) : undefined });
    if (r.headers.get('set-cookie')) this.cookie = r.headers.get('set-cookie').split(';')[0];
    const html = await r.text(); this.token = html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || this.token;
    return { status: r.status, html, location: r.headers.get('location') };
  }, async login(role) { await this.call('/login'); assert.equal((await this.call('/login', { email: users[role].email, password })).status, 302); await this.call('/login'); } });
  const staff = client(), frontDesk = client(), officer = client(), citizen = client();
  await staff.login('registrar'); await frontDesk.login('staff'); await officer.login('resource_officer'); await citizen.login('user');
  const barangayName = `RIMS ${suffix}`;
  let barangay, resident;
  const data = { firstName: `Resident${suffix}`, middleName: 'Middle', lastName: 'Sample', birthDate: '2000-11-18', sex: 'female', civilStatus: 'married', barangay: barangayName, address: 'Example street', phone: '09123456789', email: 'resident@example.test', residentCode: 'SPOOFED' };
  await t.test('registrar dashboard directly opens each resident-management module', async () => {
    const response = await staff.call('/admin'); assert.equal(response.status, 200);
    const main = response.html.slice(response.html.indexOf('<main'));
    for (const path of ['/admin/residents', '/admin/barangays', '/admin/population', '/admin/resident-activity']) assert.ok(main.includes(`href="${path}"`), path);
    assert.ok((await staff.call('/admin/reports')).html.includes('href="/admin/population"'));
  });
  await t.test('registrars can maintain barangays with duplicate protection', async () => {
    assert.equal((await staff.call('/admin/barangays', { name: barangayName, code: `T${suffix}` })).status, 302);
    barangay = await Barangay.findOne({ where: { name: barangayName } }); assert.ok(barangay);
    assert.equal((await staff.call('/admin/barangays', { name: barangayName })).status, 409);
  });
  await t.test('resident IDs are generated, immutable, and distinct during concurrent saves', async () => {
    assert.equal((await staff.call('/admin/residents', data)).status, 302);
    resident = await Resident.findOne({ where: { firstName: data.firstName } }); assert.match(resident.residentCode, /^BGB-\d{4}-\d+/);
    const original = resident.residentCode;
    assert.equal((await staff.call(`/admin/residents/${resident.id}`, { ...data, residentCode: 'CHANGED' })).status, 302);
    assert.equal((await resident.reload()).residentCode, original);
    assert.equal((await staff.call('/admin/residents', { ...data, firstName: 'Invalid', civilStatus: 'fake' })).status, 400);
    const outcomes = await Promise.all(['A', 'B'].map(letter => staff.call('/admin/residents', { ...data, firstName: `${letter}${suffix}` })));
    assert.deepEqual(outcomes.map(row => row.status), [302, 302]);
    const rows = await Resident.findAll({ where: { barangay: barangayName } }); assert.equal(new Set(rows.map(row => row.residentCode)).size, 3);
  });
  await t.test('barangay rename follows residents and archive is blocked for active residents', async () => {
    assert.equal((await staff.call(`/admin/barangays/${barangay.id}/archive`, {})).status, 400);
    const renamed = `${barangayName} Updated`;
    assert.equal((await staff.call(`/admin/barangays/${barangay.id}`, { name: renamed })).status, 302);
    assert.equal((await resident.reload()).barangay, renamed); data.barangay = renamed;
    assert.ok(await Audit.count({ where: { action: 'resident.barangay-updated', entityId: String(resident.id) } }));
  });
  await t.test('profiles and print views display saved information and record activity', async () => {
    for (const mode of ['profile', 'print']) {
      const response = await staff.call(`/admin/residents/${resident.id}/${mode}`); assert.equal(response.status, 200, response.html);
      assert.match(response.html, /Example street/); assert.match(response.html, /Married/); assert.match(response.html, /Bongabong/);
      assert.match(response.html, new RegExp(resident.residentCode));
    }
    assert.ok(await Audit.count({ where: { action: 'resident.printed', entityId: String(resident.id) } }));
  });
  await t.test('population filters, age boundaries, totals and CSV agree', async () => {
    const params = new URLSearchParams({ barangay: data.barangay, sex: 'female', civilStatus: 'married', ageMin: '26', ageMax: '26', asOf: '2026-11-18' });
    const report = await staff.call(`/admin/population?${params}`); assert.equal(report.status, 200, report.html); assert.match(report.html, /3<\/strong>/);
    const exported = await staff.call(`/admin/population?${params}&format=csv`); assert.equal(exported.status, 200, exported.html); assert.equal(exported.html.split('\r\n').length, 4);
    assert.match(exported.html, /"26","Female","Married"/);
    params.set('asOf', '2026-11-17'); assert.match((await staff.call(`/admin/population?${params}`)).html, /0<\/strong>/);
    assert.equal((await staff.call('/admin/population?ageMin=40&ageMax=20')).status, 400);
    assert.equal((await staff.call('/admin/population?sex=fake')).status, 400);
    assert.equal((await staff.call('/admin/reports?dataset=residents&format=csv')).status, 200);
  });
  await t.test('filtered reports and activity paginate and CSV neutralizes formulas', async () => {
    const fixtures = await Resident.bulkCreate(Array.from({ length: 26 }, (_, index) => ({ ...data, firstName: `=FORMULA${suffix}-${index}`, residentCode: `FIX-${suffix}-${index}` })));
    const query = new URLSearchParams({ q: `FORMULA${suffix}`, barangay: data.barangay });
    const first = await staff.call(`/admin/population?${query}`); assert.match(first.html, /Page 1 of 2/); assert.match(first.html, /page(?:=|&#x3D;)2/);
    assert.equal((first.html.match(/href="\/admin\/residents\/\d+\/profile"/g) || []).length, 25);
    const second = await staff.call(`/admin/population?${query}&page=2`); assert.match(second.html, /Page 2 of 2/);
    const csv = await staff.call(`/admin/population?${query}&format=csv`); assert.match(csv.html, /"'=FORMULA/); assert.equal(csv.html.split('\r\n').length, 27);
    await Audit.create({ actorName: 'RIMS secret', action: 'login.success', entity: 'account', detail: `SECRET-${suffix}` });
    await Audit.bulkCreate(Array.from({ length: 26 }, () => ({ actorName: 'RIMS staff', action: 'resident.updated', entity: 'residents', entityId: String(resident.id), detail: `Activity-${suffix}` })));
    const activity = await staff.call(`/admin/resident-activity?residentId=${resident.id}`); assert.equal(activity.status, 200); assert.match(activity.html, /Page 1 of 2/); assert.doesNotMatch(activity.html, new RegExp(`SECRET-${suffix}`));
    await Resident.destroy({ where: { id: fixtures.map(row => row.id) } });
  });
  await t.test('resident archive sees a civil record committed while waiting for its parent lock', async () => {
    const transaction = await sequelize.transaction();
    let record, archive;
    const hookName = `archive-snapshot-${suffix}`;
    let observed;
    const snapshotRead = new Promise(resolve => { observed = resolve; });
    Resident.addHook('afterFind', hookName, (_row, options) => {
      if (options.attributes?.length === 1 && options.attributes[0] === 'barangay') observed();
    });
    try {
      await Resident.findByPk(resident.id, { transaction, lock: transaction.LOCK.UPDATE });
      archive = staff.call(`/admin/residents/${resident.id}/archive`, {});
      await snapshotRead;
      record = await CivilRecord.create({ residentId: resident.id, type: 'birth', registryNumber: `CONCURRENT-${suffix}`, eventDate: data.birthDate, eventPlace: 'Bongabong' }, { transaction });
      await transaction.commit();
      assert.equal((await archive).status, 400);
      assert.equal((await resident.reload()).archivedAt, null);
    } finally {
      Resident.removeHook('afterFind', hookName);
      if (!transaction.finished) await transaction.rollback();
      if (archive) await archive;
      if (record) await record.destroy();
    }
  });
  await t.test('concurrent barangay renaming and resident restoration do not deadlock', async () => {
    assert.equal((await staff.call(`/admin/residents/${resident.id}/archive`, {})).status, 302);
    const renamed = `${data.barangay} Renamed`;
    const results = await Promise.all([staff.call(`/admin/barangays/${barangay.id}`, { name: renamed }), staff.call(`/admin/residents/${resident.id}/archive`, {})]);
    assert.equal(results[0].status, 302);
    assert.ok([302, 409].includes(results[1].status), results[1].html);
    await resident.reload(); assert.equal(resident.barangay, renamed);
    if (resident.archivedAt) assert.equal((await staff.call(`/admin/residents/${resident.id}/archive`, {})).status, 302);
    data.barangay = renamed;
  });
  await t.test('archived residents require an active barangay before restore', async () => {
    const residents = await Resident.findAll({ where: { barangay: data.barangay } });
    for (const row of residents) assert.equal((await staff.call(`/admin/residents/${row.id}/archive`, {})).status, 302);
    assert.equal((await staff.call(`/admin/barangays/${barangay.id}/archive`, {})).status, 302);
    assert.equal((await staff.call(`/admin/residents/${resident.id}/archive`, {})).status, 400);
    assert.equal((await staff.call(`/admin/barangays/${barangay.id}/archive`, {})).status, 302);
    assert.equal((await staff.call(`/admin/residents/${resident.id}/archive`, {})).status, 302);
    assert.equal((await resident.reload()).archivedAt, null);
  });
  await t.test('registrar and front-desk permissions remain separated', async () => {
    for (const path of ['/admin/users', '/admin/audit', '/admin/resources', '/admin/reports?dataset=registry&format=csv']) assert.equal((await staff.call(path)).status, 403, path);
    for (const path of ['/admin/residents', '/admin/barangays', '/admin/population', '/admin/resident-activity', '/admin/registry', '/admin/resources', '/admin/reports', '/admin/users', '/admin/audit', '/admin/budget', '/admin/personnel', '/admin/planning-reports', '/admin/diagrams']) {
      assert.equal((await frontDesk.call(path)).status, 403, path);
    }
    for (const path of ['/admin', '/admin/requests', '/admin/appointments']) assert.equal((await frontDesk.call(path)).status, 200, path);
    const frontDeskHome = await frontDesk.call('/admin');
    assert.ok(frontDeskHome.html.includes('href="/admin/requests"'));
    assert.ok(frontDeskHome.html.includes('href="/admin/appointments"'));
    for (const path of ['/admin/residents', '/admin/reports', '/admin/resources', '/admin/users']) assert.ok(!frontDeskHome.html.includes(`href="${path}"`), path);
    for (const path of ['/admin/barangays', '/admin/population', '/admin/resident-activity', `/admin/residents/${resident.id}/profile`, `/admin/residents/${resident.id}/print`]) {
      assert.equal((await officer.call(path)).status, 403, path); assert.equal((await citizen.call(path)).status, 403, path);
    }
  });
  await t.test('signing out invalidates the saved session before redirecting', async () => {
    const cookie = staff.cookie;
    assert.equal((await staff.call('/logout')).location, '/login');
    const response = await fetch(origin + '/admin', { redirect: 'manual', headers: { Cookie: cookie } });
    assert.equal(response.headers.get('location'), '/login');
  });
});
