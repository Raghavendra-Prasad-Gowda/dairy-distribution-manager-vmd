import { useState, useEffect } from 'react';
import { Loader2, Truck, Info } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import SaveOverlay from '../../components/SaveOverlay';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function Dispatch() {
  const { notify } = useNotification();
  const [date, setDate]               = useState(getIndiaDate());
  const [salespeople, setSalespeople] = useState([]);
  const [selectedSp, setSelectedSp]   = useState('');
  const [availability, setAvail]      = useState([]);
  const [prices, setPrices]           = useState({});   // { [productId]: sellingPrice }
  const [quantities, setQuantities]   = useState({});   // { [productId]: string }
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saveStatus, setSaveStatus]   = useState(null);

  // Load active salespeople once
  useEffect(() => {
    api.get('/salespeople')
      .then(r => setSalespeople(r.data.data))
      .catch(() => notify('Failed to load salespeople', 'error'));
  }, []);

  // Reload stock availability when date changes
  useEffect(() => {
    if (!date) return;
    api.get(`/stock-receipts/availability?date=${date}`)
      .then(r => setAvail(r.data.data))
      .catch(() => notify('Failed to load stock availability', 'error'));
  }, [date]);

  // Load selling prices for selected salesperson (read-only — set in Setup)
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

  // Pre-fill quantities from any existing dispatch for this salesperson + date
  useEffect(() => {
    if (!selectedSp || !date) return;
    setQuantities({});
    api.get(`/dispatches?salespersonId=${selectedSp}&date=${date}`)
      .then(r => {
        if (r.data.data.length > 0) {
          const loaded = {};
          r.data.data[0].items.forEach(item => {
            loaded[item.productId] = String(item.quantity);
          });
          setQuantities(loaded);
        }
      })
      .catch(() => {}); // silent fallback — blank rows is fine
  }, [selectedSp, date]);

  const handleSave = async () => {
    const items = availability
      .filter(p => quantities[p.productId] && parseFloat(quantities[p.productId]) > 0)
      .map(p => ({
        productId: p.productId,
        quantity:  parseFloat(quantities[p.productId]),
        unitPrice: prices[p.productId] ?? 0,   // ← price from Setup, never user input
      }));

    if (!items.length) { notify('Enter at least one quantity.', 'warning'); return; }

    setSaving(true);
    try {
      await api.post('/dispatches', {
        salespersonId: Number(selectedSp),
        dispatchDate:  date,
        items,
      });
      setSaveStatus('success');
    } catch (e) {
      notify(e.response?.data?.error ?? 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Only show products that have received stock today OR an existing qty entered
  const visibleProducts = availability.filter(p => p.received > 0 || quantities[p.productId]);

  // Group by brand for cleaner view
  const brandGroups = visibleProducts.reduce((acc, p) => {
    if (!acc[p.brandName]) acc[p.brandName] = [];
    acc[p.brandName].push(p);
    return acc;
  }, {});

  const totalAmount = visibleProducts.reduce((s, p) => {
    const q = parseFloat(quantities[p.productId]) || 0;
    return s + q * (prices[p.productId] ?? 0);
  }, 0);

  const activeSp = salespeople.find(s => String(s.id) === String(selectedSp));

  return (
    <div className="p-5 md:p-6 max-w-3xl mx-auto space-y-5">
      <SaveOverlay status={saveStatus} onClose={() => setSaveStatus(null)} successMessage="Dispatch Saved!" />

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Stock Dispatch</h1>
          <p className="text-slate-500 text-sm mt-0.5">Allocate stock to salespeople</p>
        </div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      {/* ── Salesperson selector ─────────────────────────────────────── */}
      <div className="ddm-card p-4">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Select Salesperson
        </label>
        <select
          value={selectedSp}
          onChange={e => setSelectedSp(e.target.value)}
          className="w-full sm:w-72 ddm-input"
        >
          <option value="">Choose salesperson…</option>
          {salespeople.map(sp => (
            <option key={sp.id} value={sp.id}>{sp.name}{sp.route ? ` — ${sp.route}` : ''}</option>
          ))}
        </select>
      </div>

      {/* ── Dispatch table ───────────────────────────────────────────── */}
      {selectedSp && (
        <div className="ddm-card overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-200 px-5 py-3">
            <div className="col-span-5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</div>
            <div className="col-span-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Avail</div>
            <div className="col-span-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Price</div>
            <div className="col-span-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</div>
            <div className="col-span-1 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Amt</div>
          </div>

          {Object.keys(brandGroups).length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No stock received for this date yet. Enter Stock Receipt first.
            </div>
          ) : (
            Object.entries(brandGroups).map(([brandName, products]) => (
              <div key={brandName}>
                {/* Brand group label */}
                <div className="px-5 py-2 bg-slate-50 border-y border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {brandName}
                </div>

                {products.map(p => {
                  const qty      = parseFloat(quantities[p.productId]) || 0;
                  const price    = prices[p.productId];
                  const missing  = price === undefined || price === null;
                  const over     = qty > p.available;
                  const amount   = qty * (price ?? 0);

                  return (
                    <div
                      key={p.productId}
                      className={`grid grid-cols-12 items-center px-5 py-2.5 border-b border-slate-100 transition-colors ${
                        missing ? 'bg-amber-50/60' : qty > 0 ? 'bg-teal-50/40' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      {/* Product name */}
                      <div className="col-span-5 text-sm font-medium text-slate-800">{p.productName}</div>

                      {/* Available qty */}
                      <div className={`col-span-2 text-right text-sm tabular-nums font-medium ${
                        p.available <= 0 ? 'text-red-500' : 'text-slate-600'
                      }`}>
                        {p.available}
                      </div>

                      {/* Selling price — read-only */}
                      <div className="col-span-2 text-right text-sm tabular-nums text-slate-500">
                        {missing
                          ? <span className="badge-amber text-[10px] px-1.5">No rate</span>
                          : `₹${price}`
                        }
                      </div>

                      {/* Qty input */}
                      <div className="col-span-2 flex justify-end">
                        <input
                          type="number"
                          value={quantities[p.productId] ?? ''}
                          onChange={e => setQuantities(prev => ({ ...prev, [p.productId]: e.target.value }))}
                          step="0.5"
                          min="0"
                          disabled={missing || p.available <= 0}
                          placeholder={missing ? '—' : '0'}
                          className={`w-16 text-right px-2 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:cursor-not-allowed tabular-nums ${
                            over ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'
                          }`}
                        />
                      </div>

                      {/* Computed amount */}
                      <div className={`col-span-1 text-right text-xs tabular-nums font-medium ${
                        qty > 0 ? 'text-teal-700' : 'text-slate-300'
                      }`}>
                        {qty > 0 ? `₹${amount.toFixed(0)}` : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}

          {/* Totals footer */}
          {Object.keys(brandGroups).length > 0 && (
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-t border-slate-200">
              <span className="text-sm font-bold text-slate-700">Total Dispatch</span>
              <span className="text-sm font-bold text-teal-700 tabular-nums">{formatCurrency(totalAmount)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Footer actions ───────────────────────────────────────────── */}
      {selectedSp && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <Info size={12} />
            Selling rates set in <span className="font-medium text-slate-600">Setup → Salespeople &amp; Rates</span>
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="ddm-btn-primary"
          >
            {saving ? <Loader2 className="animate-spin" size={15} /> : <Truck size={15} />}
            {saving ? 'Saving…' : 'Save Dispatch'}
          </button>
        </div>
      )}
    </div>
  );
}
