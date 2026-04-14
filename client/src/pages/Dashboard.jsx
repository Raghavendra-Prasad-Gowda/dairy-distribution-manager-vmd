import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Truck, CreditCard, AlertCircle, Loader2, ArrowRight, Users } from 'lucide-react';
import DateSelector from '../components/DateSelector';
import BalanceLedger from '../components/BalanceLedger';
import StatusBadge from '../components/StatusBadge';
import { getIndiaDate, formatCurrency } from '../utils/dateUtils';
import { BRAND_COLORS } from '../utils/constants';
import { useNotification } from '../context/NotificationContext';
import api from '../api/axios';

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function DairyPayableCard({ brandName, opening, stockValue, paid, closing }) {
  const colors  = BRAND_COLORS[brandName] ?? BRAND_COLORS['Nandini'];
  const isOwing = closing > 0;

  return (
    <div className={`ddm-card overflow-hidden border-l-4 ${isOwing ? 'border-l-red-400' : 'border-l-emerald-400'}`}>
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
          <span className="font-bold text-slate-800 text-sm">{brandName}</span>
        </div>
        <StatusBadge status={isOwing ? 'outstanding' : 'cleared'} />
      </div>
      <div className="px-4 pb-4">
        <BalanceLedger opening={opening} stockValue={stockValue} paid={paid} closing={closing} compact />
        {isOwing && (
          <Link
            to="/payments/dairy"
            className="mt-3 flex items-center justify-center gap-1.5 w-full bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold py-2 rounded-lg transition"
          >
            Pay Now <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { notify } = useNotification();
  const [date, setDate]           = useState(getIndiaDate());
  const [dairyBalances, setDairy] = useState([]);
  const [spBalances, setSp]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  useEffect(() => { fetchAll(); }, [date]);

  async function fetchAll() {
    setLoading(true);
    setError('');
    try {
      const [dairyRes, spRes] = await Promise.all([
        api.get(`/dairy-balance?date=${date}`),
        api.get(`/salesperson-balance?date=${date}`),
      ]);
      setDairy(dairyRes.data.data?.brands ?? []);
      setSp(spRes.data.data ?? []);
    } catch (e) {
      setError(e.response?.data?.error ?? 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  const totalDairyOwing = dairyBalances.reduce((s, b) => s + Math.max(0, b.closingBalance), 0);
  const totalSpOwing    = spBalances.reduce((s, b) => s + Math.max(0, b.closingBalance), 0);
  const spCleared       = spBalances.filter(b => (b.closingBalance ?? 0) <= 0).length;
  const spPending       = spBalances.length - spCleared;

  const topOwing = [...spBalances]
    .filter(b => (b.closingBalance ?? 0) > 0)
    .sort((a, b) => (b.closingBalance ?? 0) - (a.closingBalance ?? 0))
    .slice(0, 5);

  return (
    <div className="p-5 md:p-7 max-w-5xl mx-auto space-y-7">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Vikas Milk Dairy — Daily Overview</p>
        </div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={15} className="flex-shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Dairy Payables */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="ddm-section-label">Dairy Payables</h2>
              {totalDairyOwing > 0 && (
                <span className="badge-red">{formatCurrency(totalDairyOwing)} outstanding</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {dairyBalances.map(b => (
                <DairyPayableCard
                  key={b.brandId}
                  brandName={b.brandName}
                  opening={b.openingBalance}
                  stockValue={b.stockValue}
                  paid={b.amountPaid}
                  closing={b.closingBalance}
                />
              ))}
              {dairyBalances.length === 0 && (
                <div className="col-span-full ddm-card p-6 text-center text-slate-400 text-sm">
                  No dairy brands configured. Go to Setup → Products &amp; Pricing.
                </div>
              )}
            </div>
          </section>

          {/* Quick Actions */}
          <section>
            <h2 className="ddm-section-label mb-3">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { to: '/daily/receipt',   icon: Package,    label: 'Enter Stock Receipt', sub: "Record today's delivery",       color: 'bg-sky-500' },
                { to: '/daily/dispatch',  icon: Truck,      label: 'Create Dispatch',      sub: 'Allocate stock to salespeople', color: 'bg-indigo-600' },
                { to: '/payments/dairy',  icon: CreditCard, label: 'Dairy Payments',       sub: 'Pay dairy supplier',            color: 'bg-emerald-600' },
              ].map(({ to, icon: Icon, label, sub, color }) => (
                <Link
                  key={to}
                  to={to}
                  className="ddm-card p-4 flex items-center gap-3 hover:shadow-md transition-shadow group"
                >
                  <span className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="text-white" size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 group-hover:text-indigo-700 transition-colors">{label}</p>
                    <p className="text-xs text-slate-400 truncate">{sub}</p>
                  </div>
                  <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-400 transition-colors flex-shrink-0" />
                </Link>
              ))}
            </div>
          </section>

          {/* Salesperson Outstanding Summary */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="ddm-section-label">Salesperson Outstanding</h2>
              <Link
                to="/salesperson-outstanding"
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                View All <ArrowRight size={12} />
              </Link>
            </div>

            <div className="ddm-card p-5">
              {spBalances.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-4">
                  No salespeople configured. Go to Setup → Salespeople &amp; Rates.
                </p>
              ) : (
                <>
                  {/* Totals row */}
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <p className="text-3xl font-bold tabular-nums text-red-600">{formatCurrency(totalSpOwing)}</p>
                      <p className="text-sm text-slate-500 mt-1">total outstanding</p>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="flex items-center justify-end gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        <span className="text-sm font-semibold text-slate-700">{spPending} pending</span>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-sm text-emerald-600">{spCleared} cleared</span>
                      </div>
                    </div>
                  </div>

                  {/* Top owing */}
                  {topOwing.length > 0 && (
                    <div className="space-y-1 mb-4">
                      {topOwing.map(sp => {
                        const pct = Math.min(100, ((sp.closingBalance ?? 0) / Math.max(1, totalSpOwing)) * 100);
                        return (
                          <div key={sp.salespersonId} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
                            <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold text-red-600 flex-shrink-0">
                              {getInitials(sp.salespersonName)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between mb-1">
                                <span className="text-sm font-semibold text-slate-700 truncate">{sp.salespersonName}</span>
                                <span className="text-sm font-bold text-red-600 tabular-nums ml-2 flex-shrink-0">
                                  {formatCurrency(sp.closingBalance ?? 0)}
                                </span>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <Link
                    to="/salesperson-outstanding"
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-sm font-semibold text-slate-600 transition-colors"
                  >
                    <Users size={14} />
                    View All Balances
                    <ArrowRight size={13} />
                  </Link>
                </>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
