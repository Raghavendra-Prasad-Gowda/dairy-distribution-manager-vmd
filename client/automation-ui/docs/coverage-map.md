# Business-flow coverage map

[Suite README](../README.md)

Every critical business flow of the app, the UI journey that covers it, and what is deliberately left to other layers.
Status: ✅ covered by a UI journey · 🟡 partly · ⏭️ left to another suite (reason given).

## Money path - dairy side

| Flow | Status | Journey |
|---|---|---|
| Receive stock per route, re-price a saved quantity, persists after reload | ✅ | `dairy-ledger` |
| Dashboard shows the brand's outstanding / credit and a Pay Now link | ✅ | `dairy-ledger` |
| Record payment, balance drops everywhere, delete it (edit PIN) restores | ✅ | `dairy-ledger` |
| Full payment clears, overpayment shows credit | ✅ | `dairy-ledger` |
| Wrong PIN refused; zero amount refused | ✅ | `dairy-ledger` |
| Opening dues loaded as a bulk top-up (superadmin), adds to the balance | ✅ | `opening-balances` |
| Bulk top-up hidden from plain admins | ✅ | `opening-balances` |
| Edit a payment behind the PIN (amount, mode, reference); wrong PIN refused; cancel changes nothing | ✅ | `payment-history` |
| Payment history: search, mode/reference filters, clear, 15-per-page paging | ✅ | `payment-history` |
| Dairy statement, stock summary (route filter) | ✅ | `reports` |
| Deposit report: crate deposit from stock (litres x rate), deposit top-up adds to it, delete restores; ledger untouched | ✅ | `deposit-and-stock-balance` |

## Money path - salesperson side

| Flow | Status | Journey |
|---|---|---|
| Salesman enters stock at own rate, draft survives reload, only enabled products offered | ✅ | `salesman/stock-entry` |
| Finalize locks the entry; balance and statement show the bill | ✅ | `salesman/stock-entry` |
| Dispatch sheet shows submitted entry, locked, right totals | ✅ | `salesperson-ledger` |
| Admin unlock / re-lock | ✅ | `salesperson-ledger` |
| Edit a collection behind the PIN; Reset Ledger (superadmin, PIN) clears the dues | ✅ | `payment-history`, `opening-balances` |
| Dispatcher lock / unlock today; Finalize Day offered, Undo hidden | ✅ | `dispatcher` |
| Collection lowers balance on collections, outstanding, day balance, statement; delete (PIN) restores | ✅ | `salesperson-ledger` |
| Full payment clears the outstanding card | ✅ | `salesperson-ledger` |
| Salesperson opening dues (bulk top-up) raise the balance on every screen | ✅ | `opening-balances` |
| Pricing set by admin reaches the phone | ✅ | `pricing-and-bills` |
| Bulk Update Prices, Copy Prices, Bulk Product Access (phone follows) | ✅ | `bulk-pricing` |
| Exception Manager: grant a globally-off product to one salesperson at their price, then remove it | ✅ | `exception-manager` |
| Stock Balance: supply, dispatched, shortage and the per-salesperson row; empty day | ✅ | `deposit-and-stock-balance` |
| Salesman's own statement narrowed by date range | ✅ | `salesman/statement` |
| Bill preview, issue, delete | ✅ | `pricing-and-bills` |
| Profit & Loss figures (cost, rate, qty, revenue, profit) behind the P&L PIN | ✅ | `reports` |
| P&L PIN gate (wrong / right PIN) | ✅ | `access-roles` |

## Setup, accounts and security

