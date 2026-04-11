import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Truck, CreditCard, AlertCircle, Loader2, ArrowRight, TrendingUp } from 'lucide-react';
import DateSelector from '../components/DateSelector';
import { getIndiaDate, formatCurrency } from '../utils/dateUtils';
import { BRAND_COLORS } from '../utils/constants';
import { useNotification } from '../context/NotificationContext';
import api from '../api/axios';

function DairyCard({ brandName, opening, stockValue, paid, closing }) {
  const colors  = BRAND_COLORS[brandName] ?? BRAND_COLORS['Nandini'];
  const isOwing = closing > 0;
  return (
    <div className={`ddm-card p-4 border-l-4 ${isOwing ? 'border-l-red-400' : 'border-l-emerald-400'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
          <span className="font-bold text-slate-800 text-sm">{brandName}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isOwing ? 'badge-red' : 'badge-green'}`}>
          {isOwing ? 'Outstanding' : 'Clear'}
        </span>
      </div>
      <div className="space-y-1.5 text-xs text-slate-500">
        <div className="flex justify-between"><span>Opening</span><span className="tabular-nums text-slate-700">{formatCurrency(opening)}</span></div>
        <div className="flex justify-between"><span>Stock Value</span><span className="tabular-nums text-blue-600">+{formatCurrency(stockValue)}</span></div>
        <div className="flex justify-between"><span>Paid</span><span className="tabular-nums text-emerald-600">{paid > 0 ? '−' : ''}{formatCurrency(paid)}</span></div>
        <div className="h-px bg-slate-100 my-1" />
        <div className="flex justify-between items-center">
          <span className="font-semibold text-slate-800">Closing</span>
          <span className={`text-base font-bold tabular-nums ${isOwing ? 'text-red-600' : 'text-emerald-600'}`}>
            {formatCurrency(closing)}
          </span>
        </div>
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

  return (
    <div className="p-5 md:p-6 max-w-5xl mx-auto space-y-6">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
          <Loader2 className="w-7 h-7 text-teal-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Dairy Payables ──────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Dairy Payables</h2>
              {totalDairyOwing > 0 && (
                <span className="badge-red">{formatCurrency(totalDairyOwing)} outstanding</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {dairyBalances.map(b => (
                <DairyCard
                  key={b.brandId}
                  brandName={b.brandName}
                  opening={b.openingBalance}
                  stockValue={b.stockValue}
                  paid={b.amountPaid}
                  closing={b.closingBalance}
                />
              ))}
              {dairyBalances.length === 0 && (
                <div className="col-span-3 ddm-card p-6 text-center text-slate-400 text-sm">
                  No dairy brands configured. Go to Setup → Products &amp; Pricing.
                </div>
              )}
            </div>
          </section>

          {/* ── Quick Actions ───────────────────────────────────────── */}
          <section>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { to: '/daily/receipt',   icon: Package,    label: 'Enter Stock Receipt', sub: 'Record today\'s delivery',      color: 'bg-blue-500' },
                { to: '/daily/dispatch',  icon: Truck,      label: 'Create Dispatch',      sub: 'Allocate stock to salespeople', color: 'bg-indigo-500' },
                { to: '/payments/dairy',  icon: CreditCard, label: 'Record Payment',       sub: 'Pay dairy supplier',           color: 'bg-teal-600' },
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
                    <p className="font-semibold text-sm text-slate-800 group-hover:text-teal-700 transition-colors">{label}</p>
                    <p className="text-xs text-slate-400 truncate">{sub}</p>
                  </div>
                  <ArrowRight size={14} className="text-slate-300 group-hover:text-teal-500 transition-colors flex-shrink-0" />
                </Link>
              ))}
            </div>
          </section>

          {/* ── Salesperson Outstanding ─────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Salesperson Outstanding</h2>
              {totalSpOwing > 0 && (
                <span className="badge-red">{formatCurrency(totalSpOwing)} total</span>
              )}
            </div>

            <div className="ddm-card overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-200 px-4 py-2.5">
                {['Salesperson', 'Opening', 'Given', 'Paid', 'Due', ''].map((h, i) => (
                  <div key={i} className={`${
                    i === 0 ? 'col-span-4' : i === 4 ? 'col-span-2' : i === 5 ? 'col-span-1' : 'col-span-1'
                  } ${i > 0 && i < 5 ? 'text-right' : ''} text-xs font-semibold text-slate-500 uppercase tracking-wider`}>
                    {h}
                  </div>
                ))}
              </div>

              {spBalances.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">
                  No salespeople configured. Go to Setup → Salespeople &amp; Rates.
                </div>
              ) : (
                spBalances.map(sp => {
                  const closing = sp.closingBalance ?? 0;
                  const badgeCls = closing === 0 ? 'badge-green' : closing < 500 ? 'badge-amber' : 'badge-red';
                  return (
                    <div key={sp.salespersonId} className="grid grid-cols-12 items-center px-4 py-2.5 border-b border-slate-100 hover:bg-slate-50/60 transition-colors last:border-0">
                      <div className="col-span-4">
                        <p className="text-sm font-semibold text-slate-800 truncate">{sp.salespersonName}</p>
                        {sp.route && <p className="text-xs text-slate-400">{sp.route}</p>}
                      </div>
                      <div className="col-span-1 text-right text-xs text-slate-500 tabular-nums">{formatCurrency(sp.openingBalance)}</div>
                      <div className="col-span-1 text-right text-xs text-blue-600 tabular-nums">{formatCurrency(sp.stockGiven)}</div>
                      <div className="col-span-1 text-right text-xs text-emerald-600 tabular-nums">{formatCurrency(sp.amountPaid)}</div>
                      <div className="col-span-4 flex justify-end">
                        <span className={badgeCls}>{formatCurrency(closing)}</span>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Link to="/payments/salespeople" className="text-teal-600 hover:text-teal-700 transition">
                          <ArrowRight size={13} />
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
