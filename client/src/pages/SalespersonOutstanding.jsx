import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CreditCard } from 'lucide-react';
import DateSelector from '../components/DateSelector';
import BrandedLoader from '../components/ui/BrandedLoader';
import { getIndiaDate, formatCurrency } from '../utils/dateUtils';
import { useNotification } from '../context/NotificationContext';
import api from '../api/axios';

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function SpCard({ sp }) {
  const closing  = sp.closingBalance ?? 0;
  const total    = sp.openingBalance + sp.stockGiven;
  const recovery = total > 0 ? Math.min(100, Math.max(0, (sp.amountPaid / total) * 100)) : 100;
  const isCredit  = closing < 0;
  const isCleared = closing === 0;
  const isHigh    = closing >= 5000;

  const accentBorder = isCredit ? 'border-l-violet-400' : isCleared ? 'border-l-emerald-400' : isHigh ? 'border-l-red-400' : 'border-l-amber-400';
  const avatarBg     = isCredit ? 'bg-violet-500'       : isCleared ? 'bg-emerald-500'       : isHigh ? 'bg-red-500'       : 'bg-amber-500';
  const badgeCls     = isCredit
    ? 'bg-violet-50 text-violet-700'
    : isCleared
    ? 'bg-emerald-50 text-emerald-700'
    : isHigh
    ? 'bg-red-50 text-red-700'
    : 'bg-amber-50 text-amber-700';
  const dueCls       = isCredit ? 'text-violet-600' : isCleared ? 'text-emerald-600' : isHigh ? 'text-red-600' : 'text-amber-600';
  const barCls       = isCredit ? 'bg-violet-500'   : isCleared ? 'bg-emerald-500'   : isHigh ? 'bg-red-500'   : 'bg-amber-400';

  return (
    <div className={`ddm-card p-5 border-l-4 ${accentBorder}`}>
      {/* Card header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${avatarBg}`}>
            {getInitials(sp.salespersonName)}
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm leading-tight">{sp.salespersonName}</p>
            {sp.route
              ? <p className="text-xs text-slate-400 mt-0.5">{sp.route}</p>
              : <p className="text-xs text-slate-300 mt-0.5">No route</p>
            }
          </div>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${badgeCls}`}>
          {isCredit ? 'Credit' : isCleared ? 'Cleared' : 'Outstanding'}
        </span>
      </div>

      {/* Breakdown tiles */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-slate-50 rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1">Opening</p>
          <p className="text-xs font-bold text-slate-700 tabular-nums">{formatCurrency(sp.openingBalance)}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-blue-400 uppercase tracking-wide font-semibold mb-1">Given</p>
          <p className="text-xs font-bold text-blue-700 tabular-nums">{formatCurrency(sp.stockGiven)}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-emerald-500 uppercase tracking-wide font-semibold mb-1">Paid</p>
          <p className="text-xs font-bold text-emerald-700 tabular-nums">{formatCurrency(sp.amountPaid)}</p>
        </div>
      </div>

      {/* Recovery bar */}
      <div className="mb-4">
        <div className="flex justify-between text-[10px] text-slate-400 mb-1.5 font-medium">
          <span>Recovery</span>
          <span>{Math.round(recovery)}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barCls}`}
            style={{ width: `${recovery}%` }}
          />
        </div>
      </div>

      {/* Balance due */}
      <div className={`flex items-center justify-between pt-3.5 border-t ${isCleared ? 'border-emerald-100' : 'border-slate-100'}`}>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Balance Due</span>
        <span className={`text-xl font-bold tabular-nums ${dueCls}`}>
          {isCredit ? `+${formatCurrency(Math.abs(closing))} Credit` : isCleared ? 'Nil' : formatCurrency(closing)}
        </span>
      </div>
    </div>
  );
}

export default function SalespersonOutstanding() {
  const { notify } = useNotification();
  const [date, setDate]       = useState(getIndiaDate());
  const [balances, setBalances] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get(`/salesperson-balance?date=${date}`)
      .then(r => setBalances(r.data.data ?? []))
      .catch(e => setError(e.response?.data?.error ?? 'Failed to load data'))
      .finally(() => setLoading(false));
  }, [date]);

  const totalOwing       = balances.reduce((s, b) => s + Math.max(0, b.closingBalance ?? 0), 0);
  const clearedCount     = balances.filter(b => (b.closingBalance ?? 0) <= 0).length;
  const outstandingCount = balances.length - clearedCount;

  const sorted = balances;

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Salesperson Outstanding</h1>
          <p className="text-slate-500 text-sm mt-1">Daily balance tracker for your field team</p>
        </div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={15} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* Summary metrics */}
      {!loading && balances.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="ddm-card p-4 text-center">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Total Outstanding</p>
            <p className="text-xl font-bold text-red-600 tabular-nums">{formatCurrency(totalOwing)}</p>
          </div>
          <div className="ddm-card p-4 text-center">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Pending</p>
            <p className="text-xl font-bold text-amber-600">{outstandingCount}</p>
            <p className="text-[11px] text-slate-400">salespeople</p>
          </div>
          <div className="ddm-card p-4 text-center">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Cleared</p>
            <p className="text-xl font-bold text-emerald-600">{clearedCount}</p>
            <p className="text-[11px] text-slate-400">salespeople</p>
          </div>
        </div>
      )}

      {loading ? (
        <BrandedLoader />
      ) : balances.length === 0 ? (
        <div className="ddm-card p-12 text-center text-slate-400 text-sm">
          No salespeople configured. Go to Setup → Salespeople &amp; Rates.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map(sp => <SpCard key={sp.salespersonId} sp={sp} />)}
        </div>
      )}

      {/* Record collection CTA */}
      {!loading && balances.length > 0 && (
        <div className="flex justify-end pb-2">
          <Link to="/payments/salespeople" className="ddm-btn-primary">
            <CreditCard size={15} />
            Record Collection
          </Link>
        </div>
      )}
    </div>
  );
}
