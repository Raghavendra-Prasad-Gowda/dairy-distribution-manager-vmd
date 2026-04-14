import { useState, useEffect } from 'react';
import { Trash2, Loader2, Search } from 'lucide-react';
import PaymentForm from '../../components/PaymentForm';
import BalanceLedger from '../../components/BalanceLedger';
import StatusBadge from '../../components/StatusBadge';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function SalespersonCollections() {
  const { notify } = useNotification();
  const today = getIndiaDate();

  const [salespeople, setSalespeople] = useState([]);
  const [allBalances, setAllBalances] = useState({}); // { [spId]: balance }
  const [selectedSpId, setSelectedSp] = useState(null);
  const [balance, setBalance]         = useState(null);
  const [payments, setPayments]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState('');
  const [filter, setFilter]           = useState('all'); // 'all' | 'pending' | 'cleared'

  // Load salespeople + all their balances
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

  // Load detail for selected salesperson
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

  const handlePayment = async (formData) => {
    setSaving(true);
    try {
      await api.post('/salesperson-payments', { ...formData, salespersonId: Number(selectedSpId) });
      notify('Collection recorded successfully', 'success');
      // Refresh both detail and list balances
      const [balRes, pmtRes, allBalRes] = await Promise.all([
        api.get(`/salesperson-balance/${selectedSpId}?date=${today}`),
        api.get(`/salesperson-payments?salespersonId=${selectedSpId}`),
        api.get(`/salesperson-balance?date=${today}`),
      ]);
      setBalance(balRes.data.data);
      setPayments(pmtRes.data.data);
      const map = {};
      (allBalRes.data.data ?? []).forEach(b => { map[b.salespersonId] = b; });
      setAllBalances(map);
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
    } catch {
      notify('Failed to delete', 'error');
    }
  };

  const selectedSp = salespeople.find(sp => sp.id === selectedSpId);

  const filteredSps = salespeople.filter(sp => {
    const nameMatch = sp.name.toLowerCase().includes(search.toLowerCase()) ||
      (sp.route ?? '').toLowerCase().includes(search.toLowerCase());
    if (!nameMatch) return false;
    const bal = allBalances[sp.id];
    const owing = (bal?.closingBalance ?? 0) > 0;
    if (filter === 'pending') return owing;
    if (filter === 'cleared') return !owing;
    return true;
  });

  const totalOwing   = Object.values(allBalances).reduce((s, b) => s + Math.max(0, b.closingBalance ?? 0), 0);
  const pendingCount = Object.values(allBalances).filter(b => (b.closingBalance ?? 0) > 0).length;

  return (
    <div className="flex flex-col h-full">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 md:px-7 pt-5 pb-4 border-b border-slate-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Salesperson Collections</h1>
          <p className="text-slate-500 text-sm">
            Record cash / UPI collected from salespeople
            {pendingCount > 0 && (
              <span className="ml-2 badge-red">{formatCurrency(totalOwing)} outstanding · {pendingCount} pending</span>
            )}
          </p>
        </div>
      </div>

      {/* Split panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel — salesperson list */}
        <div className="w-64 md:w-72 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
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
                  onClick={() => setSelectedSp(sp.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                    isSelected
                      ? 'bg-indigo-50 border-l-4 border-l-indigo-600'
                      : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-sm font-semibold flex-1 truncate ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>
                      {sp.name}
                    </span>
                    {bal && (
                      <StatusBadge
                        status={owing ? 'outstanding' : 'cleared'}
                        amount={owing ? bal.closingBalance : undefined}
                      />
                    )}
                  </div>
                  {sp.route && <p className="text-xs text-slate-400">{sp.route}</p>}
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-100 px-4 py-2 bg-slate-50">
            <p className="text-xs text-slate-500">{salespeople.length} total · {pendingCount} pending</p>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50">
          {selectedSp ? (
            <>
              {/* Selected person header */}
              <div className="px-5 py-2.5 bg-indigo-700 text-white flex items-center gap-3">
                <span className="font-bold text-sm">{selectedSp.name}</span>
                {selectedSp.route && <span className="text-indigo-200 text-xs">· {selectedSp.route}</span>}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                </div>
              ) : (
                <div className="p-5 grid grid-cols-1 lg:grid-cols-5 gap-5">

                  {/* Balance + payment form (2 cols on lg) */}
                  <div className="lg:col-span-2 space-y-4">

                    {/* Balance ledger */}
                    {balance && (
                      <div className={`ddm-card p-4 border-l-4 ${balance.closingBalance > 0 ? 'border-l-red-400' : 'border-l-emerald-400'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-bold text-slate-800 text-sm">{selectedSp.name}</span>
                          <StatusBadge status={balance.closingBalance > 0 ? 'outstanding' : 'cleared'} />
                        </div>
                        <BalanceLedger
                          opening={balance.openingBalance}
                          stockValue={balance.stockGiven}
                          paid={balance.amountPaid}
                          closing={balance.closingBalance}
                          compact
                        />
                        {balance.closingBalance > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-xs text-slate-500">YOU OWE</span>
                            <span className="text-xl font-bold text-red-600 tabular-nums">
                              {formatCurrency(balance.closingBalance)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Payment form */}
                    <div className="ddm-card p-4">
                      <h3 className="ddm-section-label mb-3">Record Collection</h3>
                      <PaymentForm
                        onSubmit={handlePayment}
                        closingBalance={balance?.closingBalance ?? 0}
                        loading={saving}
                      />
                    </div>
                  </div>

                  {/* Payment history (3 cols on lg) */}
                  <div className="lg:col-span-3">
                    <div className="ddm-card overflow-hidden">
                      <div className="bg-slate-50 border-b border-slate-200 px-5 py-3">
                        <h3 className="font-bold text-slate-800 text-sm">Collection History</h3>
                      </div>

                      {payments.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 text-sm">No collections recorded yet</div>
                      ) : (
                        <>
                          <div className="flex items-center px-5 py-3 bg-slate-50 border-b border-slate-100">
                            <div className="w-20 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</div>
                            <div className="flex-1 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</div>
                            <div className="w-20 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Mode</div>
                            <div className="w-28 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:block">Reference</div>
                            <div className="w-8" />
                          </div>

                          {payments.map(p => (
                            <div
                              key={p.id}
                              className="flex items-center px-5 py-3.5 border-b border-slate-100 hover:bg-slate-50/60 transition-colors last:border-0"
                            >
                              <div className="w-20 text-sm text-slate-600 tabular-nums">
                                {new Date(p.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                              </div>
                              <div className="flex-1 text-right text-sm font-bold text-emerald-700 tabular-nums">
                                {formatCurrency(p.amount)}
                              </div>
                              <div className="w-20 flex justify-center">
                                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-semibold">
                                  {p.paymentMode || 'Cash'}
                                </span>
                              </div>
                              <div className="w-28 text-xs text-slate-400 truncate hidden sm:block">
                                {p.reference || '—'}
                              </div>
                              <div className="w-8 flex justify-end">
                                <button
                                  onClick={() => handleDelete(p.id)}
                                  className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
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
