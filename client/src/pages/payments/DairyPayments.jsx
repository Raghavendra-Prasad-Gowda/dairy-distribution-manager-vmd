import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Trash2, Loader2, Pencil, Filter, X, CalendarDays, CreditCard, Search, ListOrdered, Wallet } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import PaymentForm from '../../components/PaymentForm';
import PinModal from '../../components/PinModal';
import BulkTopUpModal from '../../components/BulkTopUpModal';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import BrandedLoader from '../../components/ui/BrandedLoader';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import { numberToWords } from '../../utils/numberToWords';
import { getBrandColors, PAYMENT_MODES } from '../../utils/constants';
import api from '../../api/axios';

// Matches the cycling palette used in StockReceipt for route pills
const ROUTE_COLORS = [
  { bg: 'bg-sky-100',     text: 'text-sky-700',     dot: 'bg-sky-400'     },
  { bg: 'bg-violet-100',  text: 'text-violet-700',  dot: 'bg-violet-400'  },
  { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  { bg: 'bg-rose-100',    text: 'text-rose-700',    dot: 'bg-rose-400'    },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-400' },
];

const MODE_COLORS = {
  Cash:   'bg-emerald-100 text-emerald-700',
  UPI:    'bg-blue-100   text-blue-700',
  NEFT:   'bg-violet-100 text-violet-700',
  RTGS:   'bg-amber-100  text-amber-700',
  Cheque: 'bg-orange-100 text-orange-700',
  // Not a payment — admin-loaded dues, which ADD to what the dairy owes.
  // Distinct from a real payment mode so it's never mistaken for one.
  // (Deposit top-ups are a separate ledger now — see the Deposit report tab.)
  'Top-up': 'bg-amber-100 text-amber-800',
};

/** Premium brand balance card — matches Dashboard DairyPayableCard style */
function BrandBalanceCard({ brandName, opening, stockValue, depositValue, paid, closing }) {
  const colors   = getBrandColors(brandName);
  const isOwing  = closing > 0;
  const isCredit = closing < 0;

  const tiles = [
    { label: 'Opening', value: opening,                  cls: 'text-slate-600'  },
    { label: 'Stock',   value: stockValue + depositValue, cls: 'text-blue-600'   },
    { label: 'Paid',    value: paid,                      cls: 'text-emerald-600' },
  ];

  return (
    <div className="ddm-card overflow-hidden">
      {/* Brand header */}
      <div className={`px-4 py-3 flex items-center justify-between ${colors.bg} border-b ${colors.border}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
          <span className={`font-bold text-sm ${colors.text}`}>{brandName}</span>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
          isOwing ? 'bg-red-100 text-red-700' : isCredit ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
        }`}>
          {isOwing ? 'Outstanding' : isCredit ? 'Credit' : 'Cleared'}
        </span>
      </div>

      {/* Large balance */}
      <div className="flex flex-col items-center justify-center py-4 px-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
          {isOwing ? 'You Owe' : isCredit ? "You're in Credit" : 'Settled'}
        </p>
        <p className={`text-2xl font-bold tabular-nums leading-none ${
          isOwing ? 'text-red-600' : isCredit ? 'text-violet-600' : 'text-emerald-600'
        }`}>
          {formatCurrency(Math.abs(closing))}
        </p>
      </div>

      {/* Breakdown tiles */}
      <div className={`grid border-t border-slate-100 bg-slate-50/60`} style={{ gridTemplateColumns: `repeat(${tiles.length}, 1fr)` }}>
        {tiles.map(({ label, value, cls }, i) => (
          <div key={label} className={`py-2.5 text-center ${i < tiles.length - 1 ? 'border-r border-slate-200' : ''}`}>
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
  const { user } = useAuth();
  // Loading pre-existing dues rewrites brand balances irreversibly — superadmin
  // only, mirroring the requireSuperAdmin guard on the API route.
  const isSuperAdmin = user?.role === 'superadmin';
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const [brands, setBrands]        = useState([]);
  const [activeBrandId, setActive] = useState(null);
  const [balance, setBalance]      = useState(null);
  const [payments, setPayments]    = useState([]);
  const [loading, setLoading]      = useState(false);
  const [saving, setSaving]        = useState(false);

  // PIN modal state — single gate for both edit and delete
  const [pinOpen, setPinOpen]           = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // { type: 'edit'|'delete', payment }

  // Edit modal state
  const [editPayment, setEditPayment]   = useState(null);
  const [editForm, setEditForm]         = useState({});
  const [editSaving, setEditSaving]     = useState(false);

  // Delete confirm state
  const [deleteId, setDeleteId]         = useState(null);
  const [deleting, setDeleting]         = useState(false);

  // Search + filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFrom, setFilterFrom]   = useState('');
  const [filterTo,   setFilterTo]     = useState('');
  const [filterMode, setFilterMode]   = useState('');
  const [filterRef,  setFilterRef]    = useState('');
  const [showFilter, setShowFilter]   = useState(false);

  // Pagination
  const HISTORY_PER_PAGE = 15;
  const [historyPage, setHistoryPage] = useState(1);

  const today = getIndiaDate();

  // Breakdown panel state. The loading flag is tracked (set around the fetch
  // below) but not currently rendered anywhere — no skeleton/spinner reads it
  // yet — so the read side is intentionally unused for now.
  const [breakdown,         setBreakdown]        = useState(null);
  const [_breakdownLoading, setBreakdownLoading] = useState(false);

  // Prefill state wired into PaymentForm
  const [paymentPrefill,   setPaymentPrefill]   = useState(null);

  useEffect(() => {
    const preferredId = searchParams.get('brandId');
    api.get('/brands')
      .then(r => {
        const b = r.data.data;
        setBrands(b);
        if (b.length) {
          const match = preferredId && b.find(x => String(x.id) === String(preferredId));
          setActive(match ? match.id : b[0].id);
        }
      })
      .catch(() => notify('Failed to load brands', 'error'));
    // Deliberately mount-only: reads the URL's initial ?brandId= once to seed
    // the selection. searchParams is intentionally excluded — react-router
    // hands back a new object each navigation, and this must NOT refetch
    // /brands every time the URL changes. notify is stable (useCallback([])
    // in NotificationContext) so its omission never affects firing either way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = useCallback(async () => {
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
  }, [activeBrandId, today, notify]);

  const fetchBreakdown = useCallback(async () => {
    if (!activeBrandId) return;
    setBreakdownLoading(true);
    try {
      const res = await api.get(`/dairy-balance/route-breakdown?brandId=${activeBrandId}&from=${today}&to=${today}`);
      setBreakdown(res.data.data);
    } catch {
      setBreakdown([]);
    } finally {
      setBreakdownLoading(false);
    }
  }, [activeBrandId, today]);

  useEffect(() => {
    if (!activeBrandId) return;
    fetchAll();
    fetchBreakdown();
  }, [activeBrandId, fetchAll, fetchBreakdown]);

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

  const handleDelete = async () => {
    if (!deleteId || deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/dairy-payments/${deleteId}`);
      notify('Payment deleted', 'success');
      setDeleteId(null);
      fetchAll();
    } catch {
      notify('Failed to delete payment', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (p) => {
    setPendingAction({ type: 'edit', payment: p });
    setPinOpen(true);
  };

  const openDelete = (p) => {
    setPendingAction({ type: 'delete', payment: p });
    setPinOpen(true);
  };

  const onPinSuccess = () => {
    if (!pendingAction) return;
    const { type, payment: p } = pendingAction;
    if (type === 'edit') {
      setEditPayment(p);
      setEditForm({
        amount:      String(p.amount ?? ''),
        paymentDate: p.paymentDate?.slice(0, 10) ?? today,
        paymentMode: p.paymentMode ?? 'Cash',
        reference:   p.reference ?? '',
      });
    } else if (type === 'delete') {
      setDeleteId(p.id);
    }
    setPendingAction(null);
  };

  const handleEditSave = async () => {
    if (!editPayment) return;
    setEditSaving(true);
    try {
      await api.put(`/dairy-payments/${editPayment.id}`, {
        ...editForm,
        amount: parseFloat(editForm.amount),
      });
      notify('Payment updated successfully', 'success');
      setEditPayment(null);
      fetchAll();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to update payment', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const hasFilters = filterFrom || filterTo || filterMode || filterRef;
  const hasSearch  = searchQuery.trim().length > 0;

  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return payments.filter(p => {
      const dateStr = p.paymentDate?.slice(0, 10) ?? '';
      if (filterFrom && dateStr < filterFrom) return false;
      if (filterTo   && dateStr > filterTo)   return false;
      if (filterMode && p.paymentMode !== filterMode) return false;
      if (filterRef  && !(p.reference ?? '').toLowerCase().includes(filterRef.toLowerCase())) return false;
      if (q) {
        const amount   = String(p.amount ?? '');
        const ref      = (p.reference ?? '').toLowerCase();
        const mode     = (p.paymentMode ?? '').toLowerCase();
        const date     = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toLowerCase();
        if (!amount.includes(q) && !ref.includes(q) && !mode.includes(q) && !date.includes(q)) return false;
      }
      return true;
    });
  }, [payments, searchQuery, filterFrom, filterTo, filterMode, filterRef]);

  // Reset to page 1 when filters/search change
  useEffect(() => { setHistoryPage(1); }, [searchQuery, filterFrom, filterTo, filterMode, filterRef, activeBrandId]);

  const historyTotalPages = Math.max(1, Math.ceil(filteredPayments.length / HISTORY_PER_PAGE));
  const pagedPayments = filteredPayments.slice(
    (historyPage - 1) * HISTORY_PER_PAGE,
    historyPage * HISTORY_PER_PAGE,
  );

  const activeBrand = brands.find(b => b.id === activeBrandId);

  return (
    <div className="flex flex-col h-full">

      {/* ── Saving overlay ──────────────────────────────────── */}
      <LoadingOverlay open={saving} message="Recording payment…" />

      {/* Page header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <CreditCard size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Dairy Payments</h1>
            <p className="text-emerald-300 text-xs">Record payments to dairy suppliers</p>
          </div>
        </div>
      </div>

      {/* Superadmin action toolbar — kept off the dark header band; the soft
          pill buttons read poorly against emerald-800, and this matches the
          light toolbar convention used for bulk actions elsewhere (e.g.
          Bulk Update Prices on the salesman pricing page). */}
      {isSuperAdmin && (
        <div className="flex items-center justify-end gap-2 px-4 md:px-6 py-2.5 bg-white border-b border-slate-200 flex-shrink-0 flex-wrap">
          <Button variant="soft-warning" size="sm" icon={Wallet} onClick={() => setTopUpOpen(true)}>
            Bulk Top-up
          </Button>
        </div>
      )}

      {/* ── Bulk top-up modal (dues) ─────────────────────────── */}
      {/*
        Deposit top-up used to live here as a second variant of this same
        modal/endpoint, but a deposit top-up is a separate ledger that must
        never touch this dairy's owed-for-stock balance — it now lives on the
        Deposit report tab instead, backed by its own endpoint/table.
      */}
      <BulkTopUpModal
        open={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        entities={brands}
        notify={notify}
        entryKey="brandId"
        nounSingular="brand"
        nounPlural="brands"
        searchPlaceholder="Search brand…"
        warning={
          <>
            A top-up <strong>increases</strong> what the dairy owes this brand — use it
            to load dues from before the app. It is not a payment.
          </>
        }
        onSaved={async (payload) => {
          const res = await api.post('/dairy-payments/bulk-topup', payload);
          await fetchAll();
          return res.data.data;
        }}
      />

      {/* Brand tabs */}
      {brands.length > 0 && (
        <div className="px-5 md:px-7 pt-4 pb-0 bg-white border-b border-slate-200">
          <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActive} />
        </div>
      )}

      {loading ? (
        <div className="flex-1"><BrandedLoader /></div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 md:p-6 max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* ── Left column: balance card + form ───────────────── */}
              <div className="lg:col-span-1 space-y-4 order-1 lg:order-1">

                {balance && (
                  <BrandBalanceCard
                    brandName={activeBrand?.name ?? ''}
                    opening={balance.openingBalance}
                    stockValue={balance.stockValue}
                    depositValue={Number(balance.depositValue ?? 0)}
                    paid={balance.amountPaid}
                    closing={balance.closingBalance}
                  />
                )}

                {/* Bill Breakdown panel — routes + deposit, shown when routes exist */}
                {breakdown && breakdown.length > 0 && (() => {
                  const routeTotal   = breakdown.reduce((s, r) => s + r.totalAmount, 0);
                  const depositValue = Number(balance?.depositValue ?? 0);
                  const grandTotal   = routeTotal + depositValue;
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                        <ListOrdered size={14} className="text-emerald-600" />
                        <span className="text-sm font-semibold text-slate-700">
                          Route Breakdown — {new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="px-4 py-3">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] text-slate-500 uppercase tracking-wide border-b border-slate-100">
                              <th className="text-left py-1.5 font-semibold">Route</th>
                              <th className="text-right py-1.5 font-semibold">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {breakdown.map((row, i) => {
                              const c = ROUTE_COLORS[i % ROUTE_COLORS.length];
                              return (
                                <tr key={row.routeId} className={`${c.bg} border-b border-white`}>
                                  <td className={`py-1.5 px-2 text-xs font-semibold ${c.text} flex items-center gap-1.5`}>
                                    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                                    {row.routeNumber}
                                  </td>
                                  <td className={`py-1.5 px-2 text-right font-mono text-xs tabular-nums font-semibold ${c.text}`}>{formatCurrency(row.totalAmount)}</td>
                                </tr>
                              );
                            })}
                            {depositValue > 0 && (
                              <>
                                <tr>
                                  <td colSpan={2} className="pt-3 pb-1 px-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wide">Deposit</span>
                                      <div className="flex-1 h-px bg-orange-100" />
                                      <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wide">Amount</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="bg-orange-50">
                                  <td className="py-1.5 px-2 text-xs font-semibold text-orange-700 flex items-center gap-1.5">
                                    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-orange-400" />
                                    Based on today's crate receipts
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono text-xs tabular-nums font-semibold text-orange-700">{formatCurrency(depositValue)}</td>
                                </tr>
                              </>
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="font-bold text-slate-900">
                              <td className="pt-2 text-xs">Total</td>
                              <td className="pt-2 text-right font-mono text-xs tabular-nums text-emerald-700">{formatCurrency(grandTotal)}</td>
                            </tr>
                          </tfoot>
                        </table>
                        {Number(balance?.closingBalance ?? 0) > 0 && (() => {
                          const payAmount = Math.min(grandTotal, Number(balance.closingBalance));
                          return (
                            <button
                              onClick={() => setPaymentPrefill({ amount: String(payAmount.toFixed(2)), paymentDate: today, paymentMode: 'RTGS', reference: '' })}
                              className="mt-3 w-full ddm-btn-primary text-xs justify-center"
                            >
                              Pay Today's Bill — {formatCurrency(payAmount)}
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })()}

                <div className="ddm-card p-5">
                  <h3 className="ddm-section-label mb-4">Record Payment</h3>
                  <PaymentForm
                    onSubmit={handlePayment}
                    closingBalance={balance?.closingBalance ?? 0}
                    loading={saving}
                    prefill={paymentPrefill}
                    onClearPrefill={() => setPaymentPrefill(null)}
                    defaultMode="RTGS"
                  />
                </div>
              </div>

              {/* ── Right column: history ───────────────────────────── */}
              <div className="lg:col-span-2 order-2 lg:order-2">
                <div className="ddm-card overflow-hidden">

                  {/* Header + search + filter toggle */}
                  <div className="px-4 py-3 bg-white border-b border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 text-sm">
                        Payment History
                        {(hasSearch || hasFilters) && filteredPayments.length !== payments.length && (
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
                    {/* Quick search */}
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by amount, mode, reference, date…"
                        className="w-full pl-8 pr-8 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-50 placeholder:text-slate-400"
                      />
                      {hasSearch && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filter controls */}
                  {showFilter && (
                    <div className="px-5 py-3 bg-emerald-50/60 border-b border-emerald-100 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">From</label>
                        <div className="relative">
                          <CalendarDays size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} max={today}
                            className="w-full pl-7 pr-2 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white appearance-none min-h-[34px]" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">To</label>
                        <div className="relative">
                          <CalendarDays size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} max={today}
                            className="w-full pl-7 pr-2 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white appearance-none min-h-[34px]" />
                        </div>
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
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                          <thead className="bg-emerald-700">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Date</th>
                              <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Amount</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Amount in Words</th>
                              <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Mode</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Reference</th>
                              <th className="px-4 py-3 w-20" />
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100">
                            {pagedPayments.map((p) => (
                              <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-4 py-3 text-xs font-semibold text-slate-600 tabular-nums whitespace-nowrap" style={{ verticalAlign: 'top' }}>
                                  {new Date(p.paymentDate?.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-bold text-emerald-700 tabular-nums whitespace-nowrap" style={{ verticalAlign: 'top' }}>
                                  {formatCurrency(p.amount)}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-500 italic" style={{ verticalAlign: 'top' }}>
                                  <div className="max-w-[200px]">{numberToWords(p.amount)}</div>
                                </td>
                                <td className="px-4 py-3 text-center whitespace-nowrap" style={{ verticalAlign: 'top' }}>
                                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${MODE_COLORS[p.paymentMode] ?? 'bg-slate-100 text-slate-600'}`}>
                                    {p.paymentMode || 'Cash'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-400" style={{ verticalAlign: 'top' }}>
                                  <div className="max-w-[8rem] truncate">{p.reference || <span className="text-slate-300">—</span>}</div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap" style={{ verticalAlign: 'top' }}>
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={() => openEdit(p)} className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg transition" title="Edit">
                                      <Pencil size={12} />
                                    </button>
                                    <button onClick={() => openDelete(p)} className="p-1.5 text-red-400 hover:text-white hover:bg-red-500 rounded-lg transition" title="Delete">
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {historyTotalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50/60">
                          <p className="text-xs text-slate-400">
                            {(historyPage - 1) * HISTORY_PER_PAGE + 1}–{Math.min(historyPage * HISTORY_PER_PAGE, filteredPayments.length)} of {filteredPayments.length}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                              disabled={historyPage === 1}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                              Prev
                            </button>
                            <span className="text-xs text-slate-500 font-medium px-1">{historyPage} / {historyTotalPages}</span>
                            <button
                              onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))}
                              disabled={historyPage === historyTotalPages}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PIN modal ────────────────────────────────────────── */}
      <PinModal
        isOpen={pinOpen}
        onClose={() => { setPinOpen(false); setPendingAction(null); }}
        onSuccess={onPinSuccess}
        title="Enter PIN to Edit Payment"
      />

      {/* ── Edit payment modal ───────────────────────────────── */}
      {editPayment && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={() => setEditPayment(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            style={{ animation: 'popIn 0.2s ease' }}
            onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 bg-emerald-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-700 flex items-center justify-center">
                  <Pencil size={14} className="text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">Edit Payment</p>
                  <p className="text-emerald-300 text-[11px]">Correct the details below and save</p>
                </div>
              </div>
              <button onClick={() => setEditPayment(null)} className="p-1.5 text-emerald-300 hover:text-white hover:bg-emerald-700 rounded-lg transition">
                <X size={15} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Amount */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                  <input
                    type="number" step="0.01" min="0.01" required
                    value={editForm.amount}
                    onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white tabular-nums"
                  />
                </div>
                {parseFloat(editForm.amount) > 0 && (
                  <p className="mt-1.5 text-[11px] text-slate-800 font-bold italic leading-snug">
                    {numberToWords(parseFloat(editForm.amount))}
                  </p>
                )}
              </div>

              {/* Mode */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Mode</label>
                <div className="flex flex-wrap gap-1.5">
                  {['Cash','UPI','NEFT','RTGS','Cheque'].map(mode => (
                    <button key={mode} type="button"
                      onClick={() => setEditForm(f => ({ ...f, paymentMode: mode }))}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                        editForm.paymentMode === mode
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                      }`}>
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest whitespace-nowrap">Details</span>
                <div className="flex-1 h-px bg-emerald-100" />
              </div>

              {/* Date */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Date</label>
                <input type="date"
                  value={editForm.paymentDate}
                  onChange={e => setEditForm(f => ({ ...f, paymentDate: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white appearance-none"
                />
              </div>

              {/* Reference */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Reference</label>
                <input type="text" placeholder="Txn / cheque no."
                  value={editForm.reference}
                  onChange={e => setEditForm(f => ({ ...f, reference: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                />
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setEditPayment(null)}
                className="flex-1 border border-slate-200 text-slate-600 font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition text-sm">
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving || !editForm.amount}
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2">
                {editSaving ? <Loader2 className="animate-spin" size={14} /> : <Pencil size={14} />}
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ─────────────────────────────── */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Payment?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
          </>
        }
      >
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <Trash2 className="text-red-600" size={24} />
          </div>
          <p className="text-sm text-slate-500">This will permanently remove the payment and recalculate the balance.</p>
        </div>
      </Modal>
    </div>
  );
}
