import { useState, useEffect } from 'react';
import { Plus, Save, Loader2, CheckCircle, XCircle, Users, ChevronRight } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import { getIndiaDate } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function SalespeopleSetup() {
  const [salespeople, setSalespeople] = useState([]);
  const [selectedSp, setSelectedSp]   = useState(null);
  const [brands, setBrands]           = useState([]);
  const [activeBrandId, setActive]    = useState(null);
  const [prices, setPrices]           = useState([]);      // all products with current price
  const [editedPrices, setEdited]     = useState({});      // { [productId]: price }
  const [effectiveFrom, setEffFrom]   = useState(getIndiaDate());
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [notification, setNotif]      = useState(null);
  const [showAddSp, setShowAddSp]     = useState(false);
  const [newSp, setNewSp]             = useState({ name: '', phone: '', route: '' });

  const notify = (message, type = 'success') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

  useEffect(() => {
    Promise.all([
      api.get('/salespeople?all=true'),
      api.get('/brands'),
    ]).then(([spRes, brandRes]) => {
      setSalespeople(spRes.data.data);
      const b = brandRes.data.data;
      setBrands(b);
      if (b.length) setActive(b[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedSp) return;
    fetchPrices();
  }, [selectedSp]);

  async function fetchPrices() {
    setLoading(true);
    const r = await api.get(`/salespeople/${selectedSp.id}/prices`);
    setPrices(r.data.data);
    setEdited({});
    setLoading(false);
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

      if (!pricesToSave.length) { notify('No changes to save'); setSaving(false); return; }

      await api.post(`/salespeople/${selectedSp.id}/prices/bulk`, {
        effectiveFrom,
        prices: pricesToSave,
      });
      notify('Prices saved successfully');
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
      notify('Salesperson added');
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
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`} style={{ animation: 'popIn 0.25s ease' }}>
          {notification.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {notification.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Salespeople & Rates</h1><p className="text-gray-500 text-sm">Configure salespeople and their selling prices</p></div>
        <button onClick={() => setShowAddSp(!showAddSp)} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition">
          <Plus size={15} /> Add Salesperson
        </button>
      </div>

      {/* Add salesperson form */}
      {showAddSp && (
        <form onSubmit={handleAddSalesperson} className="ddm-card p-4 flex flex-wrap gap-3 items-end">
          {[
            { key: 'name',  label: 'Full Name',  req: true,  placeholder: 'e.g. Ramu' },
            { key: 'phone', label: 'Phone',       req: false, placeholder: '+91 XXXXX' },
            { key: 'route', label: 'Route/Area',  req: false, placeholder: 'e.g. North Zone' },
          ].map(({ key, label, req, placeholder }) => (
            <div key={key} className="flex-1 min-w-[160px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input value={newSp[key]} onChange={(e) => setNewSp((p) => ({ ...p, [key]: e.target.value }))} required={req} placeholder={placeholder}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
            </div>
          ))}
          <button type="submit" className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm"><Plus size={14} /> Add</button>
          <button type="button" onClick={() => setShowAddSp(false)} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Salesperson list */}
        <div className="lg:col-span-1">
          <div className="ddm-card overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex items-center gap-2">
              <Users size={15} className="text-teal-600" />
              <h3 className="font-bold text-gray-800 text-sm">Salespeople</h3>
            </div>
            {salespeople.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No salespeople yet</div>
            ) : (
              salespeople.map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => { setSelectedSp(sp); setEdited({}); }}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm border-b border-gray-50 text-left transition ${selectedSp?.id === sp.id ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  <div>
                    <div className="font-medium">{sp.name}</div>
                    {sp.route && <div className="text-xs text-gray-400">{sp.route}</div>}
                  </div>
                  <ChevronRight size={14} className={selectedSp?.id === sp.id ? 'text-teal-500' : 'text-gray-300'} />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Price editor */}
        <div className="lg:col-span-3">
          {!selectedSp ? (
            <div className="ddm-card flex items-center justify-center h-64 text-gray-400 text-sm">
              Select a salesperson to configure their prices
            </div>
          ) : (
            <div className="space-y-4">
              <div className="ddm-card p-4 flex flex-wrap items-center gap-4">
                <div className="flex-1">
                  <div className="font-bold text-gray-900">{selectedSp.name}</div>
                  {selectedSp.route && <div className="text-xs text-gray-500">{selectedSp.route}</div>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Effective From</label>
                  <input type="date" value={effectiveFrom} onChange={(e) => setEffFrom(e.target.value)} max={getIndiaDate()}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                </div>
                <button onClick={handleSavePrices} disabled={saving || !hasDirtyPrices}
                  className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-200 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition">
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Save Prices
                </button>
              </div>

              {brands.length > 0 && <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={(id) => { setActive(id); setEdited({}); }} />}

              <div className="ddm-card overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 grid grid-cols-12 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  <div className="col-span-7">Product</div>
                  <div className="col-span-3 text-right">Current Price</div>
                  <div className="col-span-2 text-right">New Price</div>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-teal-600 animate-spin" /></div>
                ) : filteredPrices.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 text-sm">No products for this brand</div>
                ) : (
                  filteredPrices.map((p) => {
                    const hasPrice = p.sellingPrice !== null;
                    const isDirty  = editedPrices[p.productId] !== undefined;
                    return (
                      <div key={p.productId} className={`px-4 py-2.5 grid grid-cols-12 gap-2 items-center border-b border-gray-50 ${!hasPrice ? 'bg-amber-50' : 'hover:bg-gray-50'} transition`}>
                        <div className="col-span-7 text-sm font-medium text-gray-800 flex items-center gap-2">
                          {p.productName}
                          {!hasPrice && <span className="badge-amber">No price</span>}
                        </div>
                        <div className="col-span-3 text-right text-sm text-gray-500">
                          {hasPrice ? `₹${p.sellingPrice}` : <span className="text-amber-600 font-medium">Not set</span>}
                        </div>
                        <div className="col-span-2">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                            <input
                              type="number" step="0.01" min="0"
                              value={editedPrices[p.productId] ?? ''}
                              onChange={(e) => handlePriceChange(p.productId, e.target.value)}
                              placeholder={p.sellingPrice ?? '0.00'}
                              className={`w-full pl-5 pr-2 py-1.5 border rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white ${isDirty ? 'border-teal-400' : 'border-gray-200'}`}
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
