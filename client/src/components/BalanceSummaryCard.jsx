import { ArrowRight } from 'lucide-react';
import { formatCurrency } from '../utils/dateUtils';
import { BRAND_COLORS } from '../utils/constants';
import { Link } from 'react-router-dom';

export default function BalanceSummaryCard({ brandName, opening, stockValue, paid, closing, payLink }) {
  const colors = BRAND_COLORS[brandName] ?? BRAND_COLORS['Nandini'];
  const isOwing = closing > 0;

  return (
    <div className={`ddm-card p-4 border-l-4 ${isOwing ? 'border-l-red-400' : 'border-l-emerald-400'}`}>
      {/* Brand header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
          <span className="font-bold text-slate-800 text-sm">{brandName}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isOwing ? 'badge-red' : 'badge-green'}`}>
          {isOwing ? 'Outstanding' : 'Clear'}
        </span>
      </div>

      {/* Rows */}
      <div className="space-y-1.5 text-xs text-slate-500">
        <div className="flex justify-between">
          <span>Opening</span>
          <span className="tabular-nums text-slate-700">{formatCurrency(opening)}</span>
        </div>
        <div className="flex justify-between">
          <span>Stock Value</span>
          <span className="tabular-nums text-blue-600">+{formatCurrency(stockValue)}</span>
        </div>
        <div className="flex justify-between">
          <span>Paid</span>
          <span className="tabular-nums text-emerald-600">{paid > 0 ? '−' : ''}{formatCurrency(paid)}</span>
        </div>
        <div className="h-px bg-slate-100 my-1" />
        <div className="flex justify-between items-center">
          <span className="font-semibold text-slate-800">Closing</span>
          <span className={`text-base font-bold tabular-nums ${isOwing ? 'text-red-600' : 'text-emerald-600'}`}>
            {formatCurrency(closing)}
          </span>
        </div>
      </div>

      {/* Pay now link */}
      {isOwing && payLink && (
        <Link
          to={payLink}
          className="mt-4 flex items-center justify-center gap-1.5 w-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold py-2.5 rounded-xl transition"
        >
          Pay Now <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}
