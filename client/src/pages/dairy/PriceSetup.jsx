import React, { useState, useEffect, useMemo } from 'react';
import { Save, Loader2, Info, Search, X } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import Pagination from '../../components/Pagination';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

const ITEMS_PER_PAGE = 10;

export default function DairyPriceSetup() {
  const { notify } = useNotification();
  const [brands, setBrands]       = useState([]);
  const [activeBrandId, setActive] = useState(null);
  const [products, setProducts]   = useState([]);
  const [edits, setEdits]         = useState({});
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(null);
  const [search, setSearch]       = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    api.get('/brands')
      .then(r => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => notify('Failed to load brands', 'error'));
  }, []);

  useEffect(() => {
    if (!activeBrandId) return;
    fetchProducts();
    setSearch('');
    setEdits({});
    setCurrentPage(1);
  }, [activeBrandId]);

  useEffect(() => { setCurrentPage(1); }, [search]);

  async function fetchProducts() {
    setLoading(true);
    try {
      const r = await api.get(`/products?brandId=${activeBrandId}&all=true`);
      setProducts(r.data.data);
      setEdits({});
    } catch {
      notify('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async (product) => {
    if (edits[product.id] === undefined) return;
    setSaving(product.id);
    try {
      await api.put(`/products/${product.id}`, {
        name:       product.name,
        dairyPrice: parseFloat(edits[product.id]) || 0,
      });
      notify('Price updated', 'success');
      fetchProducts();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Update failed', 'error');
    } finally {
      setSaving(null);
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
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Dairy Price (₹)</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-24">Save</th>
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
                    {/* Category header row */}
                    <tr className="bg-slate-100 border-l-4 border-emerald-500">
                      <td colSpan={4} className="px-6 py-2 text-xs font-bold text-slate-600 uppercase tracking-widest">
                        {category}
                      </td>
                    </tr>
                    {items.map(p => {
                      const isDirty = edits[p.id] !== undefined;
                      return (
                        <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${!p.isActive ? 'opacity-50' : ''}`}>
                          <td className="px-6 py-4 text-sm font-semibold text-slate-800">{p.name}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex px-2.5 py-0.5 text-xs font-semibold rounded-full ${p.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                              {p.isActive ? 'Active' : 'Archived'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end">
                              <div className="relative w-32">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                                <input
                                  type="number" step="0.01" min="0"
                                  disabled={!p.isActive}
                                  value={edits[p.id] ?? Number(p.dairyPrice).toFixed(2)}
                                  onChange={e => setEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                                  className="w-full pl-6 pr-2 py-2 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white disabled:bg-slate-50 disabled:cursor-not-allowed tabular-nums"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {isDirty ? (
                              <button
                                onClick={() => handleSave(p)}
                                disabled={saving === p.id}
                                className="inline-flex items-center gap-1 text-xs bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-lg transition font-semibold disabled:opacity-60"
                              >
                                {saving === p.id ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />}
                                Save
                              </button>
                            ) : (
                              <span className="text-xs text-slate-300 font-medium">Saved</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
