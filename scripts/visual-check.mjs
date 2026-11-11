// Optional local browser verification; uses a supplied Playwright install, no app dependency.
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
if (!process.env.DB_NAME?.endsWith('_test')) throw new Error('Visual checks require a disposable _test database.');
if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to the installed playwright/index.mjs path.');
process.env.ELECTRON = '1';
const { default: app } = await import('../index.js');
const { User, Resource, sequelize } = await import('../models/Platform.js');
const { default: bcrypt } = await import('bcrypt');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const email = `visual-${Date.now()}@example.test`, password = 'Local-visual-test-123';
const user = await User.create({ name: 'Visual review administrator', email, password: await bcrypt.hash(password, 4), role: 'admin' });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const { default: hbs } = await import('hbs');
  for (const file of await readdir('views')) if (file.endsWith('.xian')) hbs.handlebars.precompile(await readFile(`views/${file}`, 'utf8'));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Manila' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await Promise.all([page.waitForURL(origin + '/admin'), page.locator('button[type=submit]').click()]);
  await mkdir('tmp/visual-check', { recursive: true });
  const resource = await Resource.findOne({ order: [['id', 'DESC']] });
  const paths = ['/admin', '/admin/residents', '/admin/residents/new', '/admin/registry', '/admin/resources', ...(resource ? [`/admin/resources/${resource.id}`] : []), '/admin/reports', '/admin/users', '/admin/appointments'];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [i, path] of paths.entries()) {
      const response = await page.goto(origin + path);
      assert.equal(response.status(), 200, path);
      assert.ok(await page.locator('h1').innerText(), path);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `Page overflow ${width} ${path}`);
      await page.screenshot({ path: `tmp/visual-check/${width}-${i}.png`, fullPage: true });
    }
  }
  // A real browser submits a new resident form with the injected CSRF input.
  await page.goto(origin + '/admin/residents/new');
  const suffix = Date.now();
  for (const [key, value] of Object.entries({ residentCode: `VIS-${suffix}`, firstName: `Visual${suffix}`, lastName: 'Sample', birthDate: '2000-01-01', barangay: 'Poblacion' })) await page.locator(`[name=${key}]`).fill(value);
  await Promise.all([page.waitForURL(/\/admin\/residents\/\d+$/), page.getByRole('button', { name: 'Save record', exact: true }).click()]);
  assert.match(await page.locator('body').innerText(), /saved/i);
  await page.goto(origin + '/appoint');
  await page.locator('#region').selectOption({ index: 1 });
  await page.locator('#phone').fill('09123456789');
  await page.locator('#toStep2').click();
  await page.locator('#relationship').selectOption({ index: 1 });
  await page.locator('#givenName').fill('Sample');
  await page.locator('#familyName').fill('Client');
  await page.locator('#birthdate').fill('2000-01-01');
  await page.locator('#toStep3').click();
  const dates = await page.locator('#datesGrid button').evaluateAll(buttons => buttons.map(button => ({ label: button.textContent, value: button.dataset.date })));
  assert.ok(dates.length > 0);
  for (const entry of dates) assert.equal(new Date(`${entry.value}T00:00:00`).toLocaleDateString('en-US'), new Date(entry.label).toLocaleDateString('en-US'), `Calendar day mismatch: ${entry.label} / ${entry.value}`);
  assert.deepEqual(errors, []);
  console.log(`Browser passed: ${paths.length} screens at 1440px and 390px, all templates compile, no page overflow or JS errors, real form submission saved.`);
} finally {
  await browser.close();
  await User.destroy({ where: { id: user.id } });
  await new Promise(resolve => server.close(resolve));
  await sequelize.close();
}
