import { useState, useEffect, useCallback } from 'react';
import { Receipt, Printer, Trash2, FileText } from 'lucide-react';
import BrandedLoader, { TumblerSpinner } from '../../components/ui/BrandedLoader';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useNotification } from '../../context/NotificationContext';
import { getFirstDayOfMonth, getIndiaDate, formatCurrency, formatDateShort } from '../../utils/dateUtils';
import { useApiResource } from '../../hooks/useApiResource';
import api from '../../api/axios';

/** "52/ltr" — the Rate/Qty cell as the printed pad writes it. */
function formatRate(line) {
  if (line.rate == null || !line.unit) return '';
  return `${line.rate}/${line.unit}`;
}

/** Quantities print whole where they are whole, 2dp otherwise. */
function formatQty(line) {
  if (line.quantity == null) return '';
  return Number.isInteger(line.quantity) ? String(line.quantity) : line.quantity.toFixed(2);
}

export default function BillGenerator() {
  const { notify } = useNotification();

  const [salespeople, setSalespeople] = useState([]);
  const [salespersonId, setSalespersonId] = useState('');
  const [from, setFrom] = useState(getFirstDayOfMonth());
  const [to, setTo]     = useState(getIndiaDate());
  const [partyName, setPartyName] = useState('');
  const [poNumber, setPoNumber]   = useState('');

  const [issuing, setIssuing]   = useState(false);
  const [bills, setBills]       = useState([]);
  const [confirmBill, setConfirmBill] = useState(null);

  const loadBills = useCallback(() => {
    api.get('/bills')
      .then((r) => setBills(r.data.data))
      .catch(() => notify('Failed to load bills', 'error'));
  }, [notify]);

  useEffect(() => {
    api.get('/salespeople')
      .then((r) => {
        const sp = r.data.data;
        setSalespeople(sp);
        if (sp.length) setSalespersonId(String(sp[0].id));
      })
      .catch(() => notify('Failed to load salespeople', 'error'));
    loadBills();
  }, [notify, loadBills]);

  // Preview follows the selection — an admin should see what the bill will say
  // before it gets a number, because a number once issued is part of the series.
  const { data: preview, loading } = useApiResource(
    salespersonId && from && to ? '/bills/preview' : null,
    { params: { salespersonId, from, to }, initialData: null }
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
      // Prepend locally instead of re-fetching — the register is ordered by
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

  const selectedSp = salespeople.find((sp) => String(sp.id) === String(salespersonId));
  const hasSupply  = (preview?.totalAmount ?? 0) > 0;

  return (
    <div className="flex flex-col h-full">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <Receipt size={17} className="text-emerald-300 flex-shrink-0" />
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">Bills</h1>
          <p className="text-emerald-300 text-xs">Generate the salesperson supply bill as a PDF</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50">

        {/* ── Bill details ──────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">Salesperson</span>
              <select
                value={salespersonId}
                onChange={(e) => setSalespersonId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {salespeople.map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.route ? `${sp.name} — ${sp.route}` : sp.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">From</span>
              <input
                type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">To</span>
              <input
                type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">M/s</span>
              <input
                type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)}
                placeholder={selectedSp?.name ?? 'Party name'}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">PO No.</span>
              <input
                type="text" value={poNumber} onChange={(e) => setPoNumber(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Bill No. is allocated automatically when you generate — it continues the dairy&rsquo;s series.
          </p>
        </div>

        {/* ── Preview ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Bill Preview</h2>
            <button
              onClick={issueBill}
              disabled={!hasSupply || issuing || loading}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 px-3 py-1.5 rounded-lg transition"
            >
              {issuing ? <TumblerSpinner size={13} /> : <Receipt size={13} />} Generate Bill
            </button>
          </div>

          {loading ? (
            <BrandedLoader size="sm" />
          ) : !preview ? (
            <p className="px-4 py-10 text-center text-slate-400 text-xs">Select a salesperson and period</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 w-12">Sl. No.</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Description</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Rate/Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((line, i) => (
                  <tr key={line.label} className="border-b border-slate-100">
                    <td className="px-4 py-2.5 text-xs text-slate-400 tabular-nums">{i + 1}.</td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">{line.label}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-600 tabular-nums">{formatRate(line)}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-600 tabular-nums">{formatQty(line)}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-slate-700 tabular-nums">
                      {line.amount ? formatCurrency(line.amount) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800">
                  <td colSpan={4} className="px-4 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wide">Total</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-white tabular-nums">
                    {formatCurrency(preview.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

          {preview && !loading && !hasSupply && (
            <p className="px-4 py-3 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
              No stock was dispatched in this period — there is nothing to bill.
            </p>
          )}
        </div>

        {/* ── Issued bills ──────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <FileText size={13} className="text-slate-400" />
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Issued Bills</h2>
          </div>

          {bills.length === 0 ? (
            <p className="px-4 py-10 text-center text-slate-400 text-xs">No bills generated yet</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Bill No.</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">M/s</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Salesman</th>
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
                    <td className="px-4 py-2.5 text-xs text-slate-500">{bill.salespersonName}</td>
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
          )}
        </div>
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
