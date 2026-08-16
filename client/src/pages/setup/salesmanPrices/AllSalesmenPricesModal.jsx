import { Eye, X } from 'lucide-react';

/**
 * View-all-salesmen-prices modal — read-only matrix of every active
 * salesperson's price for every product in the active brand, grouped by
 * category.
 */
export default function AllSalesmenPricesModal({ show, salespeople, productView, onClose }) {
  if (!show) return null;

  const activeSp = salespeople.filter(s => s.isActive);

  const rows = [];
  let lastCat = null;
  for (const product of productView) {
    const cat = product.category || 'Uncategorised';
    if (cat !== lastCat) {
      rows.push(
        <tr key={`cat-${cat}`} className="bg-slate-100 border-l-4 border-emerald-500">
          <td className="px-6 py-2 text-left text-xs font-bold text-slate-600 uppercase tracking-widest sticky left-0 z-10 bg-slate-100 min-w-[180px]">
            {cat}
          </td>
          <td colSpan={activeSp.length} className="bg-slate-100" />
        </tr>
      );
      lastCat = cat;
    }
    rows.push(
      <tr key={product.productId} className="hover:bg-slate-50 group">
        <td className="px-6 py-3 align-middle min-w-[180px] sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200">
          <p className="text-sm font-semibold text-slate-800">{product.productName}</p>
        </td>
        {activeSp.map(sp => {
          const priceInfo = product.salespersonPrices[sp.id];
          return (
            <td key={sp.id} className="px-3 py-3 text-center align-middle">
              {priceInfo ? (
                <div className="flex flex-col items-center gap-1">
                  <span className={`text-xs font-semibold tabular-nums ${priceInfo.isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                    {priceInfo.sellingPrice != null ? `₹${Number(priceInfo.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Not set'}
                  </span>
                  {!priceInfo.isEnabled && <span className="text-[9px] bg-slate-200 text-slate-500 px-1 py-0.5 rounded">disabled</span>}
                </div>
              ) : (
                <span className="text-xs text-slate-300">—</span>
              )}
            </td>
          );
        })}
      </tr>
    );
  }

  return (
    <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-emerald-700 px-5 py-4 flex items-center justify-between rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Eye size={18} className="text-emerald-200 flex-shrink-0" />
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Salesperson Price List</h3>
              <p className="text-[11px] text-emerald-200 mt-0.5">View all salespeople's prices for each product</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-600 rounded-lg transition">
            <X size={16} />
          </button>
        </div>

        {/* Single overflow-auto container — both axes in one scroller so sticky thead/col work */}
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-cyan-700 sticky top-0 z-20">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider min-w-[180px] sticky left-0 z-30 bg-cyan-700 border-r border-cyan-600">Product</th>
                {activeSp.map(sp => (
                  <th key={sp.id} className="px-3 py-3 text-center text-xs font-bold text-emerald-200 uppercase tracking-wider whitespace-nowrap">
                    {sp.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {productView.length === 0 ? (
                <tr>
                  <td colSpan={activeSp.length + 1} className="py-12 text-center text-slate-400 text-sm">
                    No products for this brand
                  </td>
                </tr>
              ) : rows}
            </tbody>
          </table>
        </div>
        {/* Close button — pinned at bottom, never scrolls */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-slate-100">
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
