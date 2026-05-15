import { useState, useEffect } from 'react';
import { Plus, Key, Eye, EyeOff, Loader2, Save, X, Users, ToggleLeft, ToggleRight } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

export default function SalesmanUsersSetup() {
  const { notify } = useNotification();
  const [salespeople, setSalespeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [editingSp, setEditingSp] = useState(null);
  const [newSp, setNewSp] = useState({ name: '', phone: '', route: '', username: '', password: '' });
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwForm, setPwForm] = useState({ username: '', password: '', confirmPassword: '' });
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => { loadSalespeople(); }, []);

  async function loadSalespeople() {
    setLoading(true);
    try {
      const r = await api.get('/salespeople?all=true');
      setSalespeople(r.data.data);
    } catch {
      notify('Failed to load salespeople', 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleAddSalesperson = async (e) => {
    e.preventDefault();
    if (newSp.username && !newSp.password) { notify('Password is required when setting a username', 'warning'); return; }
    if (!newSp.username && newSp.password) { notify('Username is required when setting a password', 'warning'); return; }
    setSubmitting(true);
    try {
      const payload = { name: newSp.name, phone: newSp.phone || undefined, route: newSp.route || undefined };
      if (newSp.username) { payload.username = newSp.username; payload.password = newSp.password; }
      await api.post('/salespeople', payload);
      notify('Salesperson added', 'success');
      setNewSp({ name: '', phone: '', route: '', username: '', password: '' });
      setShowNewPw(false);
      setShowAddModal(false);
      loadSalespeople();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to add salesperson', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (sp) => {
    try {
      await api.put(`/salespeople/${sp.id}`, { isActive: !sp.isActive });
      notify(`${sp.name} ${sp.isActive ? 'deactivated' : 'activated'}`, 'success');
      loadSalespeople();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to update', 'error');
    }
  };

  const openCredentials = (sp) => {
    setEditingSp(sp);
    setPwForm({ username: sp.username ?? '', password: '', confirmPassword: '' });
    setShowPw(false);
    setShowPwModal(true);
  };

  const handleSaveCredentials = async (e) => {
    e.preventDefault();
    if (pwForm.password && pwForm.password !== pwForm.confirmPassword) {
      notify('Passwords do not match', 'warning'); return;
    }
    setSavingPw(true);
    try {
      const payload = {};
      if (pwForm.username !== (editingSp.username ?? '')) payload.username = pwForm.username || null;
      if (pwForm.password) payload.password = pwForm.password;
      if (Object.keys(payload).length === 0) { notify('No changes to save', 'warning'); setSavingPw(false); return; }
      await api.put(`/salespeople/${editingSp.id}`, payload);
      notify('Credentials updated', 'success');
      setShowPwModal(false);
      setEditingSp(null);
      loadSalespeople();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to update credentials', 'error');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="flex flex-col h-full">

      {submitting && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Saving…</p>
          </div>
        </div>
      )}

      {/* Add salesperson modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[92vh]" style={{ animation: 'popIn 0.2s ease' }}>
            <div className="flex items-center justify-between px-5 py-4 bg-emerald-800 rounded-t-2xl flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-700 flex items-center justify-center">
                  <Users size={15} className="text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">New Salesperson</p>
                  <p className="text-emerald-300 text-[11px]">Fill in the details below</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 text-emerald-300 hover:text-white hover:bg-emerald-700 rounded-lg transition">
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleAddSalesperson} className="overflow-y-auto flex-1">
              <div className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { key: 'name',  label: 'Full Name',   req: true,  placeholder: 'e.g. Ramu' },
                    { key: 'phone', label: 'Phone',        req: false, placeholder: '+91 XXXXX' },
                    { key: 'route', label: 'Route / Area', req: false, placeholder: 'e.g. North Zone' },
                  ].map(({ key, label, req, placeholder }) => (
                    <div key={key}>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                        {label}{req && <span className="text-red-400 ml-1">*</span>}
                      </label>
                      <input
                        value={newSp[key]}
                        onChange={e => setNewSp(p => ({ ...p, [key]: e.target.value }))}
                        required={req}
                        placeholder={placeholder}
                        className="ddm-input w-full"
                      />
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Login Credentials (optional)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Username</label>
                      <input
                        type="text"
                        value={newSp.username}
                        onChange={e => setNewSp(p => ({ ...p, username: e.target.value }))}
                        placeholder="e.g. ramu.k"
                        autoComplete="username"
                        className="ddm-input w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Password</label>
                      <div className="relative">
                        <input
                          type={showNewPw ? 'text' : 'password'}
                          value={newSp.password}
                          onChange={e => setNewSp(p => ({ ...p, password: e.target.value }))}
                          placeholder="Min 6 characters"
                          autoComplete="new-password"
                          className="ddm-input w-full pr-9"
                        />
                        <button type="button" onClick={() => setShowNewPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 px-5 pb-5 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2.5 text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="ddm-btn-primary flex-1 justify-center">
                  <Plus size={14} /> Add Salesperson
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit credentials modal */}
      {showPwModal && editingSp && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" style={{ animation: 'popIn 0.2s ease' }}>
            <div className="flex items-center justify-between px-5 py-4 bg-emerald-800 rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-700 flex items-center justify-center">
                  <Key size={15} className="text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">Login Credentials</p>
                  <p className="text-emerald-300 text-[11px]">{editingSp.name}</p>
                </div>
              </div>
              <button onClick={() => setShowPwModal(false)} className="p-1.5 text-emerald-300 hover:text-white hover:bg-emerald-700 rounded-lg transition">
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleSaveCredentials} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Username</label>
                <input
                  type="text"
                  value={pwForm.username}
                  onChange={e => setPwForm(p => ({ ...p, username: e.target.value }))}
                  placeholder="e.g. ramu.k"
                  autoComplete="username"
                  className="ddm-input w-full"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={pwForm.password}
                    onChange={e => setPwForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Leave blank to keep existing"
                    autoComplete="new-password"
                    className="ddm-input w-full pr-9"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Confirm Password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pwForm.confirmPassword}
                  onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  className="ddm-input w-full"
                />
              </div>
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowPwModal(false)} className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl hover:bg-slate-50 transition text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={savingPw} className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2">
                  {savingPw ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  Save Credentials
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Users size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Salesman Users</h1>
            <p className="text-emerald-300 text-xs">Manage salesman accounts, login credentials, and active status</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition flex-shrink-0"
        >
          <Plus size={14} /> Add Salesperson
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 md:p-8 max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-emerald-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Route / Phone</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Login</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-28">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center">
                        <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
                      </td>
                    </tr>
                  ) : salespeople.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-14 text-center text-slate-400 text-sm">
                        No salespeople yet. Click Add Salesperson to get started.
                      </td>
                    </tr>
                  ) : (
                    salespeople.map(sp => (
                      <tr key={sp.id} className={`transition-colors hover:bg-slate-50 ${!sp.isActive ? 'opacity-60' : ''}`}>
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-slate-800">{sp.name}</p>
                        </td>
                        <td className="px-6 py-4">
                          {sp.route && <p className="text-sm text-slate-600">{sp.route}</p>}
                          {sp.phone && <p className="text-xs text-slate-400">{sp.phone}</p>}
                          {!sp.route && !sp.phone && <span className="text-slate-300 text-sm">—</span>}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {sp.username
                            ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">@{sp.username}</span>
                            : <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold">No login</span>
                          }
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${sp.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                            {sp.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openCredentials(sp)}
                              title="Edit credentials"
                              className="p-2 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition"
                            >
                              <Key size={15} />
                            </button>
                            <button
                              onClick={() => handleToggleActive(sp)}
                              title={sp.isActive ? 'Deactivate' : 'Activate'}
                              className={`p-2 rounded-lg transition ${
                                sp.isActive
                                  ? 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                                  : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {sp.isActive ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
