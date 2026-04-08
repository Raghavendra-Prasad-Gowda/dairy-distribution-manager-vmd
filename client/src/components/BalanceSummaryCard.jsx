import { TrendingUp, TrendingDown, DollarSign, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../utils/dateUtils';
import { BRAND_COLORS } from '../utils/constants';
import { Link } from 'react-router-dom';

export default function BalanceSummaryCard({ brandName, opening, stockValue, paid, closing, payLink }) {
  const colors = BRAND_COLORS[brandName] ?? BRAND_COLORS['Nandini'];
  const isOwing = closing > 0;
  const isPaid  = closing <= 0;

  return (
    <div className={`ddm-card p-5 border-2 ${isOwing ? 'border-red-100' : 'border-green-100'}`}>
      {/* Brand header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${colors.dot}`} />
          <span className="font-bold text-gray-900">{brandName}</span>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isOwing ? 'badge-red' : 'badge-green'}`}>
          {isOwing ? 'Outstanding' : 'Clear'}
        </span>
      </div>

      {/* Rows */}
      <div className="space-y-2.5 text-sm">
        <div className="flex justify-between items-center text-gray-500">
          <span>Opening</span>
          <span className="font-medium text-gray-700">{formatCurrency(opening)}</span>
        </div>
        <div className="flex justify-between items-center text-gray-500">
          <span>Stock Value</span>
          <span className="font-medium text-blue-600">+{formatCurrency(stockValue)}</span>
        </div>
        <div className="flex justify-between items-center text-gray-500">
          <span>Paid</span>
          <span className="font-medium text-green-600">{paid > 0 ? '−' : ''}{formatCurrency(paid)}</span>
        </div>
        <div className="h-px bg-gray-100" />
        <div className="flex justify-between items-center">
          <span className="font-semibold text-gray-900">Closing</span>
          <span className={`text-lg font-bold ${isOwing ? 'text-red-600' : 'text-green-600'}`}>
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
