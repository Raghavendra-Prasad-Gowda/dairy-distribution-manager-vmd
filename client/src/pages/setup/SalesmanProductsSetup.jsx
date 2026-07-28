import React, { useState, useEffect, useMemo } from 'react';
import { Package, AlertCircle, Loader2, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import BrandedLoader from '../../components/ui/BrandedLoader';
import api from '../../api/axios';

export default function SalesmanProductsSetup() {
  const { notify } = useNotification();
  const [salesmen, setSalesmen] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedBrand, setExpandedBrand] = useState(null);

  // Bulk modal state
  const [selectedSalesmen, setSelectedSalesmen] = useState(new Set());
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [bulkAction, setBulkAction] = useState('enable');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/salespeople?all=true'),
      api.get('/products?isActive=true'),
    ])
      .then(([spRes, prodRes]) => {
        setSalesmen(spRes.data.data.filter(s => s.isActive) ?? []);
        setProducts(prodRes.data.data ?? []);
      })
      .catch(() => notify('Failed to load data', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const groupedProducts = useMemo(() => {
    const q = searchTerm.toLowerCase();
    const filtered = q
      ? products.filter(p => p.name.toLowerCase().includes(q))
      : products;

    const grouped = {};
    filtered.forEach(p => {
      const brand = p.brand?.name || 'Other';
      if (!grouped[brand]) grouped[brand] = [];
      grouped[brand].push(p);
    });
    return grouped;
  }, [products, searchTerm]);

  const allProductIds = useMemo(() => new Set(products.map(p => p.id)), [products]);

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

    setBulkLoading(true);
    try {
      await api.post('/salesperson-products/bulk-update', {
        salespersonIds: Array.from(selectedSalesmen),
        products: Array.from(selectedProducts).map(prodId => ({
          productId: prodId,
          isEnabled: bulkAction === 'enable',
        })),
      });

      notify(`Products ${bulkAction}d for ${selectedSalesmen.size} salesman(men)`, 'success');
      setShowBulkModal(false);
      setSelectedSalesmen(new Set());
      setSelectedProducts(new Set());
      setSearchTerm('');
    } catch (err) {
      notify(err.response?.data?.error ?? `Failed to ${bulkAction} products`, 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  if (loading) return <div className="flex-1"><BrandedLoader /></div>;

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800">
        <div className="flex items-center gap-2.5">
          <Package size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Product Access</h1>
            <p className="text-emerald-300 text-xs">Enable or disable products for salesmen</p>
          </div>
        </div>
        <button
          onClick={() => setShowBulkModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-lg transition"
        >
          Bulk Enable/Disable
        </button>
      </div>

      {/* Info box */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex-shrink-0">
        <p className="text-sm text-slate-600">
          Use the <span className="font-semibold">Bulk Enable/Disable</span> button above to manage product access for multiple salesmen at once.
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto flex items-center justify-center">
        <div className="text-center text-slate-400 py-8">
          <Package size={40} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">Ready to manage products</p>
          <p className="text-xs mt-1">Click the button above to enable/disable products for multiple salesmen</p>
        </div>
      </div>

      {/* Bulk Enable/Disable Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900">Bulk Enable/Disable Products</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Salesmen Selection */}
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-600">
                    Select Salesmen ({selectedSalesmen.size})
                  </span>
                  <button
                    onClick={toggleSelectAllSalesmen}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    {selectedSalesmen.size === salesmen.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {salesmen.length === 0 ? (
                    <p className="text-sm text-slate-400">No salesmen available</p>
                  ) : (
                    salesmen.map(sp => (
                      <label key={sp.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded">
                        <input
                          type="checkbox"
                          checked={selectedSalesmen.has(sp.id)}
                          onChange={() => toggleSalesman(sp.id)}
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
                    Select Products ({selectedProducts.size})
                  </span>
                  <button
                    onClick={toggleSelectAllProducts}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    {selectedProducts.size === allProductIds.size ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                  {Object.entries(groupedProducts).length === 0 ? (
                    <p className="text-sm text-slate-400">No products available</p>
                  ) : (
                    Object.entries(groupedProducts).map(([brand, prods]) => (
                      <div key={brand}>
                        <button
                          onClick={() => setExpandedBrand(expandedBrand === brand ? null : brand)}
                          className="w-full px-3 py-1.5 text-left text-xs font-semibold text-slate-600 hover:bg-white rounded transition"
                        >
                          <div className="flex items-center justify-between">
                            <span>{brand}</span>
                            {expandedBrand === brand ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>
                        </button>
                        {expandedBrand === brand && (
                          <div className="space-y-0.5 pl-2">
                            {prods.map(prod => (
                              <label key={prod.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1.5 rounded">
                                <input
                                  type="checkbox"
                                  checked={selectedProducts.has(prod.id)}
                                  onChange={() => toggleProduct(prod.id)}
                                  className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                                />
                                <span className="text-sm text-slate-700">{prod.name}</span>
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

            {/* Action Selection */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">
                Action
              </label>
              <select
                value={bulkAction}
                onChange={e => setBulkAction(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="enable">Enable for selected salesmen</option>
                <option value="disable">Disable for selected salesmen</option>
              </select>
            </div>

            {/* Buttons */}
            <div className="border-t border-slate-200 pt-4 flex gap-3">
              <button
                onClick={() => setShowBulkModal(false)}
                disabled={bulkLoading}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkUpdate}
                disabled={bulkLoading || selectedSalesmen.size === 0 || selectedProducts.size === 0}
                className="flex-1 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {bulkLoading && <Loader2 size={16} className="animate-spin" />}
                {bulkLoading ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
