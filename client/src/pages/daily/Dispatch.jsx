import { useState, useEffect, useRef } from 'react';
import { Loader2, Truck, Info, CheckCircle, Search } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import BrandTabs from '../../components/BrandTabs';
import SaveOverlay from '../../components/SaveOverlay';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import { BRAND_COLORS } from '../../utils/constants';
import api from '../../api/axios';

export default function Dispatch() {
  const { notify } = useNotification();
  const [date, setDate]               = useState(getIndiaDate());
  const [brands, setBrands]           = useState([]);
  const [activeBrandId, setActiveBrand] = useState(null);
  const [salespeople, setSalespeople] = useState([]);
  const [selectedSpId, setSelectedSp] = useState(null);
  const [search, setSearch]           = useState('');
  const [availability, setAvail]      = useState([]);
  const [prices, setPrices]           = useState({});
  const [quantities, setQuantities]   = useState({});
  const [savedSps, setSavedSps]       = useState(new Set());
  const [saving, setSaving]           = useState(false);
  const [saveStatus, setSaveStatus]   = useState(null);
  const inputRefs = useRef({});

  // Load brands + salespeople once
  useEffect(() => {
    Promise.all([api.get('/brands'), api.get('/salespeople')])
      .then(([brandRes, spRes]) => {
        const b = brandRes.data.data;
        setBrands(b);
        if (b.length) setActiveBrand(b[0].id);
        const sps = spRes.data.data;
        setSalespeople(sps);
        if (sps.length) setSelectedSp(sps[0].id);
      })
      .catch(() => notify('Failed to load data', 'error'));
  }, []);

  // Reset saved set when date changes
  useEffect(() => { setSavedSps(new Set()); }, [date]);

  // Reload availability when date changes
  useEffect(() => {
    if (!date) return;
    api.get(`/stock-receipts/availability?date=${date}`)
      .then(r => setAvail(r.data.data))
      .catch(() => notify('Failed to load stock availability', 'error'));
  }, [date]);

  // Load selling prices for selected salesperson
  useEffect(() => {
    if (!selectedSpId) return;
    setPrices({});
    api.get(`/salespeople/${selectedSpId}/prices`)
      .then(r => {
        const map = {};
        r.data.data.forEach(p => { map[p.productId] = p.sellingPrice; });
        setPrices(map);
      })
      .catch(() => notify('Failed to load prices for salesperson', 'error'));
  }, [selectedSpId]);

  // Pre-fill from existing dispatch
  useEffect(() => {
    if (!selectedSpId || !date) return;
    setQuantities({});
    api.get(`/dispatches?salespersonId=${selectedSpId}&date=${date}`)
      .then(r => {
        if (r.data.data.length > 0) {
          const loaded = {};
          r.data.data[0].items.forEach(item => { loaded[item.productId] = String(item.quantity); });
          setQuantities(loaded);
        }
      })
      .catch(() => {});
  }, [selectedSpId, date]);

  const allVisible    = availability.filter(p => p.received > 0 || quantities[p.productId]);
  const activeBrand   = brands.find(b => b.id === activeBrandId);
  const brandProducts = allVisible.filter(p => p.brandName === activeBrand?.name);
  const totalAmount   = allVisible.reduce((s, p) => s + (parseFloat(quantities[p.productId]) || 0) * (prices[p.productId] ?? 0), 0);
  const filledCount   = brandProducts.filter(p => (parseFloat(quantities[p.productId]) || 0) > 0).length;

  const selectedSp = salespeople.find(sp => sp.id === selectedSpId);
  const filteredSps = salespeople.filter(sp =>
    sp.name.toLowerCase().includes(search.toLowerCase()) ||
    (sp.route ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleKeyDown = (e, productId) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      const ids = brandProducts.map(p => p.productId);
      const idx = ids.indexOf(productId);
      if (idx < ids.length - 1) {
        e.preventDefault();
        inputRefs.current[ids[idx + 1]]?.focus();
      }
    }
  };

  const handleSave = async () => {
    const items = allVisible
      .filter(p => quantities[p.productId] && parseFloat(quantities[p.productId]) > 0)
      .map(p => ({ productId: p.productId, quantity: parseFloat(quantities[p.productId]), unitPrice: prices[p.productId] ?? 0 }));

    if (!items.length) { notify('Enter at least one quantity.', 'warning'); return; }

    setSaving(true);
    try {
      await api.post('/dispatches', { salespersonId: Number(selectedSpId), dispatchDate: date, items });
      setSaveStatus('success');
      setSavedSps(prev => new Set([...prev, selectedSpId]));
      // Auto-advance to next pending salesperson
      const pending = salespeople.filter(sp => !savedSps.has(sp.id) && sp.id !== selectedSpId);
      if (pending.length) setSelectedSp(pending[0].id);
    } catch (e) {
      notify(e.response?.data?.error ?? 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <SaveOverlay status={saveStatus} onClose={() => setSaveStatus(null)} successMessage="Dispatch Saved!" />

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 md:px-7 pt-5 pb-4 border-b border-slate-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Stock Dispatch</h1>
          <p className="text-slate-500 text-sm">Allocate stock to salespeople</p>
        </div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      {/* Split panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel — salesperson list */}
        <div className="w-56 md:w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
          {/* Search */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50"
              />
            </div>
          </div>

          {/* Salesperson list */}
          <div className="flex-1 overflow-y-auto">
            {filteredSps.map(sp => {
              const isSelected = sp.id === selectedSpId;
              const isSaved    = savedSps.has(sp.id);
              return (
                <button
                  key={sp.id}
                  onClick={() => { setSelectedSp(sp.id); setQuantities({}); }}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                    isSelected
                      ? 'bg-indigo-50 border-l-4 border-l-indigo-600'
                      : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold flex-1 truncate ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>
                      {sp.name}
                    </span>
                    {isSaved
                      ? <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                      : <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                    }
                  </div>
                  {sp.route && (
                    <p className="text-xs text-slate-400 mt-0.5">{sp.route}</p>
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-100 px-4 py-2 bg-slate-50">
            <p className="text-xs text-slate-500">
              {salespeople.length} total · {savedSps.size} done
            </p>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

          {/* Selected salesperson header bar */}
          {selectedSp ? (
            <div className="px-5 py-2.5 bg-indigo-700 text-white flex items-center gap-3">
              <span className="font-bold text-sm">{selectedSp.name}</span>
              {selectedSp.route && <span className="text-indigo-200 text-xs">· {selectedSp.route}</span>}
              {savedSps.has(selectedSpId) && (
                <span className="ml-auto flex items-center gap-1 text-emerald-300 text-xs font-semibold">
                  <CheckCircle size={13} /> Saved
                </span>
              )}
            </div>
          ) : (
            <div className="px-5 py-2.5 bg-slate-100 text-slate-400 text-sm">
              Select a salesperson from the list
            </div>
          )}

          {selectedSp && (
            <>
              {/* Brand tabs */}
              {brands.length > 0 && (
                <div className="bg-white px-4 pt-2">
                  <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActiveBrand} />
                </div>
              )}

              {/* Product table */}
              <div className="flex-1 overflow-y-auto">
                <div className="bg-white">
                  <div className="flex items-center px-5 py-3 bg-slate-50 border-b border-slate-200 sticky top-0">
                    <div className="flex-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</div>
                    <div className="w-16 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Avail</div>
                    <div className="w-20 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Price</div>
                    <div className="w-28 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</div>
                    <div className="w-24 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</div>
                  </div>

                  {allVisible.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-sm">
                      No stock received for this date yet. Enter Stock Receipt first.
                    </div>
                  ) : brandProducts.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-sm">
                      No {activeBrand?.name} stock received on this date.
                    </div>
                  ) : (
                    brandProducts.map(p => {
                      const qty     = parseFloat(quantities[p.productId]) || 0;
                      const price   = prices[p.productId];
                      const missing = price === undefined || price === null;
                      const over    = qty > p.available;
                      const amount  = qty * (price ?? 0);

                      return (
                        <div
                          key={p.productId}
                          className={`flex items-center px-5 py-3.5 border-b border-slate-100 transition-colors ${
                            missing ? 'bg-amber-50/60' : qty > 0 ? 'bg-indigo-50/30' : 'hover:bg-slate-50/60'
                          }`}
                        >
                          <div className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate">{p.productName}</div>

                          <div className={`w-16 text-right text-sm tabular-nums font-medium ${p.available <= 0 ? 'text-red-500' : 'text-slate-600'}`}>
                            {p.available}
                          </div>

                          <div className="w-20 text-right text-sm tabular-nums text-slate-500">
                            {missing
                              ? <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">No rate</span>
                              : `₹${price}`
                            }
                          </div>

                          <div className="w-28 flex justify-center">
                            <input
                              ref={el => { inputRefs.current[p.productId] = el; }}
                              type="number"
                              value={quantities[p.productId] ?? ''}
                              onChange={e => setQuantities(prev => ({ ...prev, [p.productId]: e.target.value }))}
                              onKeyDown={e => handleKeyDown(e, p.productId)}
                              step="0.5"
                              min="0"
                              disabled={missing || p.available <= 0}
                              placeholder={missing ? '—' : '0'}
                              className={`w-20 text-center px-2 py-2 border rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-100 disabled:cursor-not-allowed tabular-nums ${
                                over ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'
                              }`}
                            />
                          </div>

                          <div className={`w-24 text-right text-sm tabular-nums font-semibold ${qty > 0 ? 'text-indigo-700' : 'text-slate-300'}`}>
                            {qty > 0 ? formatCurrency(amount) : '—'}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-slate-200 bg-white px-5 py-3 flex items-center gap-4">
                <p className="text-xs text-slate-400 flex items-center gap-1.5 flex-1">
                  <Info size={12} />
                  {filledCount > 0 ? `${filledCount} items · ` : ''} Rates from Setup → Salespeople
                </p>
                <div className="text-right">
                  <span className="text-xs text-slate-500 mr-2">Total</span>
                  <span className="text-base font-bold text-indigo-700 tabular-nums">{formatCurrency(totalAmount)}</span>
                </div>
                <button onClick={handleSave} disabled={saving} className="ddm-btn-primary">
                  {saving ? <Loader2 className="animate-spin" size={15} /> : <Truck size={15} />}
                  {saving ? 'Saving…' : `Save ${selectedSp?.name?.split(' ')[0] ?? ''}'s Dispatch`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
