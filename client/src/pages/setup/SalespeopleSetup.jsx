import { useState, useEffect } from 'react';
import { Plus, Save, Loader2, Users, ChevronRight, Info } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function SalespeopleSetup() {
  const { notify } = useNotification();
  const [salespeople, setSalespeople] = useState([]);
  const [selectedSp, setSelectedSp]   = useState(null);
  const [brands, setBrands]           = useState([]);
  const [activeBrandId, setActive]    = useState(null);
  const [prices, setPrices]           = useState([]);      // all products with current price
  const [editedPrices, setEdited]     = useState({});      // { [productId]: price }
  const [effectiveFrom, setEffFrom]   = useState(getIndiaDate());
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [showAddSp, setShowAddSp]     = useState(false);
  const [newSp, setNewSp]             = useState({ name: '', phone: '', route: '' });

  useEffect(() => {
    Promise.all([
      api.get('/salespeople?all=true'),
      api.get('/brands'),
    ])
      .then(([spRes, brandRes]) => {
        setSalespeople(spRes.data.data);
        const b = brandRes.data.data;
        setBrands(b);
        if (b.length) setActive(b[0].id);
      })
      .catch(() => notify('Failed to load data', 'error'));
  }, []);

  useEffect(() => {
    if (!selectedSp) return;
    fetchPrices();
  }, [selectedSp]);

  async function fetchPrices() {
    setLoading(true);
    try {
      const r = await api.get(`/salespeople/${selectedSp.id}/prices`);
      setPrices(r.data.data);
      setEdited({});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to load prices', 'error');
    } finally {
      setLoading(false);
    }
  }

  const filteredPrices = prices.filter((p) => p.brandId === activeBrandId);

  const handlePriceChange = (productId, value) => {
    setEdited((prev) => ({ ...prev, [productId]: value }));
  };

  const handleSavePrices = async () => {
    setSaving(true);
    try {
      const pricesToSave = filteredPrices
        .filter((p) => editedPrices[p.productId] !== undefined)
        .map((p) => ({ productId: p.productId, sellingPrice: parseFloat(editedPrices[p.productId]) || 0 }));

      if (!pricesToSave.length) { notify('No changes to save', 'warning'); setSaving(false); return; }

      await api.post(`/salespeople/${selectedSp.id}/prices/bulk`, {
        effectiveFrom,
        prices: pricesToSave,
      });
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
      setSelectedSp(r.data.data);
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to add salesperson', 'error');
    }
  };

  const hasDirtyPrices = Object.keys(editedPrices).length > 0;

  return (
    <div className="p-5 md:p-6 max-w-5xl mx-auto space-y-5">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Salespeople & Rates</h1>
          <p className="text-slate-500 text-sm mt-0.5">Configure salespeople and their selling prices</p>
        </div>
        <button
          onClick={() => setShowAddSp(!showAddSp)}
          className="ddm-btn-primary flex-shrink-0"
        >
          <Plus size={15} /> Add Salesperson
        </button>
      </div>

      {/* ── Rate master notice ─────────────────────────────────────── */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>
          <strong>Rate Master:</strong> Selling prices configured here are used automatically
          when dispatching stock to salespeople. Prices cannot be overridden during dispatch.
        </span>
      </div>

      {/* ── Add salesperson form ───────────────────────────────────── */}
      {showAddSp && (
        <form onSubmit={handleAddSalesperson} className="ddm-card p-4 flex flex-wrap gap-3 items-end">
          {[
            { key: 'name',  label: 'Full Name',  req: true,  placeholder: 'e.g. Ramu' },
            { key: 'phone', label: 'Phone',       req: false, placeholder: '+91 XXXXX' },
            { key: 'route', label: 'Route / Area', req: false, placeholder: 'e.g. North Zone' },
          ].map(({ key, label, req, placeholder }) => (
            <div key={key} className="flex-1 min-w-[150px]">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                {label}
              </label>
              <input
                value={newSp[key]}
                onChange={(e) => setNewSp((p) => ({ ...p, [key]: e.target.value }))}
                required={req}
                placeholder={placeholder}
                className="ddm-input"
              />
            </div>
          ))}
          <button type="submit" className="ddm-btn-primary">
            <Plus size={14} /> Add
          </button>
          <button
            type="button"
            onClick={() => setShowAddSp(false)}
            className="ddm-btn-secondary"
          >
            Cancel
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">

        {/* ── Salesperson list ───────────────────────────────────────── */}
        <div className="md:col-span-1">
          <div className="ddm-card overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
              <Users size={14} className="text-teal-600" />
              <h3 className="font-bold text-slate-800 text-sm">Salespeople</h3>
            </div>
            {salespeople.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No salespeople yet</div>
            ) : (
              salespeople.map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => { setSelectedSp(sp); setEdited({}); }}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm border-b border-slate-50 text-left transition-colors last:border-0 ${
                    selectedSp?.id === sp.id
                      ? 'bg-teal-50 text-teal-700 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50/60'
                  }`}
                >
                  <div>
                    <div className="font-medium text-sm">{sp.name}</div>
                    {sp.route && <div className="text-xs text-slate-400">{sp.route}</div>}
                  </div>
                  <ChevronRight
                    size={14}
                    className={selectedSp?.id === sp.id ? 'text-teal-500' : 'text-slate-300'}
                  />
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Price editor ───────────────────────────────────────────── */}
        <div className="md:col-span-3">
          {!selectedSp ? (
            <div className="ddm-card flex items-center justify-center h-48 text-slate-400 text-sm">
              Select a salesperson to configure their selling prices
            </div>
          ) : (
            <div className="space-y-4">
              {/* Salesperson header + controls */}
              <div className="ddm-card p-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-sm">{selectedSp.name}</div>
                  {selectedSp.route && (
                    <div className="text-xs text-slate-400 mt-0.5">{selectedSp.route}</div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Effective From
                  </label>
                  <input
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffFrom(e.target.value)}
                    max={getIndiaDate()}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
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
                <BrandTabs
                  brands={brands}
                  activeBrandId={activeBrandId}
                  onChange={(id) => { setActive(id); setEdited({}); }}
                />
              )}

              {/* Prices table */}
              <div className="ddm-card overflow-hidden">
                <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-200 px-4 py-2.5">
                  {['Product', 'Current Price', 'New Price'].map((h, i) => (
                    <div
                      key={i}
                      className={`${
                        i === 0 ? 'col-span-6' :
                        i === 1 ? 'col-span-3 text-right' :
                        'col-span-3 text-right'
                      } text-xs font-semibold text-slate-500 uppercase tracking-wider`}
                    >
                      {h}
                    </div>
                  ))}
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 text-teal-600 animate-spin" />
                  </div>
                ) : filteredPrices.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm">
                    No products for this brand
                  </div>
                ) : (
                  filteredPrices.map((p) => {
                    const hasPrice = p.sellingPrice !== null;
                    const isDirty  = editedPrices[p.productId] !== undefined;
                    return (
                      <div
                        key={p.productId}
                        className={`grid grid-cols-12 items-center px-4 py-2.5 border-b border-slate-100 transition-colors last:border-0 ${
                          !hasPrice ? 'bg-amber-50/60' : isDirty ? 'bg-teal-50/40' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="col-span-6 text-sm font-medium text-slate-800 flex items-center gap-2">
                          {p.productName}
                          {!hasPrice && <span className="badge-amber">No price</span>}
                        </div>
                        <div className="col-span-3 text-right text-sm tabular-nums text-slate-500">
                          {hasPrice
                            ? `₹${p.sellingPrice}`
                            : <span className="text-amber-600 font-medium text-xs">Not set</span>
                          }
                        </div>
                        <div className="col-span-3 flex justify-end">
                          <div className="relative w-20">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editedPrices[p.productId] ?? ''}
                              onChange={(e) => handlePriceChange(p.productId, e.target.value)}
                              placeholder={p.sellingPrice ?? '0.00'}
                              className={`w-full pl-5 pr-2 py-1.5 border rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white tabular-nums ${
                                isDirty ? 'border-teal-400' : 'border-slate-200'
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
        </div>
      </div>
    </div>
  );
}
