import { createContext, useState, useEffect, useContext, useRef } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

const SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours — matches JWT expiry

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

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
    window.location.href = '/login';
  }

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

export const useAuth = () => useContext(AuthContext);
