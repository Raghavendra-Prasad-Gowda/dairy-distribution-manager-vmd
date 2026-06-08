import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Eye, EyeOff, Loader2, Save, X, ShieldCheck, Search, Trash2, AlertTriangle } from 'lucide-react';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import BrandedLoader from '../../components/ui/BrandedLoader';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

const ROLE_LABEL = { admin: 'Admin', superadmin: 'Super Admin' };
const ROLE_BADGE = {
  admin:      'bg-slate-100 text-slate-700',
  superadmin: 'bg-amber-100 text-amber-700',
};

export default function AdminUsersSetup() {
  const { notify } = useNotification();
  const { user: me } = useAuth();

  const [users, setUsers]               = useState([]);
  const [dairies, setDairies]           = useState([]);
  const [loading, setLoading]           = useState(false);
  const [search, setSearch]             = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser]           = useState({ username: '', password: '', role: 'admin', dairyId: '' });
  const [showNewPw, setShowNewPw]       = useState(false);
  const [submitting, setSubmitting]     = useState(false);

  const [editUser, setEditUser]         = useState(null);
  const [editForm, setEditForm]         = useState({ username: '', password: '', role: 'admin', isActive: true, dairyId: '' });
  const [showEditPw, setShowEditPw]     = useState(false);
  const [saving, setSaving]             = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);

  useEffect(() => { load(); loadDairies(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/admin-users');
      setUsers(r.data.data);
    } catch {
      notify('Failed to load admin users', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadDairies() {
    try {
      const r = await api.get('/dairies');
      setDairies(r.data.data.filter(d => d.isActive));
    } catch {
      // non-critical
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (u.dairy?.name ?? '').toLowerCase().includes(q)
    );
  }, [users, search]);

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        username: newUser.username,
        password: newUser.password,
        role:     newUser.role,
        dairyId:  newUser.dairyId ? Number(newUser.dairyId) : null,
      };
      await api.post('/admin-users', payload);
      notify('Admin user created', 'success');
      setNewUser({ username: '', password: '', role: 'admin', dairyId: '' });
      setShowNewPw(false);
      setShowAddModal(false);
      load();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to create user', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Edit ────────────────────────────────────────────────────────────────────
  function openEdit(u) {
    setEditUser(u);
    setEditForm({ username: u.username, password: '', role: u.role, isActive: u.isActive, dairyId: u.dairyId ? String(u.dairyId) : '' });
    setShowEditPw(false);
  }

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        username: editForm.username,
        role:     editForm.role,
        isActive: editForm.isActive,
        dairyId:  editForm.dairyId ? Number(editForm.dairyId) : null,
      };
      if (editForm.password) payload.password = editForm.password;
      await api.put(`/admin-users/${editUser.id}`, payload);
      notify('Admin user updated', 'success');
      setEditUser(null);
      load();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to update user', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/admin-users/${deleteTarget.id}`);
      notify('Admin user deleted', 'success');
      setDeleteTarget(null);
      load();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to delete user', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50">
      <LoadingOverlay open={submitting || saving || deleting} message="Saving…" />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Admin Users</h1>
            <p className="text-emerald-300 text-xs">Manage admin and super admin accounts</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition"
        >
          <Plus size={14} /> Add Admin
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-3xl mx-auto w-full space-y-4">

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by username or role…"
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* User list */}
        {loading ? (
          <BrandedLoader />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            {filtered.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-10">No admin users found</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-emerald-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wider">Username</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wider">Role</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wider hidden sm:table-cell">Dairy</th>
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
                      <td className="px-4 py-3 text-slate-500 text-xs hidden sm:table-cell">
                        {u.dairy?.name ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(u)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(u)}
                            disabled={u.id === me?.adminUserId}
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
      </div>

      {/* ── Add modal ─────────────────────────────────────────────────────────── */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Admin User"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={submitting || !newUser.username || !newUser.password}>
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
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
            </select>
          </div>
          {newUser.role === 'admin' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Dairy</label>
              <select
                value={newUser.dairyId}
                onChange={e => setNewUser(p => ({ ...p, dairyId: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
              >
                <option value="">— No dairy assigned —</option>
                {dairies.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
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
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
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
            </select>
          </div>
          {editForm.role === 'admin' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Dairy</label>
              <select
                value={editForm.dairyId}
                onChange={e => setEditForm(p => ({ ...p, dairyId: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
              >
                <option value="">— No dairy assigned —</option>
                {dairies.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
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
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
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
    </div>
  );
}
