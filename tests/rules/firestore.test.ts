import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
let env: RulesTestEnvironment;
beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required');
  env = await initializeTestEnvironment({
    projectId: 'demo-carecircle-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'careCircles/alpha'), { ownerId: 'owner' }),
      setDoc(doc(db, 'careCircles/alpha/members/owner'), {
        role: 'owner',
        status: 'active',
        permissions: ['medication.read', 'medication.write', 'members.manage', 'audit.read'],
      }),
      setDoc(doc(db, 'careCircles/alpha/members/viewer'), {
        role: 'family',
        status: 'active',
        permissions: ['medication.read'],
      }),
      setDoc(doc(db, 'careCircles/alpha/members/revoked'), {
        role: 'caregiver',
        status: 'revoked',
        permissions: ['medication.read'],
      }),
      setDoc(doc(db, 'careCircles/alpha/members/analyst'), {
        role: 'family',
        status: 'active',
        permissions: ['adherence.read'],
      }),
      setDoc(doc(db, 'careCircles/alpha/doseOccurrences/dose'), {
        name: 'Private medication',
        state: 'scheduled',
      }),
      setDoc(doc(db, 'careCircles/alpha/medications/med'), { name: 'Synthetic' }),
      setDoc(doc(db, 'careCircles/beta/medications/med'), { name: 'Other circle' }),
      setDoc(doc(db, 'careCircles/alpha/private/notes'), { ciphertext: 'secret' }),
      setDoc(doc(db, 'invitations/invite'), { verifier: 'secret' }),
      setDoc(doc(db, 'notificationJobs/job'), { internal: true }),
    ]);
  });
});
afterAll(async () => env?.cleanup());
const dbFor = (uid: string, verified = true) =>
  env
    .authenticatedContext(uid, { email_verified: verified, email: `${uid}@example.test` })
    .firestore();
describe('deny-by-default rules', () => {
  it('does not leak medication names through aggregate-only permissions', async () => {
    await assertFails(getDoc(doc(dbFor('analyst'), 'careCircles/alpha/doseOccurrences/dose')));
    await assertFails(
      getDocs(query(collection(dbFor('analyst'), 'careCircles/alpha/doseOccurrences'), limit(20))),
    );
  });
  it('denies anonymous and unverified access', async () => {
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), 'careCircles/alpha/medications/med')),
    );
    await assertFails(getDoc(doc(dbFor('owner', false), 'careCircles/alpha/medications/med')));
  });
  it('allows active authorized reads and bounded queries', async () => {
    await assertSucceeds(getDoc(doc(dbFor('viewer'), 'careCircles/alpha/medications/med')));
    const records = await assertSucceeds(
      getDocs(query(collection(dbFor('viewer'), 'careCircles/alpha/medications'), limit(100))),
    );
    expect(records.size).toBe(1);
  });
  it('denies cross-circle reads, queries and collection-group access', async () => {
    await assertFails(getDoc(doc(dbFor('owner'), 'careCircles/beta/medications/med')));
    await assertFails(
      getDocs(query(collection(dbFor('owner'), 'careCircles/beta/medications'), limit(20))),
    );
    await assertFails(getDocs(query(collectionGroup(dbFor('owner'), 'medications'), limit(20))));
  });
  it('denies revoked members and unrestricted listing', async () => {
    await assertFails(getDoc(doc(dbFor('revoked'), 'careCircles/alpha/medications/med')));
    await assertFails(getDocs(collection(dbFor('viewer'), 'careCircles/alpha/medications')));
    await assertFails(
      getDocs(query(collection(dbFor('viewer'), 'careCircles/alpha/medications'), limit(301))),
    );
  });
  it('denies every direct write, including owner writes', async () => {
    for (const uid of ['owner', 'viewer'])
      await assertFails(
        updateDoc(doc(dbFor(uid), 'careCircles/alpha/medications/med'), { name: 'Tampered' }),
      );
    await assertFails(
      setDoc(doc(dbFor('viewer'), 'careCircles/alpha/members/viewer'), {
        permissions: ['members.manage'],
        status: 'active',
      }),
    );
    await assertFails(
      setDoc(doc(dbFor('owner'), 'careCircles/alpha/auditLogs/fake'), { action: 'forged' }),
    );
  });
  it.each(['invitations/invite', 'notificationJobs/job', 'careCircles/alpha/private/notes'])(
    'denies protected internal document %s',
    async (path) => {
      await assertFails(getDoc(doc(dbFor('owner'), path)));
    },
  );
  it('restricts member lists to membership managers', async () => {
    await assertSucceeds(
      getDocs(query(collection(dbFor('owner'), 'careCircles/alpha/members'), limit(20))),
    );
    await assertFails(
      getDocs(query(collection(dbFor('viewer'), 'careCircles/alpha/members'), limit(20))),
    );
  });
  it('denies direct writes to all new care records and private payloads', async () => {
    for (const collection of [
      'directory',
      'medicationInventory',
      'inventoryAdjustments',
      'doseFollowUps',
      'medicationVersions',
      'careAssignments',
      'prescriptionReconciliations',
      'privateReconciliations',
      'privateCompanions',
      'wellbeingCheckIns',
      'wellbeingSettings',
      'wellbeingExpectations',
    ]) {
      await assertFails(
        setDoc(doc(dbFor('owner'), `careCircles/alpha/${collection}/forged`), {
          state: 'taken',
          version: 99,
        }),
      );
    }
    for (const collection of ['privateCompanions', 'privateReconciliations'])
      await assertFails(getDoc(doc(dbFor('owner'), `careCircles/alpha/${collection}/record`)));
  });
  it('enforces role ceilings even when a legacy member contains excessive grants', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'careCircles/alpha/members/excess'), {
        role: 'family',
        status: 'active',
        permissions: [
          'members.manage',
          'audit.read',
          'prescription.read',
          'inventory.read',
          'task.read',
        ],
      });
    });
    await assertFails(
      getDocs(query(collection(dbFor('excess'), 'careCircles/alpha/members'), limit(20))),
    );
    await assertFails(
      getDoc(doc(dbFor('excess'), 'careCircles/alpha/prescriptionReconciliations/draft')),
    );
    await assertFails(getDoc(doc(dbFor('excess'), 'careCircles/alpha/medicationInventory/med')));
    await assertSucceeds(
      getDocs(query(collection(dbFor('excess'), 'careCircles/alpha/careAssignments'), limit(20))),
    );
  });
});
