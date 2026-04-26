import { useState, useEffect, useMemo } from 'react';
import { Trash2, Loader2, Pencil, Filter, X, CalendarDays, CreditCard } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import PaymentForm from '../../components/PaymentForm';
import PinModal from '../../components/PinModal';
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

  // PIN modal state — single gate for both edit and delete
  const [pinOpen, setPinOpen]           = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // { type: 'edit'|'delete', payment }

  // Edit modal state
  const [editPayment, setEditPayment]   = useState(null);
  const [editForm, setEditForm]         = useState({});
  const [editSaving, setEditSaving]     = useState(false);

  // Delete confirm state
  const [deleteId, setDeleteId]         = useState(null);

  // Filter state
  const [filterFrom, setFilterFrom]   = useState('');
  const [filterTo,   setFilterTo]     = useState('');
  const [filterMode, setFilterMode]   = useState('');
  const [filterRef,  setFilterRef]    = useState('');
  const [showFilter, setShowFilter]   = useState(false);

  // Pagination
  const HISTORY_PER_PAGE = 15;
  const [historyPage, setHistoryPage] = useState(1);

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

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/dairy-payments/${deleteId}`);
      notify('Payment deleted', 'success');
      setDeleteId(null);
      fetchAll();
    } catch {
      notify('Failed to delete payment', 'error');
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

  // Reset to page 1 when filters change
  useEffect(() => { setHistoryPage(1); }, [filterFrom, filterTo, filterMode, filterRef, activeBrandId]);

  const historyTotalPages = Math.max(1, Math.ceil(filteredPayments.length / HISTORY_PER_PAGE));
  const pagedPayments = filteredPayments.slice(
    (historyPage - 1) * HISTORY_PER_PAGE,
    historyPage * HISTORY_PER_PAGE,
  );

  const activeBrand = brands.find(b => b.id === activeBrandId);

  return (
    <div className="flex flex-col h-full">

      {/* ── Saving overlay ──────────────────────────────────── */}
      {saving && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Recording payment…</p>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <CreditCard size={17} className="text-emerald-300 flex-shrink-0" />
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">Dairy Payments</h1>
          <p className="text-emerald-300 text-xs">Record payments to dairy suppliers</p>
        </div>
      </div>

      {/* Brand tabs */}
      {brands.length > 0 && (
        <div className="px-5 md:px-7 pt-4 pb-0 bg-white border-b border-slate-200">
          <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActive} />
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
              <div className="lg:col-span-1 space-y-4 order-1 lg:order-1">

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
                  <h3 className="ddm-section-label mb-4">Record Payment</h3>
                  <PaymentForm
                    onSubmit={handlePayment}
                    closingBalance={balance?.closingBalance ?? 0}
                    loading={saving}
                  />
                </div>
              </div>

              {/* ── Right column: history ───────────────────────────── */}
              <div className="lg:col-span-2 order-2 lg:order-2">
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
                              <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Mode</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Reference</th>
                              <th className="px-4 py-3 w-20" />
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100">
                            {pagedPayments.map((p) => (
                              <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-4 py-3 text-xs font-semibold text-slate-600 tabular-nums whitespace-nowrap">
                                  {new Date(p.paymentDate?.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                                  {formatCurrency(p.amount)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${MODE_COLORS[p.paymentMode] ?? 'bg-slate-100 text-slate-600'}`}>
                                    {p.paymentMode || 'Cash'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-400 max-w-[8rem] truncate">
                                  {p.reference || <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={() => openEdit(p)} className="p-1.5 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition" title="Edit">
                                      <Pencil size={12} />
                                    </button>
                                    <button onClick={() => openDelete(p)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete">
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900 mb-1">Edit Payment</h3>
            <p className="text-xs text-slate-400 mb-5">Correct the details below and save.</p>

            <div className="space-y-4">
              {/* Amount */}
              <div>
                <label className="ddm-section-label block mb-1.5">Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                  <input
                    type="number" step="0.01" min="0.01" required
                    value={editForm.amount}
                    onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white tabular-nums"
                  />
                </div>
              </div>

              {/* Mode */}
              <div>
                <label className="ddm-section-label block mb-1.5">Mode</label>
                <div className="flex flex-wrap gap-1.5">
                  {['Cash','UPI','NEFT','RTGS','Cheque'].map(mode => (
                    <button key={mode} type="button"
                      onClick={() => setEditForm(f => ({ ...f, paymentMode: mode }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        editForm.paymentMode === mode
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
                      }`}>
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="ddm-section-label block mb-1.5">Date</label>
                <input type="date"
                  value={editForm.paymentDate}
                  onChange={e => setEditForm(f => ({ ...f, paymentDate: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white appearance-none"
                />
              </div>

              {/* Reference */}
              <div>
                <label className="ddm-section-label block mb-1.5">Reference</label>
                <input type="text" placeholder="Txn / cheque no."
                  value={editForm.reference}
                  onChange={e => setEditForm(f => ({ ...f, reference: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
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
      {deleteId && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={() => setDeleteId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center"
            onClick={e => e.stopPropagation()}>
            <div className="mx-auto w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <Trash2 className="text-red-600" size={24} />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">Delete Payment?</h3>
            <p className="text-sm text-slate-500 mb-6">This will permanently remove the payment and recalculate the balance.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 border border-slate-200 text-slate-600 font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition text-sm">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition text-sm">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
