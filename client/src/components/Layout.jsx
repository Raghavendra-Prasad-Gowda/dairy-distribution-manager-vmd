import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Milk, LayoutDashboard, Package, Truck, CreditCard, Users,
  BarChart2, Settings, LogOut, Menu, X, ChevronDown, ChevronRight,
  ClipboardList, FileText, Warehouse
} from 'lucide-react';

const NAV = [
  { to: '/',                  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/daily/receipt',     icon: Package,          label: 'Stock Receipt' },
  { to: '/daily/dispatch',    icon: Truck,             label: 'Dispatch' },
  {
    label: 'Payments',
    icon:  CreditCard,
    children: [
      { to: '/payments/dairy',         label: 'Dairy Payments' },
      { to: '/payments/salespeople',   label: 'Collections' },
    ],
  },
  {
    label: 'Reports',
    icon:  BarChart2,
    children: [
      { to: '/reports/dairy',        label: 'Dairy Statement' },
      { to: '/reports/salespeople',  label: 'Salesperson Statement' },
      { to: '/reports/stock',        label: 'Stock Summary' },
    ],
  },
  {
    label: 'Setup',
    icon:  Settings,
    children: [
      { to: '/setup/products',    label: 'Products & Pricing' },
      { to: '/setup/salespeople', label: 'Salespeople & Rates' },
    ],
  },
];

function NavItem({ item, collapsed, setMobileOpen }) {
  const [open, setOpen] = useState(false);
  const Icon = item.icon;

  // Leaf link
  if (item.to) {
    return (
      <NavLink
        to={item.to}
        end={item.to === '/'}
        onClick={() => setMobileOpen && setMobileOpen(false)}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
            isActive
              ? 'bg-white/20 text-white shadow-sm'
              : 'text-white/75 hover:bg-white/10 hover:text-white'
          }`
        }
      >
        <Icon className="w-4.5 h-4.5 flex-shrink-0" size={18} />
        <span>{item.label}</span>
      </NavLink>
    );
  }

  // Group with children
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white transition-all duration-150"
      >
        <Icon size={18} className="flex-shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="ml-6 mt-1 space-y-0.5 border-l border-white/20 pl-3">
          {item.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              onClick={() => setMobileOpen && setMobileOpen(false)}
              className={({ isActive }) =>
                `block px-2 py-2 rounded-lg text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-white/20 text-white font-semibold'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ setMobileOpen }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-full ddm-gradient">
      {/* Logo */}
      <div className="px-4 py-6 border-b border-white/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
            <Milk className="text-white" size={20} />
          </div>
          <div>
            <p className="text-white font-bold leading-tight text-sm">Dairy Distribution</p>
            <p className="text-teal-100 text-xs leading-tight">Vikas Milk Dairy</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV.map((item) => (
          <NavItem key={item.label} item={item} setMobileOpen={setMobileOpen} />
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-white/20">
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-all"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Confirm logout overlay */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" style={{ animation: 'fadeIn 0.2s ease' }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 mx-4 w-full max-w-sm" style={{ animation: 'popIn 0.25s ease' }}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Sign out?</h3>
            <p className="text-gray-500 text-sm mb-6">You'll need your password to access the dashboard again.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 border border-gray-200 text-gray-700 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar — visible on iPad (md: = 768px) and wider */}
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0 shadow-sm">
        <Sidebar />
      </aside>

      {/* Phone overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Phone slide-out drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 flex flex-col md:hidden transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar setMobileOpen={setMobileOpen} />
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Phone topbar — hidden on iPad+ */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Milk className="text-teal-600" size={18} />
            <span className="font-bold text-slate-900 text-sm">Dairy Distribution</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
