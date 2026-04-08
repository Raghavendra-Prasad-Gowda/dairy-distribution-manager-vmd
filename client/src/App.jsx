import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';

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
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
