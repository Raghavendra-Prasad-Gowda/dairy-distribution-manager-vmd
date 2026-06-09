import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Truck, CreditCard, AlertCircle, ArrowRight, LayoutDashboard } from 'lucide-react';
import DateSelector from '../components/DateSelector';
import BrandedLoader from '../components/ui/BrandedLoader';
import { getIndiaDate, formatCurrency } from '../utils/dateUtils';
import { getBrandColors } from '../utils/constants';
import { useNotification } from '../context/NotificationContext';
import api from '../api/axios';

/** Premium dairy payable card — brand-colored header, large owe amount, breakdown row */
function DairyPayableCard({ brandId, brandName, opening, stockValue, depositValue, paid, closing }) {
  const colors  = getBrandColors(brandName);
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
          { label: 'Opening', value: opening,                  cls: 'text-slate-600' },
          { label: 'Bill',    value: stockValue + depositValue, cls: 'text-blue-600' },
          { label: 'Paid',    value: paid,                      cls: 'text-emerald-600' },
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
            to={`/dairy/payments?brandId=${brandId}`}
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
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  useEffect(() => { fetchAll(); }, [date]);

  async function fetchAll() {
    setLoading(true);
    setError('');
    try {
      const dairyRes = await api.get(`/dairy-balance?date=${date}`);
      setDairy(dairyRes.data.data?.brands ?? []);
    } catch (e) {
      setError(e.response?.data?.error ?? 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  const totalDairyOwing = dairyBalances.reduce((s, b) => s + Math.max(0, b.closingBalance), 0);

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <LayoutDashboard size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Dashboard</h1>
            <p className="text-emerald-300 text-xs">Vikas Milk Dairy · Distribution Manager</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} dark />
      </div>

    <div className="flex-1 overflow-y-auto">
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={15} className="flex-shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <BrandedLoader />
      ) : (
        <>
          {/* ── 1. Quick Actions ────────────────────────────── */}
          <section>
            <p className="ddm-section-label mb-2.5">Quick Actions</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { to: '/dairy/stock/nandini', icon: Package,    label: 'Stock Receipt', color: 'bg-blue-600' },
                { to: '/salesman/payments',   icon: Truck,      label: 'Collections',   color: 'bg-emerald-600' },
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
                  brandId={b.brandId}
                  brandName={b.brandName}
                  opening={b.openingBalance}
                  stockValue={b.stockValue}
                  depositValue={b.depositValue ?? 0}
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

        </>
      )}
    </div>
    </div>
    </div>
  );
}
