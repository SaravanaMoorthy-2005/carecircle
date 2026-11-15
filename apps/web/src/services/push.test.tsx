import { describe, expect, it, vi } from 'vitest';
import { requirePushPermission } from './push';
describe('optional push permission boundary', () => {
  it('never asks permission in unsupported browsers', async () => {
    const prompt = vi.fn();
    await expect(requirePushPermission(async () => false, prompt)).rejects.toThrow(
      'does not support',
    );
    expect(prompt).not.toHaveBeenCalled();
  });
  it.each(['denied', 'default'] as const)(
    'returns an actionable error for %s without claiming success',
    async (permission) => {
      await expect(
        requirePushPermission(
          async () => true,
          async () => permission,
        ),
      ).rejects.toThrow('not allowed');
    },
  );
  it('continues only after an explicit grant', async () => {
    await expect(
      requirePushPermission(
        async () => true,
        async () => 'granted',
      ),
    ).resolves.toBeUndefined();
  });
});
