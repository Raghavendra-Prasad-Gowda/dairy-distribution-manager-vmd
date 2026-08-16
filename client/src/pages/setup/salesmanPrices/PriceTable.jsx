import React from 'react';
import { Edit2 } from 'lucide-react';
import Pagination from '../../../components/Pagination';
import BrandedLoader from '../../../components/ui/BrandedLoader';
import { formatDateShort } from '../../../utils/dateUtils';
import TogglePill from './TogglePill';

/**
 * The product list itself — pagination header plus one of two tables,
 * depending on mode:
 *  - Global: default price + global enable/disable + clear-custom-prices
 *  - Per-person: selling price, effective/upcoming price, per-row edit,
 *    and the enable/disable exception toggle
 */
export default function PriceTable({
  isGlobal,
  loading,
  pageGroups,
  colSpan,
  currentPage,
  totalPages,
  startIdx,
  endIdx,
  totalFiltered,
  setCurrentPage,
  search,
  dirtyGlobal,
  dirtyGlobalPrices,
  dirtyToggles,
  handleGlobalPriceChange,
  handleGlobalToggle,
  handleToggle,
  openPriceEdit,
  handleClearCustomPrices,
  clearingProductId,
  fmt,
}) {
  return (
    <>
      <Pagination
        currentPage={currentPage} totalPages={totalPages}
        startIndex={startIdx} endIndex={endIdx} total={totalFiltered}
        onPageChange={setCurrentPage}
      />

      {/* Salesman-centric view table */}
      {!isGlobal && (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-emerald-700 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-28">Dairy Cost</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-28">Dairy Selling</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase tracking-wider w-32">Selling Price</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-32">Prices From</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-32">Effective Price</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-amber-200 uppercase tracking-wider w-28">Upcoming</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-amber-200 uppercase tracking-wider w-32">From</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-20">Edit</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-24">Access</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={colSpan}><BrandedLoader size="sm" hideBrand inlinePadY="py-12" /></td></tr>
              ) : pageGroups.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="py-12 text-center text-slate-400 text-sm">
                    {search ? 'No products match your search.' : 'No products for this brand'}
                  </td>
                </tr>
              ) : (
                pageGroups.map(([category, items]) => (
                  <React.Fragment key={category}>
                    <tr className="bg-slate-100 border-l-4 border-emerald-500">
                      <td colSpan={colSpan} className="px-6 py-2 text-left text-xs font-bold text-slate-600 uppercase tracking-widest">
                        {category}
                      </td>
                    </tr>
                    {items.map(p => {
                      // Per-person row
                      const hasPrice      = p.sellingPrice !== null;
                      const isToggleDirty = dirtyToggles[p.productId] !== undefined;
                      return (
                        <tr
                          key={p.productId}
                          className={`transition-colors ${
                            !p.isEnabled
                              ? 'bg-slate-50/60 opacity-70'
                              : isToggleDirty
                              ? 'bg-emerald-50/40'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-6 py-3.5 align-middle">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-semibold ${p.isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                {p.productName}
                              </span>
                              {!hasPrice && p.isEnabled && (
                                <span className="badge-amber text-[10px]">No price</span>
                              )}
                              {!p.salespersonEnabled && p.isEnabled && (
                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold" title="Globally disabled but enabled as exception for this salesperson">Exception</span>
                              )}
                              {!p.salespersonEnabled && !p.isEnabled && (
                                <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-semibold">Global off</span>
                              )}
                              {isToggleDirty && (
                                <span className="text-[10px] text-amber-600 font-bold">unsaved</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                            <span className="text-xs text-slate-400">{fmt(p.dairyCostPrice)}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                            <span className="text-xs text-slate-400">{fmt(p.dairySellingPrice)}</span>
                          </td>
                          <td className="px-6 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                            {hasPrice
                              ? <span className="text-sm font-semibold text-slate-800">₹{Number(p.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                              : <span className="text-amber-600 font-semibold text-xs">Not set</span>
                            }
                          </td>
                          <td className="px-4 py-3.5 text-center align-middle whitespace-nowrap">
                            {p.effectiveFrom
                              ? <span className="text-xs font-semibold text-amber-600 tabular-nums">{formatDateShort(p.effectiveFrom)}</span>
                              : <span className="text-xs text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                            {p.sellingPrice != null ? (
                              <span className="text-sm font-bold text-emerald-700">₹{Number(p.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                            ) : (
                              <span className="text-xs text-slate-400 font-semibold">from global</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                            {p.upcomingSellingPrice != null
                              ? <span className="text-sm font-semibold text-amber-700">₹{Number(p.upcomingSellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                              : <span className="text-xs text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3.5 text-center align-middle whitespace-nowrap">
                            {p.upcomingEffectiveFrom
                              ? <span className="text-xs font-semibold text-amber-700 tabular-nums">{formatDateShort(p.upcomingEffectiveFrom)}</span>
                              : <span className="text-xs text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3.5 text-center align-middle">
                            <button
                              onClick={() => openPriceEdit(p)}
                              className="text-emerald-600 hover:text-emerald-800 transition-colors p-1.5 rounded-lg hover:bg-emerald-50"
                              title="Edit price"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </td>
                          <td className="px-6 py-3.5 text-center align-middle">
                            <div title={
                              !p.salespersonEnabled && p.isEnabled
                                ? 'Exception — globally off but enabled for this salesperson'
                                : !p.salespersonEnabled
                                ? 'Globally disabled — toggle to enable as exception for this salesperson only'
                                : ''
                            }>
                              <TogglePill
                                enabled={p.isEnabled}
                                onChange={() => handleToggle(p.productId, p.isEnabled, !p.salespersonEnabled)}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Global settings table */}
      {isGlobal && (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-emerald-700 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-28">Dairy Cost</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-28">Dairy Selling</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-32">Default Price</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-24">Global</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-28">Clear Prices</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6}><BrandedLoader size="sm" hideBrand inlinePadY="py-12" /></td></tr>
              ) : pageGroups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">
                    {search ? 'No products match your search.' : 'No products for this brand'}
                  </td>
                </tr>
              ) : (
                pageGroups.map(([category, items]) => (
                  <React.Fragment key={category}>
                    <tr className="bg-slate-100 border-l-4 border-emerald-500">
                      <td colSpan={6} className="px-6 py-2 text-left text-xs font-bold text-slate-600 uppercase tracking-widest">
                        {category}
                      </td>
                    </tr>
                    {items.map(p => {
                      const isDirty = dirtyGlobal[p.productId] !== undefined || dirtyGlobalPrices[p.productId] !== undefined;
                      const priceValue = dirtyGlobalPrices[p.productId] !== undefined ? dirtyGlobalPrices[p.productId] : p.salespersonDefaultPrice;
                      const isEnabled = p.salespersonEnabled;
                      const priceInvalid = isEnabled && (!priceValue || priceValue <= 0);

                      return (
                        <tr
                          key={p.productId}
                          className={`transition-colors ${
                            priceInvalid
                              ? 'bg-red-50/40 border-l-4 border-red-500'
                              : !isEnabled
                              ? 'bg-slate-50/60 opacity-70'
                              : isDirty
                              ? 'bg-emerald-50/40'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-6 py-3.5 align-middle">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-semibold ${isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                {p.productName}
                              </span>
                              {priceInvalid && <span className="text-[10px] bg-red-200 text-red-700 px-1.5 py-0.5 rounded font-semibold">No price</span>}
                              {isDirty && !priceInvalid && <span className="text-[10px] text-amber-600 font-bold">unsaved</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                            <span className="text-xs text-slate-400">{fmt(p.dairyCostPrice)}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                            <span className="text-xs text-slate-400">{fmt(p.dairySellingPrice)}</span>
                          </td>
                          <td className={`px-4 py-3.5 text-right align-middle ${priceInvalid ? 'bg-red-100/50' : ''}`}>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={priceValue ?? ''}
                                onChange={e => handleGlobalPriceChange(p.productId, e.target.value)}
                                placeholder="Required"
                                className={`w-full pl-5 pr-2 py-2 text-xs text-right font-semibold tabular-nums border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent ${
                                  priceInvalid
                                    ? 'border-red-400 bg-red-50 focus:ring-red-400 text-red-700'
                                    : 'border-slate-200 focus:ring-emerald-400'
                                }`}
                                required
                              />
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-center align-middle">
                            <div title={priceInvalid ? 'Set default price before enabling' : ''}>
                              <TogglePill
                                enabled={isEnabled}
                                onChange={() => handleGlobalToggle(p.productId, isEnabled)}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-center align-middle">
                            <button
                              onClick={() => handleClearCustomPrices(p.productId)}
                              disabled={clearingProductId === p.productId}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
                              title="Clear all custom prices for this product — all salesmen will use this global default"
                            >
                              {clearingProductId === p.productId ? 'Clearing…' : 'Clear'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </>
  );
}
