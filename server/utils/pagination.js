'use strict';

/**
 * Opt-in server-side pagination for list endpoints.
 *
 * Kept backward-compatible: pagination only engages when the request supplies
 * `page` or `limit`. Without them, callers get the existing un-paginated
 * response unchanged — so adding this to an endpoint never alters an existing
 * client's behavior. Mirrors the envelope already used by
 * salespersonBalance.getHistory: { items, pagination: { total, page, limit,
 * pages, hasMore } }.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse pagination params from a query object.
 * @returns {{page:number, limit:number, skip:number}|null} null when the caller
 *          asked for no pagination (neither page nor limit present).
 */
function getPaginationParams(query) {
  if (query.page === undefined && query.limit === undefined) return null;
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

/** Build the pagination metadata block for a paginated response. */
function buildPaginationMeta(total, page, limit) {
  const pages = Math.ceil(total / limit);
  return { total, page, limit, pages, hasMore: page < pages };
}

module.exports = { getPaginationParams, buildPaginationMeta, DEFAULT_LIMIT, MAX_LIMIT };
