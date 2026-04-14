import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Milk, LayoutDashboard, Package, Truck, CreditCard, Users,
  BarChart2, Settings, LogOut, Menu,
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
      { to: '/reports/dairy',       icon: FileText,      label: 'Dairy Statement' },
      { to: '/reports/salespeople', icon: ClipboardList, label: 'SP Statement' },
      { to: '/reports/stock',       icon: Warehouse,     label: 'Stock Summary' },
    ],
  },
  {
    label: 'SETUP',
    items: [
      { to: '/setup/products',          icon: Settings,   label: 'Products & Pricing' },
      { to: '/setup/salespeople',       icon: UserCheck,  label: 'Salespeople & Rates' },
      { to: '/salesperson-outstanding', icon: BarChart2,  label: 'SP Outstanding' },
    ],
  },
];

/**
 * compact=true  → icon-only (iPad md breakpoint)
 * compact=false → icon + label (lg+ breakpoint / mobile drawer)
 */
function SidebarLink({ item, compact, setMobileOpen }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={() => setMobileOpen && setMobileOpen(false)}
      title={item.label}
      className={({ isActive }) =>
        `flex items-center rounded-lg transition-all duration-150 ${
          compact ? 'justify-center p-3' : 'gap-3 px-3 py-2'
        } ${
          isActive
            ? 'bg-white/15 text-white'
            : 'text-indigo-200 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <Icon size={18} className="flex-shrink-0" />
      {!compact && <span className="text-sm font-medium">{item.label}</span>}
    </NavLink>
  );
}

function Sidebar({ compact = false, setMobileOpen }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex flex-col h-full ddm-gradient">
      {/* Logo */}
      <div className={`border-b border-white/10 ${compact ? 'px-3 py-4 flex justify-center' : 'px-4 py-5'}`}>
        {compact ? (
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Milk className="text-white" size={18} />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <Milk className="text-white" size={18} />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">Vikas Milk Dairy</p>
              <p className="text-indigo-300 text-xs leading-tight">Distribution Manager</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-5 px-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!compact && (
              <p className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                {section.label}
              </p>
            )}
            {compact && <div className="h-px bg-white/10 mx-1 mb-2" />}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <SidebarLink key={item.to} item={item} compact={compact} setMobileOpen={setMobileOpen} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User + Sign Out */}
      <div className={`border-t border-white/10 py-3 space-y-1 px-2 ${compact ? '' : ''}`}>
        {!compact && user && (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{user.username?.[0]?.toUpperCase() ?? 'U'}</span>
            </div>
            <span className="text-indigo-200 text-xs font-medium truncate">{user.username}</span>
          </div>
        )}
        <button
          onClick={() => setShowLogoutConfirm(true)}
          title="Sign Out"
          className={`w-full flex items-center rounded-lg text-indigo-300 hover:bg-white/10 hover:text-white transition-all ${
            compact ? 'justify-center p-3' : 'gap-3 px-3 py-2'
          }`}
        >
          <LogOut size={16} />
          {!compact && <span className="text-sm font-medium">Sign Out</span>}
        </button>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" style={{ animation: 'fadeIn 0.2s ease' }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 mx-4 w-full max-w-sm" style={{ animation: 'popIn 0.25s ease' }}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Sign out?</h3>
            <p className="text-slate-500 text-sm mb-6">You'll need your password to access the dashboard again.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl hover:bg-slate-50 transition text-sm">Cancel</button>
              <button onClick={handleLogout} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition text-sm">Sign Out</button>
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
      {/* Desktop sidebar — full labels (lg+) */}
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0">
        <Sidebar compact={false} />
      </aside>

      {/* Mobile + iPad backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile + iPad slide-out drawer */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col lg:hidden transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar compact={false} setMobileOpen={setMobileOpen} />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile + iPad topbar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Milk className="text-indigo-600" size={18} />
            <span className="font-bold text-slate-900 text-sm">Vikas Milk Dairy</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
