import React, { useMemo } from 'react';
import { PackageOpen } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { formatCurrency, formatDateShort } from '../../utils/dateUtils';

// Quantities are Decimals server-side, so a fractional value is possible even
// though receipts are normally whole units — show 2dp only when it isn't whole,
// the same convention the crate figures on Stock Balance use.
function formatQty(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function formatCrates(crates) {
  return Number.isInteger(crates) ? String(crates) : crates.toFixed(2);
}

/**
 * Groups an already-sorted item list into consecutive category runs.
 *
 * The caller hands items in the canonical dairy layout order (brand →
 * categoryDisplayOrder → product displayOrder → name, applied server-side in
 * reports/dailyDispatch.js), so same-category products are always adjacent and
 * a consecutive scan preserves that order without re-sorting here. This is the
 * same grouping the table's category header row uses.
 */
function groupByCategory(items) {
  const groups = [];
  for (const item of items) {
    const category = item.category || 'Uncategorised';
    const last = groups[groups.length - 1];
    if (last && last.category === category) last.items.push(item);
    else groups.push({ category, items: [item] });
  }
  return groups;
}

function StatPill({ label, value, tone = 'slate' }) {
  const TONES = {
    slate:  'bg-slate-50 border-slate-200 text-slate-700',
    amber:  'bg-amber-50 border-amber-200 text-amber-700',
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
  };
  return (
    <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${TONES[tone] ?? TONES.slate}`}>
      <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</span>
      <span className="text-sm font-extrabold tabular-nums">{value}</span>
    </div>
  );
}

function ProductRow({ item, tone }) {
  const leftUnits = Math.abs(item.left);
  const crates = item.unitsPerContainer > 0 ? leftUnits / item.unitsPerContainer : null;
  const leftCls = tone === 'over'
    ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-amber-100 text-amber-800 border-amber-200';

  return (
    <div className="px-3 py-2.5 border-b border-slate-100 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-slate-800 min-w-0 break-words">{item.productName}</span>
        <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${tone === 'over' ? 'text-red-600' : 'text-amber-700'}`}>
          {formatCurrency(item.value)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-x-1.5 gap-y-1 flex-wrap text-[11px] text-slate-500 tabular-nums">
        <span>Supply <b className="font-bold text-slate-700">{formatQty(item.supply)}</b></span>
        <span className="text-slate-300">→</span>
        <span>Dispatched <b className="font-bold text-slate-700">{formatQty(item.dispatched)}</b></span>
        <span className={`ml-0.5 rounded border px-1.5 py-0.5 font-bold ${leftCls}`}>
          {tone === 'over' ? 'Extra' : 'Left'} {formatQty(leftUnits)}
        </span>
        {crates ? <span className="text-slate-400">{formatCrates(crates)} crates</span> : null}
      </div>
    </div>
  );
}

function Section({ heading, hint, items, tone, total }) {
  if (items.length === 0) return null;
  const groups = groupByCategory(items);
  const bandCls = tone === 'over'
    ? 'bg-red-700 text-white'
    : 'bg-amber-600 text-white';

  return (
    <div>
      <div className={`flex items-center justify-between gap-3 px-3 py-2 ${bandCls}`}>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide leading-tight">{heading}</p>
          {hint && <p className="text-[10px] opacity-80 leading-tight mt-0.5">{hint}</p>}
        </div>
        <span className="text-sm font-extrabold tabular-nums flex-shrink-0">{formatCurrency(total)}</span>
      </div>
      {groups.map(group => (
        <div key={group.category}>
          {/* Category header — sticky inside the scroll box so the group a row
              belongs to stays on screen while skimming a long list. */}
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-slate-100 px-3 py-1.5 border-y border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 truncate">
              {group.category}
            </span>
            <span className="text-[10px] font-semibold text-slate-400 tabular-nums flex-shrink-0">
              {group.items.length} {group.items.length === 1 ? 'product' : 'products'}
            </span>
          </div>
          {group.items.map(item => (
            <ProductRow key={item.productId} item={item} tone={tone} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * "Not fully dispatched" detail dialog for Stock Balance.
 *
 * Replaces the earlier click-to-filter behaviour: filtering the table narrowed
 * the columns but still left the reader decoding a wide grid to work out what
 * was actually left over. This lists the products outright — one line each,
 * supply → dispatched → left, with the rupee value at dairy cost price —
 * grouped under category headers in dairy layout order.
 *
 * `items` must already be in layout order and carry both directions of
 * mismatch; products dispatched beyond what was received that day are split
 * into their own section so they never net against (and hide) the leftover
 * value, which is the number that actually costs money when a dispatch entry
 * has been missed.
 */
export default function NotDispatchedModal({ open, onClose, brandName, date, items }) {
  const { shortItems, overItems, shortValue, overValue, shortUnits } = useMemo(() => {
    const short = items.filter(i => i.left > 0);
    const over  = items.filter(i => i.left < 0);
    return {
      shortItems:  short,
      overItems:   over,
      shortValue:  short.reduce((s, i) => s + i.value, 0),
      overValue:   over.reduce((s, i) => s + i.value, 0),
      shortUnits:  short.reduce((s, i) => s + i.left, 0),
    };
  }, [items]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Not fully dispatched"
      subtitle={[brandName, date ? formatDateShort(date) : null].filter(Boolean).join(' · ')}
      icon={PackageOpen}
      accent="amber"
      size="xl"
      footer={
        <div className="w-full flex items-center justify-between gap-3">
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Left at dairy cost</p>
            <p className="text-base font-extrabold text-amber-700 tabular-nums leading-tight">
              {formatCurrency(shortValue)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition"
          >
            Close
          </button>
        </div>
      }
    >
      <p className="text-[11px] text-slate-500 leading-snug mb-3">
        Stock received on this date that has not gone out to a salesperson. Value is at dairy
        cost price — what you paid for what is still sitting.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        <StatPill label="Products" value={shortItems.length} tone="amber" />
        <StatPill label="Units left" value={formatQty(shortUnits)} tone="amber" />
        {overItems.length > 0 && (
          <StatPill label="Over-dispatched" value={`${overItems.length}`} tone="violet" />
        )}
      </div>

      <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-slate-200 bg-white">
        <Section
          heading="Left in stock"
          hint="Received today, not dispatched"
          items={shortItems}
          tone="short"
          total={shortValue}
        />
        <Section
          heading="Dispatched beyond supply"
          hint="Went out over what was received today — usually earlier days' stock"
          items={overItems}
          tone="over"
          total={overValue}
        />
      </div>
    </Modal>
  );
}
