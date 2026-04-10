import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Truck, CreditCard, TrendingUp, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import DateSelector from '../components/DateSelector';
import BalanceSummaryCard from '../components/BalanceSummaryCard';
import { getIndiaDate, formatCurrency } from '../utils/dateUtils';
import api from '../api/axios';

export default function Dashboard() {
  const [date, setDate]               = useState(getIndiaDate());
  const [dairyBalances, setDairy]     = useState([]);
  const [spBalances, setSp]           = useState([]);
  const [brands, setBrands]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');

  useEffect(() => {
    fetchAll();
  }, [date]);

  async function fetchAll() {
    setLoading(true);
    setError('');
    try {
      const [dairyRes, spRes, brandsRes] = await Promise.all([
        api.get(`/dairy-balance?date=${date}`),
        api.get(`/salesperson-balance?date=${date}`),
        api.get('/brands'),
      ]);
      setDairy(dairyRes.data.data?.brands ?? []);
      setSp(spRes.data.data ?? []);
      setBrands(brandsRes.data.data ?? []);
    } catch (e) {
      setError(e.response?.data?.error ?? 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  const totalOwing     = dairyBalances.reduce((s, b) => s + Math.max(0, b.closingBalance), 0);
  const spTotalOwing   = spBalances.reduce((s, b) => s + Math.max(0, b.closingBalance), 0);

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Vikas Milk Dairy — Distribution Overview</p>
        </div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Dairy Payables ─────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-800">Dairy Payables</h2>
              {totalOwing > 0 && (
                <span className="badge-red text-sm">{formatCurrency(totalOwing)} outstanding</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {dairyBalances.map((b) => (
                <BalanceSummaryCard
                  key={b.brandId}
                  brandName={b.brandName}
                  opening={b.openingBalance}
                  stockValue={b.stockValue}
                  paid={b.amountPaid}
                  closing={b.closingBalance}
                  payLink="/payments/dairy"
                />
              ))}
            </div>
          </section>

          {/* ── Quick Actions ──────────────────────────────────────── */}
          <section>
            <h2 className="text-base font-bold text-gray-800 mb-3">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { to: '/daily/receipt',   icon: Package,  label: 'Enter Stock Receipt',    color: 'bg-blue-500' },
                { to: '/daily/dispatch',  icon: Truck,    label: 'Create Dispatch',         color: 'bg-indigo-500' },
                { to: '/payments/dairy',  icon: CreditCard, label: 'Record Dairy Payment', color: 'bg-teal-600' },
              ].map(({ to, icon: Icon, label, color }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-3 ddm-card p-4 hover:shadow-md transition-shadow group"
                >
                  <span className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="text-white" size={18} />
                  </span>
                  <span className="font-semibold text-sm text-gray-800 group-hover:text-teal-700 flex-1">{label}</span>
                  <ArrowRight size={14} className="text-gray-400 group-hover:text-teal-600 transition" />
                </Link>
              ))}
            </div>
          </section>

          {/* ── Salesperson Outstanding ────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-800">Salesperson Outstanding</h2>
              {spTotalOwing > 0 && (
                <span className="badge-red">{formatCurrency(spTotalOwing)} total</span>
              )}
            </div>
            <div className="ddm-card overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Salesperson</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Opening</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Stock Given</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Paid</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Outstanding</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {spBalances.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-400 py-8">No salespeople configured</td>
                    </tr>
                  ) : (
                    spBalances.map((sp) => {
                      const closing = sp.closingBalance ?? 0;
                      const badgeCls = closing === 0 ? 'badge-green' : closing < 500 ? 'badge-amber' : 'badge-red';
                      return (
                        <tr key={sp.salespersonId} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 font-semibold text-gray-900">{sp.salespersonName}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(sp.openingBalance)}</td>
                          <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(sp.stockGiven)}</td>
                          <td className="px-4 py-3 text-right text-green-600">{formatCurrency(sp.amountPaid)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={badgeCls}>{formatCurrency(closing)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Link to="/payments/salespeople" className="text-teal-600 hover:text-teal-700 text-xs font-medium">
                              Collect →
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
