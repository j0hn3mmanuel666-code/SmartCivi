import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

test('resource planning dashboard, generated IDs, ledger, exports and diagrams', { skip: !process.env.RUN_DB_TESTS }, async t => {
  assert.match(process.env.DB_NAME || '', /_test$/); process.env.ELECTRON = '1';
  const { default: app } = await import('../index.js');
  const { User, Resource, Allocation, sequelize } = await import('../models/Platform.js');
  const { BudgetItem } = await import('../models/Planning.js');
  const { default: bcrypt } = await import('bcrypt');
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await sequelize.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`, suffix = `${Date.now()}${process.pid}`, password = 'Planning-test-password-123';
  const member = await User.create({ name: 'Resource reviewer', email: `resources-${suffix}@example.test`, password: await bcrypt.hash(password, 4), role: 'resource_officer' });
  let cookie = '', token = '';
  const call = async (path, body) => {
    const r = await fetch(origin + path, { redirect: 'manual', method: body ? 'POST' : 'GET', headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-Token': token } : {}) }, body: body ? new URLSearchParams(body) : undefined });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    const html = await r.text(); token = html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || token;
    return { status: r.status, html, headers: r.headers };
  };
  await call('/login'); await call('/login', { email: member.email, password }); await call('/admin');
  const data = { name: `Planning chair ${suffix}`, category: 'equipment', department: `Planning ${suffix}`, location: 'Municipal hall, room 2', quantity: 4, unit: 'piece', condition: 'good' };
  let resource;
  await t.test('generated codes persist and stock cannot be overwritten through editing', async () => {
    assert.equal((await call('/admin/resources', data)).status, 302);
    resource = await Resource.findOne({ where: { name: data.name } }); assert.match(resource.code, /^RES-\d{4}-\d+/);
    const code = resource.code;
    assert.equal((await call(`/admin/resources/${resource.id}`, { ...data, code: 'FORGED', quantity: 999, location: 'Updated location' })).status, 302);
    await resource.reload(); assert.equal(resource.code, code); assert.equal(resource.quantity, 4); assert.equal(resource.location, 'Updated location');
    assert.equal((await call(`/admin/resources/${resource.id}/move`, { action: 'allocate', quantity: 2, recipient: 'Planning office' })).status, 302);
    assert.equal((await call(`/admin/resources/${resource.id}/archive`, {})).status, 400);
    const assignment = await Allocation.findOne({ where: { resourceId: resource.id } });
    assert.equal((await call(`/admin/resources/${resource.id}/move`, { action: 'return', quantity: 2, allocationId: assignment.id })).status, 302);
    assert.equal((await call(`/admin/resources/${resource.id}`, { ...data, condition: 'poor' })).status, 302);
    assert.equal((await call(`/admin/resources/${resource.id}/move`, { action: 'allocate', quantity: 1, recipient: 'Office' })).status, 400);
  });
  await t.test('dashboard alerts and selected-year budget calculations use live records', async () => {
    const year = 2037;
    await BudgetItem.bulkCreate([{ department: data.department, item: 'Equipment', fiscalYear: year, allocated: '100.10', spent: '150.20' }, { department: data.department, item: 'Other year', fiscalYear: year + 1, allocated: '999.00', spent: '0.00' }]);
    await Resource.create({ code: `LOW-${suffix}`, name: `Low paper ${suffix}`, category: 'supply', department: data.department, unit: 'ream', quantity: 1, minimum: 2, condition: 'good' });
    const dashboard = await call(`/admin?fiscalYear=${year}`); assert.equal(dashboard.status, 200, dashboard.html);
    assert.match(dashboard.html, /Needs attention/); assert.match(dashboard.html, new RegExp(data.name)); assert.match(dashboard.html, new RegExp(`Low paper ${suffix}`)); assert.match(dashboard.html, /150\.05%/);
    assert.match(dashboard.html, /is over budget/); assert.match(dashboard.html, /Active personnel/);
    for (const path of ['/admin/budget', '/admin/personnel', '/admin/planning-reports', '/admin/diagrams']) assert.ok(dashboard.html.includes(`href="${path}"`));
  });
  await t.test('CSV matches list filters across pages and keeps location and formula safety', async () => {
    const prefix = `Formula${suffix}`;
    await Resource.bulkCreate(Array.from({ length: 26 }, (_, index) => ({ ...data, name: `=Formula${suffix}-${index}`, code: `CSV-${suffix}-${index}`, quantity: 1 })));
    const first = await call(`/admin/resources?q=${prefix}`); assert.match(first.html, /Page 1 of 2/); assert.match(first.html, /Export CSV/); assert.match(first.html, /Print table/);
    const print = await call(`/admin/resources?q=${prefix}&print=1`); assert.equal((print.html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1].match(/<tr>/g) || []).length, 26);
    const csv = await call(`/admin/resources?q=${prefix}&format=csv`); assert.equal(csv.status, 200); assert.equal(csv.html.split('\r\n').length, 27); assert.match(csv.html, /"'=Formula/); assert.match(csv.html, /Municipal hall, room 2/);
    const blankCodeForm = await call('/admin/resources/new'); assert.match(blankCodeForm.html, /generated when blank/);
  });
  await t.test('diagram viewer selects one SVG and restricts downloads to manifest entries', async () => {
    const view = await call('/admin/diagrams?diagram=10-use-case-diagram'); assert.equal(view.status, 200); assert.match(view.html, /Use Case Diagram/); assert.match(view.html, /Download SVG/);
    const svg = await call('/admin/diagrams/asset/10-use-case-diagram.svg?download=1'); assert.equal(svg.status, 200); assert.match(svg.headers.get('content-disposition'), /attachment/); assert.match(svg.html, /<svg/);
    assert.equal((await call('/admin/diagrams?diagram=../../.env')).status, 404);
    assert.equal((await call('/admin/diagrams/asset/not-in-manifest.svg')).status, 404);
    await member.update({ role: 'staff' });
    for (const path of ['/admin/resources?format=csv', '/admin/diagrams', '/admin/diagrams/asset/10-use-case-diagram.svg?download=1', '/admin/budget', '/admin/personnel', '/admin/planning-reports']) assert.equal((await call(path)).status, 403, path);
  });
});
