import { useState, useEffect, useMemo } from 'react';
import { Trash2, Loader2, Search, Pencil, Filter, X } from 'lucide-react';
import PaymentForm from '../../components/PaymentForm';
import StatusBadge from '../../components/StatusBadge';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import { PAYMENT_MODES } from '../../utils/constants';
import api from '../../api/axios';

const MODE_COLORS = {
  Cash:   'bg-emerald-100 text-emerald-700',
  UPI:    'bg-blue-100   text-blue-700',
  NEFT:   'bg-violet-100 text-violet-700',
  RTGS:   'bg-amber-100  text-amber-700',
  Cheque: 'bg-orange-100 text-orange-700',
};

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Premium SP balance card */
function SpBalanceCard({ sp, balance }) {
  const isOwing = (balance?.closingBalance ?? 0) > 0;
  return (
    <div className="ddm-card overflow-hidden">
      {/* Header band */}
      <div className="px-4 py-3 flex items-center justify-between bg-indigo-700">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {getInitials(sp.name)}
          </div>
          <div>
            <p className="font-bold text-sm text-white leading-tight">{sp.name}</p>
            {sp.route && <p className="text-indigo-300 text-[11px] leading-tight">{sp.route}</p>}
          </div>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${isOwing ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {isOwing ? 'Outstanding' : 'Cleared'}
        </span>
      </div>

      {/* Large balance */}
      <div className="flex flex-col items-center justify-center py-4 px-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
          {isOwing ? 'To Collect' : 'Settled'}
        </p>
        <p className={`text-3xl font-bold tabular-nums leading-none ${isOwing ? 'text-red-600' : 'text-emerald-600'}`}>
          {formatCurrency(Math.abs(balance?.closingBalance ?? 0))}
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
  const today = getIndiaDate();

  const [salespeople, setSalespeople] = useState([]);
  const [allBalances, setAllBalances] = useState({});
  const [selectedSpId, setSelectedSp] = useState(null);
  const [balance, setBalance]         = useState(null);
  const [payments, setPayments]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState('');
  const [filter, setFilter]           = useState('all');

  // Edit-a-mistake state
  const [prefill, setPrefill] = useState(null);

  // History filter state
  const [showFilter, setShowFilter]   = useState(false);
  const [filterFrom, setFilterFrom]   = useState('');
  const [filterTo,   setFilterTo]     = useState('');
  const [filterMode, setFilterMode]   = useState('');
  const [filterRef,  setFilterRef]    = useState('');

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
  }, []);

  useEffect(() => {
    if (!selectedSpId) return;
    fetchDetail();
  }, [selectedSpId]);

  async function fetchDetail() {
    setLoading(true);
    try {
      const [balRes, pmtRes] = await Promise.all([
        api.get(`/salesperson-balance/${selectedSpId}?date=${today}`),
        api.get(`/salesperson-payments?salespersonId=${selectedSpId}`),
      ]);
      setBalance(balRes.data.data);
      setPayments(pmtRes.data.data);
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function refreshAllBalances() {
    const res = await api.get(`/salesperson-balance?date=${today}`);
    const map = {};
    (res.data.data ?? []).forEach(b => { map[b.salespersonId] = b; });
    setAllBalances(map);
  }

  const handlePayment = async (formData) => {
    setSaving(true);
    try {
      await api.post('/salesperson-payments', { ...formData, salespersonId: Number(selectedSpId) });
      notify('Collection recorded successfully', 'success');
      const [balRes, pmtRes] = await Promise.all([
        api.get(`/salesperson-balance/${selectedSpId}?date=${today}`),
        api.get(`/salesperson-payments?salespersonId=${selectedSpId}`),
      ]);
      setBalance(balRes.data.data);
      setPayments(pmtRes.data.data);
      await refreshAllBalances();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to record collection', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this collection record?')) return;
    try {
      await api.delete(`/salesperson-payments/${id}`);
      notify('Record deleted', 'success');
      fetchDetail();
      refreshAllBalances();
    } catch {
      notify('Failed to delete', 'error');
    }
  };

  const handleEdit = async (p) => {
    if (!window.confirm('Delete this record and re-enter corrected values?')) return;
    try {
      await api.delete(`/salesperson-payments/${p.id}`);
      setPrefill({
        amount:      p.amount,
        paymentDate: p.paymentDate?.slice(0, 10) ?? today,
        paymentMode: p.paymentMode ?? 'Cash',
        reference:   p.reference ?? '',
      });
      notify('Record removed — correct and re-submit below', 'info');
      fetchDetail();
      refreshAllBalances();
    } catch {
      notify('Failed to edit record', 'error');
    }
  };

  const selectedSp = salespeople.find(sp => sp.id === selectedSpId);
  const totalOwing   = Object.values(allBalances).reduce((s, b) => s + Math.max(0, b.closingBalance ?? 0), 0);
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

  return (
    <div className="flex flex-col h-full">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 md:px-7 pt-5 pb-4 border-b border-slate-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Collections</h1>
          <p className="text-slate-500 text-sm">
            Record cash / UPI collected from salespeople
            {pendingCount > 0 && (
              <span className="ml-2 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                {formatCurrency(totalOwing)} outstanding · {pendingCount} pending
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Split panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel: salesperson list ───────────────────── */}
        <div className="w-60 md:w-68 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col" style={{ width: '17rem' }}>
          {/* Search + filter */}
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name or route…"
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50"
              />
            </div>
            <div className="flex gap-1">
              {[['all', 'All'], ['pending', 'Pending'], ['cleared', 'Cleared']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={`flex-1 text-xs py-1.5 rounded-lg font-semibold transition ${
                    filter === val
                      ? 'bg-indigo-700 text-white'
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
              const owing      = (bal?.closingBalance ?? 0) > 0;

              return (
                <button
                  key={sp.id}
                  onClick={() => { setSelectedSp(sp.id); setPrefill(null); }}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                    isSelected
                      ? 'bg-indigo-50 border-l-4 border-l-indigo-600'
                      : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                      isSelected ? 'bg-indigo-600 text-white' : owing ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {getInitials(sp.name)}
                    </div>
                    <span className={`text-sm font-semibold flex-1 truncate ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>
                      {sp.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pl-8">
                    {sp.route && <p className="text-xs text-slate-400 truncate">{sp.route}</p>}
                    {bal && (
                      <span className={`text-xs font-bold tabular-nums flex-shrink-0 ml-auto ${owing ? 'text-red-600' : 'text-emerald-600'}`}>
                        {owing ? formatCurrency(bal.closingBalance) : '✓'}
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
              <div className="flex items-center justify-center flex-1 py-16">
                <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
              </div>
            ) : (
              <div className="p-5 md:p-6 grid grid-cols-1 lg:grid-cols-5 gap-5">

                {/* Balance card + form */}
                <div className="lg:col-span-2 space-y-4">
                  {balance && <SpBalanceCard sp={selectedSp} balance={balance} />}

                  <div className="ddm-card p-4">
                    <h3 className="ddm-section-label mb-3">
                      {prefill ? 'Correct & Re-enter' : 'Record Collection'}
                    </h3>
                    <PaymentForm
                      onSubmit={handlePayment}
                      closingBalance={balance?.closingBalance ?? 0}
                      loading={saving}
                      prefill={prefill}
                      onClearPrefill={() => setPrefill(null)}
                      submitLabel={prefill ? 'Save Correction' : 'Record Collection'}
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
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-white text-slate-500 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                        }`}
                      >
                        <Filter size={12} />
                        Filter
                        {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                      </button>
                    </div>

                    {/* Filter controls */}
                    {showFilter && (
                      <div className="px-4 py-3 bg-indigo-50/60 border-b border-indigo-100 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">From</label>
                          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} max={today}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">To</label>
                          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} max={today}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Mode</label>
                          <select value={filterMode} onChange={e => setFilterMode(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                            <option value="">All</option>
                            {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Reference</label>
                          <div className="relative">
                            <input type="text" value={filterRef} onChange={e => setFilterRef(e.target.value)} placeholder="Search…"
                              className="w-full pl-2 pr-6 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
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
                      <div className="text-center py-12 text-slate-400 text-sm">No collections recorded yet</div>
                    ) : filteredPayments.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 text-sm">No records match the current filters</div>
                    ) : (
                      <>
                        {/* Table header */}
                        <div className="grid grid-cols-12 items-center px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                          <div className="col-span-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</div>
                          <div className="col-span-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount</div>
                          <div className="col-span-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mode</div>
                          <div className="col-span-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-2">Reference</div>
                          <div className="col-span-2" />
                        </div>

                        {filteredPayments.map((p, idx) => (
                          <div
                            key={p.id}
                            className={`grid grid-cols-12 items-center px-4 py-3 border-b border-slate-100 hover:bg-slate-50/80 transition-colors last:border-0 ${idx % 2 === 0 ? '' : 'bg-slate-50/30'}`}
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
                                className="p-1.5 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition"
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
            )
          ) : (
            <div className="flex items-center justify-center flex-1 text-slate-400 text-sm">
              Select a salesperson from the list
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
