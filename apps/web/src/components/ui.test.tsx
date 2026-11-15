// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Button, Field, Modal } from './ui';
afterEach(cleanup);
describe('accessible UI primitives', () => {
  it('keeps textarea labels stable when content changes and associates validation errors', () => {
    const { rerender } = render(
      <Field label="Private note">
        <textarea value="" readOnly />
      </Field>,
    );
    rerender(
      <Field label="Private note" error="Check this value">
        <textarea value="Changed content" readOnly />
      </Field>,
    );
    expect(screen.getByLabelText('Private note', { exact: true })).toHaveValue('Changed content');
    expect(screen.getByLabelText('Private note', { exact: true })).toHaveAccessibleDescription(
      'Private note: Check this value',
    );
  });
  it('disables submission while pending', () => {
    render(<Button disabled>Saving confirmation…</Button>);
    expect(screen.getByRole('button', { name: 'Saving confirmation…' })).toBeDisabled();
  });
  it('provides dialog semantics, accessible naming and keyboard close', async () => {
    let closed = false;
    render(
      <Modal
        open
        onClose={() => {
          closed = true;
        }}
        title="Confirm this dose"
        description="Your action will be recorded."
      >
        <Button>Confirm taken</Button>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Confirm this dose' })).toHaveAccessibleDescription(
      'Your action will be recorded.',
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(closed).toBe(true));
  });
});
