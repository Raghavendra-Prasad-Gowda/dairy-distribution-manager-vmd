import { useState, useEffect } from 'react';
import { Plus, Save, Loader2, Info, X } from 'lucide-react';
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
  const [newSp, setNewSp]             = useState({ name: '', phone: '', route: '' });

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

  const filteredPrices = prices.filter(p => p.brandId === activeBrandId);

  const handlePriceChange = (productId, value) => {
    setEdited(prev => ({ ...prev, [productId]: value }));
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

  const handleAddSalesperson = async (e) => {
    e.preventDefault();
    try {
      const r = await api.post('/salespeople', newSp);
      notify('Salesperson added', 'success');
      setNewSp({ name: '', phone: '', route: '' });
      setShowAddSp(false);
      const spRes = await api.get('/salespeople?all=true');
      setSalespeople(spRes.data.data);
      setSelectedSpId(String(r.data.data.id));
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to add salesperson', 'error');
    }
  };

  const hasDirtyPrices = Object.keys(editedPrices).length > 0;

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Salespeople &amp; Rates</h1>
          <p className="text-slate-500 text-sm mt-1">Configure salespeople and their selling prices</p>
        </div>
        <button onClick={() => setShowAddSp(!showAddSp)} className="ddm-btn-primary flex-shrink-0">
          <Plus size={15} /> Add Salesperson
        </button>
      </div>

      {/* Rate master notice */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>
          <strong>Rate Master:</strong> Selling prices configured here are applied automatically
          during dispatch. Prices cannot be overridden on the dispatch page.
        </span>
      </div>

      {/* Add salesperson form */}
      {showAddSp && (
        <div className="ddm-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800">New Salesperson</h3>
            <button onClick={() => setShowAddSp(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
              <X size={15} />
            </button>
          </div>
          <form onSubmit={handleAddSalesperson} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { key: 'name',  label: 'Full Name',    req: true,  placeholder: 'e.g. Ramu' },
              { key: 'phone', label: 'Phone',         req: false, placeholder: '+91 XXXXX' },
              { key: 'route', label: 'Route / Area',  req: false, placeholder: 'e.g. North Zone' },
            ].map(({ key, label, req, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
                <input
                  value={newSp[key]}
                  onChange={e => setNewSp(p => ({ ...p, [key]: e.target.value }))}
                  required={req}
                  placeholder={placeholder}
                  className="ddm-input w-full"
                />
              </div>
            ))}
            <div className="sm:col-span-3 flex gap-3 justify-end pt-1">
              <button type="button" onClick={() => setShowAddSp(false)} className="ddm-btn-secondary">Cancel</button>
              <button type="submit" className="ddm-btn-primary"><Plus size={14} /> Add</button>
            </div>
          </form>
        </div>
      )}

      {/* Salesperson dropdown selector */}
      <div className="ddm-card p-4">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Select Salesperson
        </label>
        <select
          value={selectedSpId}
          onChange={e => { setSelectedSpId(e.target.value); setEdited({}); }}
          className="w-full ddm-input"
        >
          <option value="">Choose salesperson to configure…</option>
          {salespeople.map(sp => (
            <option key={sp.id} value={sp.id}>
              {sp.name}{sp.route ? ` — ${sp.route}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Price editor */}
      {selectedSp && (
        <div className="space-y-4">

          {/* Controls bar */}
          <div className="ddm-card p-4 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900">{selectedSp.name}</p>
              {selectedSp.route && <p className="text-xs text-slate-400 mt-0.5">{selectedSp.route}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Effective From
              </label>
              <input
                type="date"
                value={effectiveFrom}
                onChange={e => setEffFrom(e.target.value)}
                max={getIndiaDate()}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
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

          {brands.length > 0 && (
            <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={id => { setActive(id); setEdited({}); }} />
          )}

          {/* Prices table */}
          <div className="ddm-card overflow-hidden">
            {/* Header */}
            <div className="flex items-center px-5 py-3 bg-slate-50 border-b border-slate-200">
              <div className="flex-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</div>
              <div className="w-32 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Price</div>
              <div className="w-32 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">New Price</div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
              </div>
            ) : filteredPrices.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">No products for this brand</div>
            ) : (
              filteredPrices.map(p => {
                const hasPrice = p.sellingPrice !== null;
                const isDirty  = editedPrices[p.productId] !== undefined;
                return (
                  <div
                    key={p.productId}
                    className={`flex items-center px-5 py-4 border-b border-slate-100 transition-colors last:border-0 ${
                      !hasPrice ? 'bg-amber-50/60' : isDirty ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{p.productName}</span>
                      {!hasPrice && <span className="badge-amber text-[10px]">No price</span>}
                    </div>
                    <div className="w-32 text-right text-sm tabular-nums text-slate-500">
                      {hasPrice
                        ? `₹${p.sellingPrice}`
                        : <span className="text-amber-600 font-semibold text-xs">Not set</span>
                      }
                    </div>
                    <div className="w-32 flex justify-end">
                      <div className="relative w-24">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editedPrices[p.productId] ?? ''}
                          onChange={e => handlePriceChange(p.productId, e.target.value)}
                          placeholder={p.sellingPrice ?? '0.00'}
                          className={`w-full pl-6 pr-2 py-2 border rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white tabular-nums ${
                            isDirty ? 'border-indigo-400' : 'border-slate-200'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {!selectedSp && salespeople.length > 0 && (
        <div className="ddm-card flex items-center justify-center h-40 text-slate-400 text-sm">
          Select a salesperson above to configure their selling prices
        </div>
      )}
    </div>
  );
}
