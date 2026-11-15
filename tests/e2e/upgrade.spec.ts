import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { fixture, login, testPassword } from './fixtures';
import { emulatorAdmin, inviteMember } from '../helpers';
import { dispatch } from '../../functions/src/callables/service';

test('3.0 complete cross-role dose, refill, assignment and prescription workflow', async ({
  page,
  browser,
}) => {
  const f = await fixture(),
    circle = f.ctx.db.doc(`careCircles/${f.circleId}`);
  const uid = randomUUID(),
    email = `family-${uid}@example.test`,
    family = { uid, email, name: 'Morgan Family', authTime: Date.now() / 1000 };
  await emulatorAdmin('demo-carecircle').auth.createUser({
    uid,
    email,
    displayName: family.name,
    password: testPassword,
    emailVerified: true,
  });
  const invite = await inviteMember(
    f.ctx,
    f.circleId,
    family,
    [
      'medication.read',
      'appointment.read',
      'inventory.read',
      'task.read',
      'task.act',
      'members.read',
    ],
    'family',
  );
  await dispatch(
    { ...f.ctx, actor: family },
    { action: 'redeem', invitationId: invite.id, code: invite.code },
  );
  await login(page, f.email);
  await page.getByRole('button', { name: 'Mark as Taken', exact: true }).first().click();
  await page.getByRole('button', { name: 'Confirm taken', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/history');
  await page.getByRole('button', { name: 'View confirmation' }).first().click();
  await expect(page.getByRole('dialog', { name: 'SafeDose Shield' })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Alex Morgan', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Confirm taken' })).toHaveCount(
    0,
  );
  await page.keyboard.press('Escape');
  const historical = (
    await circle.collection('doseOccurrences').where('state', '==', 'taken').get()
  ).docs[0]!;
  const original = historical.data();
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Update stock', exact: true }).click();
  await page.getByLabel('Adjustment type').selectOption('set');
  await page.getByLabel('Quantity', { exact: true }).fill('3');
  await page.getByLabel('Reason', { exact: true }).fill('Synthetic initial count');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Request refill', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Refill responsibility is ready' }),
  ).toBeVisible();
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Edit Refill Synthetic medication' }).click();
  await page.getByLabel('Assigned to', { exact: true }).selectOption(uid);
  await page.getByRole('button', { name: 'Save responsibility' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const familyContext = await browser.newContext(),
    familyPage = await familyContext.newPage();
  const caregiverContext = await browser.newContext(),
    caregiverPage = await caregiverContext.newPage();
  await login(caregiverPage, f.caregiverEmail);
  await login(familyPage, email);
  await familyPage.getByRole('link', { name: 'Responsibilities', exact: true }).first().click();
  await familyPage.getByRole('button', { name: 'Accept', exact: true }).click();
  await familyPage.getByRole('button', { name: 'Confirm update' }).click();
  await expect(familyPage.getByText('accepted', { exact: true })).toBeVisible();
  await expect(
    caregiverPage.locator('.pulse-stat').filter({ hasText: 'Responsibilities' }).locator('strong'),
  ).toHaveText('0');
  await familyPage.goto('/prescriptions');
  await expect(
    familyPage.getByRole('heading', { name: 'This view isn’t in your care access' }),
  ).toBeVisible();
  await page.goto('/prescriptions');
  await page.getByRole('button', { name: 'Prepare a comparison' }).click();
  await page.getByLabel('Clinician-issued source').fill('Synthetic clinician discharge sheet');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByLabel('Clinician-provided dose instructions')
    .fill('Updated synthetic clinician instruction');
  await page.getByRole('button', { name: 'Use in comparison' }).click();
  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(page.getByRole('dialog', { name: 'Before and after' })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Modified', { exact: true })).toBeVisible();
  await page
    .getByRole('checkbox', {
      name: 'I verified every change against the clinician-issued prescription.',
    })
    .check();
  await page.getByRole('button', { name: 'Verify and apply', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('applied', { exact: true })).toBeVisible();
  expect((await historical.ref.get()).data()).toEqual(original);
  const future = await circle
    .collection('doseOccurrences')
    .where('scheduledAt', '>', Date.now())
    .get();
  expect(
    future.docs.some(
      (doc) =>
        doc.get('scheduleVersion') === 2 &&
        doc.get('instructions') === 'Updated synthetic clinician instruction',
    ),
  ).toBe(true);
  await familyContext.close();
  await caregiverContext.close();
});

test('appointment preparation, check-in, contact consent and private passport persist', async ({
  page,
}) => {
  const f = await fixture();
  await login(page, f.email);
  await page.goto('/appointments');
  await page.getByRole('button', { name: 'Add appointment', exact: true }).click();
  await page.getByLabel('Clinician', { exact: true }).fill('Dr. Synthetic Review');
  await page
    .getByLabel('Date', { exact: true })
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  await page.getByLabel('Hospital / location').fill('Synthetic clinic');
  await page.getByRole('button', { name: 'Create appointment' }).click();
  await page.getByRole('button', { name: 'Prepare / visit notes' }).click();
  await page.getByLabel('Questions for your clinician').fill('Review the recorded schedule');
  await page.getByLabel('Add checklist item').fill('Bring current medication list');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByLabel('Bring current medication list').check();
  await page.getByRole('button', { name: 'Save preparation' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Appointment preparation saved.' }),
  ).toBeVisible();
  await page.getByLabel('Follow-up responsibility').fill('Confirm next review date');
  await page.getByRole('button', { name: 'Create follow-up task' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Follow-up created' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Prepare / visit notes' }).click();
  await expect(page.getByLabel('Questions for your clinician')).toHaveValue(
    'Review the recorded schedule',
  );
  await page.keyboard.press('Escape');
  await page.goto('/wellbeing');
  await page.getByRole('button', { name: 'I’m okay', exact: true }).click();
  await expect(page.getByText('You reported that you are okay.', { exact: false })).toBeVisible();
  await page.goto('/settings');
  await page.getByLabel('Share my account email and optional phone with my care circle').check();
  await page.getByRole('button', { name: 'Save contact sharing' }).click();
  await page.reload();
  await expect(
    page.getByLabel('Share my account email and optional phone with my care circle'),
  ).toBeChecked();
  await page.goto('/passport');
  await page.getByRole('button', { name: 'Generate private summary' }).click();
  await expect(
    page.locator('.care-passport').getByText('Synthetic medication', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print / save PDF' })).toBeVisible();
});

test('responsive layouts, calendar keyboard control and language selection', async ({ page }) => {
  const f = await fixture();
  await login(page, f.email);
  for (const width of [360, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `overflow at ${width}`,
    ).toBe(true);
    await page.screenshot({ path: `docs/screenshots/careday-${width}.png`, fullPage: true });
  }
  const calendar = page.getByRole('region', { name: 'Calendar', exact: true });
  await calendar.locator('button.calendar-day[tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(calendar.locator('button.calendar-day[tabindex="0"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.getByLabel('Language', { exact: true }).selectOption('ta');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ta');
  await expect(page.getByRole('link', { name: 'என் மருந்துகள்', exact: true }).first()).toBeVisible();
  await page.locator('.language-picker select').selectOption('hi');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await page.locator('.language-picker select').selectOption('en');
  await page.goto('/settings');
  await page.getByLabel('Larger text', { exact: true }).check();
  await page.getByLabel('Higher contrast', { exact: true }).check();
  await page.goto('/dashboard');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/screenshots/accessibility-large-text.png', fullPage: true });
});

test('@a11y new care dialogs and mobile care day meet automated WCAG checks', async ({ page }) => {
  const f = await fixture();
  await login(page, f.email);
  for (const [route, button] of [
    ['/tasks', 'Add responsibility'],
    ['/inventory', 'Update stock'],
    ['/prescriptions', 'Prepare a comparison'],
  ] as const) {
    await page.goto(route);
    await page.getByRole('button', { name: button, exact: true }).click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
      route,
    ).toEqual([]);
    await page.keyboard.press('Escape');
  }
  await page.goto('/dashboard');
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});
