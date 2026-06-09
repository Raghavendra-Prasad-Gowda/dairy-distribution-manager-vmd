import { ArrowRight, ArrowRightCircle } from 'lucide-react';
import { formatCurrency } from '../utils/dateUtils';
import { getBrandColors } from '../utils/constants';
import { Link } from 'react-router-dom';

function LedgerBox({ label, value, valueClass = 'text-slate-800', prefix = '' }) {
  return (
    <div className="flex flex-col items-center min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 whitespace-nowrap">
        {label}
      </span>
      <span className={`text-base font-bold tabular-nums leading-none ${valueClass}`}>
        {prefix}{formatCurrency(value)}
      </span>
    </div>
  );
}

export default function BalanceSummaryCard({ brandName, opening, stockValue, paid, closing, payLink }) {
  const colors = getBrandColors(brandName);
  const isOwing = closing > 0;

  return (
    <div className={`ddm-card overflow-hidden border-l-4 ${isOwing ? 'border-l-red-400' : 'border-l-emerald-400'}`}>
      {/* Brand header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
          <span className="font-bold text-slate-800 text-sm">{brandName}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isOwing ? 'badge-red' : 'badge-green'}`}>
          {isOwing ? 'Outstanding' : 'Clear'}
        </span>
      </div>

      {/* Horizontal ledger flow */}
      <div className="flex items-center gap-1 px-4 pb-3 overflow-x-auto">
        <LedgerBox label="Opening" value={opening} />
        <span className="text-slate-300 text-lg font-light flex-shrink-0 px-0.5">+</span>
        <LedgerBox label="Stock" value={stockValue} valueClass="text-blue-600" />
        <span className="text-slate-300 text-lg font-light flex-shrink-0 px-0.5">−</span>
        <LedgerBox label="Paid" value={paid} valueClass="text-emerald-600" />
        <span className="text-slate-300 text-lg font-light flex-shrink-0 px-0.5">=</span>
        <LedgerBox
          label={isOwing ? 'You Owe' : 'Settled'}
          value={Math.abs(closing)}
          valueClass={isOwing ? 'text-red-600 text-lg' : 'text-emerald-600 text-lg'}
        />
      </div>

      {/* Pay now link */}
      {isOwing && payLink && (
        <div className="px-4 pb-3">
          <Link
            to={payLink}
            className="flex items-center justify-center gap-1.5 w-full bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold py-2.5 rounded-lg transition"
          >
            Pay Now <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
