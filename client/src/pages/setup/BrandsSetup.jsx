import { useState, useEffect, useRef } from 'react';
import { Store, Loader2, Plus, Pencil, Check, X as XIcon } from 'lucide-react';
import BrandedLoader from '../../components/ui/BrandedLoader';
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

  const [brands, setBrands]   = useState([]);
  const [loading, setLoading] = useState(false);

  // Brand management state
  const [addingNew, setAddingNew]       = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [copyFromId, setCopyFromId]     = useState(null);
  const [addSaving, setAddSaving]       = useState(false);
  const [renamingId, setRenamingId]     = useState(null);
  const [renameValue, setRenameValue]   = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  const addInputRef    = useRef(null);
  const renameInputRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    api.get('/brands')
      .then(r => setBrands(r.data.data ?? []))
      .catch(() => notify('Failed to load brands', 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (addingNew) addInputRef.current?.focus();
  }, [addingNew]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  // ── Brand management ──────────────────────────────────────────────────────
  const handleAddBrand = async () => {
    const name = newBrandName.trim();
    if (!name) return;
    setAddSaving(true);
    try {
      const res = await api.post('/brands', { name });
      const created = res.data.data;
      setBrands(prev => [...prev, created]);

      if (copyFromId) {
        try {
          const copyRes = await api.post(`/brands/${created.id}/copy-products`, { sourceBrandId: copyFromId });
          const { copiedProducts } = copyRes.data.data;
          notify(`Brand "${created.name}" added with ${copiedProducts} product${copiedProducts !== 1 ? 's' : ''} copied`, 'success');
        } catch {
          notify(`Brand "${created.name}" added, but product copy failed`, 'error');
        }
      } else {
        notify(`Brand "${created.name}" added`, 'success');
      }

      setNewBrandName('');
      setCopyFromId(null);
      setAddingNew(false);
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to add brand', 'error');
    } finally {
      setAddSaving(false);
    }
  };

  const handleStartRename = (b) => {
    setRenamingId(b.id);
    setRenameValue(b.name);
    setAddingNew(false);
  };

  const handleCancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const handleConfirmRename = async (id) => {
    const name = renameValue.trim();
    if (!name) return;
    const original = brands.find(b => b.id === id)?.name;
    if (name === original) { handleCancelRename(); return; }
    setRenameSaving(true);
    try {
      await api.put(`/brands/${id}`, { name });
      setBrands(prev => prev.map(b => b.id === id ? { ...b, name } : b));
      setRenamingId(null);
      setRenameValue('');
      notify(`Brand renamed to "${name}"`, 'success');
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to rename brand', 'error');
    } finally {
      setRenameSaving(false);
    }
  };

  const handleAddKeyDown = (e) => {
    if (e.key === 'Enter') handleAddBrand();
    if (e.key === 'Escape') { setAddingNew(false); setNewBrandName(''); setCopyFromId(null); }
  };

  const handleRenameKeyDown = (e, id) => {
    if (e.key === 'Enter') handleConfirmRename(id);
    if (e.key === 'Escape') handleCancelRename();
  };

  return (
    <div className="flex flex-col h-full">

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
                    onClick={() => { setAddingNew(true); setRenamingId(null); }}
                    disabled={addingNew}
                    className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <Plus size={13} />
                    Add Brand
                  </button>
                )}
              </div>

              <ul className="divide-y divide-slate-100">
                {brands.map((b, index) => {
                  const colors = getBrandColors(b.name, index);
                  const isRenaming = renamingId === b.id;
                  return (
                    <li key={b.id} className="flex items-center gap-3 px-5 py-3">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                      {isRenaming ? (
                        <>
                          <input
                            ref={renameInputRef}
                            type="text"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => handleRenameKeyDown(e, b.id)}
                            className="flex-1 text-sm font-medium border border-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                          <button
                            type="button"
                            onClick={() => handleConfirmRename(b.id)}
                            disabled={renameSaving || !renameValue.trim()}
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 transition"
                          >
                            {renameSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelRename}
                            disabled={renameSaving}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-40 transition"
                          >
                            <XIcon size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm font-medium text-slate-700">{b.name}</span>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => handleStartRename(b)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                              title="Rename brand"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}

                {/* Add brand form row */}
                {addingNew && (
                  <li className="flex flex-col gap-2 px-5 py-3 bg-emerald-50/50">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-slate-300" />
                      <input
                        ref={addInputRef}
                        type="text"
                        value={newBrandName}
                        onChange={e => setNewBrandName(e.target.value)}
                        onKeyDown={handleAddKeyDown}
                        placeholder="Brand name"
                        className="flex-1 text-sm font-medium border border-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddBrand}
                        disabled={addSaving || !newBrandName.trim()}
                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-100 disabled:opacity-40 transition"
                      >
                        {addSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAddingNew(false); setNewBrandName(''); setCopyFromId(null); }}
                        disabled={addSaving}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-40 transition"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                    {brands.length > 0 && (
                      <div className="ml-5 flex items-center gap-2">
                        <label className="text-xs text-slate-500 whitespace-nowrap">Copy products from:</label>
                        <select
                          value={copyFromId ?? ''}
                          onChange={e => setCopyFromId(e.target.value ? Number(e.target.value) : null)}
                          disabled={addSaving}
                          className="flex-1 text-xs border border-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white text-slate-700 disabled:opacity-50"
                        >
                          <option value="">None (start empty)</option>
                          {brands.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </li>
                )}

                {brands.length === 0 && !addingNew && (
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
    </div>
  );
}
