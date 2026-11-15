import { randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import type { Page } from '@playwright/test';
import { context, emulatorAdmin, inviteMember, medication, profile } from '../helpers';
import { dispatch } from '../../functions/src/callables/service';
export const testPassword = 'CareCircle-test-only-2026!';
export async function fixture() {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
  const { auth } = emulatorAdmin('demo-carecircle');
  const uid = randomUUID(),
    email = `elder-${uid}@example.test`,
    now = Date.now();
  await auth.createUser({
    uid,
    email,
    password: testPassword,
    emailVerified: true,
    displayName: 'Alex Morgan',
  });
  const base = context(
    { uid, email, name: 'Alex Morgan', authTime: now / 1000 },
    'demo-carecircle',
  );
  const ctx = { ...base.ctx, now };
  const circleId = String(
    (await dispatch(ctx, { action: 'createCircle', profile, requestId: randomUUID() })).circleId,
  );
  const day = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO('UTC');
  const due = day.with({ minute: 0, second: 0, millisecond: 0 });
  await dispatch(
    { ...ctx, now: now - 3600000 },
    {
      action: 'saveMedication',
      circleId,
      resourceId: randomUUID(),
      version: 0,
      medication: {
        ...medication,
        startDate: day.subtract({ days: 1 }).toPlainDate().toString(),
        times: [due.toPlainTime().toString().slice(0, 5)],
      },
    },
  );
  const caregiverUid = randomUUID(),
    caregiverEmail = `care-${caregiverUid}@example.test`;
  await auth.createUser({
    uid: caregiverUid,
    email: caregiverEmail,
    password: testPassword,
    emailVerified: true,
    displayName: 'Jamie Caregiver',
  });
  const caregiver = {
    uid: caregiverUid,
    email: caregiverEmail,
    name: 'Jamie Caregiver',
    authTime: now / 1000,
  };
  const invitation = await inviteMember(ctx, circleId, caregiver, [
    'medication.read',
    'medication.write',
    'medication.confirm',
    'appointment.read',
    'appointment.write',
    'adherence.read',
    'alert.read',
    'alert.acknowledge',
    'assistance.respond',
    'audit.read',
    'members.read',
    'inventory.read',
    'inventory.write',
    'task.read',
    'task.act',
    'task.manage',
    'prescription.read',
    'prescription.write',
    'prescription.approve',
    'passport.read',
    'checkin.read',
  ]);
  await dispatch(
    { ...ctx, actor: caregiver },
    { action: 'redeem', invitationId: invitation.id, code: invitation.code },
  );
  return { ctx, circleId, email, uid, caregiverEmail, caregiver };
}
export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await page
    .getByRole('heading', { name: /Good (morning|afternoon|evening)|Care Overview/ })
    .waitFor();
}
