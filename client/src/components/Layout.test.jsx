/**
 * Layout tests.
 *
 * Covers the three sidebar nav trees (admin, superadmin, salesman) built
 * from ADMIN_NAV_STATIC/SALESMAN_NAV, the superAdminOnly item filter, the
 * dynamic stock-brand items (falling back to the static brand list until
 * `/brands` resolves), the salesman-specific identity header + bottom tab
 * bar, the mobile hamburger drawer, and the sign-out confirmation flow.
 *
 * The desktop `<aside>` and the mobile drawer `<aside>` both render the same
 * <Sidebar>, so every nav label appears twice in the DOM regardless of
 * viewport — nav assertions are scoped to the desktop sidebar (the first
 * `<aside>`) to avoid "multiple elements found" noise.
 */

import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Layout from './Layout';
import api from '../api/axios';

vi.mock('../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const logout = vi.fn();
let mockUser = { role: 'admin', businessName: 'Vikas Milk Dairy' };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

function renderLayout() {
  const utils = render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<div>Page Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  const desktopSidebar = utils.container.querySelectorAll('aside')[0];
  return { ...utils, desktopSidebar };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: { data: [] } });
});

describe('Layout — admin nav', () => {
  beforeEach(() => { mockUser = { role: 'admin', businessName: 'Vikas Milk Dairy' }; });

  it('shows Dashboard, DAIRY, and SALESMAN modules but not Admin Users', async () => {
    const { desktopSidebar } = renderLayout();
    await within(desktopSidebar).findByText('Dashboard');
    expect(within(desktopSidebar).getByText('DAIRY')).toBeInTheDocument();
    expect(within(desktopSidebar).getByText('SALESMAN')).toBeInTheDocument();
    expect(within(desktopSidebar).queryByText('Admin Users')).toBeNull();
  });

  it('hides superAdminOnly items (Brands) for a regular admin', async () => {
    const { desktopSidebar } = renderLayout();
    await within(desktopSidebar).findByText('Dashboard');
    expect(within(desktopSidebar).queryByText('Brands')).toBeNull();
  });

  it('shows the fallback stock brands before /brands resolves, then the fetched ones', async () => {
    let resolveGet;
    vi.mocked(api.get).mockReturnValue(new Promise(res => { resolveGet = res; }));
    const { desktopSidebar } = renderLayout();

    expect(within(desktopSidebar).getByText('Nandini')).toBeInTheDocument(); // fallback
    expect(within(desktopSidebar).getByText('Jersey')).toBeInTheDocument();

    resolveGet({ data: { data: [{ id: 1, name: 'CustomBrand' }] } });
    expect(await within(desktopSidebar).findByText('CustomBrand')).toBeInTheDocument();
    expect(within(desktopSidebar).queryByText('Jersey')).toBeNull();
  });
});

describe('Layout — superadmin nav', () => {
  beforeEach(() => { mockUser = { role: 'superadmin', businessName: 'Vikas Milk Dairy' }; });

  it('shows the Admin Users link and Brands under Setup', async () => {
    const { desktopSidebar } = renderLayout();
    await within(desktopSidebar).findByText('Admin Users');
    expect(within(desktopSidebar).getByText('Brands')).toBeInTheDocument();
    expect(within(desktopSidebar).getByText('Super Admin')).toBeInTheDocument();
  });
});

describe('Layout — dispatcher nav', () => {
  beforeEach(() => { mockUser = { role: 'dispatcher', businessName: 'Vikas Milk Dairy' }; });

  it('shows only Dispatch Sheet, Stock Balance, and Change Password — no Dashboard', async () => {
    const { desktopSidebar } = renderLayout();
    await within(desktopSidebar).findByText('Dispatch Sheet');
    expect(within(desktopSidebar).queryByText('Dashboard')).toBeNull();
    expect(within(desktopSidebar).getByText('Stock Balance')).toBeInTheDocument();
    expect(within(desktopSidebar).getByText('Change Password')).toBeInTheDocument();
    expect(within(desktopSidebar).queryByText('DAIRY')).toBeNull();
    expect(within(desktopSidebar).queryByText('SALESMAN')).toBeNull();
  });

  it('shows the "Dispatcher" role label in the sidebar', async () => {
    const { desktopSidebar } = renderLayout();
    await within(desktopSidebar).findByText('Dispatcher');
  });

  it('does not fetch /brands for a dispatcher', async () => {
    const { desktopSidebar } = renderLayout();
    await within(desktopSidebar).findByText('Dispatch Sheet');
    expect(api.get).not.toHaveBeenCalledWith('/brands');
  });
});

describe('Layout — salesman nav', () => {
  beforeEach(() => { mockUser = { role: 'salesman', salespersonName: 'Ramu K', businessName: 'Vikas Milk Dairy' }; });

  it('shows only the salesman nav tree, with no Dashboard link', async () => {
    const { desktopSidebar } = renderLayout();
    await within(desktopSidebar).findByText('My Balance');
    expect(within(desktopSidebar).queryByText('Dashboard')).toBeNull();
    expect(within(desktopSidebar).getByText('Stock Entry')).toBeInTheDocument();
    expect(within(desktopSidebar).getByText('My Statement')).toBeInTheDocument();
    expect(within(desktopSidebar).getByText('Change Password')).toBeInTheDocument();
  });

  it('does not fetch /brands for a salesman', async () => {
    const { desktopSidebar } = renderLayout();
    await within(desktopSidebar).findByText('My Balance');
    expect(api.get).not.toHaveBeenCalledWith('/brands');
  });

  it('shows the salesman identity (initials) in the sidebar, and a bottom tab bar', async () => {
    renderLayout();
    // "RK" (initials) appears in the desktop sidebar + mobile drawer + mobile topbar.
    expect((await screen.findAllByText('RK')).length).toBeGreaterThan(0);
    // The bottom tab bar is mobile-only chrome, not part of either <aside>.
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
  });
});

describe('Layout — sign out', () => {
  beforeEach(() => { mockUser = { role: 'admin', businessName: 'Vikas Milk Dairy' }; });

  it('confirms before signing out, and Cancel dismisses without logging out', async () => {
    const { desktopSidebar } = renderLayout();
    await within(desktopSidebar).findByText('Dashboard');
    fireEvent.click(within(desktopSidebar).getByTitle('Sign Out'));

    expect(await screen.findByText('Sign out?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Sign out?')).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });

  it('confirming sign out logs out and navigates to /login', async () => {
    const { desktopSidebar } = renderLayout();
    await within(desktopSidebar).findByText('Dashboard');
    fireEvent.click(within(desktopSidebar).getByTitle('Sign Out'));
    fireEvent.click(await screen.findByText('Sign Out', { selector: 'button:not([title])' }));

    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});

describe('Layout — mobile drawer', () => {
  beforeEach(() => { mockUser = { role: 'admin', businessName: 'Vikas Milk Dairy' }; });

  it('opens the mobile nav drawer via the hamburger button', async () => {
    const { container, desktopSidebar } = renderLayout();
    await within(desktopSidebar).findByText('Dashboard');
    const drawer = container.querySelectorAll('aside')[1];
    expect(drawer.className).toContain('-translate-x-full');

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' })); // hamburger
    expect(drawer.className).toContain('translate-x-0');
  });
});
