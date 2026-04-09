import { Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';

class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-500 mb-6">An unexpected error occurred. Please refresh the page.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl text-sm transition"
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

// Lazy-loaded pages (improves initial load)
import Dashboard            from './pages/Dashboard';
import StockReceipt         from './pages/daily/StockReceipt';
import Dispatch             from './pages/daily/Dispatch';
import DairyPayments        from './pages/payments/DairyPayments';
import SalespersonCollections from './pages/payments/SalespersonCollections';
import DairyStatement       from './pages/reports/DairyStatement';
import SalespersonStatement from './pages/reports/SalespersonStatement';
import StockSummary         from './pages/reports/StockSummary';
import ProductsSetup        from './pages/setup/ProductsSetup';
import SalespeopleSetup     from './pages/setup/SalespeopleSetup';

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
        <Route index element={<Dashboard />} />
        <Route path="daily/receipt"           element={<StockReceipt />} />
        <Route path="daily/dispatch"          element={<Dispatch />} />
        <Route path="payments/dairy"          element={<DairyPayments />} />
        <Route path="payments/salespeople"    element={<SalespersonCollections />} />
        <Route path="reports/dairy"           element={<DairyStatement />} />
        <Route path="reports/salespeople"     element={<SalespersonStatement />} />
        <Route path="reports/stock"           element={<StockSummary />} />
        <Route path="setup/products"          element={<ProductsSetup />} />
        <Route path="setup/salespeople"       element={<SalespeopleSetup />} />
        <Route path="*"                       element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
