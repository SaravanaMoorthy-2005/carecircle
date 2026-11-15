import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  alertTransition,
  commandSchema,
  permissions,
  allowed,
  roleAllows,
  type Command,
  type Member,
} from '@carecircle/shared';
import {
  audit,
  authorize,
  circleRef,
  recent,
  versioned,
  directoryMember,
  type Context,
} from '../repositories/context';
import { createInvitation, redeemInvitation } from '../invitations/service';
import { saveMedication, confirmDose, extendSchedules } from '../medications/service';
import { saveAppointment } from '../appointments/service';
import { enqueue } from '../scheduling/jobs';
import { insights } from '../analytics/service';
import {
  inventoryCommand,
  requestRefill,
  followUp,
  saveTask,
  transitionTask,
} from '../care/service';
import { draftPrescription, readPrescription, applyPrescription } from '../care/prescriptions';
import {
  passport,
  companion,
  checkIn,
  wellbeingPreferences,
  contactConsent,
  extendWellbeing,
} from '../care/companion';

export async function dispatch(ctx: Context, input: unknown): Promise<Record<string, unknown>> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpsError('invalid-argument', 'Check the form fields and try again.');
  const command = parsed.data;
  switch (command.action) {
    case 'contactConsent':
      return contactConsent(ctx, command);
    case 'passport':
      return passport(ctx, command);
    case 'readCompanion':
    case 'saveCompanion':
      return companion(ctx, command);
    case 'checkIn':
      return checkIn(ctx, command);
    case 'wellbeingPreferences': {
      const result = await wellbeingPreferences(ctx, command);
      try {
        await extendWellbeing(ctx);
        return { ...result, schedulesPending: false };
      } catch {
        return { ...result, schedulesPending: true };
      }
    }
    case 'inventory':
      return inventoryCommand(ctx, command);
    case 'requestRefill':
      return requestRefill(ctx, command);
    case 'followUp':
      return followUp(ctx, command);
    case 'saveTask':
      return saveTask(ctx, command);
    case 'taskTransition':
      return transitionTask(ctx, command);
    case 'draftPrescription':
      return draftPrescription(ctx, command);
    case 'readPrescription':
      return readPrescription(ctx, command);
    case 'applyPrescription': {
      const result = await applyPrescription(ctx, command);
      try {
        await extendSchedules(ctx, {
          circleId: command.circleId,
          medicationIds: result.medicationIds,
        });
        return { ...result, schedulesPending: false };
      } catch {
        return { ...result, schedulesPending: true };
      }
    }
    case 'insights':
      return insights(ctx, command.circleId);
    case 'invite':
      return createInvitation(ctx, command);
    case 'redeem':
      return redeemInvitation(ctx, command);
    case 'saveMedication':
      return saveMedication(ctx, command);
    case 'confirmDose':
    case 'correctDose':
      return confirmDose(ctx, command);
    case 'saveAppointment':
      return saveAppointment(ctx, command);
    case 'createCircle':
      return createCircle(ctx, command);
    case 'preferences':
      await ctx.db
        .doc(`users/${ctx.actor.uid}/notificationPreferences/default`)
        .set(command.preferences);
      return { saved: true };
    case 'pushToken': {
      const ref = ctx.db.doc(
        `users/${ctx.actor.uid}/pushTokens/${createHash('sha256').update(command.token).digest('hex')}`,
      );
      if (command.remove) await ref.delete();
      else {
        const tokens = await ref.parent.limit(11).get();
        if (tokens.size >= 10 && !tokens.docs.some((t) => t.id === ref.id))
          throw new HttpsError('resource-exhausted', 'Remove an old device before adding another.');
        await ref.set({ token: command.token, updatedAt: ctx.now });
      }
      return { saved: true };
    }
    case 'saveNote':
    case 'readNote': {
      recent(ctx.actor, ctx.now);
      const ref = circleRef(ctx.db, command.circleId).collection('private').doc('notes');
      await ctx.db.runTransaction((tx) =>
        authorize(tx, ctx.db, command.circleId, ctx.actor, 'privacy.manage'),
      );
      const envelope =
        command.action === 'saveNote' ? await ctx.vault.seal(command.note, ref.path) : null;
      return ctx.db.runTransaction(async (tx) => {
        await authorize(tx, ctx.db, command.circleId, ctx.actor, 'privacy.manage');
        const snap = await tx.get(ref);
        if (command.action === 'saveNote') {
          tx.set(ref, { envelope, updatedAt: ctx.now });
          audit(tx, ctx.db, command.circleId, ctx.actor.uid, 'note.saved', 'notes', ctx.now);
          return { saved: true };
        }
        const note = snap.exists ? await ctx.vault.open(snap.get('envelope'), ref.path) : '';
        audit(tx, ctx.db, command.circleId, ctx.actor.uid, 'note.read', 'notes', ctx.now);
        return { note };
      });
    }
    default:
      return mutateCircle(ctx, command);
  }
}
async function createCircle(ctx: Context, command: Extract<Command, { action: 'createCircle' }>) {
  const circleId = createHash('sha256')
    .update(`${ctx.actor.uid}:${command.requestId}`)
    .digest('hex')
    .slice(0, 32);
  return ctx.db.runTransaction(async (tx) => {
    const circle = circleRef(ctx.db, circleId);
    const exists = await tx.get(circle);
    const owned = await tx.get(
      ctx.db.collection('careCircles').where('ownerId', '==', ctx.actor.uid).limit(6),
    );
    if (exists.exists) return { circleId };
    if (owned.size >= 5)
      throw new HttpsError('resource-exhausted', 'You can own up to five care circles.');
    const member: Member = {
      uid: ctx.actor.uid,
      circleId,
      email: ctx.actor.email,
      displayName: ctx.actor.name,
      role: 'owner',
      permissions: [...permissions],
      status: 'active',
    };
    tx.create(circle, {
      ...command.profile,
      ownerId: ctx.actor.uid,
      version: 1,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
    tx.create(circle.collection('members').doc(ctx.actor.uid), member);
    tx.set(circle.collection('directory').doc(ctx.actor.uid), directoryMember(member));
    tx.set(ctx.db.doc(`users/${ctx.actor.uid}/circles/${circleId}`), member);
    tx.set(
      ctx.db.doc(`users/${ctx.actor.uid}`),
      { displayName: ctx.actor.name, email: ctx.actor.email },
      { merge: true },
    );
    audit(tx, ctx.db, circleId, ctx.actor.uid, 'circle.created', circleId, ctx.now);
    return { circleId };
  });
}
type CircleCommand = Extract<
  Command,
  { action: 'updateProfile' | 'revokeInvite' | 'member' | 'help' | 'alert' }
>;
async function mutateCircle(ctx: Context, command: CircleCommand) {
  return ctx.db.runTransaction(async (tx) => {
    const required =
      command.action === 'updateProfile'
        ? 'privacy.manage'
        : command.action === 'revokeInvite' || command.action === 'member'
          ? 'members.manage'
          : command.action === 'alert'
            ? command.collection === 'alerts'
              ? 'alert.acknowledge'
              : 'assistance.respond'
            : undefined;
    const caller = await authorize(tx, ctx.db, command.circleId, ctx.actor, required);
    const circle = circleRef(ctx.db, command.circleId);
    switch (command.action) {
      case 'updateProfile':
        await versioned(tx, circle, command.version);
        tx.update(circle, { ...command.profile, version: command.version + 1, updatedAt: ctx.now });
        break;
      case 'revokeInvite': {
        recent(ctx.actor, ctx.now);
        const ref = ctx.db.collection('invitations').doc(command.invitationId);
        const invite = await tx.get(ref);
        if (invite.get('circleId') !== command.circleId)
          throw new HttpsError('permission-denied', 'Invitation unavailable.');
        if (invite.get('state') !== 'pending')
          throw new HttpsError('failed-precondition', 'Invitation is no longer pending.');
        tx.update(ref, { state: 'revoked' });
        tx.update(circle.collection('invitations').doc(command.invitationId), { state: 'revoked' });
        break;
      }
      case 'member': {
        recent(ctx.actor, ctx.now);
        const ref = circle.collection('members').doc(command.uid);
        const member = await tx.get(ref);
        if (!member.exists || member.get('role') === 'owner' || command.uid === ctx.actor.uid)
          throw new HttpsError(
            'permission-denied',
            'Owner and self access cannot be changed here.',
          );
        if (
          command.status === 'active' &&
          command.permissions.some((p) => !allowed(caller, p) || !roleAllows(member.get('role'), p))
        )
          throw new HttpsError('permission-denied', 'These permissions exceed the member’s role.');
        tx.update(ref, { permissions: command.permissions, status: command.status });
        tx.set(
          circle.collection('directory').doc(command.uid),
          directoryMember({
            ...member.data(),
            permissions: command.permissions,
            status: command.status,
          } as Member),
        );
        tx.update(ctx.db.doc(`users/${command.uid}/circles/${command.circleId}`), {
          permissions: command.permissions,
          status: command.status,
        });
        enqueue(tx, ctx.db, `security_${circle.id}_${command.uid}_${ctx.now}`, {
          circleId: circle.id,
          resourceId: command.uid,
          collection: 'members',
          resourceVersion: 0,
          kind: 'security',
          dueAt: ctx.now,
        });
        break;
      }
      case 'help': {
        const ref = circle.collection('assistanceRequests').doc(command.requestId);
        const existing = await tx.get(ref);
        if (existing.exists) {
          if (existing.get('createdBy') !== ctx.actor.uid)
            throw new HttpsError('permission-denied', 'Request unavailable.');
          return { id: ref.id };
        }
        tx.create(ref, {
          category: command.category,
          state: 'created',
          priority: 'high',
          version: 1,
          createdBy: ctx.actor.uid,
          createdAt: ctx.now,
          updatedAt: ctx.now,
          circleId: circle.id,
        });
        enqueue(tx, ctx.db, `help_${circle.id}_${ref.id}`, {
          circleId: circle.id,
          resourceId: ref.id,
          collection: 'assistanceRequests',
          resourceVersion: 1,
          kind: 'assistance',
          dueAt: ctx.now,
        });
        break;
      }
      case 'alert': {
        const ref = circle.collection(command.collection).doc(command.resourceId);
        const event = await versioned(tx, ref, command.version);
        if (!alertTransition(event.get('state'), command.state, command.outcome))
          throw new HttpsError(
            'failed-precondition',
            'Acknowledge first; resolution requires an outcome of at least five characters.',
          );
        tx.update(ref, {
          state: command.state,
          version: command.version + 1,
          updatedAt: ctx.now,
          ...(command.state === 'acknowledged'
            ? { acknowledgedBy: ctx.actor.uid, acknowledgedAt: ctx.now }
            : { resolvedBy: ctx.actor.uid, resolvedAt: ctx.now, outcome: command.outcome }),
        });
        break;
      }
    }
    const resourceId =
      'resourceId' in command
        ? command.resourceId
        : 'uid' in command
          ? command.uid
          : 'invitationId' in command
            ? command.invitationId
            : 'requestId' in command
              ? command.requestId
              : circle.id;
    audit(tx, ctx.db, circle.id, ctx.actor.uid, command.action, resourceId, ctx.now);
    return { saved: true };
  });
}
