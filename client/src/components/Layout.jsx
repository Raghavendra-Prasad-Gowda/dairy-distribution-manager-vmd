import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Milk, LayoutDashboard, CreditCard,
  Settings, LogOut, Menu,
  FileText, Warehouse, Tag, Layers, LayoutGrid
} from 'lucide-react';

const DASHBOARD_ITEM = { to: '/', icon: LayoutDashboard, label: 'Dashboard' };

const NAV = [
  {
    key: 'dairy',
    label: 'DAIRY MODULE',
    headerClass: 'text-emerald-300',
    groups: [
      {
        label: 'BRANDS',
        items: [
          { to: '/dairy/stock/nandini',   dot: 'bg-amber-400',  label: 'Nandini' },
          { to: '/dairy/stock/jersey',    dot: 'bg-sky-400',    label: 'Jersey' },
          { to: '/dairy/stock/gowardhan', dot: 'bg-violet-400', label: 'Gowardhan' },
        ],
      },
      {
        label: 'MANAGE',
        items: [
          { to: '/dairy/setup/categories', icon: Layers,      label: 'Categories' },
          { to: '/dairy/setup/products',   icon: Settings,    label: 'Products' },
          { to: '/dairy/setup/prices',     icon: Tag,         label: 'Price Setup' },
          { to: '/dairy/setup/layout',     icon: LayoutGrid,  label: 'Layout' },
          { to: '/dairy/payments',         icon: CreditCard,  label: 'Payments' },
        ],
      },
    ],
  },
  {
    key: 'reports',
    label: 'REPORTS',
    headerClass: 'text-emerald-400',
    groups: [
      {
        items: [
          { to: '/reports/dairy', icon: FileText,  label: 'Dairy Statement' },
          { to: '/reports/stock', icon: Warehouse, label: 'Stock Summary' },
        ],
      },
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
        `flex items-center rounded-xl transition-all duration-150 ${
          compact ? 'justify-center p-3' : 'gap-3 px-3 py-2'
        } ${
          isActive
            ? 'bg-white/20 text-white shadow-sm'
            : 'text-emerald-200 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      {item.dot
        ? <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${item.dot}`} />
        : Icon && <Icon size={16} className="flex-shrink-0" />
      }
      {!compact && <span className="text-sm font-medium">{item.label}</span>}
    </NavLink>
  );
}

function Sidebar({ compact = false, setMobileOpen, onLogoutRequest }) {
  return (
    <div className="flex flex-col h-full ddm-gradient">
      {/* Logo */}
      <div className={`border-b border-white/10 ${compact ? 'px-3 py-4 flex justify-center' : 'px-4 py-5'}`}>
        {compact ? (
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center">
            <Milk className="text-white" size={18} />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
              <Milk className="text-white" size={18} />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">Vikas Milk Dairy</p>
              <p className="text-emerald-300 text-xs leading-tight">Distribution Manager</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-5 px-2">

        {/* Dashboard — standalone */}
        <div>
          {!compact && (
            <p className="px-2 mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-300/70">
              OVERVIEW
            </p>
          )}
          {compact && <div className="h-px bg-white/10 mx-1 mb-2" />}
          <SidebarLink item={DASHBOARD_ITEM} compact={compact} setMobileOpen={setMobileOpen} />
        </div>

        {/* Module + Report sections */}
        {NAV.map((module) => (
          <div key={module.key}>
            {!compact && (
              <p className={`px-2 mb-2 text-[10px] font-bold uppercase tracking-widest ${module.headerClass}`}>
                {module.label}
              </p>
            )}
            {compact && <div className="h-px bg-white/10 mx-1 mb-2" />}
            <div className="space-y-3">
              {module.groups.map((group, gi) => (
                <div key={gi}>
                  {!compact && group.label && (
                    <p className="px-3 mb-1 text-[9px] font-bold uppercase tracking-widest text-white/30">
                      {group.label}
                    </p>
                  )}
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <SidebarLink key={item.to} item={item} compact={compact} setMobileOpen={setMobileOpen} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User + Sign Out */}
      <div className="border-t border-white/10 py-3 space-y-1 px-2">
        <button
          onClick={onLogoutRequest}
          title="Sign Out"
          className={`w-full flex items-center rounded-lg text-emerald-300 hover:bg-white/10 hover:text-white transition-all ${
            compact ? 'justify-center p-3' : 'gap-3 px-3 py-2'
          }`}
        >
          <LogOut size={16} />
          {!compact && <span className="text-sm font-medium">Sign Out</span>}
        </button>
      </div>
    </div>
  );
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Desktop sidebar — full labels (lg+) */}
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0">
        <Sidebar compact={false} onLogoutRequest={() => setShowLogoutConfirm(true)} />
      </aside>

      {/* Mobile + iPad backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile + iPad slide-out drawer */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col lg:hidden transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar compact={false} setMobileOpen={setMobileOpen} onLogoutRequest={() => { setMobileOpen(false); setShowLogoutConfirm(true); }} />
      </aside>

      {/* Sign out confirmation modal — rendered at root level to avoid transform clipping */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center" style={{ animation: 'fadeIn 0.2s ease' }}>
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

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile + iPad topbar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Milk className="text-emerald-600" size={18} />
            <span className="font-bold text-slate-900 text-sm">Vikas Milk Dairy</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-100">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
