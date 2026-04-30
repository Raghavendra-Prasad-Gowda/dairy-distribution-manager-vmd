import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import { Loader2 } from 'lucide-react';

// Lazy-loaded pages (code-split per route for faster initial load)
const Dashboard              = lazy(() => import('./pages/Dashboard'));
const StockReceipt           = lazy(() => import('./pages/daily/StockReceipt'));
const Dispatch               = lazy(() => import('./pages/daily/Dispatch'));
const DairyPayments          = lazy(() => import('./pages/payments/DairyPayments'));
const SalespersonCollections = lazy(() => import('./pages/payments/SalespersonCollections'));
const DairyStatement         = lazy(() => import('./pages/reports/DairyStatement'));
const SalespersonStatement   = lazy(() => import('./pages/reports/SalespersonStatement'));
const StockSummary           = lazy(() => import('./pages/reports/StockSummary'));
const SalespersonOutstanding = lazy(() => import('./pages/SalespersonOutstanding'));
const ProductsSetup          = lazy(() => import('./pages/setup/ProductsSetup'));
const CategorySetup          = lazy(() => import('./pages/setup/CategorySetup'));
const SalespeopleSetup       = lazy(() => import('./pages/setup/SalespeopleSetup'));
const LayoutSettings         = lazy(() => import('./pages/setup/LayoutSettings'));
const RouteSetup             = lazy(() => import('./pages/setup/RouteSetup'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

const S = (Page) => <Suspense fallback={<PageLoader />}><Page /></Suspense>;

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Dashboard */}
        <Route index element={S(Dashboard)} />

        {/* ── DAIRY MODULE ── */}
        <Route path="dairy/stock/:brandName" element={S(StockReceipt)} />
        <Route path="dairy/payments"         element={S(DairyPayments)} />
        <Route path="dairy/setup/categories" element={S(CategorySetup)} />
        <Route path="dairy/setup/products"   element={S(ProductsSetup)} />
        <Route path="dairy/setup/layout"     element={S(LayoutSettings)} />
        <Route path="dairy/setup/routes"     element={S(RouteSetup)} />

        {/* ── SALESMAN MODULE ── */}
        <Route path="salesman/dispatch"  element={S(Dispatch)} />
        <Route path="salesman/payments"  element={S(SalespersonCollections)} />
        <Route path="salesman/setup"     element={S(SalespeopleSetup)} />

        {/* ── REPORTS ── */}
        <Route path="reports/dairy"          element={S(DairyStatement)} />
        <Route path="reports/salespeople"    element={S(SalespersonStatement)} />
        <Route path="reports/stock"          element={S(StockSummary)} />
        <Route path="salesperson-outstanding" element={S(SalespersonOutstanding)} />

        {/* Legacy redirects — old URLs still work */}
        <Route path="daily/receipt"        element={<Navigate to="/dairy/stock/nandini" replace />} />
        <Route path="daily/dispatch"       element={<Navigate to="/salesman/dispatch" replace />} />
        <Route path="payments/dairy"       element={<Navigate to="/dairy/payments" replace />} />
        <Route path="payments/salespeople" element={<Navigate to="/salesman/payments" replace />} />
        <Route path="setup/products"       element={<Navigate to="/dairy/setup/products" replace />} />
        <Route path="setup/salespeople"    element={<Navigate to="/salesman/setup" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
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
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
