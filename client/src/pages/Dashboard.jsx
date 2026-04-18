import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Truck, CreditCard, AlertCircle, Loader2, ArrowRight, Users } from 'lucide-react';
import DateSelector from '../components/DateSelector';
import { getIndiaDate, formatCurrency } from '../utils/dateUtils';
import { BRAND_COLORS } from '../utils/constants';
import { useNotification } from '../context/NotificationContext';
import api from '../api/axios';

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Premium dairy payable card — brand-colored header, large owe amount, breakdown row */
function DairyPayableCard({ brandName, opening, stockValue, paid, closing }) {
  const colors  = BRAND_COLORS[brandName] ?? BRAND_COLORS['Nandini'];
  const isOwing = closing > 0;

  return (
    <div className="ddm-card overflow-hidden flex flex-col">
      {/* Brand header band */}
      <div className={`px-4 py-3 flex items-center justify-between ${colors.bg} border-b ${colors.border}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
          <span className={`font-bold text-sm ${colors.text}`}>{brandName}</span>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${isOwing ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {isOwing ? 'Outstanding' : 'Cleared'}
        </span>
      </div>

      {/* Large balance amount */}
      <div className="flex-1 flex flex-col items-center justify-center py-4 px-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
          {isOwing ? 'You Owe' : 'Settled'}
        </p>
        <p className={`text-2xl font-bold tabular-nums leading-none ${isOwing ? 'text-red-600' : 'text-emerald-600'}`}>
          {formatCurrency(Math.abs(closing))}
        </p>
      </div>

      {/* Breakdown row */}
      <div className="grid grid-cols-3 border-t border-slate-100 bg-slate-50/60">
        {[
          { label: 'Opening', value: opening,    cls: 'text-slate-600' },
          { label: 'Stock',   value: stockValue, cls: 'text-blue-600' },
          { label: 'Paid',    value: paid,       cls: 'text-emerald-600' },
        ].map(({ label, value, cls }, i) => (
          <div key={label} className={`py-2.5 text-center ${i < 2 ? 'border-r border-slate-200' : ''}`}>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-0.5">{label}</p>
            <p className={`text-xs font-bold tabular-nums ${cls}`}>{formatCurrency(value)}</p>
          </div>
        ))}
      </div>

      {/* Pay Now */}
      {isOwing && (
        <div className="px-3 py-2.5 border-t border-slate-100">
          <Link
            to="/dairy/payments"
            className="flex items-center justify-center gap-1.5 w-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold py-2 rounded-xl transition"
          >
            Pay Now <ArrowRight size={12} />
          </Link>
        </div>
      )}
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
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">

      {/* ── Header: title + date nav ───────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">Dashboard</h1>
          <p className="text-slate-400 text-xs mt-0.5">Vikas Milk Dairy · Distribution Manager</p>
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
          <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* ── 1. Quick Actions ────────────────────────────── */}
          <section>
            <p className="ddm-section-label mb-2.5">Quick Actions</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { to: '/dairy/stock/nandini', icon: Package,    label: 'Stock Receipt', color: 'bg-blue-600' },
                { to: '/salesman/dispatch',   icon: Truck,      label: 'Dispatch',      color: 'bg-emerald-600' },
                { to: '/dairy/payments',      icon: CreditCard, label: 'Dairy Payments',color: 'bg-emerald-600' },
              ].map(({ to, icon: Icon, label, color }) => (
                <Link
                  key={to}
                  to={to}
                  className="ddm-card p-3 md:p-4 flex flex-col items-center gap-2.5 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
                >
                  <span className={`w-11 h-11 rounded-2xl ${color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    <Icon className="text-white" size={19} />
                  </span>
                  <p className="font-semibold text-xs md:text-sm text-slate-700 group-hover:text-blue-700 transition-colors leading-tight">
                    {label}
                  </p>
                </Link>
              ))}
            </div>
          </section>

          {/* ── 2. Dairy Payables ────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="ddm-section-label">Dairy Payables</p>
              {totalDairyOwing > 0 && (
                <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                  {formatCurrency(totalDairyOwing)} total
                </span>
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
                  No dairy brands configured.
                </div>
              )}
            </div>
          </section>

          {/* ── 3. Salesperson Outstanding ───────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="ddm-section-label">Salesperson Outstanding</p>
              <Link
                to="/salesperson-outstanding"
                className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
              >
                View All <ArrowRight size={12} />
              </Link>
            </div>

            <div className="ddm-card p-4">
              {spBalances.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-4">No salespeople configured.</p>
              ) : (
                <>
                  {/* Summary */}
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-red-600">{formatCurrency(totalSpOwing)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">total outstanding</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-center">
                        <p className="text-lg font-bold text-amber-600">{spPending}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Pending</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-emerald-600">{spCleared}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Cleared</p>
                      </div>
                    </div>
                  </div>

                  {/* Top owing */}
                  {topOwing.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {topOwing.map(sp => {
                        const pct = Math.min(100, ((sp.closingBalance ?? 0) / Math.max(1, totalSpOwing)) * 100);
                        return (
                          <div key={sp.salespersonId} className="flex items-center gap-3">
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
                    className="flex items-center justify-center gap-2 w-full py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-600 transition-colors"
                  >
                    <Users size={13} /> View All Balances <ArrowRight size={12} />
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
