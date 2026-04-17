import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Milk, LayoutDashboard, Package, CreditCard,
  Settings, LogOut, Menu,
  FileText, Warehouse, Tag
} from 'lucide-react';

const DASHBOARD_ITEM = { to: '/', icon: LayoutDashboard, label: 'Dashboard' };

const MODULES = [
  {
    key: 'dairy',
    label: 'DAIRY MODULE',
    headerClass: 'text-indigo-300',
    badgeClass: 'bg-indigo-500/20 text-indigo-300',
    items: [
      { to: '/dairy/stock/nandini',   icon: Package,    label: 'Nandini Stock' },
      { to: '/dairy/stock/jersey',    icon: Package,    label: 'Jersey Stock' },
      { to: '/dairy/stock/gowardhan', icon: Package,    label: 'Gowardhan Stock' },
      { to: '/dairy/setup/products',  icon: Settings,   label: 'Product Setup' },
      { to: '/dairy/setup/prices',    icon: Tag,        label: 'Price Setup' },
      { to: '/dairy/payments',        icon: CreditCard, label: 'Dairy Payments' },
    ],
  },
  {
    key: 'reports',
    label: 'REPORTS',
    headerClass: 'text-indigo-400',
    items: [
      { to: '/reports/dairy', icon: FileText, label: 'Dairy Statement' },
      { to: '/reports/stock', icon: Warehouse, label: 'Stock Summary' },
    ],
  },
];

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

function ModuleHeader({ module, compact }) {
  if (compact) return <div className="h-px bg-white/10 mx-1 mb-2" />;
  const isModule = module.key !== 'reports';
  return (
    <div className={`flex items-center gap-2 px-2 mb-1.5 ${isModule ? 'mt-1' : ''}`}>
      <p className={`text-[10px] font-bold uppercase tracking-widest ${module.headerClass}`}>
        {module.label}
      </p>
      {isModule && module.badgeClass && (
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${module.badgeClass}`}>
          M{module.key === 'dairy' ? '1' : '2'}
        </span>
      )}
    </div>
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
      <nav className="flex-1 overflow-y-auto py-3 space-y-4 px-2">

        {/* Dashboard — standalone */}
        <div>
          {!compact && (
            <p className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
              OVERVIEW
            </p>
          )}
          {compact && <div className="h-px bg-white/10 mx-1 mb-2" />}
          <SidebarLink item={DASHBOARD_ITEM} compact={compact} setMobileOpen={setMobileOpen} />
        </div>

        {/* Module + Report sections */}
        {MODULES.map((module) => (
          <div key={module.key}>
            <ModuleHeader module={module} compact={compact} />
            <div className="space-y-0.5">
              {module.items.map((item) => (
                <SidebarLink key={item.to} item={item} compact={compact} setMobileOpen={setMobileOpen} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User + Sign Out */}
      <div className="border-t border-white/10 py-3 space-y-1 px-2">
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
