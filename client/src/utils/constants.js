export const BRANDS = ['Nandini', 'Jersey', 'Gowardhan'];

export const PAYMENT_MODES = ['Cash', 'UPI', 'NEFT', 'RTGS', 'Cheque'];

// `header` is a solid, dark tone of the same brand color (its Tailwind
// "700" shade) for a full-width header bar with white text — e.g. the
// Dispatch Stock Summary report's per-brand row — distinct from `bg`, which
// is a pale "50" tint meant for light badges/tab backgrounds.
//
// Gowardhan's `header` is deliberately bg-green-700, not bg-gowardhan-700
// (#047857, teal-leaning emerald) — validated with the dataviz skill's CVD
// checker against Jersey's bg-jersey-700 (#0369a1, teal-leaning blue): that
// pair fails the normal-vision floor (ΔE 14.0, below the 15 floor — hard to
// tell apart even with full color vision), which is exactly what "the
// colors don't differ neatly" reported. bg-green-700 (#15803d, a truer
// green) clears every check against both Nandini and Jersey. Gowardhan's
// other tokens (bg/text/border/dot, used for badges/tabs elsewhere) are
// unchanged — only the solid full-row header fill needed retuning.
export const BRAND_COLORS = {
  Nandini:   { bg: 'bg-nandini-50',   text: 'text-nandini-700',   border: 'border-nandini-200',   dot: 'bg-nandini-500',   activeBorder: 'border-nandini-500',   activeText: 'text-nandini-700',   header: 'bg-nandini-700'   },
  Jersey:    { bg: 'bg-jersey-50',    text: 'text-jersey-700',    border: 'border-jersey-200',    dot: 'bg-jersey-500',    activeBorder: 'border-jersey-500',    activeText: 'text-jersey-700',    header: 'bg-jersey-700'    },
  Gowardhan: { bg: 'bg-gowardhan-50', text: 'text-gowardhan-700', border: 'border-gowardhan-200', dot: 'bg-gowardhan-500', activeBorder: 'border-gowardhan-500', activeText: 'text-gowardhan-700', header: 'bg-green-700'     },
};

const BRAND_FALLBACK_PALETTE = [
  { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200',   dot: 'bg-rose-500',   activeBorder: 'border-rose-500',   activeText: 'text-rose-700',   header: 'bg-rose-700'   },
  { bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-200',   dot: 'bg-teal-500',   activeBorder: 'border-teal-500',   activeText: 'text-teal-700',   header: 'bg-teal-700'   },
  { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500', activeBorder: 'border-orange-500', activeText: 'text-orange-700', header: 'bg-orange-700' },
  { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500', activeBorder: 'border-purple-500', activeText: 'text-purple-700', header: 'bg-purple-700' },
  { bg: 'bg-cyan-50',   text: 'text-cyan-700',   border: 'border-cyan-200',   dot: 'bg-cyan-500',   activeBorder: 'border-cyan-500',   activeText: 'text-cyan-700',   header: 'bg-cyan-700'   },
  { bg: 'bg-pink-50',   text: 'text-pink-700',   border: 'border-pink-200',   dot: 'bg-pink-500',   activeBorder: 'border-pink-500',   activeText: 'text-pink-700',   header: 'bg-pink-700'   },
];

export const DEFAULT_BRAND_COLOR = {
  bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200',
  dot: 'bg-slate-400', activeBorder: 'border-slate-400', activeText: 'text-slate-700',
  header: 'bg-slate-700',
};

/**
 * Returns color tokens for a brand.
 * Known brands (Nandini/Jersey/Gowardhan) get their custom tokens.
 * Unknown brands cycle through a fallback palette when an index is provided,
 * or fall back to a neutral slate when no index is given.
 */
export function getBrandColors(name, index) {
  if (BRAND_COLORS[name]) return BRAND_COLORS[name];
  if (index != null) return BRAND_FALLBACK_PALETTE[index % BRAND_FALLBACK_PALETTE.length];
  return DEFAULT_BRAND_COLOR;
}

// Hex equivalents of each brand's `header` Tailwind class above, for the
// print pages (plain inline CSS, no Tailwind) that need the same brand
// color identity in a raw `style` attribute. Kept in sync with the "700"
// shades in tailwind.config.js (custom nandini/jersey/gowardhan) and
// Tailwind's own built-in palette (the fallback colors).
const BRAND_HEADER_HEX = {
  Nandini:   '#b45309',
  Jersey:    '#0369a1',
  Gowardhan: '#15803d', // green-700 — see the header token comment above
};
const BRAND_HEADER_HEX_FALLBACK = ['#be123c', '#0f766e', '#c2410c', '#7e22ce', '#0e7490', '#be185d'];
const DEFAULT_BRAND_HEADER_HEX = '#334155'; // slate-700

/** Same brand → color mapping as getBrandColors(), as a raw hex string. */
export function getBrandHeaderHex(name, index) {
  if (BRAND_HEADER_HEX[name]) return BRAND_HEADER_HEX[name];
  if (index != null) return BRAND_HEADER_HEX_FALLBACK[index % BRAND_HEADER_HEX_FALLBACK.length];
  return DEFAULT_BRAND_HEADER_HEX;
}
