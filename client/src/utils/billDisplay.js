// The pre-printed masthead of the dairy's bill pad, and the figure format it
// uses. Shared between BillSheet.jsx (what gets shown/captured) and
// billPdf.js (the WhatsApp share caption) — kept out of BillSheet.jsx itself
// so that file can stay component-only (react-refresh's Fast Refresh needs
// component files to export nothing else).
// Contact details come from the build environment (VITE_BILL_*), not the source, so the personal details
// of the business stay out of version control. Unset values render blank on the bill.
const env = import.meta.env;

export const DAIRY = {
  proprietor: env.VITE_BILL_PROPRIETOR ?? '',
  name:       env.VITE_BILL_NAME ?? 'VIKAS MILK DAIRY',
  // Mixed case for the signature block, which the pad prints in title case.
  signName:   env.VITE_BILL_SIGN_NAME ?? 'Vikas Milk Dairy',
  address:    env.VITE_BILL_ADDRESS ?? '',
  phones:     env.VITE_BILL_PHONES ?? '',
};

/** Plain grouped figures — the pad writes amounts without a ₹ symbol. */
export function formatAmount(n) {
  if (!n) return '';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "52/ltr" — a product's rate, blank when there's nothing to derive it from. */
export function formatRate(product) {
  if (product.rate == null) return '';
  return `${product.rate}/${product.unit}`;
}

/** Quantities print whole where they are whole, 2dp otherwise, with their unit. */
export function formatQty(product) {
  const qty = Number.isInteger(product.quantity) ? String(product.quantity) : product.quantity.toFixed(2);
  return `${qty} ${product.unit}`;
}
