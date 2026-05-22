import { Loader2 } from 'lucide-react';

export default function LoadingOverlay({ open = true, message = 'Working…' }) {
  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-slate-700 font-semibold text-sm">{message}</p>
      </div>
    </div>
  );
}
