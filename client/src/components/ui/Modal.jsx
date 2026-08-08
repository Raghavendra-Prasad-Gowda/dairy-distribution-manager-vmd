import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

// Colored header band — matches the "bulk action" dialogs elsewhere in the
// app (Bulk Update Prices, Bulk Enable/Disable Products), which use a solid
// band + icon + white title/subtitle rather than this component's plain
// white header. Opt-in via the `accent` prop so the six existing plain-header
// callers (simple confirm/edit dialogs) are completely unaffected.
const ACCENT_CLASSES = {
  emerald: { band: 'bg-emerald-700', subtitle: 'text-emerald-200', close: 'text-emerald-200 hover:text-white hover:bg-emerald-600' },
  amber:   { band: 'bg-amber-600',   subtitle: 'text-amber-100',   close: 'text-amber-100 hover:text-white hover:bg-amber-500' },
  teal:    { band: 'bg-teal-700',    subtitle: 'text-teal-200',    close: 'text-teal-200 hover:text-white hover:bg-teal-600' },
  red:     { band: 'bg-red-700',     subtitle: 'text-red-200',     close: 'text-red-200 hover:text-white hover:bg-red-600' },
};

function useFocusTrap(open, containerRef) {
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement;

    const focusables = () =>
      container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

    const initial = focusables()[0];
    if (initial instanceof HTMLElement) initial.focus();

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last  = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, containerRef]);
}

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  accent,
  size = 'md',
  showClose = true,
  closeOnBackdrop = true,
  footer = null,
  children,
}) {
  const containerRef = useRef(null);
  useFocusTrap(open, containerRef);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  const sizeCls  = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
  const accentCls = accent ? ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.emerald : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm"
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{ animation: 'fadeIn 0.15s ease' }}
    >
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${sizeCls} bg-white rounded-2xl shadow-2xl overflow-hidden`}
        style={{ animation: 'popIn 0.2s ease' }}
      >
        {accentCls ? (
          (title || showClose) && (
            <div className={`flex items-center justify-between gap-3 px-6 py-4 ${accentCls.band}`}>
              <div className="flex items-center gap-3 min-w-0">
                {Icon && <Icon size={18} className={`${accentCls.subtitle} flex-shrink-0`} />}
                <div className="min-w-0">
                  <h3 id="modal-title" className="text-base font-bold text-white leading-tight truncate">{title}</h3>
                  {subtitle && <p className={`text-[11px] mt-0.5 ${accentCls.subtitle} truncate`}>{subtitle}</p>}
                </div>
              </div>
              {showClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close dialog"
                  className={`flex-shrink-0 p-1.5 rounded-lg transition ${accentCls.close}`}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )
        ) : (
          (title || showClose) && (
            <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
              <h3 id="modal-title" className="text-base font-bold text-slate-900 leading-tight">{title}</h3>
              {showClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="text-slate-400 hover:text-slate-600 flex-shrink-0 p-1 -m-1 rounded"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )
        )}
        <div className={title ? 'px-6 pb-5' : 'p-6'}>{children}</div>
        {footer && (
          <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
