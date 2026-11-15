import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { dispatch } from '../../functions/src/callables/service';
import { rateLimit } from '../../functions/src/authorization/rate-limit';
import { extendSchedules } from '../../functions/src/medications/service';
import { processJobs } from '../../functions/src/notifications/worker';
import {
  actor,
  clock,
  context,
  emulatorAdmin,
  inviteMember,
  makeCircle,
  medication,
  profile,
} from '../helpers';

beforeEach(async () => {
  if (
    process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' &&
    process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8080'
  )
    throw new Error('Local Firestore emulator required');
  const response = await fetch(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-carecircle-integration/databases/(default)/documents',
    { method: 'DELETE' },
  );
  if (!response.ok) throw new Error('Unable to reset isolated test database');
});
describe('secure invitation lifecycle', () => {
  it('rejects a pending invitation after its grantor loses authority', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx);
    const invitee = actor('invitee@example.test'),
      pending = await inviteMember(ctx, circleId, invitee, ['medication.read']);
    // Simulate an administrative suspension; owners cannot revoke themselves in the UI.
    await ctx.db
      .doc(`careCircles/${circleId}/members/${ctx.actor.uid}`)
      .update({ status: 'revoked' });
    await expect(
      dispatch(
        { ...ctx, actor: invitee },
        { action: 'redeem', invitationId: pending.id, code: pending.code },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('creates a circle and redeems an emailed invitation exactly once under concurrency', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx),
      caregiver = actor('caregiver@example.test');
    const invitation = await inviteMember(ctx, circleId, caregiver);
    const stored = await ctx.db.doc(`invitations/${invitation.id}`).get();
    expect(JSON.stringify(stored.data())).not.toContain(invitation.code);
    const attempts = await Promise.allSettled(
      [1, 2].map(() =>
        dispatch(
          { ...ctx, actor: caregiver },
          { action: 'redeem', invitationId: invitation.id, code: invitation.code },
        ),
      ),
    );
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await ctx.db.doc(`careCircles/${circleId}/members/${caregiver.uid}`).get()).get('status'),
    ).toBe('active');
    await expect(
      dispatch(
        { ...ctx, actor: caregiver },
        { action: 'redeem', invitationId: invitation.id, code: invitation.code },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('rejects wrong verified identity and expired invitations', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx),
      caregiver = actor('caregiver@example.test');
    const invite = await inviteMember(ctx, circleId, caregiver);
    await expect(
      dispatch(
        { ...ctx, actor: actor('stranger@example.test') },
        { action: 'redeem', invitationId: invite.id, code: invite.code },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      dispatch(
        { ...ctx, actor: caregiver, now: clock + 600001 },
        { action: 'redeem', invitationId: invite.id, code: invite.code },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('commits failed-attempt counters and locks after five guesses', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx),
      caregiver = actor('caregiver@example.test');
    const invite = await inviteMember(ctx, circleId, caregiver);
    const wrong = invite.code === '00000000' ? '99999999' : '00000000';
    for (let i = 0; i < 5; i++)
      await expect(
        dispatch(
          { ...ctx, actor: caregiver },
          { action: 'redeem', invitationId: invite.id, code: wrong },
        ),
      ).rejects.toMatchObject({ code: 'permission-denied' });
    const stored = await ctx.db.doc(`invitations/${invite.id}`).get();
    expect(stored.get('attemptsRemaining')).toBe(0);
    expect(stored.get('state')).toBe('locked');
    await expect(
      dispatch(
        { ...ctx, actor: caregiver },
        { action: 'redeem', invitationId: invite.id, code: invite.code },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('revokes invitation and refuses privilege escalation', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx),
      caregiver = actor('caregiver@example.test');
    const invite = await inviteMember(ctx, circleId, caregiver, ['medication.read']);
    await dispatch(
      { ...ctx, actor: caregiver },
      { action: 'redeem', invitationId: invite.id, code: invite.code },
    );
    await expect(
      dispatch(
        { ...ctx, actor: caregiver },
        {
          action: 'invite',
          circleId,
          invitation: {
            email: 'other@example.test',
            role: 'family',
            permissions: ['privacy.manage'],
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const pending = await inviteMember(ctx, circleId, actor('new@example.test'));
    await dispatch(ctx, { action: 'revokeInvite', circleId, invitationId: pending.id });
    await expect(
      dispatch(
        { ...ctx, actor: actor('new@example.test') },
        { action: 'redeem', invitationId: pending.id, code: pending.code },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('marks invitation revoked when the transport fails without reporting success', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx);
    await expect(
      dispatch(
        {
          ...ctx,
          mailer: {
            async send() {
              throw new Error('provider down');
            },
          },
        },
        {
          action: 'invite',
          circleId,
          invitation: { email: 'new@example.test', role: 'family', permissions: [] },
        },
      ),
    ).rejects.toMatchObject({ code: 'unavailable' });
    const records = await ctx.db.collection('invitations').get();
    expect(records.docs[0]?.get('state')).toBe('revoked');
  });
});
describe('medication integrity and access isolation', () => {
  it('uses configured unconfirmed timing and returns aggregate-only insight data', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx);
    await dispatch(ctx, {
      action: 'preferences',
      preferences: {
        email: true,
        push: false,
        upcomingMinutes: 15,
        unconfirmedMinutes: 45,
        escalationMinutes: 60,
      },
    });
    await dispatch(ctx, {
      action: 'saveMedication',
      circleId,
      resourceId: randomUUID(),
      version: 0,
      medication,
    });
    const dose = (
      await ctx.db
        .collection(`careCircles/${circleId}/doseOccurrences`)
        .orderBy('scheduledAt')
        .limit(1)
        .get()
    ).docs[0]!;
    expect(dose.get('unconfirmedAfterMinutes')).toBe(45);
    const analyst = actor('analyst@example.test'),
      invite = await inviteMember(ctx, circleId, analyst, ['adherence.read']);
    await dispatch(
      { ...ctx, actor: analyst },
      { action: 'redeem', invitationId: invite.id, code: invite.code },
    );
    const report = await dispatch(
      { ...ctx, actor: analyst, now: clock + 2 * 3600000 },
      { action: 'insights', circleId },
    );
    expect(report.month).toMatchObject({ eligible: 1, taken: 0, unconfirmed: 1 });
    expect(JSON.stringify(report)).not.toContain(medication.name);
    expect(report.upcoming).toBeNull();
  });
  it('rejects cross-circle mutation, view-only edits and stale versions', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx),
      resourceId = randomUUID();
    await expect(
      dispatch(
        { ...ctx, actor: actor() },
        { action: 'saveMedication', circleId, resourceId, version: 0, medication },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const viewer = actor('viewer@example.test'),
      invite = await inviteMember(ctx, circleId, viewer, ['medication.read']);
    await dispatch(
      { ...ctx, actor: viewer },
      { action: 'redeem', invitationId: invite.id, code: invite.code },
    );
    await expect(
      dispatch(
        { ...ctx, actor: viewer },
        { action: 'saveMedication', circleId, resourceId, version: 0, medication },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await dispatch(ctx, { action: 'saveMedication', circleId, resourceId, version: 0, medication });
    await expect(
      dispatch(ctx, { action: 'saveMedication', circleId, resourceId, version: 0, medication }),
    ).rejects.toMatchObject({ code: 'aborted' });
  });
  it('generates deterministic doses and serializes competing confirmations', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx),
      resourceId = randomUUID();
    await dispatch(ctx, { action: 'saveMedication', circleId, resourceId, version: 0, medication });
    const doses = await ctx.db
      .collection(`careCircles/${circleId}/doseOccurrences`)
      .orderBy('scheduledAt')
      .get();
    expect(doses.size).toBe(14);
    const dose = doses.docs[0]!;
    const command = {
      action: 'confirmDose' as const,
      circleId,
      resourceId: dose.id,
      version: 1,
      state: 'taken' as const,
      requestId: randomUUID(),
    };
    const at = { ...ctx, now: clock + 3600000 };
    const result = await Promise.allSettled([
      dispatch(at, command),
      dispatch(at, { ...command, state: 'skipped', requestId: randomUUID() }),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await dose.ref.get()).get('version')).toBe(2);
    const stored = await dose.ref.get();
    const repeat = { ...command, state: stored.get('state'), requestId: stored.get('requestId') };
    await expect(dispatch(at, repeat)).resolves.toMatchObject({ version: 2 });
    expect(
      (
        await ctx.db
          .collection(`careCircles/${circleId}/auditLogs`)
          .where('action', '==', 'dose.confirmed')
          .get()
      ).size,
    ).toBe(1);
  });
  it('cancels future instances, preserves history and bounds rolling generation', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx),
      resourceId = randomUUID();
    await dispatch(ctx, { action: 'saveMedication', circleId, resourceId, version: 0, medication });
    const doses = await ctx.db
      .collection(`careCircles/${circleId}/doseOccurrences`)
      .orderBy('scheduledAt')
      .get();
    const first = doses.docs[0]!;
    const later = { ...ctx, now: clock + 3600001 };
    await dispatch(later, {
      action: 'confirmDose',
      circleId,
      resourceId: first.id,
      version: 1,
      state: 'taken',
      requestId: randomUUID(),
    });
    await dispatch(later, {
      action: 'saveMedication',
      circleId,
      resourceId,
      version: 1,
      medication: { ...medication, times: ['12:00'] },
    });
    expect((await first.ref.get()).get('state')).toBe('taken');
    expect((await doses.docs[1]!.ref.get()).get('state')).toBe('cancelled');
    await Promise.all([
      extendSchedules({ ...ctx, now: clock + 86400000 }),
      extendSchedules({ ...ctx, now: clock + 86400000 }),
    ]);
    const all = await ctx.db.collection(`careCircles/${circleId}/doseOccurrences`).get();
    expect(new Set(all.docs.map((d) => d.id)).size).toBe(all.size);
  });
  it('records controlled owner corrections and denies future confirmations', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx),
      resourceId = randomUUID();
    await dispatch(ctx, { action: 'saveMedication', circleId, resourceId, version: 0, medication });
    const dose = (
      await ctx.db
        .collection(`careCircles/${circleId}/doseOccurrences`)
        .orderBy('scheduledAt')
        .limit(1)
        .get()
    ).docs[0]!;
    await expect(
      dispatch(ctx, {
        action: 'confirmDose',
        circleId,
        resourceId: dose.id,
        version: 1,
        state: 'taken',
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    const later = {
      ...ctx,
      actor: { ...ctx.actor, authTime: (clock + 3600000) / 1000 },
      now: clock + 3600000,
    };
    await dispatch(later, {
      action: 'confirmDose',
      circleId,
      resourceId: dose.id,
      version: 1,
      state: 'taken',
      requestId: randomUUID(),
    });
    await dispatch(later, {
      action: 'correctDose',
      circleId,
      resourceId: dose.id,
      version: 2,
      reason: 'Recorded against wrong occurrence',
    });
    expect((await dose.ref.get()).get('state')).toBe('scheduled');
    expect((await dose.ref.get()).get('correctionReason')).toBe(
      'Recorded against wrong occurrence',
    );
  });
  it('revokes access and enforces recent authentication', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx),
      caregiver = actor('caregiver@example.test'),
      invite = await inviteMember(ctx, circleId, caregiver);
    await dispatch(
      { ...ctx, actor: caregiver },
      { action: 'redeem', invitationId: invite.id, code: invite.code },
    );
    await expect(
      dispatch(
        { ...ctx, now: clock + 600000 },
        { action: 'member', circleId, uid: caregiver.uid, permissions: [], status: 'revoked' },
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    await dispatch(ctx, {
      action: 'member',
      circleId,
      uid: caregiver.uid,
      permissions: [],
      status: 'revoked',
    });
    await expect(
      dispatch(
        { ...ctx, actor: caregiver },
        { action: 'help', circleId, requestId: randomUUID(), category: 'Contact caregiver' },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('encrypts notes and prevents unauthorized decryption', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx);
    await dispatch(ctx, { action: 'saveNote', circleId, note: 'Private synthetic note' });
    const stored = await ctx.db.doc(`careCircles/${circleId}/private/notes`).get();
    expect(JSON.stringify(stored.data())).not.toContain('Private synthetic note');
    await expect(dispatch(ctx, { action: 'readNote', circleId })).resolves.toEqual({
      note: 'Private synthetic note',
    });
    await expect(
      dispatch({ ...ctx, actor: actor() }, { action: 'readNote', circleId }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
describe('appointments, reminders and assistance', () => {
  it('rejects disabled accounts and revoked sessions even with a cached verified token', async () => {
    const { auth } = emulatorAdmin('demo-carecircle'),
      email = `session-${randomUUID()}@example.test`,
      password = 'Synthetic-test-only-2026!';
    const user = await auth.createUser({ email, password, emailVerified: true });
    const response = await fetch(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    const { idToken } = (await response.json()) as { idToken: string };
    const call = (token: string) =>
      fetch('http://127.0.0.1:5001/demo-carecircle/us-central1/careCommand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          data: { action: 'createCircle', profile, requestId: randomUUID() },
        }),
      });
    expect((await call(idToken)).status).toBe(200);
    await auth.updateUser(user.uid, { disabled: true });
    expect((await call(idToken)).status).toBe(401);
    await auth.updateUser(user.uid, { disabled: false });
    await auth.revokeRefreshTokens(user.uid);
    // The Auth emulator uses unsigned tokens: make auth_time older than revocation deterministically.
    const parts = idToken.split('.'),
      payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
    payload.auth_time -= 60;
    expect(
      (
        await call(
          [parts[0], Buffer.from(JSON.stringify(payload)).toString('base64url'), parts[2]].join(
            '.',
          ),
        )
      ).status,
    ).toBe(401);
  });
  it('rejects unverified identities and expired tokens at the callable boundary', async () => {
    const { auth } = emulatorAdmin('demo-carecircle');
    const email = `unverified-${randomUUID()}@example.test`,
      password = 'Synthetic-test-only-2026!';
    await auth.createUser({ email, password, emailVerified: false });
    const login = await fetch(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    const { idToken } = (await login.json()) as { idToken: string };
    const call = async (token: string) =>
      fetch('http://127.0.0.1:5001/demo-carecircle/us-central1/careCommand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          data: { action: 'createCircle', profile, requestId: randomUUID() },
        }),
      });
    expect((await call(idToken)).status).toBe(403);
    const parts = idToken.split('.'),
      payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
    payload.exp = Math.floor(Date.now() / 1000) - 60;
    const expired = [
      parts[0],
      Buffer.from(JSON.stringify(payload)).toString('base64url'),
      parts[2],
    ].join('.');
    expect((await call(expired)).status).toBe(401);
  });
  it('invalidates old appointment reminder versions after rescheduling and cancellation', async () => {
    const { ctx, mail } = context(),
      circleId = await makeCircle(ctx),
      resourceId = randomUUID();
    const appointment = {
      clinician: 'Synthetic clinician',
      localDate: '2026-11-15',
      localTime: '11:00',
      timeZone: 'UTC',
      location: 'Test clinic',
      reminderMinutes: [60],
    };
    await dispatch(ctx, {
      action: 'saveAppointment',
      circleId,
      resourceId,
      version: 0,
      appointment,
    });
    await dispatch(ctx, {
      action: 'saveAppointment',
      circleId,
      resourceId,
      version: 1,
      appointment: { ...appointment, localTime: '12:00' },
    });
    await dispatch(ctx, {
      action: 'saveAppointment',
      circleId,
      resourceId,
      version: 2,
      appointment: { ...appointment, status: 'cancelled' },
    });
    await processJobs({ ...ctx, now: clock + 3600000 });
    expect(mail).toHaveLength(0);
    const jobs = await ctx.db.collection('notificationJobs').get();
    expect(jobs.docs.every((d) => d.get('status') === 'cancelled')).toBe(true);
  });
  it('leases overlapping jobs, suppresses duplicate processing and reconciles confirmed doses', async () => {
    const { ctx, mail } = context(),
      circleId = await makeCircle(ctx),
      resourceId = randomUUID();
    await dispatch(ctx, { action: 'saveMedication', circleId, resourceId, version: 0, medication });
    const reminderAt = clock + 45 * 60000;
    await Promise.all([
      processJobs({ ...ctx, now: reminderAt }),
      processJobs({ ...ctx, now: reminderAt }),
    ]);
    expect(mail).toHaveLength(1);
    await processJobs({ ...ctx, now: reminderAt });
    expect(mail).toHaveLength(1);
    const dose = (
      await ctx.db
        .collection(`careCircles/${circleId}/doseOccurrences`)
        .orderBy('scheduledAt')
        .limit(1)
        .get()
    ).docs[0]!;
    await dispatch(
      { ...ctx, now: clock + 3600000 },
      {
        action: 'confirmDose',
        circleId,
        resourceId: dose.id,
        version: 1,
        state: 'taken',
        requestId: randomUUID(),
      },
    );
    await processJobs({ ...ctx, now: clock + 2 * 3600000 });
    expect(mail).toHaveLength(1);
  });
  it('retries transient failures and marks permanent provider failure', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx),
      resourceId = randomUUID();
    await dispatch(ctx, { action: 'saveMedication', circleId, resourceId, version: 0, medication });
    const due = clock + 45 * 60000;
    await processJobs({
      ...ctx,
      now: due,
      mailer: {
        async send() {
          throw { code: 'ETIMEDOUT' };
        },
      },
    });
    const job = (await ctx.db.collection('notificationJobs').where('attempts', '==', 1).get())
      .docs[0]!;
    expect(job.get('status')).toBe('pending');
    expect(job.get('nextAttemptAt')).toBe(due + 30000);
    await processJobs({
      ...ctx,
      now: due + 30001,
      mailer: {
        async send() {
          throw { responseCode: 550 };
        },
      },
    });
    expect((await job.ref.get()).get('status')).toBe('failed');
  });
  it('creates caregiver escalation, acknowledgement and resolution with no revoked recipient mail', async () => {
    const { ctx, mail } = context(),
      circleId = await makeCircle(ctx),
      caregiver = actor('caregiver@example.test'),
      invite = await inviteMember(ctx, circleId, caregiver);
    await dispatch(
      { ...ctx, actor: caregiver },
      { action: 'redeem', invitationId: invite.id, code: invite.code },
    );
    await dispatch(ctx, {
      action: 'saveMedication',
      circleId,
      resourceId: randomUUID(),
      version: 0,
      medication,
    });
    await processJobs({ ...ctx, now: clock + 2 * 3600000 });
    const alert = (await ctx.db.collection(`careCircles/${circleId}/alerts`).get()).docs[0]!;
    expect(alert.get('state')).toBe('sent');
    const caregiverCtx = { ...ctx, actor: caregiver };
    await dispatch(caregiverCtx, {
      action: 'alert',
      circleId,
      resourceId: alert.id,
      collection: 'alerts',
      version: alert.get('version'),
      state: 'acknowledged',
      outcome: '',
    });
    await dispatch(caregiverCtx, {
      action: 'alert',
      circleId,
      resourceId: alert.id,
      collection: 'alerts',
      version: (await alert.ref.get()).get('version'),
      state: 'resolved',
      outcome: 'Called the profile owner to check in.',
    });
    expect((await alert.ref.get()).get('state')).toBe('resolved');
    await dispatch(ctx, {
      action: 'member',
      circleId,
      uid: caregiver.uid,
      permissions: [],
      status: 'revoked',
    });
    mail.length = 0;
    await dispatch(ctx, {
      action: 'help',
      circleId,
      requestId: randomUUID(),
      category: 'Contact caregiver',
    });
    await processJobs(ctx);
    expect(
      mail.filter(
        (m) => m.to === caregiver.email && m.subject !== 'Your CareCircle access changed',
      ),
    ).toHaveLength(0);
  });
  it('makes repeated assistance taps idempotent and requires valid lifecycle transitions', async () => {
    const { ctx } = context(),
      circleId = await makeCircle(ctx),
      requestId = randomUUID();
    const help = {
      action: 'help' as const,
      circleId,
      requestId,
      category: 'Medication assistance' as const,
    };
    await Promise.all([dispatch(ctx, help), dispatch(ctx, help)]);
    const records = await ctx.db.collection(`careCircles/${circleId}/assistanceRequests`).get();
    expect(records.size).toBe(1);
    await expect(
      dispatch(ctx, {
        action: 'alert',
        circleId,
        resourceId: requestId,
        collection: 'assistanceRequests',
        version: 1,
        state: 'resolved',
        outcome: 'Called caregiver',
      }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    await dispatch(ctx, {
      action: 'alert',
      circleId,
      resourceId: requestId,
      collection: 'assistanceRequests',
      version: 1,
      state: 'acknowledged',
      outcome: '',
    });
    await dispatch(ctx, {
      action: 'alert',
      circleId,
      resourceId: requestId,
      collection: 'assistanceRequests',
      version: 2,
      state: 'resolved',
      outcome: 'Caregiver called and offered support.',
    });
    expect((await records.docs[0]!.ref.get()).get('state')).toBe('resolved');
  });
  it('enforces transactional rate limits under parallel requests', async () => {
    const { ctx } = context();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => rateLimit(ctx.db, 'test-key', 2, clock)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    await expect(rateLimit(ctx.db, 'test-key', 2, clock + 60001)).resolves.toBeUndefined();
  });
  it('rejects anonymous requests through the deployed callable protocol', async () => {
    const result = await fetch('http://127.0.0.1:5001/demo-carecircle/us-central1/careCommand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { action: 'createCircle', profile, requestId: randomUUID() } }),
    });
    expect(result.status).toBe(401);
    expect((await result.json()).error.status).toBe('UNAUTHENTICATED');
  });
});
