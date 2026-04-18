import React, { useState, useEffect, useMemo } from 'react';
import { Edit2, Trash2, Info, Search, Loader2, X } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import Pagination from '../../components/Pagination';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

const ITEMS_PER_PAGE = 10;

export default function DairyPriceSetup() {
  const { notify } = useNotification();
  const [brands, setBrands]       = useState([]);
  const [activeBrandId, setActive] = useState(null);
  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch]       = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [priceForm, setPriceForm] = useState('');
  const [confirmation, setConfirmation] = useState({ isOpen: false });

  useEffect(() => {
    api.get('/brands')
      .then(r => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => notify('Failed to load brands', 'error'));
  }, []);

  useEffect(() => {
    if (!activeBrandId) return;
    fetchProducts();
    setSearch('');
    setCurrentPage(1);
  }, [activeBrandId]);

  useEffect(() => { setCurrentPage(1); }, [search]);

  async function fetchProducts() {
    setLoading(true);
    try {
      const r = await api.get(`/products?brandId=${activeBrandId}`);
      setProducts(r.data.data);
    } catch {
      notify('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }

  const openEdit = (p) => {
    setEditingProduct(p);
    setPriceForm(Number(p.dairyPrice).toFixed(2));
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingProduct(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.put(`/products/${editingProduct.id}`, {
        name:       editingProduct.name,
        dairyPrice: parseFloat(priceForm) || 0,
      });
      notify('Price updated', 'success');
      closeModal();
      fetchProducts();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Update failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (p) => {
    setConfirmation({
      isOpen: true,
      title: 'Delete Product',
      message: `Delete "${p.name}"? It will be removed from daily operations but historical data is kept.`,
      action: () => archiveProduct(p),
      isDanger: true,
    });
  };

  const archiveProduct = async (p) => {
    setSubmitting(true);
    try {
      await api.put(`/products/${p.id}`, { isActive: false });
      notify('Product deleted', 'success');
      fetchProducts();
    } catch {
      notify('Failed to delete', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filter + category-aware pagination ────────────────────────────────────────
  const filteredGrouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? products.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q)
        )
      : products;

    const grouped = filtered.reduce((acc, p) => {
      const key = p.category || 'Uncategorised';
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});

    return Object.entries(grouped);
  }, [products, search]);

  const totalFiltered = filteredGrouped.reduce((s, [, arr]) => s + arr.length, 0);

  const pages = useMemo(() => {
    const result = [];
    let page = [];
    let count = 0;
    filteredGrouped.forEach(([cat, items]) => {
      if (count + items.length > ITEMS_PER_PAGE && count > 0) {
        result.push(page); page = []; count = 0;
      }
      page.push([cat, items]);
      count += items.length;
    });
    if (page.length) result.push(page);
    return result;
  }, [filteredGrouped]);

  const totalPages = Math.max(1, pages.length);
  const pageGroups = pages[currentPage - 1] ?? [];
  const startIdx   = pages.slice(0, currentPage - 1).reduce((s, p) => s + p.reduce((a, [, it]) => a + it.length, 0), 0);
  const endIdx     = startIdx + pageGroups.reduce((s, [, it]) => s + it.length, 0);

  const activeBrand = brands.find(b => b.id === activeBrandId);

  return (
    <div className="p-5 md:p-8 max-w-3xl mx-auto space-y-5">

      {submitting && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Processing…</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Price Setup</h1>
        <p className="text-slate-400 text-sm mt-0.5">Set dairy purchase prices per product per brand</p>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>
          <strong>Rate Master:</strong> Prices set here are used automatically when recording stock receipts.
          Changes apply to future receipts only.
        </span>
      </div>

      {brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={id => setActive(id)} />
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <Pagination
        currentPage={currentPage} totalPages={totalPages}
        startIndex={startIdx} endIndex={endIdx} total={totalFiltered}
        onPageChange={setCurrentPage}
      />

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-emerald-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Dairy Price (₹)</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : pageGroups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-14 text-center text-slate-400 text-sm">
                    {search
                      ? 'No products match your search.'
                      : `No products yet for ${activeBrand?.name}. Add them in Product Setup.`}
                  </td>
                </tr>
              ) : (
                pageGroups.map(([category, items]) => (
                  <React.Fragment key={category}>
                    <tr className="bg-slate-100 border-l-4 border-emerald-500">
                      <td colSpan={4} className="px-6 py-2 text-xs font-bold text-slate-600 uppercase tracking-widest">
                        {category}
                      </td>
                    </tr>
                    {items.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-semibold text-slate-800">{p.name}</td>
                        <td className="px-6 py-4 text-sm text-slate-500 text-center">{p.category || '—'}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-800 text-right tabular-nums">
                          ₹{Number(p.dairyPrice).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-3">
                            <button onClick={() => openEdit(p)} className="text-emerald-600 hover:text-emerald-800 transition-colors" title="Edit Price">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => confirmDelete(p)} className="text-red-500 hover:text-red-700 transition-colors" title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Price Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" style={{ animation: 'popIn 0.2s ease' }}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Edit Price</h3>
              <button onClick={closeModal} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Product</label>
                <p className="text-sm font-semibold text-slate-800">{editingProduct?.name}</p>
                {editingProduct?.category && (
                  <p className="text-xs text-slate-400 mt-0.5">{editingProduct.category}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Dairy Price (₹) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                  <input
                    autoFocus
                    type="number" step="0.01" min="0" required
                    value={priceForm}
                    onChange={e => setPriceForm(e.target.value)}
                    placeholder="0.00"
                    className="ddm-input pl-7 text-right tabular-nums"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl transition">Cancel</button>
                <button type="submit" disabled={submitting} className="ddm-btn-primary flex-1">
                  Save Price
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmation.isOpen}
        onClose={() => setConfirmation({ ...confirmation, isOpen: false })}
        onConfirm={confirmation.action}
        title={confirmation.title}
        message={confirmation.message}
        isDanger={confirmation.isDanger}
        confirmText="Delete"
      />
    </div>
  );
}
