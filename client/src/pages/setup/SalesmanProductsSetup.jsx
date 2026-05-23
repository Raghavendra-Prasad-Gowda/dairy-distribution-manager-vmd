import React, { useState, useEffect, useMemo } from 'react';
import { Save, Loader2, ToggleLeft, ToggleRight, Tag, Search, X } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import Pagination from '../../components/Pagination';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

const ITEMS_PER_PAGE = 10;

export default function SalesmanProductsSetup() {
  const { notify } = useNotification();
  const [salespeople, setSalespeople]     = useState([]);
  const [selectedSpId, setSelectedSpId]   = useState('');
  const [brands, setBrands]               = useState([]);
  const [activeBrandId, setActiveBrandId] = useState(null);
  const [spProducts, setSpProducts]       = useState([]);
  const [dirtyProducts, setDirtyProducts] = useState({});
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [search, setSearch]               = useState('');
  const [currentPage, setCurrentPage]     = useState(1);

  useEffect(() => {
    Promise.all([api.get('/salespeople?all=true'), api.get('/brands')])
      .then(([spRes, brandRes]) => {
        setSalespeople(spRes.data.data.filter(s => s.isActive));
        const b = brandRes.data.data;
        setBrands(b);
        if (b.length) setActiveBrandId(b[0].id);
      })
      .catch(() => notify('Failed to load data', 'error'));
  }, []);

  useEffect(() => {
    if (!selectedSpId) return;
    fetchProducts();
    setSearch('');
    setCurrentPage(1);
  }, [selectedSpId]);

  useEffect(() => {
    setSearch('');
    setCurrentPage(1);
  }, [activeBrandId]);

  useEffect(() => { setCurrentPage(1); }, [search]);

  async function fetchProducts() {
    setLoading(true);
    try {
      const r = await api.get(`/salespeople/${selectedSpId}/products`);
      setSpProducts(r.data.data);
      setDirtyProducts({});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleToggle = (productId, currentEnabled) => {
    const newValue = !currentEnabled;
    setDirtyProducts(prev => ({ ...prev, [productId]: newValue }));
    setSpProducts(prev => prev.map(p => p.productId === productId ? { ...p, isEnabled: newValue } : p));
  };

  const handleSave = async () => {
    const changed = Object.keys(dirtyProducts);
    if (!changed.length) { notify('No changes to save', 'warning'); return; }
    setSaving(true);
    try {
      const products = changed.map(id => ({ productId: parseInt(id, 10), isEnabled: dirtyProducts[id] }));
      await api.post(`/salespeople/${selectedSpId}/products/bulk`, { products });
      notify('Product access updated', 'success');
      setDirtyProducts({});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Filter + category-aware pagination ────────────────────────────────────────
  const filteredGrouped = useMemo(() => {
    const brandItems = spProducts.filter(p => p.brandId === activeBrandId);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? brandItems.filter(p =>
          p.productName.toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q)
        )
      : brandItems;

    const grouped = filtered.reduce((acc, p) => {
      const key = p.category || 'Uncategorised';
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});

    return Object.entries(grouped);
  }, [spProducts, activeBrandId, search]);

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

  const hasDirty   = Object.keys(dirtyProducts).length > 0;
  const selectedSp = salespeople.find(s => String(s.id) === String(selectedSpId));

  return (
    <div className="flex flex-col h-full">

      <LoadingOverlay open={saving} message="Saving product access…" />

      {/* Page header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Tag size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Salesman Layout</h1>
            <p className="text-emerald-300 text-xs">Enable or disable which products each salesperson sees in their stock entry</p>
          </div>
        </div>
        {selectedSp && (
          <button
            onClick={handleSave}
            disabled={saving || !hasDirty}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition flex-shrink-0"
          >
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            Save Access
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-5">

          {/* Controls bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Salesperson</label>
            <select
              value={selectedSpId}
              onChange={e => { setSelectedSpId(e.target.value); setDirtyProducts({}); }}
              className="w-full max-w-xs ddm-input"
            >
              <option value="">Select salesperson…</option>
              {salespeople.map(sp => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}{sp.route ? ` — ${sp.route}` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedSp && (
            <>
              {brands.length > 0 && (
                <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={id => setActiveBrandId(id)} />
              )}

              {/* Search */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by product name or category…"
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

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-emerald-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-40">Access</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {loading ? (
                        <tr><td colSpan={2}><BrandedLoader size="sm" hideBrand inlinePadY="py-12" /></td></tr>
                      ) : pageGroups.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="py-12 text-center text-slate-400 text-sm">
                            {search ? 'No products match your search.' : 'No products for this brand'}
                          </td>
                        </tr>
                      ) : (
                        pageGroups.map(([category, items]) => (
                          <React.Fragment key={category}>
                            <tr className="bg-slate-100 border-l-4 border-emerald-500">
                              <td colSpan={2} className="px-6 py-2 text-xs font-bold text-slate-600 uppercase tracking-widest">
                                {category}
                              </td>
                            </tr>
                            {items.map(p => {
                              const isDirty = dirtyProducts[p.productId] !== undefined;
                              return (
                                <tr
                                  key={p.productId}
                                  className={`transition-colors cursor-pointer ${
                                    p.isEnabled
                                      ? isDirty ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                                      : isDirty ? 'bg-slate-50/60' : 'hover:bg-slate-50'
                                  }`}
                                  onClick={() => handleToggle(p.productId, p.isEnabled)}
                                >
                                  <td className="px-6 py-4 align-middle">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-sm font-semibold ${p.isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                        {p.productName}
                                      </span>
                                      {isDirty && (
                                        <span className="text-[10px] text-amber-600 font-bold">unsaved</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-center align-middle whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={e => { e.stopPropagation(); handleToggle(p.productId, p.isEnabled); }}
                                      className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition ${
                                        p.isEnabled
                                          ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                                          : 'bg-white border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-600'
                                      }`}
                                    >
                                      {p.isEnabled ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                                      {p.isEnabled ? 'Enabled' : 'Disabled'}
                                    </button>
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
            </>
          )}

          {!selectedSp && salespeople.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 flex items-center justify-center h-40 text-slate-400 text-sm">
              Select a salesperson above to manage their product access
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
