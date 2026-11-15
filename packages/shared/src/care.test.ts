import { describe, expect, it } from 'vitest';
import {
  allowed,
  handoffSummary,
  inventoryBalance,
  prescriptionDifference,
  roleCapabilities,
  stockForecast,
  taskStatus,
  taskTransitionAllowed,
  type CareTask,
  type Medication,
} from './index';
const med: Medication = {
  name: 'Synthetic medicine',
  strength: 'Test strength',
  instructions: 'Clinician instruction',
  times: ['09:00'],
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  startDate: '2026-11-01',
  endDate: null,
  timeZone: 'UTC',
  doctor: '',
  specialInstructions: '',
  status: 'active',
};
const now = Date.parse('2026-11-15T08:00:00Z');
describe('role capability ceilings', () => {
  it('rejects clinical edits even when a family document contains an excessive grant', () => {
    expect(
      allowed(
        { role: 'family', status: 'active', permissions: ['medication.write', 'privacy.manage'] },
        'medication.write',
      ),
    ).toBe(false);
    expect(
      allowed(
        { role: 'caregiver', status: 'active', permissions: ['members.manage'] },
        'members.manage',
      ),
    ).toBe(false);
    expect(allowed({ role: 'owner', status: 'active', permissions: [] }, 'inventory.write')).toBe(
      true,
    );
    expect(
      allowed(
        { role: 'owner', status: 'revoked', permissions: [...roleCapabilities.owner] },
        'inventory.write',
      ),
    ).toBe(false);
  });
});
describe('inventory estimates', () => {
  it('supports stock count corrections, restocking, consumption and reversal without floating drift', () => {
    expect(inventoryBalance(2, 'set', 5)).toBe(5);
    expect(inventoryBalance(2, 'restock', 3)).toBe(5);
    expect(inventoryBalance(0.3, 'consume', 0.1)).toBe(0.2);
    expect(inventoryBalance(0.2, 'restore', 0.1)).toBe(0.3);
    expect(inventoryBalance(0, 'consume', 1)).toBe(-1);
    expect(() => inventoryBalance(1, 'set', NaN)).toThrow();
  });
  it('forecasts actual scheduled dates, excludes paused medication and handles missing long-term forecasts', () => {
    expect(stockForecast({ balance: 2, unitsPerDose: 1, lowDays: 7 }, med, now)).toEqual({
      days: 2,
      refillAt: Date.parse('2026-11-17T09:00:00Z'),
      low: true,
    });
    expect(stockForecast({ balance: 0, unitsPerDose: 1, lowDays: 7 }, med, now).days).toBe(0);
    expect(
      stockForecast({ balance: 1, unitsPerDose: 1, lowDays: 1 }, { ...med, weekdays: [1] }, now)
        .days,
    ).toBe(8);
    expect(
      stockForecast({ balance: 1, unitsPerDose: 1, lowDays: 7 }, { ...med, status: 'paused' }, now)
        .refillAt,
    ).toBeNull();
    expect(stockForecast({ balance: 1000, unitsPerDose: 1, lowDays: 7 }, med, now).days).toBeNull();
  });
});
describe('prescription comparisons', () => {
  it('labels added, modified, discontinued and unchanged items with specific differences', () => {
    expect(prescriptionDifference(null, med).kind).toBe('Added');
    expect(prescriptionDifference(med, med).kind).toBe('Unchanged');
    expect(
      prescriptionDifference(med, {
        ...med,
        times: ['12:00'],
        instructions: 'Updated instruction',
      }),
    ).toEqual({ kind: 'Modified', fields: ['Dose instructions', 'Timing'] });
    expect(prescriptionDifference(med, { ...med, status: 'archived' }).kind).toBe('Discontinued');
  });
});
describe('shared responsibility lifecycle', () => {
  it('requires acknowledgement and preserves completed history', () => {
    expect(taskTransitionAllowed('pending', 'completed')).toBe(false);
    expect(taskTransitionAllowed('pending', 'accepted')).toBe(true);
    expect(taskTransitionAllowed('accepted', 'in_progress')).toBe(true);
    expect(taskTransitionAllowed('in_progress', 'completed')).toBe(true);
    expect(taskTransitionAllowed('completed', 'accepted')).toBe(false);
    expect(taskStatus({ state: 'pending', dueAt: now - 1 }, now)).toBe('overdue');
    expect(taskStatus({ state: 'completed', dueAt: now - 1 }, now)).toBe('completed');
    const tasks = [
      { id: '1', state: 'pending', dueAt: now - 1, assignedTo: null },
      { id: '2', state: 'completed', dueAt: now - 2 },
      { id: '3', state: 'accepted', dueAt: now + 1, assignedTo: 'someone' },
    ] as CareTask[];
    expect(handoffSummary(tasks, now)).toMatchObject({ pending: 2, overdue: 1, unassigned: 1 });
  });
});
