import { useState, useEffect } from 'react';
import { Store, Loader2, Save } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

export default function BrandsSetup() {
  const { notify } = useNotification();
  const [brands, setBrands]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(null); // brandId being saved

  useEffect(() => {
    setLoading(true);
    api.get('/brands')
      .then(r => setBrands(r.data.data ?? []))
      .catch(() => notify('Failed to load brands', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const updateField = (id, field, value) => {
    setBrands(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
  };

  const handleSave = async (brand) => {
    setSaving(brand.id);
    try {
      await api.put(`/brands/${brand.id}`, {
        depositEnabled:  brand.depositEnabled,
        depositPerLitre: parseFloat(brand.depositPerLitre) || 0,
      });
      notify(`${brand.name} deposit settings saved`, 'success');
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to save', 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <Store size={17} className="text-emerald-300 flex-shrink-0" />
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">Brands</h1>
          <p className="text-emerald-300 text-xs">Configure deposit settings per dairy brand</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 md:p-8 max-w-2xl mx-auto w-full space-y-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : (
          brands.map(brand => (
            <div key={brand.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

              {/* Brand name bar */}
              <div className="flex items-center gap-2.5 px-5 py-3.5 bg-emerald-50 border-b border-emerald-100">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="font-bold text-emerald-800 text-sm">{brand.name}</span>
              </div>

              <div className="px-5 py-4 space-y-4">

                {/* Deposit toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Charge deposit</p>
                    <p className="text-xs text-slate-400 mt-0.5">Calculate deposit on every litre of ml products received</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateField(brand.id, 'depositEnabled', !brand.depositEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${brand.depositEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${brand.depositEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Deposit rate — only when enabled */}
                {brand.depositEnabled && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      Deposit rate (₹ per litre)
                    </label>
                    <div className="relative max-w-xs">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">₹</span>
                      <input
                        type="number" step="0.01" min="0"
                        value={brand.depositPerLitre ?? ''}
                        onChange={e => updateField(brand.id, 'depositPerLitre', e.target.value)}
                        placeholder="e.g. 0.20"
                        className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      e.g. ₹0.20 means 20 paise per litre received
                    </p>
                  </div>
                )}

                <div className="pt-1">
                  <button
                    onClick={() => handleSave(brand)}
                    disabled={saving === brand.id}
                    className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-4 py-2 rounded-xl transition text-sm"
                  >
                    {saving === brand.id
                      ? <><Loader2 className="animate-spin" size={14} /> Saving…</>
                      : <><Save size={14} /> Save</>
                    }
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
