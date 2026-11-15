import { parseArgs } from 'node:util';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { directoryMember } from '../functions/src/repositories/context';
import type { Member } from '@carecircle/shared';

// Operator-only migration. No grant, role or clinical record is changed.
const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    circle: { type: 'string' },
    apply: { type: 'boolean', default: false },
  },
});
if (
  !values.project ||
  !values.circle ||
  !/^[a-z0-9-]+$/.test(values.project) ||
  !/^[a-zA-Z0-9_-]{1,160}$/.test(values.circle)
)
  throw new Error('Provide --project PROJECT_ID --circle CIRCLE_ID. Omit --apply for a dry run.');
const local = values.project.startsWith('demo-');
if (local && !process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error('Demo migration requires FIRESTORE_EMULATOR_HOST.');
if (!local && process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error('Remove emulator variables before selecting a production project.');
const db = getFirestore(
  initializeApp({
    projectId: values.project,
    ...(local ? {} : { credential: applicationDefault() }),
  }),
);
const circle = db.doc(`careCircles/${values.circle}`);
const count = await db.runTransaction(async (tx) => {
  const profile = await tx.get(circle),
    members = await tx.get(circle.collection('members').limit(21));
  if (!profile.exists) throw new Error('Care circle does not exist.');
  if (members.size > 20)
    throw new Error('Circle exceeds the supported member bound. Review before migrating.');
  if (values.apply) {
    for (const doc of members.docs)
      tx.set(circle.collection('directory').doc(doc.id), directoryMember(doc.data() as Member));
    tx.create(circle.collection('auditLogs').doc(), {
      actorId: 'migration-operator',
      action: 'directory.migrated.v3',
      resourceId: circle.id,
      createdAt: Date.now(),
    });
  }
  return members.size;
});
console.log(
  `${values.apply ? 'Applied' : 'Dry run'}: ${count} directory records. Existing roles, permissions, medication records and confirmations are unchanged.`,
);
