import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { dispatch } from '../../functions/src/callables/service';
import { processJobs } from '../../functions/src/notifications/worker';
import { actor, clock, context, inviteMember, makeCircle, medication } from '../helpers';
beforeEach(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
  await fetch(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-carecircle-companion/databases/(default)/documents',
    { method: 'DELETE' },
  );
});
async function setup() {
  const { ctx, mail } = context(actor(), 'demo-carecircle-companion'),
    circleId = await makeCircle(ctx);
  const family = actor('family@example.test'),
    invite = await inviteMember(
      ctx,
      circleId,
      family,
      ['members.read', 'passport.read', 'appointment.read', 'checkin.read'],
      'family',
    );
  await dispatch(
    { ...ctx, actor: family },
    { action: 'redeem', invitationId: invite.id, code: invite.code },
  );
  return { ctx, mail, circleId, family, circle: ctx.db.doc(`careCircles/${circleId}`) };
}
describe('Private care tools', () => {
  it('shares contact fields only after consent and removes them on withdrawal', async () => {
    const f = await setup(),
      ref = f.circle.collection('directory').doc(f.family.uid),
      ctx = { ...f.ctx, actor: f.family };
    expect((await ref.get()).get('contactEmail')).toBe('');
    await dispatch(ctx, {
      action: 'contactConsent',
      circleId: f.circleId,
      enabled: true,
      phone: '+1 555 010 1234',
    });
    expect((await ref.get()).get('contactEmail')).toBe(f.family.email);
    await dispatch(ctx, {
      action: 'contactConsent',
      circleId: f.circleId,
      enabled: false,
      phone: '',
    });
    expect((await ref.get()).get('contactEmail')).toBe('');
    expect((await ref.get()).get('contactPhone')).toBe('');
    await expect(
      dispatch(ctx, {
        action: 'contactConsent',
        circleId: f.circleId,
        enabled: true,
        phone: 'javascript:alert(1)',
      }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('checks every passport scope, requires fresh authentication for private notes and audits access', async () => {
    const f = await setup();
    await dispatch(f.ctx, {
      action: 'saveMedication',
      circleId: f.circleId,
      resourceId: 'medicine',
      version: 0,
      medication,
    });
    await dispatch(f.ctx, {
      action: 'saveNote',
      circleId: f.circleId,
      note: 'Synthetic confidential note',
    });
    await expect(
      dispatch({ ...f.ctx, actor: f.family }, { action: 'passport', circleId: f.circleId }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const plain = await dispatch(f.ctx, { action: 'passport', circleId: f.circleId });
    expect(plain.notes).toBeNull();
    expect(plain.medications).toHaveLength(1);
    await expect(
      dispatch(
        { ...f.ctx, actor: { ...f.ctx.actor, authTime: 1 } },
        { action: 'passport', circleId: f.circleId, includePrivateNotes: true },
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(
      (
        await dispatch(f.ctx, {
          action: 'passport',
          circleId: f.circleId,
          includePrivateNotes: true,
        })
      ).notes,
    ).toBe('Synthetic confidential note');
    expect(
      (await f.circle.collection('auditLogs').where('action', '==', 'passport.viewed').get()).size,
    ).toBe(2);
  });
  it('encrypts versioned appointment preparation and rejects read-only family edits', async () => {
    const f = await setup();
    await dispatch(f.ctx, {
      action: 'saveAppointment',
      circleId: f.circleId,
      resourceId: 'visit',
      version: 0,
      appointment: {
        clinician: 'Synthetic clinician',
        specialty: '',
        localDate: '2026-11-16',
        localTime: '10:00',
        timeZone: 'UTC',
        location: 'Test clinic',
        instructions: '',
        teleconsultationUrl: '',
        status: 'scheduled',
        reminderMinutes: [60],
      },
    });
    const input = {
      action: 'saveCompanion' as const,
      circleId: f.circleId,
      appointmentId: 'visit',
      version: 0,
      questions: 'Synthetic private question',
      notes: 'Synthetic visit note',
      checklist: [{ id: randomUUID(), label: 'Bring medication list', done: true }],
    };
    await dispatch(f.ctx, input);
    expect(
      JSON.stringify((await f.circle.collection('privateCompanions').doc('visit').get()).data()),
    ).not.toContain(input.questions);
    expect(
      (
        await dispatch(
          { ...f.ctx, actor: f.family },
          { action: 'readCompanion', circleId: f.circleId, appointmentId: 'visit' },
        )
      ).questions,
    ).toBe(input.questions);
    await expect(dispatch(f.ctx, input)).rejects.toMatchObject({ code: 'aborted' });
    await expect(
      dispatch({ ...f.ctx, actor: f.family }, { ...input, version: 1 }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('deduplicates help reports, versions daily changes and rejects family check-in impersonation', async () => {
    const f = await setup(),
      input = {
        action: 'checkIn' as const,
        circleId: f.circleId,
        version: 0,
        state: 'help' as const,
        requestId: randomUUID(),
      };
    await Promise.all([dispatch(f.ctx, input), dispatch(f.ctx, input)]);
    expect((await f.circle.collection('assistanceRequests').get()).size).toBe(1);
    await expect(
      dispatch({ ...f.ctx, actor: f.family }, { ...input, version: 1, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await dispatch(f.ctx, { ...input, version: 1, state: 'okay', requestId: randomUUID() });
    expect(
      (await f.circle.collection('wellbeingCheckIns').doc('2026-11-15').get()).get('state'),
    ).toBe('okay');
    await expect(dispatch(f.ctx, { ...input, requestId: randomUUID() })).rejects.toMatchObject({
      code: 'aborted',
    });
  });
  it('creates a gentle follow-up only when enabled and unreported, without emergency assumptions', async () => {
    const f = await setup(),
      caregiver = actor('care@example.test'),
      invite = await inviteMember(f.ctx, f.circleId, caregiver, [
        'checkin.read',
        'alert.read',
        'alert.acknowledge',
        'assistance.respond',
      ]);
    await dispatch(
      { ...f.ctx, actor: caregiver },
      { action: 'redeem', invitationId: invite.id, code: invite.code },
    );
    await dispatch(f.ctx, {
      action: 'wellbeingPreferences',
      circleId: f.circleId,
      enabled: true,
      localTime: '10:30',
      followupMinutes: 15,
      version: 0,
    });
    await processJobs({ ...f.ctx, now: clock + 46 * 60000 });
    const alerts = await f.circle.collection('alerts').get();
    expect(alerts.size).toBe(1);
    expect(alerts.docs[0]!.get('category')).toMatch(/check-in/i);
    expect(alerts.docs[0]!.get('priority')).toBe('normal');
    await dispatch(
      { ...f.ctx, now: clock + 47 * 60000 },
      {
        action: 'checkIn',
        circleId: f.circleId,
        version: 0,
        state: 'okay',
        requestId: randomUUID(),
      },
    );
    expect((await alerts.docs[0]!.ref.get()).get('state')).toBe('resolved');
    expect(f.mail.some((m) => /check-in/i.test(m.text))).toBe(true);
  });
  it('invalidates queued check-in jobs immediately when follow-up is disabled', async () => {
    const f = await setup();
    await dispatch(f.ctx, {
      action: 'wellbeingPreferences',
      circleId: f.circleId,
      enabled: true,
      localTime: '10:30',
      followupMinutes: 15,
      version: 0,
    });
    await dispatch(f.ctx, {
      action: 'wellbeingPreferences',
      circleId: f.circleId,
      enabled: false,
      localTime: '10:30',
      followupMinutes: 15,
      version: 1,
    });
    await processJobs({ ...f.ctx, now: clock + 3600000 });
    expect((await f.circle.collection('alerts').get()).size).toBe(0);
  });
});
