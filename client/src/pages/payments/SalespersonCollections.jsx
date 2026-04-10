import { useState, useEffect } from 'react';
import { Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import BalanceSummaryCard from '../../components/BalanceSummaryCard';
import PaymentForm from '../../components/PaymentForm';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function SalespersonCollections() {
  const [salespeople, setSalespeople] = useState([]);
  const [selectedSp, setSelectedSp]   = useState('');
  const [balance, setBalance]         = useState(null);
  const [payments, setPayments]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [notification, setNotif]      = useState(null);
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

  const notify = (message, type = 'success') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

  const handlePayment = async (formData) => {
    setSaving(true);
    try {
      await api.post('/salesperson-payments', { ...formData, salespersonId: Number(selectedSp) });
      notify('Collection recorded successfully');
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
      notify('Record deleted');
      fetchAll();
    } catch {
      notify('Failed to delete', 'error');
    }
  };

  const activeSp = salespeople.find((s) => String(s.id) === String(selectedSp));

  const balCard = balance
    ? {
        brandName: activeSp?.name ?? '',
        opening:    balance.openingBalance,
        stockValue: balance.stockGiven,
        paid:       balance.amountPaid,
        closing:    balance.closingBalance,
      }
    : null;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}
          style={{ animation: 'popIn 0.25s ease' }}
        >
          {notification.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {notification.message}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Salesperson Collections</h1>
        <p className="text-gray-500 text-sm">Record cash/UPI collected from salespeople</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Salesperson</label>
        <select
          value={selectedSp}
          onChange={(e) => setSelectedSp(e.target.value)}
          className="w-full sm:w-72 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
        >
          <option value="">Choose salesperson…</option>
          {salespeople.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
        </select>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        </div>
      )}

      {!loading && selectedSp && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-4">
            {balCard && (
              <div className="ddm-card p-5">
                <div className="font-bold text-gray-900 mb-4 text-sm">{activeSp?.name} — Today's Balance</div>
                <div className="space-y-2.5 text-sm">
                  {[
                    { label: 'Opening',     val: balCard.opening,    color: 'text-gray-700' },
                    { label: 'Stock Given', val: balCard.stockValue,  color: 'text-blue-600' },
                    { label: 'Collected',   val: balCard.paid,        color: 'text-green-600' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="flex justify-between items-center text-gray-500">
                      <span>{label}</span>
                      <span className={`font-medium ${color}`}>{formatCurrency(val)}</span>
                    </div>
                  ))}
                  <div className="h-px bg-gray-100" />
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900">Due</span>
                    <span className={`text-lg font-bold ${balCard.closing > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(balCard.closing)}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div className="ddm-card p-4">
              <h3 className="font-bold text-gray-800 mb-4 text-sm">Record Collection</h3>
              <PaymentForm
                onSubmit={handlePayment}
                closingBalance={balance?.closingBalance ?? 0}
                loading={saving}
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="ddm-card overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-100 px-4 py-3">
                <h3 className="font-bold text-gray-800 text-sm">Collection History</h3>
              </div>
              {payments.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">No collections recorded</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[380px]">
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
                          <td className="px-4 py-3 text-gray-700">
                            {new Date(p.paymentDate).toLocaleDateString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-green-700">
                            {formatCurrency(p.amount)}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{p.paymentMode || '—'}</td>
                          <td className="px-4 py-3 text-gray-500 truncate max-w-[120px]">{p.reference || '—'}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
