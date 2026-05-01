-- Backfill: move the initial seed rows from the placeholder date (2020-01-01)
-- to the actual go-live date (2026-05-01). Only touches rows that were created
-- by the seed in the previous migration; any user-created entries are unaffected.
UPDATE "product_cost_prices"
SET    "effective_from" = '2026-05-01'::DATE
WHERE  "effective_from" = '2020-01-01'::DATE;
