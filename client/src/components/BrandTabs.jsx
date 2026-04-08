import { BRAND_COLORS } from '../utils/constants';

export default function BrandTabs({ brands, activeBrandId, onChange }) {
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
      {brands.map((brand) => {
        const isActive = brand.id === activeBrandId;
        const colors = BRAND_COLORS[brand.name] ?? BRAND_COLORS['Nandini'];
        return (
          <button
            key={brand.id}
            onClick={() => onChange(brand.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
              isActive
                ? 'bg-white shadow-sm ' + colors.text
                : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isActive ? colors.dot : 'bg-gray-300'}`} />
            {brand.name}
          </button>
        );
      })}
    </div>
  );
}
