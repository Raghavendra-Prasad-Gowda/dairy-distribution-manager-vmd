import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Milk, LayoutDashboard, Package, Truck, CreditCard, Users,
  BarChart2, Settings, LogOut, Menu, X,
  ClipboardList, FileText, Warehouse, UserCheck
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    label: 'OPERATIONS',
    items: [
      { to: '/',               icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/daily/receipt',  icon: Package,         label: 'Stock Receipt' },
      { to: '/daily/dispatch', icon: Truck,           label: 'Dispatch' },
    ],
  },
  {
    label: 'PAYMENTS',
    items: [
      { to: '/payments/dairy',       icon: CreditCard, label: 'Dairy Payments' },
      { to: '/payments/salespeople', icon: Users,      label: 'Collections' },
    ],
  },
  {
    label: 'REPORTS',
    items: [
      { to: '/reports/dairy',       icon: FileText,   label: 'Dairy Statement' },
      { to: '/reports/salespeople', icon: ClipboardList, label: 'SP Statement' },
      { to: '/reports/stock',       icon: Warehouse,  label: 'Stock Summary' },
    ],
  },
  {
    label: 'SETUP',
    items: [
      { to: '/setup/products',      icon: Package,    label: 'Products & Pricing' },
      { to: '/setup/salespeople',   icon: UserCheck,  label: 'Salespeople & Rates' },
      { to: '/salesperson-outstanding', icon: BarChart2, label: 'SP Outstanding' },
    ],
  },
];

function SidebarLink({ item, setMobileOpen }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={() => setMobileOpen && setMobileOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
          isActive
            ? 'bg-white/15 text-white'
            : 'text-indigo-200 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <Icon size={17} className="flex-shrink-0" />
      <span>{item.label}</span>
    </NavLink>
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
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <Milk className="text-white" size={18} />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Vikas Milk Dairy</p>
            <p className="text-indigo-300 text-xs leading-tight">Distribution Manager</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <SidebarLink key={item.to} item={item} setMobileOpen={setMobileOpen} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User + Sign Out */}
      <div className="px-3 py-4 border-t border-white/10 space-y-2">
        {user && (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">
                {user.username?.[0]?.toUpperCase() ?? 'U'}
              </span>
            </div>
            <span className="text-indigo-200 text-xs font-medium truncate">{user.username}</span>
          </div>
        )}
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-indigo-300 hover:bg-white/10 hover:text-white transition-all"
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Confirm logout overlay */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" style={{ animation: 'fadeIn 0.2s ease' }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 mx-4 w-full max-w-sm" style={{ animation: 'popIn 0.25s ease' }}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Sign out?</h3>
            <p className="text-slate-500 text-sm mb-6">You'll need your password to access the dashboard again.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl hover:bg-slate-50 transition text-sm"
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
      {/* Sidebar — always visible on md+ (768px = iPad) */}
      <aside className="hidden md:flex flex-col w-56 flex-shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile slide-out drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-56 flex flex-col md:hidden transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar setMobileOpen={setMobileOpen} />
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Milk className="text-indigo-600" size={18} />
            <span className="font-bold text-slate-900 text-sm">Vikas Milk Dairy</span>
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
