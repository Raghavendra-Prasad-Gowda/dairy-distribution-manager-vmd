import React from 'react';
import { Package } from 'lucide-react';
import BrandedLoader from './ui/BrandedLoader';
import { formatCurrency } from '../utils/dateUtils';
import { getBrandColors } from '../utils/constants';

// Whole numbers render plain; anything else shows to 2dp — same convention
// StockSummary.jsx (the Dairy Stock Summary report) uses for crates/litres/kgs.
function fmtQty(n) {
  return Number.isInteger(n) ? n : n.toFixed(2);
}

function Dash() {
  return <span className="text-slate-300">—</span>;
}

// The Product column is pinned to the left while the numeric columns scroll
// horizontally (same treatment the Salesperson column gets in the Stock
// Balance Summary report), so a row never loses its label on a narrow phone
// screen. Every first cell in the table — header, brand row, category row,
// product row, grand total — carries this width AND an opaque background of
// its own; without a background the scrolled columns show through the pinned
// cell.
const PRODUCT_COL_MIN_WIDTH = 150;

/**
 * Dispatch Stock Summary — a Brand → Category → Product breakdown of what a
 * salesperson (or every salesperson, on the admin side) was dispatched over
 * a date range. Mirrors the Dairy Stock Summary report's table
 * (StockSummary.jsx: same category header styling, same
 * crates/quantity/liters/kgs columns, same grand total footer) minus the
 * Route and Unit Price columns — dispatch has no route dimension, and this
 * summary only needs the totals, not the per-unit price.
 *
 * Two deliberate differences from Dairy Stock Summary: (1) the category
 * header always shows, even for a single-category brand, so every product's
 * category stays visible at a glance; (2) each brand's header row is
 * colored with that brand's own identity (getBrandColors — the same colors
 * used for it in Dairy Settings' Brands list and the brand tabs elsewhere)
 * instead of a uniform slate.
 *
 * Shared by the admin Salesperson Statement page and the salesman's own
 * MyStatement page so both "Dispatch Stock Summary" tabs can never drift
 * out of sync — the only difference between them is which salesperson's
 * data feeds `summary`.
 *
 * @param {{ brands: Array, totalQty: number, totalValue: number,
 *   totalCrates: number|null, totalLiters: number|null, totalKgs: number|null }} summary
 *   From buildDispatchStockSummary().
 * @param {boolean} [loading]
 * @param {string}  [error]        Shows a red banner instead of the table.
 * @param {string}  [emptyMessage]
 */
