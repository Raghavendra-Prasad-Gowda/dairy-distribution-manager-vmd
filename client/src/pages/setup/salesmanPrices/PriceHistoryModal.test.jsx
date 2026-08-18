import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PriceHistoryModal from './PriceHistoryModal';

describe('PriceHistoryModal', () => {
  it('renders nothing when show is false, even with a price to show', () => {
    const { container } = render(
      <PriceHistoryModal show={false} editingPrice={{ productName: 'Toned Milk', currentPrice: 45 }} onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when editingPrice is null, even if show is true', () => {
    const { container } = render(<PriceHistoryModal show editingPrice={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the current price block when there is no upcoming price', () => {
    render(
      <PriceHistoryModal
        show
        editingPrice={{ productName: 'Toned Milk', currentPrice: 45, currentEffective: '2026-01-01' }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
    expect(screen.getByText('Current Price')).toBeInTheDocument();
    expect(screen.getByText('₹45.00')).toBeInTheDocument();
    expect(screen.getByText(/since 01 Jan 2026/)).toBeInTheDocument();
    expect(screen.queryByText('Upcoming Price')).not.toBeInTheDocument();
  });

  it('shows only the upcoming price block when there is no current price', () => {
    render(
      <PriceHistoryModal
        show
        editingPrice={{ productName: 'Toned Milk', upcomingPrice: 50, upcomingEffective: '2026-09-01' }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Upcoming Price')).toBeInTheDocument();
    expect(screen.getByText('₹50.00')).toBeInTheDocument();
    expect(screen.getByText(/from 01 Sept? 2026/)).toBeInTheDocument();
    expect(screen.queryByText('Current Price')).not.toBeInTheDocument();
  });

  it('shows both blocks when both a current and an upcoming price exist', () => {
    render(
      <PriceHistoryModal
        show
        editingPrice={{
          productName: 'Toned Milk',
          currentPrice: 45, currentEffective: '2026-01-01',
          upcomingPrice: 50, upcomingEffective: '2026-09-01',
        }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Current Price')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Price')).toBeInTheDocument();
  });

  it('shows the empty state when neither a current nor upcoming price exists', () => {
    render(
      <PriceHistoryModal show editingPrice={{ productName: 'Toned Milk' }} onClose={vi.fn()} />
    );
    expect(screen.getByText('No prices scheduled for this product')).toBeInTheDocument();
  });

  it('omits the "since"/"from" date lines when the effective date is missing', () => {
    render(
      <PriceHistoryModal
        show
        editingPrice={{ productName: 'Toned Milk', currentPrice: 45, upcomingPrice: 50 }}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText(/since/)).not.toBeInTheDocument();
    expect(screen.queryByText(/from/)).not.toBeInTheDocument();
  });

  it('calls onClose from the backdrop, the X button, and the Close button, not from the card itself', () => {
    const onClose = vi.fn();
    const { container } = render(
      <PriceHistoryModal show editingPrice={{ productName: 'Toned Milk', currentPrice: 45 }} onClose={onClose} />
    );

    fireEvent.click(screen.getByText('Toned Milk'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.firstChild);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
