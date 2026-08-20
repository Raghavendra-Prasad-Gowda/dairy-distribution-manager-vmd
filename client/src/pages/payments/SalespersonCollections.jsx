import { useState, useEffect, useMemo } from 'react';
import { Trash2, Search, Pencil, Filter, X, CalendarDays, Users, Wallet, Eraser } from 'lucide-react';
import { TumblerSpinner } from '../../components/ui/BrandedLoader';
import PaymentForm from '../../components/PaymentForm';
import PinModal from '../../components/PinModal';
import BulkTopUpModal from '../../components/BulkTopUpModal';
import ResetLedgerModal from '../../components/ResetLedgerModal';
import StatusBadge from '../../components/StatusBadge';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { useApiResources } from '../../hooks/useApiResources';
import { useMutation } from '../../hooks/useMutation';
import { useDisclosure } from '../../hooks/useDisclosure';
import { usePaymentFilters } from '../../hooks/usePaymentFilters';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import { PAYMENT_MODES } from '../../utils/constants';
import api from '../../api/axios';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import BrandedLoader from '../../components/ui/BrandedLoader';

const MODE_COLORS = {
  Cash:   'bg-emerald-100 text-emerald-700',
  UPI:    'bg-blue-100   text-blue-700',
  NEFT:   'bg-violet-100 text-violet-700',
  RTGS:   'bg-amber-100  text-amber-700',
  Cheque: 'bg-orange-100 text-orange-700',
  // Not a collection — old dues loaded by an admin, which ADD to what the
  // salesman owes. Amber keeps it visually distinct from real money in.
  'Top-up': 'bg-amber-100 text-amber-800',
};

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Premium SP balance card */
function SpBalanceCard({ sp, balance }) {
  const closing  = balance?.closingBalance ?? 0;
  const isOwing  = closing > 0;
  const isCredit = closing < 0;
  return (
    <div className="ddm-card overflow-hidden">
      {/* Header band */}
      <div className="px-4 py-3 flex items-center justify-between bg-emerald-700">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {getInitials(sp.name)}
          </div>
          <div>
            <p className="font-bold text-sm text-white leading-tight">{sp.name}</p>
            {sp.route && <p className="text-emerald-300 text-[11px] leading-tight">{sp.route}</p>}
          </div>
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
          {isOwing ? 'To Collect' : isCredit ? 'Advance Credit' : 'Settled'}
        </p>
        <p className={`text-2xl font-bold tabular-nums leading-none ${
          isOwing ? 'text-red-600' : isCredit ? 'text-violet-600' : 'text-emerald-600'
        }`}>
          {formatCurrency(Math.abs(closing))}
        </p>
      </div>

      {/* Breakdown tiles */}
      <div className="grid grid-cols-3 border-t border-slate-100 bg-slate-50/60">
        {[
          { label: 'Opening',    value: balance?.openingBalance ?? 0, cls: 'text-slate-600'   },
          { label: 'Dispatched', value: balance?.stockGiven     ?? 0, cls: 'text-blue-600'    },
          { label: 'Collected',  value: balance?.amountPaid     ?? 0, cls: 'text-emerald-600' },
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

export default function SalespersonCollections() {
  const { notify } = useNotification();
  const { user } = useAuth();
  const today = getIndiaDate();
  // Ledger reset wipes history irreversibly — superadmin only, mirroring the
  // requireSuperAdmin guard on that API route. Bulk top-up is less
  // destructive (it's additive, and every other payment action here is
  // already admin-accessible) — any admin can use it, matching requireAdmin
  // on POST /salesperson-payments/bulk-topup.
  const isSuperAdmin = user?.role === 'superadmin';
  const isAdmin       = user?.role === 'admin' || isSuperAdmin;

  const [salespeople, setSalespeople] = useState([]);
  const [allBalances, setAllBalances] = useState({});
  const [selectedSpId, setSelectedSp] = useState(null);
  const [search, setSearch]           = useState('');
  const [filter, setFilter]           = useState('all');

  // Edit modal state
  const [editPayment, setEditPayment] = useState(null);
  const [editForm,    setEditForm]    = useState({});

  // PIN gate state
  const pinModal = useDisclosure();
  const [pendingAction, setPendingAction] = useState(null); // { type: 'edit'|'delete', payment }
  const topUpModal = useDisclosure();
  const resetModal = useDisclosure();

  useEffect(() => {
    Promise.all([
      api.get('/salespeople'),
      api.get(`/salesperson-balance?date=${today}`),
    ])
      .then(([spRes, balRes]) => {
        const sps = spRes.data.data;
        setSalespeople(sps);
        const map = {};
        (balRes.data.data ?? []).forEach(b => { map[b.salespersonId] = b; });
        setAllBalances(map);
        if (sps.length) setSelectedSp(sps[0].id);
      })
      .catch(() => notify('Failed to load salespeople', 'error'));
    // Mount-only: captures "today" once for the initial load. Adding `today`
    // would add a real (if rare) new trigger — refetching if the tab is left
    // open across midnight — so it's intentionally excluded to keep current
    // behavior unchanged. notify is stable (useCallback([]) in
    // NotificationContext) so its omission never affects firing either way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `today` is intentionally excluded from this memo's deps — same reasoning
  // as the mount effect above: keeps current behavior (no refetch on a
  // midnight day-rollover while the tab stays open on the same salesperson)
  // unchanged. The urls only change (and only then does useApiResources
  // refetch) when selectedSpId changes.
  const detailUrls = useMemo(() => (
    selectedSpId
      ? [`/salesperson-balance/${selectedSpId}?date=${today}`, `/salesperson-payments?salespersonId=${selectedSpId}`]
      : []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [selectedSpId]);
  const { data, loading, refetch: fetchDetail, setData } = useApiResources(detailUrls, {
    initialData: { balance: null, payments: [] },
    select: ([bal, pmts]) => ({ balance: bal, payments: pmts ?? [] }),
  });
  const { balance, payments } = data;

  // History filter + pagination — shared hook
  const history = usePaymentFilters(payments, { resetDeps: [selectedSpId] });

  async function refreshAllBalances() {
    const res = await api.get(`/salesperson-balance?date=${today}`);
    const map = {};
    (res.data.data ?? []).forEach(b => { map[b.salespersonId] = b; });
    setAllBalances(map);
  }

  // Record collection — fetches updated data manually (not via fetchDetail) so
  // `loading` never flips true, keeping the panel visible instead of flashing
  // the full-panel BrandedLoader after every payment.
  const { mutate: recordCollection, loading: saving } = useMutation(
    (formData) => api.post('/salesperson-payments', { ...formData, salespersonId: Number(selectedSpId) }),
    {
      successMessage: 'Collection recorded successfully',
      onSuccess: async () => {
        const [balRes, pmtRes] = await Promise.all([
          api.get(`/salesperson-balance/${selectedSpId}?date=${today}`),
          api.get(`/salesperson-payments?salespersonId=${selectedSpId}`),
        ]);
        setData({ balance: balRes.data.data, payments: pmtRes.data.data ?? [] });
        await refreshAllBalances();
      },
    }
  );

  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, amount, mode }

  const handleDelete = (id, amount, mode) => {
    setDeleteConfirm({ id, amount, mode });
  };

  const { mutate: confirmDelete, loading: deleting } = useMutation(
    (id) => api.delete(`/salesperson-payments/${id}`),
    { successMessage: 'Record deleted', onSuccess: () => { setDeleteConfirm(null); fetchDetail(); refreshAllBalances(); } }
  );

  const handleEdit = (p) => {
    setEditPayment(p);
    setEditForm({
      amount:      String(p.amount ?? ''),
      paymentDate: p.paymentDate?.slice(0, 10) ?? today,
      paymentMode: p.paymentMode ?? 'Cash',
      reference:   p.reference ?? '',
    });
  };

  const openEdit = (p) => {
    setPendingAction({ type: 'edit', payment: p });
    pinModal.open();
  };

  const openDelete = (p) => {
    setPendingAction({ type: 'delete', payment: p });
    pinModal.open();
  };

  const onPinSuccess = () => {
    if (!pendingAction) return;
    const { type, payment: p } = pendingAction;
    if (type === 'edit') {
      handleEdit(p);
    } else if (type === 'delete') {
      handleDelete(p.id, p.amount, p.paymentMode);
    }
    setPendingAction(null);
  };

  const { mutate: updateCollection, loading: editSaving } = useMutation(
    () => api.put(`/salesperson-payments/${editPayment.id}`, {
      ...editForm,
      amount: parseFloat(editForm.amount),
    }),
    { successMessage: 'Collection updated', onSuccess: () => { setEditPayment(null); fetchDetail(); refreshAllBalances(); } }
  );

  const selectedSp = salespeople.find(sp => sp.id === selectedSpId);
  const pendingCount = Object.values(allBalances).filter(b => (b.closingBalance ?? 0) > 0).length;

  const filteredSps = salespeople.filter(sp => {
    const nameMatch = sp.name.toLowerCase().includes(search.toLowerCase()) ||
      (sp.route ?? '').toLowerCase().includes(search.toLowerCase());
    if (!nameMatch) return false;
    const bal   = allBalances[sp.id];
    const owing = (bal?.closingBalance ?? 0) > 0;
    if (filter === 'pending') return owing;
    if (filter === 'cleared') return !owing;
    return true;
  });

  // filteredPayments, pagedPayments, pagination, hasFilters — all from shared hook above

  return (
    <div className="flex flex-col h-full">

      {/* Page header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Users size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Collections</h1>
            <p className="text-emerald-300 text-xs">Record cash / UPI collected from salespeople</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {pendingCount > 0 && (
            <span className="text-xs font-semibold text-red-300 bg-red-900/50 px-2.5 py-1 rounded-full whitespace-nowrap">
              {pendingCount} pending
            </span>
          )}
        </div>
      </div>

      {/* Action toolbar — kept off the dark header band; the soft pill
          buttons read poorly against emerald-800, and this matches the light
          toolbar convention used for bulk actions elsewhere (e.g. Bulk
          Update Prices on the salesman pricing page). Bulk Top-up is
          admin-accessible; Reset Ledger stays superadmin-only. */}
      {isAdmin && (
        <div className="flex items-center justify-end gap-2 px-4 md:px-6 py-2.5 bg-white border-b border-slate-200 flex-shrink-0 flex-wrap">
          <Button variant="soft-warning" size="sm" icon={Wallet} onClick={topUpModal.open}>
            Bulk Top-up
          </Button>
          {isSuperAdmin && (
            <Button variant="soft-danger" size="sm" icon={Eraser} onClick={resetModal.open}>
              Reset Ledger
            </Button>
          )}
        </div>
      )}

      {/* Split panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel: always visible ──────────────────────── */}
        <div className="flex flex-col w-64 flex-shrink-0 border-r border-slate-200 bg-white">
          {/* Search + filter */}
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name or route…"
                className="w-full pl-8 pr-7 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-50"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="flex gap-1">
              {[['all', 'All'], ['pending', 'Pending'], ['cleared', 'Cleared']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={`flex-1 text-xs py-1.5 rounded-lg font-semibold transition ${
                    filter === val
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filteredSps.map(sp => {
              const isSelected = sp.id === selectedSpId;
              const bal        = allBalances[sp.id];
              const closing    = bal?.closingBalance ?? 0;
              const owing      = closing > 0;
              const isCredit   = closing < 0;

              return (
                <button
                  key={sp.id}
                  onClick={() => { setSelectedSp(sp.id); }}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                    isSelected
                      ? 'bg-emerald-50 border-l-4 border-l-emerald-600'
                      : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                      isSelected ? 'bg-emerald-600 text-white' : owing ? 'bg-red-100 text-red-600' : isCredit ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {getInitials(sp.name)}
                    </div>
                    <span className={`text-sm font-semibold flex-1 truncate ${isSelected ? 'text-emerald-700' : 'text-slate-700'}`}>
                      {sp.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pl-8">
                    {sp.route && <p className="text-xs text-slate-400 truncate">{sp.route}</p>}
                    {bal && (
                      <span className={`text-xs font-bold tabular-nums flex-shrink-0 ml-auto ${owing ? 'text-red-600' : isCredit ? 'text-violet-600' : 'text-emerald-600'}`}>
                        {owing ? formatCurrency(closing) : isCredit ? `+${formatCurrency(Math.abs(closing))}` : '✓'}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-100 px-4 py-2 bg-slate-50">
            <p className="text-xs text-slate-500">{salespeople.length} total · {pendingCount} pending</p>
          </div>
        </div>

        {/* ── Right panel ─────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50">
          {selectedSp ? (
            loading ? (
              <div className="flex-1"><BrandedLoader /></div>
            ) : (
              <div className="p-5 md:p-6 grid grid-cols-1 lg:grid-cols-5 gap-5">

                {/* Balance card + form */}
                <div className="lg:col-span-2 space-y-4">
                  {balance && <SpBalanceCard sp={selectedSp} balance={balance} />}

                  <div className="ddm-card p-4">
                    <h3 className="ddm-section-label mb-3">Record Collection</h3>
                    <PaymentForm
                      onSubmit={recordCollection}
                      closingBalance={balance?.closingBalance ?? 0}
                      loading={saving}
                    />
                  </div>
                </div>

                {/* Collection history */}
                <div className="lg:col-span-3">
                  <div className="ddm-card overflow-hidden">

                    {/* Header + filter toggle */}
                    <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                      <h3 className="font-bold text-slate-800 text-sm">
                        Collection History
                        {history.filteredPayments.length !== payments.length && (
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            ({history.filteredPayments.length} of {payments.length})
                          </span>
                        )}
                      </h3>
                      <button
                        onClick={history.filterPanel.toggle}
                        className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition ${
                          history.filterPanel.isOpen || history.hasFilters
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-white text-slate-500 border border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
                        }`}
                      >
                        <Filter size={12} />
                        Filter
                        {history.hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
                      </button>
                    </div>

                    {/* Filter controls */}
                    {history.filterPanel.isOpen && (
                      <div className="px-4 py-3 bg-emerald-50/60 border-b border-emerald-100 grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">From</label>
                          <div className="relative">
                            <CalendarDays size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input type="date" value={history.filterFrom} onChange={e => history.setFilterFrom(e.target.value)} max={today}
                              className="w-full pl-7 pr-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">To</label>
                          <div className="relative">
                            <CalendarDays size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input type="date" value={history.filterTo} onChange={e => history.setFilterTo(e.target.value)} max={today}
                              className="w-full pl-7 pr-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Mode</label>
                          <select value={history.filterMode} onChange={e => history.setFilterMode(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                            <option value="">All</option>
                            {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Reference</label>
                          <div className="relative">
                            <input type="text" value={history.filterRef} onChange={e => history.setFilterRef(e.target.value)} placeholder="Search…"
                              className="w-full pl-2 pr-6 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
                            {history.filterRef && (
                              <button onClick={() => history.setFilterRef('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                <X size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                        {history.hasFilters && (
                          <button
                            onClick={history.clearFilters}
                            className="col-span-full text-xs text-red-600 hover:text-red-700 font-semibold text-left"
                          >
                            Clear all filters
                          </button>
                        )}
                      </div>
                    )}

                    {payments.length === 0 ? (
                      <div className="text-center py-12 text-slate-400 text-sm">No collections recorded yet</div>
                    ) : history.filteredPayments.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 text-sm">No records match the current filters</div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-emerald-700 sticky top-0 z-10">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Date</th>
                                <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Amount</th>
                                <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Mode</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Reference</th>
                                <th className="px-4 py-3 w-20" />
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-100">
                              {history.pagedPayments.map((p) => (
                                <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="px-4 py-3 text-xs font-semibold text-slate-600 tabular-nums whitespace-nowrap">
                                    {new Date(p.paymentDate.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
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
                        {history.totalPages > 1 && (
                          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50/60">
                            <p className="text-xs text-slate-400">
                              {(history.page - 1) * history.perPage + 1}–{Math.min(history.page * history.perPage, history.filteredPayments.length)} of {history.filteredPayments.length}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => history.setPage(p => Math.max(1, p - 1))}
                                disabled={history.page === 1}
                                className="px-2.5 py-1 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                              >
                                Prev
                              </button>
                              <span className="text-xs text-slate-500 font-medium px-1">{history.page} / {history.totalPages}</span>
                              <button
                                onClick={() => history.setPage(p => Math.min(history.totalPages, p + 1))}
                                disabled={history.page === history.totalPages}
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
            )
          ) : (
            <div className="flex items-center justify-center flex-1 text-slate-400 text-sm">
              Select a salesperson from the list
            </div>
          )}
        </div>
      </div>

      {/* ── Bulk top-up modal ────────────────────────────────── */}
      <BulkTopUpModal
        open={topUpModal.isOpen}
        onClose={topUpModal.close}
        entities={salespeople}
        notify={notify}
        onSaved={async (payload) => {
          const res = await api.post('/salesperson-payments/bulk-topup', payload);
          await refreshAllBalances();
          if (selectedSpId) await fetchDetail();
          return res.data.data;
        }}
      />

      {/* ── Reset ledger modal ───────────────────────────────── */}
      <ResetLedgerModal
        open={resetModal.isOpen}
        onClose={resetModal.close}
        salespeople={salespeople}
        notify={notify}
        onConfirm={async (salespersonIds) => {
          const res = await api.post('/salespeople/reset-ledger', { salespersonIds });
          await refreshAllBalances();
          if (selectedSpId) await fetchDetail();
          return res.data.data;
        }}
      />

      {/* ── PIN modal ────────────────────────────────────────── */}
      <PinModal
        isOpen={pinModal.isOpen}
        onClose={() => { pinModal.close(); setPendingAction(null); }}
        onSuccess={onPinSuccess}
        title="Enter PIN to Edit Collection"
      />

      {/* ── Edit payment modal ─────────────────────────────── */}
      {editPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">Edit Collection</h3>
              <button onClick={() => setEditPayment(null)} className="text-slate-400 hover:text-slate-600 transition">
                <X size={16} />
              </button>
            </div>

            {/* Amount */}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.amount}
                onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {/* Date */}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Date</label>
              <input
                type="date"
                value={editForm.paymentDate}
                max={today}
                onChange={e => setEditForm(f => ({ ...f, paymentDate: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {/* Mode */}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Payment Mode</label>
              <select
                value={editForm.paymentMode}
                onChange={e => setEditForm(f => ({ ...f, paymentMode: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Reference */}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Reference</label>
              <input
                type="text"
                value={editForm.reference}
                onChange={e => setEditForm(f => ({ ...f, reference: e.target.value }))}
                placeholder="UPI ref / cheque no."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditPayment(null)}
                className="flex-1 px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={updateCollection}
                disabled={editSaving || !editForm.amount || parseFloat(editForm.amount) <= 0}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {editSaving && <TumblerSpinner size={14} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete collection confirmation */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete collection record?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => confirmDelete(deleteConfirm?.id)} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
          </>
        }
      >
        {deleteConfirm && (
          <p className="text-sm text-slate-500">
            This will permanently delete the{' '}
            <span className="font-semibold text-slate-700">{formatCurrency(deleteConfirm.amount)}</span>{' '}
            {deleteConfirm.mode ? `via ${deleteConfirm.mode}` : ''} collection record and recalculate the balance.
          </p>
        )}
      </Modal>
    </div>
  );
}
