import { describe, it, expect } from 'vitest';
import {
  adherence,
  alertTransition,
  allowed,
  canConfirm,
  doseState,
  occurrences,
  reminderTimes,
  retryAt,
  scheduledInstant,
} from './domain';
import {
  appointmentSchema,
  commandSchema,
  medicationSchema,
  preferencesSchema,
  profileSchema,
  type Medication,
} from './schemas';
const medication: Medication = {
  name: 'Synthetic prescription',
  strength: 'Test formulation',
  instructions: 'Synthetic clinician instruction',
  times: ['08:00', '20:00'],
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  startDate: '2024-01-01',
  endDate: null,
  timeZone: 'Asia/Kolkata',
  doctor: '',
  specialInstructions: '',
  status: 'active',
};
describe('validated schedules', () => {
  it('accepts a complete prescribed schedule', () =>
    expect(medicationSchema.parse(medication)).toEqual(medication));
  it.each([
    { times: ['25:00'] },
    { times: ['08:00', '08:00'] },
    { times: [] },
    { weekdays: [] },
    { weekdays: [8] },
    { timeZone: 'Invalid/Zone' },
    { endDate: '2023-01-01' },
    { startDate: '2024-02-30' },
    { name: '' },
    { unexpected: 'field' },
  ])('rejects malformed medication %j', (change) =>
    expect(medicationSchema.safeParse({ ...medication, ...change }).success).toBe(false),
  );
  it('rejects path traversal identifiers and privilege smuggling', () => {
    expect(
      commandSchema.safeParse({
        action: 'help',
        circleId: '../another',
        requestId: 'valid',
        category: 'Contact caregiver',
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        action: 'redeem',
        invitationId: 'valid',
        code: '12345678',
        permissions: ['members.manage'],
      }).success,
    ).toBe(false);
  });
  it('requires profile consent', () =>
    expect(
      profileSchema.safeParse({ displayName: 'Test', timeZone: 'UTC', consent: false }).success,
    ).toBe(false));
  it('rejects unsafe appointment URLs', () =>
    expect(
      appointmentSchema.safeParse({
        clinician: 'Test',
        localDate: '2026-11-15',
        localTime: '10:00',
        timeZone: 'UTC',
        location: 'Test clinic',
        teleconsultationUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false));
  it('requires escalation after gentle follow-up', () =>
    expect(
      preferencesSchema.safeParse({
        email: true,
        push: false,
        upcomingMinutes: 15,
        unconfirmedMinutes: 60,
        escalationMinutes: 30,
      }).success,
    ).toBe(false));
});
describe('deterministic occurrence engine', () => {
  it('crosses leap-day and month boundaries without duplicates', () => {
    const doses = occurrences(medication, 'm1', 'c1', 1, Date.parse('2024-02-28T00:00:00Z'), 4);
    expect(doses).toHaveLength(8);
    expect(doses.map((d) => d.localDate)).toContain('2024-02-29');
    expect(doses.at(-1)?.localDate).toBe('2024-03-02');
    expect(new Set(doses.map((d) => d.id)).size).toBe(8);
    expect(doses).toEqual(
      occurrences(medication, 'm1', 'c1', 1, Date.parse('2024-02-28T00:00:00Z'), 4),
    );
  });
  it('honors weekday filters, start and end dates', () => {
    const doses = occurrences(
      { ...medication, weekdays: [1], startDate: '2024-03-04', endDate: '2024-03-04' },
      'm',
      'c',
      1,
      Date.parse('2024-03-01T00:00:00Z'),
    );
    expect(doses).toHaveLength(2);
    expect(doses.every((d) => d.localDate === '2024-03-04')).toBe(true);
  });
  it('returns no occurrences while paused or archived', () => {
    for (const status of ['paused', 'archived'] as const)
      expect(occurrences({ ...medication, status }, 'm', 'c', 1, 0)).toEqual([]);
  });
  it('rejects unbounded horizons', () => {
    expect(() => occurrences(medication, 'm', 'c', 1, 0, 15)).toThrow();
    expect(() => occurrences(medication, 'm', 'c', 1, 0, 0)).toThrow();
  });
  it('shifts nonexistent spring time forward', () =>
    expect(
      new Date(scheduledInstant('2024-03-10', '02:30', 'America/New_York')).toISOString(),
    ).toBe('2024-03-10T07:30:00.000Z'));
  it('chooses earlier repeated autumn time', () =>
    expect(
      new Date(scheduledInstant('2024-11-03', '01:30', 'America/New_York')).toISOString(),
    ).toBe('2024-11-03T05:30:00.000Z'));
  it('converts fractional-offset time zones', () =>
    expect(new Date(scheduledInstant('2026-11-15', '08:00', 'Asia/Kolkata')).toISOString()).toBe(
      '2026-11-15T02:30:00.000Z',
    ));
  it('versions deterministic IDs on schedule changes', () => {
    const now = Date.parse('2024-02-28T00:00:00Z');
    expect(occurrences(medication, 'm', 'c', 1, now)[0]?.id).not.toBe(
      occurrences(medication, 'm', 'c', 2, now)[0]?.id,
    );
  });
});
describe('care state and calculations', () => {
  const now = 1_000_000;
  it('distinguishes future, due and unconfirmed', () => {
    expect(
      doseState({ state: 'scheduled', scheduledAt: 0, unconfirmedAfterMinutes: 60 }, 1800000),
    ).toBe('due');
    expect(doseState({ state: 'scheduled', scheduledAt: now + 1 }, now)).toBe('scheduled');
    expect(doseState({ state: 'scheduled', scheduledAt: now }, now)).toBe('due');
    expect(doseState({ state: 'scheduled', scheduledAt: now - 1800000 }, now)).toBe('unconfirmed');
  });
  it.each(['taken', 'skipped', 'cancelled'] as const)('preserves terminal state %s', (state) => {
    expect(doseState({ state, scheduledAt: 0 }, now)).toBe(state);
    expect(canConfirm({ state, scheduledAt: 0 }, now)).toBe(false);
  });
  it('allows only recent nonfuture unconfirmed doses', () => {
    expect(canConfirm({ state: 'scheduled', scheduledAt: now }, now)).toBe(true);
    expect(canConfirm({ state: 'scheduled', scheduledAt: now + 1 }, now)).toBe(false);
    expect(canConfirm({ state: 'scheduled', scheduledAt: now - 8 * 86400000 }, now)).toBe(false);
  });
  it('excludes future and cancelled doses from adherence', () => {
    expect(
      adherence(
        [
          { state: 'taken', scheduledAt: 0 },
          { state: 'skipped', scheduledAt: 0 },
          { state: 'scheduled', scheduledAt: 0 },
          { state: 'taken', scheduledAt: 4_000_000 },
          { state: 'cancelled', scheduledAt: 0 },
        ],
        0,
        2_000_000,
      ),
    ).toEqual({ eligible: 3, taken: 1, skipped: 1, unconfirmed: 1, rate: 33 });
    expect(adherence([], 0, now).rate).toBeNull();
  });
  it('denies missing, revoked, and insufficient memberships', () => {
    expect(allowed(undefined, 'medication.write')).toBe(false);
    expect(
      allowed(
        { role: 'caregiver', status: 'revoked', permissions: ['medication.write'] },
        'medication.write',
      ),
    ).toBe(false);
    expect(
      allowed({ role: 'caregiver', status: 'active', permissions: [] }, 'medication.write'),
    ).toBe(false);
    expect(
      allowed(
        { role: 'caregiver', status: 'active', permissions: ['medication.write'] },
        'medication.write',
      ),
    ).toBe(true);
  });
  it('requires acknowledgement before documented resolution', () => {
    expect(alertTransition('created', 'resolved', 'Contacted caregiver')).toBe(false);
    expect(alertTransition('created', 'acknowledged', '')).toBe(true);
    expect(alertTransition('sent', 'acknowledged', '')).toBe(true);
    expect(alertTransition('acknowledged', 'resolved', '')).toBe(false);
    expect(alertTransition('acknowledged', 'resolved', 'Contacted caregiver')).toBe(true);
    expect(alertTransition('resolved', 'acknowledged', '')).toBe(false);
  });
  it('deduplicates appointment reminders', () =>
    expect(reminderTimes(100000000, [60, 1440, 60])).toEqual([13600000, 96400000]));
  it('uses bounded exponential retry backoff', () => {
    expect(retryAt(1, 0)).toBe(30000);
    expect(retryAt(2, 0)).toBe(60000);
    expect(retryAt(10, 0)).toBe(3600000);
    expect(retryAt(0, 0)).toBe(30000);
  });
});
