import React, { useState, useEffect } from 'react';
import { TrendingUp, AlertCircle, Loader2, Calendar } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency, formatDateShort } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function SalespersonBalance() {
  const { user } = useAuth();
  const { notify } = useNotification();

  const [date, setDate] = useState(getIndiaDate());
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const salespersonId = user?.salespersonId;

  // Fetch balance for specific date
  useEffect(() => {
    if (!salespersonId) return;
    setLoading(true);
    setError('');
    Promise.all([
      api.get(`/salesperson-balance/${salespersonId}?date=${date}`),
      api.get(`/salesperson-balance/${salespersonId}/history`), // Fetch all history
    ])
      .then(([balRes, histRes]) => {
        const bal = balRes.data.data;
        setBalance(bal || {
          openingBalance: 0,
          stockGiven: 0,
          amountPaid: 0,
          closingBalance: 0,
        });
        setHistory(histRes.data.data ?? []);
      })
      .catch((e) => {
        setError(e.response?.data?.error ?? 'Failed to load balance information');
      })
      .finally(() => setLoading(false));
  }, [salespersonId]);

  if (!salespersonId) {
    return <div className="p-4 text-center text-slate-500">Unable to load balance</div>;
  }

  const isOwing = balance?.closingBalance > 0;
  const isCredit = balance?.closingBalance < 0;

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3.5 bg-emerald-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <TrendingUp size={17} className="text-emerald-300 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white leading-tight truncate">
              {user?.salespersonName ? `${user.salespersonName}'s Balance` : 'My Balance'}
            </h1>
            <p className="text-emerald-300 text-xs">Payment & outstanding tracking</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} dark />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              <AlertCircle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <BrandedLoader />
          ) : (
            <>
              {/* ── Main Balance Card ────────────────────────────────── */}
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Status Badge */}
                <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-blue-50 border-b border-emerald-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={14} className="text-emerald-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-600">
                      Current Balance
                    </span>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                    isOwing ? 'bg-red-100 text-red-700' : isCredit ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {isOwing ? 'Outstanding' : isCredit ? "Credit" : 'Settled'}
                  </span>
                </div>

                {/* Large Balance Display */}
                <div className="px-4 py-6 text-center border-b border-slate-100">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                    {isOwing ? 'You Owe' : isCredit ? "You're in Credit" : 'Settled'}
                  </p>
                  <p className={`text-4xl font-bold tabular-nums leading-none ${
                    isOwing ? 'text-red-600' : isCredit ? 'text-violet-600' : 'text-emerald-600'
                  }`}>
                    {formatCurrency(Math.abs(balance?.closingBalance ?? 0))}
                  </p>
                </div>

                {/* 4-Column Breakdown */}
                <div className="grid grid-cols-4 gap-px bg-slate-100">
                  {[
                    { label: 'Opening', value: balance?.openingBalance ?? 0, color: 'text-slate-600' },
                    { label: 'Bill Today', value: balance?.stockGiven ?? 0, color: 'text-blue-600' },
                    { label: 'Paid', value: balance?.amountPaid ?? 0, color: 'text-emerald-600' },
                    { label: 'Balance', value: balance?.closingBalance ?? 0, color: isOwing ? 'text-red-600' : 'text-emerald-600' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white p-3 text-center">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1">
                        {label}
                      </p>
                      <p className={`text-sm font-bold tabular-nums ${color}`}>
                        {formatCurrency(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Balance History ────────────────────────────────────── */}
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                  <Calendar size={14} className="text-slate-600" />
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-600">
                    Payment History
                  </span>
                </div>

                {history && history.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {history.map((entry, idx) => {
                      const isLastOwing = entry.closingBalance > 0;
                      return (
                        <div key={idx} className="px-4 py-3 hover:bg-slate-50 transition">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-slate-700">
                              {formatDateShort(entry.balanceDate)}
                            </p>
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                              isLastOwing ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                            }`}>
                              {formatCurrency(Math.abs(entry.closingBalance))}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-3 text-xs">
                            <div>
                              <p className="text-slate-400 mb-0.5">Bill</p>
                              <p className="font-semibold text-slate-700">{formatCurrency(entry.stockGiven)}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 mb-0.5">Paid</p>
                              <p className="font-semibold text-emerald-600">{formatCurrency(entry.amountPaid)}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 mb-0.5">Status</p>
                              <p className={`font-semibold ${isLastOwing ? 'text-red-600' : 'text-emerald-600'}`}>
                                {isLastOwing ? 'Owing' : 'Paid'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center text-slate-400 text-sm">
                    No payment history available
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
