import { BRAND_COLORS } from '../utils/constants';

export default function BrandTabs({ brands, activeBrandId, onChange }) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1.5 pb-0.5">
        {brands.map((brand) => {
          const isActive = brand.id === activeBrandId;
          const colors = BRAND_COLORS[brand.name] ?? BRAND_COLORS['Nandini'];
          return (
            <button
              key={brand.id}
              onClick={() => onChange(brand.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold whitespace-nowrap rounded-xl border-b-2 -mb-px transition-all duration-150 ${
                isActive
                  ? `${colors.activeBorder} ${colors.activeText} bg-white border border-b-2`
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  isActive ? colors.dot : 'bg-slate-300'
                }`}
              />
              {brand.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
