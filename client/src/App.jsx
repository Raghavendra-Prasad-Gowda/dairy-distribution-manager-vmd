import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import BrandedLoader from './components/ui/BrandedLoader';
import ColdStartScreen from './components/ColdStartScreen';

// Admin pages
const Dashboard              = lazy(() => import('./pages/Dashboard'));
const StockReceipt           = lazy(() => import('./pages/daily/StockReceipt'));
const DairyPayments          = lazy(() => import('./pages/payments/DairyPayments'));
const SalespersonCollections = lazy(() => import('./pages/payments/SalespersonCollections'));
const DairyStatement         = lazy(() => import('./pages/reports/DairyStatement'));
const SalespersonStatement   = lazy(() => import('./pages/reports/SalespersonStatement'));
const StockSummary           = lazy(() => import('./pages/reports/StockSummary'));
const DepositReport          = lazy(() => import('./pages/reports/DepositReport'));
const SalespersonOutstanding = lazy(() => import('./pages/SalespersonOutstanding'));
const ProductsSetup          = lazy(() => import('./pages/setup/ProductsSetup'));
const CategorySetup          = lazy(() => import('./pages/setup/CategorySetup'));
const SalesmanUsersSetup     = lazy(() => import('./pages/setup/SalesmanUsersSetup'));
const SalesmanPricesSetup     = lazy(() => import('./pages/setup/SalesmanPricesSetup'));
const SalesmanProductsSetup   = lazy(() => import('./pages/setup/SalesmanProductsSetup'));
const DailyDispatchSummary      = lazy(() => import('./pages/reports/DailyDispatchSummary'));
const StockBalanceSummary       = lazy(() => import('./pages/reports/StockBalanceSummary'));
const SalesmanDayBalance        = lazy(() => import('./pages/reports/SalesmanDayBalance'));
const LayoutSettings         = lazy(() => import('./pages/setup/LayoutSettings'));
const RouteSetup             = lazy(() => import('./pages/setup/RouteSetup'));
const BrandsSetup            = lazy(() => import('./pages/setup/BrandsSetup'));
const DairySettings          = lazy(() => import('./pages/setup/DairySettings'));
const DairyReports           = lazy(() => import('./pages/reports/DairyReports'));
const StockSummaryPrint      = lazy(() => import('./pages/reports/StockSummaryPrint'));
const DepositPrint           = lazy(() => import('./pages/reports/DepositPrint'));
const DairyStatementPrint    = lazy(() => import('./pages/reports/DairyStatementPrint'));
const SalespersonStatementPrint = lazy(() => import('./pages/reports/SalespersonStatementPrint'));

const AdminUsersSetup        = lazy(() => import('./pages/setup/AdminUsersSetup'));

// Salesman pages
const SalespersonStockEntry  = lazy(() => import('./pages/salesman/StockEntry'));
const SalespersonBalance     = lazy(() => import('./pages/salesman/SalespersonBalance'));
const ChangePassword         = lazy(() => import('./pages/salesman/ChangePassword'));

function PageLoader() {
  return <BrandedLoader label="Loading…" />;
}

function ProtectedRoute({ children, adminOnly = false, superAdminOnly = false }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (superAdminOnly && user.role !== 'superadmin') return <Navigate to="/" replace />;
  if (adminOnly && user.role !== 'admin' && user.role !== 'superadmin') return <Navigate to="/" replace />;
  return children;
}

const S = (Page) => <Suspense fallback={<PageLoader />}><Page /></Suspense>;

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Print / PDF routes — full-page, no Layout */}
      <Route path="/print/stock-summary" element={
        <ProtectedRoute>{S(StockSummaryPrint)}</ProtectedRoute>
      } />
      <Route path="/print/deposit" element={
        <ProtectedRoute>{S(DepositPrint)}</ProtectedRoute>
      } />
      <Route path="/print/dairy-statement" element={
        <ProtectedRoute>{S(DairyStatementPrint)}</ProtectedRoute>
      } />
      <Route path="/print/salesperson-statement" element={
        <ProtectedRoute>{S(SalespersonStatementPrint)}</ProtectedRoute>
      } />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* ── SALESMAN ROUTES ── */}
        {user?.role === 'salesman' && (
          <>
            <Route index element={S(SalespersonStockEntry)} />
            <Route path="salesman/stock-entry" element={S(SalespersonStockEntry)} />
            <Route path="salesman/balance" element={S(SalespersonBalance)} />
            <Route path="salesman/change-password" element={S(ChangePassword)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}

        {/* ── ADMIN ROUTES ── */}
        {user?.role !== 'salesman' && (
          <>
            <Route index element={S(Dashboard)} />

            {/* DAIRY MODULE */}
            <Route path="dairy/stock/:brandName" element={S(StockReceipt)} />
            <Route path="dairy/payments"         element={S(DairyPayments)} />
            <Route path="dairy/setup"            element={S(DairySettings)} />
            <Route path="dairy/setup/categories" element={S(CategorySetup)} />
            <Route path="dairy/setup/products"   element={S(ProductsSetup)} />
            <Route path="dairy/setup/layout"     element={S(LayoutSettings)} />
            <Route path="dairy/setup/routes"     element={S(RouteSetup)} />
            <Route path="dairy/setup/brands"     element={S(BrandsSetup)} />

            {/* SALESMAN MANAGEMENT (admin) */}
            <Route path="salesman/payments"        element={S(SalespersonCollections)} />
            <Route path="salesman/setup/users"     element={S(SalesmanUsersSetup)} />
            <Route path="salesman/setup/products"  element={S(SalesmanProductsSetup)} />
            <Route path="salesman/setup/prices"    element={S(SalesmanPricesSetup)} />
            <Route path="salesman/setup"           element={<Navigate to="/salesman/setup/users" replace />} />

            {/* REPORTS */}
            <Route path="dairy/reports"           element={S(DairyReports)} />
            <Route path="reports/dairy"           element={S(DairyStatement)} />
            <Route path="reports/salespeople"       element={S(SalespersonStatement)} />
            <Route path="salesman/dispatch-sheet"   element={S(DailyDispatchSummary)} />
            <Route path="salesman/day-balance"      element={S(SalesmanDayBalance)} />
            <Route path="reports/stock"           element={S(StockSummary)} />
            <Route path="reports/stock-balance"   element={S(StockBalanceSummary)} />
            <Route path="reports/deposit"         element={S(DepositReport)} />
            <Route path="salesperson-outstanding" element={S(SalespersonOutstanding)} />

            {/* SUPER ADMIN */}
            <Route path="admin/users" element={
              <ProtectedRoute superAdminOnly>{S(AdminUsersSetup)}</ProtectedRoute>
            } />

            {/* Legacy redirects */}
            <Route path="daily/receipt"        element={<Navigate to="/dairy/stock/nandini" replace />} />
            <Route path="daily/dispatch"       element={<Navigate to="/salesman/setup" replace />} />
            <Route path="payments/dairy"       element={<Navigate to="/dairy/payments" replace />} />
            <Route path="payments/salespeople" element={<Navigate to="/salesman/payments" replace />} />
            <Route path="setup/products"       element={<Navigate to="/dairy/setup/products" replace />} />
            <Route path="setup/salespeople"    element={<Navigate to="/salesman/setup/users" replace />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
            <AppRoutes />
            <ColdStartScreen />
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
