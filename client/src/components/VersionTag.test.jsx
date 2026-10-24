import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import VersionTag from './VersionTag';
import { APP_VERSION_LABEL } from '../utils/appVersion';

describe('VersionTag', () => {
  it('renders the version label and the build time', () => {
    render(<VersionTag className="x" />);
    expect(screen.getByTestId('app-version')).toHaveTextContent(APP_VERSION_LABEL);
    expect(screen.getByTestId('app-built-at')).toHaveTextContent(/^Built .* IST$/);
  });
});
