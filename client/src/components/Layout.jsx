import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Milk, LayoutDashboard, CreditCard,
  LogOut, Menu, Package, ShoppingCart,
  FileText, Warehouse, Layers, LayoutGrid, Navigation, Store, Droplets, Users, IndianRupee, ShieldCheck, Wallet, Lock, ScrollText
} from 'lucide-react';
import { getBrandColors } from '../utils/constants';
import api from '../api/axios';

// ─── Admin nav tree ────────────────────────────────────────────────────────────

const DASHBOARD_ITEM = { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true };

const FALLBACK_STOCK_ITEMS = [
  { to: '/dairy/stock/nandini',   dot: 'bg-amber-400',  label: 'Nandini' },
  { to: '/dairy/stock/jersey',    dot: 'bg-sky-400',    label: 'Jersey' },
  { to: '/dairy/stock/gowardhan', dot: 'bg-violet-400', label: 'Gowardhan' },
];

const ADMIN_NAV_STATIC = [
  {
    moduleLabel: 'DAIRY',
    sections: [
      {
        label: 'STOCK RECEIPT',
        dynamic: true,
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
          { to: '/dairy/setup/brands',   icon: Store,       label: 'Brands',   superAdminOnly: true },
          { to: '/dairy/setup/products', icon: Package,     label: 'Products' },
          { to: '/dairy/setup',          icon: LayoutGrid,  label: 'Settings', end: true },
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
          { to: '/salesman/day-balance',     icon: Wallet,      label: 'Day Balance' },
          { to: '/salesman/payments',        icon: CreditCard,  label: 'Collections' },
        ],
      },
      {
        label: 'SETUP',
        items: [
          { to: '/salesman/setup/users',    icon: Users,        label: 'Users' },
          { to: '/salesman/setup/prices',   icon: IndianRupee,  label: 'Pricing' },
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
      {
        label: 'PAYMENTS',
        items: [
          { to: '/salesman/balance',      icon: Wallet,     label: 'My Balance' },
          { to: '/salesman/my-statement', icon: ScrollText, label: 'My Statement' },
        ],
      },
      {
        label: 'SECURITY',
        items: [
          { to: '/salesman/change-password', icon: Lock, label: 'Change Password' },
        ],
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Components ───────────────────────────────────────────────────────────────

function SidebarLink({ item, compact, setMobileOpen }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
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
      end={item.to === '/' || !!item.end}
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
  const [sidebarBrands, setSidebarBrands] = useState([]);

  useEffect(() => {
    if (user?.role === 'salesman') return;
    api.get('/brands')
      .then(r => setSidebarBrands(r.data.data ?? []))
      .catch(() => {});
  }, [user?.role]);

  const stockItems = sidebarBrands.length > 0
    ? sidebarBrands.map((b, i) => ({
        to:    `/dairy/stock/${b.name.toLowerCase()}`,
        dot:   getBrandColors(b.name, i).dot,
        label: b.name,
      }))
    : FALLBACK_STOCK_ITEMS;

  const adminNavTree = ADMIN_NAV_STATIC.map(module => ({
    ...module,
    sections: module.sections.map(section =>
      section.dynamic ? { ...section, items: stockItems } : section
    ),
  }));

  const navTree = user?.role === 'salesman' ? SALESMAN_NAV : adminNavTree;
  const showDashboard = user?.role !== 'salesman';

  return (
    <div className="flex flex-col h-full ddm-gradient">
      {/* Logo */}
      <div className={`border-b border-white/10 ${compact ? 'px-3 py-4 flex justify-center' : 'px-4 py-5'}`}>
        {compact ? (
          user?.role === 'salesman' ? (
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-white font-bold text-sm">{getInitials(user.salespersonName)}</span>
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Milk className="text-white" size={18} />
            </div>
          )
        ) : user?.role === 'salesman' ? (
          /* ── Salesman: name is the headline ── */
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 ring-2 ring-white/30">
              <span className="text-white font-bold text-sm">{getInitials(user.salespersonName)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-base leading-tight truncate">
                {user.salespersonName ?? 'Salesman'}
              </p>
              <p className="text-emerald-300 text-xs leading-tight truncate">
                {user.businessName ?? 'Vikas Milk Dairy'}
              </p>
            </div>
          </div>
        ) : (
          /* ── Admin: business name is the headline ── */
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
              <Milk className="text-white" size={18} />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">{user?.businessName ?? 'Vikas Milk Dairy'}</p>
              <p className="text-emerald-300 text-xs leading-tight">
                {user?.role === 'superadmin' ? 'Super Admin' : 'Admin'}
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
                    {section.items
                      .filter(item => !item.superAdminOnly || user?.role === 'superadmin')
                      .map((item) => (
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
    // fixed inset-0 (not h-screen) pins the whole app shell exactly to the
    // viewport, independent of document/body scroll height or mobile
    // rubber-band bounce — this is what keeps the topbar + bottom nav from
    // drifting when the page's internal content scrolls.
    <div className="fixed inset-0 flex bg-slate-100">
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
        {/* Mobile topbar — salesman has no hamburger (uses bottom nav instead) */}
        <header
          className={`lg:hidden flex items-center gap-3 px-4 py-3 shadow-sm relative z-10 ${
            user?.role === 'salesman' ? 'bg-emerald-50' : 'bg-white border-b border-slate-200'
          }`}
          style={user?.role === 'salesman' ? {
            border: '3px solid #059669',
            boxShadow: '0 4px 12px rgba(5,150,105,0.15)',
          } : undefined}
        >
          {user?.role === 'salesman' ? (
            /* Salesman: full-width identity bar, no hamburger */
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-11 h-11 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0 ring-2 ring-emerald-200">
                <span className="text-white font-bold text-base">{getInitials(user.salespersonName)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-slate-900 text-lg leading-tight truncate">
                  {user.salespersonName ?? 'Salesman'}
                </p>
                <p className="text-emerald-600/70 text-xs leading-tight truncate">
                  {user.businessName ?? 'Vikas Milk Dairy'}
                </p>
              </div>
              {/* Sign out button */}
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="p-2 rounded-lg text-emerald-600/60 hover:bg-emerald-100 hover:text-emerald-800 transition flex-shrink-0"
                title="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition">
                <Menu size={20} />
              </button>
              <div className="flex items-center gap-2">
                <Milk className="text-emerald-600" size={18} />
                <span className="font-bold text-slate-900 text-sm">{user?.businessName ?? 'Vikas Milk Dairy'}</span>
              </div>
            </>
          )}
        </header>

        <main className={`flex-1 min-h-0 bg-slate-100 ${
          user?.role === 'salesman' ? 'overflow-hidden' : 'overflow-y-auto'
        }`}>
          <Outlet />
        </main>

        {/* ── Salesman bottom tab bar (mobile only) — flex sibling of main, ─────
             not position:fixed, so it always occupies real layout height and
             never fights with a page's own internal scroll container. ──────── */}
        {user?.role === 'salesman' && (
          <nav
            className="lg:hidden flex-shrink-0 bg-emerald-50 flex items-stretch relative z-10"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom)',
              border: '3px solid #059669',
              boxShadow: '0 -4px 12px rgba(5,150,105,0.15)',
            }}
          >
            {[
              { to: '/',                        icon: ShoppingCart, label: 'Stock',     end: true },
              { to: '/salesman/balance',         icon: Wallet,       label: 'Balance'           },
              { to: '/salesman/my-statement',    icon: ScrollText,   label: 'Statement'         },
              { to: '/salesman/change-password', icon: Lock,         label: 'Security'          },
            ].map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end || to === '/'}
                className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors"
              >
                {({ isActive }) => (
                  <>
                    <div className={`flex items-center justify-center w-11 h-8 rounded-xl transition-colors ${
                      isActive ? 'bg-emerald-600' : ''
                    }`}>
                      <Icon
                        size={19}
                        strokeWidth={2}
                        className={isActive ? 'text-white' : 'text-emerald-700/40'}
                      />
                    </div>
                    <span className={`text-[10px] font-semibold leading-none ${
                      isActive ? 'text-emerald-700' : 'text-emerald-700/40'
                    }`}>
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
