import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, Loader2, Layers, X } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import Pagination from '../../components/Pagination';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

const ITEMS_PER_PAGE = 10;

export default function CategorySetup() {
  const { notify } = useNotification();
  const [brands, setBrands]         = useState([]);
  const [activeBrandId, setActive]  = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch]         = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCat, setEditingCat]   = useState(null);
  const [formName, setFormName]       = useState('');
  const [confirmation, setConfirmation] = useState({ isOpen: false });

  useEffect(() => {
    api.get('/brands')
      .then(r => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => notify('Failed to load brands', 'error'));
  }, []);

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
    <div className="p-5 md:p-8 max-w-3xl mx-auto space-y-5">

      {/* Loading overlay */}
      {submitting && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Processing…</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Category Setup</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage product categories per brand</p>
        </div>
        <button onClick={openAdd} className="ddm-btn-primary flex-shrink-0">
          <Plus size={15} /> Add Category
        </button>
      </div>

      {brands.length > 0 && (
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
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
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
            <thead className="bg-emerald-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Category Name</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={2} className="px-6 py-16 text-center">
                    <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
                  </td>
                </tr>
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
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingCat ? 'Edit Category' : 'Add Category'}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
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
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl transition">Cancel</button>
                <button type="submit" disabled={submitting || !formName.trim()} className="ddm-btn-primary flex-1">
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
  );
}
