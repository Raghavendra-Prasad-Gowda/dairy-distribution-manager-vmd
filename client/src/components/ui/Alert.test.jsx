/**
 * Alert tests.
 *
 * Covers all four variants (icon + color), the title/children optional
 * rendering, the accessibility role split (error/warning → "alert",
 * info/success → "status"), and the unknown-variant fallback to info.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Alert from './Alert';

describe('Alert — variants', () => {
  it('defaults to the info variant with role="status"', () => {
    render(<Alert>Just so you know</Alert>);
    const alert = screen.getByRole('status');
    expect(alert.className).toContain('bg-blue-50');
    expect(screen.getByText('Just so you know')).toBeInTheDocument();
  });

  it('error variant uses role="alert" and red styling', () => {
    render(<Alert variant="error" title="Failed">Something broke</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('bg-red-50');
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Something broke')).toBeInTheDocument();
  });

  it('warning variant uses role="alert" and amber styling', () => {
    render(<Alert variant="warning">Careful</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('bg-amber-50');
  });

  it('success variant uses role="status" and emerald styling', () => {
    render(<Alert variant="success">Done</Alert>);
    const alert = screen.getByRole('status');
    expect(alert.className).toContain('bg-emerald-50');
  });

  it('falls back to the info variant for an unrecognized variant', () => {
    render(<Alert variant="mystery">Huh</Alert>);
    expect(screen.getByRole('status').className).toContain('bg-blue-50');
  });
});

describe('Alert — optional content', () => {
  it('renders without a title', () => {
    render(<Alert>Just the body</Alert>);
    expect(screen.getByText('Just the body')).toBeInTheDocument();
  });

  it('renders without children', () => {
    render(<Alert title="Just the title" />);
    expect(screen.getByText('Just the title')).toBeInTheDocument();
  });
});
