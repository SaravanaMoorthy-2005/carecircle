import { defaultRolePermissions, type Permission, type Member } from '@carecircle/shared';
import { directoryMember } from '../functions/src/repositories/context';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { dispatch } from '../functions/src/callables/service';
import { processJobs } from '../functions/src/notifications/worker';
import { context, emulatorAdmin, inviteMember, medication, profile } from '../tests/helpers';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
const { auth } = emulatorAdmin('demo-carecircle');
const password = 'CareCircle-demo-2026!';
const identities = [
  ['demo-elder', 'elder@carecircle.test', 'Evelyn Harper'],
  ['demo-caregiver', 'caregiver@carecircle.test', 'Daniel Reyes'],
  ['demo-family', 'family@carecircle.test', 'Maya Harper'],
] as const;
for (const [uid, email, displayName] of identities) {
  try {
    await auth.createUser({ uid, email, displayName, password, emailVerified: true });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error &&
      'code' in error &&
      error.code === 'auth/uid-already-exists'
    )
      await auth.updateUser(uid, { password, emailVerified: true, displayName });
    else throw error;
  }
}
const now = Date.now(),
  base = context(
    {
      uid: 'demo-elder',
      email: 'elder@carecircle.test',
      name: 'Evelyn Harper',
      authTime: now / 1000,
    },
    'demo-carecircle',
  );
const ctx = {
  ...base.ctx,
  now,
  mailer: {
    async send(mail: unknown) {
      await mkdir('.runtime/mail', { recursive: true });
      await writeFile(`.runtime/mail/${randomUUID()}.json`, JSON.stringify(mail));
    },
  },
};
const circleId = String(
  (
    await dispatch(ctx, {
      action: 'createCircle',
      profile: {
        ...profile,
        displayName: 'Evelyn Harper',
        emergencyContact: 'Maya Harper — fictional demo contact',
      },
      requestId: 'demo-circle-v1',
    })
  ).circleId,
);
for (const [uid, email, name] of identities.slice(1)) {
  const role = uid === 'demo-caregiver' ? 'caregiver' : 'family';
  const permissions: Permission[] =
    role === 'caregiver'
      ? [
          ...defaultRolePermissions.caregiver,
          'medication.write',
          'prescription.write',
          'prescription.approve',
          'audit.read',
          'passport.read',
        ]
      : defaultRolePermissions.family;
  const who = { uid, email, name, authTime: now / 1000 },
    memberRef = ctx.db.doc(`careCircles/${circleId}/members/${uid}`);
  if (!(await memberRef.get()).exists) {
    const invite = await inviteMember(ctx, circleId, who, permissions, role);
    await dispatch(
      { ...ctx, actor: who },
      { action: 'redeem', invitationId: invite.id, code: invite.code },
    );
  } else {
    // Synthetic, fixed demo identities only: keep repeat seeds aligned with the current role model.
    const member: Member = {
      uid,
      email,
      displayName: name,
      circleId,
      role,
      permissions,
      status: 'active' as const,
    };
    const batch = ctx.db.batch();
    batch.set(memberRef, member);
    batch.set(ctx.db.doc(`users/${uid}/circles/${circleId}`), member);
    batch.set(ctx.db.doc(`careCircles/${circleId}/directory/${uid}`), directoryMember(member));
    await batch.commit();
  }
}
const day = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO('UTC');
const past = day.subtract({ minutes: 90 }),
  future = day.add({ minutes: 90 });
const demoMedication = {
  ...medication,
  name: 'Vitamin supplement (synthetic)',
  strength: 'Fictional demonstration only',
  instructions: 'Follow the fictional clinician’s recorded instruction.',
  startDate: day.subtract({ days: 1 }).toPlainDate().toString(),
  times: [past.toPlainTime().toString().slice(0, 5), future.toPlainTime().toString().slice(0, 5)],
};
const medicationId = 'demo-medication';
if (!(await ctx.db.doc(`careCircles/${circleId}/medications/${medicationId}`).get()).exists)
  await dispatch(
    { ...ctx, now: now - 3 * 3600000 },
    {
      action: 'saveMedication',
      circleId,
      resourceId: medicationId,
      version: 0,
      medication: demoMedication,
    },
  );
const tomorrow = day.add({ days: 1 });
if (!(await ctx.db.doc(`careCircles/${circleId}/appointments/demo-appointment`).get()).exists)
  await dispatch(ctx, {
    action: 'saveAppointment',
    circleId,
    resourceId: 'demo-appointment',
    version: 0,
    appointment: {
      clinician: 'Dr. Jordan Lee (synthetic)',
      specialty: 'Routine review',
      localDate: tomorrow.toPlainDate().toString(),
      localTime: '10:30',
      timeZone: 'UTC',
      location: 'Fictional Riverside Clinic',
      instructions: 'Bring your current medication list.',
      reminderMinutes: [1440, 60],
    },
  });
if (!(await ctx.db.doc(`careCircles/${circleId}/medicationInventory/${medicationId}`).get()).exists)
  await dispatch(ctx, {
    action: 'inventory',
    circleId,
    medicationId,
    version: 0,
    requestId: 'demo-stock',
    mode: 'set',
    quantity: 6,
    unit: 'tablets',
    unitsPerDose: 1,
    lowDays: 7,
    reason: 'Synthetic starting count',
  });
if (!(await ctx.db.doc(`careCircles/${circleId}/careAssignments/demo-refill`).get()).exists)
  await dispatch(ctx, {
    action: 'saveTask',
    circleId,
    resourceId: 'demo-refill',
    version: 0,
    task: {
      title: 'Collect the next refill',
      category: 'refill',
      detail: 'Fictional pharmacy pickup. Confirm the supply with the care circle.',
      assignedTo: 'demo-family',
      dueAt: now + 86400000,
      relatedId: medicationId,
      coverageStart: null,
      coverageEnd: null,
    },
  });
await processJobs({ ...ctx, now });
console.log(
  `Synthetic demo ready.\nCircle: ${circleId}\nAccounts: ${identities.map((x) => x[1]).join(', ')}\nPassword (local demo only): ${password}\nStart the frontend with VITE_USE_EMULATORS=true.`,
);
