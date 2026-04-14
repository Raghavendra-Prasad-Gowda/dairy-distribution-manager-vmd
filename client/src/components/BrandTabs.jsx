import { BRAND_COLORS } from '../utils/constants';

export default function BrandTabs({ brands, activeBrandId, onChange }) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1 border-b border-slate-200 w-full">
        {brands.map((brand) => {
          const isActive = brand.id === activeBrandId;
          const colors = BRAND_COLORS[brand.name] ?? BRAND_COLORS['Nandini'];
          return (
            <button
              key={brand.id}
              onClick={() => onChange(brand.id)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-all duration-150 ${
                isActive
                  ? `${colors.activeBorder} ${colors.activeText} bg-white`
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
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
