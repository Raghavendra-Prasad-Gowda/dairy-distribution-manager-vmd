import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { useNotification } from '../../context/NotificationContext';
import { getBrandColors } from '../../utils/constants';
import BrandsSetup      from './BrandsSetup';
import RouteSetup       from './RouteSetup';
import CategorySetup    from './CategorySetup';
import LayoutSettings   from './LayoutSettings';
import api from '../../api/axios';

const SECTIONS = [
  { id: 'brands',     label: 'Brands'     },
  { id: 'routes',     label: 'Routes'     },
  { id: 'categories', label: 'Categories' },
  { id: 'layout',     label: 'Layout'     },
];

export default function DairySettings() {
  const { notify } = useNotification();
  const [brands, setBrands]               = useState([]);
  const [activeBrandId, setActiveBrandId] = useState(null);
  const [activeSection, setActiveSection] = useState('brands');
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    api.get('/brands')
      .then(r => {
        const b = r.data.data ?? [];
        setBrands(b);
        if (b.length) setActiveBrandId(b[0].id);
      })
      .catch(() => notify('Failed to load brands', 'error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full">

      {/* Page header */}
      <div className="flex items-center gap-2.5 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <Settings size={17} className="text-emerald-300 flex-shrink-0" />
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">Dairy Settings</h1>
          <p className="text-emerald-300 text-xs">Brands, routes, categories and layout</p>
        </div>
      </div>

      {/* Brand tabs */}
      {!loading && brands.length > 0 && (
        <div className="bg-white border-b border-slate-200 px-4 md:px-6 pt-3 pb-0 flex-shrink-0">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-1.5 pb-0.5">
              {brands.map((brand, index) => {
                const isActive = brand.id === activeBrandId;
                const colors = getBrandColors(brand.name, index);
                return (
                  <button
                    key={brand.id}
                    onClick={() => setActiveBrandId(brand.id)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold whitespace-nowrap rounded-xl border-b-2 -mb-px transition-all duration-150 ${
                      isActive
                        ? `${colors.activeBorder} ${colors.activeText} bg-white border border-b-2`
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? colors.dot : 'bg-slate-300'}`} />
                    {brand.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Section tabs */}
      {!loading && (
        <div className="bg-white border-b border-slate-100 px-4 md:px-6 py-2 flex-shrink-0">
          <div className="flex gap-1.5">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`px-4 py-1.5 text-sm font-semibold rounded-xl transition-all duration-150 ${
                  activeSection === s.id
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex-1"><BrandedLoader /></div>
      ) : (
        <div className="flex-1 overflow-hidden">
          {activeSection === 'brands'     && <BrandsSetup   shellActiveBrandId={activeBrandId} />}
          {activeSection === 'routes'     && <RouteSetup    shellActiveBrandId={activeBrandId} shellBrands={brands} />}
          {activeSection === 'categories' && <CategorySetup shellActiveBrandId={activeBrandId} shellBrands={brands} />}
          {activeSection === 'layout'     && <LayoutSettings shellActiveBrandId={activeBrandId} shellBrands={brands} />}
        </div>
      )}
    </div>
  );
}
