import { IndianRupee, X, Search } from 'lucide-react';
import { TumblerSpinner } from '../../../components/ui/BrandedLoader';
import { getIndiaDate } from '../../../utils/dateUtils';

/**
 * Bulk update prices modal — applies the same selling price to a chosen
 * set of products across a chosen set of salespeople, all effective from
 * one date.
 */
export default function BulkUpdatePricesModal({
  show,
  globalProducts,
  activeBrandId,
  bulkUpdateForm,
  setBulkUpdateForm,
  bulkUpdateProductSearch,
  setBulkUpdateProductSearch,
  bulkUpdateSalesmenSearch,
  setBulkUpdateSalesmenSearch,
  salespeople,
  updatingBulkPrices,
  addProductToUpdate,
  removeProductFromUpdate,
  handleBulkSalesmenToggle,
  onClose,
  onSubmit,
}) {
  if (!show) return null;

  const availableProducts = globalProducts.filter(p => p.brandId === activeBrandId && p.salespersonEnabled)
    .filter(p => !bulkUpdateForm.productPrices.some(pp => String(pp.productId) === String(p.productId)));

  const productSearchQ = bulkUpdateProductSearch.toLowerCase();
  const available = globalProducts
    .filter(p => p.brandId === activeBrandId && p.salespersonEnabled)
    .filter(p => {
      const added = bulkUpdateForm.productPrices.some(pp => String(pp.productId) === String(p.productId));
      return !added && (!productSearchQ || p.productName.toLowerCase().includes(productSearchQ) || (p.category?.toLowerCase().includes(productSearchQ)));
    })
    .sort((a, b) =>
      (a.categoryDisplayOrder ?? 999) - (b.categoryDisplayOrder ?? 999) ||
      (a.displayOrder ?? 999) - (b.displayOrder ?? 999) ||
      a.productName.localeCompare(b.productName)
    );

  const salesmenSearchQ = bulkUpdateSalesmenSearch.toLowerCase();
  const filteredSalesmen = salespeople.filter(sp =>
    !salesmenSearchQ || sp.name.toLowerCase().includes(salesmenSearchQ) || (sp.route?.toLowerCase().includes(salesmenSearchQ))
  );

  const closeModal = () => {
    onClose();
    setBulkUpdateProductSearch('');
    setBulkUpdateSalesmenSearch('');
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeModal}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-emerald-700 px-5 py-4 flex items-center justify-between rounded-t-2xl sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <IndianRupee size={18} className="text-emerald-200 flex-shrink-0" />
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Bulk Update Prices</h3>
              <p className="text-[11px] text-emerald-200 mt-0.5">Apply the same price to multiple salespeople</p>
            </div>
          </div>
          <button onClick={closeModal} className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-600 rounded-lg transition">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Product Selection and Addition */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Add Products</label>
              {availableProducts.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    for (const p of availableProducts) {
                      addProductToUpdate(String(p.productId));
                    }
                  }}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
                >
                  Select All
                </button>
              )}
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search products to add…"
                value={bulkUpdateProductSearch}
                onChange={e => setBulkUpdateProductSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              />
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
              {available.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-slate-400">
                  {bulkUpdateProductSearch ? 'No products found' : 'No enabled products or all added'}
                </div>
              ) : (
                available.map(p => (
                  <button
                    key={p.productId}
                    type="button"
                    onClick={() => addProductToUpdate(String(p.productId))}
                    className="w-full text-left px-3 py-2.5 text-sm border-b border-slate-100 hover:bg-emerald-50 transition"
                  >
                    <div className="font-medium text-slate-900">{p.productName}</div>
                    {p.category && <div className="text-xs text-slate-500 uppercase tracking-wide">{p.category}</div>}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Products Table */}
          {bulkUpdateForm.productPrices.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Selected Products ({bulkUpdateForm.productPrices.length})
              </label>
              <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Product</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">Dairy Cost</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">Dairy Selling</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-emerald-600 whitespace-nowrap">Salesman Price (₹)</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-10 whitespace-nowrap">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkUpdateForm.productPrices.map((p, idx) => {
                      const salespersonVal = parseFloat(p.salespersonSellingPrice);
                      const salespersonInvalid = p.salespersonSellingPrice !== '' && !(salespersonVal >= 0);
                      return (
                        <tr key={idx} className={salespersonInvalid ? 'bg-red-50/50' : ''}>
                          <td className="px-3 py-2.5 min-w-max">
                            <div className="font-medium text-slate-700">{p.productName}</div>
                            {p.category && <div className="text-xs text-slate-500">{p.category}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums text-xs whitespace-nowrap">
                            ₹{Number(p.dairyCostPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums text-xs whitespace-nowrap">
                            ₹{Number(p.dairySellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2.5 min-w-fit">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                              <input
                                type="number"
                                step="0.0001"
                                min="0"
                                value={p.salespersonSellingPrice}
                                onChange={e => {
                                  const updated = [...bulkUpdateForm.productPrices];
                                  updated[idx].salespersonSellingPrice = e.target.value;
                                  setBulkUpdateForm(prev => ({ ...prev, productPrices: updated }));
                                }}
                                placeholder="0.00"
                                className={`w-28 pl-6 pr-2 py-1.5 text-xs text-right font-semibold tabular-nums border rounded focus:outline-none focus:ring-2 focus:border-transparent ${
                                  salespersonInvalid
                                    ? 'border-red-300 bg-red-50 focus:ring-red-400'
                                    : 'border-slate-200 focus:ring-emerald-400'
                                }`}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeProductFromUpdate(idx)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                              title="Remove"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Effective From */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Prices From
            </label>
            <input
              type="date"
              value={bulkUpdateForm.effectiveFrom}
              onChange={e => setBulkUpdateForm(f => ({ ...f, effectiveFrom: e.target.value }))}
              min={getIndiaDate()}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Pick today to make it the current price, or a future date to schedule the change.
            </p>
          </div>

          {/* Salesmen Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Apply to Salespeople ({bulkUpdateForm.selectedSalesmen.size} selected)
              </label>
              {salespeople.length > 0 && (
                <div className="flex items-center gap-2">
                  {bulkUpdateForm.selectedSalesmen.size === salespeople.length ? (
                    <button
                      type="button"
                      onClick={() => setBulkUpdateForm(f => ({ ...f, selectedSalesmen: new Set() }))}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition"
                    >
                      Deselect All
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setBulkUpdateForm(f => ({ ...f, selectedSalesmen: new Set(salespeople.map(sp => sp.id)) }))}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
                    >
                      Select All
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search salespeople…"
                value={bulkUpdateSalesmenSearch}
                onChange={e => setBulkUpdateSalesmenSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              />
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-64 overflow-y-auto space-y-2">
              {filteredSalesmen.length === 0 ? (
                <p className="text-xs text-slate-400">No salespeople found</p>
              ) : (
                filteredSalesmen.map(sp => (
                  <label key={sp.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 rounded transition">
                    <input
                      type="checkbox"
                      checked={bulkUpdateForm.selectedSalesmen.has(sp.id)}
                      onChange={() => handleBulkSalesmenToggle(sp.id)}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate">{sp.name}</div>
                      {sp.route && <div className="text-xs text-slate-500 truncate">{sp.route}</div>}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={updatingBulkPrices || bulkUpdateForm.selectedSalesmen.size === 0 || bulkUpdateForm.productPrices.length === 0}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
            >
              {updatingBulkPrices ? <TumblerSpinner size={14} /> : <IndianRupee size={14} />}
              {updatingBulkPrices ? 'Updating…' : `Update (${bulkUpdateForm.selectedSalesmen.size} salesmen, ${bulkUpdateForm.productPrices.length} products)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
