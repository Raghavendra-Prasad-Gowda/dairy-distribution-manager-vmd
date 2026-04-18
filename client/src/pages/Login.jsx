import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Milk, Lock, User, AlertCircle, Loader2 } from 'lucide-react';

export default function Login() {
  const { login, user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [slowWarning, setSlowWarning] = useState(false);
  const slowTimer = useRef(null);

  useEffect(() => {
    if (loading) {
      slowTimer.current = setTimeout(() => setSlowWarning(true), 6000);
    } else {
      clearTimeout(slowTimer.current);
      setSlowWarning(false);
    }
    return () => clearTimeout(slowTimer.current);
  }, [loading]);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) return setError('Username and password are required');
    setError('');
    setLoading(true);
    const result = await login(username, password);
    setLoading(false);
    if (!result.success) setError(result.message);
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
            <p className="text-slate-500 text-sm mb-6 text-center">Sign in to access your dashboard</p>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition bg-slate-50"
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
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition bg-slate-50"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !username || !password}
                className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white font-semibold py-2.5 px-4 rounded-lg transition-all text-sm mt-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
                ) : (
                  'Sign In'
                )}
              </button>

              {slowWarning && (
                <p className="text-center text-xs text-slate-400 mt-2 animate-pulse">
                  Server is warming up, please wait…
                </p>
              )}
            </form>
          </div>
        </div>

        <p className="text-center text-emerald-300 text-xs mt-5">
          Dairy Distribution Manager · Vikas Milk Dairy
        </p>
      </div>
    </div>
  );
}
