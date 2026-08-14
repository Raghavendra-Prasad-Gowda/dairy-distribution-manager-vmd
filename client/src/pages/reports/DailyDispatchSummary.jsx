import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, LayoutGrid, Search, X, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Lock, LockOpen, FlagTriangleRight } from 'lucide-react';
import BrandedLoader from '../../components/ui/BrandedLoader';
import DateSelector from '../../components/DateSelector';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useAuth } from '../../context/AuthContext';

// Whole crate counts render plain; a partial crate shows to 2 decimal
// places — the same precision level as every other crate figure in the app.
function formatCrates(crates) {
  return Number.isInteger(crates) ? String(crates) : crates.toFixed(2);
}

export default function DailyDispatchSummary() {
  const { user } = useAuth();
  const isDispatcher = user?.role === 'dispatcher';

  const [date, setDate]                       = useState(getIndiaDate());
  const [data, setData]                       = useState(null);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');
  const [selectedSpId, setSelectedSpId]       = useState(null);
  const [search, setSearch]                   = useState('');
  const [showZeroQty, setShowZeroQty]         = useState(false);
  const [collapsedBrands, setCollapsedBrands] = useState({});
  const [lockLoading, setLockLoading]         = useState(false);
  const [lockConfirm, setLockConfirm]         = useState(null); // { dispatchId, isLocked, name }
  const [openLoading, setOpenLoading]         = useState(false);
  const [openConfirm, setOpenConfirm]         = useState(null); // { salespersonId, name }
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [finalizeConfirm, setFinalizeConfirm] = useState(false);

  const isPastDate = date < getIndiaDate();
  const isToday     = date === getIndiaDate();
  const dayFinalized = data?.isDayFinalized ?? false;
  // Dispatcher's lock/unlock is only actionable today, before finalization —
  // admin/superadmin are completely unrestricted, unchanged.
  const canToggleLock = !isDispatcher || (isToday && !dayFinalized);

  useEffect(() => { fetchData(); }, [date]);

  useEffect(() => { setCollapsedBrands({}); }, [selectedSpId]);

  async function fetchData() {
    setLoading(true); setError('');
    setSelectedSpId(null);
    try {
      // Dispatchers can't open blank rows for entry, so skip the /salespeople
      // call — it's admin-only and would return 403 for a dispatcher.
      const [dispatchRes, spRes] = await Promise.all([
        api.get(`/reports/daily-dispatch?date=${date}`),
        isDispatcher ? Promise.resolve(null) : api.get('/salespeople'),
      ]);
      const d = dispatchRes.data.data;
      // Salespeople with no dispatch row for this date don't appear in d.rows
      // at all — surface them as blank rows so an admin can still select them
      // and open the date for entry. Dispatchers don't get this: they can't
      // open dates for entry, and they don't have access to /salespeople.
      const blankRows = spRes
        ? (spRes.data.data ?? [])
            .filter(sp => !new Set(d.rows.map(r => r.salespersonId)).has(sp.id))
            .map(sp => ({
              salespersonId:   sp.id,
              salespersonName: sp.name,
              items:           {},
              totalAmount:     0,
              dispatchId:      null,
              isSubmitted:     false,
              isAdminUnlocked: false,
              isLocked:        date < getIndiaDate(),
            }))
        : [];
      const merged = { ...d, rows: [...d.rows, ...blankRows] };
      setData(merged);
      const autoId = merged.rows.find(row => row.totalAmount > 0)?.salespersonId
                     ?? merged.rows[0]?.salespersonId ?? null;
      setSelectedSpId(autoId);
    } catch (e) {
      setError(e.response?.data?.error ?? 'Failed to load dispatch summary');
    } finally {
      setLoading(false);
    }
  }

  async function confirmOpenForEntry() {
    if (!openConfirm) return;
    const { salespersonId } = openConfirm;
    setOpenConfirm(null);
    setOpenLoading(true);
    try {
      await api.post('/dispatches/open-for-entry', { salespersonId, dispatchDate: date });
      await fetchData();
      setSelectedSpId(salespersonId);
    } catch (e) {
      // fetchData will reset state
    } finally {
      setOpenLoading(false);
    }
  }

  async function confirmFinalizeDay() {
    setFinalizeConfirm(false);
    setFinalizeLoading(true);
    try {
      await api.post('/dispatches/finalize-day');
      await fetchData();
    } catch (e) {
      // fetchData will reset state
    } finally {
      setFinalizeLoading(false);
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return q ? data.rows.filter(r => r.salespersonName.toLowerCase().includes(q)) : data.rows;
  }, [data, search]);

  const selectedRow = useMemo(
    () => data?.rows.find(r => r.salespersonId === selectedSpId) ?? null,
    [data, selectedSpId],
  );

  const tableData = useMemo(() => {
    if (!data || !selectedRow) return [];
    return data.brands
      .map(brand => {
        const products = brand.products
          .map(p => {
            const entry     = selectedRow.items[p.productId];
            const qty       = entry?.qty ?? 0;
            const unitPrice = entry?.unitPrice ?? null;
            const crates    = (p.unitsPerContainer > 0) ? qty / p.unitsPerContainer : null;
            return {
              productId:   p.productId,
              productName: p.productName,
              qty,
              crates,
              unitPrice,
              amount: (qty > 0 && unitPrice != null) ? qty * unitPrice : 0,
            };
          })
          .filter(p => showZeroQty || p.qty > 0);
        const brandQtyTotal    = products.reduce((s, p) => s + p.qty, 0);
        const brandAmountTotal = products.reduce((s, p) => s + p.amount, 0);
        const brandCratesTotal = products.reduce((s, p) => s + (p.crates != null && p.qty > 0 ? p.crates : 0), 0);
        return { brandId: brand.brandId, brandName: brand.brandName, products, brandQtyTotal, brandAmountTotal, brandCratesTotal };
      })
      .filter(b => b.products.length > 0);
  }, [data, selectedRow, showZeroQty]);

  const tableTotals = useMemo(() => ({
    qty:    tableData.reduce((s, b) => s + b.brandQtyTotal,    0),
    crates: tableData.reduce((s, b) => s + b.brandCratesTotal, 0),
    amount: tableData.reduce((s, b) => s + b.brandAmountTotal, 0),
  }), [tableData]);

  const activeCount = useMemo(
    () => (data?.rows ?? []).filter(r => r.totalAmount > 0).length,
    [data],
  );

  const grandTotalAll = useMemo(
    () => (data?.rows ?? []).reduce((s, r) => s + r.totalAmount, 0),
    [data],
  );

  const expandAll   = () => { const n = {}; tableData.forEach(b => { n[b.brandId] = false; }); setCollapsedBrands(n); };
  const collapseAll = () => { const n = {}; tableData.forEach(b => { n[b.brandId] = true;  }); setCollapsedBrands(n); };

  function handleLockToggle(dispatchId, currentlyLocked, name) {
    setLockConfirm({ dispatchId, isLocked: currentlyLocked, name });
  }

  async function confirmLockToggle() {
    if (!lockConfirm) return;
    const { dispatchId, isLocked } = lockConfirm;
    setLockConfirm(null);
    setLockLoading(true);
    try {
      const action = isLocked ? 'unlock' : 'lock';
      await api.patch(`/dispatches/${dispatchId}/${action}`);
      await fetchData();
    } catch (e) {
      // fetchData will reset state
    } finally {
      setLockLoading(false);
    }
  }

  function SpRow({ row }) {
    const isSelected = row.salespersonId === selectedSpId;
    return (
      <li>
        <button
          type="button"
          onClick={() => setSelectedSpId(row.salespersonId)}
          className={`w-full text-left px-3 py-2.5 border-l-4 transition-colors ${
            isSelected
              ? 'bg-emerald-50 border-emerald-600'
              : 'border-transparent hover:bg-slate-50 active:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-semibold leading-tight truncate flex-1 ${isSelected ? 'text-emerald-800' : 'text-slate-800'}`}>
              {row.salespersonName}
            </p>
            {row.dispatchId && (
              row.isLocked
                ? <Lock size={10} className="text-slate-400 flex-shrink-0" />
                : row.isSubmitted
                ? <Lock size={10} className="text-emerald-500 flex-shrink-0" />
                : null
            )}
          </div>
          <p className={`text-xs tabular-nums mt-0.5 ${row.totalAmount > 0 ? 'text-emerald-600 font-semibold' : 'text-slate-300'}`}>
            {row.totalAmount > 0 ? formatCurrency(row.totalAmount) : 'No entry'}
          </p>
        </button>
      </li>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <LayoutGrid size={17} className="text-emerald-300 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white leading-tight">Daily Dispatch Sheet</h1>
            {data && !loading && (
              <p className="text-emerald-300 text-xs tabular-nums">
                {activeCount} active · {formatCurrency(grandTotalAll)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <DateSelector date={date} onChange={setDate} dark />
        </div>
      </div>

      {/* ── Dispatcher action bar (today only) ── */}
      {isDispatcher && isToday && data && (
        dayFinalized ? (
          <div className="flex items-center justify-center gap-2 bg-emerald-50 border-b border-emerald-200 px-4 py-2.5 flex-shrink-0">
            <Lock size={13} className="text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700">Day Finalized — entries are locked</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2 flex-shrink-0">
            <p className="text-xs text-amber-700 leading-snug">
              When all salespersons are done for today, finalize the day to lock entries.
            </p>
            <Button
              size="sm"
              variant="soft-danger"
              icon={FlagTriangleRight}
              loading={finalizeLoading}
              onClick={() => setFinalizeConfirm(true)}
            >
              Finalize Day
            </Button>
          </div>
        )
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border-b border-red-200 text-red-700 px-4 py-2.5 text-sm flex-shrink-0">
          <AlertCircle size={14} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Two-panel body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT PANEL — always visible ── */}
        <aside className="flex flex-col w-[220px] flex-shrink-0 border-r border-slate-200 bg-white">

          {/* Search */}
          <div className="p-3 border-b border-slate-100 flex-shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search salesperson…"
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex-1"><BrandedLoader size="sm" hideBrand inlinePadY="py-12" /></div>
          ) : (
            <ul className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {filteredRows.length === 0 ? (
                <li className="px-3 py-6 text-center text-slate-400 text-xs">
                  {search ? 'No results' : 'No data'}
                </li>
              ) : (
                filteredRows.map(row => <SpRow key={row.salespersonId} row={row} />)
              )}
            </ul>
          )}
        </aside>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">

          {loading ? (
            <div className="flex-1"><BrandedLoader /></div>
          ) : !data || !selectedRow ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              {data ? 'Select a salesperson' : null}
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">

              {/* Sub-header: name + lock/unlock + expand/collapse + toggle */}
              <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-2 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-sm font-bold text-slate-700 truncate">{selectedRow.salespersonName}</p>
                  {selectedRow.dispatchId ? (
                    selectedRow.isLocked
                      ? <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                          <Lock size={9} /> Locked
                        </span>
                      : selectedRow.isSubmitted
                      ? <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                          <Lock size={9} /> Submitted
                        </span>
                      : <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                          Draft
                        </span>
                  ) : isPastDate && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                      <Lock size={9} /> No entry — locked
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {tableData.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={expandAll}
                        className="flex items-center gap-1 px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-700 transition whitespace-nowrap"
                      >
                        <ChevronsUpDown size={11} /> Expand
                      </button>
                      <button
                        type="button"
                        onClick={collapseAll}
                        className="flex items-center gap-1 px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-700 transition whitespace-nowrap"
                      >
                        <ChevronsDownUp size={11} /> Collapse
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowZeroQty(v => !v)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition whitespace-nowrap ${
                      showZeroQty
                        ? 'bg-slate-100 text-slate-600 border-slate-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {showZeroQty ? 'All products' : 'Entered only'}
                  </button>
                  {selectedRow.dispatchId ? (
                    canToggleLock && (
                      <Button
                        size="sm"
                        variant={selectedRow.isLocked ? 'soft-warning' : 'soft-info'}
                        icon={selectedRow.isLocked ? LockOpen : Lock}
                        loading={lockLoading}
                        onClick={() => handleLockToggle(selectedRow.dispatchId, selectedRow.isLocked, selectedRow.salespersonName)}
                      >
                        {selectedRow.isLocked ? 'Unlock' : 'Lock'}
                      </Button>
                    )
                  ) : (!isDispatcher && isPastDate) && (
                    <Button
                      size="sm"
                      variant="soft-warning"
                      icon={LockOpen}
                      loading={openLoading}
                      onClick={() => setOpenConfirm({ salespersonId: selectedRow.salespersonId, name: selectedRow.salespersonName })}
                    >
                      Open for Entry
                    </Button>
                  )}
                </div>
              </div>

              {/* Table area */}
              <div className="flex-1 min-h-0 p-3">
                {tableData.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center h-40 gap-2">
                    <AlertCircle size={20} className="text-slate-300" />
                    <p className="text-sm text-slate-400">No dispatch entry for this date</p>
                    {!showZeroQty && (
                      <button type="button" onClick={() => setShowZeroQty(true)} className="text-xs text-emerald-600 underline">
                        Show all products
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-y-auto flex-1">
                      <table className="min-w-full">
                        <thead className="sticky top-0 z-10">
                          <tr>
                            <th className="bg-emerald-700 px-3 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                            <th className="bg-emerald-700 px-3 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider w-14">Qty</th>
                            <th className="bg-emerald-700 px-3 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider w-16">Crates</th>
                            <th className="bg-emerald-700 px-3 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider w-24">Rate</th>
                            <th className="bg-emerald-700 px-3 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider w-24">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableData.map(brand => {
                            const isCollapsed = collapsedBrands[brand.brandId] ?? true;
                            return (
                              <React.Fragment key={brand.brandId}>
                                {/* Brand header — clickable, left aligned */}
                                <tr
                                  className="cursor-pointer select-none hover:bg-slate-200 transition-colors"
                                  onClick={() => setCollapsedBrands(prev => ({ ...prev, [brand.brandId]: !isCollapsed }))}
                                >
                                  <td colSpan={5} className="bg-slate-100 border-t border-slate-200 px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                      {isCollapsed
                                        ? <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />
                                        : <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />}
                                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{brand.brandName}</span>
                                      {isCollapsed && brand.brandQtyTotal > 0 && (
                                        <>
                                          <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold tabular-nums ml-1">
                                            {brand.brandQtyTotal} units
                                          </span>
                                          {brand.brandCratesTotal > 0 && (
                                            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold tabular-nums">
                                              {formatCrates(brand.brandCratesTotal)} crates
                                            </span>
                                          )}
                                          {brand.brandAmountTotal > 0 && (
                                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-semibold tabular-nums ml-auto">
                                              {formatCurrency(brand.brandAmountTotal)}
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>

                                {/* Product rows — only when expanded */}
                                {!isCollapsed && brand.products.map(p => (
                                  <tr key={p.productId} className="border-t border-slate-100 hover:bg-slate-50/60">
                                    <td className="px-3 py-2.5 text-sm text-slate-700">{p.productName}</td>
                                    <td className="px-3 py-2.5 text-right text-sm tabular-nums font-bold text-slate-800">
                                      {p.qty > 0 ? p.qty : <span className="text-slate-300 font-normal">—</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">
                                      {(p.crates != null && p.qty > 0) ? formatCrates(p.crates) : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-500">
                                      {(p.unitPrice != null && p.qty > 0) ? formatCurrency(p.unitPrice) : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-700">
                                      {p.amount > 0 ? formatCurrency(p.amount) : <span className="text-slate-300">—</span>}
                                    </td>
                                  </tr>
                                ))}

                                {/* Brand subtotal — only when expanded */}
                                {!isCollapsed && (
                                  <tr className="bg-emerald-50 border-t-2 border-emerald-100">
                                    <td className="px-3 py-2.5 text-sm font-bold text-emerald-800">{brand.brandName} Total</td>
                                    <td className="px-3 py-2.5 text-right text-sm font-bold text-emerald-700 tabular-nums">
                                      {brand.brandQtyTotal > 0 ? brand.brandQtyTotal : '—'}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-sm font-bold text-emerald-700 tabular-nums">
                                      {brand.brandCratesTotal > 0 ? formatCrates(brand.brandCratesTotal) : '—'}
                                    </td>
                                    <td className="px-3 py-2.5" />
                                    <td className="px-3 py-2.5 text-right text-sm font-bold text-emerald-700 tabular-nums">
                                      {brand.brandAmountTotal > 0 ? formatCurrency(brand.brandAmountTotal) : '—'}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                        <tfoot className="sticky bottom-0 z-10">
                          <tr>
                            <td className="bg-slate-700 px-3 py-2.5 text-xs font-bold text-white uppercase tracking-wider border-t-2 border-slate-600">
                              Total
                            </td>
                            <td className="bg-slate-700 px-3 py-2.5 text-right border-t-2 border-slate-600 whitespace-nowrap">
                              {tableTotals.qty > 0
                                ? <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold tabular-nums">{tableTotals.qty} units</span>
                                : <span className="text-sm font-bold text-emerald-300">—</span>}
                            </td>
                            <td className="bg-slate-700 px-3 py-2.5 text-right border-t-2 border-slate-600 whitespace-nowrap">
                              {tableTotals.crates > 0
                                ? <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold tabular-nums">{formatCrates(tableTotals.crates)} crates</span>
                                : <span className="text-sm font-bold text-amber-300">—</span>}
                            </td>
                            <td className="bg-slate-700 px-3 py-2.5 border-t-2 border-slate-600" />
                            <td className="bg-slate-700 px-3 py-2.5 text-right text-sm font-bold text-white tabular-nums border-t-2 border-slate-600 whitespace-nowrap">
                              {tableTotals.amount > 0 ? formatCurrency(tableTotals.amount) : '—'}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Grand total bar */}
              <div className="flex-shrink-0 bg-white border-t-2 border-emerald-200 px-4 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grand Total</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {selectedRow.salespersonName}
                    {tableTotals.qty > 0 && <span className="font-semibold text-emerald-600"> · {tableTotals.qty} units</span>}
                    {tableTotals.crates > 0 && <span className="font-semibold text-amber-600"> · {formatCrates(tableTotals.crates)} crates</span>}
                  </p>
                </div>
                <p className="text-lg font-extrabold text-emerald-700 tabular-nums flex-shrink-0">
                  {formatCurrency(selectedRow.totalAmount)}
                </p>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Lock / Unlock confirmation modal */}
      <ConfirmationModal
        isOpen={!!lockConfirm}
        onClose={() => setLockConfirm(null)}
        onConfirm={confirmLockToggle}
        title={lockConfirm?.isLocked ? 'Unlock entry?' : 'Lock entry?'}
        message={
          lockConfirm
            ? lockConfirm.isLocked
              ? `${lockConfirm.name}'s dispatch will be unlocked so they can edit it again.`
              : `${lockConfirm.name}'s dispatch will be locked and they won't be able to make changes.`
            : ''
        }
        confirmText={lockConfirm?.isLocked ? 'Yes, Unlock' : 'Yes, Lock'}
        cancelText="Cancel"
        tone={lockConfirm?.isLocked ? 'warning' : 'danger'}
        icon={lockConfirm?.isLocked ? LockOpen : Lock}
      />

      {/* Open-for-entry confirmation modal */}
      <ConfirmationModal
        isOpen={!!openConfirm}
        onClose={() => setOpenConfirm(null)}
        onConfirm={confirmOpenForEntry}
        title="Open this date for entry?"
        message={
          openConfirm
            ? `${openConfirm.name} never entered anything for this date. Opening it lets them fill it in from their Stock Entry page.`
            : ''
        }
        confirmText="Yes, Open"
        cancelText="Cancel"
        tone="warning"
        icon={LockOpen}
      />

      {/* Finalize-day confirmation modal */}
      <ConfirmationModal
        isOpen={finalizeConfirm}
        onClose={() => setFinalizeConfirm(false)}
        onConfirm={confirmFinalizeDay}
        title="Finalize today?"
        message="Any salesperson still unlocked today will be automatically locked. After this, only an admin can make further changes today."
        confirmText="Yes, Finalize"
        cancelText="Cancel"
        tone="danger"
        icon={FlagTriangleRight}
      />

    </div>
  );
}
