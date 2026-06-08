import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Milk, LayoutDashboard, CreditCard,
  LogOut, Menu, Package, ShoppingCart,
  FileText, Warehouse, Layers, LayoutGrid, Navigation, Store, Droplets, Users, IndianRupee, ShieldCheck
} from 'lucide-react';

// ─── Admin nav tree ────────────────────────────────────────────────────────────

const DASHBOARD_ITEM = { to: '/', icon: LayoutDashboard, label: 'Dashboard' };

const ADMIN_NAV = [
  {
    moduleLabel: 'DAIRY',
    sections: [
      {
        label: 'STOCK RECEIPT',
        items: [
          { to: '/dairy/stock/nandini',   dot: 'bg-amber-400',  label: 'Nandini' },
          { to: '/dairy/stock/jersey',    dot: 'bg-sky-400',    label: 'Jersey' },
          { to: '/dairy/stock/gowardhan', dot: 'bg-violet-400', label: 'Gowardhan' },
        ],
      },
      {
        label: 'ACCOUNTS PAYABLE',
        items: [
          { to: '/dairy/payments', icon: CreditCard, label: 'Payments' },
        ],
      },
      {
        label: 'SETUP',
        items: [
          { to: '/dairy/setup/products', icon: Package,    label: 'Products' },
          { to: '/dairy/setup',          icon: LayoutGrid, label: 'Settings' },
        ],
      },
      {
        label: 'REPORTS',
        items: [
          { to: '/dairy/reports', icon: FileText, label: 'Dairy Reports' },
        ],
      },
    ],
  },
  {
    moduleLabel: 'SALESMAN',
    sections: [
      {
        label: 'MANAGEMENT',
        items: [
          { to: '/reports/stock-balance',   icon: Warehouse,   label: 'Stock Balance' },
          { to: '/salesman/dispatch-sheet',  icon: LayoutGrid,  label: 'Dispatch Sheet' },
          { to: '/salesman/payments',        icon: CreditCard,  label: 'Collections' },
        ],
      },
      {
        label: 'SETUP',
        items: [
          { to: '/salesman/setup/users',    icon: Users,        label: 'Users' },
          { to: '/salesman/setup/layout',   icon: LayoutGrid,   label: 'Layout' },
          { to: '/salesman/setup/prices',   icon: IndianRupee,  label: 'Products' },
        ],
      },
      {
        label: 'REPORTS',
        items: [
          { to: '/reports/salespeople', icon: FileText, label: 'Statements' },
        ],
      },
    ],
  },
];

// ─── Salesman nav ──────────────────────────────────────────────────────────────

const SALESMAN_NAV = [
  {
    moduleLabel: 'MY ACCOUNT',
    sections: [
      {
        label: 'STOCK',
        items: [
          { to: '/', icon: ShoppingCart, label: 'Stock Entry' },
        ],
      },
    ],
  },
];

// ─── Components ───────────────────────────────────────────────────────────────

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

function Sidebar({ compact = false, setMobileOpen, onLogoutRequest, user }) {
  const navTree = user?.role === 'salesman' ? SALESMAN_NAV : ADMIN_NAV;
  const showDashboard = user?.role !== 'salesman';

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
              <p className="text-white font-bold text-sm leading-tight">{user?.businessName ?? 'Vikas Milk Dairy'}</p>
              <p className="text-emerald-300 text-xs leading-tight">
                {user?.role === 'salesman' ? (user.salespersonName ?? 'Salesman') : user?.role === 'superadmin' ? 'Super Admin' : 'Admin'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-5 px-2">

        {showDashboard && (
          <div>
            {!compact && (
              <p className="px-2 mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-300/70">OVERVIEW</p>
            )}
            {compact && <div className="h-px bg-white/10 mx-1 mb-2" />}
            <SidebarLink item={DASHBOARD_ITEM} compact={compact} setMobileOpen={setMobileOpen} />
          </div>
        )}

        {user?.role === 'superadmin' && (
          <div>
            {!compact && (
              <p className="px-2 mb-3 text-[10px] font-bold uppercase tracking-widest text-amber-400/90">
                SUPER ADMIN
              </p>
            )}
            {compact && <div className="h-px bg-white/10 mx-1 mb-2" />}
            <div className="space-y-0.5">
              <SidebarLink
                item={{ to: '/admin/users', icon: ShieldCheck, label: 'Admin Users' }}
                compact={compact}
                setMobileOpen={setMobileOpen}
              />
            </div>
          </div>
        )}

        {navTree.map((module) => (
          <div key={module.moduleLabel}>
            {!compact && (
              <p className="px-2 mb-3 text-[10px] font-bold uppercase tracking-widest text-emerald-400/80">
                {module.moduleLabel}
              </p>
            )}
            {compact && <div className="h-px bg-white/10 mx-1 mb-2" />}
            <div className="space-y-3">
              {module.sections.map((section) => (
                <div key={section.label}>
                  {!compact && (
                    <div className="flex items-center gap-2 px-2 mb-1">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-white/40 whitespace-nowrap">
                        {section.label}
                      </span>
                      <div className="flex-1 h-px bg-white/10" />
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {section.items.map((item) => (
                      <SidebarLink key={item.to} item={item} compact={compact} setMobileOpen={setMobileOpen} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Sign Out */}
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
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0">
        <Sidebar compact={false} onLogoutRequest={() => setShowLogoutConfirm(true)} user={user} />
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile slide-out drawer */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col lg:hidden transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar compact={false} setMobileOpen={setMobileOpen} onLogoutRequest={() => { setMobileOpen(false); setShowLogoutConfirm(true); }} user={user} />
      </aside>

      {/* Sign out confirmation */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center" style={{ animation: 'fadeIn 0.2s ease' }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 mx-4 w-full max-w-sm" style={{ animation: 'popIn 0.25s ease' }}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Sign out?</h3>
            <p className="text-slate-500 text-sm mb-6">You'll need your password to access the app again.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl hover:bg-slate-50 transition text-sm">Cancel</button>
              <button onClick={handleLogout} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition text-sm">Sign Out</button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Milk className="text-emerald-600" size={18} />
            <span className="font-bold text-slate-900 text-sm">{user?.businessName ?? 'Vikas Milk Dairy'}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-100">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
