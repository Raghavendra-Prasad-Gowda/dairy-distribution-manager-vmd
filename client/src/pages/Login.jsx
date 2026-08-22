import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Milk, Lock, User, AlertCircle, Info, ShieldCheck, ArrowLeft } from 'lucide-react';
import { armForLogin } from '../api/coldStart';
import { consumeSessionNotice } from '../utils/session';
import BrandedLoader, { TumblerSpinner } from '../components/ui/BrandedLoader';

export default function Login() {
  const { login, verifyMfa, user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // Superadmin MFA step — set once login() reports mfaRequired. While this
  // is non-null the form below renders the code-entry screen instead of
  // username/password.
  const [mfaToken, setMfaToken] = useState(null);
  const [mfaCode, setMfaCode]   = useState('');
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  // One-shot notice left by expireSessionAndRedirect() (session.js) when the
  // user was bounced here by an expired/timed-out session — tells them why
  // they landed back on the login page instead of leaving them guessing.
  // consumeSessionNotice() is a synchronous, side-effect-free-on-repeat read
  // (it clears the sessionStorage flag), so a lazy initializer replaces what
  // used to be a mount-only effect.
  const [notice, setNotice]     = useState(() => consumeSessionNotice() || '');
  const [slowWarning, setSlowWarning] = useState(false);
  const slowTimer = useRef(null);

  useEffect(() => {
    if (!loading) return;
    slowTimer.current = setTimeout(() => setSlowWarning(true), 6000);
    return () => {
      clearTimeout(slowTimer.current);
      setSlowWarning(false);
    };
  }, [loading]);

  if (user)    return <Navigate to="/" replace />;
  if (loading) return (
    <BrandedLoader
      overlay
      open
      tone="brand"
      label={slowWarning ? 'Server is warming up…' : 'Signing in…'}
    />
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) return setError('Username and password are required');
    setError('');
    setNotice('');
    setLoading(true);
    // Arm the global cold-start screen: if the login + initial dashboard
    // requests hang past 2s (Render free-tier wake), show the branded overlay.
    // Auto-disarms after the first wake hides.
    armForLogin();
    const result = await login(username, password);
    setLoading(false);
    if (result.mfaRequired) {
      // Password proven, session not issued yet — switch to the code-entry
      // screen. Password is intentionally kept out of state from here on.
      setMfaToken(result.mfaToken);
      setPassword('');
      return;
    }
    if (!result.success) {
      setError(result.message);
      // Wrong credentials — clear the password so the user isn't staring at
      // (and re-submitting) the same rejected value; the username is kept
      // since that part wasn't necessarily the problem.
      setPassword('');
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    if (!mfaCode) return;
    setError('');
    setMfaSubmitting(true);
    const result = await verifyMfa(mfaToken, mfaCode);
    setMfaSubmitting(false);
    if (!result.success) {
      setError(result.message);
      setMfaCode('');
    }
  };

  const backToLogin = () => {
    setMfaToken(null);
    setMfaCode('');
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center ddm-gradient">
      {/* Decorative circles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute top-1/2 left-8 w-32 h-32 rounded-full bg-white/5" />
      </div>

      <div className="relative w-full max-w-sm mx-4">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="ddm-gradient px-8 py-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 mb-4">
              <Milk className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Vikas Milk Dairy</h1>
            <p className="text-emerald-200 mt-1 text-sm font-medium">Distribution Manager</p>
          </div>

          {/* Form */}
          <div className="px-8 py-8">
            {mfaToken ? (
              <>
                <div className="flex items-center gap-2 justify-center mb-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <p className="text-slate-700 text-sm font-semibold">Two-factor authentication</p>
                </div>
                <p className="text-slate-500 text-xs mb-6 text-center">
                  Enter the 6-digit code from your authenticator app, or a backup code
                </p>

                <form onSubmit={handleMfaSubmit} className="space-y-4">
                  {error && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div>
                    <label htmlFor="mfaCode" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      Authentication code
                    </label>
                    <div className="relative">
                      <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="mfaCode"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        placeholder="123456"
                        required
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm text-center tracking-[0.3em] font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition bg-slate-50"
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!mfaCode || mfaSubmitting}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white font-semibold py-2.5 px-4 rounded-lg transition-all text-sm mt-2"
                  >
                    {mfaSubmitting ? <TumblerSpinner size={14} /> : null}
                    Verify
                  </button>

                  <button
                    type="button"
                    onClick={backToLogin}
                    className="w-full flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700 text-xs font-semibold py-1.5 transition"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to login
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="text-slate-500 text-sm mb-6 text-center">Sign in to access your dashboard</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {notice && !error && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-sm">
                      <Info className="w-4 h-4 flex-shrink-0" />
                      <span>{notice}</span>
                    </div>
                  )}

                  {error && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div>
                    <label htmlFor="username" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      Username
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your username"
                        required
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition bg-slate-50"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        required
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition bg-slate-50"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!username || !password}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white font-semibold py-2.5 px-4 rounded-lg transition-all text-sm mt-2"
                  >
                    Sign In
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-emerald-300 text-xs mt-5">
          Dairy Distribution Manager · Vikas Milk Dairy
        </p>
      </div>
    </div>
  );
}
