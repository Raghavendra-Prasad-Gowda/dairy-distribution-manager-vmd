import { useState, useEffect } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import BalanceSummaryCard from '../../components/BalanceSummaryCard';
import PaymentForm from '../../components/PaymentForm';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function DairyPayments() {
  const { notify } = useNotification();
  const [brands, setBrands]        = useState([]);
  const [activeBrandId, setActive] = useState(null);
  const [balance, setBalance]      = useState(null);
  const [payments, setPayments]    = useState([]);
  const [loading, setLoading]      = useState(false);
  const [saving, setSaving]        = useState(false);
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

  const activeBrand = brands.find(b => b.id === activeBrandId);

  return (
    <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dairy Payments</h1>
        <p className="text-slate-500 text-sm mt-1">Record payments to dairy suppliers</p>
      </div>

      {brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActive} />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        </div>
      ) : (
        /* On iPad: stacked. On desktop (lg+): sidebar layout */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Left: balance card + form ──────────────────────────── */}
          <div className="lg:col-span-1 space-y-4">

            {/* 1. Brand money details */}
            {balance && (
              <BalanceSummaryCard
                brandName={activeBrand?.name ?? ''}
                opening={balance.openingBalance}
                stockValue={balance.stockValue}
                paid={balance.amountPaid}
                closing={balance.closingBalance}
              />
            )}

            {/* 2. Record payment */}
            <div className="ddm-card p-5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
                Record Payment
              </h3>
              <PaymentForm
                onSubmit={handlePayment}
                closingBalance={balance?.closingBalance ?? 0}
                loading={saving}
              />
            </div>
          </div>

          {/* ── Right: payment history ─────────────────────────────── */}
          <div className="lg:col-span-2">
            <div className="ddm-card overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5">
                <h3 className="font-bold text-slate-800 text-sm">Payment History</h3>
              </div>

              {payments.length === 0 ? (
                <div className="text-center py-14 text-slate-400 text-sm">No payments recorded yet</div>
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
