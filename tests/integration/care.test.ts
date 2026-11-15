import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { dispatch } from '../../functions/src/callables/service';
import { extendSchedules } from '../../functions/src/medications/service';
import { processJobs } from '../../functions/src/notifications/worker';
import { actor, clock, context, inviteMember, makeCircle, medication } from '../helpers';
const createContext = () => context(actor(), 'demo-carecircle-care');
beforeEach(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
  await fetch(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-carecircle-care/databases/(default)/documents',
    { method: 'DELETE' },
  );
});
async function setup() {
  const { ctx, mail } = createContext(),
    circleId = await makeCircle(ctx),
    medicationId = randomUUID();
  const med = { ...medication, times: ['09:00'] };
  await dispatch(
    { ...ctx, now: clock - 7200000 },
    { action: 'saveMedication', circleId, resourceId: medicationId, version: 0, medication: med },
  );
  const circle = ctx.db.doc(`careCircles/${circleId}`);
  const dose = (await circle.collection('doseOccurrences').orderBy('scheduledAt').limit(1).get())
    .docs[0]!;
  return { ctx, mail, circleId, circle, medicationId, med, dose };
}
describe('CareCircle 3 primary workflows', () => {
  it('blocks family clinical/admin grants even from an owner and enforces fresh authentication', async () => {
    const f = await setup();
    await expect(
      inviteMember(f.ctx, f.circleId, actor(), ['medication.write'], 'family'),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      inviteMember(f.ctx, f.circleId, actor(), ['members.manage']),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      dispatch(
        { ...f.ctx, actor: { ...f.ctx.actor, authTime: 1 } },
        {
          action: 'applyPrescription',
          circleId: f.circleId,
          resourceId: 'unknown',
          version: 1,
          verified: true,
        },
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('consumes stock once across duplicate confirmations and restores it on an audited correction', async () => {
    const f = await setup();
    const adjustment = {
      action: 'inventory' as const,
      circleId: f.circleId,
      medicationId: f.medicationId,
      version: 0,
      requestId: randomUUID(),
      mode: 'set' as const,
      quantity: 10,
      unit: 'tablets',
      unitsPerDose: 2,
      lowDays: 7,
      reason: 'Initial count',
    };
    await dispatch(f.ctx, adjustment);
    await dispatch(f.ctx, adjustment);
    const confirmation = {
      action: 'confirmDose' as const,
      circleId: f.circleId,
      resourceId: f.dose.id,
      version: 1,
      state: 'taken' as const,
      requestId: randomUUID(),
    };
    await Promise.all([dispatch(f.ctx, confirmation), dispatch(f.ctx, confirmation)]);
    expect(
      (await f.circle.collection('medicationInventory').doc(f.medicationId).get()).get('balance'),
    ).toBe(8);
    await expect(
      dispatch(f.ctx, { ...confirmation, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'already-exists', details: { name: f.med.name } });
    await dispatch(f.ctx, {
      action: 'correctDose',
      circleId: f.circleId,
      resourceId: f.dose.id,
      version: 2,
      reason: 'Accidental confirmation',
    });
    expect(
      (await f.circle.collection('medicationInventory').doc(f.medicationId).get()).get('balance'),
    ).toBe(10);
    expect((await f.circle.collection('inventoryAdjustments').get()).size).toBe(3);
  });
  it('persists follow-up reasons, deduplicates refills and stops repeated unconfirmed alerts', async () => {
    const f = await setup(),
      request = {
        action: 'followUp' as const,
        circleId: f.circleId,
        resourceId: f.dose.id,
        version: 1,
        reason: 'unavailable' as const,
        requestId: randomUUID(),
      };
    await dispatch(f.ctx, request);
    await dispatch(f.ctx, request);
    await dispatch(f.ctx, {
      action: 'requestRefill',
      circleId: f.circleId,
      medicationId: f.medicationId,
    });
    expect((await f.circle.collection('careAssignments').get()).size).toBe(1);
    expect((await f.circle.collection('doseFollowUps').get()).size).toBe(1);
    await processJobs(f.ctx);
    expect((await f.circle.collection('alerts').get()).size).toBe(0);
    expect((await f.dose.ref.get()).get('state')).toBe('scheduled');
    expect((await f.dose.ref.get()).get('followUpReason')).toBe('unavailable');
  });
  it('assigns refill work to family, rejects unrelated actors and handles concurrent acceptance', async () => {
    const f = await setup(),
      family = actor('family@example.test'),
      invite = await inviteMember(
        f.ctx,
        f.circleId,
        family,
        ['medication.read', 'task.read', 'task.act'],
        'family',
      );
    await dispatch(
      { ...f.ctx, actor: family },
      { action: 'redeem', invitationId: invite.id, code: invite.code },
    );
    const refill = await dispatch(f.ctx, {
      action: 'requestRefill',
      circleId: f.circleId,
      medicationId: f.medicationId,
    });
    const ref = f.circle.collection('careAssignments').doc(String(refill.id));
    await dispatch(f.ctx, {
      action: 'saveTask',
      circleId: f.circleId,
      resourceId: ref.id,
      version: 1,
      task: {
        title: 'Collect refill',
        detail: 'Usual pharmacy',
        category: 'refill',
        relatedId: f.medicationId,
        assignedTo: family.uid,
        dueAt: clock + 86400000,
        coverageStart: null,
        coverageEnd: null,
      },
    });
    const transition = {
      action: 'taskTransition' as const,
      circleId: f.circleId,
      resourceId: ref.id,
      version: 2,
      state: 'accepted' as const,
      outcome: '',
    };
    await expect(dispatch({ ...f.ctx, actor: actor() }, transition)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    const results = await Promise.allSettled([
      dispatch({ ...f.ctx, actor: family }, transition),
      dispatch({ ...f.ctx, actor: family }, transition),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await dispatch(
      { ...f.ctx, actor: family },
      { ...transition, version: 3, state: 'completed', outcome: 'Collected from pharmacy' },
    );
    expect((await ref.get()).get('state')).toBe('completed');
    await expect(
      dispatch(
        { ...f.ctx, actor: family },
        {
          action: 'saveMedication',
          circleId: f.circleId,
          resourceId: f.medicationId,
          version: 1,
          medication: f.med,
        },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('encrypts prescription drafts, applies changes atomically and preserves past confirmations', async () => {
    const f = await setup();
    await dispatch(f.ctx, {
      action: 'confirmDose',
      circleId: f.circleId,
      resourceId: f.dose.id,
      version: 1,
      state: 'taken',
      requestId: randomUUID(),
    });
    const draft = await dispatch(f.ctx, {
      action: 'draftPrescription',
      circleId: f.circleId,
      requestId: randomUUID(),
      source: 'Synthetic clinician discharge sheet',
      items: [
        {
          medicationId: f.medicationId,
          expectedVersion: 1,
          medication: { ...f.med, times: ['14:00'], instructions: 'New clinician instruction' },
        },
      ],
    });
    const secret = await f.circle.collection('privateReconciliations').doc(String(draft.id)).get();
    expect(JSON.stringify(secret.data())).not.toContain('New clinician instruction');
    const review = await dispatch(f.ctx, {
      action: 'readPrescription',
      circleId: f.circleId,
      resourceId: String(draft.id),
    });
    expect(review.counts).toMatchObject({ Modified: 1 });
    await dispatch(f.ctx, {
      action: 'applyPrescription',
      circleId: f.circleId,
      resourceId: String(draft.id),
      version: 1,
      verified: true,
    });
    await extendSchedules(f.ctx);
    expect((await f.dose.ref.get()).get('state')).toBe('taken');
    expect(
      (await f.circle.collection('medicationVersions').doc(`${f.medicationId}_v1`).get()).get(
        'times',
      ),
    ).toEqual(['09:00']);
    expect(
      (
        await f.circle.collection('doseOccurrences').where('scheduleVersion', '==', 2).get()
      ).docs.every((d) => d.get('localTime') === '14:00'),
    ).toBe(true);
    await expect(
      dispatch(f.ctx, {
        action: 'applyPrescription',
        circleId: f.circleId,
        resourceId: String(draft.id),
        version: 2,
        verified: true,
      }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('rejects stale prescription drafts without partially changing medication records', async () => {
    const f = await setup();
    const draft = await dispatch(f.ctx, {
      action: 'draftPrescription',
      circleId: f.circleId,
      requestId: randomUUID(),
      source: 'Clinician list',
      items: [
        {
          medicationId: f.medicationId,
          expectedVersion: 1,
          medication: { ...f.med, times: ['15:00'] },
        },
      ],
    });
    await dispatch(f.ctx, {
      action: 'saveMedication',
      circleId: f.circleId,
      resourceId: f.medicationId,
      version: 1,
      medication: { ...f.med, times: ['16:00'] },
    });
    await expect(
      dispatch(f.ctx, {
        action: 'applyPrescription',
        circleId: f.circleId,
        resourceId: String(draft.id),
        version: 1,
        verified: true,
      }),
    ).rejects.toMatchObject({ code: 'aborted' });
    expect(
      (await f.circle.collection('medications').doc(f.medicationId).get()).get('times'),
    ).toEqual(['16:00']);
  });
});
