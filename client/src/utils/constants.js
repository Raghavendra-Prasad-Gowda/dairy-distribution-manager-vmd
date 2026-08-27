export const BRANDS = ['Nandini', 'Jersey', 'Gowardhan'];

export const PAYMENT_MODES = ['Cash', 'UPI', 'NEFT', 'RTGS', 'Cheque'];

// Width of the pinned Product column in the two Brand → Category → Product
// tables that scroll horizontally — the Dairy Stock Summary report
// (StockSummary.jsx) and the Dispatch Stock Summary shared by the admin
// Salesperson Statement and the salesman's own My Statement
// (DispatchStockSummary.jsx). Both tables pin their first column the way the
// Stock Balance Summary report pins Salesperson, so a row never loses its
// label once the numeric columns scroll off a phone screen. Shared from here
// because the two tables are deliberate mirrors of each other and a width
// that drifted between them would misalign them side by side.
export const PRODUCT_COL_MIN_WIDTH = 150;

// `header` is a solid, dark tone of the same brand color (its Tailwind
// "700" shade) for a full-width header bar with white text — e.g. the
// Dispatch Stock Summary report's per-brand row — distinct from `bg`, which
// is a pale "50" tint meant for light badges/tab backgrounds.
//
// Gowardhan's whole color family (tailwind.config.js's `gowardhan` colors)
// was redefined from its original emerald/teal palette to purple — the
// emerald was too close to Jersey's bg-jersey-700 (#0369a1, teal-leaning
// blue) to reliably tell apart (failed the dataviz skill's CVD checker's
// normal-vision floor, ΔE 14.0 vs the 15 floor). A green re-tune
// (bg-green-700) technically cleared every check, but read too similar to
// the emerald "PRODUCT" header row above it and still wasn't liked.
// Standard Tailwind purple (bg-gowardhan-600 = #9333ea) clears every check
// — CVD, normal-vision, lightness, chroma — against BOTH Nandini's and
// Jersey's header with no WARNs at all, and reads as a clearly different
// color, not just a different shade of green/blue.
//
// The whole family was retuned (not just a one-off `header: 'bg-purple-600'`
// override) so every surface that reads bg-gowardhan-*/text-gowardhan-*/
// border-gowardhan-* — the Dairy Settings brand list dot, the sidebar nav
// dot, BrandTabs, AND the Stock Summary header — shows the SAME purple,
// instead of diverging between a purple table header and a green dot
// everywhere else.
export const BRAND_COLORS = {
  Nandini:   { bg: 'bg-nandini-50',   text: 'text-nandini-700',   border: 'border-nandini-200',   dot: 'bg-nandini-500',   activeBorder: 'border-nandini-500',   activeText: 'text-nandini-700',   header: 'bg-nandini-700'   },
  Jersey:    { bg: 'bg-jersey-50',    text: 'text-jersey-700',    border: 'border-jersey-200',    dot: 'bg-jersey-500',    activeBorder: 'border-jersey-500',    activeText: 'text-jersey-700',    header: 'bg-jersey-700'    },
  Gowardhan: { bg: 'bg-gowardhan-50', text: 'text-gowardhan-700', border: 'border-gowardhan-200', dot: 'bg-gowardhan-500', activeBorder: 'border-gowardhan-500', activeText: 'text-gowardhan-700', header: 'bg-gowardhan-600' },
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
  Gowardhan: '#9333ea', // gowardhan-600 (purple) — see the header token comment above
};
const BRAND_HEADER_HEX_FALLBACK = ['#be123c', '#0f766e', '#c2410c', '#7e22ce', '#0e7490', '#be185d'];
const DEFAULT_BRAND_HEADER_HEX = '#334155'; // slate-700

/** Same brand → color mapping as getBrandColors(), as a raw hex string. */
export function getBrandHeaderHex(name, index) {
  if (BRAND_HEADER_HEX[name]) return BRAND_HEADER_HEX[name];
  if (index != null) return BRAND_HEADER_HEX_FALLBACK[index % BRAND_HEADER_HEX_FALLBACK.length];
  return DEFAULT_BRAND_HEADER_HEX;
}
