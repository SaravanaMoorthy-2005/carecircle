import { HttpsError } from 'firebase-functions/v2/https';
import {
  canConfirm,
  occurrences,
  type Command,
  type Dose,
  type Medication,
  type Preferences,
  defaultPreferences,
  inventoryBalance,
} from '@carecircle/shared';
import {
  audit,
  authorize,
  circleRef,
  recent,
  versioned,
  type Context,
} from '../repositories/context';
import { enqueueDose } from '../scheduling/jobs';

export async function saveMedication(
  ctx: Context,
  command: Extract<Command, { action: 'saveMedication' }>,
) {
  const circle = circleRef(ctx.db, command.circleId),
    ref = circle.collection('medications').doc(command.resourceId);
  return ctx.db.runTransaction(async (tx) => {
    await authorize(tx, ctx.db, command.circleId, ctx.actor, 'medication.write');
    const previous = await versioned(tx, ref, command.version);
    const owner = await tx.get(circle);
    const preferences = await tx.get(
      ctx.db.doc(`users/${owner.get('ownerId')}/notificationPreferences/default`),
    );
    const future = await tx.get(
      circle
        .collection('doseOccurrences')
        .where('medicationId', '==', ref.id)
        .where('state', '==', 'scheduled')
        .where('scheduledAt', '>=', ctx.now)
        .limit(200),
    );
    if (future.size >= 200)
      throw new HttpsError('resource-exhausted', 'Too many future occurrences to edit safely.');
    const version = command.version + 1;
    if (previous.exists)
      tx.set(circle.collection('medicationVersions').doc(`${ref.id}_v${command.version}`), {
        ...previous.data(),
        medicationId: ref.id,
      });
    const doses = occurrences(
      command.medication,
      ref.id,
      command.circleId,
      version,
      ctx.now,
    ).filter((d) => d.scheduledAt >= ctx.now);
    for (const doc of future.docs) {
      if (!['taken', 'skipped', 'cancelled'].includes(doc.get('state')))
        tx.update(doc.ref, { state: 'cancelled', version: Number(doc.get('version')) + 1 });
    }
    tx.set(ref, {
      ...command.medication,
      circleId: command.circleId,
      version,
      createdAt: previous.exists ? previous.get('createdAt') : ctx.now,
      createdBy: previous.exists ? previous.get('createdBy') : ctx.actor.uid,
      updatedBy: ctx.actor.uid,
      updatedAt: ctx.now,
    });
    tx.set(circle.collection('medicationVersions').doc(`${ref.id}_v${version}`), {
      ...command.medication,
      medicationId: ref.id,
      version,
      updatedAt: ctx.now,
      updatedBy: ctx.actor.uid,
    });
    for (const dose of doses) {
      dose.unconfirmedAfterMinutes = preferences.exists
        ? Number(preferences.get('unconfirmedMinutes'))
        : defaultPreferences.unconfirmedMinutes;
      dose.unconfirmedAt = dose.scheduledAt + dose.unconfirmedAfterMinutes * 60000;
      tx.create(circle.collection('doseOccurrences').doc(dose.id), dose);
      enqueueDose(
        tx,
        ctx.db,
        dose,
        preferences.exists ? (preferences.data() as Preferences) : defaultPreferences,
      );
    }
    tx.set(ctx.db.collection('scheduleTasks').doc(`${command.circleId}_${ref.id}`), {
      circleId: command.circleId,
      medicationId: ref.id,
      nextAt: command.medication.status === 'active' ? ctx.now + 86400000 : Number.MAX_SAFE_INTEGER,
    });
    audit(tx, ctx.db, command.circleId, ctx.actor.uid, 'medication.saved', ref.id, ctx.now);
    return { id: ref.id, version };
  });
}
export async function confirmDose(
  ctx: Context,
  command: Extract<Command, { action: 'confirmDose' | 'correctDose' }>,
) {
  const ref = circleRef(ctx.db, command.circleId)
    .collection('doseOccurrences')
    .doc(command.resourceId);
  return ctx.db.runTransaction(async (tx) => {
    const member = await authorize(tx, ctx.db, command.circleId, ctx.actor, 'medication.confirm');
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Dose not found.');
    const dose = snap.data() as Dose;
    if (
      command.action === 'confirmDose' &&
      dose.requestId === command.requestId &&
      dose.confirmedBy === ctx.actor.uid &&
      dose.state === command.state
    )
      return { id: ref.id, version: dose.version };
    if (command.action === 'confirmDose' && ['taken', 'skipped'].includes(dose.state))
      throw new HttpsError(
        'already-exists',
        `This dose was already marked ${dose.state === 'taken' ? 'Taken' : 'Skipped'} at ${new Intl.DateTimeFormat('en', { timeStyle: 'short', timeZone: dose.timeZone }).format(dose.confirmedAt)}.`,
        {
          name: dose.name,
          scheduledAt: dose.scheduledAt,
          confirmedAt: dose.confirmedAt,
          recordedBy: dose.confirmedName || dose.source,
          state: dose.state,
        },
      );
    if (dose.version !== command.version)
      throw new HttpsError('aborted', 'Another care member has updated this dose.');
    const alerts = await tx.get(
      circleRef(ctx.db, command.circleId)
        .collection('alerts')
        .where('resourceId', '==', ref.id)
        .limit(10),
    );
    const stockRef = circleRef(ctx.db, command.circleId)
      .collection('medicationInventory')
      .doc(dose.medicationId);
    const stock = await tx.get(stockRef);
    const consumed =
      command.action === 'correctDose'
        ? dose.inventoryConsumed || 0
        : command.state === 'taken' && stock.exists
          ? Number(stock.get('unitsPerDose'))
          : 0;
    if (
      command.action === 'confirmDose' &&
      command.reportedTakenAt !== undefined &&
      (command.state !== 'taken' ||
        command.reportedTakenAt > ctx.now ||
        command.reportedTakenAt < dose.scheduledAt)
    )
      throw new HttpsError(
        'invalid-argument',
        'The reported time must be between the scheduled time and now.',
      );
    if (command.action === 'correctDose') {
      recent(ctx.actor, ctx.now);
      if (member.role !== 'owner' || !['taken', 'skipped'].includes(dose.state))
        throw new HttpsError('permission-denied', 'Only the owner can reopen a confirmed dose.');
      tx.update(ref, {
        state: 'scheduled',
        version: dose.version + 1,
        confirmedBy: null,
        confirmedAt: null,
        requestId: null,
        inventoryConsumed: 0,
        confirmedName: null,
        reportedTakenAt: null,
        correctionReason: command.reason,
      });
    } else {
      if (!canConfirm(dose, ctx.now))
        throw new HttpsError(
          'failed-precondition',
          'Only an unconfirmed dose from the past seven days can be confirmed.',
        );
      tx.update(ref, {
        state: command.state,
        confirmedAt: ctx.now,
        confirmedBy: ctx.actor.uid,
        confirmedName: ctx.actor.name,
        reportedTakenAt: command.reportedTakenAt ?? ctx.now,
        inventoryConsumed: consumed,
        source: member.role,
        version: dose.version + 1,
        requestId: command.requestId,
      });
      for (const alert of alerts.docs) {
        if (alert.get('state') !== 'resolved')
          tx.update(alert.ref, {
            state: 'resolved',
            resolvedBy: ctx.actor.uid,
            outcome: 'Dose action confirmed',
            updatedAt: ctx.now,
            version: Number(alert.get('version')) + 1,
          });
      }
    }
    if (stock.exists && consumed) {
      const mode = command.action === 'correctDose' ? 'restore' : 'consume';
      const balance = inventoryBalance(Number(stock.get('balance')), mode, consumed);
      tx.update(stockRef, {
        balance,
        version: Number(stock.get('version')) + 1,
        updatedAt: ctx.now,
      });
      tx.create(
        circleRef(ctx.db, command.circleId)
          .collection('inventoryAdjustments')
          .doc(`dose_${ref.id}_v${dose.version}`),
        {
          medicationId: dose.medicationId,
          mode,
          quantity: consumed,
          balance,
          doseId: ref.id,
          actorId: ctx.actor.uid,
          createdAt: ctx.now,
          reason: mode === 'restore' ? 'Dose correction' : 'Reported administration',
        },
      );
    }
    audit(
      tx,
      ctx.db,
      command.circleId,
      ctx.actor.uid,
      command.action === 'correctDose' ? 'dose.corrected' : 'dose.confirmed',
      ref.id,
      ctx.now,
      command.action === 'correctDose'
        ? {
            previousState: dose.state,
            previousActor: dose.confirmedBy ?? null,
            previousConfirmedAt: dose.confirmedAt ?? null,
            reason: command.reason,
          }
        : { state: command.state, source: member.role },
    );
    return { id: ref.id, version: dose.version + 1 };
  });
}
export async function extendSchedules(
  ctx: Pick<Context, 'db' | 'now'>,
  only?: { circleId: string; medicationIds: string[] },
) {
  const tasks = only
    ? only.medicationIds.length
      ? await ctx.db.getAll(
          ...only.medicationIds
            .slice(0, 20)
            .map((id) => ctx.db.collection('scheduleTasks').doc(`${only.circleId}_${id}`)),
        )
      : []
    : (
        await ctx.db
          .collection('scheduleTasks')
          .where('nextAt', '<=', ctx.now)
          .orderBy('nextAt')
          .limit(10)
          .get()
      ).docs;
  for (const task of tasks) {
    await ctx.db.runTransaction(async (tx) => {
      const currentTask = await tx.get(task.ref);
      if (!currentTask.exists) return;
      if (currentTask.get('nextAt') > ctx.now) return;
      const circle = circleRef(ctx.db, task.get('circleId'));
      const med = await tx.get(circle.collection('medications').doc(task.get('medicationId')));
      const owner = await tx.get(circle);
      if (!med.exists || med.get('status') !== 'active') {
        tx.update(task.ref, { nextAt: Number.MAX_SAFE_INTEGER });
        return;
      }
      const prefs = await tx.get(
        ctx.db.doc(`users/${owner.get('ownerId')}/notificationPreferences/default`),
      );
      const doses = occurrences(
        med.data() as Medication,
        med.id,
        circle.id,
        med.get('version'),
        ctx.now,
      ).filter((d) => d.scheduledAt >= ctx.now);
      const refs = doses.map((d) => circle.collection('doseOccurrences').doc(d.id));
      const existing = refs.length ? await tx.getAll(...refs) : [];
      doses.forEach((dose, index) => {
        if (!existing[index]?.exists) {
          dose.unconfirmedAfterMinutes = prefs.exists
            ? Number(prefs.get('unconfirmedMinutes'))
            : defaultPreferences.unconfirmedMinutes;
          dose.unconfirmedAt = dose.scheduledAt + dose.unconfirmedAfterMinutes * 60000;
          tx.create(refs[index]!, dose);
          enqueueDose(
            tx,
            ctx.db,
            dose,
            prefs.exists ? (prefs.data() as Preferences) : defaultPreferences,
          );
        }
      });
      tx.update(task.ref, { nextAt: ctx.now + 86400000 });
    });
  }
}
