import { useEffect } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

/**
 * Full-screen save confirmation overlay.
 *
 * Use for bulk data-entry saves (StockReceipt, Dispatch) where the user
 * needs clear confirmation. For inline actions (add/delete/edit), use
 * the toast notifications from NotificationContext instead.
 *
 * Success auto-dismisses after 2 s. Errors require manual close.
 */
export default function SaveOverlay({ status, onClose, successMessage = 'Saved Successfully!' }) {
  // Auto-dismiss on success
  useEffect(() => {
    if (status === 'success') {
      const t = setTimeout(onClose, 2000);
      return () => clearTimeout(t);
    }
  }, [status]);

  if (!status) return null;

  const isSuccess = status === 'success';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm"
      style={{ animation: 'fadeIn 0.15s ease' }}
      onClick={isSuccess ? undefined : onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-8 mx-4 w-full max-w-xs flex flex-col items-center gap-5 relative"
        style={{ animation: 'popIn 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Manual close — only on error */}
        {!isSuccess && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        )}

        {/* Icon circle */}
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center ${
            isSuccess ? 'bg-emerald-50' : 'bg-red-50'
          }`}
          style={{ animation: 'scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.1s both' }}
        >
          {isSuccess
            ? <CheckCircle className="text-emerald-500" size={46} strokeWidth={1.5} />
            : <XCircle     className="text-red-500"     size={46} strokeWidth={1.5} />
          }
        </div>

        {/* Message */}
        <div className="text-center">
          <p className="text-lg font-bold text-slate-900">
            {isSuccess ? successMessage : 'Save Failed'}
          </p>
          {isSuccess
            ? <p className="text-xs text-slate-400 mt-1">Closing automatically…</p>
            : <p className="text-sm text-slate-500 mt-1">Check your inputs and try again.</p>
          }
        </div>

        {/* Error only — manual dismiss button */}
        {!isSuccess && (
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
