import { HttpsError } from 'firebase-functions/v2/https';
import {
  prescriptionDifference,
  type Command,
  type Medication,
  type PrescriptionItem,
} from '@carecircle/shared';
import {
  audit,
  authorize,
  circleRef,
  recent,
  versioned,
  type Context,
} from '../repositories/context';

type Draft = Extract<Command, { action: 'draftPrescription' }>;
export async function draftPrescription(ctx: Context, input: Draft) {
  const circle = circleRef(ctx.db, input.circleId),
    ref = circle.collection('prescriptionReconciliations').doc(input.requestId);
  const before = await ctx.db.runTransaction(async (tx) => {
    await authorize(tx, ctx.db, circle.id, ctx.actor, 'prescription.write');
    return (
      await tx.getAll(
        ...input.items.map((i) => circle.collection('medications').doc(i.medicationId)),
      )
    ).map((doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null));
  });
  const encrypted = await ctx.vault.seal(
    JSON.stringify({ source: input.source, items: input.items, previous: before }),
    ref.path,
  );
  return ctx.db.runTransaction(async (tx) => {
    await authorize(tx, ctx.db, circle.id, ctx.actor, 'prescription.write');
    const exists = await tx.get(ref);
    if (exists.exists) {
      if (exists.get('createdBy') !== ctx.actor.uid)
        throw new HttpsError('permission-denied', 'Draft unavailable.');
      return { id: ref.id };
    }
    const current = await tx.getAll(
      ...input.items.map((i) => circle.collection('medications').doc(i.medicationId)),
    );
    const counts: Record<string, number> = { Added: 0, Modified: 0, Discontinued: 0, Unchanged: 0 };
    input.items.forEach((item, index) => {
      const previous = current[index]!;
      if ((previous.exists ? previous.get('version') : 0) !== item.expectedVersion)
        throw new HttpsError(
          'aborted',
          'A medication changed while preparing this draft. Refresh the list.',
        );
      const difference = prescriptionDifference(
        previous.exists ? (previous.data() as Medication) : null,
        item.medication,
      );
      counts[difference.kind] = (counts[difference.kind] || 0) + 1;
    });
    tx.create(ref, {
      state: 'draft',
      version: 1,
      counts,
      createdBy: ctx.actor.uid,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
    tx.create(circle.collection('privateReconciliations').doc(ref.id), { envelope: encrypted });
    audit(tx, ctx.db, circle.id, ctx.actor.uid, 'prescription.drafted', ref.id, ctx.now);
    return { id: ref.id };
  });
}
export async function readPrescription(
  ctx: Context,
  input: Extract<Command, { action: 'readPrescription' }>,
) {
  return ctx.db.runTransaction(async (tx) => {
    await authorize(tx, ctx.db, input.circleId, ctx.actor, 'prescription.read');
    const circle = circleRef(ctx.db, input.circleId),
      ref = circle.collection('prescriptionReconciliations').doc(input.resourceId);
    const [summary, secret] = await tx.getAll(
      ref,
      circle.collection('privateReconciliations').doc(ref.id),
    );
    if (!summary?.exists || !secret?.exists)
      throw new HttpsError('not-found', 'Prescription draft unavailable.');
    const plan = JSON.parse(await ctx.vault.open(secret.get('envelope'), ref.path)) as {
      source: string;
      items: PrescriptionItem[];
      previous: (Medication | null)[];
    };
    return { id: ref.id, ...summary.data(), ...plan };
  });
}
export async function applyPrescription(
  ctx: Context,
  input: Extract<Command, { action: 'applyPrescription' }>,
) {
  recent(ctx.actor, ctx.now);
  const circle = circleRef(ctx.db, input.circleId),
    ref = circle.collection('prescriptionReconciliations').doc(input.resourceId);
  return ctx.db.runTransaction(async (tx) => {
    await authorize(tx, ctx.db, circle.id, ctx.actor, 'prescription.approve');
    const summary = await versioned(tx, ref, input.version);
    if (summary.get('state') !== 'draft')
      throw new HttpsError('failed-precondition', 'This prescription has already been applied.');
    const secret = await tx.get(circle.collection('privateReconciliations').doc(ref.id));
    const plan = JSON.parse(await ctx.vault.open(secret.get('envelope'), ref.path)) as {
      items: PrescriptionItem[];
    };
    const previous = await tx.getAll(
      ...plan.items.map((item) => circle.collection('medications').doc(item.medicationId)),
    );
    const future = await tx.get(
      circle
        .collection('doseOccurrences')
        .where('state', '==', 'scheduled')
        .where('scheduledAt', '>=', ctx.now)
        .limit(301),
    );
    if (future.size > 300)
      throw new HttpsError(
        'resource-exhausted',
        'This circle needs a smaller reconciliation batch. Contact its administrator.',
      );
    const changed = new Set<string>();
    plan.items.forEach((item, index) => {
      const prior = previous[index]!;
      if ((prior.exists ? prior.get('version') : 0) !== item.expectedVersion)
        throw new HttpsError(
          'aborted',
          'A medication changed after this draft. Create a fresh comparison.',
        );
      if (
        prescriptionDifference(prior.exists ? (prior.data() as Medication) : null, item.medication)
          .kind !== 'Unchanged'
      )
        changed.add(item.medicationId);
    });
    for (const dose of future.docs)
      if (changed.has(dose.get('medicationId')))
        tx.update(dose.ref, { state: 'cancelled', version: Number(dose.get('version')) + 1 });
    plan.items.forEach((item, index) => {
      if (!changed.has(item.medicationId)) return;
      const prior = previous[index]!,
        version = item.expectedVersion + 1;
      if (prior.exists)
        tx.set(
          circle
            .collection('medicationVersions')
            .doc(`${item.medicationId}_v${item.expectedVersion}`),
          { ...prior.data(), medicationId: item.medicationId, preservedAt: ctx.now },
        );
      const updated = {
        ...item.medication,
        circleId: circle.id,
        version,
        createdBy: prior.exists ? prior.get('createdBy') : ctx.actor.uid,
        createdAt: prior.exists ? prior.get('createdAt') : ctx.now,
        updatedAt: ctx.now,
        updatedBy: ctx.actor.uid,
        reconciliationId: ref.id,
      };
      tx.set(prior.ref, updated);
      tx.set(circle.collection('medicationVersions').doc(`${item.medicationId}_v${version}`), {
        ...updated,
        medicationId: item.medicationId,
      });
      tx.set(ctx.db.collection('scheduleTasks').doc(`${circle.id}_${item.medicationId}`), {
        circleId: circle.id,
        medicationId: item.medicationId,
        nextAt: item.medication.status === 'active' ? ctx.now : Number.MAX_SAFE_INTEGER,
      });
    });
    tx.update(ref, {
      state: 'applied',
      version: input.version + 1,
      appliedBy: ctx.actor.uid,
      appliedAt: ctx.now,
      updatedAt: ctx.now,
    });
    audit(tx, ctx.db, circle.id, ctx.actor.uid, 'prescription.applied', ref.id, ctx.now, {
      changes: changed.size,
    });
    return { applied: true, schedulesQueued: changed.size, medicationIds: [...changed] };
  });
}
