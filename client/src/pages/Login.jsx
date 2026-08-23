import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Milk, Lock, User, AlertCircle, AlertTriangle, Info, ShieldCheck, ArrowLeft } from 'lucide-react';
import { armForLogin } from '../api/coldStart';
import { consumeSessionNotice } from '../utils/session';
import BrandedLoader, { TumblerSpinner } from '../components/ui/BrandedLoader';

export default function Login() {
  const { login, verifyMfa, setupRequiredMfa, confirmRequiredMfa, user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // MFA verify step — set once login() reports mfaVerifyRequired (account is
  // already enrolled). While this is non-null the form renders the
  // code-entry screen instead of username/password.
  const [mfaToken, setMfaToken] = useState(null);
  const [mfaCode, setMfaCode]   = useState('');
  const [mfaSubmitting, setMfaSubmitting] = useState(false);

  // Forced first-time enrollment — set once login() reports mfaSetupRequired
  // (a superadmin required MFA on this account but it was never enrolled).
  // setupData holds the QR/otpauth fetched right after login() responds.
  const [setupToken, setSetupToken]   = useState(null);
  const [setupData, setSetupData]     = useState(null); // { otpauth, qrCodeDataUrl }
  const [setupCode, setSetupCode]     = useState('');
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  // Backup codes from a just-completed forced enrollment — shown exactly
  // once, before the user is let into the app. The session is already
  // committed (user is set) by the time this is non-null, so the redirect
  // guard below explicitly waits for this to clear first.
  const [backupCodesToShow, setBackupCodesToShow] = useState(null);

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

  if (user && !backupCodesToShow) return <Navigate to="/" replace />;
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

    if (result.mfaVerifyRequired) {
      // Password proven, session not issued yet — switch to the code-entry
      // screen. Password is intentionally kept out of state from here on.
      setLoading(false);
      setMfaToken(result.mfaToken);
      setPassword('');
      return;
    }
    if (result.mfaSetupRequired) {
      // Password proven, but this account has never been enrolled — fetch
      // the QR/otpauth right away so the forced-setup screen has something
      // to show the moment it renders. Stays under the same "Signing in…"
      // overlay as the login request itself.
      setPassword('');
      const setup = await setupRequiredMfa(result.mfaToken);
      setLoading(false);
      if (!setup.success) {
        setError(setup.message);
        return;
      }
      setSetupToken(result.mfaToken);
      setSetupData({ otpauth: setup.otpauth, qrCodeDataUrl: setup.qrCodeDataUrl });
      return;
    }

    setLoading(false);
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

  const handleSetupConfirm = async (e) => {
    e.preventDefault();
    if (setupCode.length !== 6) return;
    setError('');
    setSetupSubmitting(true);
    const result = await confirmRequiredMfa(setupToken, setupCode);
    setSetupSubmitting(false);
    if (!result.success) {
      setError(result.message);
      setSetupCode('');
      return;
    }
    // Session is already committed at this point — hold on the backup-codes
    // screen (the `user && !backupCodesToShow` guard above keeps this from
    // being replaced by the dashboard redirect) until "Continue" is clicked.
    setSetupToken(null);
    setSetupData(null);
    setBackupCodesToShow(result.backupCodes);
  };

  const cancelSetup = () => {
    setSetupToken(null);
    setSetupData(null);
    setSetupCode('');
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
            {backupCodesToShow ? (
              <>
                <div className="flex items-center gap-2 justify-center mb-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <p className="text-slate-700 text-sm font-semibold">MFA enabled — save your backup codes</p>
                </div>
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-xs mt-4 mb-4">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    Save these one-time codes somewhere safe. Each works once if you lose access to
                    your authenticator app. They won&apos;t be shown again.
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-6">
                  {backupCodesToShow.map((code) => (
                    <code
                      key={code}
                      className="text-center text-xs font-mono font-semibold bg-slate-50 border border-slate-200 rounded-lg py-2 text-slate-700"
                    >
                      {code}
                    </code>
                  ))}
                </div>
                <button
                  onClick={() => setBackupCodesToShow(null)}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2.5 px-4 rounded-lg transition-all text-sm"
                >
                  Continue to dashboard
                </button>
              </>
            ) : setupToken ? (
              <>
                <div className="flex items-center gap-2 justify-center mb-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <p className="text-slate-700 text-sm font-semibold">Set up two-factor authentication</p>
                </div>
                <p className="text-slate-500 text-xs mb-4 text-center">
                  Your super admin requires MFA on this account. Scan this QR code with an
                  authenticator app, then enter the 6-digit code it shows.
                </p>

                <form onSubmit={handleSetupConfirm} className="space-y-4">
                  {error && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {setupData && (
                    <>
                      <div className="flex justify-center">
                        <img
                          src={setupData.qrCodeDataUrl}
                          alt="MFA enrollment QR code"
                          className="w-36 h-36 rounded-lg border border-slate-200"
                        />
                      </div>
                      {(() => {
                        let manualKey = '';
                        try { manualKey = new URL(setupData.otpauth).searchParams.get('secret') ?? ''; } catch { /* malformed URI — QR still works */ }
                        return manualKey ? (
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                              Can&apos;t scan? Enter this key manually
                            </label>
                            <code className="block text-[11px] break-all bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-600">
                              {manualKey}
                            </code>
                          </div>
                        ) : null;
                      })()}
                    </>
                  )}

                  <div>
                    <label htmlFor="setupCode" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      6-digit code
                    </label>
                    <div className="relative">
                      <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="setupCode"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={setupCode}
                        onChange={(e) => setSetupCode(e.target.value)}
                        placeholder="123456"
                        required
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm text-center tracking-[0.3em] font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition bg-slate-50"
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={setupCode.length !== 6 || setupSubmitting}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white font-semibold py-2.5 px-4 rounded-lg transition-all text-sm mt-2"
                  >
                    {setupSubmitting ? <TumblerSpinner size={14} /> : null}
                    Confirm &amp; Continue
                  </button>

                  <button
                    type="button"
                    onClick={cancelSetup}
                    className="w-full flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700 text-xs font-semibold py-1.5 transition"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to login
                  </button>
                </form>
              </>
            ) : mfaToken ? (
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
