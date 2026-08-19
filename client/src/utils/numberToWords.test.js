import { describe, it, expect } from 'vitest';
import { numberToWords } from './numberToWords';

describe('numberToWords', () => {
  it('returns empty string for falsy, NaN, zero or negative amounts', () => {
    expect(numberToWords(0)).toBe('');
    expect(numberToWords(null)).toBe('');
    expect(numberToWords(undefined)).toBe('');
    expect(numberToWords(NaN)).toBe('');
    expect(numberToWords(-50)).toBe('');
  });

  it('converts a whole-rupee amount', () => {
    expect(numberToWords(500)).toBe('Five Hundred Rupees Only');
  });

  it('converts rupees and paise together', () => {
    expect(numberToWords(500.50)).toBe('Five Hundred Rupees and Fifty Paise Only');
  });

  it('converts a paise-only amount (less than one rupee)', () => {
    expect(numberToWords(0.75)).toBe('Seventy Five Paise Only');
  });

  it('handles lakhs and crores in Indian numbering', () => {
    expect(numberToWords(1_25_340)).toBe('One Lakh Twenty Five Thousand Three Hundred Forty Rupees Only');
    expect(numberToWords(2_00_00_000)).toBe('Two Crore Rupees Only');
  });

  it('handles teens correctly (irregular English forms)', () => {
    expect(numberToWords(13)).toBe('Thirteen Rupees Only');
  });
});
