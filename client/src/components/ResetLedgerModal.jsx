import { useState, useMemo, useEffect } from 'react';
import { AlertTriangle, Search, X, Check } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import PinModal from './PinModal';

/**
 * Superadmin-only ledger reset for one or more salespeople.
 *
 * Wipes their payments (incl. admin top-ups), dispatches and balance rows so
 * their balances return to ₹0. Accounts, logins, custom prices and product
 * access are untouched. Irreversible, so the shared 6-digit PIN is required
 * before the picker is shown at all.
 *
 * Note their past dispatches also disappear from the dairy-wide Stock Balance
 * report, which reads the same table — called out in the warning below.
 */
export default function ResetLedgerModal({ open, onClose, salespeople, onConfirm, notify }) {
  const [pinPassed, setPinPassed] = useState(false);
  const [search, setSearch]       = useState('');
  const [picked, setPicked]       = useState([]);
  const [busy, setBusy]           = useState(false);

  // Re-arm the PIN gate and clear any prior selection each time it reopens.
  useEffect(() => {
    if (!open) return;
    setPinPassed(false);
    setSearch('');
    setPicked([]);
    setBusy(false);
  }, [open]);

  // Memoised so the derived useMemos below don't re-run on every render
  // just because `?? []` allocates a fresh array each time.
  const list = useMemo(() => salespeople ?? [], [salespeople]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(sp =>
      sp.name.toLowerCase().includes(q) || (sp.route ?? '').toLowerCase().includes(q)
    );
  }, [list, search]);

  const toggle = (id) =>
    setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Select-all acts on the current search results, so it composes with the
  // search box rather than always grabbing every salesperson.
  const allFilteredPicked =
    filtered.length > 0 && filtered.every(sp => picked.includes(sp.id));

  const toggleAllFiltered = () =>
    setPicked((prev) => {
      const ids = filtered.map(sp => sp.id);
      return allFilteredPicked
        ? prev.filter(id => !ids.includes(id))
        : [...new Set([...prev, ...ids])];
    });

  async function handleConfirm() {
    if (picked.length === 0 || busy) return;
    setBusy(true);
    notify?.('Clearing ledger…', 'loading');
    try {
      const res = await onConfirm(picked);
      notify?.(
        `Ledger cleared for ${res.salespeople?.length ?? picked.length} salesperson(s) — removed ${res.payments} payment(s), ${res.dispatches} dispatch(es)`,
        'success'
      );
      onClose();
    } catch (e) {
      notify?.(e.response?.data?.error ?? 'Failed to clear ledger', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  // Gate — shared edit PIN, same modal used for editing/deleting collections.
  if (!pinPassed) {
    return (
      <PinModal
        isOpen
        onClose={onClose}
        onSuccess={() => setPinPassed(true)}
        title="Enter PIN to reset salesman ledgers"
      />
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Reset ledger — select salespeople"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <p className="text-xs text-slate-500">{picked.length} selected</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirm}
              disabled={busy || picked.length === 0}
            >
              {picked.length > 1 ? `Clear ${picked.length} ledgers` : 'Clear ledger'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-3">
        <AlertTriangle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
        <div className="text-[11px] text-red-800 leading-relaxed space-y-1">
          <p>
            This permanently deletes the selected salespeople&apos;s payments, admin
            top-ups, dispatch history and balance ledger. Their balances reset
            to ₹0. <strong>It cannot be undone.</strong>
          </p>
          <p>
            Their logins, custom prices and product access are kept. Their past
            dispatches will also disappear from the dairy&apos;s Stock Balance report.
          </p>
        </div>
      </div>

      <div className="relative mb-2">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or route…"
          className="w-full pl-8 pr-7 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-slate-50"
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
            : `${list.length} salespeople`}
        </p>
        <button
          type="button"
          onClick={toggleAllFiltered}
          disabled={filtered.length === 0}
          className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:text-slate-300 disabled:cursor-not-allowed"
        >
          {allFilteredPicked ? 'Deselect All' : 'Select All'}
        </button>
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
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition ${on ? 'bg-red-50' : 'hover:bg-slate-50'}`}
            >
              <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${
                on ? 'bg-red-600 border-red-600' : 'border-slate-300 bg-white'
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
    </Modal>
  );
}
