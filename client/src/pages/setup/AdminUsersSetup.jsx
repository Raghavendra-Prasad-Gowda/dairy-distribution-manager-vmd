import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Plus, Edit2, Eye, EyeOff, Save, X, ShieldCheck, ShieldOff, Search, Trash2, AlertTriangle, UserX, UserCheck, Lock } from 'lucide-react';
import { TumblerSpinner } from '../../components/ui/BrandedLoader';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import BrandedLoader from '../../components/ui/BrandedLoader';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { useApiResource } from '../../hooks/useApiResource';
import { useMutation } from '../../hooks/useMutation';
import { useDisclosure } from '../../hooks/useDisclosure';
import api from '../../api/axios';

const ROLE_LABEL = { admin: 'Admin', superadmin: 'Super Admin', dispatcher: 'Dispatcher' };

const PIN_LENGTH = 6;

/** Reusable row of 6 digit PIN input boxes, styled to match PinModal */
function PinInputRow({ value, onChange, disabled, hasError, label }) {
  const refs = useRef([]);

  const handleKey = useCallback((e, idx) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...value];
      if (next[idx]) {
        next[idx] = '';
        onChange(next);
      } else if (idx > 0) {
        next[idx - 1] = '';
        onChange(next);
        refs.current[idx - 1]?.focus();
      }
      return;
    }
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      const next = [...value];
      next[idx] = e.key;
      onChange(next);
      if (idx < PIN_LENGTH - 1) refs.current[idx + 1]?.focus();
    }
  }, [value, onChange]);

  return (
    <div>
      {label && <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</p>}
      <div className="flex gap-2">
        {value.map((d, i) => (
          <input
            key={i}
            ref={el => refs.current[i] = el}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={() => {}}
            onKeyDown={e => handleKey(e, i)}
            disabled={disabled}
            className={`w-10 h-12 text-center text-lg font-bold border-2 rounded-xl outline-none transition
              ${d ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-800'}
              ${hasError ? 'border-red-400 bg-red-50' : ''}
              focus:border-emerald-500 focus:bg-emerald-50
              disabled:opacity-50`}
          />
        ))}
      </div>
    </div>
  );
}

const emptyPin = () => Array(PIN_LENGTH).fill('');

