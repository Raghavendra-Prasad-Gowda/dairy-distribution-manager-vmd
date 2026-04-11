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
      .then((r) => setSalespeople(r.data.data))
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

  const activeSp = salespeople.find((s) => String(s.id) === String(selectedSp));

  return (
    <div className="p-5 md:p-6 max-w-5xl mx-auto space-y-5">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Salesperson Collections</h1>
        <p className="text-slate-500 text-sm mt-0.5">Record cash / UPI collected from salespeople</p>
      </div>

      {/* ── Salesperson selector ─────────────────────────────────────── */}
      <div className="ddm-card p-4">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Select Salesperson
        </label>
        <select
          value={selectedSp}
          onChange={(e) => setSelectedSp(e.target.value)}
          className="w-full sm:w-72 ddm-input"
        >
          <option value="">Choose salesperson…</option>
          {salespeople.map((sp) => (
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* ── Left: balance + form ───────────────────────────────── */}
          <div className="md:col-span-1 space-y-4">
            {balance && (
              <div className={`ddm-card p-4 border-l-4 ${balance.closingBalance > 0 ? 'border-l-red-400' : 'border-l-emerald-400'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {activeSp?.name}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${balance.closingBalance > 0 ? 'badge-red' : 'badge-green'}`}>
                    {balance.closingBalance > 0 ? 'Outstanding' : 'Clear'}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Opening</span>
                    <span className="tabular-nums text-slate-700">{formatCurrency(balance.openingBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Stock Given</span>
                    <span className="tabular-nums text-blue-600">+{formatCurrency(balance.stockGiven)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Collected</span>
                    <span className="tabular-nums text-emerald-600">
                      {balance.amountPaid > 0 ? '−' : ''}{formatCurrency(balance.amountPaid)}
                    </span>
                  </div>
                  <div className="h-px bg-slate-100 my-1" />
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-800">Due</span>
                    <span className={`text-base font-bold tabular-nums ${balance.closingBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatCurrency(balance.closingBalance)}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div className="ddm-card p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
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
          <div className="md:col-span-2">
            <div className="ddm-card overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
                <h3 className="font-bold text-slate-800 text-sm">Collection History</h3>
              </div>

              {payments.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">No collections recorded</div>
              ) : (
                <>
                  {/* Table header */}
                  <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-100 px-4 py-2.5">
                    {['Date', 'Amount', 'Mode', 'Ref', ''].map((h, i) => (
                      <div
                        key={i}
                        className={`${
                          i === 0 ? 'col-span-3' :
                          i === 1 ? 'col-span-3 text-right' :
                          i === 2 ? 'col-span-3 pl-2' :
                          i === 3 ? 'col-span-2' :
                          'col-span-1'
                        } text-xs font-semibold text-slate-500 uppercase tracking-wider`}
                      >
                        {h}
                      </div>
                    ))}
                  </div>

                  {/* Rows */}
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="grid grid-cols-12 items-center px-4 py-2.5 border-b border-slate-100 hover:bg-slate-50/60 transition-colors last:border-0"
                    >
                      <div className="col-span-3 text-xs text-slate-600 tabular-nums">
                        {new Date(p.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </div>
                      <div className="col-span-3 text-right text-sm font-semibold text-emerald-700 tabular-nums">
                        {formatCurrency(p.amount)}
                      </div>
                      <div className="col-span-3 pl-2">
                        <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">
                          {p.paymentMode || 'Cash'}
                        </span>
                      </div>
                      <div className="col-span-2 text-xs text-slate-400 truncate">
                        {p.reference || '—'}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
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
