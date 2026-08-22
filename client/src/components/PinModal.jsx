import { useState, useRef, useEffect } from 'react';
import { Lock, X, ShieldAlert } from 'lucide-react';
import { TumblerSpinner } from './ui/BrandedLoader';
import api from '../api/axios';

const LOCK_KEY     = 'vmd_pin_lockout_until';
const ATTEMPTS_KEY = 'vmd_pin_attempts';
const MAX_ATTEMPTS = 15;
const LOCKOUT_MS   = 60 * 60 * 1000; // 1 hour
const PIN_LENGTH   = 6;

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
 *   verifyPath   — API path to POST to (default: '/pin/verify')
 */
export default function PinModal({ isOpen, onClose, onSuccess, title = 'Enter PIN', verifyPath = '/pin/verify' }) {
  const [digits, setDigits]       = useState(Array(PIN_LENGTH).fill(''));
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  // Lazy initializers so the very first render (mounted with isOpen already
  // true) reflects the real lockout state, matching what the effect used to
  // compute on mount — not just on a later isOpen flip.
  const [remaining, setRemaining] = useState(() => (isOpen ? getLockoutRemaining() : 0));  // lockout ms remaining
  const [attempts, setAttempts]   = useState(() => (isOpen ? parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0') : 0));  // failed attempts this session
  const inputRefs                 = useRef([]);
  const timerRef                  = useRef(null);

  // Check lockout + reset on open. Adjusted during render (rather than in an
  // Effect) since this is just state derived from other state — see
  // https://react.dev/learn/you-might-not-need-an-effect
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setDigits(Array(PIN_LENGTH).fill(''));
      setError('');
      setAttempts(parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0'));
      setRemaining(getLockoutRemaining());
    }
  }

  // Focus the first box on open, unless already locked out. Stays a real
  // Effect (not derived-during-render) — focusing a DOM ref is an
  // external-system side effect, not state.
  useEffect(() => {
    if (!isOpen) return;
    if (getLockoutRemaining() <= 0) {
      const t = setTimeout(() => inputRefs.current[0]?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const isLocked = remaining > 0;

  // Countdown timer while locked out
  useEffect(() => {
    if (!isOpen || !isLocked) return;
    timerRef.current = setInterval(() => {
      const rem = getLockoutRemaining();
      setRemaining(rem);
      if (rem <= 0) clearInterval(timerRef.current);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isOpen, isLocked]);

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

    if (idx < PIN_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    } else {
      submitPin(next);
    }
  };

  const submitPin = async (d = digits) => {
    const pin = d.join('');
    if (pin.length < PIN_LENGTH) return;
    setLoading(true);
    setError('');
    try {
      await api.post(verifyPath, { pin });
      clearAttempts();
      onSuccess();
      onClose();
    } catch {
      const { locked, attempts: newAttempts } = recordFailedAttempt();
      setDigits(Array(PIN_LENGTH).fill(''));
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
            <div className="flex gap-2">
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
                  className={`w-10 h-12 text-center text-lg font-bold border-2 rounded-xl outline-none transition
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
              {loading ? <TumblerSpinner size={15} /> : <Lock size={14} />}
              {loading ? 'Verifying…' : 'Confirm'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
