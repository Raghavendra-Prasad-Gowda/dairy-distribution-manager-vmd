import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const Ctx = createContext(null);

const VARIANTS = {
  success: { bg: 'bg-emerald-600', border: 'border-emerald-700', Icon: CheckCircle },
  error:   { bg: 'bg-red-600',     border: 'border-red-700',     Icon: XCircle },
  warning: { bg: 'bg-amber-500',   border: 'border-amber-600',   Icon: AlertTriangle },
  info:    { bg: 'bg-blue-600',    border: 'border-blue-700',    Icon: Info },
};

function Toast({ id, message, type, onDismiss }) {
  const { bg, Icon } = VARIANTS[type] ?? VARIANTS.success;
  return (
    <div
      className={`${bg} text-white flex items-start gap-3 pl-4 pr-3 py-3.5 rounded-xl shadow-2xl text-sm font-medium min-w-[280px] max-w-sm border border-white/10`}
      style={{ animation: 'toastIn 0.25s cubic-bezier(0.34,1.56,0.64,1)' }}
    >
      <Icon size={16} className="flex-shrink-0 mt-0.5" />
      <span className="flex-1 leading-snug">{message}</span>
      <button
        onClick={() => onDismiss(id)}
        className="opacity-60 hover:opacity-100 transition-opacity ml-1 p-0.5 flex-shrink-0"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, type = 'success', duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ notify }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[300] flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto">
              <Toast {...t} onDismiss={dismiss} />
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useNotification = () => useContext(Ctx);
