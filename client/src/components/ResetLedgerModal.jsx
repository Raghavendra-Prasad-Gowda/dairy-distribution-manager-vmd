import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import PinModal from './PinModal';

/**
 * Superadmin-only ledger reset for one salesperson.
 *
 * Wipes their payments (incl. admin top-ups), dispatches and balance rows so
 * their balance returns to ₹0. Their account, login, custom prices and product
 * access are untouched. Irreversible, so it is gated twice: the shared 6-digit
 * PIN, then typing the salesperson's exact name.
 *
 * Note their past dispatches also disappear from the dairy-wide Stock Balance
 * report, which reads the same table — called out in the warning below.
 */
export default function ResetLedgerModal({ open, onClose, salesperson, onConfirm, notify }) {
  const [pinPassed, setPinPassed] = useState(false);
  const [typed, setTyped]         = useState('');
  const [busy, setBusy]           = useState(false);

  // Re-arm both gates every time the dialog is reopened — a previous run must
  // never leave the delete button already unlocked.
  useEffect(() => {
    if (!open) return;
    setPinPassed(false);
    setTyped('');
    setBusy(false);
  }, [open, salesperson?.id]);

  if (!open || !salesperson) return null;

  const nameMatches = typed.trim() === salesperson.name;

  async function handleConfirm() {
    if (!nameMatches || busy) return;
    setBusy(true);
    notify?.('Clearing ledger…', 'loading');
    try {
      const res = await onConfirm(typed.trim());
      notify?.(
        `Ledger cleared — removed ${res.payments} payment(s), ${res.dispatches} dispatch(es)`,
        'success'
      );
      onClose();
    } catch (e) {
      notify?.(e.response?.data?.error ?? 'Failed to clear ledger', 'error');
    } finally {
      setBusy(false);
    }
  }

  // Gate 1 — shared edit PIN, same modal used for editing/deleting collections.
  if (!pinPassed) {
    return (
      <PinModal
        isOpen
        onClose={onClose}
        onSuccess={() => setPinPassed(true)}
        title={`Enter PIN to reset ${salesperson.name}'s ledger`}
      />
    );
  }

  // Gate 2 — type the exact name.
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Reset ledger"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={handleConfirm} disabled={busy || !nameMatches}>
            Clear ledger
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
        <AlertTriangle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
        <div className="text-[11px] text-red-800 leading-relaxed space-y-1">
          <p>
            This permanently deletes <strong>{salesperson.name}</strong>&apos;s payments,
            admin top-ups, dispatch history and balance ledger. Their balance resets
            to ₹0. <strong>It cannot be undone.</strong>
          </p>
          <p>
            Their login, custom prices and product access are kept. Their past
            dispatches will also disappear from the dairy&apos;s Stock Balance report.
          </p>
        </div>
      </div>

      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
        Type <span className="text-slate-700">{salesperson.name}</span> to confirm
      </label>
      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={salesperson.name}
        autoComplete="off"
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
      />
      {typed && !nameMatches && (
        <p className="text-[11px] text-red-500 mt-1.5">Name doesn&apos;t match yet.</p>
      )}
    </Modal>
  );
}
