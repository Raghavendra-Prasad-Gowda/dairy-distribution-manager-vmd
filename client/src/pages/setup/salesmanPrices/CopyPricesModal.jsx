import { Copy, X, Search } from 'lucide-react';
import { TumblerSpinner } from '../../../components/ui/BrandedLoader';

/**
 * Copy prices modal — copies all of another salesperson's prices for the
 * active brand onto the currently selected salesperson.
 */
export default function CopyPricesModal({
  show,
  salespeople,
  selectedSpId,
  activeBrandId,
  brands,
  copyFromSpId,
  setCopyFromSpId,
  copyPricesSearch,
  setCopyPricesSearch,
  copyingPrices,
  onClose,
  onCopy,
}) {
  if (!show) return null;

  const candidates = salespeople
    .filter(sp => String(sp.id) !== String(selectedSpId))
    .filter(sp => {
      const q = copyPricesSearch.toLowerCase();
      return !q || sp.name.toLowerCase().includes(q) || (sp.route?.toLowerCase().includes(q));
    });

  return (
    <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="bg-emerald-700 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3 min-w-0">
            <Copy size={18} className="text-emerald-200 flex-shrink-0" />
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Copy Prices</h3>
              <p className="text-[11px] text-emerald-200 mt-0.5">Copy prices from another salesman for this brand</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-600 rounded-lg transition">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Copy from</label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search salespeople…"
                value={copyPricesSearch}
                onChange={e => setCopyPricesSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              />
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
              {candidates.map(sp => (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => {
                    setCopyFromSpId(String(sp.id));
                    setCopyPricesSearch('');
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm border-b border-slate-100 hover:bg-emerald-50 transition ${
                    copyFromSpId === String(sp.id)
                      ? 'bg-emerald-100 border-l-4 border-l-emerald-600'
                      : ''
                  }`}
                >
                  <div className="font-medium text-slate-900">{sp.name}</div>
                  {sp.route && <div className="text-xs text-slate-500">{sp.route}</div>}
                </button>
              ))}
              {candidates.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-slate-400">
                  {copyPricesSearch ? 'No salespeople found' : 'No other salespeople'}
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              All prices for {brands.find(b => b.id === activeBrandId)?.name || 'this brand'} will be copied.
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
              onClick={onCopy}
              disabled={copyingPrices || !copyFromSpId}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
            >
              {copyingPrices ? <TumblerSpinner size={14} /> : <Copy size={14} />}
              {copyingPrices ? 'Copying…' : 'Copy Prices'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
