import { useState, useEffect, useMemo, Fragment } from 'react';
import { TrendingUp, Search, X } from 'lucide-react';
import BrandedLoader from '../../components/ui/BrandedLoader';
import PinModal from '../../components/PinModal';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

// Matches the avatar treatment on the Collections page so the two salesman
// sidebars read as the same component family.
function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Profit is a loss when negative — one place decides the colour for all of it. */
function toneFor(profit) {
  if (profit > 0) return { text: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' };
  if (profit < 0) return { text: 'text-red-600',     bg: 'bg-red-50 border-red-200' };
  return { text: 'text-slate-500', bg: 'bg-slate-50 border-slate-200' };
}

const ALL = 'all';

/**
 * Groups an already display-order-sorted product list by brand, so the
 * detail table can show a brand header the same way the pricing tab shows a
 * category header — without re-sorting (the server already ordered these by
 * brand → category → product display order).
 */
function groupByBrand(products) {
  const map = new Map();
  for (const p of products) {
    const key = p.brandName ?? 'Other';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return [...map.entries()];
}

export default function SalesmanProfitLoss() {
  const { notify } = useNotification();
  const today = getIndiaDate();

  // Settings gate — fetch whether the P&L PIN is required before rendering.
  // Fail-closed: plPinEnabled defaults to true so the gate stays visible
  // if the request fails.
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [plPinEnabled,    setPlPinEnabled]    = useState(true);

  // PIN gate — mount-scoped: resets to false every time the page mounts,
  // so the PIN is required on every visit (no sessionStorage caching).
  const [pinVerified, setPinVerified] = useState(false);

  // Fetch the PIN gate setting once on mount.
  useEffect(() => {
    api.get('/pin/settings')
      .then(r => setPlPinEnabled(r.data.data.plPinEnabled))
      .catch(() => {}) // fail-closed: plPinEnabled stays true
      .finally(() => setSettingsLoading(false));
  }, []);

  // needsPin is the single source of truth: gate is only active when the
  // feature is enabled AND the admin hasn't verified the PIN this visit.
  const needsPin = plPinEnabled && !pinVerified;

  // Opens on "today's P&L"; widening the range gives the range view.
  const [from, setFrom]         = useState(today);
  const [to, setTo]             = useState(today);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState(ALL);

  // Fetch lives inside the effect so no state is set synchronously during
  // render, and the `cancelled` flag drops a slow in-flight response if the
  // dates change again before it lands — otherwise an earlier, slower request
  // could overwrite the newer range's figures.
  useEffect(() => {
    if (settingsLoading || needsPin) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const r = await api.get(`/reports/profit-loss?from=${from}&to=${to}`);
        if (!cancelled) setData(r.data.data);
      } catch (e) {
        if (cancelled) return;
        setData(null);
        notify(e.response?.data?.error ?? 'Failed to load profit & loss', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [from, to, notify, settingsLoading, needsPin]);

  const salespeople = useMemo(() => data?.salespeople ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return salespeople;
    return salespeople.filter(s =>
      s.name.toLowerCase().includes(q) || (s.route ?? '').toLowerCase().includes(q)
    );
  }, [salespeople, search]);

  const selectedSp = selected === ALL ? null : salespeople.find(s => s.salespersonId === selected);
  const totals     = data?.totals ?? { revenue: 0, cost: 0, profit: 0, marginPct: 0 };
  const totalTone  = toneFor(totals.profit);

  // Wait for the settings fetch before deciding whether to show the gate.
  if (settingsLoading) return <BrandedLoader />;

  // PIN gate — render PinModal and nothing else until PIN is verified
  if (needsPin) {
    return (
      <PinModal
        isOpen
        onClose={() => {}}
        onSuccess={() => setPinVerified(true)}
        title="Enter PIN to view Profit & Loss"
        verifyPath="/pin/verify-pl"
      />
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* Page header */}
      <div className="flex items-center gap-2.5 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <TrendingUp size={17} className="text-emerald-300 flex-shrink-0" />
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">Profit &amp; Loss</h1>
          <p className="text-emerald-300 text-xs">Margin earned on stock given to each salesman</p>
        </div>
      </div>

      {/* Date range */}
      <div className="flex flex-wrap items-center gap-4 px-4 md:px-6 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">From</label>
          <input
            type="date" value={from} max={to}
            onChange={e => setFrom(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">To</label>
          <input
            type="date" value={to} min={from}
            onChange={e => setTo(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <span className="text-xs text-slate-400">
          {from === to ? 'Showing a single day' : 'Showing a date range'}
        </span>
      </div>

      {/* Summary cards — the overall figure for the selected period */}
      {!loading && data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 md:px-6 py-3 bg-slate-50 border-b border-slate-200 flex-shrink-0">
          {[
            { label: 'Cost (Dairy Paid)',      value: formatCurrency(totals.cost),    cls: 'text-slate-700', bg: 'bg-white border-slate-200' },
            { label: 'Revenue (Dairy Earned)', value: formatCurrency(totals.revenue), cls: 'text-slate-700', bg: 'bg-white border-slate-200' },
            { label: 'Profit/Loss', value: formatCurrency(totals.profit), cls: totalTone.text, bg: totalTone.bg },
            { label: 'Margin', value: `${totals.marginPct}%`, cls: totalTone.text, bg: totalTone.bg },
          ].map(({ label, value, cls, bg }) => (
            <div key={label} className={`rounded-xl border px-4 py-2.5 ${bg}`}>
              <p className="text-[11px] text-slate-500 font-medium mb-0.5">{label}</p>
              <p className={`text-lg font-bold tabular-nums ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex-1"><BrandedLoader /></div>
      ) : (
        <div className="flex flex-1 overflow-hidden">

          {/* ── Left sidebar — same structure as Collections ──────────── */}
          <div className="flex flex-col w-64 flex-shrink-0 border-r border-slate-200 bg-white">
            <div className="p-3 border-b border-slate-100">
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

            <div className="flex-1 overflow-y-auto">
              {/* Overall roll-up, pinned above the roster */}
              <button
                onClick={() => setSelected(ALL)}
                className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                  selected === ALL
                    ? 'bg-emerald-50 border-l-4 border-l-emerald-600'
                    : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-bold ${selected === ALL ? 'text-emerald-700' : 'text-slate-700'}`}>
                    All Salespeople
                  </span>
                  <span className={`text-xs font-bold tabular-nums ${totalTone.text}`}>
                    {formatCurrency(totals.profit)}
                  </span>
                </div>
              </button>

              {filtered.map(sp => {
                const isSelected = sp.salespersonId === selected;
                const tone = toneFor(sp.profit);
                return (
                  <button
                    key={sp.salespersonId}
                    onClick={() => setSelected(sp.salespersonId)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                      isSelected
                        ? 'bg-emerald-50 border-l-4 border-l-emerald-600'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                        isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {getInitials(sp.name)}
                      </div>
                      <span className={`text-sm font-semibold flex-1 truncate ${isSelected ? 'text-emerald-700' : 'text-slate-700'}`}>
                        {sp.name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pl-8">
                      {sp.route && <p className="text-xs text-slate-400 truncate">{sp.route}</p>}
                      <span className={`text-xs font-bold tabular-nums flex-shrink-0 ml-auto ${tone.text}`}>
                        {formatCurrency(sp.profit)}
                      </span>
                    </div>
                  </button>
                );
              })}

              {filtered.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-slate-400">No salespeople match</p>
              )}
            </div>
          </div>

          {/* ── Right detail panel ─────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto bg-slate-100 p-4 md:p-6">
            {selected === ALL
              ? <OverallPanel daily={data?.daily ?? []} totals={totals} />
              : <SalespersonPanel sp={selectedSp} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** Day-by-day movement across every salesman. */
function OverallPanel({ daily, totals }) {
  if (daily.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-10 text-center text-slate-400 text-sm">
        No stock was dispatched in this period.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-slate-700">
        <h2 className="text-sm font-bold text-white">Daily Profit &amp; Loss</h2>
        <p className="text-xs text-slate-400">{daily.length} day{daily.length !== 1 ? 's' : ''} with dispatches</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              {['Date', 'Cost (Dairy Paid)', 'Revenue (Dairy Earned)', 'Profit/Loss', 'Margin'].map(h => (
                <th key={h} className="bg-emerald-700 px-3 py-2.5 text-center text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {daily.map(d => {
              const tone = toneFor(d.profit);
              return (
                <tr key={d.date} className={`border-b border-slate-100 ${d.profit < 0 ? 'bg-red-50/40' : ''}`}>
                  <td className="px-3 py-2.5 text-center text-xs font-semibold text-slate-700 whitespace-nowrap">
                    {new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' })}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs tabular-nums text-slate-600">{formatCurrency(d.cost)}</td>
                  <td className="px-3 py-2.5 text-center text-xs tabular-nums text-slate-600">{formatCurrency(d.revenue)}</td>
                  <td className={`px-3 py-2.5 text-center text-xs tabular-nums font-bold ${tone.text}`}>{formatCurrency(d.profit)}</td>
                  <td className={`px-3 py-2.5 text-center text-xs tabular-nums font-bold ${tone.text}`}>{d.marginPct}%</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="bg-emerald-800 px-3 py-2.5 text-center text-xs font-bold text-white">TOTAL</td>
              <td className="bg-emerald-800 px-3 py-2.5 text-center text-xs font-bold text-white tabular-nums">{formatCurrency(totals.cost)}</td>
              <td className="bg-emerald-800 px-3 py-2.5 text-center text-xs font-bold text-white tabular-nums">{formatCurrency(totals.revenue)}</td>
              <td className="bg-emerald-800 px-3 py-2.5 text-center text-sm font-bold text-amber-300 tabular-nums">{formatCurrency(totals.profit)}</td>
              <td className="bg-emerald-800 px-3 py-2.5 text-center text-sm font-bold text-amber-300 tabular-nums">{totals.marginPct}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** Product-level breakdown for one salesman. */
function SalespersonPanel({ sp }) {
  if (!sp) return null;

  if (sp.products.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-10 text-center text-slate-400 text-sm">
        No stock was dispatched to {sp.name} in this period.
      </div>
    );
  }

  const tone = toneFor(sp.profit);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-slate-700 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white">{sp.name}</h2>
          <p className="text-xs text-slate-400">
            {sp.products.length} product{sp.products.length !== 1 ? 's' : ''} · margin {sp.marginPct}%
          </p>
        </div>
        <span className={`text-sm font-bold tabular-nums px-3 py-1 rounded-lg bg-white ${tone.text}`}>
          {formatCurrency(sp.profit)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 620 }}>
          <thead>
            <tr>
              {['Product', 'Cost Price', 'Selling Price', 'Qty', 'Total', 'Profit/Loss'].map(h => (
                <th key={h} className="bg-emerald-700 px-3 py-2.5 text-center text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">
                  {h}
                  {h === 'Total' && <span className="block text-[9px] font-normal normal-case text-emerald-200 tracking-normal">(Qty × Selling Price)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupByBrand(sp.products).map(([brandName, items]) => {
              const brandProfit = items.reduce((s, p) => s + p.profit, 0);
              const brandTone   = toneFor(brandProfit);
              return (
                <Fragment key={brandName}>
                  <tr className="bg-slate-100 border-l-4 border-emerald-500">
                    <td colSpan={6} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">{brandName}</span>
                        <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-full border ${brandTone.bg} ${brandTone.text}`}>
                          {formatCurrency(brandProfit)}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {items.map(p => {
                    const pTone = toneFor(p.profit);
                    return (
                      <tr key={p.productId} className={`border-b border-slate-100 ${p.profit < 0 ? 'bg-red-50/40' : ''}`}>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-xs font-semibold text-slate-800">{p.productName}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs tabular-nums text-slate-600">{formatCurrency(p.avgCostPrice)}</td>
                        <td className="px-3 py-2.5 text-center text-xs tabular-nums text-slate-600">{formatCurrency(p.avgBilledPrice)}</td>
                        <td className="px-3 py-2.5 text-center text-xs tabular-nums text-slate-600">{p.quantity}</td>
                        <td className="px-3 py-2.5 text-center text-xs tabular-nums text-slate-600">{formatCurrency(p.revenue)}</td>
                        <td className={`px-3 py-2.5 text-center text-xs tabular-nums font-bold ${pTone.text}`}>{formatCurrency(p.profit)}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="bg-emerald-800 px-3 py-2.5 text-center text-xs font-bold text-white">TOTAL</td>
              <td className="bg-emerald-800 px-3 py-2.5 text-center text-xs font-bold text-white tabular-nums">{formatCurrency(sp.revenue)}</td>
              <td className="bg-emerald-800 px-3 py-2.5 text-center text-sm font-bold text-amber-300 tabular-nums">{formatCurrency(sp.profit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
