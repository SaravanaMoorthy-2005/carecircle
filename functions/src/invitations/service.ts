import { randomUUID } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { allowed, roleAllows, type Command, type Member } from '@carecircle/shared';
import { invitationCode, invitationUsable, verifier, verifyCode } from '../domain/security';
import {
  audit,
  authorize,
  circleRef,
  directoryMember,
  recent,
  type Context,
} from '../repositories/context';
import { mailTemplate } from '../notifications/templates';

export async function createInvitation(
  ctx: Context,
  command: Extract<Command, { action: 'invite' }>,
) {
  recent(ctx.actor, ctx.now);
  const invitationId = randomUUID(),
    code = invitationCode();
  const ref = ctx.db.collection('invitations').doc(invitationId);
  const summary = circleRef(ctx.db, command.circleId).collection('invitations').doc(invitationId);
  const data = {
    ...command.invitation,
    circleId: command.circleId,
    state: 'pending',
    expiresAt: ctx.now + 600000,
    attemptsRemaining: 5,
    createdAt: ctx.now,
    createdBy: ctx.actor.uid,
  };
  await ctx.db.runTransaction(async (tx) => {
    const member = await authorize(tx, ctx.db, command.circleId, ctx.actor, 'members.manage');
    if (
      command.invitation.permissions.some(
        (p) => !allowed(member, p) || !roleAllows(command.invitation.role, p),
      )
    )
      throw new HttpsError(
        'permission-denied',
        'These permissions are not available to that role.',
      );
    tx.create(ref, { ...data, verifier: verifier(ctx.hmacSecret, invitationId, code) });
    tx.create(summary, data);
    audit(tx, ctx.db, command.circleId, ctx.actor.uid, 'invitation.created', invitationId, ctx.now);
  });
  try {
    await ctx.mailer.send(
      mailTemplate(
        command.invitation.email,
        'Your CareCircle invitation',
        `You have been invited to a care circle.\nInvitation ID: ${invitationId}\nYour single-use code: ${code}\nExpires in 10 minutes. Sign in with this verified email address to accept.`,
        `${ctx.appUrl}/join`,
        invitationId,
      ),
    );
    await summary.update({ delivery: 'accepted' });
  } catch {
    await ctx.db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.get('state') === 'pending') {
        tx.update(ref, { state: 'revoked' });
        tx.update(summary, { state: 'revoked', delivery: 'failed' });
      }
    });
    throw new HttpsError(
      'unavailable',
      'The email provider could not accept the invitation. Create a new invitation.',
    );
  }
  return { id: invitationId, delivery: 'accepted' };
}
export async function redeemInvitation(
  ctx: Context,
  command: Extract<Command, { action: 'redeem' }>,
) {
  const ref = ctx.db.collection('invitations').doc(command.invitationId);
  const result = await ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const invite = snap.data();
    if (
      !invite ||
      !invitationUsable(
        invite as { state: string; expiresAt: number; attemptsRemaining: number; email: string },
        ctx.actor.email,
        ctx.now,
      )
    )
      return { error: true };
    const summary = circleRef(ctx.db, invite.circleId)
      .collection('invitations')
      .doc(command.invitationId);
    if (!verifyCode(ctx.hmacSecret, command.invitationId, command.code, invite.verifier)) {
      const attemptsRemaining = Number(invite.attemptsRemaining) - 1;
      const state = attemptsRemaining === 0 ? 'locked' : 'pending';
      tx.update(ref, { attemptsRemaining, state });
      tx.update(summary, { state });
      return { error: true };
    }
    const inviter = await tx.get(
      circleRef(ctx.db, invite.circleId).collection('members').doc(invite.createdBy),
    );
    if (
      !allowed(inviter.data() as Member | undefined, 'members.manage') ||
      (invite.permissions as Member['permissions']).some(
        (permission) =>
          !allowed(inviter.data() as Member, permission) || !roleAllows(invite.role, permission),
      )
    )
      return { error: true };
    const memberRef = circleRef(ctx.db, invite.circleId).collection('members').doc(ctx.actor.uid);
    const member = await tx.get(memberRef);
    const members = await tx.get(
      circleRef(ctx.db, invite.circleId)
        .collection('members')
        .where('status', '==', 'active')
        .limit(21),
    );
    if (members.size >= 20)
      throw new HttpsError(
        'resource-exhausted',
        'This care circle has reached its 20-member limit.',
      );
    if (member.get('role') === 'owner' || member.get('status') === 'active')
      throw new HttpsError('already-exists', 'You already belong to this circle.');
    const membership: Member = {
      uid: ctx.actor.uid,
      circleId: invite.circleId,
      displayName: ctx.actor.name,
      email: ctx.actor.email,
      role: invite.role,
      permissions: invite.permissions,
      status: 'active',
    };
    tx.set(memberRef, membership);
    tx.set(
      circleRef(ctx.db, invite.circleId).collection('directory').doc(ctx.actor.uid),
      directoryMember(membership),
    );
    tx.set(ctx.db.doc(`users/${ctx.actor.uid}/circles/${invite.circleId}`), membership);
    tx.update(ref, { state: 'consumed', consumedBy: ctx.actor.uid, consumedAt: ctx.now });
    tx.update(summary, { state: 'consumed' });
    audit(
      tx,
      ctx.db,
      invite.circleId,
      ctx.actor.uid,
      'invitation.redeemed',
      command.invitationId,
      ctx.now,
    );
    return { circleId: String(invite.circleId) };
  });
  if (result.error)
    throw new HttpsError(
      'permission-denied',
      'Invitation unavailable or code incorrect. Check the email, code, and expiry.',
    );
  return result;
}
