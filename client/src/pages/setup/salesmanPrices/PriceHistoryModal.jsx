import { Clock, X } from 'lucide-react';

/**
 * Price schedule modal — shows the current and any upcoming (scheduled)
 * price for the product currently open in PriceEditModal.
 */
export default function PriceHistoryModal({ show, editingPrice, onClose }) {
  if (!show || !editingPrice) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-emerald-700 px-5 py-4 flex items-center justify-between rounded-t-2xl sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <Clock size={18} className="text-emerald-200 flex-shrink-0" />
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Price Schedule</h3>
              <p className="text-[11px] text-emerald-200 mt-0.5">{editingPrice.productName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-600 rounded-lg transition">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Current price */}
          {editingPrice.currentPrice != null && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Current Price</p>
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-semibold">Active</span>
              </div>
              <p className="text-2xl font-bold text-emerald-900 tabular-nums">
                ₹{Number(editingPrice.currentPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {editingPrice.currentEffective && (
                <p className="text-xs text-emerald-600 mt-2">since {new Date(editingPrice.currentEffective + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              )}
            </div>
          )}

          {/* Upcoming price */}
          {editingPrice.upcomingPrice != null && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Upcoming Price</p>
                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded font-semibold">Scheduled</span>
              </div>
              <p className="text-2xl font-bold text-amber-900 tabular-nums">
                ₹{Number(editingPrice.upcomingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {editingPrice.upcomingEffective && (
                <p className="text-xs text-amber-600 mt-2">from {new Date(editingPrice.upcomingEffective + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              )}
            </div>
          )}

          {/* No prices scheduled */}
          {editingPrice.currentPrice == null && editingPrice.upcomingPrice == null && (
            <div className="text-center py-6 text-slate-400">
              <p className="text-sm">No prices scheduled for this product</p>
            </div>
          )}

          {/* Info note */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Prices marked as "Current" are in effect today. Prices marked as "Scheduled" will become active on their specified date.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
