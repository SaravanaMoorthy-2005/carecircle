import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fixture, login, testPassword } from './fixtures';
import { emulatorAdmin } from '../helpers';
import { dispatch } from '../../functions/src/callables/service';
import { processJobs } from '../../functions/src/notifications/worker';

test('registration, email verification and profile onboarding', async ({ page }) => {
  const email = `new-${randomUUID()}@example.test`;
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Taylor New');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByLabel('Confirm password', { exact: true }).fill(testPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'One more step: verify your email' }),
  ).toBeVisible();
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
  const { auth } = emulatorAdmin('demo-carecircle');
  const user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { emailVerified: true });
  await page.getByRole('button', { name: 'I’ve verified my email' }).click();
  await page.getByLabel('Profile name').fill('Taylor New');
  await page.getByLabel(/I agree to store/).check();
  await page.getByRole('button', { name: 'Save care profile' }).click();
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening), Taylor/ }),
  ).toBeVisible();
});

test('medication creation and keyboard confirmation synchronize two authenticated browsers', async ({
  page,
  browser,
}) => {
  const f = await fixture();
  const otherContext = await browser.newContext();
  const caregiver = await otherContext.newPage();
  await login(page, f.email);
  await login(caregiver, f.caregiverEmail);
  await page.getByRole('button', { name: 'Mark as Taken', exact: true }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Confirm this dose was taken' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm taken', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await caregiver.goto('/history');
  await expect(caregiver.getByText('taken', { exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'My Medicines', exact: true }).click();
  await page.getByRole('button', { name: 'Add medication', exact: true }).click();
  await page.getByLabel('Medication name', { exact: true }).fill('New synthetic medication');
  await page.getByLabel('Strength / formulation').fill('Synthetic strength');
  await page
    .getByLabel('Clinician-provided dose instructions')
    .fill('Synthetic prescribed instructions');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Add medication', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'New synthetic medication', exact: true }),
  ).toBeVisible();
  await otherContext.close();
});

test('appointment creation, reschedule and cancellation persist', async ({ page }) => {
  const f = await fixture();
  await login(page, f.email);
  await page.getByRole('link', { name: 'Appointments', exact: true }).click();
  await page.getByRole('button', { name: 'Add appointment', exact: true }).click();
  await page.getByLabel('Clinician', { exact: true }).fill('Dr. Test');
  await page
    .getByLabel('Date', { exact: true })
    .fill(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
  await page.getByLabel('Hospital / location').fill('Synthetic clinic');
  await page.getByRole('button', { name: 'Create appointment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dr. Test', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit / reschedule' }).click();
  await page.getByLabel('Time', { exact: true }).fill('14:30');
  await page.getByRole('button', { name: 'Save appointment changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel appointment', exact: true }).click();
  await expect(page.getByText('cancelled', { exact: true })).toBeVisible();
});

test('assistance reaches caregiver and progresses through acknowledgement and outcome', async ({
  page,
  browser,
}) => {
  const f = await fixture();
  await login(page, f.email);
  await page.getByRole('link', { name: 'Need Help', exact: true }).click();
  await page.getByRole('button', { name: 'Medication assistance', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Medication assistance', exact: true }),
  ).toBeVisible();
  await processJobs({ ...f.ctx, now: Date.now() });
  const second = await browser.newContext();
  const caregiver = await second.newPage();
  await login(caregiver, f.caregiverEmail);
  await caregiver.getByRole('link', { name: 'Need Help', exact: true }).click();
  await caregiver.getByRole('button', { name: 'I’ll follow up' }).click();
  await expect(page.getByText('acknowledged', { exact: true })).toBeVisible();
  await caregiver.getByRole('button', { name: 'Record outcome' }).click();
  await caregiver
    .getByLabel('Outcome', { exact: true })
    .fill('Called and discussed the care request.');
  await caregiver.getByRole('button', { name: 'Resolve request' }).click();
  await expect(page.getByText('resolved', { exact: true })).toBeVisible();
  await second.close();
});

test('unconfirmed dose escalates to caregiver with a working resolution flow', async ({ page }) => {
  const f = await fixture();
  await processJobs({ ...f.ctx, now: Date.now() + 3600000 });
  await login(page, f.caregiverEmail);
  await page.getByRole('link', { name: 'Notifications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unconfirmed dose — check in' })).toBeVisible();
  await page.getByRole('button', { name: 'I’ll follow up' }).first().click();
  await page.getByRole('button', { name: 'Record outcome' }).first().click();
  await page.getByLabel('Outcome', { exact: true }).fill('Followed up with the profile owner.');
  await page.getByRole('button', { name: 'Resolve request' }).click();
  await expect(page.getByText('resolved', { exact: true }).first()).toBeVisible();
});

test('membership revocation removes protected UI immediately', async ({ page }) => {
  const f = await fixture();
  await login(page, f.caregiverEmail);
  await expect(
    page.getByRole('heading', { name: 'Synthetic medication', exact: true }).first(),
  ).toBeVisible();
  await dispatch(
    { ...f.ctx, now: Date.now() },
    {
      action: 'member',
      circleId: f.circleId,
      uid: f.caregiver.uid,
      permissions: [],
      status: 'revoked',
    },
  );
  await expect(
    page.getByRole('heading', { name: 'Synthetic medication', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Create your care circle' })).toBeVisible();
});

test('mobile medication management has no horizontal overflow', async ({ page }) => {
  const f = await fixture();
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, f.email);
  await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'My Medicines', exact: true }).click();
  await page.getByRole('button', { name: 'Add medication', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('private routes redirect unauthenticated visitors', async ({ page }) => {
  await page.goto('/medications');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('an emailed invitation is created by the owner and redeemed through the browser', async ({
  page,
  browser,
}) => {
  const f = await fixture(),
    uid = randomUUID(),
    email = `invited-${uid}@example.test`;
  const { auth } = emulatorAdmin('demo-carecircle');
  await auth.createUser({ uid, email, password: testPassword, emailVerified: true });
  await login(page, f.email);
  await page.getByRole('link', { name: 'My Care Circle', exact: true }).click();
  await page.getByRole('button', { name: 'Invite someone' }).click();
  await page.getByLabel('Their email address').fill(email);
  await page.getByRole('button', { name: 'Send invitation', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const files = await readdir('functions/.runtime/mail');
  let body = '';
  for (const filename of files) {
    const mail = JSON.parse(await readFile(`functions/.runtime/mail/${filename}`, 'utf8')) as {
      to: string;
      text: string;
    };
    if (mail.to === email) body = mail.text;
  }
  const invitationId = body.match(/Invitation ID: ([a-zA-Z0-9-]+)/)?.[1],
    code = body.match(/single-use code: (\d{8})/)?.[1];
  expect(invitationId).toBeTruthy();
  expect(code).toBeTruthy();
  const second = await browser.newContext(),
    invitee = await second.newPage();
  await invitee.goto('/login');
  await invitee.getByLabel('Email address').fill(email);
  await invitee.getByLabel('Password', { exact: true }).fill(testPassword);
  await invitee.getByRole('button', { name: 'Sign in securely' }).click();
  await expect(invitee.getByRole('heading', { name: 'Create your care circle' })).toBeVisible();
  await invitee.getByRole('link', { name: 'Join an existing care circle' }).click();
  await invitee.getByLabel('Invitation ID', { exact: true }).fill(invitationId!);
  await invitee.getByLabel('8-digit invitation code').fill(code!);
  await invitee.getByRole('button', { name: 'Join care circle', exact: true }).click();
  await expect(invitee.getByRole('heading', { name: /Care Overview/ })).toBeVisible();
  await second.close();
});

test('care insights, encrypted notes and preferences work through the UI', async ({ page }) => {
  const f = await fixture();
  await login(page, f.email);
  await page.screenshot({ path: 'docs/screenshots/dashboard.png', fullPage: true });
  await page.getByRole('link', { name: 'More', exact: true }).first().click();
  await page.getByRole('link', { name: /Care insights/ }).click();
  await expect(page.getByRole('heading', { name: 'A week of care' })).toBeVisible();
  await page.goto('/settings');
  await page
    .getByLabel('Private note', { exact: true })
    .fill('Synthetic private note for browser verification.');
  await page.getByRole('button', { name: 'Save encrypted note' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Changes saved.' })).toBeVisible();
  await page.getByLabel('Private note', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Load private note' }).click();
  await expect(page.getByLabel('Private note', { exact: true })).toHaveValue(
    'Synthetic private note for browser verification.',
  );
  await page.getByLabel('Larger text', { exact: true }).check();
  await expect(page.locator('html')).toHaveClass(/large-text/);
  await page.getByLabel('Higher contrast', { exact: true }).check();
  await expect(page.locator('html')).toHaveClass(/high-contrast/);
  await page.getByLabel('Receive care updates by email').uncheck();
  await page.getByRole('button', { name: 'Save notification preferences' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Changes saved.' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Receive care updates by email')).not.toBeChecked();
});

test('@a11y public, care, forms and settings pass automated accessibility checks', async ({
  page,
}) => {
  for (const route of ['/', '/login', '/signup', '/reset-password', '/privacy']) {
    await page.goto(route);
    await page.getByRole('main').waitFor();
    if (route === '/login') {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: 'docs/screenshots/login.png', fullPage: true });
    }
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect.soft(result.violations, route).toEqual([]);
  }
  const f = await fixture();
  await login(page, f.email);
  for (const route of [
    '/dashboard',
    '/medications',
    '/appointments',
    '/members',
    '/alerts',
    '/assistance',
    '/settings',
    '/more',
    '/inventory',
    '/tasks',
    '/prescriptions',
    '/passport',
    '/wellbeing',
    '/handoff',
  ]) {
    await page.goto(route);
    await page.getByRole('heading', { level: 1 }).waitFor();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect.soft(result.violations, route).toEqual([]);
    if (route === '/medications' || route === '/appointments' || route === '/members') {
      await page
        .getByRole('button', {
          name:
            route === '/medications'
              ? 'Add medication'
              : route === '/appointments'
                ? 'Add appointment'
                : 'Invite someone',
          exact: true,
        })
        .click();
      await expect.soft(page.getByRole('dialog')).toBeVisible();
      expect
        .soft(
          (
            await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
              .analyze()
          ).violations,
        )
        .toEqual([]);
      await page.keyboard.press('Escape');
    }
  }
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login(page, f.caregiverEmail);
  expect
    .soft(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    )
    .toEqual([]);
});
