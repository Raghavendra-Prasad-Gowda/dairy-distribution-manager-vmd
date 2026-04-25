import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';

const Ctx = createContext(null);

// ── Centered modal notification ───────────────────────────────────────────────
const MODAL_VARIANTS = {
  success: {
    iconBg:  'from-emerald-400 to-emerald-600',
    Icon:    CheckCircle,
    title:   'Success',
    btnCls:  'bg-emerald-600 hover:bg-emerald-700',
  },
  error: {
    iconBg:  'from-red-400 to-red-600',
    Icon:    XCircle,
    title:   'Something went wrong',
    btnCls:  'bg-red-600 hover:bg-red-700',
  },
  warning: {
    iconBg:  'from-amber-400 to-amber-600',
    Icon:    AlertTriangle,
    title:   'Warning',
    btnCls:  'bg-amber-500 hover:bg-amber-600',
  },
  info: {
    iconBg:  'from-blue-400 to-blue-600',
    Icon:    Info,
    title:   'Info',
    btnCls:  'bg-blue-600 hover:bg-blue-700',
  },
};

function NotificationModal({ type, message, onClose }) {
  const v = MODAL_VARIANTS[type] ?? MODAL_VARIANTS.info;
  const { Icon, iconBg, title, btnCls } = v;

  // Auto-dismiss success after 3 s
  useEffect(() => {
    if (type !== 'success') return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [type, onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      style={{ animation: 'ntFadeIn 0.2s ease' }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl p-8 mx-4 w-full max-w-sm text-center"
        style={{ animation: 'ntPopIn 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Icon circle */}
        <div className={`mx-auto w-20 h-20 rounded-full bg-gradient-to-br ${iconBg} flex items-center justify-center mb-4`}
          style={{ animation: 'ntScaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.05s both' }}
        >
          <Icon className="w-10 h-10 text-white" />
        </div>

        <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
        <p className="text-slate-500 text-sm mb-6 leading-relaxed">{message}</p>

        <button
          onClick={onClose}
          className={`w-full py-3 rounded-xl text-white font-semibold text-sm transition ${btnCls}`}
        >
          OK
        </button>
      </div>
    </div>
  );
}

// ── Loading overlay ────────────────────────────────────────────────────────────
function LoadingOverlay({ message = 'Processing…' }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
        <span className="text-5xl" style={{ animation: 'ntBounce 0.8s ease-in-out infinite alternate' }}>🥛</span>
        <p className="text-slate-700 font-semibold text-sm">{message}</p>
      </div>
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function NotificationProvider({ children }) {
  const [current, setCurrent] = useState(null); // { type, message }

  const notify = useCallback((message, type = 'success') => {
    setCurrent({ type, message });
  }, []);

  const dismiss = useCallback(() => setCurrent(null), []);

  return (
    <Ctx.Provider value={{ notify }}>
      {children}

      {/* Animations injected once */}
      <style>{`
        @keyframes ntFadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ntPopIn   { from { opacity: 0; transform: scale(0.85) } to { opacity: 1; transform: scale(1) } }
        @keyframes ntScaleIn { from { transform: scale(0) } to { transform: scale(1) } }
        @keyframes ntBounce  { from { transform: translateY(0) } to { transform: translateY(-10px) } }
      `}</style>

      {current?.type === 'loading' && (
        <LoadingOverlay message={current.message} />
      )}

      {current && current.type !== 'loading' && (
        <NotificationModal
          type={current.type}
          message={current.message}
          onClose={dismiss}
        />
      )}
    </Ctx.Provider>
  );
}

export const useNotification = () => useContext(Ctx);
