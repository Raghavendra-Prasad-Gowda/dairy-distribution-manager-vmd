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

  const handlePayFull = () => {
    setForm((f) => ({ ...f, amount: closingBalance > 0 ? closingBalance.toFixed(2) : '' }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ ...form, amount: parseFloat(form.amount) });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Amount row */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
          Amount (₹)
        </label>
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">₹</span>
            <input
              type="number"
              name="amount"
              value={form.amount}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              min="0.01"
              required
              className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white tabular-nums"
            />
          </div>
          {closingBalance > 0 && (
            <button
              type="button"
              onClick={handlePayFull}
              className="px-2.5 py-2 text-[11px] font-semibold bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition whitespace-nowrap"
            >
              Full ({formatCurrency(closingBalance)})
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
          <input
            type="date"
            name="paymentDate"
            value={form.paymentDate}
            onChange={handleChange}
            required
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Mode</label>
          <select
            name="paymentMode"
            value={form.paymentMode}
            onChange={handleChange}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          >
            {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
          Reference / Notes
        </label>
        <input
          type="text"
          name="reference"
          value={form.reference}
          onChange={handleChange}
          placeholder="Transaction no., cheque no., etc."
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
        />
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
