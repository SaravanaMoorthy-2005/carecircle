import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createTransport } from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { defineSecret, defineString } from 'firebase-functions/params';
import {
  encrypt,
  decrypt,
  openNote,
  sealNote,
  type Envelope,
  type KeyWrapper,
} from './encryption/envelope';
import type { Mailer, NoteVault } from './repositories/context';
if (!getApps().length) initializeApp();
export const db = getFirestore();
export const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
export const hmacSecret = defineSecret('INVITATION_HMAC_SECRET');
export const smtpPassword = defineSecret('SMTP_PASSWORD');
export const notesKey = defineSecret('NOTES_ENCRYPTION_KEY');
export const appUrl = defineString('APP_URL', { default: 'http://localhost:5173' });
const smtpHost = defineString('SMTP_HOST', { default: '' }),
  smtpPort = defineString('SMTP_PORT', { default: '465' }),
  smtpUser = defineString('SMTP_USERNAME', { default: '' }),
  smtpFrom = defineString('SMTP_FROM_ADDRESS', { default: '' }),
  kmsKey = defineString('KMS_KEY_RESOURCE', { default: '' });
let kmsClient: Promise<import('@google-cloud/kms').KeyManagementServiceClient> | undefined;
function getKmsClient() {
  // Optional SDK loading must not delay function discovery or unrelated requests.
  return (kmsClient ??= import('@google-cloud/kms').then(
    ({ KeyManagementServiceClient }) => new KeyManagementServiceClient(),
  ));
}
export function serverHmac() {
  if (isEmulator) return createHash('sha256').update('demo-carecircle-emulator-only').digest('hex');
  return hmacSecret.value();
}
export function mailer(): Mailer {
  if (isEmulator) {
    return {
      async send(mail) {
        const directory = resolve(process.cwd(), '.runtime', 'mail');
        await mkdir(directory, { recursive: true });
        const filename = createHash('sha256').update(mail.messageId).digest('hex');
        await writeFile(resolve(directory, `${filename}.json`), JSON.stringify(mail), {
          mode: 0o600,
        });
      },
    };
  }
  const port = Number(smtpPort.value());
  const transport = createTransport({
    host: smtpHost.value(),
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: smtpUser.value(), pass: smtpPassword.value() },
    connectionTimeout: 10000,
    socketTimeout: 15000,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
  });
  return {
    async send(mail) {
      await transport.sendMail({
        ...mail,
        from: smtpFrom.value(),
        messageId: `<${mail.messageId}@carecircle>`,
      });
    },
  };
}
export function vault(): NoteVault {
  const kmsResource = kmsKey.value();
  if (kmsResource) {
    const wrapper: KeyWrapper = {
      async wrap(key) {
        const client = await getKmsClient();
        const [response] = await client.encrypt({ name: kmsResource, plaintext: key });
        if (!response.ciphertext) throw new Error('KMS returned no ciphertext');
        return {
          keyId: kmsResource,
          wrappedKey: Buffer.from(response.ciphertext).toString('base64'),
        };
      },
      async unwrap(keyId, wrappedKey) {
        if (keyId !== kmsResource) throw new Error('Unknown KMS key');
        const client = await getKmsClient();
        const [response] = await client.decrypt({
          name: keyId,
          ciphertext: Buffer.from(wrappedKey, 'base64'),
        });
        if (!response.plaintext) throw new Error('KMS returned no plaintext');
        return Buffer.from(response.plaintext);
      },
    };
    return {
      seal: (note, context) => sealNote(note, context, wrapper),
      open: (envelope, context) => openNote(envelope as Envelope, context, wrapper),
    };
  }
  const key = isEmulator
    ? createHash('sha256').update('emulator-note-encryption-only').digest()
    : Buffer.from(notesKey.value(), 'base64');
  return {
    async seal(note, context) {
      return encrypt(note, key, 'secret-v1', context);
    },
    async open(envelope, context) {
      return decrypt(envelope, key, context);
    },
  };
}
