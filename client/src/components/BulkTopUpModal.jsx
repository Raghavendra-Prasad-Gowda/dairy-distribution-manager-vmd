import { useState, useMemo, useEffect } from 'react';
import { Search, X, Check, AlertTriangle, Wallet } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { getIndiaDate, formatCurrency } from '../utils/dateUtils';

/**
 * Bulk top-up — loads pre-existing dues in one go.
 *
 * A top-up is NOT a payment: it ADDS to what is owed, so it carries forward as
 * an opening balance. Used to seed balances that predate the app.
 *
 * Shared by both ledgers, which have the same shape:
 *   - salesmen owing the dairy  → entryKey "salespersonId"
 *   - the dairy owing a brand   → entryKey "brandId"
 *
 * Two steps: pick the entities, then enter an amount for each.
 */
export default function BulkTopUpModal({
  open,
  onClose,
  entities,
  onSaved,
  notify,
  entryKey       = 'salespersonId',
  nounSingular   = 'salesperson',
  nounPlural     = 'salespeople',
  searchPlaceholder = 'Search name or route…',
  warning,
  titlePrefix    = 'Bulk Top-up',
  // Forwarded into the onSaved payload as-is, for a caller whose endpoint
  // still branches on a paymentMode string. No current caller uses this —
  // deposit top-up (the original reason it was added) now posts to its own
  // endpoint instead — but it's kept as a generic escape hatch.
  paymentMode,
  // Drives the loading/success/error toast text ("Adding {actionNoun}…" etc.)
  // so a caller with a more specific flow (e.g. "deposit top-up") doesn't
  // show the generic "Adding top-up…" wording while it's actually doing
  // something conceptually different.
  actionNoun     = 'top-up',
  // Header band color + icon — matches the "bulk action" dialogs elsewhere
  // in the app (Bulk Update Prices etc.). Deposit top-up passes 'teal' /
  // Landmark to stay visually distinct from the amber dues top-up.
  accent = 'amber',
  icon   = Wallet,
}) {
  const [step, setStep]       = useState('pick'); // 'pick' | 'amounts'
  const [search, setSearch]   = useState('');
  const [picked, setPicked]   = useState([]);     // entity ids
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

  // Memoised so the derived useMemos below don't re-run on every render
  // just because `?? []` allocates a fresh array each time.
  const list = useMemo(() => entities ?? [], [entities]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(e =>
      e.name.toLowerCase().includes(q) || (e.route ?? '').toLowerCase().includes(q)
    );
  }, [list, search]);

  const pickedList = useMemo(
    () => picked.map(id => list.find(e => e.id === id)).filter(Boolean),
    [picked, list]
  );

  const entries = useMemo(
    () => pickedList
      .map(e => ({ [entryKey]: e.id, amount: Number(amounts[e.id]) }))
      .filter(e => Number.isFinite(e.amount) && e.amount > 0),
    [pickedList, amounts, entryKey]
  );

  const total = entries.reduce((s, e) => s + e.amount, 0);
  const missingCount = pickedList.length - entries.length;

  const toggle = (id) =>
    setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Select-all acts on what's currently visible, so it composes with the search
  // box (search "route 3", select all → only that route gets picked).
  const allFilteredPicked =
    filtered.length > 0 && filtered.every(e => picked.includes(e.id));

  const toggleAllFiltered = () =>
    setPicked((prev) => {
      const ids = filtered.map(e => e.id);
      return allFilteredPicked
        ? prev.filter(id => !ids.includes(id))
        : [...new Set([...prev, ...ids])];
    });

  // Capitalized once for the success toast ("Top-up added…" / "Deposit
  // top-up added…"); the loading/error text stays lowercase mid-sentence.
  const actionLabel = actionNoun.charAt(0).toUpperCase() + actionNoun.slice(1);

  async function handleSave() {
    if (entries.length === 0 || saving) return;
    setSaving(true);
    // Global loading modal (same as bulk price update) rather than a spinner
    // inside the button — the save fans out across several records and
    // cascades each balance, so the whole screen should be blocked meanwhile.
    notify?.(`Adding ${actionNoun}…`, 'loading');
    try {
      const res = await onSaved({
        paymentDate: date,
        notes:       notes.trim() || undefined,
        ...(paymentMode ? { paymentMode } : {}),
        entries,
      });
      notify?.(
        `${actionLabel} added for ${res.count} ${res.count === 1 ? nounSingular : nounPlural}`,
        'success'
      );
      onClose();
    } catch (e) {
      notify?.(e.response?.data?.error ?? `Failed to add ${actionNoun}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      accent={accent}
      icon={icon}
      title={titlePrefix}
      subtitle={step === 'pick' ? `Step 1 of 2 — select ${nounPlural}` : 'Step 2 of 2 — enter amounts'}
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
              <Button size="sm" onClick={handleSave} disabled={saving || entries.length === 0}>
                Add {actionNoun}
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
          {warning ?? (
            <>
              A top-up <strong>increases</strong> what the salesman owes — use it to load old dues
              from before the app. It is not a collection. The salesman will see this entry with
              your username in their My Balance.
            </>
          )}
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
              placeholder={searchPlaceholder}
              className="w-full pl-8 pr-7 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between px-1 mb-1.5">
            <p className="text-[11px] text-slate-400 font-medium">
              {search
                ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}`
                : `${list.length} ${nounPlural}`}
            </p>
            <button
              type="button"
              onClick={toggleAllFiltered}
              disabled={filtered.length === 0}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 disabled:text-slate-300 disabled:cursor-not-allowed"
            >
              {allFilteredPicked ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">No {nounPlural} match</p>
            ) : filtered.map(e => {
              const on = picked.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => toggle(e.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition ${on ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${
                    on ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 bg-white'
                  }`}>
                    {on && <Check size={11} className="text-white" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800 truncate">{e.name}</span>
                    {e.route && <span className="block text-[11px] text-slate-400 truncate">{e.route}</span>}
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
            {pickedList.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{e.name}</span>
                  {e.route && <span className="block text-[11px] text-slate-400 truncate">{e.route}</span>}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={amounts[e.id] ?? ''}
                  onChange={ev => setAmounts(a => ({ ...a, [e.id]: ev.target.value }))}
                  placeholder="0.00"
                  className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            ))}
          </div>

          {missingCount > 0 && (
            <p className="text-[11px] text-slate-400 mt-2">
              {missingCount} selected {missingCount === 1 ? nounSingular : nounPlural} without an amount will be skipped.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
