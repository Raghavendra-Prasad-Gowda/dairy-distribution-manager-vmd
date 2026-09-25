import React, { useState, useEffect, useMemo } from 'react';
import { Printer, ChevronDown, ChevronRight, ChevronLeft, AlertCircle, User, Search, X, FileText, Package, Wallet, Receipt, Trash2 } from 'lucide-react';
import BrandedLoader, { TumblerSpinner } from '../../components/ui/BrandedLoader';
import ConfirmationModal from '../../components/ConfirmationModal';
import DispatchStockSummaryView from '../../components/DispatchStockSummary';
import { useNotification } from '../../context/NotificationContext';
import { getFirstDayOfMonth, getIndiaDate, formatCurrency, formatDateShort } from '../../utils/dateUtils';
import { getBrandColors } from '../../utils/constants';
import { useApiResource } from '../../hooks/useApiResource';
import { buildDispatchStockSummary } from '../../utils/salespersonProductStatement';
import api from '../../api/axios';

function ExpandableRow({ row, open, onToggle, showTopUp }) {
  const isOwing  = row.closingBalance > 0;
  const isCredit = row.closingBalance < 0;
  const topUp    = Number(row.topUpAmount ?? 0);
  return (
    <React.Fragment>
      <tr
        className="hover:bg-slate-50/60 transition-colors cursor-pointer border-b border-slate-100"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 text-xs text-slate-600 tabular-nums whitespace-nowrap">
          {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
        </td>
        <td className="px-4 py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
          {formatCurrency(row.openingBalance)}
        </td>
        <td className="px-4 py-2.5 text-right text-xs text-blue-600 tabular-nums whitespace-nowrap">
          {formatCurrency(row.stockGiven)}
        </td>
        {showTopUp && (
          <td className="px-4 py-2.5 text-right text-xs text-amber-600 tabular-nums whitespace-nowrap">
            {topUp !== 0 ? formatCurrency(topUp) : <span className="text-slate-300">—</span>}
          </td>
        )}
        <td className="px-4 py-2.5 text-right text-xs text-emerald-600 tabular-nums whitespace-nowrap">
          {formatCurrency(row.amountPaid)}
        </td>
        <td className={`px-4 py-2.5 text-right text-xs font-bold tabular-nums whitespace-nowrap ${isOwing ? 'text-red-600' : isCredit ? 'text-violet-600' : 'text-emerald-600'}`}>
          {formatCurrency(row.closingBalance)}
        </td>
        <td className="px-4 py-2.5 text-right text-slate-400">
          {open ? <ChevronDown size={13} className="ml-auto" /> : <ChevronRight size={13} className="ml-auto" />}
        </td>
      </tr>
      {open && (row.items?.length > 0 || row.payments?.length > 0 || row.topUps?.length > 0) && (
        <tr>
          <td colSpan={showTopUp ? 7 : 6} className="px-4 py-3 bg-emerald-50/50 border-b border-slate-100">
            <div className="space-y-3">
              {row.items?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1.5">Stock Dispatched</p>
                  <div className="space-y-1">
                    {row.items.map((item, i) => (
                      <div key={i} className="grid grid-cols-3 text-xs">
                        <span className="font-medium text-slate-700">{item.brandName} {item.productName}</span>
                        <span className="text-right text-slate-500">{item.quantity} × ₹{item.unitPrice}</span>
                        <span className="text-right font-semibold text-slate-700">{formatCurrency(item.totalAmount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {row.topUps?.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                    <Wallet size={12} className="text-amber-600" /> Old Balance Added
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {row.topUps.map((t, i) => (
                      <span key={i} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        {formatCurrency(t.amount)} by {t.createdBy || 'admin'}
                        {t.notes ? ` — ${t.notes}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {row.payments?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1.5">Collections</p>
                  <div className="flex gap-2 flex-wrap">
                    {row.payments.map((p, i) => (
                      <span key={i} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                        {formatCurrency(p.amount)} via {p.mode || 'Cash'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "52/ltr" — a product's rate, blank when there's nothing to derive it from. */
function formatBillRate(product) {
  if (product.rate == null) return '';
  return `${product.rate}/${product.unit}`;
}

/** Quantities print whole where they are whole, 2dp otherwise, with their unit. */
function formatBillQty(product) {
  const qty = Number.isInteger(product.quantity) ? String(product.quantity) : product.quantity.toFixed(2);
  return `${qty} ${product.unit}`;
}

/**
 * The "Bills" tab of the Salesperson Statement page — generates the printed
 * cash/credit bill for the salesperson currently selected in the page's own
 * sidebar, over the date range already chosen in the page's Filters card, and
 * keeps a per-salesperson history of every bill issued to them.
 *
 * Deliberately takes no salesperson picker or date inputs of its own — those
 * already exist one level up (the sidebar search/list and the From/To
 * filters), so switching salesperson or period here works exactly the way it
 * does for the Account Statement and Dispatch Stock Summary tabs.
 */
function BillsTab({ salespersonId, salespersonName, from, to }) {
  const { notify } = useNotification();
  const [partyName, setPartyName]     = useState('');
  const [poNumber, setPoNumber]       = useState('');
  const [issuing, setIssuing]         = useState(false);
  const [confirmBill, setConfirmBill] = useState(null);

  // Preview follows the salesperson/period selection — an admin should see
  // what the bill will say before it gets a number, because a number once
  // issued is part of the dairy's series (see POST /bills).
  const { data: preview, loading: previewLoading } = useApiResource(
    salespersonId && from && to ? '/bills/preview' : null,
    { params: { salespersonId, from, to }, initialData: null }
  );

  // History is scoped to this one salesperson — re-fetches automatically
  // whenever the sidebar selection changes, the same way the statement report
  // above does.
  const { data: bills, setData: setBills, loading: historyLoading } = useApiResource(
    salespersonId ? '/bills' : null,
    { params: { salespersonId }, initialData: [] }
  );

  async function issueBill() {
    setIssuing(true);
    try {
      const res = await api.post('/bills', {
        salespersonId: Number(salespersonId),
        from,
        to,
        ...(partyName.trim() ? { partyName: partyName.trim() } : {}),
        ...(poNumber.trim()  ? { poNumber:  poNumber.trim()  } : {}),
      });
      const bill = res.data.data;
      notify(`Bill #${bill.billNumber} generated`, 'success');
      // Prepend locally instead of re-fetching — the history is ordered by
      // bill number desc and this bill carries the highest one.
      setBills((prev) => [bill, ...prev]);
      setPoNumber('');
      window.open(`/print/bill?id=${bill.id}`, '_blank');
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to generate bill', 'error');
    } finally {
      setIssuing(false);
    }
  }

  async function deleteBill(bill) {
    try {
      await api.delete(`/bills/${bill.id}`);
      setBills((prev) => prev.filter((b) => b.id !== bill.id));
      notify(`Bill #${bill.billNumber} deleted`, 'success');
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to delete bill', 'error');
    } finally {
      setConfirmBill(null);
    }
  }

  const hasSupply = (preview?.totalAmount ?? 0) > 0;
  const periodLabel = from === to ? from : `${from} to ${to}`;

  return (
    <div className="space-y-6">

      {/* ── Bill details ──────────────────────────────────────────── */}
      <div className="ddm-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">M/s</span>
            <input
              type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)}
              placeholder={salespersonName ?? 'Party name'}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">PO No.</span>
            <input
              type="text" value={poNumber} onChange={(e) => setPoNumber(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Bills the period selected above (<strong>{periodLabel}</strong>). Bill No. is allocated
          automatically when you generate — it continues the dairy&rsquo;s series.
        </p>
      </div>

      {/* ── Preview ───────────────────────────────────────────────── */}
      <div className="ddm-card overflow-hidden">
        <div className="px-4 py-3 bg-slate-700 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white">Bill Preview</h2>
          <button
            onClick={issueBill}
            disabled={!hasSupply || issuing || previewLoading}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-500 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition"
          >
            {issuing ? <TumblerSpinner size={13} /> : <Receipt size={13} />} Generate Bill
          </button>
        </div>

        {previewLoading ? (
          <BrandedLoader size="sm" hideBrand inlinePadY="py-12" />
        ) : !preview ? (
          <p className="px-4 py-10 text-center text-slate-400 text-xs">Select a salesperson and period</p>
        ) : !hasSupply ? null : (
          <div className="overflow-auto max-h-[60vh]">
            <table className="min-w-full">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Product</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Rate</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((brand, brandIndex) => (
                  <React.Fragment key={brand.brandName}>
                    <tr className={getBrandColors(brand.brandName, brandIndex).header}>
                      <td colSpan={4} className="px-4 py-2 text-xs font-bold text-white uppercase tracking-wide">{brand.brandName}</td>
                    </tr>
                    {brand.products.map((product) => (
                      <tr key={product.productName} className="border-b border-slate-100">
                        <td className="px-4 py-2.5 pl-6 text-xs font-medium text-slate-700">{product.productName}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-slate-600 tabular-nums">{formatBillQty(product)}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-slate-600 tabular-nums">{formatBillRate(product)}</td>
                        <td className="px-4 py-2.5 text-right text-xs font-semibold text-slate-700 tabular-nums">
                          {formatCurrency(product.amount)}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-10">
                <tr className="bg-slate-800">
                  <td colSpan={3} className="px-4 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wide">Total</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-white tabular-nums">
                    {formatCurrency(preview.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {preview && !previewLoading && !hasSupply && (
          <p className="px-4 py-3 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
            No stock was dispatched in this period — there is nothing to bill.
          </p>
        )}
      </div>

      {/* ── History ───────────────────────────────────────────────── */}
      <div className="ddm-card overflow-hidden">
        <div className="px-4 py-3 bg-slate-700">
          <h2 className="text-sm font-bold text-white">Bill History</h2>
          <p className="text-xs text-slate-400">
            {bills.length} bill{bills.length !== 1 ? 's' : ''} issued to {salespersonName}
          </p>
        </div>

        {historyLoading ? (
          <BrandedLoader size="sm" hideBrand inlinePadY="py-12" />
        ) : bills.length === 0 ? (
          <p className="px-4 py-10 text-center text-slate-400 text-xs">No bills generated yet</p>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
            <table className="min-w-full">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Bill No.</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">M/s</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Period</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Total</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-700 tabular-nums">#{bill.billNumber}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-700">{bill.partyName}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {formatDateShort(bill.fromDate)} – {formatDateShort(bill.toDate)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-slate-700 tabular-nums">
                      {formatCurrency(bill.totalAmount)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => window.open(`/print/bill?id=${bill.id}`, '_blank')}
                          className="text-slate-400 hover:text-emerald-600 transition-colors"
                          title={`Print bill #${bill.billNumber}`}
                          aria-label={`Print bill #${bill.billNumber}`}
                        >
                          <Printer size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmBill(bill)}
                          className="text-slate-400 hover:text-red-600 transition-colors"
                          title={`Delete bill #${bill.billNumber}`}
                          aria-label={`Delete bill #${bill.billNumber}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={!!confirmBill}
        onClose={() => setConfirmBill(null)}
        onConfirm={() => deleteBill(confirmBill)}
        title="Delete Bill"
        message={confirmBill
          ? `Delete bill #${confirmBill.billNumber} for ${confirmBill.partyName}? The bill number will not be reused.`
          : ''}
        isDanger
        confirmText="Delete"
      />
    </div>
  );
}

export default function SalespersonStatement() {
  const [salespeople, setSalespeople] = useState([]);
  const [search, setSearch]          = useState('');
  const [selectedSp, setSelectedSp]  = useState('');
  const [from, setFrom]              = useState(getFirstDayOfMonth());
  const [to, setTo]                  = useState(getIndiaDate());
  const [spError, setSpError]        = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // 'balance'  — the existing day-by-day opening/given/collected/due statement
  // 'dispatch' — a Brand → Category → Product Dispatch Stock Summary for the
  //              whole date range (same shape as the Dairy Stock Summary
  //              report, minus Route and Unit Price)
  // 'bills'    — generate the printed cash/credit bill for the selected
  //              salesperson/period, plus their bill history (see BillsTab)
  const [view, setView] = useState('balance');

  const { data: rows, loading, error: reportError } = useApiResource(
    selectedSp ? `/reports/salesperson-statement?salespersonId=${selectedSp}&from=${from}&to=${to}` : null,
    {
      initialData: [],
      notifyOnError: false,
      // Collapse any expanded rows whenever a new report loads — mirrors the
      // old fetchReport's setExpandedRows(new Set()) at fetch-start; the
      // table is hidden behind BrandedLoader while loading either way.
      select: (payload) => { setExpandedRows(new Set()); return payload; },
    }
  );
  const error = reportError || spError;

  const expandableIndices = rows.reduce((acc, r, i) => {
    if (r.items?.length > 0 || r.payments?.length > 0 || r.topUps?.length > 0) acc.push(i);
    return acc;
  }, []);
  const allExpanded = expandableIndices.length > 0 && expandableIndices.every(i => expandedRows.has(i));

  function toggleRow(i) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }
  function expandAll()   { setExpandedRows(new Set(expandableIndices)); }
  function collapseAll() { setExpandedRows(new Set()); }

  useEffect(() => {
    api.get('/salespeople')
      .then((r) => {
        const sp = r.data.data;
        setSalespeople(sp);
        if (sp.length) setSelectedSp(String(sp[0].id));
      })
      .catch(() => setSpError('Failed to load salespeople'));
  }, []);

  const closingBalance  = rows.length ? rows[rows.length - 1].closingBalance : 0;
  const totalGiven      = rows.reduce((s, r) => s + r.stockGiven,  0);
  const totalCollected  = rows.reduce((s, r) => s + r.amountPaid,  0);
  // Top-ups ADD to what the salesman owes, so the closing balance already
  // contains them. Surfacing the column only when there is something to show
  // keeps the usual statement unchanged, while making the arithmetic
  // (opening + given + top-ups − collected = due) visible whenever it matters.
  const totalTopUp      = rows.reduce((s, r) => s + Number(r.topUpAmount ?? 0), 0);
  const showTopUp       = totalTopUp !== 0;
  const selectedSpObj   = salespeople.find(sp => String(sp.id) === String(selectedSp));

  const dispatchSummary = useMemo(() => buildDispatchStockSummary(rows), [rows]);
  const hasContent = view === 'balance' ? rows.length > 0 : dispatchSummary.brands.length > 0;

  const filteredSps = salespeople.filter(sp =>
    sp.name.toLowerCase().includes(search.toLowerCase()) ||
    (sp.route ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <User size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Salesperson Statement</h1>
            <p className="text-emerald-300 text-xs">Account statement per salesperson</p>
          </div>
        </div>
        {/* The Bills tab prints per-bill from its own History table instead
            of one aggregate report, so this header action doesn't apply there. */}
        {view !== 'bills' && hasContent && (
          <button
            onClick={() => window.open(`/print/salesperson-statement?salespersonId=${selectedSp}&from=${from}&to=${to}&type=${view}`, '_blank')}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200 hover:text-white border border-emerald-600 hover:border-emerald-400 px-3 py-1.5 rounded-lg transition"
          >
            <Printer size={13} /> Print
          </button>
        )}
      </div>

    {/* ── Split panel ──────────────────────────────────────────────── */}
    <div className="relative flex flex-1 overflow-hidden">

      {/* ── Left panel: salesperson list, collapsible ────────────────── */}
      <div
        className={`flex flex-col flex-shrink-0 border-r border-slate-200 bg-white overflow-hidden transition-all duration-200 ${
          sidebarCollapsed ? 'w-0 border-r-0' : 'w-64'
        }`}
      >
        {!sidebarCollapsed && (
          <>
            <div className="w-64 p-3 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name or route…"
                  className="w-full pl-8 pr-7 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-50"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
            <div className="w-64 flex-1 overflow-y-auto">
              {filteredSps.length === 0 ? (
                <p className="px-3 py-6 text-center text-slate-400 text-xs">No results</p>
              ) : (
                filteredSps.map(sp => {
                  const isSelected = String(sp.id) === String(selectedSp);
                  return (
                    <button
                      key={sp.id}
                      onClick={() => setSelectedSp(String(sp.id))}
                      className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                        isSelected
                          ? 'bg-emerald-50 border-l-4 border-l-emerald-600'
                          : 'border-l-4 border-l-transparent hover:bg-slate-50'
                      }`}
                    >
                      <p className={`text-sm font-semibold truncate ${isSelected ? 'text-emerald-800' : 'text-slate-800'}`}>
                        {sp.name}
                      </p>
                      {sp.route && <p className="text-xs text-slate-400 truncate mt-0.5">{sp.route}</p>}
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Collapse/expand handle — a prominent floating pill straddling
           the sidebar's edge when open. When collapsed, centering it on
           the panel's own left edge (x=0) would clip half the circle off
           the viewport, so it's anchored fully inside instead — and sized
           up a bit, since it's the only cue the list still exists. ────── */}
      <button
        onClick={() => setSidebarCollapsed(v => !v)}
        title={sidebarCollapsed ? 'Show salesperson list' : 'Hide salesperson list'}
        aria-label={sidebarCollapsed ? 'Show salesperson list' : 'Hide salesperson list'}
        style={{ left: sidebarCollapsed ? '6px' : '16rem' }}
        className={`absolute top-16 z-20 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg ring-2 ring-white transition-[left,background-color] duration-200 ${
          sidebarCollapsed ? 'w-10 h-10' : 'w-7 h-7 -translate-x-1/2'
        }`}
      >
        {sidebarCollapsed ? <ChevronRight size={19} /> : <ChevronLeft size={15} />}
      </button>

      {/* ── Right panel ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        {!selectedSp ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            Select a salesperson
          </div>
        ) : (
          <>
          {selectedSpObj && (
            <div className="flex items-center gap-2.5 px-5 py-3 bg-emerald-700">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {getInitials(selectedSpObj.name)}
              </div>
              <div>
                <p className="font-bold text-sm text-white leading-tight">{selectedSpObj.name}</p>
                {selectedSpObj.route && <p className="text-emerald-300 text-[11px] leading-tight">{selectedSpObj.route}</p>}
              </div>
            </div>
          )}
          <div className="p-5 md:p-8 space-y-6">

            {/* ── Filters ──────────────────────────────────────────── */}
            <div className="ddm-card p-4 flex flex-wrap gap-3 items-end">
              {[['from', 'From', from, setFrom], ['to', 'To', to, setTo]].map(([id, label, val, setter]) => (
                <div key={id}>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    {label}
                  </label>
                  <input
                    type="date"
                    value={val}
                    onChange={(e) => setter(e.target.value)}
                    max={getIndiaDate()}
                    className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                  />
                </div>
              ))}

              {rows.length > 0 && (
                <div className={`px-3 py-2 rounded-xl font-bold text-sm ${
                  closingBalance > 0 ? 'bg-red-50 text-red-700' : closingBalance < 0 ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  Outstanding: {formatCurrency(closingBalance)}
                </div>
              )}
            </div>

            {/* ── View switcher ───────────────────────────────────────── */}
            <div className="flex flex-wrap bg-white border border-slate-200 rounded-xl shadow-sm p-1 gap-1 max-w-xl">
              <button
                onClick={() => setView('balance')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg transition ${
                  view === 'balance' ? 'bg-emerald-700 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <FileText size={13} /> Account Statement
              </button>
              <button
                onClick={() => setView('dispatch')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg transition ${
                  view === 'dispatch' ? 'bg-emerald-700 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Package size={13} /> Dispatch Stock Summary
              </button>
              <button
                onClick={() => setView('bills')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg transition ${
                  view === 'bills' ? 'bg-emerald-700 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Receipt size={13} /> Bills
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                <AlertCircle size={15} className="flex-shrink-0" /> {error}
              </div>
            )}

            {view === 'dispatch' ? (
              <DispatchStockSummaryView summary={dispatchSummary} loading={loading} />
            ) : view === 'bills' ? (
              <BillsTab
                salespersonId={selectedSp}
                salespersonName={selectedSpObj?.name}
                from={from}
                to={to}
              />
            ) : (
            <>
            {/* ── Statement table ────────────────────────────────────── */}
            <div className="ddm-card overflow-hidden">
              <div className="px-4 py-3 bg-slate-700 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white">Account Statement</h2>
                  <p className="text-xs text-slate-400">
                    {rows.length} day{rows.length !== 1 ? 's' : ''} · tap a row to see dispatch &amp; collection details
                  </p>
                </div>
                {expandableIndices.length > 0 && !loading && (
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
                      <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Given</th>
                      {showTopUp && <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">Old Balance</th>}
                      <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Collected</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Due</th>
                      <th className="px-4 py-3 w-8" />
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {loading ? (
                      <tr><td colSpan={showTopUp ? 7 : 6}><BrandedLoader size="sm" hideBrand inlinePadY="py-12" /></td></tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={showTopUp ? 7 : 6} className="py-12 text-center text-slate-400 text-sm">No data for this period</td>
                      </tr>
                    ) : (
                      rows.map((row, i) => <ExpandableRow key={i} row={row} open={expandedRows.has(i)} onToggle={() => toggleRow(i)} showTopUp={showTopUp} />)
                    )}
                  </tbody>
                  {rows.length > 0 && (
                    <tfoot className="sticky bottom-0 z-10">
                      <tr>
                        <td className="px-4 py-3 bg-slate-700 text-xs font-bold text-white uppercase tracking-wider">Totals</td>
                        <td className="px-4 py-3 bg-slate-700 text-right text-xs text-slate-400">—</td>
                        <td className="px-4 py-3 bg-slate-700 text-right text-xs font-bold text-blue-300 tabular-nums">{formatCurrency(totalGiven)}</td>
                        {showTopUp && <td className="px-4 py-3 bg-slate-700 text-right text-xs font-bold text-amber-300 tabular-nums">{formatCurrency(totalTopUp)}</td>}
                        <td className="px-4 py-3 bg-slate-700 text-right text-xs font-bold text-emerald-300 tabular-nums">{formatCurrency(totalCollected)}</td>
                        <td className={`px-4 py-3 bg-slate-700 text-right text-xs font-bold tabular-nums ${closingBalance > 0 ? 'text-red-300' : closingBalance < 0 ? 'text-violet-300' : 'text-emerald-300'}`}>
                          {formatCurrency(closingBalance)}
                        </td>
                        <td className="px-4 py-3 bg-slate-700" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
            </>
            )}
          </div>
          </>
        )}
      </div>
    </div>
    </div>
  );
}
