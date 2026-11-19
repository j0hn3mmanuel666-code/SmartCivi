import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

test('planning routes preserve budget cents, personnel ledger, exports and role boundaries', { skip: !process.env.RUN_DB_TESTS }, async t => {
  assert.match(process.env.DB_NAME || '', /_test$/);
  process.env.ELECTRON = '1';
  const { default: app } = await import('../index.js');
  const { User, Resource, Movement, Allocation, Audit, sequelize } = await import('../models/Platform.js');
  const { BudgetItem } = await import('../models/Planning.js');
  const { default: bcrypt } = await import('bcrypt');
  const suffix = `${Date.now()}${process.pid}`, password = 'Planning-test-password-123';
  const users = {};
  for (const role of ['resource_officer', 'staff', 'user']) users[role] = await User.create({ name: `Planning ${role}`, email: `planning-${role}${suffix}@example.test`, password: await bcrypt.hash(password, 4), role });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await sequelize.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const client = () => ({ cookie: '', token: '', async call(path, body) {
    const response = await fetch(origin + path, { redirect: 'manual', method: body ? 'POST' : 'GET', headers: { Cookie: this.cookie, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-Token': this.token } : {}) }, body: body ? new URLSearchParams(body) : undefined });
    if (response.headers.get('set-cookie')) this.cookie = response.headers.get('set-cookie').split(';')[0];
    const html = await response.text(); this.token = html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || this.token;
    return { status: response.status, html, location: response.headers.get('location') };
  }, async login(role) { await this.call('/login'); assert.equal((await this.call('/login', { email: users[role].email, password })).status, 302); await this.call('/login'); } });
  const officer = client(), staff = client(), citizen = client(); await officer.login('resource_officer'); await staff.login('staff'); await citizen.login('user');
  for (const path of ['/admin/budget', '/admin/personnel', '/admin/planning-reports']) {
    assert.equal((await officer.call(path)).status, 200, path);
    assert.equal((await staff.call(path)).status, 403, path);
    assert.equal((await citizen.call(path)).status, 403, path);
  }
  const department = `Planning ${suffix}`;
  const budget = { department, item: `Test item ${suffix}`, fiscalYear: '2026', allocated: '0.30', spent: '0.31' };
  assert.equal((await officer.call('/admin/budget', budget)).status, 302);
  const row = await BudgetItem.findOne({ where: { department } }); assert.ok(row); assert.equal(row.allocated, '0.30');
  assert.equal((await officer.call('/admin/budget', { ...budget, spent: '0.001' })).status, 400);
  const exportBudget = await officer.call(`/admin/budget?fiscalYear=2026&q=${encodeURIComponent(department)}&format=csv`);
  assert.equal(exportBudget.status, 200); assert.ok(exportBudget.html.includes('"-0.01"') || exportBudget.html.includes('"\'-0.01"'));
  assert.ok(!exportBudget.html.includes('₱'));
  assert.ok((await officer.call(`/admin/budget?fiscalYear=2026&q=${encodeURIComponent(department)}`)).html.includes('₱0.30'));
  assert.ok(await Audit.findOne({ where: { actorId: users.resource_officer.id, action: 'report.exported', entity: 'budget' } }));
  assert.ok((await officer.call('/admin/planning-reports?fiscalYear=2026')).html.includes(department));
  assert.equal((await officer.call(`/admin/budget/${row.id}/archive`, {})).status, 302);
  assert.ok((await row.reload()).archivedAt);
  assert.ok(!(await officer.call('/admin/planning-reports?fiscalYear=2026')).html.includes(department));
  assert.equal((await officer.call(`/admin/budget/${row.id}/archive`, {})).status, 302);
  assert.equal((await row.reload()).archivedAt, null);
  const employee = { fullName: `Employee ${suffix}`, position: 'Planner', department, contactNumber: '09123456789', employeeStatus: 'active', category: 'equipment', quantity: '999', code: 'FORGED' };
  assert.equal((await officer.call('/admin/personnel', employee)).status, 302);
  const person = await Resource.findOne({ where: { name: employee.fullName } }); assert.ok(person); assert.equal(person.category, 'personnel'); assert.equal(person.quantity, 1); assert.notEqual(person.code, 'FORGED');
  assert.equal(await Movement.count({ where: { resourceId: person.id, action: 'opening' } }), 1);
  assert.equal((await officer.call(`/admin/resources/${person.id}/move`, { action: 'allocate', quantity: '1', recipient: 'Planning assignment' })).status, 302);
  assert.equal((await officer.call(`/admin/personnel/${person.id}`, { ...employee, employeeStatus: 'on_leave' })).status, 302);
  assert.equal((await person.reload()).quantity, 0); assert.equal(person.employeeStatus, 'on_leave');
  assert.ok((await officer.call(`/admin/personnel?q=${encodeURIComponent(employee.fullName)}&format=csv`)).html.includes('"On leave"'));
  assert.equal((await officer.call(`/admin/personnel/${person.id}/archive`, {})).status, 400);
  assert.ok((await officer.call(`/admin/personnel?q=${encodeURIComponent(employee.fullName)}&format=csv`)).html.includes(employee.fullName));
  const assignment = await Allocation.findOne({ where: { resourceId: person.id } });
  assert.equal((await officer.call(`/admin/resources/${person.id}/move`, { action: 'return', quantity: '1', allocationId: assignment.id })).status, 302);
  assert.equal((await officer.call(`/admin/resources/${person.id}/move`, { action: 'allocate', quantity: '1', recipient: 'Invalid on-leave assignment' })).status, 400);
  assert.equal((await officer.call(`/admin/personnel/${person.id}/archive`, {})).status, 302);
  assert.ok((await person.reload()).archivedAt);
  assert.ok(!(await officer.call(`/admin/personnel?q=${encodeURIComponent(employee.fullName)}&format=csv`)).html.includes(employee.fullName));
  assert.equal((await officer.call(`/admin/personnel/${person.id}/archive`, {})).status, 302);
  assert.equal((await person.reload()).archivedAt, null);
  for (const [employeeStatus, condition, expected] of [['active', 'serviceable', 'Yes'], ['active', 'good', 'Yes'], ['active', 'fair', 'Yes'], ['inactive', 'serviceable', 'Inactive'], ['on_leave', 'good', 'On leave'], ['active', 'poor', 'Unavailable condition']]) {
    await person.update({ employeeStatus, condition });
    const personnelCsv = await officer.call(`/admin/personnel?q=${encodeURIComponent(employee.fullName)}&format=csv`);
    assert.ok(personnelCsv.html.includes(`"${expected}"`), `${employeeStatus}/${condition} should display ${expected}`);
    const personnelHtml = await officer.call(`/admin/personnel?q=${encodeURIComponent(employee.fullName)}`);
    assert.ok(personnelHtml.html.includes(`<td>${expected}</td>`));
  }
  const report = await officer.call('/admin/planning-reports?fiscalYear=2026&print=1');
  assert.equal(report.status, 200); assert.ok(!report.html.includes('Available units')); assert.ok(report.html.includes('₱0.30'));
  assert.equal((await officer.call('/admin/planning-reports?fiscalYear=2026&format=csv')).status, 200);
  for (const entity of ['personnel', 'planning_reports']) assert.ok(await Audit.findOne({ where: { actorId: users.resource_officer.id, action: 'report.exported', entity } }));
  // Simulate large datasets without creating 10,001 records; fail if loading occurs before the count guard.
  for (const [model, path] of [[BudgetItem, '/admin/budget'], [Resource, '/admin/personnel'], [Resource, '/admin/planning-reports']]) {
    const originalCount = model.count, originalFind = model.findAll;
    model.count = async () => 10001;
    model.findAll = async () => { throw new Error('Export loaded records before enforcing count limit'); };
    try {
      for (const format of ['format=csv', 'print=1']) {
        const blocked = await officer.call(`${path}?fiscalYear=2026&${format}`);
        assert.equal(blocked.status, 400); assert.ok(blocked.html.includes('10,000'));
      }
    } finally { model.count = originalCount; model.findAll = originalFind; }
  }
});
