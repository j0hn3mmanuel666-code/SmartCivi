// Disposable local authentication UI check; providers are simulated, no email is sent.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
if (!process.env.DB_NAME?.endsWith('_test') || !process.env.PLAYWRIGHT_MODULE) throw new Error('Use a disposable _test database and set PLAYWRIGHT_MODULE.');
Object.assign(process.env, { ELECTRON: '1', PUBLIC_ORIGIN: 'http://localhost:3000', GOOGLE_CLIENT_ID: 'visual-client', GOOGLE_CLIENT_SECRET: 'visual-secret', SMTP_HOST: 'test.invalid', MAIL_FROM: 'noreply@example.test' });
const { default: app } = await import('../index.js');
const { User, sequelize } = await import('../models/Platform.js');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const sent = []; app.locals.mailTransport = { sendMail: async mail => sent.push(mail) };
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const email = `visual-auth-${Date.now()}@example.test`;
await mkdir('tmp/auth-check', { recursive: true });
try {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ['login', 'register', 'verify-email']) {
      const response = await page.goto(`${origin}/${name}`); assert.equal(response.status(), 200);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow ${name} at ${width}`);
      await page.screenshot({ path: `tmp/auth-check/${name}-${width}.png`, fullPage: true });
    }
  }
  await page.goto(origin + '/register');
  await page.getByLabel('Full name', { exact: true }).fill('Local Verification Test');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Local-verification-test-123');
  await Promise.all([page.waitForURL(origin + '/verify-email'), page.getByRole('button', { name: 'Create account', exact: true }).click()]);
  assert.equal(sent.length, 1);
  await page.goto(origin + '/dashboard'); await page.waitForURL(origin + '/login');
  const token = sent[0].text.match(/token=([a-f0-9]{64})/)[1];
  await page.goto(origin + '/verify-email?token=' + token);
  await page.screenshot({ path: 'tmp/auth-check/confirm-mobile.png', fullPage: true });
  await Promise.all([page.waitForURL(origin + '/login'), page.getByRole('button', { name: 'Confirm email address' }).click()]);
  assert.match(await page.getByRole('status').innerText(), /Email verified/);
  await page.getByLabel('Username or email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Local-verification-test-123');
  await Promise.all([page.waitForURL(origin + '/browse'), page.getByRole('button', { name: 'Sign in', exact: true }).click()]);
  await page.goto(origin + '/dashboard/profile');
  await page.getByLabel('Full name', { exact: true }).fill('Updated Citizen Name');
  await Promise.all([page.waitForResponse(response => response.url().endsWith('/dashboard/profile') && response.request().method() === 'POST'), page.getByRole('button', { name: 'Save name', exact: true }).click()]);
  await page.getByText('Your name has been updated.', { exact: true }).waitFor();
  assert.equal(await page.locator('.sidebar-profile strong').innerText(), 'Updated Citizen Name');
  assert.equal((await User.findOne({ where: { email } })).name, 'Updated Citizen Name');
  assert.equal(await page.getByRole('button', { name: 'Connect Google account' }).count(), 1);
  await page.goto(origin + '/logout');
  Object.assign(process.env, { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', SMTP_HOST: '' }); delete app.locals.mailTransport;
  await page.goto(origin + '/register');
  assert.equal(await page.getByRole('button', { name: 'Create account', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Continue with Google' }).isDisabled(), true);
  await page.screenshot({ path: 'tmp/auth-check/unconfigured-mobile.png', fullPage: true });
  console.log('Auth UI verified at 1440/768/390px; browser registration, email confirmation, sign-in, profile linking control and unconfigured states passed.');
} finally {
  await User.destroy({ where: { email } });
  await browser.close(); await new Promise(resolve => server.close(resolve)); await sequelize.close();
}
