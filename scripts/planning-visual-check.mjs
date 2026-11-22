import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
if (!process.env.DB_NAME?.endsWith('_test') || !process.env.PLAYWRIGHT_MODULE) throw new Error('Use a disposable _test database and PLAYWRIGHT_MODULE.');
process.env.ELECTRON = '1';
const { default: app } = await import('../index.js');
const { User, Resource, sequelize } = await import('../models/Platform.js');
const { BudgetItem } = await import('../models/Planning.js');
const { default: bcrypt } = await import('bcrypt');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`, suffix = Date.now(), password = 'Planning-visual-password-123', fiscalYear = '2041';
const officer = await User.create({ name: 'Planning review officer', email: `plan-visual-${suffix}@example.test`, password: await bcrypt.hash(password, 4), role: 'resource_officer' });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  await mkdir('tmp/planning-check', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/login'); await page.locator('[name=email]').fill(officer.email); await page.locator('[name=password]').fill(password);
  await Promise.all([page.waitForURL(origin + '/admin'), page.getByRole('button', { name: 'Sign in', exact: true }).click()]);
  await page.goto(origin + '/admin/budget/new');
  for (const [name, value] of Object.entries({ department: `Planning UI ${suffix}`, item: 'Office equipment', fiscalYear, allocated: '1000.10', spent: '1200.20' })) await page.locator(`[name=${name}]`).fill(value);
  await Promise.all([page.waitForURL(/\/admin\/budget\/\d+$/), page.getByRole('button', { name: 'Save budget item', exact: true }).click()]);
  const budgetId = page.url().split('/').pop();
  await page.goto(origin + '/admin/personnel/new');
  for (const [name, value] of Object.entries({ fullName: `Personnel UI ${suffix}`, position: 'Planning officer', department: `Planning UI ${suffix}`, contactNumber: '09123456789' })) await page.locator(`[name=${name}]`).fill(value);
  await Promise.all([page.waitForURL(/\/admin\/personnel\/\d+$/), page.getByRole('button', { name: 'Save employee', exact: true }).click()]);
  const personnelId = page.url().split('/').pop();
  await page.goto(origin + '/admin/resources/new');
  for (const [name, value] of Object.entries({ name: `Equipment UI ${suffix}`, department: `Planning UI ${suffix}`, quantity: '3', location: 'Municipal hall, planning office' })) await page.locator(`[name=${name}]`).fill(value);
  await page.locator('[name=category]').selectOption('equipment'); await page.locator('[name=condition]').selectOption('poor');
  await Promise.all([page.waitForURL(/\/admin\/resources\/\d+$/), page.getByRole('button', { name: 'Save record', exact: true }).click()]);
  const resourceId = page.url().split('/').pop();
  const paths = [`/admin?fiscalYear=${fiscalYear}`, `/admin/resources?q=${suffix}`, '/admin/resources/new', `/admin/resources/${resourceId}`, `/admin/budget?fiscalYear=${fiscalYear}&q=${suffix}`, '/admin/budget/new', `/admin/budget/${budgetId}`, `/admin/personnel?q=${suffix}`, '/admin/personnel/new', `/admin/personnel/${personnelId}`, `/admin/planning-reports?fiscalYear=${fiscalYear}`, '/admin/diagrams?diagram=01-system-architecture', '/admin/diagrams?diagram=12-sequence-diagram'];
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [index, path] of paths.entries()) {
      const response = await page.goto(origin + path); assert.equal(response.status(), 200, path);
      assert.ok(await page.locator('h1').innerText());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow ${width} ${path}`);
      if (path.includes('/resources?q=')) assert.equal(await page.locator('.badge[data-state=poor]').count(), 1);
      if (path.includes('/diagrams?')) assert.equal(await page.locator('.diagram-preview img').evaluate(image => image.complete && image.naturalWidth > 0), true);
      await page.screenshot({ path: `tmp/planning-check/${width}-${index}.png`, fullPage: true });
    }
    console.log(`Planning screens verified at ${width}px`);
  }
  await page.goto(origin + '/admin/diagrams?diagram=12-sequence-diagram');
  const download = page.waitForEvent('download'); await page.getByRole('link', { name: 'Download SVG', exact: true }).click(); assert.match((await download).suggestedFilename(), /12-sequence-diagram.svg/);
  for (const [name, path] of [['report', `/admin/planning-reports?fiscalYear=${fiscalYear}&print=1`], ['diagram', '/admin/diagrams?diagram=01-system-architecture']]) {
    await page.goto(origin + path); await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.workspace-sidebar').isVisible(), false);
    await page.pdf({ path: `tmp/planning-check/${name}.pdf`, format: 'A4', printBackground: true });
    await page.emulateMedia({ media: 'screen' });
  }
  await page.goto(origin + `/admin/budget/${budgetId}`);
  page.once('dialog', dialog => dialog.accept());
  await Promise.all([page.waitForURL(origin + '/admin/budget'), page.getByRole('button', { name: 'Archive budget item', exact: true }).click()]);
  assert.ok((await BudgetItem.findByPk(budgetId)).archivedAt);
  assert.equal((await Resource.findByPk(personnelId)).category, 'personnel');
  assert.deepEqual(errors, []);
  console.log('Planning browser forms, condition badges, 13 screens at desktop/tablet/mobile, confirmed archive, SVG download and print PDFs passed.');
} finally {
  await browser.close(); await officer.destroy(); await new Promise(resolve => server.close(resolve)); await sequelize.close();
}
