// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CalendarWidget } from './care-ui';
afterEach(cleanup);
describe('Care calendar', () => {
  it('renders Temporal dates safely, exposes selected state and requests the next month’s data', () => {
    const select = vi.fn();
    render(
      <CalendarWidget
        selected="2026-11-15"
        onSelect={select}
        timeZone="UTC"
        appointments={[]}
        medications={[]}
      />,
    );
    expect(screen.getByRole('button', { name: /Sunday, November 15, 2026/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(select).toHaveBeenLastCalledWith('2026-12-01');
    expect(screen.getByRole('heading', { name: 'December 2026' })).toBeVisible();
  });
});
