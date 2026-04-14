import { useState } from 'react';
import { Loader2, CreditCard } from 'lucide-react';
import { PAYMENT_MODES } from '../utils/constants';
import { getIndiaDate, formatCurrency } from '../utils/dateUtils';

export default function PaymentForm({ onSubmit, closingBalance = 0, loading = false }) {
  const [form, setForm] = useState({
    amount:      '',
    paymentDate: getIndiaDate(),
    paymentMode: 'Cash',
    reference:   '',
  });

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const setAmount = (val) => {
    setForm((f) => ({ ...f, amount: val }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ ...form, amount: parseFloat(form.amount) });
  };

  const hasBalance = closingBalance > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Amount */}
      <div>
        <label className="ddm-section-label block mb-1.5">Amount (₹)</label>
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
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
              className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white tabular-nums"
            />
          </div>
        </div>

        {/* Quick-amount buttons */}
        {hasBalance && (
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => setAmount((closingBalance * 0.5).toFixed(2))}
              className="flex-1 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg py-1.5 transition"
            >
              50%
            </button>
            <button
              type="button"
              onClick={() => setAmount((closingBalance * 0.75).toFixed(2))}
              className="flex-1 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg py-1.5 transition"
            >
              75%
            </button>
            <button
              type="button"
              onClick={() => setAmount(closingBalance.toFixed(2))}
              className="flex-1 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-lg py-1.5 transition whitespace-nowrap"
            >
              Full {formatCurrency(closingBalance)}
            </button>
          </div>
        )}
      </div>

      {/* Payment mode — button group */}
      <div>
        <label className="ddm-section-label block mb-1.5">Mode</label>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setForm((f) => ({ ...f, paymentMode: mode }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                form.paymentMode === mode
                  ? 'bg-indigo-700 text-white border-indigo-700'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Date + Reference */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="ddm-section-label block mb-1.5">Date</label>
          <input
            type="date"
            name="paymentDate"
            value={form.paymentDate}
            onChange={handleChange}
            required
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          />
        </div>
        <div>
          <label className="ddm-section-label block mb-1.5">Reference</label>
          <input
            type="text"
            name="reference"
            value={form.reference}
            onChange={handleChange}
            placeholder="Txn / cheque no."
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !form.amount}
        className="ddm-btn-primary w-full justify-center"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard size={15} />}
        {loading ? 'Recording…' : 'Record Payment'}
      </button>
    </form>
  );
}
