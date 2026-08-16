import { Package, Loader2 } from 'lucide-react';

/**
 * Bulk enable/disable products modal — flips the per-salesperson access
 * flag for a chosen set of products across a chosen set of salespeople.
 */
export default function BulkProductAccessModal({
  show,
  salespeople,
  globalProducts,
  activeBrandId,
  bulkProductForm,
  setBulkProductForm,
  bulkProductSearch,
  setBulkProductSearch,
  updatingBulkProducts,
  onClose,
  onSubmit,
}) {
  if (!show) return null;

  const q = bulkProductSearch.toLowerCase();
  // Filter to only show products from the selected brand
  const brandProducts = globalProducts.filter(p => p.brandId === activeBrandId);
  const filteredProducts = (q ? brandProducts.filter(p => p.productName.toLowerCase().includes(q)) : brandProducts)
    .sort((a, b) =>
      (a.categoryDisplayOrder ?? 999) - (b.categoryDisplayOrder ?? 999) ||
      (a.displayOrder ?? 999) - (b.displayOrder ?? 999) ||
      a.productName.localeCompare(b.productName)
    );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-4 max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Package size={20} className="text-emerald-600" />
          Bulk Enable/Disable Products
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Salesmen Selection */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-600">
                Select Salesmen ({bulkProductForm.selectedSalesmen.size})
              </span>
              <button
                onClick={() => {
                  if (bulkProductForm.selectedSalesmen.size === salespeople.length) {
                    setBulkProductForm(f => ({ ...f, selectedSalesmen: new Set() }));
                  } else {
                    setBulkProductForm(f => ({ ...f, selectedSalesmen: new Set(salespeople.map(sp => sp.id)) }));
                  }
                }}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
              >
                {bulkProductForm.selectedSalesmen.size === salespeople.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {salespeople.length === 0 ? (
                <p className="text-sm text-slate-400">No salesmen available</p>
              ) : (
                salespeople.map(sp => (
                  <label key={sp.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded">
                    <input
                      type="checkbox"
                      checked={bulkProductForm.selectedSalesmen.has(sp.id)}
                      onChange={() => {
                        const updated = new Set(bulkProductForm.selectedSalesmen);
                        if (updated.has(sp.id)) {
                          updated.delete(sp.id);
                        } else {
                          updated.add(sp.id);
                        }
                        setBulkProductForm(f => ({ ...f, selectedSalesmen: updated }));
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                    />
                    <span className="text-sm font-medium text-slate-700">{sp.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Products Selection */}
          <div className="bg-slate-50 rounded-lg p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-600">
                Select Products ({bulkProductForm.selectedProducts.size})
              </span>
              <button
                onClick={() => {
                  if (bulkProductForm.selectedProducts.size === globalProducts.length) {
                    setBulkProductForm(f => ({ ...f, selectedProducts: new Set() }));
                  } else {
                    setBulkProductForm(f => ({ ...f, selectedProducts: new Set(globalProducts.map(p => p.productId)) }));
                  }
                }}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
              >
                {bulkProductForm.selectedProducts.size === globalProducts.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <input
              type="text"
              placeholder="Search products..."
              value={bulkProductSearch}
              onChange={e => setBulkProductSearch(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {globalProducts.length === 0 ? (
                <p className="text-sm text-slate-400">No products available</p>
              ) : filteredProducts.length === 0 ? (
                <p className="text-sm text-slate-400">No products found</p>
              ) : (
                <div className="space-y-0.5">
                  {filteredProducts.map(prod => (
                    <label key={prod.productId} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded">
                      <input
                        type="checkbox"
                        checked={bulkProductForm.selectedProducts.has(prod.productId)}
                        onChange={() => {
                          const updated = new Set(bulkProductForm.selectedProducts);
                          if (updated.has(prod.productId)) {
                            updated.delete(prod.productId);
                          } else {
                            updated.add(prod.productId);
                          }
                          setBulkProductForm(f => ({ ...f, selectedProducts: updated }));
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                      />
                      <span className="text-sm text-slate-700">{prod.productName}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Selection */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">
            Action
          </label>
          <select
            value={bulkProductForm.action}
            onChange={e => setBulkProductForm(f => ({ ...f, action: e.target.value }))}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="enable">Enable for selected salesmen</option>
            <option value="disable">Disable for selected salesmen</option>
          </select>
        </div>

        {/* Buttons */}
        <div className="border-t border-slate-200 pt-4 flex gap-3">
          <button
            onClick={onClose}
            disabled={updatingBulkProducts}
            className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={updatingBulkProducts || bulkProductForm.selectedSalesmen.size === 0 || bulkProductForm.selectedProducts.size === 0}
            className="flex-1 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {updatingBulkProducts && <Loader2 size={16} className="animate-spin" />}
            {updatingBulkProducts ? 'Updating...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
