import { Temporal } from '@js-temporal/polyfill';
import type { Dose, DoseState, Medication, Permission, Member } from './schemas';
import { roleAllows } from './schemas';

export function allowed(
  member: Pick<Member, 'status' | 'permissions' | 'role'> | undefined,
  permission: Permission,
): boolean {
  return (
    member?.status === 'active' &&
    roleAllows(member.role, permission) &&
    (member.role === 'owner' || member.permissions.includes(permission))
  );
}
export function scheduledInstant(localDate: string, localTime: string, timeZone: string): number {
  // Temporal compatible: earlier instant on fall-back; shift forward through spring gaps.
  return Temporal.PlainDateTime.from(`${localDate}T${localTime}`).toZonedDateTime(timeZone, {
    disambiguation: 'compatible',
  }).epochMilliseconds;
}
export function occurrences(
  medication: Medication,
  medicationId: string,
  circleId: string,
  version: number,
  now: number,
  days = 7,
): Dose[] {
  if (days < 1 || days > 14) throw new RangeError('Horizon must be 1–14 days');
  if (medication.status !== 'active') return [];
  const first = Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO(medication.timeZone)
    .toPlainDate();
  const result: Dose[] = [];
  for (let offset = 0; offset < days; offset++) {
    const day = first.add({ days: offset });
    const localDate = day.toString();
    if (
      localDate < medication.startDate ||
      (medication.endDate && localDate > medication.endDate) ||
      !medication.weekdays.includes(day.dayOfWeek)
    )
      continue;
    for (const localTime of medication.times) {
      const scheduledAt = scheduledInstant(localDate, localTime, medication.timeZone);
      result.push({
        id: `${medicationId}_${localDate}_${localTime.replace(':', '')}_v${version}`,
        medicationId,
        circleId,
        scheduledAt,
        localDate,
        localTime,
        timeZone: medication.timeZone,
        name: medication.name,
        instructions: medication.instructions,
        state: 'scheduled',
        version: 1,
        scheduleVersion: version,
      });
    }
  }
  return result.sort((a, b) => a.scheduledAt - b.scheduledAt);
}
export function doseState(
  dose: Pick<Dose, 'state' | 'scheduledAt' | 'unconfirmedAfterMinutes'>,
  now: number,
  unconfirmedMinutes = dose.unconfirmedAfterMinutes ?? 30,
): DoseState {
  if (['taken', 'skipped', 'cancelled'].includes(dose.state)) return dose.state;
  if (now >= dose.scheduledAt + unconfirmedMinutes * 60000) return 'unconfirmed';
  return now >= dose.scheduledAt ? 'due' : 'scheduled';
}
export function canConfirm(dose: Pick<Dose, 'state' | 'scheduledAt'>, now: number): boolean {
  return (
    !['taken', 'skipped', 'cancelled'].includes(dose.state) &&
    dose.scheduledAt <= now &&
    dose.scheduledAt >= now - 7 * 86400000
  );
}
export function adherence(doses: Pick<Dose, 'state' | 'scheduledAt'>[], from: number, now: number) {
  const eligible = doses.filter(
    (d) => d.scheduledAt >= from && d.scheduledAt <= now && d.state !== 'cancelled',
  );
  const taken = eligible.filter((d) => d.state === 'taken').length;
  return {
    eligible: eligible.length,
    taken,
    skipped: eligible.filter((d) => d.state === 'skipped').length,
    unconfirmed: eligible.filter((d) => doseState(d, now) === 'unconfirmed').length,
    rate: eligible.length ? Math.round((taken / eligible.length) * 100) : null,
  };
}
export function alertTransition(
  current: string,
  next: 'acknowledged' | 'resolved',
  outcome: string,
): boolean {
  return next === 'acknowledged'
    ? ['created', 'sent'].includes(current)
    : current === 'acknowledged' && outcome.trim().length >= 5;
}
export function retryAt(attempt: number, now: number): number {
  return now + Math.min(60 * 60000, 30_000 * 2 ** Math.max(0, attempt - 1));
}
export function reminderTimes(at: number, minutes: number[]): number[] {
  return [...new Set(minutes)].map((m) => at - m * 60000).sort((a, b) => a - b);
}
