import { Search, X, Copy, Package, Unlock, Save } from 'lucide-react';
import { TumblerSpinner } from '../../../components/ui/BrandedLoader';

/**
 * Search box + per-mode action buttons (per-person: enabled-only toggle,
 * copy prices; global: enable/disable-all, the bulk modals, exception
 * manager, view price list, clear-all) + the Save button.
 */
export default function PriceToolbar({
  isGlobal,
  search,
  setSearch,
  showEnabledOnly,
  setShowEnabledOnly,
  isSuperAdmin,
  onOpenCopyModal,
  onOpenBulkUpdateModal,
  onOpenBulkProductModal,
  onOpenExceptionModal,
  onOpenAllSalesmenPrices,
  onOpenClearAllConfirm,
  onToggleAllGlobal,
  allBrandEnabled,
  allBrandDisabled,
  onSave,
  saving,
  hasDirty,
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by product name or category…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>
      {!isGlobal && (
        <>
          <button
            onClick={() => setShowEnabledOnly(v => {
              localStorage.setItem('sp_showEnabledOnly', String(!v));
              return !v;
            })}
            className={`text-xs font-semibold px-3 py-2 rounded-xl border transition whitespace-nowrap flex-shrink-0 ${
              showEnabledOnly
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600'
            }`}
          >
            {showEnabledOnly ? 'Enabled only' : 'Show all'}
          </button>
          <button
            onClick={onOpenCopyModal}
            className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 transition whitespace-nowrap"
          >
            <Copy size={12} /> Copy Prices
          </button>
        </>
      )}
      {isGlobal && (
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <button
            onClick={() => onToggleAllGlobal(true)}
            disabled={allBrandEnabled}
            className="text-xs font-semibold px-3 py-2 rounded-xl border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
          >
            Enable All
          </button>
          <button
            onClick={() => onToggleAllGlobal(false)}
            disabled={allBrandDisabled}
            className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
          >
            Disable All
          </button>
          <button
            onClick={onOpenBulkUpdateModal}
            className="text-xs font-semibold px-3 py-2 rounded-xl border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition whitespace-nowrap"
          >
            Bulk Update Prices
          </button>
          <button
            onClick={onOpenBulkProductModal}
            className="text-xs font-semibold px-3 py-2 rounded-xl border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition whitespace-nowrap flex items-center gap-1.5"
          >
            <Package size={14} />
            Bulk Product Access
          </button>
          {/* Exception Manager — superadmin only */}
          {isSuperAdmin && (
            <button
              onClick={onOpenExceptionModal}
              className="text-xs font-semibold px-3 py-2 rounded-xl border border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 transition whitespace-nowrap flex items-center gap-1.5"
              title="Enable globally-disabled products for specific salespeople"
            >
              <Unlock size={13} />
              Exception Manager
            </button>
          )}
          <button
            onClick={onOpenAllSalesmenPrices}
            className="text-xs font-semibold px-3 py-2 rounded-xl border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition whitespace-nowrap"
          >
            View Price List
          </button>
          <button
            onClick={onOpenClearAllConfirm}
            className="text-xs font-semibold px-3 py-2 rounded-xl border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition whitespace-nowrap"
          >
            Clear All Salesman Prices
          </button>
        </div>
      )}
      <button
        onClick={onSave}
        disabled={saving || !hasDirty}
        className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-4 py-2 rounded-xl transition text-sm shadow-sm whitespace-nowrap"
      >
        {saving ? <TumblerSpinner size={14} /> : <Save size={14} />}
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
