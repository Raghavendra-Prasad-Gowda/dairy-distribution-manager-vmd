import { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { useNotification } from '../../context/NotificationContext';
import { getBrandColors } from '../../utils/constants';
import DairyStatement from './DairyStatement';
import StockSummary   from './StockSummary';
import DepositReport  from './DepositReport';
import api from '../../api/axios';

const SECTIONS = [
  { id: 'statement', label: 'Statement'     },
  { id: 'stock',     label: 'Stock Summary' },
  { id: 'deposit',   label: 'Deposit'       },
];

export default function DairyReports() {
  const { notify } = useNotification();
  const [brands, setBrands]               = useState([]);
  const [activeBrandId, setActiveBrandId] = useState(null);
  const [activeSection, setActiveSection] = useState('statement');
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
  }, [notify]);

  return (
    <div className="flex flex-col h-full">

      {/* Page header */}
      <div className="flex items-center gap-2.5 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <FileText size={17} className="text-emerald-300 flex-shrink-0" />
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">Dairy Reports</h1>
          <p className="text-emerald-300 text-xs">Statement, stock summary and deposit</p>
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
          {activeSection === 'statement' && <DairyStatement shellActiveBrandId={activeBrandId} shellBrands={brands} />}
          {activeSection === 'stock'     && <StockSummary   shellActiveBrandId={activeBrandId} shellBrands={brands} />}
          {activeSection === 'deposit'   && <DepositReport  shellActiveBrandId={activeBrandId} shellBrands={brands} />}
        </div>
      )}
    </div>
  );
}