/** Shared form body used inside both PIN change modals */
function PinChangeForm({ apiPath, onSuccess, onError }) {
  const [current, setCurrent] = useState(emptyPin());
  const [next,    setNext]    = useState(emptyPin());
  const [confirm, setConfirm] = useState(emptyPin());
  const [error,   setError]   = useState('');
  const [saving,  setSaving]  = useState(false);

  const currentPin = current.join('');
  const nextPin    = next.join('');
  const confirmPin = confirm.join('');
  const allFilled  = currentPin.length === PIN_LENGTH && nextPin.length === PIN_LENGTH && confirmPin.length === PIN_LENGTH;
  const mismatch   = allFilled && nextPin !== confirmPin;
  const canSubmit  = allFilled && !mismatch && !saving;

  const handleChange = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setSaving(true);
    try {
      await api.put(apiPath, { currentPin, newPin: nextPin });
      onSuccess();
    } catch (err) {
      const msg = err?.response?.data?.error ?? 'Failed to change PIN';
      setError(msg);
      if (onError) onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleChange} className="space-y-4">
      <PinInputRow label="Current PIN" value={current} onChange={setCurrent} disabled={saving} hasError={!!error} />
      <PinInputRow label="New PIN (6 digits)" value={next} onChange={setNext} disabled={saving} />
      <PinInputRow label="Confirm New PIN" value={confirm} onChange={setConfirm} disabled={saving} hasError={mismatch} />

      {mismatch && (
        <p className="text-xs font-semibold text-red-600">New PIN and confirmation do not match</p>
      )}
      {error && !mismatch && (
        <p className="text-xs font-semibold text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition"
      >
        {saving ? <TumblerSpinner size={14} /> : <Save size={14} />}
        Change PIN
      </button>
    </form>
  );
}

/** Card for changing the edit PIN — superadmin only */
function ChangePinSection() {
  const { notify } = useNotification();
  const [showModal, setShowModal] = useState(false);

  const handleSuccess = () => {
    notify('Edit PIN changed successfully', 'success');
    setShowModal(false);
  };

  return (
    <>
      <div className="ddm-card p-5">
        <div className="flex items-center gap-2.5 mb-4 pb-3.5 border-b border-slate-100">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Lock size={15} className="text-emerald-700" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Edit PIN</p>
            <p className="text-xs text-slate-400">The PIN used to edit or delete payments</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          This PIN protects sensitive payment edits and deletions. Change it here at any time.
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition"
        >
          <Lock size={14} />
          Change Edit PIN
        </button>
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Change Edit PIN"
        accent="emerald"
        size="sm"
      >
        <PinChangeForm
          apiPath="/pin/update"
          onSuccess={handleSuccess}
        />
      </Modal>
    </>
  );
}

// ─── P&L PIN gate toggle ──────────────────────────────────────────────────────

function PlPinToggleSection() {
  const { notify } = useNotification();
  const [enabled,      setEnabled]      = useState(true);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [showPlPinModal, setShowPlPinModal] = useState(false);

  // Load current setting on mount.
  useEffect(() => {
    api.get('/pin/settings')
      .then(r => setEnabled(r.data.data.plPinEnabled))
      .catch(() => notify('Failed to load PIN settings', 'error'))
      .finally(() => setLoading(false));
  }, [notify]);

  const handleToggle = async () => {
    setSaving(true);
    try {
      await api.put('/pin/settings', { plPinEnabled: !enabled });
      setEnabled(v => !v);
      notify(`P&L PIN gate ${!enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Failed to update setting', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePlPinSuccess = () => {
    notify('P&L PIN changed successfully', 'success');
    setShowPlPinModal(false);
  };

  return (
    <>
      <div className="ddm-card p-5">
        <div className="flex items-center gap-2.5 mb-4 pb-3.5 border-b border-slate-100">
          <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Lock size={15} className="text-amber-700" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Profit &amp; Loss PIN Gate</p>
            <p className="text-xs text-slate-400">Control whether a PIN is required to view P&amp;L data</p>
          </div>
        </div>
        {loading ? (
          <BrandedLoader size="sm" hideBrand inlinePadY="py-4" />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-700">Require PIN for Profit &amp; Loss</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {enabled
                    ? 'Admins must enter the PIN to view P&L data.'
                    : 'P&L report is open to all admins without a PIN.'}
                </p>
              </div>
              {/* Toggle switch */}
              <button
                onClick={handleToggle}
                disabled={saving}
                aria-pressed={enabled}
                aria-label={enabled ? 'Disable P&L PIN gate' : 'Enable P&L PIN gate'}
                className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 disabled:opacity-50 ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            {/* Set P&L PIN button — separate PIN from the edit PIN */}
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500 mb-3">
                The P&amp;L PIN is independent of the edit PIN. Change it here without affecting payment edits.
              </p>
              <button
                onClick={() => setShowPlPinModal(true)}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition"
              >
                <Lock size={14} />
                Set P&amp;L PIN
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={showPlPinModal}
        onClose={() => setShowPlPinModal(false)}
        title="Set P&L PIN"
        accent="amber"
        size="sm"
      >
        <PinChangeForm
          apiPath="/pin/update-pl"
          onSuccess={handlePlPinSuccess}
        />
      </Modal>
    </>
  );
}

// ─── MFA (superadmin-only two-factor login) ────────────────────────────────
// Self-service only — always acts on the calling superadmin's own account
// (server-side too: adminUsers.controller.js's mfa* handlers ignore any :id).

function MfaSection() {
  const { notify } = useNotification();
  const [status, setStatus]   = useState(null); // { mfaEnabled }
  const [loading, setLoading] = useState(true);

  const [enrolling, setEnrolling]     = useState(false);
  const [enrollData, setEnrollData]   = useState(null); // { otpauth, qrCodeDataUrl }
  const [confirmCode, setConfirmCode] = useState('');
  const [confirming, setConfirming]   = useState(false);
  const [backupCodes, setBackupCodes] = useState(null); // shown once, right after confirm

  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disablePassword, setDisablePassword]   = useState('');
  const [disabling, setDisabling]                = useState(false);

  // loading starts true (useState(true) above) so the first render shows the
  // BrandedLoader without a synchronous setState in the mount effect below —
  // only .finally() flips it back off, same pattern as PlPinToggleSection.
  const loadStatus = useCallback(() => {
    api.get('/admin-users/mfa/status')
      .then(r => setStatus(r.data.data))
      .catch(() => notify('Failed to load MFA status', 'error'))
      .finally(() => setLoading(false));
  }, [notify]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const startEnroll = async () => {
    setEnrolling(true);
    try {
      const res = await api.post('/admin-users/mfa/setup');
      setEnrollData(res.data.data);
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Failed to start MFA setup', 'error');
    } finally {
      setEnrolling(false);
    }
  };

  const cancelEnroll = () => {
    setEnrollData(null);
    setConfirmCode('');
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setConfirming(true);
    try {
      const res = await api.post('/admin-users/mfa/confirm', { code: confirmCode });
      setBackupCodes(res.data.data.backupCodes);
      setEnrollData(null);
      setConfirmCode('');
      notify('MFA enabled successfully', 'success');
      loadStatus();
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Invalid code', 'error');
    } finally {
      setConfirming(false);
    }
  };

  const handleDisable = async (e) => {
    e.preventDefault();
    setDisabling(true);
    try {
      await api.post('/admin-users/mfa/disable', { password: disablePassword });
      notify('MFA disabled', 'success');
      setShowDisableModal(false);
      setDisablePassword('');
      loadStatus();
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Failed to disable MFA', 'error');
    } finally {
      setDisabling(false);
    }
  };

  let manualKey = '';
  if (enrollData?.otpauth) {
    try { manualKey = new URL(enrollData.otpauth).searchParams.get('secret') ?? ''; } catch { /* malformed URI — leave blank, QR code still works */ }
  }

  return (
    <div className="ddm-card p-5">
      <div className="flex items-center gap-2.5 mb-4 pb-3.5 border-b border-slate-100">
        <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={15} className="text-emerald-700" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800">Two-Factor Authentication</p>
          <p className="text-xs text-slate-400">Extra login security for your super admin account</p>
        </div>
      </div>

      {loading ? (
        <BrandedLoader size="sm" hideBrand inlinePadY="py-4" />
      ) : backupCodes ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-xs">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>Save these one-time backup codes somewhere safe. Each works once if you lose access to your authenticator app. They won&apos;t be shown again.</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map(code => (
              <code key={code} className="text-center text-xs font-mono font-semibold bg-slate-50 border border-slate-200 rounded-lg py-2 text-slate-700">{code}</code>
            ))}
          </div>
          <button
            onClick={() => setBackupCodes(null)}
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition"
          >
            Done
          </button>
        </div>
      ) : enrollData ? (
        <form onSubmit={handleConfirm} className="space-y-4">
          <p className="text-xs text-slate-500">
            Scan this QR code with an authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code it shows.
          </p>
          <div className="flex justify-center">
            <img src={enrollData.qrCodeDataUrl} alt="MFA enrollment QR code" className="w-40 h-40 rounded-lg border border-slate-200" />
          </div>
          {manualKey && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Can&apos;t scan? Enter this key manually</label>
              <code className="block text-[11px] break-all bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-600">{manualKey}</code>
            </div>
          )}
          <div>
            <label htmlFor="mfaConfirmCode" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">6-digit code</label>
            <input
              id="mfaConfirmCode"
              type="text"
              inputMode="numeric"
              value={confirmCode}
              onChange={e => setConfirmCode(e.target.value)}
              placeholder="123456"
              maxLength={6}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-center tracking-[0.3em] font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={cancelEnroll} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold px-4 py-2.5 rounded-xl transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={confirmCode.length !== 6 || confirming}
              className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition"
            >
              {confirming ? <TumblerSpinner size={14} /> : <ShieldCheck size={14} />}
              Confirm &amp; Enable
            </button>
          </div>
        </form>
      ) : status?.mfaEnabled ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
            <ShieldCheck size={16} />
            MFA is enabled on your account
          </div>
          <button
            onClick={() => setShowDisableModal(true)}
            className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold px-4 py-2.5 rounded-xl transition"
          >
            <Lock size={14} />
            Disable MFA
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Require a code from an authenticator app every time you log in, in addition to your password.
          </p>
          <button
            onClick={startEnroll}
            disabled={enrolling}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition"
          >
            {enrolling ? <TumblerSpinner size={14} /> : <ShieldCheck size={14} />}
            Enable MFA
          </button>
        </div>
      )}

      <Modal open={showDisableModal} onClose={() => setShowDisableModal(false)} title="Disable MFA" accent="red" size="sm">
        <form onSubmit={handleDisable} className="space-y-4">
          <p className="text-xs text-slate-500">Enter your password to confirm disabling two-factor authentication.</p>
          <div>
            <label htmlFor="mfaDisablePassword" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
            <input
              id="mfaDisablePassword"
              type="password"
              value={disablePassword}
              onChange={e => setDisablePassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-slate-50"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={!disablePassword || disabling}
            className="w-full flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition"
          >
            {disabling ? <TumblerSpinner size={14} /> : <Lock size={14} />}
            Disable MFA
          </button>
        </form>
      </Modal>
    </div>
  );
}

const ROLE_BADGE = {
  admin:      'bg-slate-100 text-slate-700',
  superadmin: 'bg-amber-100 text-amber-700',
  dispatcher: 'bg-blue-100 text-blue-700',
};

const TABS = [
  { id: 'users', label: 'Admin Users' },
  { id: 'pin',   label: 'Edit PIN'    },
  { id: 'mfa',   label: 'MFA'         },
];

export default function AdminUsersSetup() {
  const { notify } = useNotification();
  const { user: me } = useAuth();

  const [activeTab, setActiveTab] = useState('users');

  const { data: users, loading, refetch: load } = useApiResource('/admin-users', { initialData: [] });
  const [search, setSearch]             = useState('');

  const addModal = useDisclosure();
  const [newUser, setNewUser]           = useState({ username: '', password: '', role: 'admin' });
  const [showNewPw, setShowNewPw]       = useState(false);

  const [editUser, setEditUser]         = useState(null);
  const [editForm, setEditForm]         = useState({ username: '', password: '', role: 'admin', isActive: true });
  const [showEditPw, setShowEditPw]     = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const [togglingId, setTogglingId]     = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(null); // user pending enable/disable

  const [mfaTogglingId, setMfaTogglingId] = useState(null);
  const [confirmMfaRequire, setConfirmMfaRequire] = useState(null); // user pending mfaRequired toggle

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  }, [users, search]);

  // ── Create ──────────────────────────────────────────────────────────────────
  const { mutate: createUser, loading: submitting } = useMutation(
    (data) => api.post('/admin-users', data),
    {
      onSuccess: (_res, data) => {
        notify(`${ROLE_LABEL[data.role] ?? 'User'} created successfully`, 'success');
        setNewUser({ username: '', password: '', role: 'admin' });
        setShowNewPw(false);
        addModal.close();
        load();
      },
    }
  );

  const handleCreate = (e) => {
    e.preventDefault();
    createUser(newUser);
  };

  // ── Quick enable / disable ───────────────────────────────────────────────────
  const { mutate: toggleActive, loading: toggling } = useMutation(
    (u) => api.put(`/admin-users/${u.id}`, { username: u.username, role: u.role, isActive: !u.isActive }),
    {
      onSuccess: (_res, u) => {
        notify(`${ROLE_LABEL[u.role] ?? 'User'} "${u.username}" ${!u.isActive ? 'enabled' : 'disabled'}`, 'success');
        setTogglingId(null);
        load();
      },
    }
  );

  const handleToggleActive = (u) => {
    setTogglingId(u.id);
    toggleActive(u);
  };

  const confirmToggleActive = (u) => setConfirmToggle(u);

  // ── Require MFA (forces/lifts MFA on another admin/superadmin account) ──────
  const { mutate: setMfaRequired, loading: mfaRequiring } = useMutation(
    (u) => api.put(`/admin-users/${u.id}/mfa-required`, { required: !u.mfaRequired }),
    {
      onSuccess: (_res, u) => {
        notify(
          `MFA ${!u.mfaRequired ? 'required' : 'no longer required'} for "${u.username}"`,
          'success'
        );
        setMfaTogglingId(null);
        load();
      },
    }
  );

  const handleSetMfaRequired = (u) => {
    setMfaTogglingId(u.id);
    setMfaRequired(u);
  };

  const confirmSetMfaRequired = (u) => setConfirmMfaRequire(u);

  // ── Edit ────────────────────────────────────────────────────────────────────
  function openEdit(u) {
    setEditUser(u);
    setEditForm({ username: u.username, password: '', role: u.role, isActive: u.isActive });
    setShowEditPw(false);
  }

  const { mutate: updateUser, loading: saving } = useMutation(
    ({ id, payload }) => api.put(`/admin-users/${id}`, payload),
    {
      onSuccess: (_res, { payload }) => {
        notify(`${ROLE_LABEL[payload.role] ?? 'User'} "${payload.username}" updated`, 'success');
        setEditUser(null);
        load();
      },
    }
  );

  const handleUpdate = (e) => {
    e.preventDefault();
    const payload = { username: editForm.username, role: editForm.role, isActive: editForm.isActive };
    if (editForm.password) payload.password = editForm.password;
    updateUser({ id: editUser.id, payload });
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const { mutate: deleteUser, loading: deleting } = useMutation(
    () => api.delete(`/admin-users/${deleteTarget.id}`),
    {
      onSuccess: () => {
        notify(`${ROLE_LABEL[deleteTarget.role] ?? 'User'} "${deleteTarget.username}" deleted`, 'success');
        setDeleteTarget(null);
        load();
      },
    }
  );

  const handleDelete = () => deleteUser();

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50">
      <LoadingOverlay
        open={submitting || saving || deleting}
        message={deleting ? 'Deleting user…' : submitting ? 'Creating user…' : 'Updating user…'}
      />


      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Admin Users</h1>
            <p className="text-emerald-300 text-xs">Manage admin, super admin and dispatcher accounts</p>
          </div>
        </div>
        {activeTab === 'users' && (
          <button
            onClick={addModal.open}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition"
          >
            <Plus size={14} /> Add User
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 px-4 md:px-6 pt-3 bg-white border-b border-slate-200">
        <div className="flex gap-1 max-w-3xl mx-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.id === 'pin' && <Lock size={12} />}
              {tab.id === 'mfa' && <ShieldCheck size={12} />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Outer wrapper: scrollable column */}
      <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-4 p-4 md:p-6 max-w-3xl mx-auto w-full">

        {activeTab === 'users' && (
          <>
            {/* Search — never scrolls away */}
            <div className="relative flex-shrink-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by username or role…"
                className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* User list */}
            {loading ? (
              <BrandedLoader />
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                {filtered.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-10">No admin users found</p>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="bg-emerald-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wider">Username</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wider">Role</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wider">Status</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wider">MFA</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-bold text-white uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((u, idx) => (
                        <tr key={u.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                          <td className="px-4 py-3 font-medium text-slate-800">{u.username}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full ${ROLE_BADGE[u.role] ?? 'bg-slate-100 text-slate-600'}`}>
                              {ROLE_LABEL[u.role] ?? u.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                              {u.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {u.role === 'dispatcher' ? (
                              <span className="text-slate-300 text-xs">—</span>
                            ) : (
                              <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                                u.mfaEnabled ? 'bg-emerald-100 text-emerald-700'
                                : u.mfaRequired ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-500'
                              }`}>
                                {u.mfaEnabled ? 'On' : u.mfaRequired ? 'Required' : 'Off'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Require/lift MFA on someone else's account — never your own (use the MFA tab), never a dispatcher (not eligible) */}
                              {u.role !== 'dispatcher' && (
                                <button
                                  onClick={() => confirmSetMfaRequired(u)}
                                  disabled={u.id === me?.adminUserId || mfaTogglingId === u.id}
                                  title={u.mfaRequired ? `Stop requiring MFA for ${u.username}` : `Require MFA for ${u.username}`}
                                  className={`p-1.5 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed ${
                                    u.mfaRequired
                                      ? 'text-amber-600 hover:text-slate-500 hover:bg-slate-50'
                                      : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                  }`}
                                >
                                  {mfaTogglingId === u.id && mfaRequiring
                                    ? <TumblerSpinner size={14} />
                                    : u.mfaRequired
                                    ? <ShieldOff size={14} />
                                    : <ShieldCheck size={14} />
                                  }
                                </button>
                              )}
                              {/* Enable / disable — confirmed, since disabling revokes login immediately */}
                              <button
                                onClick={() => confirmToggleActive(u)}
                                disabled={u.id === me?.adminUserId || togglingId === u.id}
                                title={u.isActive ? `Disable ${u.username}` : `Enable ${u.username}`}
                                className={`p-1.5 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed ${
                                  u.isActive
                                    ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                    : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                                }`}
                              >
                                {togglingId === u.id && toggling
                                  ? <TumblerSpinner size={14} />
                                  : u.isActive
                                  ? <UserX size={14} />
                                  : <UserCheck size={14} />
                                }
                              </button>
                              <button
                                onClick={() => openEdit(u)}
                                title="Edit user"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(u)}
                                disabled={u.id === me?.adminUserId}
                                title="Delete user"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}

        {/* ── PIN tab ─────────────────────────────────────────────────────────── */}
        {activeTab === 'pin' && (
          <>
            <ChangePinSection />
            <PlPinToggleSection />
          </>
        )}

        {/* ── MFA tab ─────────────────────────────────────────────────────────── */}
        {activeTab === 'mfa' && <MfaSection />}

      </div>
      </div>

      {/* ── Add modal ─────────────────────────────────────────────────────────── */}
      <Modal
        open={addModal.isOpen}
        onClose={addModal.close}
        title="Add User"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={addModal.close}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={submitting || !newUser.username || !newUser.password}>
              {submitting ? <TumblerSpinner size={14} /> : <Plus size={14} />}
              Create
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Username</label>
            <input
              type="text"
              value={newUser.username}
              onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
              placeholder="e.g. john_admin"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showNewPw ? 'text' : 'password'}
                value={newUser.password}
                onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                placeholder="Min 6 characters"
                className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
              />
              <button type="button" onClick={() => setShowNewPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
            <select
              value={newUser.role}
              onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
            >
              <option value="admin">Admin</option>
              <option value="superadmin">Super Admin</option>
              <option value="dispatcher">Dispatcher</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* ── Edit modal ────────────────────────────────────────────────────────── */}
      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title={`Edit — ${editUser?.username}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleUpdate} disabled={saving || !editForm.username}>
              {saving ? <TumblerSpinner size={14} /> : <Save size={14} />}
              Save
            </Button>
          </>
        }
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Username</label>
            <input
              type="text"
              value={editForm.username}
              onChange={e => setEditForm(p => ({ ...p, username: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              New Password <span className="normal-case font-normal text-slate-400">(leave blank to keep current)</span>
            </label>
            <div className="relative">
              <input
                type={showEditPw ? 'text' : 'password'}
                value={editForm.password}
                onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))}
                placeholder="Min 6 characters"
                className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
              />
              <button type="button" onClick={() => setShowEditPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showEditPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
            <select
              value={editForm.role}
              onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}
              disabled={editUser?.id === me?.adminUserId}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 disabled:opacity-60"
            >
              <option value="admin">Admin</option>
              <option value="superadmin">Super Admin</option>
              <option value="dispatcher">Dispatcher</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700">Active</label>
            <button
              type="button"
              onClick={() => setEditForm(p => ({ ...p, isActive: !p.isActive }))}
              disabled={editUser?.id === me?.adminUserId}
              className={`relative w-10 h-5 rounded-full transition-colors ${editForm.isActive ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-50`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editForm.isActive ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete confirm ────────────────────────────────────────────────────── */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete admin user?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? <TumblerSpinner size={14} /> : <Trash2 size={14} />}
              Delete
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-slate-600">
            Delete <span className="font-semibold text-slate-800">{deleteTarget?.username}</span>?
            This action cannot be undone.
          </p>
        </div>
      </Modal>

      {/* ── Enable / Disable confirmation ─────────────────────────────────────── */}
      <ConfirmationModal
        isOpen={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        onConfirm={() => handleToggleActive(confirmToggle)}
        title={confirmToggle?.isActive ? 'Disable Admin User' : 'Enable Admin User'}
        message={
          confirmToggle?.isActive
            ? `Disable "${confirmToggle?.username}"? They will lose login access immediately. Their account and data stay safe and can be re-enabled anytime.`
            : `Enable "${confirmToggle?.username}"? They will regain login access immediately.`
        }
        confirmText={confirmToggle?.isActive ? 'Disable' : 'Enable'}
        tone={confirmToggle?.isActive ? 'warning' : 'success'}
      />

      {/* ── Require/lift MFA confirmation ─────────────────────────────────────── */}
      <ConfirmationModal
        isOpen={!!confirmMfaRequire}
        onClose={() => setConfirmMfaRequire(null)}
        onConfirm={() => handleSetMfaRequired(confirmMfaRequire)}
        title={confirmMfaRequire?.mfaRequired ? 'Stop Requiring MFA' : 'Require MFA'}
        message={
          confirmMfaRequire?.mfaRequired
            ? `Stop requiring MFA for "${confirmMfaRequire?.username}"? Any MFA enrollment on their account will also be cleared — they'll log in with just their password again.`
            : `Require MFA for "${confirmMfaRequire?.username}"? They'll be asked to set up an authenticator app the next time they log in, before they can access anything.`
        }
        confirmText={confirmMfaRequire?.mfaRequired ? 'Stop Requiring' : 'Require MFA'}
        tone={confirmMfaRequire?.mfaRequired ? 'warning' : 'success'}
      />
    </div>
  );
}
