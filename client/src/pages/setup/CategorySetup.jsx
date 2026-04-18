import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Layers } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

export default function CategorySetup() {
  const { notify } = useNotification();
  const [brands, setBrands]         = useState([]);
  const [activeBrandId, setActive]  = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [newName, setNewName]       = useState('');
  const [adding, setAdding]         = useState(false);
  const [showAdd, setShowAdd]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // category id

  useEffect(() => {
    api.get('/brands')
      .then(r => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => notify('Failed to load brands', 'error'));
  }, []);

  useEffect(() => {
    if (!activeBrandId) return;
    fetchCategories();
  }, [activeBrandId]);

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

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await api.post('/categories', { brandId: activeBrandId, name: newName.trim() });
      notify('Category added', 'success');
      setNewName('');
      setShowAdd(false);
      fetchCategories();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to add category', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/categories/${id}`);
      notify('Category deleted', 'success');
      setConfirmDelete(null);
      fetchCategories();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to delete category', 'error');
      setConfirmDelete(null);
    }
  };

  const activeBrand = brands.find(b => b.id === activeBrandId);

  return (
    <div className="p-5 md:p-8 max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Category Setup</h1>
          <p className="text-slate-400 text-sm mt-0.5">Group products by category per brand</p>
        </div>
        <button onClick={() => { setShowAdd(true); setNewName(''); }} className="ddm-btn-primary flex-shrink-0">
          <Plus size={15} /> Add Category
        </button>
      </div>

      {brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={id => { setActive(id); setConfirmDelete(null); }} />
      )}

      {/* Category list */}
      <div className="ddm-card overflow-hidden">
        {/* Table header */}
        <div className="flex items-center px-5 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex-1 text-xs font-bold text-slate-500 uppercase tracking-wider">Category Name</div>
          <div className="w-24 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Action</div>
        </div>

        {/* Add row */}
        {showAdd && (
          <form onSubmit={handleAdd} className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 bg-emerald-50/40">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={`e.g. Milk, Curd, Butter…`}
              className="flex-1 ddm-input"
            />
            <button type="submit" disabled={adding || !newName.trim()} className="ddm-btn-primary">
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="ddm-btn-secondary">Cancel</button>
          </form>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : categories.length === 0 && !showAdd ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            <Layers size={32} className="mx-auto mb-3 opacity-30" />
            No categories yet for {activeBrand?.name}.<br />
            <span className="text-xs">Add a category to group products in Stock Receipt.</span>
          </div>
        ) : (
          categories.map(cat => (
            <div key={cat.id} className="flex items-center px-5 py-3.5 border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
              <div className="flex-1">
                <span className="text-sm font-semibold text-slate-800">{cat.name}</span>
              </div>
              <div className="w-24 flex justify-end">
                {confirmDelete === cat.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Delete?</span>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                    >Yes</button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                    >No</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(cat.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
