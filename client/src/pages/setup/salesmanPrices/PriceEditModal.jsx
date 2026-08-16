import { Edit2, X, Save, Loader2 } from 'lucide-react';
import { getIndiaDate, formatDateShort } from '../../../utils/dateUtils';

/**
 * Per-row price edit modal — update a single salesperson's selling price
 * for one product, with an optional "History" shortcut into the price
 * schedule modal.
 */
export default function PriceEditModal({
  editingPrice,
  priceForm,
  setPriceForm,
  savingPrice,
  onClose,
  onSubmit,
  onShowHistory,
  fmt,
}) {
  if (!editingPrice) return null;

  const unitLabel = editingPrice.unitType === 'ml' && editingPrice.unitSize
    ? `${editingPrice.unitSize} ml`
    : editingPrice.unitType === 'gram' && editingPrice.unitSize
    ? `${editingPrice.unitSize} g`
    : editingPrice.unitType ?? '—';
  const containerLabel = editingPrice.containerType && editingPrice.unitsPerContainer
    ? `${editingPrice.unitsPerContainer} / ${editingPrice.containerType}`
    : null;

  return (
    <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Emerald header bar — matches the app's page-header chrome */}
        <div className="bg-emerald-700 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3 min-w-0">
            <Edit2 size={18} className="text-emerald-200 flex-shrink-0" />
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Edit Price</h3>
              <p className="text-[11px] text-emerald-200 mt-0.5">Update salesperson selling price</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-600 rounded-lg transition">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 py-5 space-y-5">

          {/* Product details — read only */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div>
              <p className="text-sm font-bold text-slate-900 leading-tight">{editingPrice.productName}</p>
              <div className="flex items-center gap-2 mt-1">
                {editingPrice.brandName && (
                  <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{editingPrice.brandName}</span>
                )}
                {editingPrice.category && (
                  <span className="text-[10px] font-semibold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{editingPrice.category}</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
              <div>
                <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Unit</p>
                <p className="text-slate-700 font-semibold tabular-nums">{unitLabel}</p>
              </div>
              {containerLabel && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Pack</p>
                  <p className="text-slate-700 font-semibold tabular-nums">{containerLabel}</p>
                </div>
              )}
              <div>
                <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Dairy Cost</p>
                <p className="text-slate-700 font-semibold tabular-nums">{fmt(editingPrice.dairyCostPrice)}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Dairy Selling</p>
                <p className="text-slate-700 font-semibold tabular-nums">{fmt(editingPrice.dairySellingPrice)}</p>
              </div>
              {editingPrice.currentPrice != null && (
                <div className="col-span-2 pt-2 border-t border-slate-200">
                  <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Current Price</p>
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm text-emerald-700 font-bold tabular-nums">{fmt(editingPrice.currentPrice)}</p>
                    {editingPrice.currentEffective && (
                      <p className="text-[10px] text-slate-500 tabular-nums">since {formatDateShort(editingPrice.currentEffective)}</p>
                    )}
                  </div>
                </div>
              )}
              {editingPrice.upcomingPrice != null && (
                <div className="col-span-2 pt-2 border-t border-amber-200 bg-amber-50/40 -mx-4 -mb-4 px-4 py-2 rounded-b-xl">
                  <p className="text-amber-600 uppercase tracking-wider font-semibold mb-0.5">Upcoming · saving will replace this</p>
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm text-amber-700 font-bold tabular-nums">{fmt(editingPrice.upcomingPrice)}</p>
                    {editingPrice.upcomingEffective && (
                      <p className="text-[10px] text-amber-700/80 tabular-nums">from {formatDateShort(editingPrice.upcomingEffective)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Editable: Selling Price */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              New Selling Price (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
              <input
                autoFocus
                type="number" step="0.0001" min="0"
                value={priceForm.sellingPrice}
                onChange={e => setPriceForm(f => ({ ...f, sellingPrice: e.target.value }))}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2.5 text-sm text-right font-semibold tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                required
              />
            </div>
          </div>

          {/* Editable: Effective From — today or any future date.
              Past dates are blocked via min so admin can't accidentally
              back-date a change that would either be invisible or
              re-bill old transactions. */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Prices From
            </label>
            <input
              type="date"
              value={priceForm.effectiveFrom}
              onChange={e => setPriceForm(f => ({ ...f, effectiveFrom: e.target.value }))}
              min={getIndiaDate()}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Pick today to make it the current price, or a future date to schedule the change.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onShowHistory} className="px-4 py-2.5 text-sm font-semibold bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl transition">
              History
            </button>
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition">
              Cancel
            </button>
            <button type="submit" disabled={savingPrice} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white rounded-xl transition flex items-center justify-center gap-2 shadow-sm">
              {savingPrice ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              {savingPrice ? 'Saving…' : 'Save Price'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
