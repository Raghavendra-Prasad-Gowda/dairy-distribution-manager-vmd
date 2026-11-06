# Vitest → Playwright migration map

[⬅️ Suite README](../README.md)

The 82 Vitest files in `client/src` are being ported to real-browser specs in this suite (deployed API, real
database, nothing mocked). Vitest stays for pure logic and for the coverage gate in `pr-checks.yml`.

Porting rules: one **journey** per test (not one assertion per test); selectors in `src/pages/`; data created through
the UI and removed by `trackCreated`; assertions against what the API itself returned instead of fixed mock values;
web-first assertions and `waitForResponse` instead of sleeps; every spec runs on both iPad orientations
(salesman specs on a phone). Cases that need a forced API failure, fixed mock numbers or an MFA account cannot be
reproduced against a real environment and remain Vitest-only.

| Vitest file | Status |
|---|---|
| `api/axios.test.js` | 🔒 stays in Vitest (pure logic, no screen) |
| `api/coldStart.test.js` | 🔒 stays in Vitest (pure logic, no screen) |
| `components/BalanceLedger.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/BalanceSummaryCard.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/BillSheet.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/BrandTabs.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/BulkTopUpModal.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/ColdStartScreen.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/ConfirmationModal.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/DateSelector.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/DispatchStockSummary.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/ErrorBoundary.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/Layout.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/Pagination.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/PaymentForm.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/PinModal.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/ResetLedgerModal.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/SaveOverlay.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/StatusBadge.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/VersionTag.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/ui/Alert.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/ui/BrandedLoader.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/ui/Button.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/ui/EmptyState.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/ui/LoadingOverlay.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `components/ui/Modal.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `context/AuthContext.test.jsx` | 🔒 stays in Vitest (pure logic, no screen) |
| `context/NotificationContext.test.jsx` | 🔒 stays in Vitest (pure logic, no screen) |
| `hooks/hooks.test.jsx` | ➡️ covered through the page specs that use it; unit file stays in Vitest |
| `pages/Dashboard.test.jsx` | ✅ ported → `dashboard.spec.ts` |
| `pages/Login.test.jsx` | 🟡 partly → login.spec.ts (password/username handling; MFA steps stay in Vitest — E2E accounts have no MFA) |
| `pages/SalespersonOutstanding.test.jsx` | ⏳ to port (page journey) |
| `pages/daily/StockReceipt.test.jsx` | ⏳ to port (page journey) |
| `pages/dairy/PriceSetup.test.jsx` | ⏳ to port (page journey) |
| `pages/payments/DairyPayments.test.jsx` | ⏳ to port (page journey) |
| `pages/payments/SalespersonCollections.test.jsx` | ⏳ to port (page journey) |
| `pages/reports/BillPrint.test.jsx` | ⏳ to port (print view, assert rendered content) |
| `pages/reports/DailyDispatchSummary.test.jsx` | ⏳ to port (page journey) |
| `pages/reports/DairyReports.test.jsx` | ⏳ to port (page journey) |
| `pages/reports/DairyStatement.test.jsx` | ⏳ to port (page journey) |
| `pages/reports/DairyStatementPrint.test.jsx` | ⏳ to port (print view, assert rendered content) |
| `pages/reports/DepositPrint.test.jsx` | ⏳ to port (print view, assert rendered content) |
| `pages/reports/DepositReport.test.jsx` | ⏳ to port (page journey) |
| `pages/reports/SalesmanDayBalance.test.jsx` | ⏳ to port (page journey) |
| `pages/reports/SalesmanProfitLoss.test.jsx` | ⏳ to port (page journey) |
| `pages/reports/SalespersonStatement.test.jsx` | ⏳ to port (page journey) |
| `pages/reports/SalespersonStatementPrint.test.jsx` | ⏳ to port (print view, assert rendered content) |
| `pages/reports/StockBalanceSummary.test.jsx` | ⏳ to port (page journey) |
| `pages/reports/StockSummary.test.jsx` | ⏳ to port (page journey) |
| `pages/reports/StockSummaryPrint.test.jsx` | ⏳ to port (print view, assert rendered content) |
| `pages/salesman/ChangePassword.test.jsx` | ⏳ to port (page journey) |
| `pages/salesman/MyStatement.test.jsx` | ⏳ to port (page journey) |
| `pages/salesman/MyStatementPrint.test.jsx` | ⏳ to port (print view, assert rendered content) |
| `pages/salesman/SalespersonBalance.test.jsx` | ⏳ to port (page journey) |
| `pages/salesman/StockEntry.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/AdminUsersSetup.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/BrandsSetup.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/CategorySetup.test.jsx` | ✅ ported → `category-setup.spec.ts` |
| `pages/setup/DairySettings.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/LayoutSettings.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/ProductsSetup.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/RouteSetup.test.jsx` | ✅ ported → `route-setup.spec.ts` |
| `pages/setup/SalesmanPricesSetup.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/SalesmanPricesSetupGlobal.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/SalesmanPricesSetupPerPerson.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/SalesmanUsersSetup.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/salesmanPrices/BulkProductAccessModal.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/salesmanPrices/BulkUpdatePricesModal.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/salesmanPrices/CopyPricesModal.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/salesmanPrices/ExceptionManagerModal.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/salesmanPrices/PriceEditModal.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/salesmanPrices/PriceHistoryModal.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/salesmanPrices/PriceToolbar.test.jsx` | ⏳ to port (page journey) |
| `pages/setup/salesmanPrices/SalespersonSidebar.test.jsx` | ⏳ to port (page journey) |
| `utils/appVersion.test.js` | 🔒 stays in Vitest (pure logic, no screen) |
| `utils/billPdf.test.js` | 🔒 stays in Vitest (pure logic, no screen) |
| `utils/constants.test.js` | 🔒 stays in Vitest (pure logic, no screen) |
| `utils/dateUtils.test.js` | 🔒 stays in Vitest (pure logic, no screen) |
| `utils/numberToWords.test.js` | 🔒 stays in Vitest (pure logic, no screen) |
| `utils/productLayout.test.js` | 🔒 stays in Vitest (pure logic, no screen) |
| `utils/salespersonProductStatement.test.js` | 🔒 stays in Vitest (pure logic, no screen) |
| `utils/session.test.js` | 🔒 stays in Vitest (pure logic, no screen) |
