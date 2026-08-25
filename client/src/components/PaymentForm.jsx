import { useState, useEffect } from 'react';
import { CreditCard } from 'lucide-react';
import { TumblerSpinner } from './ui/BrandedLoader';
import { PAYMENT_MODES } from '../utils/constants';
import { getIndiaDate, formatCurrency } from '../utils/dateUtils';
import { numberToWords } from '../utils/numberToWords';

/**
 * Props:
 *   onSubmit(formData)    — called on submit
 *   closingBalance        — used for the 50%/75%/Full quick-fill buttons
 *   todaysBillAmount      — optional; when > 0, adds a "Today's Bill" quick-fill
 *                           button that fills the amount owed from TODAY's
 *                           dispatch specifically (independent of the
 *                           cumulative closingBalance — e.g. SalespersonCollections
 *                           passes the salesperson's stockGiven for today).
 *   loading               — disables submit while saving
 *   prefill               — { amount, paymentDate, paymentMode, reference }
 *                           when set, form resets to those values (used for "edit" flow)
 *   onClearPrefill()      — called after form is reset so parent can clear its prefill state
 *   submitLabel           — override button label (default "Record Payment")
 */
export default function PaymentForm({
  onSubmit,
  closingBalance   = 0,
  todaysBillAmount = 0,
  loading          = false,
  prefill          = null,
  onClearPrefill   = null,
  submitLabel      = 'Record Payment',
  defaultMode      = 'Cash',
}) {
  const blankForm = {
    amount:      '',
    paymentDate: getIndiaDate(),
    paymentMode: defaultMode,
    reference:   '',
  };

  const [form, setForm] = useState(blankForm);

  // When parent passes a prefill (e.g. after delete+edit), reinitialise the form.
  // Stays a real Effect (not derived-during-render) because it also calls the
  // parent's onClearPrefill — calling a parent callback during render is unsafe.
  useEffect(() => {
    if (!prefill) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      amount:      String(prefill.amount ?? ''),
      paymentDate: prefill.paymentDate ?? getIndiaDate(),
      paymentMode: prefill.paymentMode ?? defaultMode,
      reference:   prefill.reference   ?? '',
    });
    onClearPrefill?.();
    // onClearPrefill is intentionally excluded: DairyPayments passes it as a
    // fresh inline arrow function every render, so including it would re-run
    // this effect (and reset the form mid-edit) whenever the parent re-renders
    // for any reason while prefill is still set — not just when prefill itself
    // changes. defaultMode is a primitive string, safe either way, included.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, defaultMode]);

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    onSubmit({ ...form, amount: amt });
    setForm(blankForm);
  };

  const hasBalance    = closingBalance > 0;
  const hasTodaysBill = todaysBillAmount > 0;
  const enteredAmount = parseFloat(form.amount) || 0;
  const outstanding   = Math.max(0, closingBalance);
  // Paying more than what's owed is allowed — it creates/adds to a credit that
  // carries forward and reduces future bills (see balanceService cascade).
  const isOverBalance = enteredAmount > outstanding;
  const paymentState  = !isOverBalance ? 'normal' : outstanding > 0 ? 'overpay' : 'credit';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Amount */}
      <div>
        <label className="ddm-section-label block mb-1.5">Amount (₹)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
          <input
            type="number"
            name="amount"
            value={form.amount}
            onChange={handleChange}
            placeholder="0.00"
            step="0.01"
            min="0.01"
            required
            className={`w-full pl-8 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 bg-white tabular-nums ${paymentState === 'normal' ? 'border-slate-200 focus:ring-emerald-400' : 'border-amber-300 focus:ring-amber-400'}`}
          />
        </div>

        {/* Amount in words */}
        {enteredAmount > 0 && (
          <p className="mt-1.5 text-[11px] text-slate-800 font-bold italic leading-snug">
            {numberToWords(enteredAmount)}
          </p>
        )}

        {/* Excess payment notice — paying more than owed creates a credit */}
        {paymentState !== 'normal' && (
          <p className="mt-1.5 text-xs font-semibold text-violet-700 flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1.5">
            <CreditCard size={12} className="flex-shrink-0" />
            {paymentState === 'overpay'
              ? `This pays ${formatCurrency(enteredAmount - outstanding)} more than the ${formatCurrency(outstanding)} owed — the extra creates a credit that reduces future bills.`
              : `This creates a credit of ${formatCurrency(enteredAmount)} that will reduce future bills.`}
          </p>
        )}

        {/* Quick-fill buttons */}
        {(hasBalance || hasTodaysBill) && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {hasTodaysBill && (
              <button type="button" onClick={() => setForm(f => ({ ...f, amount: todaysBillAmount.toFixed(2) }))}
                className="flex-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 rounded-lg py-2 transition whitespace-nowrap">
                Today&apos;s Bill ({formatCurrency(todaysBillAmount)})
              </button>
            )}
            {hasBalance && (
              <>
                <button type="button" onClick={() => setForm(f => ({ ...f, amount: (closingBalance * 0.5).toFixed(2) }))}
                  className="flex-1 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg py-2 transition">
                  50%
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, amount: (closingBalance * 0.75).toFixed(2) }))}
                  className="flex-1 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg py-2 transition">
                  75%
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, amount: closingBalance.toFixed(2) }))}
                  className="flex-1 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-lg py-2 transition whitespace-nowrap">
                  Full {formatCurrency(closingBalance)}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Payment mode */}
      <div>
        <label className="ddm-section-label block mb-1.5">Mode</label>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setForm(f => ({ ...f, paymentMode: mode }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                form.paymentMode === mode
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Date */}
      <div>
        <label className="ddm-section-label block mb-1.5">Date</label>
        <input type="date" name="paymentDate" value={form.paymentDate} onChange={handleChange} required
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white appearance-none" />
      </div>

      {/* Reference */}
      <div>
        <label className="ddm-section-label block mb-1.5">Reference</label>
        <input type="text" name="reference" value={form.reference} onChange={handleChange} placeholder="Txn / cheque no."
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
      </div>

      <button type="submit" disabled={loading || !form.amount} className="ddm-btn-primary w-full justify-center">
        {loading ? <TumblerSpinner size={16} /> : <CreditCard size={15} />}
        {loading ? 'Recording…' : submitLabel}
      </button>
    </form>
  );
}
