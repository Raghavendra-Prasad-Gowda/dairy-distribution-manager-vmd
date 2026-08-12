/**
 * DateSelector tests.
 *
 * Covers the compact date label, Prev/Next day navigation (Next disabled at
 * the today+1 ceiling, not on today itself — stock entry is allowed one day
 * ahead), the "Today" shortcut (hidden when already on today), the native
 * date-input fallback (max = tomorrow), and hiding the nav arrows via
 * showNavigation=false.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DateSelector from './DateSelector';

vi.mock('../utils/dateUtils', async () => {
  const actual = await vi.importActual('../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-09', getTomorrow: () => '2026-08-10' };
});

describe('DateSelector — label', () => {
  it('shows a compact weekday/day/month label', () => {
    render(<DateSelector date="2026-08-05" onChange={vi.fn()} />);
    expect(screen.getByText('Wed, 5 Aug')).toBeInTheDocument();
  });
});

describe('DateSelector — navigation', () => {
  it('Prev/Next day buttons step by one calendar day', () => {
    const onChange = vi.fn();
    render(<DateSelector date="2026-08-05" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Previous day'));
    expect(onChange).toHaveBeenCalledWith('2026-08-04');

    fireEvent.click(screen.getByLabelText('Next day'));
    expect(onChange).toHaveBeenCalledWith('2026-08-06');
  });

  it('allows stepping Next day past today, into tomorrow', () => {
    render(<DateSelector date="2026-08-09" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Next day')).not.toBeDisabled();
  });

  it('disables Next day once already on tomorrow, the last allowed date', () => {
    render(<DateSelector date="2026-08-10" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Next day')).toBeDisabled();
  });

  it('hides both nav buttons when showNavigation is false', () => {
    render(<DateSelector date="2026-08-05" onChange={vi.fn()} showNavigation={false} />);
    expect(screen.queryByLabelText('Previous day')).toBeNull();
    expect(screen.queryByLabelText('Next day')).toBeNull();
  });
});

describe('DateSelector — Today shortcut', () => {
  it('shows a "Today" button that jumps to today, hidden once already there', () => {
    const onChange = vi.fn();
    const { rerender } = render(<DateSelector date="2026-08-05" onChange={onChange} />);
    fireEvent.click(screen.getByText('Today'));
    expect(onChange).toHaveBeenCalledWith('2026-08-09');

    rerender(<DateSelector date="2026-08-09" onChange={onChange} />);
    expect(screen.queryByText('Today')).toBeNull();
  });
});

describe('DateSelector — native date input', () => {
  it('the hidden date input reflects the current date and calls onChange when picked', () => {
    const onChange = vi.fn();
    const { container } = render(<DateSelector date="2026-08-05" onChange={onChange} />);
    const input = container.querySelector('input[type="date"]');
    expect(input).toHaveValue('2026-08-05');
    expect(input).toHaveAttribute('max', '2026-08-10'); // today+1

    fireEvent.change(input, { target: { value: '2026-08-07' } });
    expect(onChange).toHaveBeenCalledWith('2026-08-07');
  });
});
