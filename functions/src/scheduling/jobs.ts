import type { Transaction, Firestore } from 'firebase-admin/firestore';
import { defaultPreferences, type Dose, type Preferences } from '@carecircle/shared';
export function enqueue(
  tx: Transaction,
  db: Firestore,
  jobId: string,
  data: {
    circleId: string;
    resourceId: string;
    kind: string;
    dueAt: number;
    resourceVersion: number;
    collection: string;
  },
) {
  tx.set(db.collection('notificationJobs').doc(jobId), {
    ...data,
    id: jobId,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: data.dueAt,
    leaseOwner: null,
    leaseExpiresAt: 0,
    delivered: [],
    lastErrorCode: null,
    deduplicationKey: jobId,
    recipientReference: `careCircles/${data.circleId}/members`,
    channels: data.kind === 'security' ? ['email'] : ['in-app', 'email', 'push'],
  });
}
export function enqueueDose(
  tx: Transaction,
  db: Firestore,
  dose: Dose,
  prefs: Preferences = defaultPreferences,
) {
  for (const [kind, delta] of [
    ['upcoming', -prefs.upcomingMinutes],
    ['unconfirmed', prefs.unconfirmedMinutes],
    ['escalation', prefs.escalationMinutes],
  ] as const) {
    enqueue(tx, db, `${dose.id}_${kind}`, {
      circleId: dose.circleId,
      resourceId: dose.id,
      kind,
      dueAt: dose.scheduledAt + delta * 60000,
      resourceVersion: dose.scheduleVersion,
      collection: 'doseOccurrences',
    });
  }
}
