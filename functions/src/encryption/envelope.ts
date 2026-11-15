import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
const envelopeSchema = z
  .object({
    version: z.literal(1),
    algorithm: z.literal('AES-256-GCM'),
    keyId: z.string().min(1),
    iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
    tag: z.string(),
    ciphertext: z.string(),
    wrappedKey: z.string().optional(),
  })
  .strict();
export type Envelope = z.infer<typeof envelopeSchema>;
export function encrypt(plaintext: string, key: Buffer, keyId: string, context: string): Envelope {
  if (key.length !== 32) throw new Error('AES-256 requires a 32-byte key');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    version: 1,
    algorithm: 'AES-256-GCM',
    keyId,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}
export function decrypt(input: unknown, key: Buffer, context: string): string {
  const envelope = envelopeSchema.parse(input);
  if (key.length !== 32) throw new Error('Invalid key');
  const tag = Buffer.from(envelope.tag, 'base64');
  if (tag.length !== 16) throw new Error('Invalid authentication tag');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
export interface KeyWrapper {
  wrap(key: Buffer): Promise<{ keyId: string; wrappedKey: string }>;
  unwrap(keyId: string, wrappedKey: string): Promise<Buffer>;
}
export async function sealNote(
  note: string,
  context: string,
  wrapper: KeyWrapper,
): Promise<Envelope> {
  const key = randomBytes(32);
  try {
    const wrapped = await wrapper.wrap(key);
    return { ...encrypt(note, key, wrapped.keyId, context), wrappedKey: wrapped.wrappedKey };
  } finally {
    key.fill(0);
  }
}
export async function openNote(
  envelope: Envelope,
  context: string,
  wrapper: KeyWrapper,
): Promise<string> {
  if (!envelope.wrappedKey) throw new Error('Missing wrapped key');
  const key = await wrapper.unwrap(envelope.keyId, envelope.wrappedKey);
  try {
    return decrypt(envelope, key, context);
  } finally {
    key.fill(0);
  }
}
