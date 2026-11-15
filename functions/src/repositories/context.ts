import type { Firestore, Transaction, DocumentReference } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { allowed, type Member, type Permission } from '@carecircle/shared';
export interface Actor {
  uid: string;
  email: string;
  name: string;
  authTime: number;
}
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
}
export interface Mailer {
  send(mail: Mail): Promise<void>;
}
export interface NoteVault {
  seal(note: string, context: string): Promise<unknown>;
  open(envelope: unknown, context: string): Promise<string>;
}
export interface Context {
  db: Firestore;
  actor: Actor;
  now: number;
  hmacSecret: string;
  mailer: Mailer;
  appUrl: string;
  vault: NoteVault;
}
export const circleRef = (db: Firestore, circleId: string) =>
  db.collection('careCircles').doc(circleId);
export function directoryMember(member: Member) {
  return {
    uid: member.uid,
    displayName: member.displayName,
    role: member.role,
    permissions: member.permissions,
    status: member.status,
    contactEmail: member.status === 'active' && member.contactConsent ? member.email : '',
    contactPhone:
      member.status === 'active' && member.contactConsent ? member.contactPhone || '' : '',
  };
}
export async function authorize(
  tx: Transaction,
  db: Firestore,
  circleId: string,
  actor: Actor,
  permission?: Permission,
): Promise<Member> {
  const snap = await tx.get(circleRef(db, circleId).collection('members').doc(actor.uid));
  const member = snap.data() as Member | undefined;
  if (member?.status !== 'active' || (permission && !allowed(member, permission)))
    throw new HttpsError('permission-denied', 'You do not have access to this action.');
  return member;
}
export function recent(actor: Actor, now: number) {
  if (
    !Number.isFinite(actor.authTime) ||
    actor.authTime * 1000 > now + 60000 ||
    now - actor.authTime * 1000 > 5 * 60000
  )
    throw new HttpsError(
      'failed-precondition',
      'Please sign in again before changing access or private notes.',
    );
}
export function audit(
  tx: Transaction,
  db: Firestore,
  circleId: string,
  actorId: string,
  action: string,
  resourceId: string,
  now: number,
  metadata: Record<string, string | number | null> = {},
) {
  tx.create(circleRef(db, circleId).collection('auditLogs').doc(), {
    actorId,
    action,
    resourceId,
    createdAt: now,
    circleId,
    metadata,
  });
}
export async function versioned(tx: Transaction, ref: DocumentReference, expected: number) {
  const snap = await tx.get(ref);
  const actual = snap.exists ? Number(snap.get('version')) : 0;
  if (actual !== expected)
    throw new HttpsError('aborted', 'This record changed. Reload it before trying again.');
  return snap;
}
