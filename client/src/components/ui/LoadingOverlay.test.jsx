/**
 * LoadingOverlay tests.
 *
 * Thin wrapper over BrandedLoader — just confirm it forwards `open` and
 * `message` correctly (mocking BrandedLoader keeps this a pure prop-forwarding
 * test, isolated from BrandedLoader's own rendering, which has its own tests).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoadingOverlay from './LoadingOverlay';

vi.mock('./BrandedLoader', () => ({
  default: (props) => <div data-testid="branded-loader">{JSON.stringify(props)}</div>,
}));

describe('LoadingOverlay', () => {
  it('forwards overlay=true, open, and label=message to BrandedLoader', () => {
    render(<LoadingOverlay open message="Saving product…" />);
    const props = JSON.parse(screen.getByTestId('branded-loader').textContent);
    expect(props).toMatchObject({ overlay: true, open: true, label: 'Saving product…', size: 'sm' });
  });

  it('defaults open to true and message to "Working…"', () => {
    render(<LoadingOverlay />);
    const props = JSON.parse(screen.getByTestId('branded-loader').textContent);
    expect(props).toMatchObject({ open: true, label: 'Working…' });
  });

  it('forwards open=false', () => {
    render(<LoadingOverlay open={false} />);
    const props = JSON.parse(screen.getByTestId('branded-loader').textContent);
    expect(props.open).toBe(false);
  });
});
