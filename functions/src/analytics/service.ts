import { Temporal } from '@js-temporal/polyfill';
import { authorize, circleRef, type Context } from '../repositories/context';
export async function insights(ctx: Context, circleId: string) {
  const member = await ctx.db.runTransaction((tx) =>
    authorize(tx, ctx.db, circleId, ctx.actor, 'adherence.read'),
  );
  const circle = await circleRef(ctx.db, circleId).get();
  const zone = String(circle.get('timeZone'));
  const collection = circle.ref.collection('doseOccurrences');
  async function period(from: number, to: number) {
    const base = collection.where('scheduledAt', '>=', from).where('scheduledAt', '<=', to);
    const [eligible, taken, skipped, unconfirmed] = await Promise.all([
      base
        .where('state', 'in', ['scheduled', 'due', 'unconfirmed', 'taken', 'skipped'])
        .count()
        .get(),
      base.where('state', '==', 'taken').count().get(),
      base.where('state', '==', 'skipped').count().get(),
      base
        .where('state', 'in', ['scheduled', 'due', 'unconfirmed'])
        .where('unconfirmedAt', '<=', ctx.now)
        .count()
        .get(),
    ]);
    const total = eligible.data().count,
      confirmed = taken.data().count;
    return {
      eligible: total,
      taken: confirmed,
      skipped: skipped.data().count,
      unconfirmed: unconfirmed.data().count,
      rate: total ? Math.round((confirmed / total) * 100) : null,
    };
  }
  const today = Temporal.Instant.fromEpochMilliseconds(ctx.now)
    .toZonedDateTimeISO(zone)
    .startOfDay();
  const [week, month, ...days] = await Promise.all([
    period(ctx.now - 7 * 86400000, ctx.now),
    period(ctx.now - 30 * 86400000, ctx.now),
    ...Array.from({ length: 7 }, (_, i) => {
      const day = today.subtract({ days: 6 - i });
      return period(
        day.epochMilliseconds,
        Math.min(ctx.now, day.add({ days: 1 }).epochMilliseconds - 1),
      ).then((values) => ({ date: day.toPlainDate().toString(), ...values }));
    }),
  ]);
  const [unresolved, responses, upcoming] = await Promise.all([
    member.permissions.includes('alert.read')
      ? circle.ref
          .collection('alerts')
          .where('state', 'in', ['created', 'sent', 'acknowledged'])
          .count()
          .get()
          .then((s) => s.data().count)
      : null,
    member.permissions.includes('alert.read')
      ? circle.ref
          .collection('alerts')
          .orderBy('acknowledgedAt', 'desc')
          .limit(100)
          .get()
          .then((s) =>
            s.docs.map((d) =>
              Math.max(0, Number(d.get('acknowledgedAt')) - Number(d.get('createdAt'))),
            ),
          )
      : [],
    member.permissions.includes('appointment.read')
      ? circle.ref
          .collection('appointments')
          .where('status', '==', 'scheduled')
          .where('scheduledAt', '>=', ctx.now)
          .count()
          .get()
          .then((s) => s.data().count)
      : null,
  ]);
  // Recheck after the bounded aggregate reads so revoked access is not returned.
  await ctx.db.runTransaction((tx) => authorize(tx, ctx.db, circleId, ctx.actor, 'adherence.read'));
  return {
    week,
    month,
    days,
    asOf: ctx.now,
    unresolved,
    upcoming,
    responseSample: responses.length,
    averageResponseMinutes: responses.length
      ? Math.round(responses.reduce((sum, value) => sum + value, 0) / responses.length / 60000)
      : null,
  };
}
