import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import VersionTag from './VersionTag';
import { APP_VERSION_LABEL } from '../utils/appVersion';

describe('VersionTag', () => {
  it('renders the build label', () => {
    render(<VersionTag className="x" />);
    expect(screen.getByTestId('app-version')).toHaveTextContent(APP_VERSION_LABEL);
  });
});
