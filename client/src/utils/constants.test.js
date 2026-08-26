import { describe, it, expect } from 'vitest';
import { BRANDS, PAYMENT_MODES, BRAND_COLORS, DEFAULT_BRAND_COLOR, getBrandColors, getBrandHeaderHex } from './constants';

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

  // Dispatch Stock Summary's per-brand header bar (a solid, dark tone of
  // the same brand color, not the pale badge tint) relies on this field.
  it('includes a dark "header" token distinct from the pale "bg" tint', () => {
    expect(BRAND_COLORS.Nandini.header).toBe('bg-nandini-700');
    expect(BRAND_COLORS.Nandini.header).not.toBe(BRAND_COLORS.Nandini.bg);
    expect(getBrandColors('New Co', 0).header).toBe('bg-rose-700');
    expect(DEFAULT_BRAND_COLOR.header).toBe('bg-slate-700');
  });

  // Regression: Gowardhan's color family used to be emerald (#047857 at
  // 700), too close to Jersey's teal-leaning bg-jersey-700 (#0369a1) to
  // reliably tell apart in the Dispatch Stock Summary table. A green
  // re-tune (bg-green-700) technically passed but still read too similar to
  // the emerald thead row above it, so the whole gowardhan-* family was
  // redefined to purple in tailwind.config.js — not just the header token —
  // so every surface using bg-gowardhan-*/text-gowardhan-*/border-gowardhan-*
  // (Dairy Settings brand dot, sidebar nav dot, BrandTabs, Stock Summary
  // header) shows the same purple, uniformly.
  it("gives Gowardhan a header distinct from Jersey's/Nandini's header, in the same purple family as its other tokens", () => {
    expect(BRAND_COLORS.Gowardhan.header).toBe('bg-gowardhan-600');
    expect(BRAND_COLORS.Gowardhan.header).not.toBe(BRAND_COLORS.Jersey.header);
    expect(BRAND_COLORS.Gowardhan.header).not.toBe(BRAND_COLORS.Nandini.header);
    // Its other tokens (badges/tabs elsewhere) share the same gowardhan-*
    // (purple) family as the header.
    expect(BRAND_COLORS.Gowardhan.bg).toBe('bg-gowardhan-50');
    expect(BRAND_COLORS.Gowardhan.dot).toBe('bg-gowardhan-500');
  });
});

describe('getBrandHeaderHex', () => {
  it('returns each known brand\'s own hex, matching its Tailwind "header" class', () => {
    expect(getBrandHeaderHex('Nandini')).toBe('#b45309');
    expect(getBrandHeaderHex('Jersey')).toBe('#0369a1');
    // gowardhan-600 (purple), not the original emerald #047857 — see the
    // header token comment in constants.js.
    expect(getBrandHeaderHex('Gowardhan')).toBe('#9333ea');
  });

  it('cycles through the fallback hex palette by index for an unknown brand', () => {
    const first = getBrandHeaderHex('New Co', 0);
    const second = getBrandHeaderHex('Another Co', 1);
    expect(first).not.toBe(second);
    // Wraps around after the palette length.
    expect(getBrandHeaderHex('X', 6)).toBe(first);
  });

  it('falls back to a neutral slate hex for an unknown brand with no index', () => {
    expect(getBrandHeaderHex('Unknown Brand')).toBe('#334155');
  });
});
