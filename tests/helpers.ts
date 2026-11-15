import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { randomUUID, createHash } from 'node:crypto';
import { dispatch } from '../functions/src/callables/service';
import { encrypt, decrypt } from '../functions/src/encryption/envelope';
import type { Actor, Context, Mail } from '../functions/src/repositories/context';
import { type Medication, type Profile } from '@carecircle/shared';
export function emulatorAdmin(projectId = 'demo-carecircle-integration') {
  if (!projectId.startsWith('demo-')) throw new Error('Tests require a demo project');
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error(
      'Start Firebase emulators before running integration tests. Production access is forbidden.',
    );
  const app =
    getApps().find((app) => app.name === projectId) || initializeApp({ projectId }, projectId);
  return { db: getFirestore(app), auth: getAuth(app) };
}
export const clock = Date.parse('2026-11-15T10:00:00Z');
export const profile: Profile = {
  displayName: 'Alex Morgan (synthetic)',
  timeZone: 'UTC',
  language: 'en',
  emergencyContact: 'Fictional contact',
  largeText: false,
  highContrast: false,
  consent: true,
};
export const medication: Medication = {
  name: 'Synthetic medication',
  strength: 'Test formulation',
  instructions: 'Test instruction only',
  times: ['11:00', '20:00'],
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  startDate: '2026-11-15',
  endDate: null,
  timeZone: 'UTC',
  doctor: 'Test clinician',
  specialInstructions: 'Synthetic test fixture',
  status: 'active',
};
export function actor(email = 'owner@example.test'): Actor {
  return { uid: randomUUID(), email, name: 'Synthetic care member', authTime: clock / 1000 };
}
export function context(who = actor(), projectId = 'demo-carecircle-integration') {
  const { db } = emulatorAdmin(projectId),
    mail: Mail[] = [];
  const key = createHash('sha256').update('test-only-key').digest();
  const ctx: Context = {
    db,
    actor: who,
    now: clock,
    hmacSecret: 'test-secret-'.repeat(6),
    mailer: {
      async send(message) {
        mail.push(message);
      },
    },
    appUrl: 'http://localhost:5173',
    vault: {
      async seal(note, aad) {
        return encrypt(note, key, 'test', aad);
      },
      async open(envelope, aad) {
        return decrypt(envelope, key, aad);
      },
    },
  };
  return { ctx, mail };
}
export async function makeCircle(ctx: Context) {
  return String(
    (await dispatch(ctx, { action: 'createCircle', profile, requestId: randomUUID() })).circleId,
  );
}
export async function inviteMember(
  ctx: Context,
  circleId: string,
  who: Actor,
  permissions: string[] = [
    'medication.read',
    'medication.confirm',
    'appointment.read',
    'alert.read',
    'alert.acknowledge',
    'assistance.respond',
  ],
  role: 'caregiver' | 'family' = 'caregiver',
) {
  let captured: Mail | undefined;
  const invitation = await dispatch(
    {
      ...ctx,
      mailer: {
        async send(mail) {
          captured = mail;
        },
      },
    },
    {
      action: 'invite',
      circleId,
      invitation: { email: who.email, role, permissions },
    },
  );
  const code = captured?.text.match(/single-use code: (\d{8})/)?.[1];
  if (!code) throw new Error('Invitation email was not captured');
  return { id: String(invitation.id), code };
}
