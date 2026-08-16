import { Search, X, Globe } from 'lucide-react';

const GLOBAL_ID = 'global';

// Row for a single salesperson in the sidebar list — module-scope (not
// redefined per render) since it doesn't need to close over anything
// besides its own props.
function SpRow({ sp, selectedSpId, onSelect }) {
  const isSelected = String(sp.id) === String(selectedSpId);
  return (
    <button
      type="button"
      onClick={() => onSelect(sp.id)}
      className={`w-full text-left px-3 py-2.5 border-l-4 transition-colors ${
        isSelected
          ? 'bg-emerald-50 border-emerald-600'
          : 'border-transparent hover:bg-slate-50 active:bg-slate-100'
      }`}
    >
      <p className={`text-sm font-semibold leading-tight truncate ${isSelected ? 'text-emerald-800' : 'text-slate-800'}`}>
        {sp.name}
      </p>
      {sp.route && <p className="text-xs text-slate-400 leading-tight mt-0.5">{sp.route}</p>}
    </button>
  );
}

/**
 * Left panel — salesperson search, "Global" settings entry, and the
 * filtered salesperson list. Selecting an entry clears all per-person /
 * global dirty state via `onSelect`.
 *
 * Note: the empty-list message below checks `search` (the product search
 * from the right panel), not `spSearch` (this sidebar's own search box) —
 * that's carried over unchanged from the original monolith to preserve
 * exact behavior during this decomposition, not something newly introduced.
 */
export default function SalespersonSidebar({
  filteredSalespeople,
  spSearch,
  setSpSearch,
  selectedSpId,
  search,
  onSelect,
}) {
  return (
    <aside className="flex flex-col w-[220px] flex-shrink-0 border-r border-slate-200 bg-white">

      {/* Search */}
      <div className="p-3 border-b border-slate-100 flex-shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={spSearch}
            onChange={e => setSpSearch(e.target.value)}
            placeholder="Search salesperson…"
            className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          {spSearch && (
            <button onClick={() => setSpSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Salesperson list */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
        {/* Global Settings option */}
        <button
          type="button"
          onClick={() => onSelect(GLOBAL_ID)}
          className={`w-full text-left px-3 py-2.5 border-l-4 transition-colors flex items-center gap-2 ${
            selectedSpId === GLOBAL_ID
              ? 'bg-emerald-50 border-emerald-600'
              : 'border-transparent hover:bg-slate-50 active:bg-slate-100'
          }`}
        >
          <Globe size={14} className={selectedSpId === GLOBAL_ID ? 'text-emerald-700' : 'text-slate-500'} />
          <span className={`text-sm font-semibold leading-tight ${selectedSpId === GLOBAL_ID ? 'text-emerald-800' : 'text-slate-800'}`}>
            Global
          </span>
        </button>

        {/* Salesperson list */}
        {filteredSalespeople.length === 0 ? (
          <li className="px-3 py-6 text-center text-slate-400 text-xs">
            {search ? 'No results' : 'No salespeople'}
          </li>
        ) : (
          filteredSalespeople.map(sp => (
            <SpRow key={sp.id} sp={sp} selectedSpId={selectedSpId} onSelect={onSelect} />
          ))
        )}
      </div>
    </aside>
  );
}
