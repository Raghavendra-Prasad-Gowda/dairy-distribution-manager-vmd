import { useState, useEffect } from 'react';
import { Plus, Save, Loader2, Info, X, Users, Key, Eye, EyeOff, ToggleLeft, ToggleRight, Tag, DollarSign } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function SalespeopleSetup() {
  const { notify } = useNotification();
  const [salespeople, setSalespeople] = useState([]);
  const [selectedSpId, setSelectedSpId] = useState('');
  const [brands, setBrands]           = useState([]);
  const [activeBrandId, setActive]    = useState(null);
  const [prices, setPrices]           = useState([]);
  const [editedPrices, setEdited]     = useState({});
  const [effectiveFrom, setEffFrom]   = useState(getIndiaDate());
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [showAddSp, setShowAddSp]     = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [newSp, setNewSp]             = useState({ name: '', phone: '', route: '', username: '', password: '' });
  const [showNewPw, setShowNewPw]     = useState(false);
  const [pwForm, setPwForm]           = useState({ username: '', password: '', confirmPassword: '' });
  const [showPw, setShowPw]           = useState(false);
  const [savingPw, setSavingPw]       = useState(false);

  // Product access tab state
  const [activeSection, setActiveSection] = useState('prices');
  const [spProducts, setSpProducts]       = useState([]);
  const [dirtyProducts, setDirtyProducts] = useState({});
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [savingProducts, setSavingProducts]   = useState(false);

  useEffect(() => {
    Promise.all([api.get('/salespeople?all=true'), api.get('/brands')])
      .then(([spRes, brandRes]) => {
        setSalespeople(spRes.data.data);
        const b = brandRes.data.data;
        setBrands(b);
        if (b.length) setActive(b[0].id);
      })
      .catch(() => notify('Failed to load data', 'error'));
  }, []);

  const selectedSp = salespeople.find(s => String(s.id) === String(selectedSpId)) ?? null;

  useEffect(() => {
    if (!selectedSp) return;
    fetchPrices();
    fetchProducts();
  }, [selectedSpId]);

  async function fetchPrices() {
    setLoading(true);
    try {
      const r = await api.get(`/salespeople/${selectedSpId}/prices`);
      setPrices(r.data.data);
      setEdited({});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to load prices', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchProducts() {
    setLoadingProducts(true);
    try {
      const r = await api.get(`/salespeople/${selectedSpId}/products`);
      setSpProducts(r.data.data);
      setDirtyProducts({});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to load product access', 'error');
    } finally {
      setLoadingProducts(false);
    }
  }

  async function refreshSalespeople() {
    const r = await api.get('/salespeople?all=true');
    setSalespeople(r.data.data);
  }

  const filteredPrices    = prices.filter(p => p.brandId === activeBrandId);
  const filteredProducts  = spProducts.filter(p => p.brandId === activeBrandId);

  const handlePriceChange = (productId, value) => {
    setEdited(prev => ({ ...prev, [productId]: value }));
  };

  const handleProductToggle = (productId, currentEnabled) => {
    const newValue = !currentEnabled;
    setDirtyProducts(prev => ({ ...prev, [productId]: newValue }));
    setSpProducts(prev => prev.map(p => p.productId === productId ? { ...p, isEnabled: newValue } : p));
  };

  const handleSavePrices = async () => {
    setSaving(true);
    try {
      const pricesToSave = filteredPrices
        .filter(p => editedPrices[p.productId] !== undefined)
        .map(p => ({ productId: p.productId, sellingPrice: parseFloat(editedPrices[p.productId]) || 0 }));

      if (!pricesToSave.length) { notify('No changes to save', 'warning'); setSaving(false); return; }

      await api.post(`/salespeople/${selectedSpId}/prices/bulk`, { effectiveFrom, prices: pricesToSave });
      notify('Prices saved successfully', 'success');
      fetchPrices();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to save prices', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProducts = async () => {
    const changed = Object.keys(dirtyProducts);
    if (!changed.length) { notify('No changes to save', 'warning'); return; }
    setSavingProducts(true);
    try {
      const products = changed.map(id => ({ productId: parseInt(id, 10), isEnabled: dirtyProducts[id] }));
      await api.post(`/salespeople/${selectedSpId}/products/bulk`, { products });
      notify('Product access updated', 'success');
      setDirtyProducts({});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to save product access', 'error');
    } finally {
      setSavingProducts(false);
    }
  };

  const handleAddSalesperson = async (e) => {
    e.preventDefault();
    if (newSp.username && !newSp.password) { notify('Password is required when setting a username', 'warning'); return; }
    if (!newSp.username && newSp.password) { notify('Username is required when setting a password', 'warning'); return; }
    try {
      const payload = { name: newSp.name, phone: newSp.phone || undefined, route: newSp.route || undefined };
      if (newSp.username) { payload.username = newSp.username; payload.password = newSp.password; }
      const r = await api.post('/salespeople', payload);
      notify('Salesperson added', 'success');
      setNewSp({ name: '', phone: '', route: '', username: '', password: '' });
      setShowAddSp(false);
      await refreshSalespeople();
      setSelectedSpId(String(r.data.data.id));
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to add salesperson', 'error');
    }
  };

  const handleToggleActive = async (sp) => {
    try {
      await api.put(`/salespeople/${sp.id}`, { isActive: !sp.isActive });
      notify(`${sp.name} ${sp.isActive ? 'deactivated' : 'activated'}`, 'success');
      await refreshSalespeople();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to update', 'error');
    }
  };

  const handleOpenPwModal = () => {
    if (!selectedSp) return;
    setPwForm({ username: selectedSp.username ?? '', password: '', confirmPassword: '' });
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
      if (pwForm.username !== (selectedSp.username ?? '')) payload.username = pwForm.username || null;
      if (pwForm.password) payload.password = pwForm.password;
      if (Object.keys(payload).length === 0) { notify('No changes to save', 'warning'); setSavingPw(false); return; }
      await api.put(`/salespeople/${selectedSp.id}`, payload);
      notify('Credentials updated', 'success');
      setShowPwModal(false);
      await refreshSalespeople();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to update credentials', 'error');
    } finally {
      setSavingPw(false);
    }
  };

  const hasDirtyPrices    = Object.keys(editedPrices).length > 0;
  const hasDirtyProducts  = Object.keys(dirtyProducts).length > 0;

  const enabledCount = spProducts.filter(p => p.isEnabled).length;

  return (
    <div className="flex flex-col h-full">

      {(saving || savingProducts) && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">{saving ? 'Saving prices…' : 'Saving product access…'}</p>
          </div>
        </div>
      )}

      {/* Credentials modal */}
      {showPwModal && selectedSp && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-6 mx-4 w-full max-w-md" style={{ animation: 'popIn 0.2s ease' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Key size={18} className="text-emerald-700" />
                <h3 className="font-bold text-slate-900">Login Credentials — {selectedSp.name}</h3>
              </div>
              <button onClick={() => setShowPwModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCredentials} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Username</label>
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
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">New Password</label>
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
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Confirm Password</label>
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

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Users size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Salespeople &amp; Rates</h1>
            <p className="text-emerald-300 text-xs">Manage salespeople, logins, product access, and selling prices</p>
          </div>
        </div>
        <button onClick={() => setShowAddSp(!showAddSp)} className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition flex-shrink-0">
          <Plus size={14} /> Add Salesperson
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
      <div className="p-5 md:p-8 max-w-4xl mx-auto space-y-6">

        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-xs">
          <Info size={13} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>Setup:</strong> Set a username and password so the salesperson can log in. Enable products they should see in <em>Product Access</em>, then set their selling prices in <em>Selling Prices</em>.
          </span>
        </div>

        {/* Add salesperson form */}
        {showAddSp && (
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200" style={{ animation: 'popIn 0.2s ease' }}>
            <div className="flex items-center justify-between px-5 py-4 bg-emerald-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-700 flex items-center justify-center">
                  <Users size={15} className="text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">New Salesperson</p>
                  <p className="text-emerald-300 text-[11px]">Fill in the details below</p>
                </div>
              </div>
              <button onClick={() => setShowAddSp(false)} className="p-1.5 text-emerald-300 hover:text-white hover:bg-emerald-700 rounded-lg transition">
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleAddSalesperson} className="px-5 py-4 space-y-4">
              {/* Basic info */}
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

              {/* Login credentials */}
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

              <div className="flex gap-3 justify-end pt-1 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddSp(false)} className="px-4 py-2.5 text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition">
                  Cancel
                </button>
                <button type="submit" className="ddm-btn-primary">
                  <Plus size={14} /> Add Salesperson
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Salesperson selector */}
        <div className="ddm-card p-4">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Select Salesperson
          </label>
          <select
            value={selectedSpId}
            onChange={e => { setSelectedSpId(e.target.value); setEdited({}); setDirtyProducts({}); }}
            className="w-full ddm-input"
          >
            <option value="">Choose salesperson to configure…</option>
            {salespeople.map(sp => (
              <option key={sp.id} value={sp.id}>
                {sp.name}{sp.route ? ` — ${sp.route}` : ''}{!sp.isActive ? ' (inactive)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Selected salesperson controls */}
        {selectedSp && (
          <div className="space-y-4">

            {/* Info bar */}
            <div className="ddm-card p-4 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-slate-900">{selectedSp.name}</p>
                  {selectedSp.username
                    ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">@{selectedSp.username}</span>
                    : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">No login</span>
                  }
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${selectedSp.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {selectedSp.isActive ? 'Active' : 'Inactive'}
                  </span>
                  {spProducts.length > 0 && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                      {enabledCount}/{spProducts.length} products
                    </span>
                  )}
                </div>
                {selectedSp.route && <p className="text-xs text-slate-400 mt-0.5">{selectedSp.route}</p>}
                {selectedSp.phone && <p className="text-xs text-slate-400">{selectedSp.phone}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenPwModal}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg transition"
                >
                  <Key size={13} /> Credentials
                </button>
                <button
                  onClick={() => handleToggleActive(selectedSp)}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition border ${
                    selectedSp.isActive
                      ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                      : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                  }`}
                >
                  {selectedSp.isActive ? <ToggleRight size={13} className="text-emerald-600" /> : <ToggleLeft size={13} />}
                  {selectedSp.isActive ? 'Active' : 'Activate'}
                </button>
              </div>
            </div>

            {/* Section tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveSection('products')}
                className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-lg transition ${
                  activeSection === 'products'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Tag size={13} /> Product Access
              </button>
              <button
                onClick={() => setActiveSection('prices')}
                className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-lg transition ${
                  activeSection === 'prices'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <DollarSign size={13} /> Selling Prices
              </button>
            </div>

            {/* Brand tabs (shared) */}
            {brands.length > 0 && (
              <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={id => { setActive(id); setEdited({}); }} />
            )}

            {/* ── Product Access section ── */}
            {activeSection === 'products' && (
              <>
                <div className="ddm-card p-4 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Access</p>
                    <p className="text-xs text-slate-400 mt-0.5">Toggle which products this salesperson can see and enter in their daily stock entry</p>
                  </div>
                  <button
                    onClick={handleSaveProducts}
                    disabled={savingProducts || !hasDirtyProducts}
                    className="ddm-btn-primary disabled:opacity-50"
                  >
                    {savingProducts ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                    Save Access
                  </button>
                </div>

                <div className="ddm-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-emerald-700 sticky top-0 z-10">
                        <tr>
                          <th className="px-5 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                          <th className="px-5 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-32">Access</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {loadingProducts ? (
                          <tr>
                            <td colSpan={2} className="py-12 text-center">
                              <Loader2 className="w-5 h-5 text-emerald-600 animate-spin mx-auto" />
                            </td>
                          </tr>
                        ) : filteredProducts.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="py-10 text-center text-slate-400 text-sm">No products for this brand</td>
                          </tr>
                        ) : (
                          filteredProducts.map(p => {
                            const isDirty = dirtyProducts[p.productId] !== undefined;
                            return (
                              <tr
                                key={p.productId}
                                className={`transition-colors cursor-pointer ${
                                  p.isEnabled ? (isDirty ? 'bg-emerald-50/60' : 'hover:bg-slate-50/60') : (isDirty ? 'bg-slate-50/60' : 'hover:bg-slate-50/40')
                                }`}
                                onClick={() => handleProductToggle(p.productId, p.isEnabled)}
                              >
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-semibold ${p.isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>{p.productName}</span>
                                    {p.category && <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{p.category}</span>}
                                    {isDirty && <span className="text-[10px] text-amber-600 font-bold">unsaved</span>}
                                  </div>
                                </td>
                                <td className="px-5 py-4 text-center">
                                  <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); handleProductToggle(p.productId, p.isEnabled); }}
                                    className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition ${
                                      p.isEnabled
                                        ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                                        : 'bg-white border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-600'
                                    }`}
                                  >
                                    {p.isEnabled ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                                    {p.isEnabled ? 'Enabled' : 'Disabled'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── Selling Prices section ── */}
            {activeSection === 'prices' && (
              <>
                <div className="ddm-card p-4 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Selling Prices</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Effective From</label>
                    <input
                      type="date"
                      value={effectiveFrom}
                      onChange={e => setEffFrom(e.target.value)}
                      max={getIndiaDate()}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                    />
                  </div>
                  <button
                    onClick={handleSavePrices}
                    disabled={saving || !hasDirtyPrices}
                    className="ddm-btn-primary disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                    Save Prices
                  </button>
                </div>

                <div className="ddm-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-emerald-700 sticky top-0 z-10">
                        <tr>
                          <th className="px-5 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                          <th className="px-5 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Current Price</th>
                          <th className="px-5 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">New Price</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {loading ? (
                          <tr>
                            <td colSpan={3} className="py-12 text-center">
                              <Loader2 className="w-5 h-5 text-emerald-600 animate-spin mx-auto" />
                            </td>
                          </tr>
                        ) : filteredPrices.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-10 text-center text-slate-400 text-sm">No products for this brand</td>
                          </tr>
                        ) : (
                          filteredPrices.map(p => {
                            const hasPrice = p.sellingPrice !== null;
                            const isDirty  = editedPrices[p.productId] !== undefined;
                            return (
                              <tr
                                key={p.productId}
                                className={`transition-colors ${!hasPrice ? 'bg-amber-50/60' : isDirty ? 'bg-emerald-50/40' : 'hover:bg-slate-50/60'}`}
                              >
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-800">{p.productName}</span>
                                    {!hasPrice && <span className="badge-amber text-[10px]">No price</span>}
                                    {!p.isEnabled && <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">hidden</span>}
                                  </div>
                                </td>
                                <td className="px-5 py-4 text-right text-sm tabular-nums text-slate-500">
                                  {hasPrice
                                    ? `₹${Number(p.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                                    : <span className="text-amber-600 font-semibold text-xs">Not set</span>
                                  }
                                </td>
                                <td className="px-5 py-4 text-right">
                                  <div className="flex justify-end">
                                    <div className="relative w-24">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                                      <input
                                        type="number"
                                        step="0.0001"
                                        min="0"
                                        value={editedPrices[p.productId] ?? ''}
                                        onChange={e => handlePriceChange(p.productId, e.target.value)}
                                        placeholder={p.sellingPrice ?? '0.00'}
                                        className={`w-full pl-6 pr-2 py-2 border rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white tabular-nums ${
                                          isDirty ? 'border-emerald-400' : 'border-slate-200'
                                        }`}
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {!selectedSp && salespeople.length > 0 && (
          <div className="ddm-card flex items-center justify-center h-40 text-slate-400 text-sm">
            Select a salesperson above to configure their product access, selling prices, and login credentials
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
