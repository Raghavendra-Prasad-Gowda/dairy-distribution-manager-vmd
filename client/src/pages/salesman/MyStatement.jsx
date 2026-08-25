import React, { useState, useMemo } from 'react';
import { Printer, ChevronDown, ChevronRight, AlertCircle, FileText, Package, BadgeCheck, Box, Droplet, Wallet, ClipboardList } from 'lucide-react';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { getFirstDayOfMonth, getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import { useApiResource } from '../../hooks/useApiResource';
import { buildProductPurchaseRows } from '../../utils/salespersonProductStatement';

// ─── Item-level crates/litres, computed once when the statement loads ─────────
// Crates: quantity ÷ unitsPerContainer, kept at full precision here (not
// floored/rounded) so summing across items/days never drifts — matches the
// same "keep precision, only round at render" convention Stock Entry uses.
// Litres: only 'ml' products count (quantity × ml ÷ 1000); gram-measured
// items (ghee, butter etc.) don't contribute litres.
function withComputedFields(items) {
  return (items ?? []).map((item) => {
    const crates = item.unitsPerContainer > 0 ? item.quantity / item.unitsPerContainer : 0;
    const litres = item.unitType === 'ml' && item.unitSize > 0 ? (item.quantity * item.unitSize) / 1000 : 0;
    return { ...item, crates, litres };
  });
}

function formatLitres(litres) {
  return `${litres.toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`;
}

// Whole crate counts render plain; a partial crate shows to 2 decimal places
// — the salesman-facing precision level, same as Stock Entry's own display.
function formatCrates(crates) {
  return Number.isInteger(crates) ? String(crates) : crates.toFixed(2);
}

// ─── Shared breakdown panel (mobile cards + desktop expanded rows) ─────────────

function BreakdownPanel({ row }) {
  // Group stock-received items by brand so each brand gets its own header
  // (mirrors the admin Daily Dispatch Summary layout).
  const brandGroups = useMemo(() => {
    const map = new Map();
    for (const item of row.items ?? []) {
      if (!map.has(item.brandName)) map.set(item.brandName, []);
      map.get(item.brandName).push(item);
    }
    return Array.from(map.entries()).map(([brandName, items]) => ({
      brandName,
      items,
      crates: items.reduce((s, i) => s + i.crates, 0),
      litres: items.reduce((s, i) => s + i.litres, 0),
      amount: items.reduce((s, i) => s + i.totalAmount, 0),
    }));
  }, [row.items]);

  // Day-level totals across all brands — shown as one line above Payments Made
  const rowTotals = useMemo(() => ({
    crates: (row.items ?? []).reduce((s, i) => s + i.crates, 0),
    litres: (row.items ?? []).reduce((s, i) => s + i.litres, 0),
  }), [row.items]);

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm border border-slate-200 divide-y divide-slate-100">

      {row.items?.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-4 py-2.5 bg-blue-600">
            <div className="flex items-center gap-2">
              <Package size={13} className="text-blue-200 flex-shrink-0" />
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">Stock Received</span>
            </div>
            <span className="text-sm font-bold text-white tabular-nums">{formatCurrency(row.stockGiven)}</span>
          </div>
          <div className="bg-white divide-y divide-slate-50">
            {brandGroups.map((group, gi) => (
              <div key={gi}>
                <div className="flex items-center justify-between gap-2 px-4 py-1.5 bg-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{group.brandName}</span>
                  <div className="flex items-center gap-1.5">
                    {group.crates > 0 && (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full tabular-nums">
                        {formatCrates(group.crates)} crates
                      </span>
                    )}
                    {group.litres > 0 && (
                      <span className="text-[10px] font-semibold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full tabular-nums">
                        {formatLitres(group.litres)}
                      </span>
                    )}
                    {group.amount > 0 && (
                      <span className="text-[10px] font-semibold text-yellow-800 bg-yellow-100 px-2 py-0.5 rounded-full tabular-nums">
                        {formatCurrency(group.amount)}
                      </span>
                    )}
                  </div>
                </div>
                {group.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 leading-tight truncate">{item.productName}</p>
                      <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                        {item.quantity} × ₹{item.unitPrice}
                      </p>
                      {(item.crates > 0 || item.litres > 0) && (
                        <div className="flex items-center gap-1 mt-1">
                          {item.crates > 0 && (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full tabular-nums">
                              {formatCrates(item.crates)} crates
                            </span>
                          )}
                          {item.litres > 0 && (
                            <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full tabular-nums">
                              {formatLitres(item.litres)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-bold text-blue-700 tabular-nums whitespace-nowrap flex-shrink-0">
                      {formatCurrency(item.totalAmount)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {(rowTotals.crates > 0 || rowTotals.litres > 0) && (
            <div className="flex items-center justify-end gap-1.5 px-4 py-2 bg-slate-50 border-t border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-auto">Total</span>
              {rowTotals.crates > 0 && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full tabular-nums">
                  {formatCrates(rowTotals.crates)} crates
                </span>
              )}
              {rowTotals.litres > 0 && (
                <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full tabular-nums">
                  {formatLitres(rowTotals.litres)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {row.topUps?.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-4 py-2.5 bg-amber-600">
            <div className="flex items-center gap-2">
              <Wallet size={13} className="text-amber-200 flex-shrink-0" />
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">Old Balance Added</span>
            </div>
            <span className="text-sm font-bold text-white tabular-nums">
              {formatCurrency(row.topUps.reduce((s, t) => s + t.amount, 0))}
            </span>
          </div>
          <div className="bg-white divide-y divide-slate-50">
            {row.topUps.map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 leading-tight">
                    Added by {t.createdBy ?? 'admin'}
                  </p>
                  {t.notes && (
                    <p className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate">{t.notes}</p>
                  )}
                </div>
                <span className="text-xs font-bold text-amber-700 tabular-nums whitespace-nowrap flex-shrink-0">
                  {formatCurrency(t.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {row.payments?.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-600">
            <div className="flex items-center gap-2">
              <BadgeCheck size={13} className="text-emerald-200 flex-shrink-0" />
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">Payments Made</span>
            </div>
            <span className="text-sm font-bold text-white tabular-nums">
              {formatCurrency(row.payments.reduce((s, p) => s + p.amount, 0))}
            </span>
          </div>
          <div className="bg-white divide-y divide-slate-50">
            {row.payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 uppercase tracking-wide flex-shrink-0">
                  {p.mode || 'Cash'}
                </span>
                <span className="text-xs font-bold text-emerald-700 tabular-nums">
                  {formatCurrency(p.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Desktop-only expandable table row ────────────────────────────────────────

function ExpandableRow({ row, open, onToggle }) {
  const isOwing  = row.closingBalance > 0;
  const isCredit = row.closingBalance < 0;
  return (
    <React.Fragment>
      <tr
        className="hover:bg-slate-50/60 transition-colors cursor-pointer border-b border-slate-100"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 text-left text-xs text-slate-600 tabular-nums whitespace-nowrap">
          {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
        </td>
        <td className="px-4 py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
          {formatCurrency(row.openingBalance)}
        </td>
        <td className="px-4 py-2.5 text-right text-xs text-blue-600 tabular-nums whitespace-nowrap">
          {formatCurrency(row.stockGiven)}
        </td>
        <td className="px-4 py-2.5 text-right text-xs text-emerald-600 tabular-nums whitespace-nowrap">
          {formatCurrency(row.amountPaid)}
        </td>
        <td className={`px-4 py-2.5 text-right text-xs font-bold tabular-nums whitespace-nowrap ${
          isOwing ? 'text-red-600' : isCredit ? 'text-violet-600' : 'text-emerald-600'
        }`}>
          {formatCurrency(row.closingBalance)}
        </td>
        <td className="px-4 py-2.5 text-right text-slate-400">
          {open
            ? <ChevronDown  size={13} className="ml-auto" />
            : <ChevronRight size={13} className="ml-auto" />}
        </td>
      </tr>

      {open && (row.items?.length > 0 || row.payments?.length > 0 || row.topUps?.length > 0) && (
        <tr>
          <td colSpan={6} className="border-b border-slate-100 bg-slate-50 px-3 py-3">
            <BreakdownPanel row={row} />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

// ─── Products Purchased view ───────────────────────────────────────────────
// Flat, print-friendly table: one row per (date, brand), with the total
// quantity and total ₹ amount for that brand that day — deliberately an
// aggregate summary, distinct from the Account Statement's per-product,
// per-day drill-down (BreakdownPanel above).

function ProductsPurchasedView({ productRows, totalQty, totalAmount, loading, error }) {
  if (loading) {
    return (
      <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-sm py-12">
        <BrandedLoader size="sm" hideBrand inlinePadY="py-0" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
        <AlertCircle size={15} className="flex-shrink-0" /> {error}
      </div>
    );
  }
  if (productRows.length === 0) {
    return (
      <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-sm py-12 text-center text-slate-400 text-sm">
        No products purchased in this period
      </div>
    );
  }

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-sm p-3 text-center">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Quantity</p>
          <p className="text-sm font-bold text-blue-600 tabular-nums leading-tight">
            {totalQty.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-sm p-3 text-center">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Amount</p>
          <p className="text-sm font-bold text-emerald-600 tabular-nums leading-tight">
            {formatCurrency(totalAmount)}
          </p>
        </div>
      </div>

      {/* ══ MOBILE: card list (hidden on md+) ══════════════════ */}
      <div className="md:hidden bg-white border-2 border-slate-300 rounded-2xl shadow-sm overflow-hidden divide-y divide-slate-100">
        {productRows.map((r, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-3">
            <div className="w-12 flex-shrink-0 bg-slate-100 rounded-xl py-2 text-center">
              <p className="text-base font-extrabold text-slate-800 leading-none tabular-nums">
                {new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit' })}
              </p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">
                {new Date(r.date).toLocaleDateString('en-IN', { month: 'short' })}
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">{r.brandName}</p>
              <p className="text-[10px] text-slate-400 tabular-nums">Qty: {r.quantity.toLocaleString('en-IN')}</p>
            </div>
            <span className="text-sm font-bold text-emerald-600 tabular-nums flex-shrink-0">
              {formatCurrency(r.amount)}
            </span>
          </div>
        ))}

        {/* Mobile totals footer */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-slate-700">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Qty</p>
            <p className="text-sm font-bold text-blue-300 tabular-nums">{totalQty.toLocaleString('en-IN')}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Amount</p>
            <p className="text-base font-bold text-emerald-300 tabular-nums">{formatCurrency(totalAmount)}</p>
          </div>
        </div>
      </div>

      {/* ══ DESKTOP: table (hidden below md) ═══════════════════ */}
      <div className="hidden md:block bg-white border-2 border-slate-300 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-700">
          <h2 className="text-sm font-bold text-white">Products Purchased</h2>
          <p className="text-xs text-slate-400">
            {productRows.length} row{productRows.length !== 1 ? 's' : ''} · one per date and brand
          </p>
        </div>
        <div className="overflow-auto max-h-[60vh]">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-emerald-700 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Brand</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Quantity</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {productRows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-2.5 text-left text-xs text-slate-600 tabular-nums whitespace-nowrap">
                    {new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="px-4 py-2.5 text-left text-xs font-semibold text-slate-800 whitespace-nowrap">
                    {r.brandName}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-blue-600 tabular-nums whitespace-nowrap">
                    {r.quantity.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-emerald-600 tabular-nums whitespace-nowrap">
                    {formatCurrency(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-10">
              <tr>
                <td className="px-4 py-3 bg-slate-700 text-left text-xs font-bold text-white uppercase tracking-wider" colSpan={2}>
                  Totals
                </td>
                <td className="px-4 py-3 bg-slate-700 text-right text-xs font-bold text-blue-300 tabular-nums">
                  {totalQty.toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3 bg-slate-700 text-right text-xs font-bold text-emerald-300 tabular-nums">
                  {formatCurrency(totalAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyStatement() {
  const [from, setFrom]           = useState(getFirstDayOfMonth());
  const [to, setTo]               = useState(getIndiaDate());
  const [expandedRows, setExpandedRows] = useState(new Set());
  // 'balance'  — the existing day-by-day opening/billed/paid/closing statement
  // 'products' — a flat per-date, per-brand breakdown of what was purchased
  //              (total quantity + amount), for a quick print-friendly summary
  const [view, setView] = useState('balance');

  const { data: rows, loading, error } = useApiResource(
    `/salesperson-statement/me?from=${from}&to=${to}`,
    {
      initialData: [],
      notifyOnError: false,
      // Collapse any expanded rows whenever a new report loads — mirrors the
      // old fetchReport's setExpandedRows(new Set()) at fetch-start; the
      // table is hidden behind BrandedLoader while loading either way.
      select: (payload) => {
        setExpandedRows(new Set());
        return payload.map((row) => ({ ...row, items: withComputedFields(row.items) }));
      },
    }
  );

  const expandableIndices = rows.reduce((acc, r, i) => {
    if (r.items?.length > 0 || r.payments?.length > 0 || r.topUps?.length > 0) acc.push(i);
    return acc;
  }, []);
  const allExpanded =
    expandableIndices.length > 0 &&
    expandableIndices.every(i => expandedRows.has(i));

  function toggleRow(i) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }
  function expandAll()   { setExpandedRows(new Set(expandableIndices)); }
  function collapseAll() { setExpandedRows(new Set()); }

  const closingBalance = rows.length ? rows[rows.length - 1].closingBalance : 0;
  const totalGiven     = rows.reduce((s, r) => s + r.stockGiven, 0);
  const totalCollected = rows.reduce((s, r) => s + r.amountPaid, 0);
  const totalCrates    = rows.reduce((s, r) => s + (r.items ?? []).reduce((s2, i) => s2 + i.crates, 0), 0);
  const totalLitres    = rows.reduce((s, r) => s + (r.items ?? []).reduce((s2, i) => s2 + i.litres, 0), 0);
  const isOwing  = closingBalance > 0;
  const isCredit = closingBalance < 0;

  // Products Purchased view — one row per (date, brand), reusing the same
  // `rows` data already fetched above (no extra API call).
  const productRows      = useMemo(() => buildProductPurchaseRows(rows), [rows]);
  const productTotalQty  = productRows.reduce((s, r) => s + r.quantity, 0);
  const productTotalAmt  = productRows.reduce((s, r) => s + r.amount, 0);
  const hasContent       = view === 'balance' ? rows.length > 0 : productRows.length > 0;

  return (
    <div className="flex flex-col h-full">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText size={17} className="text-emerald-300 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white leading-tight">My Statement</h1>
            <p className="text-emerald-300 text-xs truncate">Account statement</p>
          </div>
        </div>
        {hasContent && (
          <button
            onClick={() =>
              window.open(`/print/salesman-my-statement?from=${from}&to=${to}&type=${view}`, '_blank')
            }
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200 hover:text-white border border-emerald-600 hover:border-emerald-400 px-3 py-1.5 rounded-lg transition flex-shrink-0"
          >
            <Printer size={13} /> Print
          </button>
        )}
      </div>

      {/* ── Scrollable content ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-3">

          {/* ── Date filters ────────────────────────────────────────── */}
          <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-sm p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ['from', 'From', from, setFrom],
                ['to',   'To',   to,   setTo  ],
              ].map(([id, label, val, setter]) => (
                <div key={id}>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    {label}
                  </label>
                  <input
                    type="date"
                    value={val}
                    onChange={(e) => setter(e.target.value)}
                    max={getIndiaDate()}
                    className="w-full min-w-0 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white appearance-none"
                    style={{ WebkitAppearance: 'none' }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── View switcher ───────────────────────────────────────── */}
          <div className="flex bg-white border-2 border-slate-300 rounded-2xl shadow-sm p-1 gap-1">
            <button
              onClick={() => setView('balance')}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-xl transition ${
                view === 'balance' ? 'bg-emerald-700 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <FileText size={13} /> Account Statement
            </button>
            <button
              onClick={() => setView('products')}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-xl transition ${
                view === 'products' ? 'bg-emerald-700 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <ClipboardList size={13} /> Products Purchased
            </button>
          </div>

          {view === 'products' ? (
            <ProductsPurchasedView
              productRows={productRows}
              totalQty={productTotalQty}
              totalAmount={productTotalAmt}
              loading={loading}
              error={error}
            />
          ) : (
          <>
          {/* ── Summary cards ───────────────────────────────────────── */}
          {rows.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-sm p-3 text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Billed</p>
                <p className="text-sm font-bold text-blue-600 tabular-nums leading-tight">
                  {formatCurrency(totalGiven)}
                </p>
              </div>
              <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-sm p-3 text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Paid</p>
                <p className="text-sm font-bold text-emerald-600 tabular-nums leading-tight">
                  {formatCurrency(totalCollected)}
                </p>
              </div>
              <div className={`rounded-2xl shadow-sm border-2 p-3 text-center ${
                isOwing  ? 'bg-red-50 border-red-200'
                : isCredit ? 'bg-violet-50 border-violet-200'
                : 'bg-emerald-50 border-emerald-200'
              }`}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                  {isOwing ? 'Owed' : isCredit ? 'Credit' : 'Settled'}
                </p>
                <p className={`text-sm font-bold tabular-nums leading-tight ${
                  isOwing ? 'text-red-600' : isCredit ? 'text-violet-600' : 'text-emerald-600'
                }`}>
                  {formatCurrency(closingBalance)}
                </p>
              </div>
            </div>
          )}

          {rows.length > 0 && (totalCrates > 0 || totalLitres > 0) && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl shadow-sm p-3 text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-amber-700/70 mb-1 flex items-center justify-center gap-1">
                  <Box size={11} /> Total Crates
                </p>
                <p className="text-sm font-bold text-amber-700 tabular-nums leading-tight">
                  {formatCrates(totalCrates)}
                </p>
              </div>
              <div className="bg-sky-50 border-2 border-sky-200 rounded-2xl shadow-sm p-3 text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-sky-700/70 mb-1 flex items-center justify-center gap-1">
                  <Droplet size={11} /> Total Litres
                </p>
                <p className="text-sm font-bold text-sky-700 tabular-nums leading-tight">
                  {formatLitres(totalLitres)}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
              <AlertCircle size={15} className="flex-shrink-0" /> {error}
            </div>
          )}

          {/* ── Statement content ─────────────────────────────────────── */}
          {loading ? (
            <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-sm py-12">
              <BrandedLoader size="sm" hideBrand inlinePadY="py-0" />
            </div>
          ) : rows.length === 0 && !error ? (
            <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-sm py-12 text-center text-slate-400 text-sm">
              No data for this period
            </div>
          ) : rows.length > 0 && (
            <>
              {/* Expand-all control */}
              {expandableIndices.length > 0 && (
                <div className="flex items-center justify-between px-1">
                  <p className="text-[11px] text-slate-400 font-medium">
                    {rows.length} day{rows.length !== 1 ? 's' : ''} · tap a row to expand
                  </p>
                  <button
                    onClick={allExpanded ? collapseAll : expandAll}
                    className="flex items-center gap-1 text-xs font-semibold text-emerald-700"
                  >
                    {allExpanded
                      ? <><ChevronRight size={12} /> Collapse All</>
                      : <><ChevronDown  size={12} /> Expand All</>}
                  </button>
                </div>
              )}

              {/* ══ MOBILE: card list (hidden on md+) ══════════════════ */}
              <div className="md:hidden bg-white border-2 border-slate-300 rounded-2xl shadow-sm overflow-hidden divide-y divide-slate-100">
                {rows.map((row, i) => {
                  const rowOwing  = row.closingBalance > 0;
                  const rowCredit = row.closingBalance < 0;
                  const hasDetail = row.items?.length > 0 || row.payments?.length > 0 || row.topUps?.length > 0;
                  return (
                    <React.Fragment key={i}>
                      <button
                        onClick={() => hasDetail && toggleRow(i)}
                        className={`w-full px-4 py-4 flex items-center gap-3 text-left ${
                          hasDetail ? 'active:bg-slate-50' : 'cursor-default'
                        }`}
                      >
                        {/* Date pill */}
                        <div className="w-12 flex-shrink-0 bg-slate-100 rounded-xl py-2 text-center">
                          <p className="text-base font-extrabold text-slate-800 leading-none tabular-nums">
                            {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit' })}
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">
                            {new Date(row.date).toLocaleDateString('en-IN', { month: 'short' })}
                          </p>
                        </div>

                        {/* Billed + Paid */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-semibold text-blue-600 tabular-nums">
                              Bill: {formatCurrency(row.stockGiven)}
                            </span>
                            <span className="text-xs font-semibold text-emerald-600 tabular-nums">
                              Paid: {formatCurrency(row.amountPaid)}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                            Opening: {formatCurrency(row.openingBalance)}
                          </p>
                        </div>

                        {/* Balance + chevron */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className={`text-sm font-bold tabular-nums ${
                            rowOwing ? 'text-red-600' : rowCredit ? 'text-violet-600' : 'text-emerald-600'
                          }`}>
                            {formatCurrency(row.closingBalance)}
                          </span>
                          {hasDetail && (
                            expandedRows.has(i)
                              ? <ChevronDown  size={12} className="text-slate-400" />
                              : <ChevronRight size={12} className="text-slate-400" />
                          )}
                        </div>
                      </button>

                      {expandedRows.has(i) && hasDetail && (
                        <div className="px-3 pb-3 bg-slate-50">
                          <BreakdownPanel row={row} />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Mobile totals footer */}
                <div className="flex items-center justify-between px-4 py-3.5 bg-slate-700">
                  <div className="flex items-center gap-5">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Billed</p>
                      <p className="text-sm font-bold text-blue-300 tabular-nums">{formatCurrency(totalGiven)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Paid</p>
                      <p className="text-sm font-bold text-emerald-300 tabular-nums">{formatCurrency(totalCollected)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Balance</p>
                    <p className={`text-base font-bold tabular-nums ${
                      isOwing ? 'text-red-300' : isCredit ? 'text-violet-300' : 'text-emerald-300'
                    }`}>{formatCurrency(closingBalance)}</p>
                  </div>
                </div>
              </div>

              {/* ══ DESKTOP: table (hidden below md) ═══════════════════ */}
              <div className="hidden md:block bg-white border-2 border-slate-300 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-white">Account Statement</h2>
                    <p className="text-xs text-slate-400">
                      {rows.length} day{rows.length !== 1 ? 's' : ''} · click a row to see details
                    </p>
                  </div>
                  {expandableIndices.length > 0 && (
                    <button
                      onClick={allExpanded ? collapseAll : expandAll}
                      className="flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white transition whitespace-nowrap flex-shrink-0"
                    >
                      {allExpanded
                        ? <><ChevronRight size={13} /> Collapse All</>
                        : <><ChevronDown  size={13} /> Expand All</>}
                    </button>
                  )}
                </div>
                <div className="overflow-auto max-h-[60vh]">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-emerald-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Opening</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Billed</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Paid</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Balance</th>
                        <th className="px-4 py-3 w-8" />
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {rows.map((row, i) => (
                        <ExpandableRow
                          key={i}
                          row={row}
                          open={expandedRows.has(i)}
                          onToggle={() => toggleRow(i)}
                        />
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-10">
                      <tr>
                        <td className="px-4 py-3 bg-slate-700 text-left text-xs font-bold text-white uppercase tracking-wider">Totals</td>
                        <td className="px-4 py-3 bg-slate-700 text-right text-xs text-slate-400">—</td>
                        <td className="px-4 py-3 bg-slate-700 text-right text-xs font-bold text-blue-300 tabular-nums">
                          {formatCurrency(totalGiven)}
                        </td>
                        <td className="px-4 py-3 bg-slate-700 text-right text-xs font-bold text-emerald-300 tabular-nums">
                          {formatCurrency(totalCollected)}
                        </td>
                        <td className={`px-4 py-3 bg-slate-700 text-right text-xs font-bold tabular-nums ${
                          isOwing ? 'text-red-300' : isCredit ? 'text-violet-300' : 'text-emerald-300'
                        }`}>
                          {formatCurrency(closingBalance)}
                        </td>
                        <td className="px-4 py-3 bg-slate-700" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
          </>
          )}

        </div>
      </div>
    </div>
  );
}
