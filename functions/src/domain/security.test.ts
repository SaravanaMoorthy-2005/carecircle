import { describe, expect, it } from 'vitest';
import {
  invitationCode,
  invitationUsable,
  permanentMailFailure,
  safeErrorCode,
  verifier,
  verifyCode,
} from './security';
describe('invitation verification', () => {
  const secret = 'a'.repeat(64),
    code = '01234567',
    id = 'invitation-1';
  it('generates fixed-width numeric codes', () => {
    for (let i = 0; i < 100; i++) expect(invitationCode()).toMatch(/^\d{8}$/);
  });
  it('binds a constant-time HMAC verifier to invitation identity', () => {
    const hash = verifier(secret, id, code);
    expect(hash).not.toContain(code);
    expect(verifyCode(secret, id, code, hash)).toBe(true);
    expect(verifyCode(secret, 'other', code, hash)).toBe(false);
    expect(verifyCode(secret, id, '01234568', hash)).toBe(false);
    expect(verifyCode('b'.repeat(64), id, code, hash)).toBe(false);
  });
  it('rejects malformed digests, codes and weak server secrets', () => {
    expect(verifyCode(secret, id, code, 'bad')).toBe(false);
    expect(verifyCode(secret, id, 'short', verifier(secret, id, code))).toBe(false);
    expect(() => verifier('weak', id, code)).toThrow();
  });
  it.each([
    { state: 'consumed' },
    { state: 'revoked' },
    { state: 'locked' },
    { expiresAt: 100 },
    { attemptsRemaining: 0 },
    { email: 'wrong@example.test' },
  ])('rejects unavailable invitations %j', (change) =>
    expect(
      invitationUsable(
        {
          state: 'pending',
          expiresAt: 101,
          attemptsRemaining: 5,
          email: 'member@example.test',
          ...change,
        },
        'member@example.test',
        100,
      ),
    ).toBe(false),
  );
  it('matches normalized verified email while still valid', () =>
    expect(
      invitationUsable(
        { state: 'pending', expiresAt: 101, attemptsRemaining: 1, email: 'member@example.test' },
        'MEMBER@example.test',
        100,
      ),
    ).toBe(true));
  it('sanitizes errors and distinguishes permanent SMTP failures', () => {
    expect(safeErrorCode({ code: 'ETIMEDOUT' })).toBe('ETIMEDOUT');
    expect(safeErrorCode({ code: '<password>' })).toBe('password');
    expect(safeErrorCode(null)).toBe('transport-failure');
    expect(permanentMailFailure({ responseCode: 550 })).toBe(true);
    expect(permanentMailFailure({ responseCode: 450 })).toBe(false);
    expect(permanentMailFailure(new Error())).toBe(false);
  });
});
