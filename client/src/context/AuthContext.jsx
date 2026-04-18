import { createContext, useState, useEffect, useContext, useRef } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

const SESSION_MS = 2 * 60 * 60 * 1000; // 2 hours

export const AuthProvider = ({ children }) => {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  /** Cancel any pending auto-logout timer */
  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  /** Schedule auto-logout at (loginTime + 2h). Returns false if already expired. */
  const scheduleExpiry = (loginTime, doLogout) => {
    clearTimer();
    const remaining = SESSION_MS - (Date.now() - loginTime);
    if (remaining <= 0) return false;
    timerRef.current = setTimeout(doLogout, remaining);
    return true;
  };

  useEffect(() => {
    const token     = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const loginTime = Number(localStorage.getItem('loginTime'));

    if (token && savedUser) {
      const valid = loginTime && scheduleExpiry(loginTime, performAutoLogout);
      if (valid) {
        setUser(JSON.parse(savedUser));
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } else {
        // Session expired while the tab was closed — clear immediately
        clearStorage();
      }
    }
    setLoading(false);
    return clearTimer;
  }, []);

  function clearStorage() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('loginTime');
    delete api.defaults.headers.common['Authorization'];
  }

  async function performAutoLogout() {
    clearTimer();
    await api.post('/auth/logout').catch(() => {});
    clearStorage();
    setUser(null);
    // Redirect to login — setUser(null) alone triggers ProtectedRoute redirect,
    // but a hard redirect ensures any stale state is also cleared.
    window.location.href = '/login';
  }

  const login = async (username, password) => {
    try {
      const response = await api.post('/auth/login', { username, password });
      const { accessToken, businessName } = response.data.data;

      const loginTime = Date.now();
      localStorage.setItem('token', accessToken);
      localStorage.setItem('user', JSON.stringify({ businessName }));
      localStorage.setItem('loginTime', String(loginTime));
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

      scheduleExpiry(loginTime, performAutoLogout);
      setUser({ businessName });
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

export const useAuth = () => useContext(AuthContext);
