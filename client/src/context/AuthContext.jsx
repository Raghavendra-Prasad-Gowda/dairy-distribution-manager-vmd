import { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import api from '../api/axios';
import { SESSION_MS, expireSessionAndRedirect } from '../utils/session';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  // These helpers only ever close over the stable timerRef, the stable setUser
  // setter, and module-level imports — none of that changes across renders, so
  // useCallback([]) (or a dep on another useCallback below) gives each a truly
  // stable identity that's safe to list in the mount effect's deps.
  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const scheduleExpiry = useCallback((loginTime, doLogout) => {
    clearTimer();
    const remaining = SESSION_MS - (Date.now() - loginTime);
    if (remaining <= 0) return false;
    timerRef.current = setTimeout(doLogout, remaining);
    return true;
  }, [clearTimer]);

  const clearStorage = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('loginTime');
    delete api.defaults.headers.common['Authorization'];
  }, []);

  const performAutoLogout = useCallback(async () => {
    clearTimer();
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
    expireSessionAndRedirect('Your session expired after 2 hours. Please log in again.');
  }, [clearTimer]);

  // Reads localStorage and schedules the expiry timer — a real side effect
  // (setTimeout), so it stays behind useEffect rather than becoming a lazy
  // useState initializer like Login.jsx's one-shot session notice.
  const hydrateSession = useCallback(() => {
    const token     = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const loginTime = Number(localStorage.getItem('loginTime'));

    if (token && savedUser) {
      const valid = loginTime && scheduleExpiry(loginTime, performAutoLogout);
      if (valid) {
        setUser(JSON.parse(savedUser));
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } else {
        clearStorage();
      }
    }
    setLoading(false);
  }, [scheduleExpiry, performAutoLogout, clearStorage]);

  useEffect(() => {
    // hydrateSession reads localStorage and, when a still-valid session is
    // found, both sets user state AND schedules the real side effect this
    // mount effect exists for (the expiry setTimeout via scheduleExpiry) —
    // the two are intentionally one atomic step so the timer is always
    // armed in the same tick the user is restored. Splitting the setUser
    // call out into a lazy useState initializer would leave a window where
    // a stale/expired session could render as logged-in with no expiry
    // timer running.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    hydrateSession();
    return clearTimer;
  }, [hydrateSession, clearTimer]);

  // Shared by login() and verifyMfa() below — both end at "credentials are
  // now fully proven" and persist the session identically.
  const commitSession = (data) => {
    const { accessToken, businessName, role, salespersonId, salespersonName, adminUserId } = data;

    const loginTime = Date.now();
    const userObj = { businessName, role, salespersonId: salespersonId ?? null, salespersonName: salespersonName ?? null, adminUserId: adminUserId ?? null };

    localStorage.setItem('token', accessToken);
    localStorage.setItem('user', JSON.stringify(userObj));
    localStorage.setItem('loginTime', String(loginTime));
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

    scheduleExpiry(loginTime, performAutoLogout);
    setUser(userObj);
  };

  const login = async (username, password) => {
    try {
      const response = await api.post('/auth/login', { username, password });
      const { data } = response.data;

      // Password is correct, but the session isn't issued yet in either
      // case below — Login.jsx collects what's needed and finishes the
      // login via verifyMfa() or confirmRequiredMfa() further down.
      if (data.mfaVerifyRequired) {
        // Already enrolled (self-service, or a completed forced
        // enrollment) — just needs a live code.
        return { success: false, mfaVerifyRequired: true, mfaToken: data.mfaToken };
      }
      if (data.mfaSetupRequired) {
        // A superadmin marked this account mfaRequired but it was never
        // enrolled — must complete enrollment before a session is issued.
        return { success: false, mfaSetupRequired: true, mfaToken: data.mfaToken };
      }

      commitSession(data);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.error || 'Login failed. Please try again.',
      };
    }
  };

  /** Completes a login that login() paused for MFA on an already-enrolled account. */
  const verifyMfa = async (mfaToken, code) => {
    try {
      const response = await api.post('/auth/mfa/verify', { mfaToken, code });
      commitSession(response.data.data);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.error || 'Invalid code. Please try again.',
      };
    }
  };

  /**
   * Starts a FORCED first-time enrollment (login() returned mfaSetupRequired).
   * Returns the QR/otpauth payload — doesn't touch session state, mirrors
   * the self-service admin-users/mfa/setup shape.
   */
  const setupRequiredMfa = async (mfaToken) => {
    try {
      const response = await api.post('/auth/mfa/setup-required', { mfaToken });
      return { success: true, ...response.data.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to start MFA setup. Please log in again.',
      };
    }
  };

  /**
   * Completes a forced enrollment — verifies the code, and (unlike
   * verifyMfa) this itself finishes the login, so it also returns the new
   * backup codes for the caller to show once alongside committing the session.
   */
  const confirmRequiredMfa = async (mfaToken, code) => {
    try {
      const response = await api.post('/auth/mfa/confirm-required', { mfaToken, code });
      const { backupCodes, ...sessionData } = response.data.data;
      commitSession(sessionData);
      return { success: true, backupCodes };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.error || 'Invalid code. Please try again.',
      };
    }
  };

  const logout = async () => {
    clearTimer();
    await api.post('/auth/logout').catch(() => {});
    clearStorage();
    setUser(null);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center ddm-gradient">
      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center animate-pulse" />
    </div>
  );

  return (
    <AuthContext.Provider value={{ user, login, verifyMfa, setupRequiredMfa, confirmRequiredMfa, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Co-locating the hook with its Provider only costs Fast Refresh granularity
// (an edit here triggers a full reload instead of an HMR patch) — no runtime
// or correctness impact. Splitting into a separate useAuth.js file would
// mean updating ~13 import sites for a dev-experience-only gain.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
