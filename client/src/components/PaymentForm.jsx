import { useState } from 'react';
import { Loader2, DollarSign } from 'lucide-react';
import { PAYMENT_MODES } from '../utils/constants';
import { getIndiaDate, formatCurrency } from '../utils/dateUtils';

export default function PaymentForm({ onSubmit, closingBalance = 0, loading = false }) {
  const [form, setForm] = useState({
    amount:      '',
    paymentDate: getIndiaDate(),
    paymentMode: 'Cash',
    reference:   '',
    notes:       '',
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
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
            <input
              type="number"
              name="amount"
              value={form.amount}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              min="0.01"
              required
              className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50"
            />
          </div>
        </div>
        {closingBalance > 0 && (
          <button
            type="button"
            onClick={handlePayFull}
            className="px-3 py-2.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition whitespace-nowrap"
          >
            Pay Full ({formatCurrency(closingBalance)})
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
          <input
            type="date"
            name="paymentDate"
            value={form.paymentDate}
            onChange={handleChange}
            required
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mode</label>
          <select
            name="paymentMode"
            value={form.paymentMode}
            onChange={handleChange}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50"
          >
            {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Reference / Notes</label>
        <input
          type="text"
          name="reference"
          value={form.reference}
          onChange={handleChange}
          placeholder="Transaction no., cheque no., etc."
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !form.amount}
        className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-semibold py-2.5 rounded-xl transition text-sm"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign size={15} />}
        {loading ? 'Recording…' : 'Record Payment'}
      </button>
    </form>
  );
}
