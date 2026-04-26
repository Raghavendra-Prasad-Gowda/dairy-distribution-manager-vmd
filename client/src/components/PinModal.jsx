import { useState, useRef, useEffect } from 'react';
import { Lock, X, Loader2 } from 'lucide-react';
import api from '../api/axios';

/**
 * PinModal — prompts for the EDIT_PIN before allowing a sensitive action.
 * Props:
 *   isOpen       — controls visibility
 *   onClose()    — called when cancelled
 *   onSuccess()  — called when PIN is verified
 *   title        — optional heading (default "Enter PIN")
 */
export default function PinModal({ isOpen, onClose, onSuccess, title = 'Enter PIN' }) {
  const [digits, setDigits]   = useState(['', '', '', '']);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const inputRefs             = useRef([]);

  // Reset + focus first box whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setDigits(['', '', '', '']);
      setError('');
      setTimeout(() => inputRefs.current[0]?.focus(), 80);
    }
  }, [isOpen]);

  const handleKey = (e, idx) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const next = [...digits];
        next[idx] = '';
        setDigits(next);
      } else if (idx > 0) {
        inputRefs.current[idx - 1]?.focus();
      }
      return;
    }
    if (!/^\d$/.test(e.key)) return;

    const next = [...digits];
    next[idx] = e.key;
    setDigits(next);
    setError('');

    if (idx < 3) {
      inputRefs.current[idx + 1]?.focus();
    } else {
      // All 4 digits entered — auto-submit
      submitPin(next);
    }
  };

  const submitPin = async (d = digits) => {
    const pin = d.join('');
    if (pin.length < 4) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/pin/verify', { pin });
      onSuccess();
      onClose();
    } catch {
      setError('Incorrect PIN. Try again.');
      setDigits(['', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 flex flex-col items-center gap-5"
        style={{ animation: 'popIn 0.2s ease' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Lock size={15} className="text-emerald-700" />
            </div>
            <p className="text-sm font-bold text-slate-900">{title}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition">
            <X size={15} />
          </button>
        </div>

        {/* PIN boxes */}
        <div className="flex gap-3">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => inputRefs.current[i] = el}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={() => {}}
              onKeyDown={e => handleKey(e, i)}
              disabled={loading}
              className={`w-12 h-14 text-center text-xl font-bold border-2 rounded-xl outline-none transition
                ${d ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-800'}
                ${error ? 'border-red-400 bg-red-50' : ''}
                focus:border-emerald-500 focus:bg-emerald-50
                disabled:opacity-50`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs font-semibold text-red-600 -mt-2">{error}</p>
        )}

        {/* Submit button */}
        <button
          onClick={() => submitPin()}
          disabled={loading || digits.some(d => !d)}
          className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2.5 rounded-xl transition text-sm"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Lock size={14} />}
          {loading ? 'Verifying…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
