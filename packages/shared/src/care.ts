import { Temporal } from '@js-temporal/polyfill';
import type { CareTask, Inventory, Medication } from './schemas';
import { scheduledInstant } from './domain';

export function inventoryBalance(
  balance: number,
  mode: 'set' | 'restock' | 'consume' | 'restore',
  quantity: number,
) {
  if (![balance, quantity].every(Number.isFinite) || quantity < 0)
    throw new RangeError('Invalid stock quantity');
  return (
    Math.round(
      (mode === 'set' ? quantity : balance + (mode === 'consume' ? -quantity : quantity)) * 100,
    ) / 100
  );
}
export function stockForecast(
  stock: Pick<Inventory, 'balance' | 'unitsPerDose' | 'lowDays'>,
  medication: Medication,
  now: number,
) {
  if (medication.status !== 'active' || stock.unitsPerDose <= 0)
    return { days: null, refillAt: null, low: false };
  let remaining = Math.max(0, stock.balance);
  const first = Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO(medication.timeZone)
    .toPlainDate();
  for (let day = 0; day <= 366; day++) {
    const date = first.add({ days: day });
    if (
      date.toString() < medication.startDate ||
      (medication.endDate && date.toString() > medication.endDate) ||
      !medication.weekdays.includes(date.dayOfWeek)
    )
      continue;
    for (const time of [...medication.times].sort()) {
      const at = scheduledInstant(date.toString(), time, medication.timeZone);
      if (at < now) continue;
      if (remaining < stock.unitsPerDose)
        return { days: day, refillAt: at, low: day <= stock.lowDays };
      remaining = inventoryBalance(remaining, 'consume', stock.unitsPerDose);
    }
  }
  return { days: null, refillAt: null, low: false };
}
export function prescriptionDifference(previous: Medication | null, proposed: Medication) {
  if (!previous) return { kind: 'Added', fields: ['New medication'] };
  if (proposed.status === 'archived' && previous.status !== 'archived')
    return { kind: 'Discontinued', fields: ['Status'] };
  const names: Record<keyof Medication, string> = {
    name: 'Medicine',
    strength: 'Strength / formulation',
    instructions: 'Dose instructions',
    times: 'Timing',
    weekdays: 'Frequency',
    startDate: 'Start date',
    endDate: 'End date',
    timeZone: 'Timezone',
    doctor: 'Clinician',
    specialInstructions: 'Additional instructions',
    status: 'Status',
  };
  const fields = (Object.keys(names) as (keyof Medication)[])
    .filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(proposed[key]))
    .map((key) => names[key]);
  return { kind: fields.length ? 'Modified' : 'Unchanged', fields };
}
export function taskTransitionAllowed(from: CareTask['state'], to: CareTask['state']) {
  return (
    {
      pending: ['accepted', 'declined'],
      accepted: ['in_progress', 'completed', 'declined'],
      declined: [],
      in_progress: ['completed', 'declined'],
      completed: [],
    } as Record<CareTask['state'], CareTask['state'][]>
  )[from].includes(to);
}
export const taskStatus = (task: Pick<CareTask, 'state' | 'dueAt'>, now: number) =>
  !['completed', 'declined'].includes(task.state) && task.dueAt < now ? 'overdue' : task.state;
export function handoffSummary(tasks: CareTask[], now: number) {
  const outstanding = tasks.filter((t) => !['completed', 'declined'].includes(t.state));
  return {
    pending: outstanding.length,
    overdue: outstanding.filter((t) => t.dueAt < now).length,
    unassigned: outstanding.filter((t) => !t.assignedTo).length,
    next: [...outstanding].sort((a, b) => a.dueAt - b.dueAt).slice(0, 10),
  };
}
