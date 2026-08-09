/**
 * NotificationContext tests.
 *
 * Covers the centered modal (success/error/warning/info variants, unknown
 * type falling back to info, OK button + backdrop-click dismissal, and
 * clicking inside the card not dismissing it), the loading overlay (no OK
 * button, replaces the modal), and notify() replacing whatever is current.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NotificationProvider, useNotification } from './NotificationContext';

function Probe() {
  const { notify } = useNotification();
  return (
    <div>
      <button onClick={() => notify('All good')}>notify-success</button>
      <button onClick={() => notify('Boom', 'error')}>notify-error</button>
      <button onClick={() => notify('Careful', 'warning')}>notify-warning</button>
      <button onClick={() => notify('FYI', 'info')}>notify-info</button>
      <button onClick={() => notify('Weird', 'mystery')}>notify-unknown</button>
      <button onClick={() => notify('Saving…', 'loading')}>notify-loading</button>
    </div>
  );
}

function renderProvider() {
  return render(<NotificationProvider><Probe /></NotificationProvider>);
}

describe('NotificationContext — modal variants', () => {
  it('defaults to the success variant with title "Success"', () => {
    renderProvider();
    fireEvent.click(screen.getByText('notify-success'));
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('shows the error variant with title "Something went wrong"', () => {
    renderProvider();
    fireEvent.click(screen.getByText('notify-error'));
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('shows the warning variant', () => {
    renderProvider();
    fireEvent.click(screen.getByText('notify-warning'));
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Careful')).toBeInTheDocument();
  });

  it('shows the info variant', () => {
    renderProvider();
    fireEvent.click(screen.getByText('notify-info'));
    expect(screen.getByText('Info')).toBeInTheDocument();
    expect(screen.getByText('FYI')).toBeInTheDocument();
  });

  it('falls back to the info variant for an unrecognized type', () => {
    renderProvider();
    fireEvent.click(screen.getByText('notify-unknown'));
    expect(screen.getByText('Info')).toBeInTheDocument();
    expect(screen.getByText('Weird')).toBeInTheDocument();
  });
});

describe('NotificationContext — dismissal', () => {
  it('the OK button dismisses the modal', () => {
    renderProvider();
    fireEvent.click(screen.getByText('notify-success'));
    fireEvent.click(screen.getByText('OK'));
    expect(screen.queryByText('Success')).toBeNull();
  });

  it('clicking the backdrop dismisses the modal', () => {
    const { container } = renderProvider();
    fireEvent.click(screen.getByText('notify-success'));
    fireEvent.click(container.querySelector('.fixed.inset-0'));
    expect(screen.queryByText('Success')).toBeNull();
  });

  it('clicking inside the card does not dismiss it', () => {
    renderProvider();
    fireEvent.click(screen.getByText('notify-success'));
    fireEvent.click(screen.getByText('All good')); // inner content
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('a later notify() replaces the currently shown message', () => {
    renderProvider();
    fireEvent.click(screen.getByText('notify-success'));
    expect(screen.getByText('All good')).toBeInTheDocument();
    fireEvent.click(screen.getByText('notify-error'));
    expect(screen.queryByText('All good')).toBeNull();
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });
});

describe('NotificationContext — loading overlay', () => {
  it('shows the loading overlay with its message and no OK button', () => {
    renderProvider();
    fireEvent.click(screen.getByText('notify-loading'));
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(screen.queryByText('OK')).toBeNull();
  });

  it('a loading state can be replaced by a regular modal', () => {
    renderProvider();
    fireEvent.click(screen.getByText('notify-loading'));
    fireEvent.click(screen.getByText('notify-success'));
    expect(screen.queryByText('Saving…')).toBeNull();
    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});
