import { describe, it, expect } from 'vitest';
import {
  getPrevDate,
  getNextDate,
  formatDateDisplay,
  formatDateShort,
  formatDateShortNoYear,
  parseLocalDate,
  getIndiaDateTimeStr,
  formatCurrency,
} from './dateUtils';

describe('dateUtils', () => {
  describe('getPrevDate / getNextDate', () => {
    it('steps back/forward a day without UTC drift', () => {
      expect(getPrevDate('2026-05-01')).toBe('2026-04-30');
      expect(getNextDate('2026-04-30')).toBe('2026-05-01');
    });

    it('crosses year boundaries correctly', () => {
      expect(getPrevDate('2026-01-01')).toBe('2025-12-31');
      expect(getNextDate('2025-12-31')).toBe('2026-01-01');
    });
  });

  describe('parseLocalDate', () => {
    it('anchors a plain YYYY-MM-DD to that exact local calendar day', () => {
      const d = parseLocalDate('2026-05-24');
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(4); // 0-indexed
      expect(d.getDate()).toBe(24);
    });

    it('anchors a full ISO datetime string the same way (drift regression)', () => {
      // Prisma serializes DateTime as UTC midnight ISO. The bug this guards
      // against: new Date(iso).toLocaleDateString() with no explicit timeZone
      // uses the browser's local zone and can roll the date back a day for
      // any browser west of UTC. parseLocalDate must anchor to the date part
      // only, regardless of the time/zone suffix.
      const d = parseLocalDate('2026-05-24T00:00:00.000Z');
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(4);
      expect(d.getDate()).toBe(24);
    });
  });

  describe('formatDateShortNoYear', () => {
    it('formats as "DD Mon" with zero-padded day', () => {
      expect(formatDateShortNoYear('2026-05-24')).toBe('24 May');
      expect(formatDateShortNoYear('2026-05-04')).toBe('04 May');
    });

    it('is safe against ISO-datetime UTC drift, same as parseLocalDate', () => {
      expect(formatDateShortNoYear('2026-05-24T00:00:00.000Z')).toBe('24 May');
    });

    it('handles every month name', () => {
      expect(formatDateShortNoYear('2026-01-15')).toBe('15 Jan');
      expect(formatDateShortNoYear('2026-12-15')).toBe('15 Dec');
    });

    it('returns an em-dash for a falsy input', () => {
      expect(formatDateShortNoYear(null)).toBe('—');
      expect(formatDateShortNoYear('')).toBe('—');
    });
  });

  describe('formatDateShort', () => {
    it('formats as "D Mon YYYY"', () => {
      expect(formatDateShort('2026-05-24')).toBe('24 May 2026');
    });

    it('returns an em-dash for a falsy input', () => {
      expect(formatDateShort(null)).toBe('—');
    });
  });

  describe('formatDateDisplay', () => {
    it('formats as a full weekday + long date', () => {
      // 2026-04-08 is a Wednesday.
      expect(formatDateDisplay('2026-04-08')).toBe('Wednesday, April 8, 2026');
    });
  });

  describe('getIndiaDateTimeStr', () => {
    it('returns a non-empty IST-formatted string containing the current year', () => {
      const s = getIndiaDateTimeStr();
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
      expect(s).toMatch(new RegExp(String(new Date().getFullYear())));
    });
  });

  describe('formatCurrency', () => {
    it('formats as Indian-locale rupees', () => {
      expect(formatCurrency(123456)).toBe('₹1,23,456.00');
    });

    it('defaults a nullish amount to zero', () => {
      expect(formatCurrency(null)).toBe('₹0.00');
      expect(formatCurrency(undefined)).toBe('₹0.00');
    });
  });
});
