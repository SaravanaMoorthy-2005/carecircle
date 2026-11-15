import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, openNote, sealNote, type KeyWrapper } from './envelope';
describe('authenticated encryption', () => {
  const key = Buffer.alloc(32, 7),
    context = 'careCircles/circle/private/notes';
  it('round-trips Unicode with versioned randomized envelopes', () => {
    const first = encrypt('Private note: தமிழ்', key, 'v1', context),
      second = encrypt('Private note: தமிழ்', key, 'v1', context);
    expect(decrypt(first, key, context)).toBe('Private note: தமிழ்');
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toContain('Private');
  });
  it('rejects cross-circle ciphertext substitution and wrong keys', () => {
    const envelope = encrypt('note', key, 'v1', context);
    expect(() => decrypt(envelope, key, 'other')).toThrow();
    expect(() => decrypt(envelope, randomBytes(32), context)).toThrow();
  });
  it('detects modified ciphertext, tag and malformed envelopes', () => {
    const envelope = encrypt('note', key, 'v1', context);
    expect(() =>
      decrypt(
        { ...envelope, ciphertext: Buffer.from('tampered').toString('base64') },
        key,
        context,
      ),
    ).toThrow();
    expect(() =>
      decrypt({ ...envelope, tag: Buffer.alloc(16).toString('base64') }, key, context),
    ).toThrow();
    expect(() => decrypt({ ...envelope, tag: 'x' }, key, context)).toThrow();
    expect(() => decrypt({ ...envelope, version: 2 }, key, context)).toThrow();
  });
  it('rejects incorrect key sizes', () => {
    expect(() => encrypt('note', Buffer.alloc(16), 'v1', context)).toThrow();
    expect(() => decrypt(encrypt('note', key, 'v1', context), Buffer.alloc(16), context)).toThrow();
  });
  it('round-trips envelope keys through a wrapper boundary', async () => {
    const wrappingKey = randomBytes(32);
    const wrapper: KeyWrapper = {
      async wrap(dek) {
        return {
          keyId: 'test-kms-key',
          wrappedKey: JSON.stringify(
            encrypt(dek.toString('base64'), wrappingKey, 'wrapper', 'key'),
          ),
        };
      },
      async unwrap(_id, wrapped) {
        return Buffer.from(decrypt(JSON.parse(wrapped), wrappingKey, 'key'), 'base64');
      },
    };
    const envelope = await sealNote('sensitive note', context, wrapper);
    expect(envelope.wrappedKey).toBeDefined();
    expect(await openNote(envelope, context, wrapper)).toBe('sensitive note');
    await expect(
      openNote({ ...envelope, wrappedKey: undefined }, context, wrapper),
    ).rejects.toThrow();
  });
});
