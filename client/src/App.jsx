import { Component, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import { Loader2 } from 'lucide-react';

class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center px-6">
            <h1 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h1>
            <p className="text-slate-500 text-sm mb-6">An unexpected error occurred. Please refresh the page.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white font-semibold rounded-xl text-sm transition"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
const SalespeopleSetup       = lazy(() => import('./pages/setup/SalespeopleSetup'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

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
        <Route index element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
        <Route path="salesperson-outstanding" element={<Suspense fallback={<PageLoader />}><SalespersonOutstanding /></Suspense>} />
        <Route path="daily/receipt"        element={<Suspense fallback={<PageLoader />}><StockReceipt /></Suspense>} />
        <Route path="daily/dispatch"       element={<Suspense fallback={<PageLoader />}><Dispatch /></Suspense>} />
        <Route path="payments/dairy"       element={<Suspense fallback={<PageLoader />}><DairyPayments /></Suspense>} />
        <Route path="payments/salespeople" element={<Suspense fallback={<PageLoader />}><SalespersonCollections /></Suspense>} />
        <Route path="reports/dairy"        element={<Suspense fallback={<PageLoader />}><DairyStatement /></Suspense>} />
        <Route path="reports/salespeople"  element={<Suspense fallback={<PageLoader />}><SalespersonStatement /></Suspense>} />
        <Route path="reports/stock"        element={<Suspense fallback={<PageLoader />}><StockSummary /></Suspense>} />
        <Route path="setup/products"       element={<Suspense fallback={<PageLoader />}><ProductsSetup /></Suspense>} />
        <Route path="setup/salespeople"    element={<Suspense fallback={<PageLoader />}><SalespeopleSetup /></Suspense>} />
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
