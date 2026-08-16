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

  const login = async (username, password) => {
    try {
      const response = await api.post('/auth/login', { username, password });
      const { accessToken, businessName, role, salespersonId, salespersonName, adminUserId } = response.data.data;

      const loginTime = Date.now();
      const userObj = { businessName, role, salespersonId: salespersonId ?? null, salespersonName: salespersonName ?? null, adminUserId: adminUserId ?? null };

      localStorage.setItem('token', accessToken);
      localStorage.setItem('user', JSON.stringify(userObj));
      localStorage.setItem('loginTime', String(loginTime));
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

      scheduleExpiry(loginTime, performAutoLogout);
      setUser(userObj);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.error || 'Login failed. Please try again.',
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
    <AuthContext.Provider value={{ user, login, logout, loading }}>
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
