import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Eye, EyeOff, Loader2, Save, X, Users, Search, Trash2, AlertTriangle, GripVertical, ArrowUpDown } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Pagination from '../../components/Pagination';
import ConfirmationModal from '../../components/ConfirmationModal';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { useNotification } from '../../context/NotificationContext';
import { useApiResource } from '../../hooks/useApiResource';
import { useMutation } from '../../hooks/useMutation';
import { useDisclosure } from '../../hooks/useDisclosure';
import api from '../../api/axios';

function SortableSpRow({ sp }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sp.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2.5 select-none"
    >
      <button
        {...attributes}
        {...listeners}
        style={{ touchAction: 'none' }}
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing p-0.5"
      >
        <GripVertical size={16} />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{sp.name}</p>
        {sp.route && <p className="text-xs text-slate-400 truncate">{sp.route}</p>}
      </div>
      {!sp.isActive && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex-shrink-0">Inactive</span>}
    </div>
  );
}

const ITEMS_PER_PAGE = 10;


export default function SalesmanUsersSetup() {
  const { notify } = useNotification();
  const { data: salespeople, loading, refetch: loadSalespeople, setData: setSalespeople } =
    useApiResource('/salespeople?all=true', { initialData: [] });
  const addModal = useDisclosure();
  const pwModal = useDisclosure();
  const deleteModal = useDisclosure();
  const [deletingSpId, setDeletingSpId]     = useState(null);
  const [confirmToggle, setConfirmToggle]   = useState(null); // salesperson pending enable/disable
  const [editingSp, setEditingSp]           = useState(null);
  const [newSp, setNewSp]                   = useState({ name: '', phone: '', route: '', username: '', password: '' });
  const [showNewPw, setShowNewPw]           = useState(false);
  const [pwForm, setPwForm]                 = useState({ username: '', password: '', confirmPassword: '' });
  const [showPw, setShowPw]                 = useState(false);
  const [search, setSearch]                 = useState('');
  const [currentPage, setCurrentPage]       = useState(1);
  const [reorderMode, setReorderMode]       = useState(false);
  const [reorderList, setReorderList]       = useState([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => { setCurrentPage(1); }, [search]);

  const enterReorderMode = () => {
    setReorderList([...salespeople]);
    setReorderMode(true);
  };

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setReorderList(prev => {
      const from = prev.findIndex(s => s.id === active.id);
      const to   = prev.findIndex(s => s.id === over.id);
      return arrayMove(prev, from, to);
    });
  };

  const { mutate: saveOrder, loading: savingOrder } = useMutation(
    (list) => api.put('/salespeople/reorder', list.map((sp, i) => ({ id: sp.id, displayOrder: i }))),
    {
      successMessage: 'Display order saved',
      onSuccess: () => { setReorderMode(false); loadSalespeople(); },
    }
  );

  const handleSaveOrder = () => {
    notify('Saving display order…', 'loading');
    saveOrder(reorderList);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return salespeople;
    return salespeople.filter(sp =>
      sp.name.toLowerCase().includes(q) ||
      (sp.route ?? '').toLowerCase().includes(q) ||
      (sp.phone ?? '').toLowerCase().includes(q) ||
      (sp.username ?? '').toLowerCase().includes(q)
    );
  }, [salespeople, search]);

  const totalFiltered = filtered.length;
  const totalPages    = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const startIdx      = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIdx        = Math.min(startIdx + ITEMS_PER_PAGE, totalFiltered);
  const paged         = filtered.slice(startIdx, endIdx);

  const { mutate: addSalesperson, loading: submitting } = useMutation(
    (payload) => api.post('/salespeople', payload),
    {
      successMessage: 'Salesperson added',
      onSuccess: () => {
        setNewSp({ name: '', phone: '', route: '', username: '', password: '' });
        setShowNewPw(false);
        addModal.close();
        loadSalespeople();
      },
    }
  );

  const handleAddSalesperson = (e) => {
    e.preventDefault();
    if (newSp.username && !newSp.password) { notify('Password is required when setting a username', 'warning'); return; }
    if (!newSp.username && newSp.password) { notify('Username is required when setting a password', 'warning'); return; }
    notify('Adding salesperson…', 'loading');
    const payload = { name: newSp.name, phone: newSp.phone || undefined, route: newSp.route || undefined };
    if (newSp.username) { payload.username = newSp.username; payload.password = newSp.password; }
    addSalesperson(payload);
  };

  const { mutate: toggleActive } = useMutation(
    (sp) => api.put(`/salespeople/${sp.id}`, { isActive: !sp.isActive }),
    {
      onSuccess: (_res, sp) => {
        setSalespeople(prev => prev.map(s => s.id === sp.id ? { ...s, isActive: !s.isActive } : s));
        notify(sp.isActive ? 'Salesperson deactivated' : 'Salesperson activated', 'success');
      },
    }
  );

  const handleToggleActive = (sp) => {
    notify(sp.isActive ? 'Deactivating salesperson…' : 'Activating salesperson…', 'loading');
    toggleActive(sp);
  };

  const confirmToggleActive = (sp) => setConfirmToggle(sp);

  const openDeleteConfirm = (sp) => {
    setDeletingSpId(sp.id);
    deleteModal.open();
  };

  const { mutate: deleteSalesperson, loading: deleting } = useMutation(
    (id) => api.delete(`/salespeople/${id}`),
    {
      successMessage: 'Salesperson deleted',
      onSuccess: () => { deleteModal.close(); setDeletingSpId(null); loadSalespeople(); },
    }
  );

  const handleDelete = () => {
    notify('Deleting salesperson…', 'loading');
    deleteSalesperson(deletingSpId);
  };

  const openCredentials = (sp) => {
    setEditingSp(sp);
    setPwForm({ username: sp.username ?? '', password: '', confirmPassword: '' });
    setShowPw(false);
    pwModal.open();
  };

  const { mutate: saveCredentials, loading: savingPw } = useMutation(
    ({ id, payload }) => api.put(`/salespeople/${id}`, payload),
    {
      successMessage: 'Credentials updated',
      onSuccess: () => { pwModal.close(); setEditingSp(null); loadSalespeople(); },
    }
  );

  const handleSaveCredentials = (e) => {
    e.preventDefault();
    if (pwForm.password && pwForm.password !== pwForm.confirmPassword) {
      notify('Passwords do not match', 'warning'); return;
    }
    notify('Updating credentials…', 'loading');
    const payload = {};
    if (pwForm.username !== (editingSp.username ?? '')) payload.username = pwForm.username || null;
    if (pwForm.password) payload.password = pwForm.password;
    if (Object.keys(payload).length === 0) { notify('No changes to save', 'warning'); return; }
    saveCredentials({ id: editingSp.id, payload });
  };

  const deletingSp = salespeople.find(s => s.id === deletingSpId);

  return (
    <div className="flex flex-col h-full">

      <LoadingOverlay open={submitting} message="Adding salesperson…" />

      {/* Add salesperson modal */}
      {addModal.isOpen && (
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
              <button onClick={addModal.close} className="p-1.5 text-emerald-300 hover:text-white hover:bg-emerald-700 rounded-lg transition">
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
                <button type="button" onClick={addModal.close} className="flex-1 px-4 py-2.5 text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition">
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
      {pwModal.isOpen && editingSp && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" style={{ animation: 'popIn 0.2s ease' }}>
            <div className="flex items-center justify-between px-5 py-4 bg-emerald-800 rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-700 flex items-center justify-center">
                  <Edit2 size={15} className="text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">Login Credentials</p>
                  <p className="text-emerald-300 text-[11px]">{editingSp.name}</p>
                </div>
              </div>
              <button onClick={pwModal.close} className="p-1.5 text-emerald-300 hover:text-white hover:bg-emerald-700 rounded-lg transition">
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
                <button type="button" onClick={pwModal.close} className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl hover:bg-slate-50 transition text-sm">
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

      {/* Delete confirmation modal */}
      {deleteModal.isOpen && deletingSp && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" style={{ animation: 'popIn 0.2s ease' }}>
            <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle size={22} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete {deletingSp.name}?</h3>
                <p className="text-slate-500 text-sm mt-1">This will permanently remove the salesperson. This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => { deleteModal.close(); setDeletingSpId(null); }}
                className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl hover:bg-slate-50 transition text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enable / disable confirmation */}
      <ConfirmationModal
        isOpen={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        onConfirm={() => handleToggleActive(confirmToggle)}
        title={confirmToggle?.isActive ? 'Disable Salesperson' : 'Enable Salesperson'}
        message={
          confirmToggle?.isActive
            ? `Disable "${confirmToggle?.name}"? They will be hidden from stock entry, dispatch, and reports. Their data stays safe and reappears if you enable them again.`
            : `Enable "${confirmToggle?.name}"? They will reappear across stock entry, dispatch, and reports.`
        }
        confirmText={confirmToggle?.isActive ? 'Disable' : 'Enable'}
        tone={confirmToggle?.isActive ? 'warning' : 'success'}
      />

      {/* Page header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Users size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Salesman Users</h1>
            <p className="text-emerald-300 text-xs">
              {reorderMode ? 'Drag to set the display order for all views' : 'Manage salesman accounts, login credentials, and active status'}
            </p>
          </div>
        </div>
        {reorderMode ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setReorderMode(false)}
              className="flex items-center gap-1.5 text-xs font-bold text-white border border-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition"
            >
              <X size={14} /> Cancel
            </button>
            <button
              onClick={handleSaveOrder}
              disabled={savingOrder}
              className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 disabled:opacity-60 px-3 py-1.5 rounded-lg transition"
            >
              {savingOrder ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Order
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={enterReorderMode}
              className="flex items-center gap-1.5 text-xs font-bold text-white border border-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition"
            >
              <ArrowUpDown size={14} /> Reorder
            </button>
            <button
              onClick={addModal.open}
              className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition"
            >
              <Plus size={14} /> Add Salesperson
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 md:p-8 max-w-4xl mx-auto space-y-5">

          {/* Reorder mode */}
          {reorderMode && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 mb-3">Drag rows to set the order. This affects all tables, dropdowns, and reports.</p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={reorderList.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {reorderList.map(sp => <SortableSpRow key={sp.id} sp={sp} />)}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          {/* Normal view — hidden while reordering */}
          {!reorderMode && <>

          {/* Search */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, route, phone or username…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-9 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <Pagination
            currentPage={currentPage} totalPages={totalPages}
            startIndex={startIdx} endIndex={endIdx} total={totalFiltered}
            onPageChange={setCurrentPage}
          />

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-emerald-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Route / Phone</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-36">Login</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={4}><BrandedLoader size="sm" hideBrand inlinePadY="py-12" /></td></tr>
                  ) : paged.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-14 text-center text-slate-400 text-sm">
                        {search ? 'No salespeople match your search.' : 'No salespeople yet. Click Add Salesperson to get started.'}
                      </td>
                    </tr>
                  ) : (
                    paged.map(sp => (
                      <tr key={sp.id} className={`transition-colors hover:bg-slate-50 ${!sp.isActive ? 'opacity-60' : ''}`}>
                        <td className="px-6 py-4 align-middle">
                          <p className="text-sm font-semibold text-slate-800">{sp.name}</p>
                        </td>
                        <td className="px-6 py-4 align-middle">
                          {sp.route && <p className="text-sm text-slate-600">{sp.route}</p>}
                          {sp.phone && <p className="text-xs text-slate-400 mt-0.5">{sp.phone}</p>}
                          {!sp.route && !sp.phone && <span className="text-slate-300 text-sm">—</span>}
                        </td>
                        <td className="px-6 py-4 text-center align-middle whitespace-nowrap">
                          {sp.username
                            ? <span className="inline-block text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">@{sp.username}</span>
                            : <span className="inline-block text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold">No login</span>
                          }
                        </td>
                        <td className="px-4 py-4 text-center align-middle">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => openCredentials(sp)}
                              title="Edit credentials"
                              className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => confirmToggleActive(sp)}
                              className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition ${
                                sp.isActive
                                  ? 'bg-white border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600'
                                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                              }`}
                            >
                              {sp.isActive ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => openDeleteConfirm(sp)}
                              title="Delete salesperson"
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            >
                              <Trash2 size={15} />
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

          </>}

        </div>
      </div>
    </div>
  );
}
