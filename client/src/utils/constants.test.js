import { describe, it, expect } from 'vitest';
import { BRANDS, PAYMENT_MODES, BRAND_COLORS, DEFAULT_BRAND_COLOR, getBrandColors } from './constants';

describe('constants', () => {
  it('exposes the three known brands and standard payment modes', () => {
    expect(BRANDS).toEqual(['Nandini', 'Jersey', 'Gowardhan']);
    expect(PAYMENT_MODES).toContain('Cash');
    expect(PAYMENT_MODES).toContain('UPI');
  });
});

describe('getBrandColors', () => {
  it('returns the custom token set for a known brand', () => {
    expect(getBrandColors('Nandini')).toBe(BRAND_COLORS.Nandini);
  });

  it('cycles through the fallback palette by index for an unknown brand', () => {
    const first = getBrandColors('New Co', 0);
    const second = getBrandColors('Another Co', 1);
    expect(first).not.toEqual(second);
    // Wraps around after the palette length.
    expect(getBrandColors('X', 6)).toEqual(first);
  });

  it('falls back to the neutral slate palette for an unknown brand with no index', () => {
    expect(getBrandColors('Unknown Brand')).toBe(DEFAULT_BRAND_COLOR);
  });
});
