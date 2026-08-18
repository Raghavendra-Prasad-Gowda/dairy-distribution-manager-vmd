import { useState, useMemo, useEffect, useCallback } from 'react';
import { useDisclosure } from './useDisclosure';

const PER_PAGE = 15;

/**
 * Shared filter / search / pagination state for payment history lists.
 * Used by DairyPayments and SalespersonCollections to eliminate duplicated
 * ~60 LOC of state + derived-value boilerplate.
 *
 * @param {Array}   payments     The full payments array to filter + paginate.
 * @param {object}  [opts]
 * @param {boolean} [opts.searchable=false]  Enable full-text search across amount, mode, reference, date.
 * @param {Array}   [opts.resetDeps=[]]      Extra deps that reset the page to 1 (e.g. activeBrandId).
 * @returns {object}
 */
export function usePaymentFilters(payments, { searchable = false, resetDeps = [] } = {}) {
  const filterPanel = useDisclosure();

  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo,   setFilterTo]   = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [filterRef,  setFilterRef]  = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const hasFilters = !!(filterFrom || filterTo || filterMode || filterRef);
  const hasSearch  = searchable && searchQuery.trim().length > 0;

  const filteredPayments = useMemo(() => {
    const q = searchable ? searchQuery.trim().toLowerCase() : '';
    return payments.filter(p => {
      const dateStr = p.paymentDate?.slice(0, 10) ?? '';
      if (filterFrom && dateStr < filterFrom) return false;
      if (filterTo   && dateStr > filterTo)   return false;
      if (filterMode && p.paymentMode !== filterMode) return false;
      if (filterRef  && !(p.reference ?? '').toLowerCase().includes(filterRef.toLowerCase())) return false;
      if (q) {
        const amount = String(p.amount ?? '');
        const ref    = (p.reference ?? '').toLowerCase();
        const mode   = (p.paymentMode ?? '').toLowerCase();
        const date   = new Date(dateStr + 'T00:00:00')
          .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          .toLowerCase();
        if (!amount.includes(q) && !ref.includes(q) && !mode.includes(q) && !date.includes(q)) return false;
      }
      return true;
    });
  }, [payments, searchQuery, filterFrom, filterTo, filterMode, filterRef, searchable]);

  // Reset to page 1 when filters, search, or caller-specified deps change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [searchQuery, filterFrom, filterTo, filterMode, filterRef, ...resetDeps]);

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / PER_PAGE));
  const pagedPayments = filteredPayments.slice(
    (page - 1) * PER_PAGE,
    page * PER_PAGE,
  );

  const clearFilters = useCallback(() => {
    setFilterFrom('');
    setFilterTo('');
    setFilterMode('');
    setFilterRef('');
  }, []);

  return {
    // Filter panel toggle
    filterPanel,

    // Individual filter values + setters (used by the filter inputs)
    filterFrom, setFilterFrom,
    filterTo,   setFilterTo,
    filterMode, setFilterMode,
    filterRef,  setFilterRef,

    // Search (only meaningful when searchable=true)
    searchQuery, setSearchQuery,

    // Derived booleans
    hasFilters,
    hasSearch,

    // Filtered + paginated data
    filteredPayments,
    pagedPayments,

    // Pagination controls
    page, setPage, totalPages, perPage: PER_PAGE,

    // Actions
    clearFilters,
  };
}
