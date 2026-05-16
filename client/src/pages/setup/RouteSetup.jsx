import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader2, Navigation, X } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

export default function RouteSetup({ shellActiveBrandId, shellBrands } = {}) {
  const inShell = shellActiveBrandId != null;
  const { notify } = useNotification();
  const [brands, setBrands]         = useState(shellBrands ?? []);
  const [activeBrandId, setActive]  = useState(shellActiveBrandId ?? null);
  const [routes, setRoutes]         = useState([]);
  const [loading, setLoading]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [formNumber, setFormNumber]   = useState('');
  const [confirmation, setConfirmation] = useState({ isOpen: false });

  useEffect(() => {
    if (inShell) return;
    api.get('/brands')
      .then(r => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => notify('Failed to load brands', 'error'));
  }, []);

  useEffect(() => {
    if (inShell) { setActive(shellActiveBrandId); setBrands(shellBrands ?? []); }
  }, [shellActiveBrandId]);

  useEffect(() => {
    if (!activeBrandId) return;
    fetchRoutes();
  }, [activeBrandId]);

  async function fetchRoutes() {
    setLoading(true);
    try {
      const r = await api.get(`/routes?brandId=${activeBrandId}`);
      setRoutes(r.data.data);
    } catch {
      notify('Failed to load routes', 'error');
    } finally {
      setLoading(false);
    }
  }

  const openAdd  = () => { setEditingRoute(null); setFormNumber(''); setIsModalOpen(true); };
  const openEdit = (route) => { setEditingRoute(route); setFormNumber(route.routeNumber); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setEditingRoute(null); setFormNumber(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formNumber.trim()) return;
    setSubmitting(true);
    try {
      if (editingRoute) {
        await api.put(`/routes/${editingRoute.id}`, { routeNumber: formNumber.trim() });
        notify('Route updated', 'success');
      } else {
        await api.post('/routes', { brandId: activeBrandId, routeNumber: formNumber.trim(), displayOrder: routes.length });
        notify('Route added', 'success');
      }
      closeModal();
      fetchRoutes();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to save route', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (route) => {
    setConfirmation({
      isOpen: true,
      title: 'Delete Route',
      message: `Delete route "${route.routeNumber}"? This will remove it from the stock receipt screen.`,
      action: () => handleDelete(route.id),
      isDanger: true,
    });
  };

  const handleDelete = async (id) => {
    setSubmitting(true);
    try {
      await api.delete(`/routes/${id}`);
      notify('Route deleted', 'success');
      fetchRoutes();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to delete route', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const activeBrand = brands.find(b => b.id === activeBrandId);

  return (
    <div className="flex flex-col h-full">

      {/* Loading overlay */}
      {submitting && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Processing…</p>
          </div>
        </div>
      )}

      {/* Header — hidden in shell mode */}
      {!inShell && (
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Navigation size={17} className="text-emerald-300 flex-shrink-0" />
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Route Setup</h1>
              <p className="text-emerald-300 text-xs">Manage delivery route numbers per brand</p>
            </div>
          </div>
          <button onClick={openAdd} className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition flex-shrink-0">
            <Plus size={14} /> Add Route
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 md:p-8 max-w-3xl mx-auto space-y-5">

          {/* Add Route button shown in shell mode at top of content */}
          {inShell && (
            <div className="flex justify-end">
              <button onClick={openAdd} className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 rounded-lg transition">
                <Plus size={14} /> Add Route
              </button>
            </div>
          )}

          {!inShell && brands.length > 0 && (
            <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={id => setActive(id)} />
          )}

          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-700 font-medium">
              Routes defined here appear as columns in the <strong>{activeBrand?.name ?? '…'}</strong> Stock Receipt screen.
              Each route represents a delivery vehicle / dispatch number.
            </p>
          </div>

          {/* Route list */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-emerald-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">#</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Route Number</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-28">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-16 text-center">
                        <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
                      </td>
                    </tr>
                  ) : routes.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-16 text-center text-slate-400 text-sm">
                        <Navigation size={32} className="mx-auto mb-3 opacity-30" />
                        No routes configured for {activeBrand?.name ?? 'this brand'}. Add one above.
                      </td>
                    </tr>
                  ) : (
                    routes.map((route, idx) => (
                      <tr key={route.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-xs font-bold text-slate-400 tabular-nums">{idx + 1}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                            <span className="text-sm font-bold text-slate-800">Route {route.routeNumber}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-3">
                            <button onClick={() => openEdit(route)} className="text-emerald-600 hover:text-emerald-800 transition-colors" title="Edit">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => confirmDelete(route)} className="text-red-500 hover:text-red-700 transition-colors" title="Delete">
                              <Trash2 className="w-4 h-4" />
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

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" style={{ animation: 'popIn 0.2s ease' }}>
            <div className="flex items-center justify-between px-5 py-4 bg-emerald-800 rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-700 flex items-center justify-center">
                  <Navigation size={15} className="text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">
                    {editingRoute ? 'Edit Route' : 'Add Route'}
                  </p>
                  <p className="text-emerald-300 text-[11px]">
                    {editingRoute ? 'Update route number' : 'Add a new delivery route'}
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
                  Route Number <span className="text-red-400">*</span>
                </label>
                <input
                  autoFocus
                  required
                  value={formNumber}
                  onChange={e => setFormNumber(e.target.value)}
                  placeholder="e.g. 220, 512, 127"
                  className="ddm-input"
                />
                <p className="mt-1.5 text-[11px] text-slate-400">This number will appear as a column header in the stock receipt.</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-2.5 text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition">Cancel</button>
                <button type="submit" disabled={submitting || !formNumber.trim()} className="ddm-btn-primary flex-1 justify-center">
                  {editingRoute ? 'Save Changes' : 'Add Route'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmation.isOpen}
        onClose={() => setConfirmation({ ...confirmation, isOpen: false })}
        onConfirm={confirmation.action}
        title={confirmation.title}
        message={confirmation.message}
        isDanger={confirmation.isDanger}
        confirmText="Delete"
      />
    </div>
  );
}
