import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

export default function ChangePassword() {
  const { notify } = useNotification();
  const [loading, setLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [validation, setValidation] = useState({
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
  });

  const handlePasswordChange = (e) => {
    const password = e.target.value;
    setForm(prev => ({ ...prev, newPassword: password }));

    // Validate password strength
    setValidation({
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
    });
  };

  const allValidationsPassed = Object.values(validation).every(v => v);
  const passwordsMatch = form.newPassword && form.newPassword === form.confirmPassword;
  const canSubmit = form.currentPassword && allValidationsPassed && passwordsMatch && !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.currentPassword) {
      notify('Enter current password', 'warning');
      return;
    }

    if (!allValidationsPassed) {
      notify('Password does not meet requirements', 'warning');
      return;
    }

    if (!passwordsMatch) {
      notify('New passwords do not match', 'warning');
      return;
    }

    setLoading(true);
    notify('Updating password…', 'loading');
    try {
      await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });

      notify('Password changed successfully', 'success');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setValidation({ minLength: false, hasUppercase: false, hasLowercase: false, hasNumber: false });
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to change password', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3.5 bg-emerald-800">
        <Lock size={17} className="text-emerald-300 flex-shrink-0" />
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">Change Password</h1>
          <p className="text-emerald-300 text-xs">Update your account password</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto p-4">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Current Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? 'text' : 'password'}
                    value={form.currentPassword}
                    onChange={e => setForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                    placeholder="Enter current password"
                    className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  >
                    {showPasswords.current ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? 'text' : 'password'}
                    value={form.newPassword}
                    onChange={handlePasswordChange}
                    placeholder="Enter new password"
                    className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  >
                    {showPasswords.new ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Password Requirements */}
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Requirements:</p>
                  <div className="space-y-1">
                    {[
                      { check: validation.minLength, label: 'At least 8 characters' },
                      { check: validation.hasUppercase, label: 'One uppercase letter (A-Z)' },
                      { check: validation.hasLowercase, label: 'One lowercase letter (a-z)' },
                      { check: validation.hasNumber, label: 'One number (0-9)' },
                    ].map((req, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        {req.check ? (
                          <CheckCircle size={14} className="text-emerald-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle size={14} className="text-slate-300 flex-shrink-0" />
                        )}
                        <span className={req.check ? 'text-emerald-700' : 'text-slate-500'}>
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={e => setForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Confirm new password"
                    className={`w-full px-3 py-2.5 pr-10 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent ${
                      form.confirmPassword && !passwordsMatch
                        ? 'border-red-300 bg-red-50 focus:ring-red-500'
                        : 'border-slate-200 focus:ring-emerald-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  >
                    {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {form.confirmPassword && !passwordsMatch && (
                  <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
                )}
                {form.confirmPassword && passwordsMatch && (
                  <p className="text-xs text-emerald-600 mt-1">Passwords match</p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full px-4 py-2.5 text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white rounded-lg transition"
              >
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </div>

          {/* Info Box */}
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-800">
              <span className="font-semibold">Security Tip:</span> Use a strong password with a mix of uppercase, lowercase, numbers, and special characters for better protection.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
