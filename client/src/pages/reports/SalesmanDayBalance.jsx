import React, { useState, useMemo } from 'react';
import { AlertCircle, Wallet, Search, X } from 'lucide-react';
import BrandedLoader from '../../components/ui/BrandedLoader';
import DateSelector from '../../components/DateSelector';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import { useApiResource } from '../../hooks/useApiResource';

/** Decimals arrive as strings — round derived sums so 22797.999999 never surfaces. */
const round2 = (n) => Math.round(n * 100) / 100;

export default function SalesmanDayBalance() {
  const [date, setDate]       = useState(getIndiaDate());
  const [search, setSearch]   = useState('');

  const { data: rows, loading, error } = useApiResource(
    `/salesperson-balance?date=${date}`,
    {
      initialData: [],
      notifyOnError: false,
      // API already returns salespeople in the defined display order
      select: (payload) => (payload ?? []).filter(b =>
        Number(b.openingBalance) !== 0 || Number(b.amountPaid) !== 0 || Number(b.closingBalance) !== 0
      ),
    }
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.salespersonName.toLowerCase().includes(q) ||
      (r.route ?? '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  // A top-up is a pre-existing due an admin loaded — it ADDS to what the
  // salesman owes (closing = opening + stockGiven + topUpAmount − amountPaid),
  // so it belongs on the same side as the day's bill.
  //
  // A salesman's collection clears THAT DAY'S bill first; only what he hands
  // over beyond it reaches the dues carried in from earlier days. The day
  // balance used to be a signed net (bill − paid), so an overpayment showed as
  // a negative and quietly subtracted from every other salesman's genuine
  // shortfall in the totals row — understating the day's uncollected billing
  // by exactly the amount recovered against old dues. Floor the day balance at
  // zero and carry that overpayment in its own Excess Paid column instead.
  const decorated = useMemo(() => filteredRows.map((r) => {
    const opening   = Number(r.openingBalance);
    const stock     = Number(r.stockGiven);
    const topUp     = Number(r.topUpAmount ?? 0);
    const paid      = Number(r.amountPaid);
    const todayBill = round2(stock + topUp);

    const todayBalance = round2(Math.max(todayBill - paid, 0)); // today's bill still uncollected
    const excess       = round2(Math.max(paid - todayBill, 0)); // handed over beyond today's bill
    const oldRecovered = round2(Math.min(excess, Math.max(opening, 0)));
    const advance      = round2(excess - oldRecovered);         // genuine credit — no old dues left

    return {
      ...r,
      opening, stock, topUp, paid,
      billPlusBalance: round2(todayBill + opening),
      todayBalance, excess, advance,
      closing: Number(r.closingBalance),
    };
  }), [filteredRows]);

  // Outstanding + Day Balance − Excess Paid must equal Total Balance, so the
  // excess is totalled as a column of its own and the footer reconciles across.
  const totals = useMemo(() => decorated.reduce((t, r) => ({
    bill:            round2(t.bill            + r.stock),
    topUp:           round2(t.topUp           + r.topUp),
    balance:         round2(t.balance         + r.opening),
    billPlusBalance: round2(t.billPlusBalance + r.billPlusBalance),
    paid:            round2(t.paid            + r.paid),
    todayBalance:    round2(t.todayBalance    + r.todayBalance),
    excess:          round2(t.excess          + r.excess),
    remaining:       round2(t.remaining       + r.closing),
  }), {
    bill: 0, topUp: 0, balance: 0, billPlusBalance: 0,
    paid: 0, todayBalance: 0, excess: 0, remaining: 0,
  }), [decorated]);

  const showTopUp = useMemo(
    () => decorated.some(r => r.topUp !== 0),
    [decorated]
  );

  // Most days nobody pays past their bill — only surface the column when
  // someone did, the same way Old Balance Added appears only when relevant.
  const showExcess = useMemo(
    () => decorated.some(r => r.excess > 0),
    [decorated]
  );

  // Total Balance can still go negative — that is a real advance sitting with
  // the dairy. The day balance cannot, so it only ever reads red or green.
  const remColor = (v) => v > 0 ? 'text-red-600' : v < 0 ? 'text-violet-600' : 'text-emerald-600';

  // Column headers read "Today" when viewing today's date, and fall back to
  // the actual date (e.g. "04 Jul") when browsing a different day.
  const isToday  = date === getIndiaDate();
  const dayLabel = isToday
    ? 'Today'
    : new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const billHeader        = `${dayLabel}'s Bill`;
  const billBalanceHeader = `${dayLabel} Bill + Outstanding Balance`;
  const paidHeader        = `${dayLabel} Paid`;

  return (
    <div className="flex flex-col h-full bg-slate-100">

      {/* Page header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Wallet size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Day Balance</h1>
            <p className="text-emerald-300 text-xs">Outstanding, paid and remaining per salesman</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} dark />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border-b border-red-200 text-red-700 px-4 py-2.5 text-sm flex-shrink-0">
          <AlertCircle size={14} className="flex-shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1"><BrandedLoader /></div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
          <AlertCircle size={22} className="text-slate-300" />
          <p className="text-sm">All settled — no outstanding or payments for this date</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 p-4 gap-3">

          {/* Search */}
          <div className="relative max-w-sm flex-shrink-0">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or route…"
              className="w-full pl-8 pr-7 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-300"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="h-full overflow-auto">
              <table className="min-w-full text-sm border-separate border-spacing-0">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="bg-emerald-700 px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 sticky left-0 z-20">Salesman</th>
                    <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">{billHeader}</th>
                    {showTopUp && <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">Old Balance Added</th>}
                    <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">Outstanding Balance</th>
                    <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">{billBalanceHeader}</th>
                    <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">{paidHeader}</th>
                    {showExcess && (
                      <th
                        className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap"
                        title={`Paid beyond ${dayLabel.toLowerCase()}'s bill — goes to the old outstanding balance.`}
                      >
                        Excess Paid
                      </th>
                    )}
                    <th
                      className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap"
                      title={`${dayLabel}'s bill still uncollected. Anything paid beyond it goes to the old outstanding balance.`}
                    >
                      {dayLabel} Balance
                    </th>
                    <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">Total Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {decorated.length === 0 ? (
                    <tr>
                      <td colSpan={7 + (showTopUp ? 1 : 0) + (showExcess ? 1 : 0)} className="py-10 text-center text-slate-400 text-sm">No salesmen match your search.</td>
                    </tr>
                  ) : (
                    decorated.map((r, idx) => (
                      <tr key={r.salespersonId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                        <td className={`px-4 py-2.5 border-b border-r border-slate-100 sticky left-0 z-[5] ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                          <p className="text-sm font-semibold text-slate-800 leading-tight">{r.salespersonName}</p>
                          {r.route && <p className="text-xs text-slate-400 leading-tight mt-0.5">{r.route}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-center text-sm tabular-nums font-semibold text-blue-600 border-b border-r border-slate-100">
                          {r.stock > 0 ? formatCurrency(r.stock) : <span className="text-slate-300">—</span>}
                        </td>
                        {showTopUp && (
                          <td className="px-4 py-2.5 text-center text-sm tabular-nums font-semibold text-amber-600 border-b border-r border-slate-100">
                            {r.topUp !== 0 ? formatCurrency(r.topUp) : <span className="text-slate-300">—</span>}
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-center text-sm tabular-nums text-slate-600 border-b border-r border-slate-100">
                          {formatCurrency(r.opening)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-sm tabular-nums font-semibold text-slate-800 border-b border-r border-slate-100">
                          {formatCurrency(r.billPlusBalance)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-sm tabular-nums font-semibold text-emerald-600 border-b border-r border-slate-100">
                          {r.paid > 0 ? formatCurrency(r.paid) : <span className="text-slate-300">—</span>}
                        </td>
                        {showExcess && (
                          <td className={`px-4 py-2.5 text-center text-sm tabular-nums font-semibold border-b border-r border-slate-100 ${r.advance > 0 ? 'text-violet-600' : 'text-amber-600'}`}>
                            {r.excess > 0 ? formatCurrency(r.excess) : <span className="text-slate-300">—</span>}
                          </td>
                        )}
                        <td className={`px-4 py-2.5 text-center text-sm tabular-nums font-semibold border-b border-r border-slate-100 ${remColor(r.todayBalance)}`}>
                          {formatCurrency(r.todayBalance)}
                        </td>
                        <td className={`px-4 py-2.5 text-center text-sm tabular-nums font-bold border-b border-slate-100 ${remColor(r.closing)}`}>
                          {formatCurrency(r.closing)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {decorated.length > 0 && (
                  <tfoot className="sticky bottom-0 z-10">
                    <tr>
                      <td className="bg-slate-700 px-4 py-3 text-xs font-bold text-white uppercase tracking-wider border-r border-slate-600 sticky left-0 z-20">
                        Totals · {decorated.length} salesm{decorated.length === 1 ? 'an' : 'en'}
                      </td>
                      <td className="bg-slate-700 px-4 py-3 text-center text-sm font-bold text-blue-300 tabular-nums border-r border-slate-600">
                        {formatCurrency(totals.bill)}
                      </td>
                      {showTopUp && (
                        <td className="bg-slate-700 px-4 py-3 text-center text-sm font-bold text-amber-300 tabular-nums border-r border-slate-600">
                          {formatCurrency(totals.topUp)}
                        </td>
                      )}
                      <td className="bg-slate-700 px-4 py-3 text-center text-sm font-bold text-white tabular-nums border-r border-slate-600">
                        {formatCurrency(totals.balance)}
                      </td>
                      <td className="bg-slate-700 px-4 py-3 text-center text-sm font-bold text-white tabular-nums border-r border-slate-600">
                        {formatCurrency(totals.billPlusBalance)}
                      </td>
                      <td className="bg-slate-700 px-4 py-3 text-center text-sm font-bold text-emerald-300 tabular-nums border-r border-slate-600">
                        {formatCurrency(totals.paid)}
                      </td>
                      {showExcess && (
                        <td className="bg-slate-700 px-4 py-3 text-center text-sm font-bold text-amber-300 tabular-nums border-r border-slate-600">
                          {formatCurrency(totals.excess)}
                        </td>
                      )}
                      <td className={`bg-slate-700 px-4 py-3 text-center text-sm font-bold tabular-nums border-r border-slate-600 ${
                        totals.todayBalance > 0 ? 'text-red-300' : 'text-emerald-300'
                      }`}>
                        {formatCurrency(totals.todayBalance)}
                      </td>
                      <td className={`bg-slate-700 px-4 py-3 text-center text-sm font-bold tabular-nums ${
                        totals.remaining > 0 ? 'text-red-300' : totals.remaining < 0 ? 'text-violet-300' : 'text-emerald-300'
                      }`}>
                        {formatCurrency(totals.remaining)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
