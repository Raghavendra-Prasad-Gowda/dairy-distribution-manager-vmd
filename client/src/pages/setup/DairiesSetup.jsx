import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Loader2, Save, X, Store, Search, AlertTriangle } from 'lucide-react';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import BrandedLoader from '../../components/ui/BrandedLoader';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

export default function DairiesSetup() {
  const { notify } = useNotification();

  const [dairies, setDairies]           = useState([]);
  const [loading, setLoading]           = useState(false);
  const [search, setSearch]             = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [newDairy, setNewDairy]         = useState({ name: '', phone: '', address: '' });
  const [submitting, setSubmitting]     = useState(false);

  const [editDairy, setEditDairy]       = useState(null);
  const [editForm, setEditForm]         = useState({ name: '', phone: '', address: '', isActive: true });
  const [saving, setSaving]             = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/dairies');
      setDairies(r.data.data);
    } catch {
      notify('Failed to load dairies', 'error');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dairies;
    return dairies.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.phone ?? '').toLowerCase().includes(q) ||
      (d.address ?? '').toLowerCase().includes(q)
    );
  }, [dairies, search]);

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/dairies', {
        name:    newDairy.name.trim(),
        phone:   newDairy.phone.trim() || null,
        address: newDairy.address.trim() || null,
      });
      notify('Dairy created', 'success');
      setNewDairy({ name: '', phone: '', address: '' });
      setShowAddModal(false);
      load();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to create dairy', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Edit ────────────────────────────────────────────────────────────────────
  function openEdit(d) {
    setEditDairy(d);
    setEditForm({ name: d.name, phone: d.phone ?? '', address: d.address ?? '', isActive: d.isActive });
  }

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/dairies/${editDairy.id}`, {
        name:     editForm.name.trim(),
        phone:    editForm.phone.trim() || null,
        address:  editForm.address.trim() || null,
        isActive: editForm.isActive,
      });
      notify('Dairy updated', 'success');
      setEditDairy(null);
      load();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to update dairy', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50">
      <LoadingOverlay open={submitting || saving} message="Saving…" />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Store size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Dairies</h1>
            <p className="text-emerald-300 text-xs">Manage dairy businesses</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition"
        >
          <Plus size={14} /> Add Dairy
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
            placeholder="Search by name, phone, or address…"
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Dairy list */}
        {loading ? (
          <BrandedLoader />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            {filtered.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-10">No dairies found</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-emerald-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wider">Name</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wider hidden sm:table-cell">Phone</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wider hidden md:table-cell">Address</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-bold text-white uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d, idx) => (
                    <tr key={d.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                      <td className="px-4 py-3 font-medium text-slate-800">{d.name}</td>
                      <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{d.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell max-w-xs truncate">{d.address ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full ${d.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                          {d.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openEdit(d)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
                        >
                          <Edit2 size={14} />
                        </button>
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
        title="Add Dairy"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={submitting || !newDairy.name.trim()}>
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Dairy Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newDairy.name}
              onChange={e => setNewDairy(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Vikas Milk Dairy"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Phone</label>
            <input
              type="text"
              value={newDairy.phone}
              onChange={e => setNewDairy(p => ({ ...p, phone: e.target.value }))}
              placeholder="e.g. +91 98765 43210"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Address</label>
            <textarea
              value={newDairy.address}
              onChange={e => setNewDairy(p => ({ ...p, address: e.target.value }))}
              placeholder="Full address…"
              rows={3}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 resize-none"
            />
          </div>
        </form>
      </Modal>

      {/* ── Edit modal ────────────────────────────────────────────────────────── */}
      <Modal
        open={!!editDairy}
        onClose={() => setEditDairy(null)}
        title={`Edit — ${editDairy?.name}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditDairy(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleUpdate} disabled={saving || !editForm.name.trim()}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </Button>
          </>
        }
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Dairy Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Phone</label>
            <input
              type="text"
              value={editForm.phone}
              onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Address</label>
            <textarea
              value={editForm.address}
              onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 resize-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700">Active</label>
            <button
              type="button"
              onClick={() => setEditForm(p => ({ ...p, isActive: !p.isActive }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${editForm.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editForm.isActive ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
