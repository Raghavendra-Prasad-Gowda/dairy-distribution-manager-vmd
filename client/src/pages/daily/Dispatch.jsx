import { useState, useEffect } from 'react';
import { Loader2, Truck, Info } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import BrandTabs from '../../components/BrandTabs';
import SaveOverlay from '../../components/SaveOverlay';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function Dispatch() {
  const { notify } = useNotification();
  const [date, setDate]                 = useState(getIndiaDate());
  const [brands, setBrands]             = useState([]);
  const [activeBrandId, setActiveBrand] = useState(null);
  const [salespeople, setSalespeople]   = useState([]);
  const [selectedSp, setSelectedSp]     = useState('');
  const [availability, setAvail]        = useState([]);
  const [prices, setPrices]             = useState({});
  const [quantities, setQuantities]     = useState({});
  const [saving, setSaving]             = useState(false);
  const [saveStatus, setSaveStatus]     = useState(null);

  // Load brands + salespeople once
  useEffect(() => {
    Promise.all([api.get('/brands'), api.get('/salespeople')])
      .then(([brandRes, spRes]) => {
        const b = brandRes.data.data;
        setBrands(b);
        if (b.length) setActiveBrand(b[0].id);
        setSalespeople(spRes.data.data);
      })
      .catch(() => notify('Failed to load data', 'error'));
  }, []);

  // Reload availability when date changes
  useEffect(() => {
    if (!date) return;
    api.get(`/stock-receipts/availability?date=${date}`)
      .then(r => setAvail(r.data.data))
      .catch(() => notify('Failed to load stock availability', 'error'));
  }, [date]);

  // Load selling prices for selected salesperson
  useEffect(() => {
    if (!selectedSp) return;
    setPrices({});
    api.get(`/salespeople/${selectedSp}/prices`)
      .then(r => {
        const map = {};
        r.data.data.forEach(p => { map[p.productId] = p.sellingPrice; });
        setPrices(map);
      })
      .catch(() => notify('Failed to load prices for salesperson', 'error'));
  }, [selectedSp]);

  // Pre-fill from existing dispatch
  useEffect(() => {
    if (!selectedSp || !date) return;
    setQuantities({});
    api.get(`/dispatches?salespersonId=${selectedSp}&date=${date}`)
      .then(r => {
        if (r.data.data.length > 0) {
          const loaded = {};
          r.data.data[0].items.forEach(item => { loaded[item.productId] = String(item.quantity); });
          setQuantities(loaded);
        }
      })
      .catch(() => {});
  }, [selectedSp, date]);

  // All products with stock (across all brands)
  const allVisible = availability.filter(p => p.received > 0 || quantities[p.productId]);
  // Only products for the active brand tab
  const activeBrand    = brands.find(b => b.id === activeBrandId);
  const brandProducts  = allVisible.filter(p => p.brandName === activeBrand?.name);

  const totalAmount  = allVisible.reduce((s, p) => s + (parseFloat(quantities[p.productId]) || 0) * (prices[p.productId] ?? 0), 0);
  const filledCount  = allVisible.filter(p => (parseFloat(quantities[p.productId]) || 0) > 0).length;

  const handleSave = async () => {
    const items = allVisible
      .filter(p => quantities[p.productId] && parseFloat(quantities[p.productId]) > 0)
      .map(p => ({
        productId: p.productId,
        quantity:  parseFloat(quantities[p.productId]),
        unitPrice: prices[p.productId] ?? 0,
      }));

    if (!items.length) { notify('Enter at least one quantity.', 'warning'); return; }

    setSaving(true);
    try {
      await api.post('/dispatches', { salespersonId: Number(selectedSp), dispatchDate: date, items });
      setSaveStatus('success');
    } catch (e) {
      notify(e.response?.data?.error ?? 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 md:p-8 max-w-2xl mx-auto space-y-6">
      <SaveOverlay status={saveStatus} onClose={() => setSaveStatus(null)} successMessage="Dispatch Saved!" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock Dispatch</h1>
          <p className="text-slate-500 text-sm mt-1">Allocate stock to salespeople</p>
        </div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      {/* Salesperson selector */}
      <div className="ddm-card p-4">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Select Salesperson
        </label>
        <select
          value={selectedSp}
          onChange={e => { setSelectedSp(e.target.value); setQuantities({}); }}
          className="w-full ddm-input"
        >
          <option value="">Choose salesperson…</option>
          {salespeople.map(sp => (
            <option key={sp.id} value={sp.id}>{sp.name}{sp.route ? ` — ${sp.route}` : ''}</option>
          ))}
        </select>
      </div>

      {selectedSp && (
        <>
          {/* Brand tabs */}
          {brands.length > 0 && (
            <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActiveBrand} />
          )}

          {/* Dispatch table */}
          <div className="ddm-card overflow-hidden">
            {/* Header row */}
            <div className="flex items-center px-5 py-3 bg-slate-50 border-b border-slate-200">
              <div className="flex-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</div>
              <div className="w-14 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Avail</div>
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
                No stock received for {activeBrand?.name} on this date.
              </div>
            ) : (
              <>
                {brandProducts.map(p => {
                  const qty     = parseFloat(quantities[p.productId]) || 0;
                  const price   = prices[p.productId];
                  const missing = price === undefined || price === null;
                  const over    = qty > p.available;
                  const amount  = qty * (price ?? 0);

                  return (
                    <div
                      key={p.productId}
                      className={`flex items-center px-5 py-4 border-b border-slate-100 transition-colors ${
                        missing ? 'bg-amber-50/60' : qty > 0 ? 'bg-teal-50/40' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate">{p.productName}</div>

                      <div className={`w-14 text-right text-sm tabular-nums font-medium ${p.available <= 0 ? 'text-red-500' : 'text-slate-600'}`}>
                        {p.available}
                      </div>

                      <div className="w-20 text-right text-sm tabular-nums text-slate-500">
                        {missing
                          ? <span className="text-[11px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">No rate</span>
                          : `₹${price}`
                        }
                      </div>

                      <div className="w-28 flex justify-center">
                        <input
                          type="number"
                          value={quantities[p.productId] ?? ''}
                          onChange={e => setQuantities(prev => ({ ...prev, [p.productId]: e.target.value }))}
                          step="0.5"
                          min="0"
                          disabled={missing || p.available <= 0}
                          placeholder={missing ? '—' : '0'}
                          className={`w-20 text-center px-2 py-2 border rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:cursor-not-allowed tabular-nums ${
                            over ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'
                          }`}
                        />
                      </div>

                      <div className={`w-24 text-right text-sm tabular-nums font-semibold ${qty > 0 ? 'text-teal-700' : 'text-slate-300'}`}>
                        {qty > 0 ? formatCurrency(amount) : '—'}
                      </div>
                    </div>
                  );
                })}

                {/* Footer */}
                <div className="flex items-center px-5 py-4 bg-slate-50 border-t border-slate-200">
                  <div className="flex-1 text-xs text-slate-500">
                    {filledCount > 0 ? `${filledCount} product${filledCount > 1 ? 's' : ''} dispatched across all brands` : 'No quantities entered'}
                  </div>
                  <div className="w-14" />
                  <div className="w-20" />
                  <div className="w-28 text-center text-sm font-bold text-slate-600">Total</div>
                  <div className="w-24 text-right text-base font-bold text-teal-700 tabular-nums">{formatCurrency(totalAmount)}</div>
                </div>
              </>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between gap-4 pb-2">
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <Info size={12} />
              Selling rates set in <span className="font-medium text-slate-600">Setup → Salespeople &amp; Rates</span>
            </p>
            <button onClick={handleSave} disabled={saving} className="ddm-btn-primary">
              {saving ? <Loader2 className="animate-spin" size={15} /> : <Truck size={15} />}
              {saving ? 'Saving…' : 'Save Dispatch'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