export default function DispatchStockSummaryView({
  summary,
  loading      = false,
  error        = '',
  emptyMessage = 'No dispatch data for this period',
}) {
  if (loading) {
    return <BrandedLoader size="sm" hideBrand inlinePadY="py-12" />;
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
        {error}
      </div>
    );
  }
  if (!summary || summary.brands.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-12 gap-2">
        <Package size={22} className="text-slate-300" />
        <p className="text-sm text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 bg-slate-700">
        <h2 className="text-sm font-bold text-white">Dispatch Stock Summary</h2>
        <p className="text-xs text-slate-400">Stock dispatched by product for the selected period</p>
      </div>
      <div className="overflow-auto max-h-[60vh]">
        <table className="min-w-full text-sm border-separate border-spacing-0">
          <thead className="bg-emerald-700 sticky top-0 z-10">
            <tr>
              <th
                className="sticky left-0 z-20 bg-emerald-700 px-4 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wider border-r border-emerald-600"
                style={{ minWidth: PRODUCT_COL_MIN_WIDTH }}
              >
                Product
              </th>
              <th className="px-3 py-2.5 text-center text-[11px] font-bold text-white uppercase tracking-wider whitespace-nowrap">Total Crates</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-bold text-white uppercase tracking-wider">Quantity</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-bold text-white uppercase tracking-wider">Liters</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-bold text-white uppercase tracking-wider">Kgs</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-bold text-white uppercase tracking-wider whitespace-nowrap">Total Price</th>
            </tr>
          </thead>
          <tbody>
            {summary.brands.map((brand, brandIndex) => {
              const productCount = brand.categories.reduce((s, c) => s + c.products.length, 0);
              // Same per-brand color identity as Dairy Settings' Brands list
              // and the brand tabs elsewhere in the app (getBrandColors) —
              // its dark "700" shade, for a solid header bar with white text.
              const colors = getBrandColors(brand.brandName, brandIndex);
              return (
                <React.Fragment key={brand.brandName}>
                  {/* Brand header */}
                  <tr className={colors.header}>
                    <td
                      className={`sticky left-0 z-[1] ${colors.header} px-4 py-2 text-xs font-bold text-white uppercase tracking-wider`}
                      style={{ minWidth: PRODUCT_COL_MIN_WIDTH }}
                    >
                      {brand.brandName}
                      <span className="ml-2 font-normal text-slate-300 normal-case tracking-normal">
                        {productCount} product{productCount !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-bold text-slate-200 tabular-nums">
                      {brand.totalCrates != null ? fmtQty(brand.totalCrates) : <Dash />}
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-bold text-slate-200 tabular-nums">{fmtQty(brand.totalQty)}</td>
                    <td className="px-3 py-2 text-center text-xs font-bold text-slate-200 tabular-nums">
                      {brand.totalLiters != null ? fmtQty(brand.totalLiters) : <Dash />}
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-bold text-slate-200 tabular-nums">
                      {brand.totalKgs != null ? fmtQty(brand.totalKgs) : <Dash />}
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-bold text-slate-200 tabular-nums">{formatCurrency(brand.totalValue)}</td>
                  </tr>

                  {brand.categories.map((cat) => (
                    <React.Fragment key={`${brand.brandName}::${cat.categoryName}`}>
                      {/* Category sub-header — always shown, even for a brand
                          with just one category, so the category is never
                          left unlabeled. */}
                      <tr className="bg-slate-100 border-b border-slate-200">
                        <td
                          className="sticky left-0 z-[1] bg-slate-100 px-4 py-2 text-left text-xs font-bold text-slate-700"
                          style={{ minWidth: PRODUCT_COL_MIN_WIDTH }}
                        >
                          {cat.categoryName}
                        </td>
                        <td colSpan={5} className="bg-slate-100" />
                      </tr>

                      {/* Product rows */}
                      {cat.products.map((p, idx) => (
                        <tr key={p.productName} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                          <td
                            className={`sticky left-0 z-[1] ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} px-4 py-2.5 pl-5 text-sm font-medium text-slate-800 border-r border-slate-100`}
                            style={{ minWidth: PRODUCT_COL_MIN_WIDTH }}
                          >
                            {p.productName}
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold text-slate-700 tabular-nums">
                            {p.totalCrates != null ? fmtQty(p.totalCrates) : <Dash />}
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold text-slate-700 tabular-nums">{fmtQty(p.totalQty)}</td>
                          <td className="px-3 py-2.5 text-center font-bold text-slate-700 tabular-nums">
                            {p.totalLiters != null ? fmtQty(p.totalLiters) : <Dash />}
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold text-slate-700 tabular-nums">
                            {p.totalKgs != null ? fmtQty(p.totalKgs) : <Dash />}
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold text-emerald-700 tabular-nums">{formatCurrency(p.totalValue)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>

          {/* Grand total footer */}
          <tfoot>
            <tr className="bg-slate-800">
              <td
                className="sticky left-0 z-[1] bg-slate-800 px-4 py-3 text-xs font-bold text-slate-300 uppercase tracking-wider border-r border-slate-600"
                style={{ minWidth: PRODUCT_COL_MIN_WIDTH }}
              >
                Grand Total
              </td>
              <td className="px-3 py-3 text-center text-xs font-bold text-white tabular-nums border-r border-slate-600">
                {summary.totalCrates != null ? fmtQty(summary.totalCrates) : <span className="text-slate-500">—</span>}
              </td>
              <td className="px-3 py-3 text-center text-xs font-bold text-white tabular-nums border-r border-slate-600">{fmtQty(summary.totalQty)}</td>
              <td className="px-3 py-3 text-center text-xs font-bold text-white tabular-nums border-r border-slate-600">
                {summary.totalLiters != null ? fmtQty(summary.totalLiters) : <span className="text-slate-500">—</span>}
              </td>
              <td className="px-3 py-3 text-center text-xs font-bold text-white tabular-nums border-r border-slate-600">
                {summary.totalKgs != null ? fmtQty(summary.totalKgs) : <span className="text-slate-500">—</span>}
              </td>
              <td className="px-3 py-3 text-center text-sm font-extrabold text-white tabular-nums">{formatCurrency(summary.totalValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
