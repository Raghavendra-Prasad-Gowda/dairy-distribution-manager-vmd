import { useEffect, useState } from 'react';
import { AlertCircle, Droplets, ChevronDown, ChevronRight, Printer, Landmark } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import BrandedLoader from '../../components/ui/BrandedLoader';
import Button from '../../components/ui/Button';
import BulkTopUpModal from '../../components/BulkTopUpModal';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { getYesterday, formatCurrency } from '../../utils/dateUtils';
import { useApiResource } from '../../hooks/useApiResource';
import api from '../../api/axios';


export default function DepositReport({ shellActiveBrandId, shellBrands } = {}) {
  const inShell = shellActiveBrandId != null;
  const { user } = useAuth();
  const { notify } = useNotification();
  // Loading a pre-existing deposit balance is superadmin-only, mirroring the
  // requireSuperAdmin guard on the API route.
  const isSuperAdmin = user?.role === 'superadmin';
  const [brands, setBrands]               = useState(shellBrands ?? []);
  const [activeBrandId, setActiveBrandId] = useState(shellActiveBrandId ?? null);
  const [from, setFrom]                   = useState(getYesterday());
  const [to, setTo]                       = useState(getYesterday());
  const [collapsed, setCollapsed]         = useState(new Set());
  const [topUpOpen, setTopUpOpen]         = useState(false);

  // A deposit top-up only makes sense for a brand that actually has deposit
  // configured — the picker only offers those. The button itself is gated on
  // the currently active/viewed brand specifically (not "any brand
  // somewhere"), so it disappears on a tab like Jersey or Gowardhan that has
  // no deposit configured, even while Nandini elsewhere does.
  const depositEnabledBrands = brands.filter(b => b.depositEnabled);
  const activeBrand           = brands.find(b => b.id === activeBrandId);

  useEffect(() => {
    if (inShell) return;
    api.get('/brands').then(r => {
      const list = r.data.data ?? [];
      setBrands(list);
      if (list.length) setActiveBrandId(list[0].id);
    }).catch(() => {});
  }, [inShell]);

  useEffect(() => {
    if (inShell) { setActiveBrandId(shellActiveBrandId); setBrands(shellBrands ?? []); }
  }, [shellActiveBrandId, shellBrands, inShell]);

  // Deposit summary fetch. Previously this silently swallowed fetch errors
  // (.catch(() => setData(null)), no notify) — that's the "no silent
  // failures" anti-pattern CLAUDE.md calls out, so this migration also fixes
  // it: useApiResource's default notifyOnError:true now surfaces a toast.
  const { data, loading, refetch: fetchDeposit } = useApiResource(
    activeBrandId ? `/reports/deposit-summary?brandId=${activeBrandId}&from=${from}&to=${to}` : null,
    {
      // Collapse all by default when viewing more than one day; reset to
      // fully expanded for a single-day view — same net result as the old
      // fetchDeposit's setCollapsed(new Set()) + conditional re-set.
      select: (payload) => {
        setCollapsed(from !== to
          ? new Set((payload?.rows ?? []).filter(r => r.dailyDeposit > 0).map(r => r.date))
          : new Set());
        return payload;
      },
    }
  );

  const daysWithDeposit = data?.rows.filter(r => r.dailyDeposit > 0).length ?? 0;
  // Excludes any carried-forward opening balance — this is an average of
  // what accrued/was added within the selected window, not the all-time total.
  const windowDeposit   = (data?.totalDeposit ?? 0) - (data?.openingDeposit ?? 0);
  const avgPerDay       = daysWithDeposit > 0 ? (windowDeposit / daysWithDeposit) : 0;

  const depositRows     = data?.rows.filter(r => r.dailyDeposit > 0) ?? [];
  const allCollapsed    = depositRows.length > 0 && depositRows.every(r => collapsed.has(r.date));

  function toggleRow(dateKey) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(dateKey) ? next.delete(dateKey) : next.add(dateKey);
      return next;
    });
  }

  function collapseAll() {
    setCollapsed(new Set(depositRows.map(r => r.date)));
  }

  function expandAll() {
    setCollapsed(new Set());
  }

  return (
    <div className={inShell ? 'h-full overflow-y-auto bg-slate-100 pb-8' : 'bg-slate-100 min-h-screen pb-8'}>

      {/* Header — hidden in shell mode */}
      {!inShell && (
        <div className="flex items-center gap-3 px-4 md:px-6 py-3.5 bg-emerald-800">
          <Droplets size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Deposit Report</h1>
            <p className="text-emerald-300 text-xs">Deposit per litre over time</p>
          </div>
        </div>
      )}

      {/* Brand tabs — hidden in shell mode */}
      {!inShell && brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActiveBrandId} />
      )}

      {/* Date range */}
      <div className="mx-4 mt-4 bg-white rounded-2xl border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        {data && (
          <span className="text-xs text-slate-400">
            Rate: <span className="font-semibold text-slate-600">₹{data.depositPerLitre}/L</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {isSuperAdmin && activeBrand?.depositEnabled && (
            <Button variant="soft-teal" size="sm" icon={Landmark} onClick={() => setTopUpOpen(true)}>
              Deposit Top-up
            </Button>
          )}
          {data && data.depositEnabled && data.rows.some(r => r.dailyDeposit > 0) && (
            <button
              onClick={() => window.open(`/print/deposit?brandId=${activeBrandId}&from=${from}&to=${to}`, '_blank')}
              className="flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-4 py-2 transition"
            >
              <Printer size={15} /> Print
            </button>
          )}
        </div>
      </div>

      {/* Deposit top-up modal — a standalone ledger entry, NOT a payment. It
          only ever feeds this report's running total and never touches the
          dairy's main owed-for-stock balance on the Statement tab. */}
      <BulkTopUpModal
        open={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        entities={depositEnabledBrands}
        notify={notify}
        entryKey="brandId"
        nounSingular="brand"
        nounPlural="brands"
        searchPlaceholder="Search brand…"
        titlePrefix="Deposit Top-up"
        actionNoun="deposit top-up"
        accent="teal"
        icon={Landmark}
        warning={
          <>
            A deposit top-up records a crate/container deposit already held with
            this brand from before the app. It only adds to this Deposit report's
            running total — it does <strong>not</strong> affect what you owe the
            dairy for stock on the Statement tab.
          </>
        }
        onSaved={async ({ paymentDate, notes, entries }) => {
          const res = await api.post('/dairy-deposit-topups/bulk', { topUpDate: paymentDate, notes, entries });
          // The modal defaults to today, but this report defaults to
          // yesterday — a same-day top-up would otherwise land outside the
          // visible window and look like it silently did nothing. Widen the
          // range to include it (string comparison is safe: both are
          // "YYYY-MM-DD", which sorts chronologically) instead of leaving
          // the user to notice and fix the date pickers themselves.
          const widerFrom = paymentDate < from;
          const widerTo   = paymentDate > to;
          if (widerFrom) setFrom(paymentDate);
          if (widerTo)   setTo(paymentDate);
          if (!widerFrom && !widerTo) await fetchDeposit();
          return res.data.data;
        }}
      />

      {/* Deposit not enabled */}
      {!loading && data && !data.depositEnabled && (
        <div className="mx-4 mt-4 bg-white border border-amber-200 rounded-2xl px-5 py-6 flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-slate-800">Deposit not enabled for {data.brandName}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Go to <span className="font-semibold text-emerald-700">Setup → Brands</span> to enable deposit and set the rate.
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <BrandedLoader />}

      {/* Summary cards */}
      {!loading && data && data.depositEnabled && (
        <>
          <div className="mx-4 mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Total Deposit',     value: formatCurrency(data.totalDeposit), color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
              { label: 'Days with Deposit', value: daysWithDeposit,                   color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200' },
              { label: 'Avg / Active Day',  value: formatCurrency(avgPerDay),         color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`rounded-2xl border px-4 py-3 ${bg}`}>
                <p className="text-[11px] text-slate-500 font-medium mb-0.5">{label}</p>
                <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          {data.rows.length === 0 && !(data.openingDeposit > 0) ? (
            <div className="mx-4 mt-4 bg-white rounded-2xl border border-slate-200 px-5 py-10 text-center text-slate-400 text-sm">
              No stock receipts found for this period.
            </div>
          ) : (
            <div className="mx-4 mt-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-slate-700 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white">Deposit Details</h2>
                  <p className="text-xs text-slate-400">
                    {daysWithDeposit} day{daysWithDeposit !== 1 ? 's' : ''} with deposit · tap a date row to expand
                  </p>
                </div>
                {depositRows.length > 0 && (
                  <button
                    onClick={allCollapsed ? expandAll : collapseAll}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white transition whitespace-nowrap flex-shrink-0"
                  >
                    {allCollapsed
                      ? <><ChevronDown  size={13} /> Expand All</>
                      : <><ChevronRight size={13} /> Collapse All</>
                    }
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-separate border-spacing-0" style={{ minWidth: 520 }}>
                      <thead className="sticky top-0 z-10">
                        <tr>
                          <th className="bg-emerald-700 px-3 py-3 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">Date</th>
                          <th className="bg-emerald-700 px-3 py-3 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Product</th>
                          <th className="bg-emerald-700 px-3 py-3 text-right text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">Qty</th>
                          <th className="bg-emerald-700 px-3 py-3 text-right text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">L / Kg</th>
                          <th className="bg-emerald-700 px-3 py-3 text-right text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">Deposit</th>
                          <th className="bg-emerald-700 px-3 py-3 text-right text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">Running Total</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {data.openingDeposit > 0 && (
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-slate-500 border-r border-slate-100">
                              Opening deposit carried forward (before {new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })})
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="text-xs tabular-nums font-bold text-slate-600">{formatCurrency(data.openingDeposit)}</span>
                            </td>
                          </tr>
                        )}
                        {data.rows.map((row) => {
                          const dateKey    = row.date;
                          const dateStr    = new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' });
                          const hasDeposit = row.dailyDeposit > 0;
                          const isCollapsed = collapsed.has(dateKey);

                          if (!hasDeposit) {
                            return (
                              <tr key={dateKey} className="border-b border-slate-100">
                                <td className="px-3 py-2.5 border-r border-slate-100">
                                  <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">{dateStr}</span>
                                </td>
                                <td colSpan={4} className="px-3 py-2.5 border-r border-slate-100">
                                  <span className="text-xs text-slate-300 italic">No qualifying receipts</span>
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <span className="text-xs tabular-nums text-slate-400">{formatCurrency(row.runningTotal)}</span>
                                </td>
                              </tr>
                            );
                          }

                          // Summary row (always shown for deposit days)
                          const summaryRow = (
                            <tr
                              key={`${dateKey}-summary`}
                              className="border-b border-slate-100 cursor-pointer hover:bg-emerald-50/30 transition-colors"
                              onClick={() => toggleRow(dateKey)}
                            >
                              <td className="px-3 py-2.5 border-r border-slate-100 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  {isCollapsed
                                    ? <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />
                                    : <ChevronDown  size={13} className="text-slate-400 flex-shrink-0" />
                                  }
                                  <span className="text-xs font-bold text-slate-700">{dateStr}</span>
                                </div>
                              </td>
                              <td colSpan={3} className="px-3 py-2.5 border-r border-slate-100">
                                {isCollapsed && (
                                  <span className="text-xs text-slate-400">
                                    {row.items.length} product{row.items.length !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right border-r border-slate-100">
                                <span className="text-xs tabular-nums font-bold text-emerald-700">{formatCurrency(row.dailyDeposit)}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-sm tabular-nums font-bold text-slate-700">{formatCurrency(row.runningTotal)}</span>
                              </td>
                            </tr>
                          );

                          if (isCollapsed) return summaryRow;

                          // Group items by category (order preserved from backend sort)
                          const catGroups = [];
                          const catSeen = new Map();
                          for (const it of row.items) {
                            if (!catSeen.has(it.category)) {
                              catSeen.set(it.category, []);
                              catGroups.push({ category: it.category, items: catSeen.get(it.category) });
                            }
                            catSeen.get(it.category).push(it);
                          }

                          let globalIdx = 0;
                          return [
                            summaryRow,
                            ...catGroups.map(({ category, items: catItems }) => (
                              [
                                <tr key={`${dateKey}-cat-${category}`} className="border-b border-slate-50">
                                  <td className="px-3 py-1 border-r border-slate-100 whitespace-nowrap" />
                                  <td colSpan={5} className="px-3 py-1 bg-slate-50">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{category}</span>
                                  </td>
                                </tr>,
                                ...catItems.map((it) => {
                                  const localIdx = globalIdx++;

                                  // Manual top-up rows have no product/qty/volume — just an
                                  // amount and who added it.
                                  if (it.isTopUp) {
                                    return (
                                      <tr key={`${dateKey}-${localIdx}`} className="border-b border-slate-50 bg-teal-50/40 hover:bg-teal-50/70 transition-colors">
                                        <td className="px-3 py-2 border-r border-slate-100 whitespace-nowrap" />
                                        <td className="px-3 py-2 border-r border-slate-100" colSpan={2}>
                                          <span className="text-xs font-semibold text-teal-800">{it.productName}</span>
                                          {(it.notes || it.createdBy) && (
                                            <span className="ml-1.5 text-[10px] text-slate-400">
                                              {[it.notes, it.createdBy && `by ${it.createdBy}`].filter(Boolean).join(' · ')}
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-right border-r border-slate-100">
                                          <span className="text-xs text-slate-300">—</span>
                                        </td>
                                        <td className="px-3 py-2 text-right border-r border-slate-100">
                                          <span className="text-xs tabular-nums font-bold text-teal-700">{formatCurrency(it.depositAmount)}</span>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          {isSuperAdmin && it.id != null && (
                                            <button
                                              onClick={async () => {
                                                if (!window.confirm('Delete this deposit top-up?')) return;
                                                notify('Deleting deposit top-up…', 'loading');
                                                try {
                                                  await api.delete(`/dairy-deposit-topups/${it.id}`);
                                                  notify('Deposit top-up deleted', 'success');
                                                  fetchDeposit();
                                                } catch (e) {
                                                  notify(e.response?.data?.error ?? 'Failed to delete deposit top-up', 'error');
                                                }
                                              }}
                                              className="text-[10px] font-semibold text-red-500 hover:text-red-700"
                                            >
                                              Delete
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  }

                                  const unit    = it.unitType === 'gram' ? 'kg' : 'L';
                                  const sizeStr = it.unitType === 'gram' ? `${it.unitSize}g` : `${it.unitSize}ml`;
                                  const volCell = <span className="text-xs tabular-nums font-medium text-slate-700">{it.volumeOrWeight.toFixed(2)} {unit}</span>;

                                  return (
                                    <tr key={`${dateKey}-${localIdx}`} className="border-b border-slate-50 hover:bg-emerald-50/40 transition-colors">
                                      <td className="px-3 py-2 border-r border-slate-100 whitespace-nowrap" />
                                      <td className="px-3 py-2 border-r border-slate-100">
                                        <span className="text-xs font-semibold text-slate-800">{it.productName}</span>
                                        <span className="ml-1.5 text-[10px] text-slate-400">{sizeStr}</span>
                                      </td>
                                      <td className="px-3 py-2 text-right border-r border-slate-100">
                                        <span className="text-xs tabular-nums text-slate-600">{it.quantity}</span>
                                      </td>
                                      <td className="px-3 py-2 text-right border-r border-slate-100">
                                        {volCell}
                                      </td>
                                      <td className="px-3 py-2 text-right border-r border-slate-100">
                                        <span className="text-xs tabular-nums font-bold text-emerald-700">{formatCurrency(it.depositAmount)}</span>
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <span className="text-xs text-slate-200">—</span>
                                      </td>
                                    </tr>
                                  );
                                }),
                              ]
                            )),
                          ];
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4} className="bg-emerald-800 px-3 py-3 text-xs font-bold text-white border-r border-emerald-700">
                            TOTAL — {daysWithDeposit} days with deposit
                          </td>
                          <td className="bg-emerald-800 px-3 py-3 text-right border-r border-emerald-700">
                            <span className="text-sm font-bold text-amber-300 tabular-nums">{formatCurrency(data.totalDeposit)}</span>
                          </td>
                          <td className="bg-emerald-800 px-3 py-3 text-right">
                            <span className="text-sm font-bold text-amber-300 tabular-nums">{formatCurrency(data.totalDeposit)}</span>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
