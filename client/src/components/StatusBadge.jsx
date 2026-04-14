import { formatCurrency } from '../utils/dateUtils';

/**
 * Colored status pill badge.
 *
 * status: 'cleared' | 'outstanding' | 'partial'
 * amount: optional number to display alongside
 */
export default function StatusBadge({ status, amount }) {
  const configs = {
    cleared:     { cls: 'bg-emerald-100 text-emerald-700', label: 'Cleared' },
    outstanding: { cls: 'bg-red-100 text-red-700',         label: 'Owing' },
    partial:     { cls: 'bg-amber-100 text-amber-700',     label: 'Partial' },
  };

  const { cls, label } = configs[status] ?? configs.outstanding;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {amount != null ? formatCurrency(amount) : label}
    </span>
  );
}
