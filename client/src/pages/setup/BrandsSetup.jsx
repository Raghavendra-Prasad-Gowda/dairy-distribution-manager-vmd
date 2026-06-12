import { useState, useEffect } from 'react';
import { Store, Plus, Pencil, X, EyeOff, Eye } from 'lucide-react';
import BrandedLoader from '../../components/ui/BrandedLoader';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { getBrandColors } from '../../utils/constants';
import api from '../../api/axios';

// ── Main page ──────────────────────────────────────────────────────────────────
export default function BrandsSetup({ shellActiveBrandId } = {}) {
  const inShell = shellActiveBrandId != null;
  const { notify } = useNotification();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';

  const [brands, setBrands]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null); // null = add mode
  const [formName, setFormName]         = useState('');
  const [copyFromId, setCopyFromId]     = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(null); // brand pending enable/disable

  useEffect(() => {
    setLoading(true);
    api.get('/brands?includeInactive=true')
      .then(r => setBrands(r.data.data ?? []))
      .catch(() => notify('Failed to load brands', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const openAdd = () => {
    setEditingBrand(null);
    setFormName('');
    setCopyFromId(null);
    setIsModalOpen(true);
  };

  const openEdit = (b) => {
    setEditingBrand(b);
    setFormName(b.name);
    setCopyFromId(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBrand(null);
    setFormName('');
    setCopyFromId(null);
  };

  // ── Add / Rename brand ────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = formName.trim();
    if (!name) return;
    setSubmitting(true);

    try {
      if (editingBrand) {
        const original    = brands.find(b => b.id === editingBrand.id);
        const nameChanged = name !== original?.name;

        if (nameChanged) {
          await api.put(`/brands/${editingBrand.id}`, { name });
          setBrands(prev => prev.map(b => b.id === editingBrand.id ? { ...b, name } : b));
          notify(`Brand renamed to "${name}"`, 'success');
        }
        closeModal();
      } else {
        // Add flow
        const res = await api.post('/brands', { name });
        const created = res.data.data;
        setBrands(prev => [...prev, created]);

        if (copyFromId) {
          try {
            const copyRes = await api.post(`/brands/${created.id}/copy-products`, { sourceBrandId: copyFromId });
            const { copiedProducts } = copyRes.data.data;
            notify(
              `Brand "${created.name}" added with ${copiedProducts} product${copiedProducts !== 1 ? 's' : ''} copied`,
              'success'
            );
          } catch {
            notify(`Brand "${created.name}" added, but product copy failed`, 'error');
          }
        } else {
          notify(`Brand "${created.name}" added`, 'success');
        }
        closeModal();
      }
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to save brand', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Enable / Disable brand ────────────────────────────────────────────────
  const handleToggleActive = async (b) => {
    const nextActive = !b.isActive;
    setSubmitting(true);
    try {
      await api.put(`/brands/${b.id}`, { isActive: nextActive });
      setBrands(prev => prev.map(x => x.id === b.id ? { ...x, isActive: nextActive } : x));
      notify(`Brand "${b.name}" ${nextActive ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to update brand', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">

      {/* Saving overlay */}
      <LoadingOverlay open={submitting} message={editingBrand ? 'Renaming brand…' : 'Adding brand…'} />

      {/* Header — hidden in shell mode */}
      {!inShell && (
        <div className="flex items-center gap-2.5 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
          <Store size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Brands</h1>
            <p className="text-emerald-300 text-xs">Add and rename dairy brands</p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        {loading ? (
          <BrandedLoader />
        ) : (
          <div className="max-w-xl">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dairy Brands</p>
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={openAdd}
                    className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition"
                  >
                    <Plus size={13} />
                    Add Brand
                  </button>
                )}
              </div>

              <ul className="divide-y divide-slate-100">
                {brands.map((b, index) => {
                  const colors = getBrandColors(b.name, index);
                  const disabled = b.isActive === false;
                  return (
                    <li key={b.id} className={`flex items-center gap-3 px-5 py-3 ${disabled ? 'opacity-50' : ''}`}>
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                      <span className={`flex-1 text-sm font-medium ${disabled ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {b.name}
                      </span>
                      {disabled && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                          Disabled
                        </span>
                      )}
                      {isSuperAdmin && !disabled && (
                        <button
                          type="button"
                          onClick={() => openEdit(b)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                          title="Rename brand"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => setConfirmToggle(b)}
                          className={`p-1.5 rounded-lg transition ${
                            disabled
                              ? 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
                              : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                          }`}
                          title={disabled ? 'Enable brand' : 'Disable brand'}
                        >
                          {disabled ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                      )}
                    </li>
                  );
                })}

                {brands.length === 0 && (
                  <li className="px-5 py-6 text-center text-sm text-slate-400 italic">
                    No brands yet — add one above
                  </li>
                )}
              </ul>

              {isSuperAdmin && brands.length > 0 && (
                <p className="px-5 py-2.5 text-[10px] text-slate-400 border-t border-slate-100">
                  Renaming a brand updates its navigation link — old bookmarks may break.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Add / Rename Modal ────────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" style={{ animation: 'popIn 0.2s ease' }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 bg-emerald-800 rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-700 flex items-center justify-center">
                  <Store size={15} className="text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">
                    {editingBrand ? 'Rename Brand' : 'Add Brand'}
                  </p>
                  <p className="text-emerald-300 text-[11px]">
                    {editingBrand ? 'Update the brand name' : 'Create a new dairy brand'}
                  </p>
                </div>
              </div>
              <button onClick={closeModal} className="p-1.5 text-emerald-300 hover:text-white hover:bg-emerald-700 rounded-lg transition">
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                  Brand Name <span className="text-red-400">*</span>
                </label>
                <input
                  autoFocus
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Amul, Nandini, Heritage"
                  className="ddm-input"
                />
              </div>

              {/* Copy products — only shown in add mode when there are existing brands */}
              {!editingBrand && brands.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Copy Products From
                  </label>
                  <select
                    value={copyFromId ?? ''}
                    onChange={e => setCopyFromId(e.target.value ? Number(e.target.value) : null)}
                    className="ddm-input"
                  >
                    <option value="">None (start empty)</option>
                    {brands.filter(b => b.isActive !== false).map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  {copyFromId && (
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      All active products and categories will be copied into the new brand.
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formName.trim()}
                  className="ddm-btn-primary flex-1 justify-center"
                >
                  {editingBrand ? 'Save Changes' : 'Add Brand'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Enable / Disable confirmation ─────────────────────────────────────── */}
      <ConfirmationModal
        isOpen={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        onConfirm={() => handleToggleActive(confirmToggle)}
        title={confirmToggle?.isActive === false ? 'Enable Brand' : 'Disable Brand'}
        message={
          confirmToggle?.isActive === false
            ? `Enable "${confirmToggle?.name}"? It will reappear across the app — stock entry, reports, and salesman views.`
            : `Disable "${confirmToggle?.name}"? It will be hidden everywhere in the app, including reports. All its data stays safe and reappears if you enable it again.`
        }
        confirmText={confirmToggle?.isActive === false ? 'Enable' : 'Disable'}
        tone={confirmToggle?.isActive === false ? 'success' : 'warning'}
      />
    </div>
  );
}
