import { useState, useMemo, useEffect } from 'react';
import { Search, X, Check, AlertTriangle } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { getIndiaDate, formatCurrency } from '../utils/dateUtils';

/**
 * Bulk top-up — loads each salesman's pre-existing dues in one go.
 *
 * A top-up is NOT a collection: it ADDS to what the salesman owes, so it
 * carries forward as their opening balance. Used to seed balances that
 * predate the app. The salesman sees the entry (and the admin who added it)
 * in their own My Balance page.
 *
 * Two steps: pick the salespeople, then enter an amount for each.
 */
export default function BulkTopUpModal({ open, onClose, salespeople, onSaved, notify }) {
  const [step, setStep]       = useState('pick'); // 'pick' | 'amounts'
  const [search, setSearch]   = useState('');
  const [picked, setPicked]   = useState([]);     // salesperson ids
  const [amounts, setAmounts] = useState({});     // { [id]: '1234' }
  const [date, setDate]       = useState(getIndiaDate());
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);

  // Reset every time the modal is reopened so a previous run never leaks in.
  useEffect(() => {
    if (!open) return;
    setStep('pick');
    setSearch('');
    setPicked([]);
    setAmounts({});
    setDate(getIndiaDate());
    setNotes('');
    setSaving(false);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return salespeople;
    return salespeople.filter(sp =>
      sp.name.toLowerCase().includes(q) || (sp.route ?? '').toLowerCase().includes(q)
    );
  }, [salespeople, search]);

  const pickedList = useMemo(
    () => picked.map(id => salespeople.find(sp => sp.id === id)).filter(Boolean),
    [picked, salespeople]
  );

  const entries = useMemo(
    () => pickedList
      .map(sp => ({ salespersonId: sp.id, amount: Number(amounts[sp.id]) }))
      .filter(e => Number.isFinite(e.amount) && e.amount > 0),
    [pickedList, amounts]
  );

  const total = entries.reduce((s, e) => s + e.amount, 0);
  const missingCount = pickedList.length - entries.length;

  const toggle = (id) =>
    setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  async function handleSave() {
    if (entries.length === 0 || saving) return;
    setSaving(true);
    try {
      const res = await onSaved({ paymentDate: date, notes: notes.trim() || undefined, entries });
      notify?.(`Top-up added for ${res.count} salesperson${res.count === 1 ? '' : 's'}`, 'success');
      onClose();
    } catch (e) {
      notify?.(e.response?.data?.error ?? 'Failed to add top-up', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={step === 'pick' ? 'Bulk Top-up — select salespeople' : 'Bulk Top-up — enter amounts'}
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <p className="text-xs text-slate-500">
            {step === 'pick'
              ? `${picked.length} selected`
              : <>Total <span className="font-bold text-red-600 tabular-nums">{formatCurrency(total)}</span></>}
          </p>
          <div className="flex items-center gap-2">
            {step === 'amounts' && (
              <Button variant="ghost" size="sm" onClick={() => setStep('pick')} disabled={saving}>
                Back
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            {step === 'pick' ? (
              <Button size="sm" onClick={() => setStep('amounts')} disabled={picked.length === 0}>
                Next
              </Button>
            ) : (
              <Button size="sm" onClick={handleSave} loading={saving} disabled={entries.length === 0}>
                Add top-up
              </Button>
            )}
          </div>
        </div>
      }
    >
      {/* What this does — a top-up is a debit, so make that unmissable */}
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3">
        <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-800 leading-relaxed">
          A top-up <strong>increases</strong> what the salesman owes — use it to load old dues
          from before the app. It is not a collection. The salesman will see this entry with
          your username in their My Balance.
        </p>
      </div>

      {step === 'pick' ? (
        <>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or route…"
              className="w-full pl-8 pr-7 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={12} />
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">No salespeople match</p>
            ) : filtered.map(sp => {
              const on = picked.includes(sp.id);
              return (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => toggle(sp.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition ${on ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${
                    on ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 bg-white'
                  }`}>
                    {on && <Check size={11} className="text-white" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800 truncate">{sp.name}</span>
                    {sp.route && <span className="block text-[11px] text-slate-400 truncate">{sp.route}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                max={getIndiaDate()}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Note (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Opening dues as of Mar 2026"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
            {pickedList.map(sp => (
              <div key={sp.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{sp.name}</span>
                  {sp.route && <span className="block text-[11px] text-slate-400 truncate">{sp.route}</span>}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={amounts[sp.id] ?? ''}
                  onChange={e => setAmounts(a => ({ ...a, [sp.id]: e.target.value }))}
                  placeholder="0.00"
                  className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            ))}
          </div>

          {missingCount > 0 && (
            <p className="text-[11px] text-slate-400 mt-2">
              {missingCount} selected salesperson{missingCount === 1 ? '' : 's'} without an amount will be skipped.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