| Flow | Status | Journey |
|---|---|---|
| Sign in, wrong credentials, disabled button, signed-out redirects, sign out + back button | ✅ | `login` |
| Every admin screen opens without script/5xx errors; menu; old bookmarks; unknown URL | ✅ | `navigation` |
| Categories / routes / products: add, duplicate, edit, price change, archive/delete | ✅ | `catalog-setup` |
| Salesman users: add, validate, disable/enable, new credentials, delete | ✅ | `salesman-users` |
| Dispatcher login created, can sign in, disabled, deleted; own account protected | ✅ | `superadmin` |
| Role access: dispatcher sees dispatch screens only; Admin Users superadmin-only | ✅ | `access-roles`, `navigation` |
| Salesman password change | ✅ | `salesman/security` |
| Brands: add, rename, deposit rate, disable/enable, archive; name required | ✅ | `brands-setup` |
| Admin users: edit (password + role take effect), require/lift MFA, locked login unlocked | ✅ | `admin-users` |
| Layout: move a category, save, survives reload, stock grid follows | ✅ | `layout-settings` |
| Salesman stock entry: +/- steppers, Enter to next, search, collapse/expand | ✅ | `salesman/stock-entry-controls` |

## Left to other layers (and why)

| Flow | Where | Reason |
|---|---|---|
| Finalize the day | `server/automation` (`@shared-state`) | locks every salesperson's entry on a shared environment |
| Dispatch above available stock is refused | none | `stockGuard` is intentionally not wired in (accepted risk in `controllers/dispatches/write.js`) |
| MFA enrolment, lock-out after 5 wrong passwords | `server/tests` (mocked) | would lock the shared E2E accounts |
| Print / PDF routes (`/print/*`) | Vitest | open in a new window; no stable assertion on paper output |
| Brand creation, PIN change, ledger reset | `server/automation` | one-way / destructive on shared data |

## Vitest tests retired because a journey now covers them

55 component tests were removed from `client/src/**/*.test.jsx`: happy-path actions whose real result (saved, shown,
persisted, balance moved) is now proven in the browser against the real API. Error, cancel, validation and
role-visibility cases stay in Vitest, where they are fast and run on every PR.

| Vitest file | Removed | Covered now by |
|---|---|---|
| `payments/DairyPayments.test.jsx` | 20: balance statuses, history search/filters/paging, record, PIN-gated edit and delete, bulk top-up | `dairy-ledger`, `payment-history`, `opening-balances` |
| `payments/SalespersonCollections.test.jsx` | 11: record, PIN-gated edit and delete, bulk top-up, reset ledger | `salesperson-ledger`, `payment-history`, `opening-balances` |
| `setup/BrandsSetup.test.jsx` | 7: add, rename, enable/disable, archive, deposit save, name required | `brands-setup` |
| `setup/AdminUsersSetup.test.jsx` | 9: create, enable/disable, edit, require/lift MFA, locked badge and unlock | `superadmin`, `admin-users` |
| `setup/LayoutSettings.test.jsx` | 2: move a category, save payload | `layout-settings` |
| `salesman/StockEntry.test.jsx` | 6: typed quantity, steppers, Enter-to-next, no-match search | `salesman/stock-entry`, `salesman/stock-entry-controls` |

After the cleanup: 1,403 -> 1,348 tests; coverage 94.7/85.0/93.9/96.5 -> 92.8/84.2/90.4/94.9 (statements/branches/
functions/lines), still well above the PR gate of 78/68/70/80. The browser suite does not count towards that gate,
so remove further Vitest tests only after re-running `npm run test:coverage`.

## Budgets worth knowing

- **Sign-ins:** 20 per hour per IP. The admin and the superadmin each sign in once (setup project) and are reused.
- **PIN checks:** 20 per 15 minutes per IP (`/pin/verify`, `/pin/verify-pl`). A full run uses about 11 (payment
  deletes and edits, Reset Ledger, Profit & Loss). Rerunning PIN specs repeatedly locally can hit the limit and fail
  with a missing prompt; wait for the window to reset.

## Known remaining gaps

Smaller items still untested in the browser: crate counts on Stock Balance (needs a crate-sized product), the
dispatch-summary view of the salesman statement, collections history filters and paging (covered for dairy payments),
changing the Edit PIN / P&L PIN (would change the shared PIN), and print/PDF output.
