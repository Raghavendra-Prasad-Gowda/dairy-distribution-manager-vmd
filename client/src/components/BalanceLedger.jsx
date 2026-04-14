import { formatCurrency } from '../utils/dateUtils';

/**
 * Horizontal ledger flow:
 *   [Opening] + [Stock] − [Paid] = [Balance]
 *
 * Props:
 *   opening    {number}
 *   stockValue {number}
 *   paid       {number}
 *   closing    {number}
 *   compact    {boolean} — smaller sizing for card headers
 */
export default function BalanceLedger({ opening, stockValue, paid, closing, compact = false }) {
  const isOwing = closing > 0;
  const valueSize = compact ? 'text-sm' : 'text-base';
  const labelSize = compact ? 'text-[9px]' : 'text-[10px]';

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <LedgerCell label="Opening" value={opening} labelSize={labelSize} valueSize={valueSize} />
      <Op>+</Op>
      <LedgerCell label="Stock" value={stockValue} labelSize={labelSize} valueSize={`${valueSize} text-blue-600`} />
      <Op>−</Op>
      <LedgerCell label="Paid" value={paid} labelSize={labelSize} valueSize={`${valueSize} text-emerald-600`} />
      <Op>=</Op>
      <LedgerCell
        label={isOwing ? 'You Owe' : 'Settled'}
        value={Math.abs(closing)}
        labelSize={labelSize}
        valueSize={`${valueSize} font-bold ${isOwing ? 'text-red-600' : 'text-emerald-600'}`}
      />
    </div>
  );
}

function Op({ children }) {
  return <span className="text-slate-300 font-light px-0.5 text-lg leading-none">{children}</span>;
}

function LedgerCell({ label, value, labelSize, valueSize }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`${labelSize} font-bold uppercase tracking-wider text-slate-400 leading-none mb-0.5 whitespace-nowrap`}>
        {label}
      </span>
      <span className={`${valueSize} font-semibold tabular-nums leading-none`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}
