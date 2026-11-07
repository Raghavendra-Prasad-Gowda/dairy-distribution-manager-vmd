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
| Dairy statement, stock summary (route filter) | ✅ | `reports` |
| Deposit report: crate deposit from stock (litres x rate), deposit top-up adds to it, delete restores; ledger untouched | ✅ | `deposit-and-stock-balance` |

## Money path - salesperson side

| Flow | Status | Journey |
|---|---|---|
| Salesman enters stock at own rate, draft survives reload, only enabled products offered | ✅ | `salesman/stock-entry` |
| Finalize locks the entry; balance and statement show the bill | ✅ | `salesman/stock-entry` |
| Dispatch sheet shows submitted entry, locked, right totals | ✅ | `salesperson-ledger` |
| Admin unlock / re-lock | ✅ | `salesperson-ledger` |
| Dispatcher lock / unlock today; Finalize Day offered, Undo hidden | ✅ | `dispatcher` |
| Collection lowers balance on collections, outstanding, day balance, statement; delete (PIN) restores | ✅ | `salesperson-ledger` |
| Full payment clears the outstanding card | ✅ | `salesperson-ledger` |
| Salesperson opening dues (bulk top-up) raise the balance on every screen | ✅ | `opening-balances` |
| Pricing set by admin reaches the phone | ✅ | `pricing-and-bills` |
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

## Left to other layers (and why)

| Flow | Where | Reason |
|---|---|---|
| Finalize the day | `server/automation` (`@shared-state`) | locks every salesperson's entry on a shared environment |
| Dispatch above available stock is refused | none | `stockGuard` is intentionally not wired in (accepted risk in `controllers/dispatches/write.js`) |
| MFA enrolment, lock-out after 5 wrong passwords | `server/tests` (mocked) | would lock the shared E2E accounts |
| Print / PDF routes (`/print/*`) | Vitest | open in a new window; no stable assertion on paper output |
| Brand creation, PIN change, ledger reset | `server/automation` | one-way / destructive on shared data |

## Known remaining gaps

None of the business flows above are open. Smaller items still untested in the browser: crate counts on Stock Balance
(needs a crate-sized product), the dispatch-summary view of the salesman statement, and print/PDF output.
