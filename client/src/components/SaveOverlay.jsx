import { useEffect } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

/**
 * Non-blocking top-right toast notification.
 * Auto-dismisses after 3 s on success. Errors require manual close.
 */
export default function SaveOverlay({ status, onClose, successMessage = 'Saved successfully!' }) {
  useEffect(() => {
    if (status === 'success') {
      const t = setTimeout(onClose, 3000);
      return () => clearTimeout(t);
    }
  }, [status, onClose]);

  if (!status) return null;

  const isSuccess = status === 'success';

  return (
    <div
      className="fixed top-4 right-4 z-[200] flex items-start gap-3 bg-white rounded-xl shadow-lg border border-slate-100 px-4 py-3 max-w-xs w-full"
      style={{ animation: 'toastIn 0.25s ease' }}
    >
      {isSuccess
        ? <CheckCircle className="text-emerald-500 flex-shrink-0 mt-0.5" size={20} />
        : <XCircle     className="text-red-500 flex-shrink-0 mt-0.5"     size={20} />
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">
          {isSuccess ? successMessage : 'Save Failed'}
        </p>
        {!isSuccess && (
          <p className="text-xs text-slate-500 mt-0.5">Check your inputs and try again.</p>
        )}
        {isSuccess && (
          <p className="text-xs text-slate-400 mt-0.5">Dismissing automatically…</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-slate-600 transition flex-shrink-0"
        aria-label="Close"
      >
        <X size={15} />
      </button>
    </div>
  );
}
