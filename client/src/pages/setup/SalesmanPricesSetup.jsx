import React, { useState, useEffect, useMemo } from 'react';
import { Save, Loader2, IndianRupee, Search, X } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import Pagination from '../../components/Pagination';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate } from '../../utils/dateUtils';
import api from '../../api/axios';

const ITEMS_PER_PAGE = 10;

export default function SalesmanPricesSetup() {
  const { notify } = useNotification();
  const [salespeople, setSalespeople]     = useState([]);
  const [selectedSpId, setSelectedSpId]   = useState('');
  const [brands, setBrands]               = useState([]);
  const [activeBrandId, setActiveBrandId] = useState(null);
  const [prices, setPrices]               = useState([]);
  const [editedPrices, setEditedPrices]   = useState({});
  const [effectiveFrom, setEffectiveFrom] = useState(getIndiaDate());
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
    fetchPrices();
    setSearch('');
    setCurrentPage(1);
  }, [selectedSpId]);

  useEffect(() => {
    setSearch('');
    setCurrentPage(1);
  }, [activeBrandId]);

  useEffect(() => { setCurrentPage(1); }, [search]);

  async function fetchPrices() {
    setLoading(true);
    try {
      const r = await api.get(`/salespeople/${selectedSpId}/prices`);
      setPrices(r.data.data);
      setEditedPrices({});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to load prices', 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async () => {
    const filteredPrices = prices.filter(p => p.brandId === activeBrandId);
    const pricesToSave = filteredPrices
      .filter(p => editedPrices[p.productId] !== undefined)
      .map(p => ({ productId: p.productId, sellingPrice: parseFloat(editedPrices[p.productId]) || 0 }));

    if (!pricesToSave.length) { notify('No changes to save', 'warning'); return; }
    setSaving(true);
    try {
      await api.post(`/salespeople/${selectedSpId}/prices/bulk`, { effectiveFrom, prices: pricesToSave });
      notify('Prices saved', 'success');
      fetchPrices();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to save prices', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Filter + category-aware pagination ────────────────────────────────────────
  const filteredGrouped = useMemo(() => {
    const brandItems = prices.filter(p => p.brandId === activeBrandId);
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
  }, [prices, activeBrandId, search]);

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

  const hasDirty   = prices.filter(p => p.brandId === activeBrandId).some(p => editedPrices[p.productId] !== undefined);
  const selectedSp = salespeople.find(s => String(s.id) === String(selectedSpId));

  return (
    <div className="flex flex-col h-full">

      {saving && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Saving prices…</p>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <IndianRupee size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Selling Prices</h1>
            <p className="text-emerald-300 text-xs">Set selling prices per salesperson and brand</p>
          </div>
        </div>
        {selectedSp && (
          <button
            onClick={handleSave}
            disabled={saving || !hasDirty}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition flex-shrink-0"
          >
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            Save Prices
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-5">

          {/* Controls bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Salesperson</label>
              <select
                value={selectedSpId}
                onChange={e => { setSelectedSpId(e.target.value); setEditedPrices({}); }}
                className="w-full ddm-input"
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
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Effective From</label>
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={e => setEffectiveFrom(e.target.value)}
                  max={getIndiaDate()}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                />
              </div>
            )}
          </div>

          {selectedSp && (
            <>
              {brands.length > 0 && (
                <BrandTabs
                  brands={brands}
                  activeBrandId={activeBrandId}
                  onChange={id => { setActiveBrandId(id); setEditedPrices({}); }}
                />
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
                        <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase tracking-wider min-w-[9rem]">Current Price</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase tracking-wider min-w-[9rem]">New Price</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={3} className="py-16 text-center">
                            <Loader2 className="w-5 h-5 text-emerald-600 animate-spin mx-auto" />
                          </td>
                        </tr>
                      ) : pageGroups.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-12 text-center text-slate-400 text-sm">
                            {search ? 'No products match your search.' : 'No products for this brand'}
                          </td>
                        </tr>
                      ) : (
                        pageGroups.map(([category, items]) => (
                          <React.Fragment key={category}>
                            <tr className="bg-slate-100 border-l-4 border-emerald-500">
                              <td colSpan={3} className="px-6 py-2 text-xs font-bold text-slate-600 uppercase tracking-widest">
                                {category}
                              </td>
                            </tr>
                            {items.map(p => {
                              const hasPrice = p.sellingPrice !== null;
                              const isDirty  = editedPrices[p.productId] !== undefined;
                              return (
                                <tr
                                  key={p.productId}
                                  className={`transition-colors ${
                                    !hasPrice ? 'bg-amber-50/60' : isDirty ? 'bg-emerald-50/40' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold text-slate-800">{p.productName}</span>
                                      {!hasPrice && (
                                        <span className="badge-amber text-[10px]">No price</span>
                                      )}
                                      {!p.isEnabled && (
                                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">hidden</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-right text-sm tabular-nums text-slate-500">
                                    {hasPrice
                                      ? `₹${Number(p.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                                      : <span className="text-amber-600 font-semibold text-xs">Not set</span>
                                    }
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end">
                                      <div className="relative w-28">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                                        <input
                                          type="number"
                                          step="0.0001"
                                          min="0"
                                          value={editedPrices[p.productId] ?? ''}
                                          onChange={e => setEditedPrices(prev => ({ ...prev, [p.productId]: e.target.value }))}
                                          placeholder={p.sellingPrice ?? '0.00'}
                                          className={`w-full pl-6 pr-2 py-2 border rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white tabular-nums ${
                                            isDirty ? 'border-emerald-400' : 'border-slate-200'
                                          }`}
                                        />
                                      </div>
                                    </div>
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
              Select a salesperson above to manage their selling prices
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
