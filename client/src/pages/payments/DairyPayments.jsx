import { useState, useEffect } from 'react';
import { Trash2, Plus, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import BalanceSummaryCard from '../../components/BalanceSummaryCard';
import PaymentForm from '../../components/PaymentForm';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function DairyPayments() {
  const [brands, setBrands]         = useState([]);
  const [activeBrandId, setActive]  = useState(null);
  const [balance, setBalance]       = useState(null);
  const [payments, setPayments]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [notification, setNotif]    = useState(null); // { message, type }
  const today = getIndiaDate();

  useEffect(() => {
    api.get('/brands').then((r) => {
      const b = r.data.data;
      setBrands(b);
      if (b.length) setActive(b[0].id);
    });
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
    } finally {
      setLoading(false);
    }
  }

  const handlePayment = async (formData) => {
    setSaving(true);
    try {
      await api.post('/dairy-payments', { ...formData, brandId: activeBrandId });
      setNotif({ message: 'Payment recorded successfully', type: 'success' });
      fetchAll();
    } catch (e) {
      setNotif({ message: e.response?.data?.error ?? 'Failed to record payment', type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setNotif(null), 4000);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this payment?')) return;
    try {
      await api.delete(`/dairy-payments/${id}`);
      setNotif({ message: 'Payment deleted', type: 'success' });
      fetchAll();
    } catch (e) {
      setNotif({ message: 'Failed to delete payment', type: 'error' });
    } finally {
      setTimeout(() => setNotif(null), 4000);
    }
  };

  const activeBrand = brands.find((b) => b.id === activeBrandId);

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Notification toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`} style={{ animation: 'popIn 0.25s ease' }}>
          {notification.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {notification.message}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dairy Payments</h1>
        <p className="text-gray-500 text-sm">Record payments to dairy suppliers</p>
      </div>

      {brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActive} />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-teal-600 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: balance + form */}
          <div className="lg:col-span-1 space-y-4">
            {balance && (
              <BalanceSummaryCard
                brandName={activeBrand?.name ?? ''}
                opening={balance.openingBalance}
                stockValue={balance.stockValue}
                paid={balance.amountPaid}
                closing={balance.closingBalance}
              />
            )}
            <div className="ddm-card p-4">
              <h3 className="font-bold text-gray-800 mb-4 text-sm">Record Payment</h3>
              <PaymentForm
                onSubmit={handlePayment}
                closingBalance={balance?.closingBalance ?? 0}
                loading={saving}
              />
            </div>
          </div>

          {/* Right: payment history */}
          <div className="lg:col-span-2">
            <div className="ddm-card overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-100 px-4 py-3">
                <h3 className="font-bold text-gray-800 text-sm">Payment History</h3>
              </div>
              {payments.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">No payments recorded yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Amount</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Mode</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Ref</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">{new Date(p.paymentDate).toLocaleDateString('en-IN')}</td>
                        <td className="px-4 py-3 text-right font-semibold text-green-700">{formatCurrency(p.amount)}</td>
                        <td className="px-4 py-3 text-gray-500">{p.paymentMode || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 truncate max-w-[120px]">{p.reference || '—'}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleDelete(p.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
