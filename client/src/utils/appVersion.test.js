import { describe, it, expect } from 'vitest';
import { formatVersion } from './appVersion';

describe('formatVersion', () => {
  it('joins tag and commit', () => expect(formatVersion('1.4.0', 'a3f9c21')).toBe('v1.4.0 · a3f9c21'));
  it('shows the commit alone when untagged', () => expect(formatVersion('', 'a3f9c21')).toBe('a3f9c21'));
  it('shows dev when neither is known', () => expect(formatVersion('', '')).toBe('dev'));
});
