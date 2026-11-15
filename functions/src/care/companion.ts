import { HttpsError } from 'firebase-functions/v2/https';
import { Temporal } from '@js-temporal/polyfill';
import { allowed, type Command, type Medication } from '@carecircle/shared';
import {
  audit,
  authorize,
  circleRef,
  directoryMember,
  recent,
  versioned,
  type Context,
} from '../repositories/context';
import { enqueue } from '../scheduling/jobs';
type Action<A extends Command['action']> = Extract<Command, { action: A }>;
export async function contactConsent(ctx: Context, input: Action<'contactConsent'>) {
  return ctx.db.runTransaction(async (tx) => {
    const caller = await authorize(tx, ctx.db, input.circleId, ctx.actor),
      circle = circleRef(ctx.db, input.circleId);
    const changed = {
      ...caller,
      contactConsent: input.enabled,
      contactPhone: input.enabled ? input.phone : '',
    };
    tx.update(circle.collection('members').doc(ctx.actor.uid), {
      contactConsent: input.enabled,
      contactPhone: changed.contactPhone,
    });
    tx.update(ctx.db.doc(`users/${ctx.actor.uid}/circles/${input.circleId}`), {
      contactConsent: input.enabled,
      contactPhone: changed.contactPhone,
    });
    tx.set(circle.collection('directory').doc(ctx.actor.uid), directoryMember(changed));
    audit(tx, ctx.db, circle.id, ctx.actor.uid, 'contact.consent', ctx.actor.uid, ctx.now, {
      enabled: input.enabled ? 'yes' : 'no',
    });
    return { saved: true };
  });
}
export async function passport(ctx: Context, input: Action<'passport'>) {
  if (input.includePrivateNotes) recent(ctx.actor, ctx.now);
  return ctx.db.runTransaction(async (tx) => {
    const caller = await authorize(tx, ctx.db, input.circleId, ctx.actor, 'passport.read');
    if (
      !allowed(caller, 'medication.read') ||
      (input.includePrivateNotes && !allowed(caller, 'privacy.manage'))
    )
      throw new HttpsError(
        'permission-denied',
        'You do not have access to the requested summary content.',
      );
    const circle = circleRef(ctx.db, input.circleId),
      profile = await tx.get(circle),
      meds = await tx.get(
        circle.collection('medications').where('status', '==', 'active').limit(100),
      );
    const note = input.includePrivateNotes
      ? await tx.get(circle.collection('private').doc('notes'))
      : null;
    const content = note?.exists ? await ctx.vault.open(note.get('envelope'), note.ref.path) : null;
    audit(tx, ctx.db, circle.id, ctx.actor.uid, 'passport.viewed', circle.id, ctx.now, {
      privateNotes: input.includePrivateNotes ? 'included' : 'excluded',
    });
    return {
      displayName: profile.get('displayName'),
      timeZone: profile.get('timeZone'),
      emergencyContact: profile.get('emergencyContact'),
      generatedAt: ctx.now,
      notes: content,
      medications: meds.docs.map((doc) => {
        const m = doc.data() as Medication;
        return {
          name: m.name,
          strength: m.strength,
          instructions: m.instructions,
          times: m.times,
          weekdays: m.weekdays,
          timeZone: m.timeZone,
          doctor: m.doctor,
          specialInstructions: m.specialInstructions,
        };
      }),
      limitReached: meds.size === 100,
    };
  });
}
export async function companion(ctx: Context, input: Action<'readCompanion' | 'saveCompanion'>) {
  const circle = circleRef(ctx.db, input.circleId),
    ref = circle.collection('privateCompanions').doc(input.appointmentId);
  if (input.action === 'saveCompanion')
    await ctx.db.runTransaction((tx) =>
      authorize(tx, ctx.db, circle.id, ctx.actor, 'appointment.write'),
    );
  const envelope =
    input.action === 'saveCompanion'
      ? await ctx.vault.seal(
          JSON.stringify({
            questions: input.questions,
            notes: input.notes,
            checklist: input.checklist,
          }),
          ref.path,
        )
      : null;
  return ctx.db.runTransaction(async (tx) => {
    await authorize(
      tx,
      ctx.db,
      circle.id,
      ctx.actor,
      input.action === 'saveCompanion' ? 'appointment.write' : 'appointment.read',
    );
    const appointment = await tx.get(circle.collection('appointments').doc(input.appointmentId));
    if (!appointment.exists) throw new HttpsError('not-found', 'Appointment unavailable.');
    const previous = await tx.get(ref);
    if (input.action === 'readCompanion') {
      const content = previous.exists
        ? JSON.parse(await ctx.vault.open(previous.get('envelope'), ref.path))
        : { questions: '', notes: '', checklist: [] };
      return { ...content, version: previous.exists ? previous.get('version') : 0 };
    }
    if ((previous.exists ? previous.get('version') : 0) !== input.version)
      throw new HttpsError('aborted', 'The appointment preparation changed. Reload before saving.');
    tx.set(ref, {
      envelope,
      version: input.version + 1,
      updatedAt: ctx.now,
      updatedBy: ctx.actor.uid,
    });
    audit(
      tx,
      ctx.db,
      circle.id,
      ctx.actor.uid,
      'appointment.preparation',
      input.appointmentId,
      ctx.now,
    );
    return { saved: true, version: input.version + 1 };
  });
}
export async function wellbeingPreferences(ctx: Context, input: Action<'wellbeingPreferences'>) {
  recent(ctx.actor, ctx.now);
  return ctx.db.runTransaction(async (tx) => {
    await authorize(tx, ctx.db, input.circleId, ctx.actor, 'privacy.manage');
    const circle = circleRef(ctx.db, input.circleId),
      ref = circle.collection('wellbeingSettings').doc('default');
    await versioned(tx, ref, input.version);
    tx.set(ref, {
      enabled: input.enabled,
      localTime: input.localTime,
      followupMinutes: input.followupMinutes,
      version: input.version + 1,
      updatedAt: ctx.now,
    });
    tx.set(ctx.db.collection('wellbeingSchedules').doc(circle.id), {
      circleId: circle.id,
      nextAt: input.enabled ? ctx.now : Number.MAX_SAFE_INTEGER,
    });
    audit(tx, ctx.db, circle.id, ctx.actor.uid, 'wellbeing.preferences', circle.id, ctx.now);
    return { saved: true };
  });
}
export async function checkIn(ctx: Context, input: Action<'checkIn'>) {
  return ctx.db.runTransaction(async (tx) => {
    await authorize(tx, ctx.db, input.circleId, ctx.actor, 'checkin.write');
    const circle = circleRef(ctx.db, input.circleId),
      profile = await tx.get(circle),
      date = Temporal.Instant.fromEpochMilliseconds(ctx.now)
        .toZonedDateTimeISO(profile.get('timeZone'))
        .toPlainDate()
        .toString(),
      ref = circle.collection('wellbeingCheckIns').doc(date);
    const prior = await tx.get(ref),
      help = await tx.get(circle.collection('assistanceRequests').doc(`wellbeing_${date}`)),
      alerts = await tx.get(
        circle.collection('alerts').where('resourceId', '==', `checkin_${date}`).limit(10),
      );
    if (prior.get('requestId') === input.requestId && prior.get('recordedBy') === ctx.actor.uid)
      return { saved: true, date };
    if ((prior.exists ? prior.get('version') : 0) !== input.version)
      throw new HttpsError('aborted', 'Today’s check-in changed. Review the current status.');
    tx.set(ref, {
      state: input.state,
      version: input.version + 1,
      recordedBy: ctx.actor.uid,
      recordedName: ctx.actor.name,
      recordedAt: ctx.now,
      localDate: date,
      requestId: input.requestId,
    });
    if (input.state === 'help' && !help.exists) {
      tx.create(help.ref, {
        circleId: circle.id,
        category: 'Wellbeing check-in — help requested',
        state: 'created',
        priority: 'high',
        version: 1,
        createdBy: ctx.actor.uid,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      });
      enqueue(tx, ctx.db, `wellbeing_${circle.id}_${date}`, {
        circleId: circle.id,
        resourceId: help.id,
        resourceVersion: 1,
        collection: 'assistanceRequests',
        kind: 'assistance',
        dueAt: ctx.now,
      });
    }
    for (const alert of alerts.docs)
      if (alert.get('state') !== 'resolved')
        tx.update(alert.ref, {
          state: 'resolved',
          version: Number(alert.get('version')) + 1,
          resolvedAt: ctx.now,
          resolvedBy: ctx.actor.uid,
          outcome: 'Daily check-in reported; not a verification of physical safety.',
          updatedAt: ctx.now,
        });
    audit(tx, ctx.db, circle.id, ctx.actor.uid, 'wellbeing.reported', date, ctx.now, {
      state: input.state,
    });
    return { saved: true, date };
  });
}
export async function extendWellbeing(ctx: Pick<Context, 'db' | 'now'>) {
  const schedules = await ctx.db
    .collection('wellbeingSchedules')
    .where('nextAt', '<=', ctx.now)
    .orderBy('nextAt')
    .limit(10)
    .get();
  for (const schedule of schedules.docs)
    await ctx.db.runTransaction(async (tx) => {
      const current = await tx.get(schedule.ref);
      if (!current.exists || current.get('nextAt') > ctx.now) return;
      const circle = circleRef(ctx.db, schedule.get('circleId')),
        profile = await tx.get(circle),
        settings = await tx.get(circle.collection('wellbeingSettings').doc('default'));
      if (!profile.exists || !settings.get('enabled')) {
        tx.update(schedule.ref, { nextAt: Number.MAX_SAFE_INTEGER });
        return;
      }
      const zone = profile.get('timeZone'),
        today = Temporal.Instant.fromEpochMilliseconds(ctx.now)
          .toZonedDateTimeISO(zone)
          .toPlainDate();
      let expected = today.toPlainDateTime(settings.get('localTime')).toZonedDateTime(zone);
      if (expected.epochMilliseconds <= ctx.now) expected = expected.add({ days: 1 });
      const date = expected.toPlainDate().toString(),
        ref = circle.collection('wellbeingExpectations').doc(`checkin_${date}`),
        prior = await tx.get(ref);
      if (!prior.exists || prior.get('settingsVersion') !== settings.get('version')) {
        const followupAt =
          expected.epochMilliseconds + Number(settings.get('followupMinutes')) * 60000;
        tx.set(ref, {
          localDate: date,
          expectedAt: expected.epochMilliseconds,
          followupAt,
          settingsVersion: settings.get('version'),
          state: 'awaiting',
        });
        enqueue(tx, ctx.db, `checkin_${circle.id}_${date}_v${settings.get('version')}`, {
          circleId: circle.id,
          resourceId: ref.id,
          collection: 'wellbeingExpectations',
          resourceVersion: settings.get('version'),
          kind: 'checkin',
          dueAt: followupAt,
        });
      }
      tx.update(schedule.ref, { nextAt: expected.add({ days: 1 }).startOfDay().epochMilliseconds });
    });
}
