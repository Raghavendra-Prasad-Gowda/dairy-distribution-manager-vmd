import { useState, useEffect } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import PaymentForm from '../../components/PaymentForm';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function SalespersonCollections() {
  const { notify } = useNotification();
  const [salespeople, setSalespeople] = useState([]);
  const [selectedSp, setSelectedSp]  = useState('');
  const [balance, setBalance]        = useState(null);
  const [payments, setPayments]      = useState([]);
  const [loading, setLoading]        = useState(false);
  const [saving, setSaving]          = useState(false);
  const today = getIndiaDate();

  useEffect(() => {
    api.get('/salespeople')
      .then(r => setSalespeople(r.data.data))
      .catch(() => notify('Failed to load salespeople', 'error'));
  }, []);

  useEffect(() => {
    if (!selectedSp) return;
    fetchAll();
  }, [selectedSp]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [balRes, pmtRes] = await Promise.all([
        api.get(`/salesperson-balance/${selectedSp}?date=${today}`),
        api.get(`/salesperson-payments?salespersonId=${selectedSp}`),
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
      await api.post('/salesperson-payments', { ...formData, salespersonId: Number(selectedSp) });
      notify('Collection recorded successfully', 'success');
      fetchAll();
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
      fetchAll();
    } catch {
      notify('Failed to delete', 'error');
    }
  };

  const activeSp = salespeople.find(s => String(s.id) === String(selectedSp));

  return (
    <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Salesperson Collections</h1>
        <p className="text-slate-500 text-sm mt-1">Record cash / UPI collected from salespeople</p>
      </div>

      {/* Salesperson selector */}
      <div className="ddm-card p-4">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Select Salesperson
        </label>
        <select
          value={selectedSp}
          onChange={e => setSelectedSp(e.target.value)}
          className="w-full ddm-input"
        >
          <option value="">Choose salesperson…</option>
          {salespeople.map(sp => (
            <option key={sp.id} value={sp.id}>
              {sp.name}{sp.route ? ` — ${sp.route}` : ''}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        </div>
      )}

      {!loading && selectedSp && (
        /* On iPad: stacked. On desktop (lg+): sidebar layout */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Left: balance + form ───────────────────────────────── */}
          <div className="lg:col-span-1 space-y-4">

            {/* 1. Person's balance details */}
            {balance && (
              <div className={`ddm-card p-5 border-l-4 ${balance.closingBalance > 0 ? 'border-l-red-400' : 'border-l-emerald-400'}`}>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-bold text-slate-800">{activeSp?.name}</span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${balance.closingBalance > 0 ? 'badge-red' : 'badge-green'}`}>
                    {balance.closingBalance > 0 ? 'Outstanding' : 'Clear'}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-500">
                    <span>Opening</span>
                    <span className="tabular-nums text-slate-700">{formatCurrency(balance.openingBalance)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Stock Given</span>
                    <span className="tabular-nums text-blue-600">+{formatCurrency(balance.stockGiven)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Collected</span>
                    <span className="tabular-nums text-emerald-600">
                      {balance.amountPaid > 0 ? '−' : ''}{formatCurrency(balance.amountPaid)}
                    </span>
                  </div>
                  <div className="h-px bg-slate-100 my-1" />
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800">Due</span>
                    <span className={`text-lg font-bold tabular-nums ${balance.closingBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatCurrency(balance.closingBalance)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Record collection */}
            <div className="ddm-card p-5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
                Record Collection
              </h3>
              <PaymentForm
                onSubmit={handlePayment}
                closingBalance={balance?.closingBalance ?? 0}
                loading={saving}
              />
            </div>
          </div>

          {/* ── Right: collection history ──────────────────────────── */}
          <div className="lg:col-span-2">
            <div className="ddm-card overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5">
                <h3 className="font-bold text-slate-800 text-sm">Collection History</h3>
              </div>

              {payments.length === 0 ? (
                <div className="text-center py-14 text-slate-400 text-sm">No collections recorded yet</div>
              ) : (
                <>
                  {/* History table header */}
                  <div className="flex items-center px-5 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="w-24 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</div>
                    <div className="flex-1 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</div>
                    <div className="w-24 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Mode</div>
                    <div className="w-32 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:block">Reference</div>
                    <div className="w-8" />
                  </div>

                  {payments.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center px-5 py-3.5 border-b border-slate-100 hover:bg-slate-50/60 transition-colors last:border-0"
                    >
                      <div className="w-24 text-sm text-slate-600 tabular-nums">
                        {new Date(p.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </div>
                      <div className="flex-1 text-right text-sm font-bold text-emerald-700 tabular-nums">
                        {formatCurrency(p.amount)}
                      </div>
                      <div className="w-24 flex justify-center">
                        <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-semibold">
                          {p.paymentMode || 'Cash'}
                        </span>
                      </div>
                      <div className="w-32 text-xs text-slate-400 truncate hidden sm:block">
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
    </div>
  );
}
