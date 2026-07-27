import React, { useState, useEffect, useMemo } from 'react';
import { Plus, AlertCircle, Loader2, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import BrandedLoader from '../../components/ui/BrandedLoader';
import api from '../../api/axios';

export default function SalesmanProductsSetup() {
  const { notify } = useNotification();
  const [salesmen, setSalesmen] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedBrand, setExpandedBrand] = useState(null);

  // Selected salesmen and products for bulk update
  const [selectedSalesmen, setSelectedSalesmen] = useState(new Set());
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [action, setAction] = useState('enable'); // 'enable' or 'disable'

  // Fetch all salesmen and get their product settings
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/salesperson-users'),
      api.get('/products?isActive=true'),
    ])
      .then(([spRes, prodRes]) => {
        setSalesmen(spRes.data.data ?? []);
        setProducts(prodRes.data.data ?? []);
      })
      .catch(e => notify(e.response?.data?.error ?? 'Failed to load data', 'error'))
      .finally(() => setLoading(false));
  }, []);

  // Group products by brand
  const groupedProducts = useMemo(() => {
    const grouped = {};
    products.forEach(p => {
      const brandName = p.brand?.name || 'Other';
      if (!grouped[brandName]) {
        grouped[brandName] = { brandId: p.brand?.id, products: [] };
      }
      grouped[brandName].products.push(p);
    });
    return grouped;
  }, [products]);

  // Filter products by search term
  const filteredGroups = useMemo(() => {
    if (!searchTerm) return groupedProducts;
    const filtered = {};
    Object.entries(groupedProducts).forEach(([brand, data]) => {
      const matchedProducts = data.products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (matchedProducts.length > 0) {
        filtered[brand] = { ...data, products: matchedProducts };
      }
    });
    return filtered;
  }, [groupedProducts, searchTerm]);

  const allProductIds = useMemo(
    () => new Set(products.map(p => p.id)),
    [products]
  );

  const toggleSalesman = (spId) => {
    const updated = new Set(selectedSalesmen);
    if (updated.has(spId)) {
      updated.delete(spId);
    } else {
      updated.add(spId);
    }
    setSelectedSalesmen(updated);
  };

  const toggleProduct = (prodId) => {
    const updated = new Set(selectedProducts);
    if (updated.has(prodId)) {
      updated.delete(prodId);
    } else {
      updated.add(prodId);
    }
    setSelectedProducts(updated);
  };

  const toggleSelectAllSalesmen = () => {
    if (selectedSalesmen.size === salesmen.length) {
      setSelectedSalesmen(new Set());
    } else {
      setSelectedSalesmen(new Set(salesmen.map(sp => sp.id)));
    }
  };

  const toggleSelectAllProducts = () => {
    if (selectedProducts.size === allProductIds.size) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(allProductIds));
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedSalesmen.size === 0) {
      notify('Select at least one salesman', 'warning');
      return;
    }
    if (selectedProducts.size === 0) {
      notify('Select at least one product', 'warning');
      return;
    }

    setModalLoading(true);
    try {
      const payload = {
        salespersonIds: Array.from(selectedSalesmen),
        products: Array.from(selectedProducts).map(prodId => ({
          productId: prodId,
          isEnabled: action === 'enable',
        })),
      };

      await api.post('/salesperson-products/bulk-update', payload);
      notify(`Products ${action}d successfully for ${selectedSalesmen.size} salesman(men)`, 'success');

      setShowModal(false);
      setSelectedSalesmen(new Set());
      setSelectedProducts(new Set());
      setAction('enable');
      setSearchTerm('');
    } catch (err) {
      notify(err.response?.data?.error ?? `Failed to ${action} products`, 'error');
    } finally {
      setModalLoading(false);
    }
  };

  if (loading) return <div className="flex-1"><BrandedLoader /></div>;

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800">
        <div className="flex items-center gap-2.5">
          <Plus size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Salesman Product Access</h1>
            <p className="text-emerald-300 text-xs">Enable or disable products for salesmen</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-lg transition"
        >
          Bulk Update
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Salesmen Selection */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-600">
                  Select Salesmen
                </span>
                <button
                  onClick={toggleSelectAllSalesmen}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
                >
                  {selectedSalesmen.size === salesmen.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {salesmen.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-sm">No salesmen available</div>
                ) : (
                  salesmen.map(sp => (
                    <label
                      key={sp.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSalesmen.has(sp.id)}
                        onChange={() => toggleSalesman(sp.id)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 cursor-pointer"
                      />
                      <span className="text-sm font-medium text-slate-700">{sp.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Products Selection */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 space-y-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-600">
                    Select Products
                  </span>
                  <button
                    onClick={toggleSelectAllProducts}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
                  >
                    {selectedProducts.size === allProductIds.size ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {Object.entries(filteredGroups).length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-sm">
                    {searchTerm ? 'No products match your search' : 'No products available'}
                  </div>
                ) : (
                  Object.entries(filteredGroups).map(([brandName, data]) => (
                    <div key={brandName}>
                      <button
                        onClick={() => setExpandedBrand(expandedBrand === brandName ? null : brandName)}
                        className="w-full px-4 py-2 bg-slate-100 hover:bg-slate-150 flex items-center justify-between border-b border-slate-200 transition"
                      >
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                          {brandName}
                        </span>
                        {expandedBrand === brandName ? (
                          <ChevronUp size={16} className="text-slate-500" />
                        ) : (
                          <ChevronDown size={16} className="text-slate-500" />
                        )}
                      </button>
                      {expandedBrand === brandName && (
                        <div className="divide-y divide-slate-100">
                          {data.products.map(prod => (
                            <label
                              key={prod.id}
                              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition"
                            >
                              <input
                                type="checkbox"
                                checked={selectedProducts.has(prod.id)}
                                onChange={() => toggleProduct(prod.id)}
                                className="w-4 h-4 rounded border-slate-300 text-emerald-600 cursor-pointer"
                              />
                              <span className="text-sm font-medium text-slate-700">{prod.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">Selected:</span> {selectedSalesmen.size} salesman(men), {selectedProducts.size} product(s)
            </p>
          </div>
        </div>
      </div>

      {/* Bulk Update Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Bulk Update Products</h2>

            {selectedSalesmen.size === 0 || selectedProducts.size === 0 ? (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-sm">
                <AlertCircle size={16} className="flex-shrink-0" />
                <p>Please select at least one salesman and one product</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                      Action
                    </label>
                    <select
                      value={action}
                      onChange={e => setAction(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="enable">Enable for selected salesmen</option>
                      <option value="disable">Disable for selected salesmen</option>
                    </select>
                  </div>

                  <div className="pt-2 space-y-2">
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold">Salesmen:</span> {selectedSalesmen.size}
                    </p>
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold">Products:</span> {selectedProducts.size}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-4 flex gap-3">
                  <button
                    onClick={() => setShowModal(false)}
                    disabled={modalLoading}
                    className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkUpdate}
                    disabled={modalLoading}
                    className="flex-1 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {modalLoading && <Loader2 size={16} className="animate-spin" />}
                    {modalLoading ? 'Updating...' : 'Confirm Update'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
