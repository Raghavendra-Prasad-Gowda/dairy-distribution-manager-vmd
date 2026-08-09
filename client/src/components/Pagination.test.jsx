/**
 * Pagination tests.
 *
 * Covers the "showing X-Y of Z" summary, Prev/Next disabled states at the
 * boundaries, the click handlers' clamped page math, and the total:0
 * short-circuit (renders nothing).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Pagination from './Pagination';

describe('Pagination', () => {
  it('renders nothing when total is 0', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} startIndex={0} endIndex={0} total={0} onPageChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the "showing X-Y of Z" summary', () => {
    render(<Pagination currentPage={2} totalPages={3} startIndex={10} endIndex={20} total={25} onPageChange={vi.fn()} />);
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('disables Prev on the first page and Next on the last page', () => {
    const { rerender } = render(<Pagination currentPage={1} totalPages={3} startIndex={0} endIndex={10} total={25} onPageChange={vi.fn()} />);
    expect(screen.getByText('Prev').closest('button')).toBeDisabled();
    expect(screen.getByText('Next').closest('button')).not.toBeDisabled();

    rerender(<Pagination currentPage={3} totalPages={3} startIndex={20} endIndex={25} total={25} onPageChange={vi.fn()} />);
    expect(screen.getByText('Prev').closest('button')).not.toBeDisabled();
    expect(screen.getByText('Next').closest('button')).toBeDisabled();
  });

  it('calls onPageChange with the previous/next page on click', () => {
    const onPageChange = vi.fn();
    render(<Pagination currentPage={2} totalPages={3} startIndex={10} endIndex={20} total={25} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByText('Prev'));
    expect(onPageChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByText('Next'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
