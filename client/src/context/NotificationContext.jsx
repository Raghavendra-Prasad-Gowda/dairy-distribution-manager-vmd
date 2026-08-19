import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import BrandedLoader from '../components/ui/BrandedLoader';

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

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
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

      {/* Animations injected once (notification modal only) */}
      <style>{`
        @keyframes ntFadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ntPopIn   { from { opacity: 0; transform: scale(0.85) } to { opacity: 1; transform: scale(1) } }
        @keyframes ntScaleIn { from { transform: scale(0) } to { transform: scale(1) } }
      `}</style>

      {current?.type === 'loading' && (
        <BrandedLoader overlay open label={current.message} size="sm" />
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

// Co-locating the hook with its Provider only costs Fast Refresh granularity
// (an edit here triggers a full reload instead of an HMR patch) — no runtime
// or correctness impact. Splitting into a separate useNotification.js file
// would mean updating ~20 import sites for a dev-experience-only gain.
// eslint-disable-next-line react-refresh/only-export-components
export const useNotification = () => useContext(Ctx);
