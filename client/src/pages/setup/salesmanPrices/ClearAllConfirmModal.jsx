import { Trash2, X, AlertCircle } from 'lucide-react';
import { TumblerSpinner } from '../../../components/ui/BrandedLoader';

/**
 * Confirmation modal for wiping every custom salesman price in the active
 * brand back to the global default.
 */
export default function ClearAllConfirmModal({
  show,
  activeBrandId,
  brands,
  globalProducts,
  clearingAllPrices,
  onClose,
  onConfirm,
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="bg-red-700 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3 min-w-0">
            <Trash2 size={18} className="text-red-200 flex-shrink-0" />
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Clear All Salesman Prices?</h3>
              <p className="text-[11px] text-red-200 mt-0.5">This action cannot be undone</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-red-200 hover:text-white hover:bg-red-600 rounded-lg transition">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-900 font-semibold mb-2">Warning</p>
            <p className="text-sm text-red-700 leading-relaxed">
              This will delete all custom salesman prices for all products in <span className="font-semibold">{brands.find(b => b.id === activeBrandId)?.name || 'this brand'}</span>. All salesmen will use the global default prices instead.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <p className="text-xs text-slate-600 font-semibold mb-1">Products affected:</p>
            <p className="text-sm text-slate-900 font-bold">
              {globalProducts.filter(p => p.brandId === activeBrandId).length} products
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={clearingAllPrices}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-700 hover:bg-red-800 disabled:bg-red-300 text-white rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
            >
              {clearingAllPrices ? <TumblerSpinner size={14} /> : <AlertCircle size={14} />}
              {clearingAllPrices ? 'Clearing…' : 'Clear All Prices'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
