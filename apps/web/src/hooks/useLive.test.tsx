// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  unsubscribe: vi.fn(),
  next: undefined as undefined | ((value: unknown) => void),
  error: undefined as undefined | (() => void),
}));
vi.mock('../lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => path,
  query: (...args: unknown[]) => args,
  limit: (value: number) => value,
  orderBy: vi.fn(),
  where: vi.fn(),
  onSnapshot: (
    _query: unknown,
    _options: unknown,
    next: (value: unknown) => void,
    error: () => void,
  ) => {
    mocks.next = next;
    mocks.error = error;
    return mocks.unsubscribe;
  },
}));
import { useLive } from './useLive';
describe('live subscription data boundaries', () => {
  it('clears old data and unsubscribes on circle changes, access errors and unmount', () => {
    const { result, rerender, unmount } = renderHook(
      ({ path }) => useLive<{ id: string; name: string }>(path),
      { initialProps: { path: 'careCircles/one/medications' } },
    );
    act(() =>
      mocks.next?.({
        docs: [{ id: 'one', data: () => ({ name: 'Synthetic' }) }],
        metadata: { fromCache: false },
      }),
    );
    expect(result.current.data[0]?.name).toBe('Synthetic');
    rerender({ path: 'careCircles/two/medications' });
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual([]);
    act(() => mocks.error?.());
    expect(result.current.error).toContain('access issue');
    expect(result.current.data).toEqual([]);
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(2);
  });
});
