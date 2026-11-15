import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
export function invitationCode(): string {
  return randomInt(0, 100_000_000).toString().padStart(8, '0');
}
export function verifier(secret: string, invitationId: string, code: string): string {
  if (secret.length < 32) throw new Error('Invitation secret must contain at least 32 characters');
  return createHmac('sha256', secret).update(`${invitationId}:${code}`).digest('hex');
}
export function verifyCode(
  secret: string,
  invitationId: string,
  code: string,
  expected: string,
): boolean {
  if (!/^[0-9a-f]{64}$/.test(expected) || !/^\d{8}$/.test(code)) return false;
  return timingSafeEqual(
    Buffer.from(verifier(secret, invitationId, code), 'hex'),
    Buffer.from(expected, 'hex'),
  );
}
export function invitationUsable(
  invite: { state: string; expiresAt: number; attemptsRemaining: number; email: string },
  email: string,
  now: number,
): boolean {
  return (
    invite.state === 'pending' &&
    invite.expiresAt > now &&
    invite.attemptsRemaining > 0 &&
    invite.email === email.toLowerCase()
  );
}
export function safeErrorCode(error: unknown): string {
  if (typeof error === 'object' && error && 'code' in error && typeof error.code === 'string')
    return error.code.replace(/[^a-zA-Z0-9/_-]/g, '').slice(0, 80);
  return 'transport-failure';
}
export function permanentMailFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'responseCode' in error &&
    typeof error.responseCode === 'number' &&
    error.responseCode >= 500 &&
    error.responseCode < 600
  );
}
