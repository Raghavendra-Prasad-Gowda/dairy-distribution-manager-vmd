import { describe, it, expect } from 'vitest';
import { formatVersion } from './appVersion';

describe('formatVersion', () => {
  it('joins tag and commit', () => expect(formatVersion('1.4.0', 'a3f9c21')).toBe('v1.4.0 · a3f9c21'));
  it('shows the commit alone when untagged', () => expect(formatVersion('', 'a3f9c21')).toBe('a3f9c21'));
  it('shows dev when neither is known', () => expect(formatVersion('', '')).toBe('dev'));
});

import { formatBuiltAt } from './appVersion';

describe('formatBuiltAt', () => {
  it('renders the build time in IST', () => {
    expect(formatBuiltAt('2026-10-24T09:32:00Z', 'Asia/Kolkata')).toBe('24 Oct 2026, 3:02 PM IST');
  });
  it('renders the build time in the viewer time zone', () => {
    expect(formatBuiltAt('2026-10-24T09:32:00Z', 'UTC')).toMatch(/^24 Oct 2026, 9:32 AM (UTC|GMT)$/);
    expect(formatBuiltAt('2026-10-24T09:32:00Z', 'Australia/Sydney')).toMatch(/^24 Oct 2026, 8:32 PM /);
  });
  it('is empty for missing or invalid input', () => {
    expect(formatBuiltAt('')).toBe('');
    expect(formatBuiltAt('not-a-date')).toBe('');
  });
});
