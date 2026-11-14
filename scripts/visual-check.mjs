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
const citizen = await User.create({ name: 'Maria Santos', email: `citizen-${Date.now()}@example.test`, password: await bcrypt.hash(password, 4), role: 'user' });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const { default: hbs } = await import('hbs');
  for (const file of await readdir('views')) if (file.endsWith('.xian')) hbs.handlebars.precompile(await readFile(`views/${file}`, 'utf8'));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Manila' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/login');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 950 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Login overflow ${width}`);
    assert.equal(await page.locator('script[src*="tailwindcss"]').count(), 0);
    await page.screenshot({ path: `tmp/auth-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[name=password]').fill('Visibility check');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  assert.equal(await page.locator('[name=password]').getAttribute('type'), 'text');
  assert.equal(await page.locator('[name=password]').inputValue(), 'Visibility check');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  assert.equal(await page.locator('[name=password]').getAttribute('type'), 'password');
  await page.locator('[name=email]').fill(email);
  await page.locator('[name=password]').fill('Incorrect-local-test-password');
  await Promise.all([page.waitForResponse(response => response.url().endsWith('/login') && response.request().method() === 'POST'), page.locator('button[type=submit]').click()]);
  await page.getByRole('alert').waitFor({ state: 'visible' });
  assert.match(await page.getByRole('alert').innerText(), /password/i);
  await page.screenshot({ path: 'tmp/auth-error.png', fullPage: true });
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await Promise.all([page.waitForURL(origin + '/admin'), page.locator('button[type=submit]').click()]);
  await mkdir('tmp/visual-check', { recursive: true });
  const resource = await Resource.findOne({ order: [['id', 'DESC']] });
  const paths = ['/admin', '/admin/residents', '/admin/residents/new', '/admin/registry', '/admin/resources', ...(resource ? [`/admin/resources/${resource.id}`] : []), '/admin/reports', '/admin/users', '/admin/appointments', '/dashboard/notifications'];
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [i, path] of paths.entries()) {
      const response = await page.goto(origin + path);
      assert.equal(response.status(), 200, path);
      assert.ok(await page.locator('h1').innerText(), path);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `Page overflow ${width} ${path}`);
      assert.equal(await page.locator('script[src*="tailwindcss"]').count(), 0, `No browser CSS compiler needed for ${path}`);
      if (path === '/admin') {
        if (width === 1440) {
          const toggle = page.locator('[data-sidebar-toggle]');
          assert.equal(await toggle.isVisible(), true);
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          assert.equal(await page.locator('#workspace-navigation').isVisible(), false);
          await page.goto(origin + '/admin/residents');
          assert.equal(await page.locator('[data-sidebar-toggle]').getAttribute('aria-expanded'), 'false');
          await page.locator('[data-sidebar-toggle]').click();
          assert.equal(await page.locator('#workspace-navigation').isVisible(), true);
          await page.goto(origin + '/admin');
        }
        assert.equal(await page.locator('.workspace-header').evaluate(header => Math.round(header.getBoundingClientRect().height)), 66);
        console.log(JSON.stringify({ role: 'admin', width, headerHeight: Math.round(await page.locator('.office-header').evaluate(header => header.getBoundingClientRect().height)), tailwindCompiler: false }));
        if (width === 390) {
          const toggle = page.locator('[data-sidebar-toggle]');
          await toggle.click();
          assert.equal(await page.locator('#workspace-navigation').getAttribute('role'), 'dialog');
          assert.equal(await page.locator('#workspace-navigation a[href="/admin/users"]').isVisible(), true);
          assert.equal(await page.locator('main').evaluate(main => main.inert), true);
          await page.locator('#workspace-navigation a[href="/logout"]').focus();
          await page.keyboard.press('Tab');
          assert.equal(await page.locator('#workspace-navigation').evaluate(sidebar => sidebar.contains(document.activeElement)), true);
          await page.screenshot({ path: 'tmp/visual-check/mobile-navigation.png', fullPage: false });
          await page.keyboard.press('Escape');
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          assert.equal(await toggle.evaluate(button => document.activeElement === button), true);
          assert.equal(await page.locator('main').evaluate(main => main.inert), false);
          await toggle.click();
          await page.locator('.workspace-backdrop').click({ position: { x: 365, y: 120 } });
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          await toggle.click();
          await page.setViewportSize({ width: 1440, height: 1000 });
          assert.equal(await page.locator('main').evaluate(main => main.inert), false);
          assert.equal(await page.locator('#workspace-navigation').getAttribute('role'), null);
          await page.setViewportSize({ width: 390, height: 1000 });
        }
      }
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
  const citizenPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  citizenPage.on('pageerror', error => errors.push(error.message));
  await citizenPage.goto(origin + '/login');
  await citizenPage.locator('[name=email]').fill(citizen.email);
  await citizenPage.locator('[name=password]').fill(password);
  await Promise.all([citizenPage.waitForURL(origin + '/browse'), citizenPage.locator('button[type=submit]').click()]);
  for (const width of [1440, 390]) {
    await citizenPage.setViewportSize({ width, height: 1000 });
    for (const [index, path] of ['/browse', '/dashboard', '/dashboard/my-requests', '/my-appointments', '/payments', '/records', '/request/submit', '/appoint', '/offices'].entries()) {
      assert.equal((await citizenPage.goto(origin + path)).status(), 200, path);
      assert.equal(await citizenPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Citizen overflow ${width} ${path}`);
      assert.equal(await citizenPage.locator('#workspace-navigation').count(), 1, `Shared sidebar ${path}`);
      assert.equal(await citizenPage.locator('body > nav').count(), 0, `No old top navigation ${path}`);
      assert.equal(await citizenPage.locator('[data-sidebar-toggle]').isVisible(), true, `Hamburger available ${path}`);
      if (path === '/browse') {
        await citizenPage.locator('#serviceSearch').fill('appointment');
        assert.equal(await citizenPage.locator('.service-card:visible').count(), 2);
        await citizenPage.locator('#serviceSearch').fill('no-such-service');
        assert.equal(await citizenPage.locator('#serviceEmpty').isVisible(), true);
        await citizenPage.locator('#serviceSearch').fill('');
        assert.equal(await citizenPage.locator('.service-card:visible').count(), 8);
      }
      if (path === '/dashboard') console.log(JSON.stringify({ role: 'user', width, headerHeight: Math.round(await citizenPage.locator('.office-header').evaluate(header => header.getBoundingClientRect().height)), tailwindCompiler: false }));
      await citizenPage.screenshot({ path: `tmp/visual-check/citizen-${width}-${index}.png`, fullPage: true });
    }
  }
  await citizenPage.close();
  assert.deepEqual(errors, []);
  console.log(`Browser passed: ${paths.length} office screens at 1440/1024/768/390px and 9 citizen screens at desktop/mobile; consistent navigation, desktop toggle/persistence, service filtering, drawer focus/resize/Escape/backdrop verified; no overflow/JS errors.`);
} finally {
  await browser.close();
  await User.destroy({ where: { id: user.id } });
  await citizen.destroy();
  await new Promise(resolve => server.close(resolve));
  await sequelize.close();
}
