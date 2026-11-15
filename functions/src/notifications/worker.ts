import { randomUUID } from 'node:crypto';
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import {
  allowed,
  defaultPreferences,
  retryAt,
  type Member,
  type Permission,
} from '@carecircle/shared';
import { audit, circleRef, type Mailer } from '../repositories/context';
import { permanentMailFailure, safeErrorCode } from '../domain/security';
import { mailTemplate } from './templates';
interface WorkerContext {
  db: Firestore;
  now: number;
  mailer: Mailer;
  appUrl: string;
  push?: (uid: string) => Promise<void>;
}
interface Job {
  id: string;
  circleId: string;
  resourceId: string;
  collection: string;
  resourceVersion: number;
  kind: string;
  dueAt: number;
  attempts: number;
  status: string;
  leaseOwner: string;
  leaseExpiresAt: number;
  delivered: string[];
}
export async function claim(
  db: Firestore,
  ref: DocumentReference,
  now: number,
  workerId: string,
): Promise<Job | null> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const job = snap.data();
    if (!job || !['pending', 'processing'].includes(job.status) || job.nextAttemptAt > now)
      return null;
    const claimed = {
      ...job,
      attempts: Number(job.attempts) + 1,
      status: 'processing',
      leaseOwner: workerId,
      leaseExpiresAt: now + 300000,
      nextAttemptAt: now + 300000,
    };
    tx.update(ref, claimed);
    return claimed as unknown as Job;
  });
}
async function finish(
  db: Firestore,
  ref: DocumentReference,
  workerId: string,
  update: Record<string, unknown>,
) {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.get('leaseOwner') === workerId) tx.update(ref, update);
  });
}
function permissionFor(job: Job): Permission {
  return job.kind === 'task'
    ? 'task.read'
    : job.kind === 'checkin'
      ? 'checkin.read'
      : job.kind === 'appointment'
        ? 'appointment.read'
        : job.kind === 'assistance'
          ? 'assistance.respond'
          : job.kind === 'escalation'
            ? 'alert.read'
            : 'medication.read';
}
async function currentResource(db: Firestore, job: Job, now: number) {
  const ref = circleRef(db, job.circleId).collection(job.collection).doc(job.resourceId);
  const resource = await ref.get();
  if (!resource.exists) return null;
  if (job.collection === 'doseOccurrences') {
    if (resource.get('followUpAcknowledged') && ['unconfirmed', 'escalation'].includes(job.kind))
      return null;
    if (
      ['taken', 'skipped', 'cancelled'].includes(resource.get('state')) ||
      resource.get('scheduleVersion') !== job.resourceVersion
    )
      return null;
    if (job.kind === 'upcoming' && now > resource.get('scheduledAt') + 30 * 60000) return null;
  }
  if (job.collection === 'careAssignments' && resource.get('version') !== job.resourceVersion)
    return null;
  if (job.collection === 'wellbeingExpectations') {
    const [settings, checkin] = await Promise.all([
      circleRef(db, job.circleId).collection('wellbeingSettings').doc('default').get(),
      circleRef(db, job.circleId)
        .collection('wellbeingCheckIns')
        .doc(resource.get('localDate'))
        .get(),
    ]);
    if (
      !settings.get('enabled') ||
      settings.get('version') !== job.resourceVersion ||
      checkin.exists
    )
      return null;
  }
  if (
    job.collection === 'appointments' &&
    (resource.get('status') !== 'scheduled' ||
      resource.get('version') !== job.resourceVersion ||
      resource.get('scheduledAt') < now)
  )
    return null;
  if (
    job.collection === 'assistanceRequests' &&
    ['acknowledged', 'resolved'].includes(resource.get('state'))
  )
    return null;
  return resource;
}
export async function processJobs(ctx: WorkerContext) {
  const workerId = randomUUID();
  const due = await ctx.db
    .collection('notificationJobs')
    .where('status', 'in', ['pending', 'processing'])
    .where('nextAttemptAt', '<=', ctx.now)
    .orderBy('nextAttemptAt')
    .limit(30)
    .get();
  let processed = 0;
  for (const snap of due.docs) {
    const job = await claim(ctx.db, snap.ref, ctx.now, workerId);
    if (!job) continue;
    try {
      if (job.kind === 'security') {
        const membership = await circleRef(ctx.db, job.circleId)
          .collection('members')
          .doc(job.resourceId)
          .get();
        if (membership.exists) {
          await ctx.mailer.send(
            mailTemplate(
              String(membership.get('email')),
              'Your CareCircle access changed',
              'Your access or permissions in a care circle have changed. Sign in to review your current access.',
              ctx.appUrl,
              job.id,
            ),
          );
        }
        await finish(ctx.db, snap.ref, workerId, { status: 'completed', completedAt: ctx.now });
        processed++;
        continue;
      }
      const resource = await currentResource(ctx.db, job, ctx.now);
      if (!resource) {
        await finish(ctx.db, snap.ref, workerId, { status: 'cancelled' });
        continue;
      }
      const circle = circleRef(ctx.db, job.circleId);
      const candidates = await circle
        .collection('members')
        .where('status', '==', 'active')
        .limit(20)
        .get();
      const assignedCaregivers = candidates.docs
        .map((doc) => doc.data() as Member)
        .filter(
          (member) =>
            member.role !== 'owner' &&
            allowed(member, job.kind === 'assistance' ? 'assistance.respond' : 'alert.acknowledge'),
        )
        .map((member) => ({ uid: member.uid, displayName: member.displayName }));
      if (job.kind === 'escalation' || job.kind === 'checkin')
        await ctx.db.runTransaction(async (tx) => {
          const alert = circle.collection('alerts').doc(job.id);
          const prior = await tx.get(alert);
          const fresh = await tx.get(resource.ref);
          if (!prior.exists && !['taken', 'skipped', 'cancelled'].includes(fresh.get('state')))
            tx.create(alert, {
              circleId: circle.id,
              category:
                job.kind === 'checkin'
                  ? 'Daily check-in not recorded — please check in'
                  : 'Unconfirmed dose — check in',
              resourceId: job.resourceId,
              state: 'created',
              priority: job.kind === 'checkin' ? 'normal' : 'high',
              assignedCaregivers,
              version: 1,
              createdAt: ctx.now,
              updatedAt: ctx.now,
            });
        });
      for (const candidate of candidates.docs) {
        if (job.delivered.includes(candidate.id)) continue;
        // Re-read recipient authorization and source state at the delivery boundary.
        const [freshMember, preference, freshResource] = await Promise.all([
          candidate.ref.get(),
          ctx.db.doc(`users/${candidate.id}/notificationPreferences/default`).get(),
          currentResource(ctx.db, job, ctx.now),
        ]);
        const member = freshMember.data() as Member | undefined;
        if (!freshResource || !allowed(member, permissionFor(job))) continue;
        if (
          job.kind === 'checkin' &&
          (member?.role === 'owner' || !allowed(member, 'assistance.respond'))
        )
          continue;
        if (
          job.kind === 'task' &&
          (freshResource.get('assignedTo')
            ? freshResource.get('assignedTo') !== candidate.id
            : !allowed(member, 'task.manage'))
        )
          continue;
        if (['escalation', 'assistance'].includes(job.kind) && member?.role === 'owner') continue;
        const prefs = { ...defaultPreferences, ...preference.data() };
        const notification = ctx.db.doc(`users/${candidate.id}/notifications/${job.id}`);
        const previousDelivery = await notification.get();
        const eventText =
          job.kind === 'task'
            ? 'A care responsibility was assigned or updated. Open Care Tasks for details.'
            : job.kind === 'checkin'
              ? 'A planned wellbeing check-in has not been recorded. Please check in; this does not indicate an emergency.'
              : job.kind === 'upcoming'
                ? 'A scheduled care action is coming up.'
                : job.kind === 'unconfirmed'
                  ? 'A scheduled care action is still unconfirmed. Please check in.'
                  : job.kind === 'escalation'
                    ? 'Your care circle could use a check-in.'
                    : job.kind === 'appointment'
                      ? 'You have an upcoming care appointment.'
                      : 'Someone in your care circle has requested assistance.';
        await notification.set(
          {
            circleId: job.circleId,
            kind: job.kind,
            message: eventText,
            createdAt: ctx.now,
            delivery: 'pending',
          },
          { merge: true },
        );
        if (prefs.email && member && previousDelivery.get('emailStatus') !== 'accepted') {
          await ctx.mailer.send(
            mailTemplate(
              member.email,
              'A CareCircle update',
              eventText,
              `${ctx.appUrl}/dashboard`,
              `${job.id}-${member.uid}`,
            ),
          );
          await notification.set({ emailStatus: 'accepted' }, { merge: true });
        }
        if (prefs.push && ctx.push && previousDelivery.get('pushStatus') !== 'accepted') {
          await ctx.push(candidate.id);
          await notification.set({ pushStatus: 'accepted' }, { merge: true });
        }
        await notification.set({ delivery: prefs.email ? 'accepted' : 'in-app' }, { merge: true });
        job.delivered.push(candidate.id);
        await finish(ctx.db, snap.ref, workerId, { delivered: job.delivered });
      }
      if (job.kind === 'escalation' || job.kind === 'checkin' || job.kind === 'assistance') {
        const alert =
          job.kind === 'escalation' || job.kind === 'checkin'
            ? circle.collection('alerts').doc(job.id)
            : resource.ref;
        await ctx.db.runTransaction(async (tx) => {
          const current = await tx.get(alert);
          if (current.get('state') === 'created' && job.delivered.length)
            tx.update(alert, {
              state: 'sent',
              assignedCaregivers,
              updatedAt: ctx.now,
              version: Number(current.get('version')) + 1,
            });
        });
      }
      await ctx.db.runTransaction(async (tx) => {
        const current = await tx.get(snap.ref);
        if (current.get('leaseOwner') !== workerId) return;
        tx.update(snap.ref, { status: 'completed', completedAt: ctx.now });
        audit(
          tx,
          ctx.db,
          job.circleId,
          'system',
          'notification.processed',
          job.resourceId,
          ctx.now,
        );
      });
      processed++;
    } catch (error) {
      const permanent = permanentMailFailure(error) || job.attempts >= 5;
      await finish(ctx.db, snap.ref, workerId, {
        status: permanent ? 'failed' : 'pending',
        nextAttemptAt: retryAt(job.attempts, ctx.now),
        lastErrorCode: safeErrorCode(error),
        leaseOwner: null,
        leaseExpiresAt: 0,
      });
    }
  }
  return { processed };
}
