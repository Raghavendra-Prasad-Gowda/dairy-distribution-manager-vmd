export const BRANDS = ['Nandini', 'Jersey', 'Gowardhan'];

export const PAYMENT_MODES = ['Cash', 'UPI', 'NEFT', 'RTGS', 'Cheque'];

export const BRAND_COLORS = {
  Nandini:   { bg: 'bg-nandini-50',   text: 'text-nandini-700',   border: 'border-nandini-200',   dot: 'bg-nandini-500',   activeBorder: 'border-nandini-500',   activeText: 'text-nandini-700' },
  Jersey:    { bg: 'bg-jersey-50',    text: 'text-jersey-700',    border: 'border-jersey-200',    dot: 'bg-jersey-500',    activeBorder: 'border-jersey-500',    activeText: 'text-jersey-700' },
  Gowardhan: { bg: 'bg-gowardhan-50', text: 'text-gowardhan-700', border: 'border-gowardhan-200', dot: 'bg-gowardhan-500', activeBorder: 'border-gowardhan-500', activeText: 'text-gowardhan-700' },
};

const BRAND_FALLBACK_PALETTE = [
  { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200',   dot: 'bg-rose-500',   activeBorder: 'border-rose-500',   activeText: 'text-rose-700'   },
  { bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-200',   dot: 'bg-teal-500',   activeBorder: 'border-teal-500',   activeText: 'text-teal-700'   },
  { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500', activeBorder: 'border-orange-500', activeText: 'text-orange-700' },
  { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500', activeBorder: 'border-purple-500', activeText: 'text-purple-700' },
  { bg: 'bg-cyan-50',   text: 'text-cyan-700',   border: 'border-cyan-200',   dot: 'bg-cyan-500',   activeBorder: 'border-cyan-500',   activeText: 'text-cyan-700'   },
  { bg: 'bg-pink-50',   text: 'text-pink-700',   border: 'border-pink-200',   dot: 'bg-pink-500',   activeBorder: 'border-pink-500',   activeText: 'text-pink-700'   },
];

export const DEFAULT_BRAND_COLOR = {
  bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200',
  dot: 'bg-slate-400', activeBorder: 'border-slate-400', activeText: 'text-slate-700',
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
