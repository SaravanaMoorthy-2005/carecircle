import { scheduledInstant, type Command } from '@carecircle/shared';
import { audit, authorize, circleRef, versioned, type Context } from '../repositories/context';
import { enqueue } from '../scheduling/jobs';
export async function saveAppointment(
  ctx: Context,
  command: Extract<Command, { action: 'saveAppointment' }>,
) {
  return ctx.db.runTransaction(async (tx) => {
    await authorize(tx, ctx.db, command.circleId, ctx.actor, 'appointment.write');
    const ref = circleRef(ctx.db, command.circleId)
      .collection('appointments')
      .doc(command.resourceId);
    const previous = await versioned(tx, ref, command.version);
    const version = command.version + 1;
    const scheduledAt = scheduledInstant(
      command.appointment.localDate,
      command.appointment.localTime,
      command.appointment.timeZone,
    );
    tx.set(ref, {
      ...command.appointment,
      circleId: command.circleId,
      scheduledAt,
      version,
      createdAt: previous.exists ? previous.get('createdAt') : ctx.now,
      createdBy: previous.exists ? previous.get('createdBy') : ctx.actor.uid,
      updatedAt: ctx.now,
      updatedBy: ctx.actor.uid,
    });
    if (command.appointment.status === 'scheduled')
      for (const minutes of new Set(command.appointment.reminderMinutes)) {
        enqueue(tx, ctx.db, `${command.resourceId}_v${version}_${minutes}`, {
          circleId: command.circleId,
          resourceId: ref.id,
          resourceVersion: version,
          dueAt: scheduledAt - minutes * 60000,
          kind: 'appointment',
          collection: 'appointments',
        });
      }
    audit(tx, ctx.db, command.circleId, ctx.actor.uid, 'appointment.saved', ref.id, ctx.now);
    return { id: ref.id, version };
  });
}
