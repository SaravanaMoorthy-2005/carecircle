import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  allowed,
  canConfirm,
  inventoryBalance,
  taskTransitionAllowed,
  type CareTask,
  type Command,
  type Member,
} from '@carecircle/shared';
import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import { audit, authorize, circleRef, versioned, type Context } from '../repositories/context';
import { enqueue } from '../scheduling/jobs';

type Action<A extends Command['action']> = Extract<Command, { action: A }>;
function queueTask(tx: Transaction, ctx: Context, circleId: string, id: string, version: number) {
  enqueue(tx, ctx.db, `task_${circleId}_${id}_v${version}`, {
    circleId,
    resourceId: id,
    resourceVersion: version,
    collection: 'careAssignments',
    kind: 'task',
    dueAt: ctx.now,
  });
}
function writeRefill(
  tx: Transaction,
  ctx: Context,
  circleId: string,
  medicationId: string,
  name: string,
  existing: DocumentSnapshot,
) {
  if (existing.exists && !['completed', 'declined'].includes(existing.get('state')))
    return existing.id;
  const version = existing.exists ? Number(existing.get('version')) + 1 : 1;
  tx.set(existing.ref, {
    circleId,
    title: `Refill ${name}`,
    category: 'refill',
    detail: 'Please check the medicine supply and arrange a refill with the usual provider.',
    relatedId: medicationId,
    assignedTo: null,
    assignedName: '',
    dueAt: ctx.now + 86400000,
    coverageStart: null,
    coverageEnd: null,
    state: 'pending',
    version,
    createdAt: ctx.now,
    createdBy: ctx.actor.uid,
    updatedAt: ctx.now,
  });
  queueTask(tx, ctx, circleId, existing.id, version);
  audit(tx, ctx.db, circleId, ctx.actor.uid, 'refill.requested', existing.id, ctx.now);
  return existing.id;
}
export async function requestRefill(ctx: Context, input: Action<'requestRefill'>) {
  return ctx.db.runTransaction(async (tx) => {
    await authorize(tx, ctx.db, input.circleId, ctx.actor, 'medication.read');
    const circle = circleRef(ctx.db, input.circleId);
    const medication = await tx.get(circle.collection('medications').doc(input.medicationId));
    const task = await tx.get(
      circle.collection('careAssignments').doc(`refill_${input.medicationId}`),
    );
    if (!medication.exists) throw new HttpsError('not-found', 'Medication unavailable.');
    return {
      id: writeRefill(tx, ctx, input.circleId, input.medicationId, medication.get('name'), task),
    };
  });
}
export async function inventoryCommand(ctx: Context, input: Action<'inventory'>) {
  return ctx.db.runTransaction(async (tx) => {
    await authorize(tx, ctx.db, input.circleId, ctx.actor, 'inventory.write');
    const circle = circleRef(ctx.db, input.circleId),
      ref = circle.collection('medicationInventory').doc(input.medicationId);
    const ledger = circle.collection('inventoryAdjustments').doc(input.requestId);
    const [med, existing, prior] = await tx.getAll(
      circle.collection('medications').doc(input.medicationId),
      ref,
      ledger,
    );
    if (!med || !existing || !prior) throw new HttpsError('internal', 'Stock could not be loaded.');
    if (!med.exists) throw new HttpsError('not-found', 'Medication unavailable.');
    const signature = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    if (prior.exists) {
      if (prior.get('actorId') !== ctx.actor.uid || prior.get('signature') !== signature)
        throw new HttpsError('already-exists', 'This adjustment identifier is already in use.');
      return { saved: true, duplicate: true };
    }
    if ((existing.exists ? Number(existing.get('version')) : 0) !== input.version)
      throw new HttpsError('aborted', 'Stock changed. Review the latest estimate first.');
    const before = existing.exists ? Number(existing.get('balance')) : 0;
    const balance = inventoryBalance(before, input.mode, input.quantity);
    if (Math.abs(balance) > 100000)
      throw new HttpsError('invalid-argument', 'Stock exceeds the supported range.');
    tx.set(ref, {
      medicationId: input.medicationId,
      circleId: input.circleId,
      balance,
      unit: input.unit,
      unitsPerDose: input.unitsPerDose,
      lowDays: input.lowDays,
      version: input.version + 1,
      updatedAt: ctx.now,
    });
    tx.create(ledger, {
      medicationId: input.medicationId,
      mode: input.mode,
      quantity: input.quantity,
      previous: before,
      balance,
      reason: input.reason,
      actorId: ctx.actor.uid,
      createdAt: ctx.now,
      signature,
    });
    audit(
      tx,
      ctx.db,
      input.circleId,
      ctx.actor.uid,
      'inventory.adjusted',
      input.medicationId,
      ctx.now,
      { mode: input.mode, quantity: input.quantity },
    );
    return { saved: true, balance };
  });
}
export async function followUp(ctx: Context, input: Action<'followUp'>) {
  return ctx.db.runTransaction(async (tx) => {
    await authorize(tx, ctx.db, input.circleId, ctx.actor, 'medication.confirm');
    const circle = circleRef(ctx.db, input.circleId),
      ref = circle.collection('doseOccurrences').doc(input.resourceId);
    const dose = await tx.get(ref);
    if (!dose.exists) throw new HttpsError('not-found', 'Dose unavailable.');
    if (
      dose.get('followUpRequestId') === input.requestId &&
      dose.get('followUpBy') === ctx.actor.uid
    )
      return { version: dose.get('version') };
    if (dose.get('version') !== input.version)
      throw new HttpsError('aborted', 'This dose changed. Review its latest status.');
    if (!canConfirm(dose.data() as Parameters<typeof canConfirm>[0], ctx.now))
      throw new HttpsError(
        'failed-precondition',
        'Follow-up is available for an eligible unconfirmed dose.',
      );
    const refill = await tx.get(
      circle.collection('careAssignments').doc(`refill_${dose.get('medicationId')}`),
    );
    const help = await tx.get(circle.collection('assistanceRequests').doc(`followup_${ref.id}`));
    const alerts = await tx.get(
      circle.collection('alerts').where('resourceId', '==', ref.id).limit(10),
    );
    const version = input.version + 1;
    tx.update(ref, {
      followUpReason: input.reason,
      followUpAt: ctx.now,
      followUpBy: ctx.actor.uid,
      followUpRequestId: input.requestId,
      followUpAcknowledged: true,
      version,
    });
    tx.set(circle.collection('doseFollowUps').doc(input.requestId), {
      doseId: ref.id,
      reason: input.reason,
      actorId: ctx.actor.uid,
      createdAt: ctx.now,
    });
    if (input.reason === 'unavailable')
      writeRefill(tx, ctx, input.circleId, dose.get('medicationId'), dose.get('name'), refill);
    if (
      ['assistance', 'unwell'].includes(input.reason) &&
      (!help.exists || help.get('state') === 'resolved')
    ) {
      const helpVersion = help.exists ? Number(help.get('version')) + 1 : 1;
      tx.set(help.ref, {
        circleId: circle.id,
        category:
          input.reason === 'unwell'
            ? 'Feeling unwell — please contact me'
            : 'Medication assistance',
        state: 'created',
        priority: 'high',
        version: helpVersion,
        createdBy: ctx.actor.uid,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        relatedDose: ref.id,
      });
      enqueue(tx, ctx.db, `followup_${circle.id}_${ref.id}_v${helpVersion}`, {
        circleId: circle.id,
        resourceId: help.id,
        collection: 'assistanceRequests',
        resourceVersion: helpVersion,
        kind: 'assistance',
        dueAt: ctx.now,
      });
    }
    for (const alert of alerts.docs)
      if (['created', 'sent'].includes(alert.get('state')))
        tx.update(alert.ref, {
          state: 'acknowledged',
          acknowledgedBy: ctx.actor.uid,
          acknowledgedAt: ctx.now,
          version: Number(alert.get('version')) + 1,
          updatedAt: ctx.now,
        });
    audit(tx, ctx.db, input.circleId, ctx.actor.uid, 'dose.follow_up', ref.id, ctx.now, {
      reason: input.reason,
    });
    return { saved: true, version };
  });
}
export async function saveTask(ctx: Context, input: Action<'saveTask'>) {
  return ctx.db.runTransaction(async (tx) => {
    await authorize(tx, ctx.db, input.circleId, ctx.actor, 'task.manage');
    const circle = circleRef(ctx.db, input.circleId),
      ref = circle.collection('careAssignments').doc(input.resourceId);
    const previous = await versioned(tx, ref, input.version);
    const assignee = input.task.assignedTo
      ? ((await tx.get(circle.collection('members').doc(input.task.assignedTo))).data() as
          Member | undefined)
      : undefined;
    if (input.task.assignedTo && !allowed(assignee, 'task.act'))
      throw new HttpsError(
        'permission-denied',
        'Choose an active member who can accept responsibilities.',
      );
    if (input.task.relatedId) {
      const collection =
        input.task.category === 'appointment'
          ? 'appointments'
          : ['medication', 'refill'].includes(input.task.category)
            ? 'medications'
            : null;
      if (
        !collection ||
        !(await tx.get(circle.collection(collection).doc(input.task.relatedId))).exists
      )
        throw new HttpsError('invalid-argument', 'The related care record is unavailable.');
      if (
        assignee &&
        !allowed(assignee, collection === 'appointments' ? 'appointment.read' : 'medication.read')
      )
        throw new HttpsError(
          'permission-denied',
          'The assignee needs permission to the related care record.',
        );
    }
    if (previous.get('state') === 'completed')
      throw new HttpsError(
        'failed-precondition',
        'Completed responsibilities stay in history. Create a new task.',
      );
    const reassigned =
      !previous.exists ||
      previous.get('assignedTo') !== input.task.assignedTo ||
      previous.get('state') === 'declined';
    const version = input.version + 1;
    tx.set(ref, {
      ...input.task,
      circleId: circle.id,
      assignedName: assignee?.displayName || '',
      state: reassigned ? 'pending' : previous.get('state'),
      version,
      createdAt: previous.exists ? previous.get('createdAt') : ctx.now,
      createdBy: previous.exists ? previous.get('createdBy') : ctx.actor.uid,
      updatedAt: ctx.now,
    });
    queueTask(tx, ctx, circle.id, ref.id, version);
    audit(
      tx,
      ctx.db,
      circle.id,
      ctx.actor.uid,
      reassigned ? 'task.assigned' : 'task.updated',
      ref.id,
      ctx.now,
    );
    return { id: ref.id, version };
  });
}
export async function transitionTask(ctx: Context, input: Action<'taskTransition'>) {
  return ctx.db.runTransaction(async (tx) => {
    const member = await authorize(tx, ctx.db, input.circleId, ctx.actor, 'task.act');
    const ref = circleRef(ctx.db, input.circleId)
        .collection('careAssignments')
        .doc(input.resourceId),
      current = await versioned(tx, ref, input.version);
    if (!current.exists) throw new HttpsError('not-found', 'Responsibility unavailable.');
    if (current.get('assignedTo') !== ctx.actor.uid && !allowed(member, 'task.manage'))
      throw new HttpsError(
        'permission-denied',
        'Only the assigned person or a care manager can update this responsibility.',
      );
    if (!current.get('assignedTo'))
      throw new HttpsError(
        'failed-precondition',
        'Assign this responsibility before accepting it.',
      );
    if (!taskTransitionAllowed(current.get('state') as CareTask['state'], input.state))
      throw new HttpsError('failed-precondition', 'This task status cannot change that way.');
    if (['completed', 'declined'].includes(input.state) && input.outcome.trim().length < 3)
      throw new HttpsError('invalid-argument', 'Add a short outcome or reason.');
    tx.update(ref, {
      state: input.state,
      outcome: input.outcome,
      updatedAt: ctx.now,
      updatedBy: ctx.actor.uid,
      version: input.version + 1,
    });
    queueTask(tx, ctx, input.circleId, ref.id, input.version + 1);
    audit(tx, ctx.db, input.circleId, ctx.actor.uid, `task.${input.state}`, ref.id, ctx.now);
    return { saved: true };
  });
}
