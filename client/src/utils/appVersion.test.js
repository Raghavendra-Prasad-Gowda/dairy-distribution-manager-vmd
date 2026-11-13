import { describe, it, expect } from 'vitest';
import { formatVersion } from './appVersion';

describe('formatVersion', () => {
  it('joins tag and commit', () => expect(formatVersion('1.4.0', 'a3f9c21')).toBe('v1.4.0 · a3f9c21'));
  it('shows the commit alone when untagged', () => expect(formatVersion('', 'a3f9c21')).toBe('a3f9c21'));
  it('shows dev when neither is known', () => expect(formatVersion('', '')).toBe('dev'));
});

import { formatBuiltAt } from './appVersion';

describe('formatBuiltAt', () => {
  it('renders the build time in the viewer time zone, with its abbreviation', () => {
    const text = formatBuiltAt('2026-10-24T09:32:00Z');
    const expected = new Intl.DateTimeFormat('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
    }).format(new Date('2026-10-24T09:32:00Z')).replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
    expect(text).toBe(expected);
    expect(text).toMatch(/^24 Oct 2026, \d{1,2}:\d{2} (AM|PM) \S+/);
  });
  it('follows the TZ of the viewer (not a fixed zone)', () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hour = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date('2026-10-24T09:32:00Z'));
    expect(formatBuiltAt('2026-10-24T09:32:00Z')).toContain(`${Number(hour) % 12 || 12}:32`);
  });
  it('is empty for missing or invalid input', () => {
    expect(formatBuiltAt('')).toBe('');
    expect(formatBuiltAt('not-a-date')).toBe('');
  });
});
