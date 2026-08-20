import { useState, useMemo, useRef, useCallback } from 'react';
import { Plus, Edit2, Eye, EyeOff, Save, X, ShieldCheck, Search, Trash2, AlertTriangle, UserX, UserCheck, Lock } from 'lucide-react';
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

/** Card for changing the edit PIN — superadmin only */
function ChangePinSection() {
  const { notify } = useNotification();
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
      await api.put('/pin/update', { currentPin, newPin: nextPin });
      notify('Edit PIN changed successfully', 'success');
      setCurrent(emptyPin());
      setNext(emptyPin());
      setConfirm(emptyPin());
    } catch (err) {
      const msg = err?.response?.data?.error ?? 'Failed to change PIN';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ddm-card p-5">
      <div className="flex items-center gap-2.5 mb-4 pb-3.5 border-b border-slate-100">
        <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <Lock size={15} className="text-emerald-700" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800">Change Edit PIN</p>
          <p className="text-xs text-slate-400">The PIN used to edit or delete payments</p>
        </div>
      </div>

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
          className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition"
        >
          {saving ? <TumblerSpinner size={14} /> : <Save size={14} />}
          Change PIN
        </button>
      </form>
    </div>
  );
}
const ROLE_BADGE = {
  admin:      'bg-slate-100 text-slate-700',
  superadmin: 'bg-amber-100 text-amber-700',
  dispatcher: 'bg-blue-100 text-blue-700',
};

export default function AdminUsersSetup() {
  const { notify } = useNotification();
  const { user: me } = useAuth();

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
        <button
          onClick={addModal.open}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition"
        >
          <Plus size={14} /> Add User
        </button>
      </div>

      {/* Outer wrapper: scrollable column */}
      <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-4 p-4 md:p-6 max-w-3xl mx-auto w-full">

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
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
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

        {/* ── Change edit PIN — superadmin only ──────────────────────────────── */}
        <ChangePinSection />

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
    </div>
  );
}
