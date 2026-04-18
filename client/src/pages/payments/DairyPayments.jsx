import { useState, useEffect, useMemo } from 'react';
import { Trash2, Loader2, Pencil, Filter, X } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import PaymentForm from '../../components/PaymentForm';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import { BRAND_COLORS, PAYMENT_MODES } from '../../utils/constants';
import api from '../../api/axios';

const MODE_COLORS = {
  Cash:   'bg-emerald-100 text-emerald-700',
  UPI:    'bg-blue-100   text-blue-700',
  NEFT:   'bg-violet-100 text-violet-700',
  RTGS:   'bg-amber-100  text-amber-700',
  Cheque: 'bg-orange-100 text-orange-700',
};

/** Premium brand balance card — matches Dashboard DairyPayableCard style */
function BrandBalanceCard({ brandName, opening, stockValue, paid, closing }) {
  const colors  = BRAND_COLORS[brandName] ?? BRAND_COLORS['Nandini'];
  const isOwing = closing > 0;

  return (
    <div className="ddm-card overflow-hidden">
      {/* Brand header */}
      <div className={`px-4 py-3 flex items-center justify-between ${colors.bg} border-b ${colors.border}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
          <span className={`font-bold text-sm ${colors.text}`}>{brandName}</span>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${isOwing ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {isOwing ? 'Outstanding' : 'Cleared'}
        </span>
      </div>

      {/* Large balance */}
      <div className="flex flex-col items-center justify-center py-4 px-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
          {isOwing ? 'You Owe' : 'Settled'}
        </p>
        <p className={`text-3xl font-bold tabular-nums leading-none ${isOwing ? 'text-red-600' : 'text-emerald-600'}`}>
          {formatCurrency(Math.abs(closing))}
        </p>
      </div>

      {/* Breakdown tiles */}
      <div className="grid grid-cols-3 border-t border-slate-100 bg-slate-50/60">
        {[
          { label: 'Opening',   value: opening,    cls: 'text-slate-600' },
          { label: 'Stock',     value: stockValue, cls: 'text-blue-600'  },
          { label: 'Paid',      value: paid,       cls: 'text-emerald-600' },
        ].map(({ label, value, cls }, i) => (
          <div key={label} className={`py-2.5 text-center ${i < 2 ? 'border-r border-slate-200' : ''}`}>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-0.5">{label}</p>
            <p className={`text-xs font-bold tabular-nums ${cls}`}>{formatCurrency(value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DairyPayments() {
  const { notify } = useNotification();
  const [brands, setBrands]        = useState([]);
  const [activeBrandId, setActive] = useState(null);
  const [balance, setBalance]      = useState(null);
  const [payments, setPayments]    = useState([]);
  const [loading, setLoading]      = useState(false);
  const [saving, setSaving]        = useState(false);

  // Edit-a-mistake state
  const [prefill, setPrefill]      = useState(null);

  // Filter state
  const [filterFrom, setFilterFrom]   = useState('');
  const [filterTo,   setFilterTo]     = useState('');
  const [filterMode, setFilterMode]   = useState('');
  const [filterRef,  setFilterRef]    = useState('');
  const [showFilter, setShowFilter]   = useState(false);

  const today = getIndiaDate();

  useEffect(() => {
    api.get('/brands')
      .then(r => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => notify('Failed to load brands', 'error'));
  }, []);

  useEffect(() => {
    if (!activeBrandId) return;
    fetchAll();
  }, [activeBrandId]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [balRes, pmtRes] = await Promise.all([
        api.get(`/dairy-balance/${activeBrandId}?date=${today}`),
        api.get(`/dairy-payments?brandId=${activeBrandId}`),
      ]);
      setBalance(balRes.data.data);
      setPayments(pmtRes.data.data);
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }

  const handlePayment = async (formData) => {
    setSaving(true);
    try {
      await api.post('/dairy-payments', { ...formData, brandId: activeBrandId });
      notify('Payment recorded successfully', 'success');
      fetchAll();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to record payment', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this payment?')) return;
    try {
      await api.delete(`/dairy-payments/${id}`);
      notify('Payment deleted', 'success');
      fetchAll();
    } catch {
      notify('Failed to delete payment', 'error');
    }
  };

  /** Delete the record and prefill the form so user can re-enter corrected values */
  const handleEdit = async (p) => {
    if (!window.confirm('Delete this payment and re-enter corrected values?')) return;
    try {
      await api.delete(`/dairy-payments/${p.id}`);
      setPrefill({
        amount:      p.amount,
        paymentDate: p.paymentDate?.slice(0, 10) ?? today,
        paymentMode: p.paymentMode ?? 'Cash',
        reference:   p.reference ?? '',
      });
      notify('Payment removed — correct and re-submit below', 'info');
      fetchAll();
    } catch {
      notify('Failed to edit payment', 'error');
    }
  };

  const hasFilters = filterFrom || filterTo || filterMode || filterRef;

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const dateStr = p.paymentDate?.slice(0, 10) ?? '';
      if (filterFrom && dateStr < filterFrom) return false;
      if (filterTo   && dateStr > filterTo)   return false;
      if (filterMode && p.paymentMode !== filterMode) return false;
      if (filterRef  && !(p.reference ?? '').toLowerCase().includes(filterRef.toLowerCase())) return false;
      return true;
    });
  }, [payments, filterFrom, filterTo, filterMode, filterRef]);

  const activeBrand = brands.find(b => b.id === activeBrandId);

  return (
    <div className="flex flex-col h-full">

      {/* Page header */}
      <div className="px-5 md:px-7 pt-5 pb-4 border-b border-slate-200 bg-white">
        <h1 className="text-xl font-bold text-slate-900">Dairy Payments</h1>
        <p className="text-slate-400 text-sm mt-0.5">Record payments to dairy suppliers</p>
      </div>

      {/* Brand tabs */}
      {brands.length > 0 && (
        <div className="px-5 md:px-7 pt-4 pb-0 bg-white border-b border-slate-200">
          <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={(id) => { setActive(id); setPrefill(null); }} />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center flex-1 py-16">
          <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 md:p-6 max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* ── Left column: balance card + form ───────────────── */}
              <div className="lg:col-span-1 space-y-4">

                {balance && (
                  <BrandBalanceCard
                    brandName={activeBrand?.name ?? ''}
                    opening={balance.openingBalance}
                    stockValue={balance.stockValue}
                    paid={balance.amountPaid}
                    closing={balance.closingBalance}
                  />
                )}

                <div className="ddm-card p-5">
                  <h3 className="ddm-section-label mb-4">
                    {prefill ? 'Correct & Re-enter' : 'Record Payment'}
                  </h3>
                  <PaymentForm
                    onSubmit={handlePayment}
                    closingBalance={balance?.closingBalance ?? 0}
                    loading={saving}
                    prefill={prefill}
                    onClearPrefill={() => setPrefill(null)}
                    submitLabel={prefill ? 'Save Correction' : 'Record Payment'}
                  />
                </div>
              </div>

              {/* ── Right column: history ───────────────────────────── */}
              <div className="lg:col-span-2">
                <div className="ddm-card overflow-hidden">

                  {/* Header + filter toggle */}
                  <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-slate-200">
                    <h3 className="font-bold text-slate-900 text-sm">
                      Payment History
                      {filteredPayments.length !== payments.length && (
                        <span className="ml-2 text-xs font-normal text-slate-400">
                          ({filteredPayments.length} of {payments.length})
                        </span>
                      )}
                    </h3>
                    <button
                      onClick={() => setShowFilter(v => !v)}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition ${
                        showFilter || hasFilters
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-white text-slate-500 border border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
                      }`}
                    >
                      <Filter size={12} />
                      Filter
                      {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
                    </button>
                  </div>

                  {/* Filter controls */}
                  {showFilter && (
                    <div className="px-5 py-3 bg-emerald-50/60 border-b border-emerald-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">From</label>
                        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} max={today}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">To</label>
                        <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} max={today}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Mode</label>
                        <select value={filterMode} onChange={e => setFilterMode(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                          <option value="">All</option>
                          {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Reference</label>
                        <div className="relative">
                          <input type="text" value={filterRef} onChange={e => setFilterRef(e.target.value)} placeholder="Search…"
                            className="w-full pl-2 pr-6 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
                          {filterRef && (
                            <button onClick={() => setFilterRef('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                              <X size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                      {hasFilters && (
                        <button
                          onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterMode(''); setFilterRef(''); }}
                          className="col-span-full text-xs text-red-600 hover:text-red-700 font-semibold text-left"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                  )}

                  {payments.length === 0 ? (
                    <div className="text-center py-14 text-slate-400 text-sm">No payments recorded yet</div>
                  ) : filteredPayments.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-sm">No payments match the current filters</div>
                  ) : (
                    <>
                      {/* Table header */}
                      <div className="grid grid-cols-12 items-center px-4 py-2.5 bg-white border-b border-slate-200">
                        <div className="col-span-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Date</div>
                        <div className="col-span-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Amount</div>
                        <div className="col-span-2 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Mode</div>
                        <div className="col-span-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider pl-2">Reference</div>
                        <div className="col-span-2" />
                      </div>

                      {filteredPayments.map((p, idx) => (
                        <div
                          key={p.id}
                          className="grid grid-cols-12 items-center px-4 py-3 border-b border-slate-100 hover:bg-slate-50/80 transition-colors last:border-0"
                        >
                          <div className="col-span-2 text-xs font-semibold text-slate-600 tabular-nums">
                            {new Date(p.paymentDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </div>
                          <div className="col-span-3 text-right text-sm font-bold text-emerald-700 tabular-nums">
                            {formatCurrency(p.amount)}
                          </div>
                          <div className="col-span-2 flex justify-center">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${MODE_COLORS[p.paymentMode] ?? 'bg-slate-100 text-slate-600'}`}>
                              {p.paymentMode || 'Cash'}
                            </span>
                          </div>
                          <div className="col-span-3 text-xs text-slate-400 truncate pl-2">
                            {p.reference || <span className="text-slate-300">—</span>}
                          </div>
                          <div className="col-span-2 flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit(p)}
                              className="p-1.5 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition"
                              title="Edit"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
