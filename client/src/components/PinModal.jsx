import { useState, useRef, useEffect } from 'react';
import { Lock, X, Loader2, ShieldAlert } from 'lucide-react';
import api from '../api/axios';

const LOCK_KEY     = 'vmd_pin_lockout_until';
const ATTEMPTS_KEY = 'vmd_pin_attempts';
const MAX_ATTEMPTS = 4;
const LOCKOUT_MS   = 60 * 60 * 1000; // 1 hour

function getLockoutRemaining() {
  const until = parseInt(localStorage.getItem(LOCK_KEY) || '0');
  const remaining = until - Date.now();
  return remaining > 0 ? remaining : 0;
}

function formatRemaining(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function recordFailedAttempt() {
  const attempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0') + 1;
  if (attempts >= MAX_ATTEMPTS) {
    localStorage.setItem(LOCK_KEY, String(Date.now() + LOCKOUT_MS));
    localStorage.removeItem(ATTEMPTS_KEY);
    return { locked: true, attempts };
  }
  localStorage.setItem(ATTEMPTS_KEY, String(attempts));
  return { locked: false, attempts };
}

function clearAttempts() {
  localStorage.removeItem(ATTEMPTS_KEY);
  localStorage.removeItem(LOCK_KEY);
}

/**
 * PinModal — prompts for the EDIT_PIN before allowing a sensitive action.
 * Props:
 *   isOpen       — controls visibility
 *   onClose()    — called when cancelled
 *   onSuccess()  — called when PIN is verified
 *   title        — optional heading
 */
export default function PinModal({ isOpen, onClose, onSuccess, title = 'Enter PIN' }) {
  const [digits, setDigits]       = useState(['', '', '', '']);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [remaining, setRemaining] = useState(0);  // lockout ms remaining
  const [attempts, setAttempts]   = useState(0);  // failed attempts this session
  const inputRefs                 = useRef([]);
  const timerRef                  = useRef(null);

  // Check lockout + reset on open
  useEffect(() => {
    if (!isOpen) return;
    setDigits(['', '', '', '']);
    setError('');
    setAttempts(parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0'));

    const rem = getLockoutRemaining();
    setRemaining(rem);

    if (rem <= 0) {
      setTimeout(() => inputRefs.current[0]?.focus(), 80);
    }
  }, [isOpen]);

  // Countdown timer while locked out
  useEffect(() => {
    if (!isOpen || remaining <= 0) return;
    timerRef.current = setInterval(() => {
      const rem = getLockoutRemaining();
      setRemaining(rem);
      if (rem <= 0) clearInterval(timerRef.current);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isOpen, remaining > 0]);

  const isLocked = remaining > 0;

  const handleKey = (e, idx) => {
    if (isLocked) return;
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const next = [...digits]; next[idx] = ''; setDigits(next);
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
      clearAttempts();
      onSuccess();
      onClose();
    } catch {
      const { locked, attempts: newAttempts } = recordFailedAttempt();
      setDigits(['', '', '', '']);
      if (locked) {
        setRemaining(LOCKOUT_MS);
        setAttempts(0);
      } else {
        const left = MAX_ATTEMPTS - newAttempts;
        setAttempts(newAttempts);
        setError(`Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} remaining.`);
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
      }
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
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isLocked ? 'bg-red-100' : 'bg-emerald-100'}`}>
              {isLocked
                ? <ShieldAlert size={15} className="text-red-600" />
                : <Lock size={15} className="text-emerald-700" />}
            </div>
            <p className="text-sm font-bold text-slate-900">{isLocked ? 'PIN Locked' : title}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition">
            <X size={15} />
          </button>
        </div>

        {isLocked ? (
          /* Lockout screen */
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
              <ShieldAlert size={28} className="text-red-500" />
            </div>
            <p className="text-sm font-bold text-slate-800 text-center">Too many wrong attempts</p>
            <p className="text-xs text-slate-500 text-center">PIN entry is blocked for</p>
            <p className="text-2xl font-bold tabular-nums text-red-600">{formatRemaining(remaining)}</p>
          </div>
        ) : (
          <>
            {/* Attempt warning */}
            {attempts > 0 && (
              <p className="text-[11px] text-amber-600 font-semibold bg-amber-50 px-3 py-1.5 rounded-lg -mb-1 w-full text-center">
                {MAX_ATTEMPTS - attempts} attempt{MAX_ATTEMPTS - attempts === 1 ? '' : 's'} remaining before 1-hour lockout
              </p>
            )}

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

            {/* Submit */}
            <button
              onClick={() => submitPin()}
              disabled={loading || digits.some(d => !d)}
              className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2.5 rounded-xl transition text-sm"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Lock size={14} />}
              {loading ? 'Verifying…' : 'Confirm'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
