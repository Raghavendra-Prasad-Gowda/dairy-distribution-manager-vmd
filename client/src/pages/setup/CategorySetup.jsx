import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, Layers, X } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import Pagination from '../../components/Pagination';
import ConfirmationModal from '../../components/ConfirmationModal';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

const ITEMS_PER_PAGE = 10;

export default function CategorySetup({ shellActiveBrandId, shellBrands } = {}) {
  const inShell = shellActiveBrandId != null;
  const { notify } = useNotification();
  const [brands, setBrands]         = useState(shellBrands ?? []);
  const [activeBrandId, setActive]  = useState(shellActiveBrandId ?? null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyMsg, setBusyMsg]       = useState('');
  const [search, setSearch]         = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCat, setEditingCat]   = useState(null);
  const [formName, setFormName]       = useState('');
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
    fetchCategories();
    setSearch('');
    setCurrentPage(1);
  }, [activeBrandId]);

  useEffect(() => { setCurrentPage(1); }, [search]);

  async function fetchCategories() {
    setLoading(true);
    try {
      const r = await api.get(`/categories?brandId=${activeBrandId}`);
      setCategories(r.data.data);
    } catch {
      notify('Failed to load categories', 'error');
    } finally {
      setLoading(false);
    }
  }

  const openAdd = () => { setEditingCat(null); setFormName(''); setIsModalOpen(true); };
  const openEdit = (cat) => { setEditingCat(cat); setFormName(cat.name); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setEditingCat(null); setFormName(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setBusyMsg(editingCat ? 'Updating category…' : 'Adding category…');
    setSubmitting(true);
    try {
      if (editingCat) {
        await api.put(`/categories/${editingCat.id}`, { name: formName.trim() });
        notify('Category updated', 'success');
      } else {
        await api.post('/categories', { brandId: activeBrandId, name: formName.trim() });
        notify('Category added', 'success');
      }
      closeModal();
      fetchCategories();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to save category', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (cat) => {
    setConfirmation({
      isOpen: true,
      title: 'Delete Category',
      message: `Delete "${cat.name}"? Products using this category will become uncategorised.`,
      action: () => handleDelete(cat.id),
      isDanger: true,
    });
  };

  const handleDelete = async (id) => {
    setBusyMsg('Deleting category…');
    setSubmitting(true);
    try {
      await api.delete(`/categories/${id}`);
      notify('Category deleted', 'success');
      fetchCategories();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to delete', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = categories.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const startIdx   = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginated  = filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const activeBrand = brands.find(b => b.id === activeBrandId);

  return (
    <div className="flex flex-col h-full">

      {/* Loading overlay */}
      <LoadingOverlay open={submitting} message={busyMsg} />

      {/* Header — hidden in shell mode */}
      {!inShell && (
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Layers size={17} className="text-emerald-300 flex-shrink-0" />
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Category Setup</h1>
              <p className="text-emerald-300 text-xs">Manage product categories per brand</p>
            </div>
          </div>
          <button onClick={openAdd} className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition flex-shrink-0">
            <Plus size={14} /> Add Category
          </button>
        </div>
      )}

    <div className="flex-1 overflow-y-auto">
    <div className="p-5 md:p-8 max-w-3xl mx-auto space-y-5">

      {inShell && (
        <div className="flex justify-end">
          <button onClick={openAdd} className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 rounded-lg transition">
            <Plus size={14} /> Add Category
          </button>
        </div>
      )}

      {!inShell && brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={id => setActive(id)} />
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name…"
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

      {/* Pagination info */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        startIndex={startIdx}
        endIndex={Math.min(startIdx + ITEMS_PER_PAGE, filtered.length)}
        total={filtered.length}
        onPageChange={setCurrentPage}
      />

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-emerald-700 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Category Name</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={2}><BrandedLoader size="sm" hideBrand inlinePadY="py-12" /></td></tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-6 py-16 text-center text-slate-400 text-sm">
                    <Layers size={32} className="mx-auto mb-3 opacity-30" />
                    {search ? 'No categories match your search.' : `No categories yet for ${activeBrand?.name}. Add one above.`}
                  </td>
                </tr>
              ) : (
                paginated.map(cat => (
                  <tr key={cat.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-semibold text-slate-800">{cat.name}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <button onClick={() => openEdit(cat)} className="text-emerald-600 hover:text-emerald-800 transition-colors" title="Edit">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => confirmDelete(cat)} className="text-red-500 hover:text-red-700 transition-colors" title="Delete">
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

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" style={{ animation: 'popIn 0.2s ease' }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 bg-emerald-800 rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-700 flex items-center justify-center">
                  <Layers size={15} className="text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">
                    {editingCat ? 'Edit Category' : 'Add Category'}
                  </p>
                  <p className="text-emerald-300 text-[11px]">
                    {editingCat ? 'Update category name' : 'Create a new product category'}
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
                  Category Name <span className="text-red-400">*</span>
                </label>
                <input
                  autoFocus
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Milk, Curd, Butter"
                  className="ddm-input"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-2.5 text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition">Cancel</button>
                <button type="submit" disabled={submitting || !formName.trim()} className="ddm-btn-primary flex-1 justify-center">
                  {editingCat ? 'Save Changes' : 'Add Category'}
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
    </div>
    </div>
  );
}
