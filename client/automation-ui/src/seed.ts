import { request, type APIRequestContext } from '@playwright/test';
import { env } from './env';

/**
 * Arrange-by-API helper. Browsers are slow at setting up data and brittle when they have to; the API is fast and
 * exact. Specs create their world here (an `E2E-...` brand, product, salesperson, ...), drive the UI to act, and
 * everything is removed afterwards by `dispose()` in reverse order, pass or fail.
 */
type Role = 'admin' | 'superadmin';
type Json = Record<string, unknown>;

const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
export const unique = (prefix = 'E2E'): string => `${prefix}-${stamp()}`;

/** Sign-in is limited to 20/hour/IP, so each role signs in once per worker and the token is shared. */
const tokens = new Map<Role, string>();

export class Seed {
  private readonly undo: Array<{ label: string; run: () => Promise<void> }> = [];
  private ctx?: APIRequestContext;

  private async api(): Promise<APIRequestContext> {
    this.ctx ??= await request.newContext({ baseURL: env.apiBaseUrl });
    return this.ctx;
  }

  private async token(role: Role): Promise<string> {
    const cached = tokens.get(role);
    if (cached) return cached;
    const [username, password] =
      role === 'admin' ? [env.adminUsername(), env.adminPassword()] : [env.superadminUsername, env.superadminPassword];
    const res = await (await this.api()).post('/api/v1/auth/login', { data: { username, password } });
    if (!res.ok()) throw new Error(`seed: ${role} login failed -> ${res.status()} ${await res.text()}`);
    const token = (await res.json()).data.accessToken as string;
    tokens.set(role, token);
    return token;
  }

  /**
   * One API call. Bulk routes allow 30 requests a minute per IP, so a 429 is waited out (the server says how long)
   * and retried; nothing else is ever retried, so a write is never repeated after a real failure.
   */
  async call(role: Role, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, data?: Json) {
    const api = await this.api();
    for (let attempt = 0; ; attempt++) {
      const res = await api[method](`/api/v1${path}`, {
        headers: { Authorization: `Bearer ${await this.token(role)}` },
        ...(data ? { data } : {}),
      });
      if (res.status() !== 429 || attempt >= 3) return res;
      const waitS = Math.min(Number(res.headers()['retry-after']) || 20, 65);
      await new Promise((resolve) => setTimeout(resolve, waitS * 1000));
    }
  }

  private async create(role: Role, path: string, body: Json, what: string): Promise<Json> {
    const res = await this.call(role, 'post', path, body);
    if (res.status() !== 201 && res.status() !== 200) {
      throw new Error(`seed: create ${what} -> ${res.status()} ${await res.text()}`);
    }
    return (await res.json()).data as Json;
  }

  private onDispose(label: string, run: () => Promise<void>): void {
    this.undo.push({ label, run });
  }

  private removeLater(role: Role, path: string): void {
    this.onDispose(`DELETE ${path}`, async () => {
      const res = await this.call(role, 'delete', path);
      if (![200, 404].includes(res.status())) throw new Error(`seed cleanup: DELETE ${path} -> ${res.status()} ${await res.text()}`);
    });
  }

  /**
   * A throwaway brand (superadmin only). Brands cannot be deleted, so on cleanup it is emptied first - the day's
   * stock is zeroed and its payments deleted, so shared reports and totals are not left polluted - and then archived.
   */
  async brand(): Promise<{ id: number; name: string }> {
    const brand = await this.create('superadmin', '/brands', { name: unique() }, 'brand');
    this.onDispose(`empty and archive brand ${brand.id}`, () => this.emptyAndArchiveBrand(brand.id as number));
    return brand as { id: number; name: string };
  }

  /** Zeroes a brand's recent stock, deletes its payments and archives it. Safe to repeat. */
  private async emptyAndArchiveBrand(brandId: number): Promise<void> {
    for (const date of [todayIST(), todayIST(-1)]) {
      const receipts = await this.call('admin', 'get', `/stock-receipts?date=${date}&brandId=${brandId}`);
      if (!receipts.ok()) continue;
      const rows = ((await receipts.json()).data ?? []) as Array<{ productId: number; routeId?: number; unitPrice?: unknown }>;
      const byRoute = new Map<number, Array<{ productId: number; quantity: number; unitPrice: number }>>();
      for (const r of rows) {
        const list = byRoute.get(r.routeId ?? 0) ?? [];
        list.push({ productId: r.productId, quantity: 0, unitPrice: Number(r.unitPrice ?? 0) });
        byRoute.set(r.routeId ?? 0, list);
      }
      for (const [routeId, items] of byRoute) {
        await this.call('admin', 'post', '/stock-receipts/bulk', { brandId, date, routeId, items });
      }
    }
    const payments = await this.call('admin', 'get', `/dairy-payments?brandId=${brandId}`);
    if (payments.ok()) {
      const body = (await payments.json()).data;
      const list = (Array.isArray(body) ? body : (body?.items ?? [])) as Array<{ id: number }>;
      for (const p of list) await this.call('admin', 'delete', `/dairy-payments/${p.id}`);
    }
    await this.call('superadmin', 'put', `/brands/${brandId}`, { isArchived: true });
  }

  /** Removes a salesperson; one with history is first reset (superadmin) or, failing that, deactivated. */
  private async removeSalesperson(id: number): Promise<void> {
    let del = await this.call('admin', 'delete', `/salespeople/${id}`);
    if (del.status() === 400 && env.superadminUsername) {
      await this.call('superadmin', 'post', '/salespeople/reset-ledger', { salespersonIds: [id] });
      del = await this.call('admin', 'delete', `/salespeople/${id}`);
    }
    if (del.status() === 400) {
      await this.call('admin', 'put', `/salespeople/${id}`, { isActive: false });
    } else if (![200, 404].includes(del.status())) {
      throw new Error(`seed cleanup: salesperson ${id} -> ${del.status()} ${await del.text()}`);
    }
  }

  /**
   * Janitor, run once at the start of a run: removes `E2E-` data left behind by an earlier run that crashed or timed
   * out before its own cleanup (throwaway brands, salespeople, office logins). Needs a superadmin; otherwise a no-op.
   */
  async sweep(): Promise<void> {
    if (!env.apiBaseUrl || !env.superadminUsername || !env.superadminPassword) return;
    const brands = await this.call('superadmin', 'get', '/brands');
    if (brands.ok()) {
      for (const b of ((await brands.json()).data ?? []) as Array<{ id: number; name: string }>) {
        if (b.name.startsWith('E2E-')) await this.emptyAndArchiveBrand(b.id);
      }
    }
    const people = await this.call('admin', 'get', '/salespeople');
    if (people.ok()) {
      for (const p of ((await people.json()).data ?? []) as Array<{ id: number; name: string }>) {
        if (/^E2E[ -]/.test(p.name)) await this.removeSalesperson(p.id);
      }
    }
    const users = await this.call('superadmin', 'get', '/admin-users');
    if (users.ok()) {
      for (const u of ((await users.json()).data ?? []) as Array<{ id: number; username: string }>) {
        if (u.username.startsWith('e2e-')) await this.call('superadmin', 'delete', `/admin-users/${u.id}`);
      }
    }
    await this.ctx?.dispose();
  }

  async category(brandId: number, name = unique()): Promise<{ id: number; name: string }> {
    const category = await this.create('admin', '/categories', { brandId, name }, 'category');
    this.removeLater('admin', `/categories/${category.id}`);
    return category as { id: number; name: string };
  }

  async product(
    brandId: number,
    overrides: Json = {},
  ): Promise<{ id: number; name: string; brandId: number }> {
    const product = await this.create(
      'admin',
      '/products',
      { brandId, name: unique(), unitType: 'piece', costPrice: 10, sellingPrice: 12, ...overrides },
      'product',
    );
    this.removeLater('admin', `/products/${product.id}`); // soft delete
    return product as { id: number; name: string; brandId: number };
  }

  /** A throwaway office login (superadmin only), e.g. a dispatcher. Deleted afterwards. */
  async adminUser(role: 'admin' | 'dispatcher'): Promise<{ id: number; username: string; password: string }> {
    const username = `e2e-${stamp().toLowerCase()}`;
    const password = `E2e!${stamp()}aA1`;
    const user = await this.create('superadmin', '/admin-users', { username, password, role }, 'admin user');
    this.removeLater('superadmin', `/admin-users/${user.id}`);
    return { id: user.id as number, username, password };
  }

  /** Turns a product on for every salesperson, with the default price they are charged. */
  async enableForSalespeople(productId: number, defaultPrice: number): Promise<void> {
    const res = await this.call('admin', 'patch', '/products/salesperson-global', {
      products: [{ productId, isEnabled: true, defaultPrice }],
    });
    if (!res.ok()) throw new Error(`seed: enable product for salespeople -> ${res.status()} ${await res.text()}`);
  }

  /** Sets one salesperson's own selling price for a product, effective today. */
  async salespersonPrice(salespersonId: number, productId: number, sellingPrice: number): Promise<void> {
    const res = await this.call('admin', 'post', `/salespeople/${salespersonId}/prices/bulk`, {
      effectiveFrom: todayIST(),
      prices: [{ productId, sellingPrice }],
    });
    if (!res.ok()) throw new Error(`seed: salesperson price -> ${res.status()} ${await res.text()}`);
  }

  /** Dispatches stock to a salesperson on behalf of the admin. Removed again with the salesperson. */
  async dispatch(
    salespersonId: number,
    dispatchDate: string,
    items: Array<{ productId: number; quantity: number; unitPrice: number }>,
    submit = false,
  ): Promise<{ id: number }> {
    const res = await this.call('admin', 'post', '/dispatches', { salespersonId, dispatchDate, items });
    if (!res.ok()) throw new Error(`seed: dispatch -> ${res.status()} ${await res.text()}`);
    const dispatch = (await res.json()).data as { id: number };
    if (submit) {
      const done = await this.call('admin', 'patch', `/dispatches/${dispatch.id}/submit`);
      if (!done.ok()) throw new Error(`seed: submit dispatch -> ${done.status()} ${await done.text()}`);
    }
    return dispatch;
  }

  async salespersonPayment(salespersonId: number, amount: number, paymentDate = todayIST()): Promise<{ id: number }> {
    const payment = await this.create(
      'admin',
      '/salesperson-payments',
      { salespersonId, amount, paymentDate, paymentMode: 'Cash' },
      'salesperson payment',
    );
    return payment as { id: number };
  }

  async route(brandId: number): Promise<{ id: number; routeNumber: string }> {
    const route = await this.create('admin', '/routes', { brandId, routeNumber: unique() }, 'route');
    this.removeLater('admin', `/routes/${route.id}`);
    return route as { id: number; routeNumber: string };
  }

  /** A throwaway salesperson. With `canLogIn` it also has a username and password for the phone specs. */
  async salesperson(canLogIn = false): Promise<{ id: number; name: string; username?: string; password?: string }> {
    const name = `E2E ${unique('SP')}`;
    const body: Json = { name };
    let username: string | undefined;
    let password: string | undefined;
    if (canLogIn) {
      username = `e2e-${stamp().toLowerCase()}`;
      password = `E2e!${stamp()}aA1`;
      Object.assign(body, { username, password });
    }
    const sp = await this.create('admin', '/salespeople', body, 'salesperson');
    this.onDispose(`remove salesperson ${sp.id}`, () => this.removeSalesperson(sp.id as number));
    return { ...(sp as { id: number; name: string }), username, password };
  }

  /** Saves stock received for a product on a date (admin). */
  async stockReceipt(
    brandId: number,
    date: string,
    items: Array<{ productId: number; quantity: number; unitPrice: number }>,
    routeId = 0,
  ) {
    const res = await this.call('admin', 'post', '/stock-receipts/bulk', { brandId, date, routeId, items });
    if (res.status() !== 200) throw new Error(`seed: stock receipt -> ${res.status()} ${await res.text()}`);
  }

  async dairyPayment(brandId: number, amount: number, paymentDate: string): Promise<{ id: number }> {
    const payment = await this.create('admin', '/dairy-payments', { brandId, amount, paymentDate, paymentMode: 'Cash' }, 'dairy payment');
    this.removeLater('admin', `/dairy-payments/${payment.id}`);
    return payment as { id: number };
  }

  /** Reads a JSON resource as admin (for assertions against what the API itself holds). */
  async get(path: string): Promise<Json> {
    const res = await this.call('admin', 'get', path);
    if (!res.ok()) throw new Error(`seed: GET ${path} -> ${res.status()}`);
    return (await res.json()) as Json;
  }

  /** Undo everything, newest first. Every step is attempted; failures are reported together. */
  async dispose(): Promise<void> {
    const failures: string[] = [];
    for (const step of this.undo.reverse()) {
      try {
        await step.run();
      } catch (e) {
        failures.push(`${step.label}: ${(e as Error).message}`);
      }
    }
    await this.ctx?.dispose();
    if (failures.length) throw new Error(`seed cleanup failed:\n${failures.join('\n')}`);
  }
}

/** Today's business date in India (the zone the backend validates in), as YYYY-MM-DD. */
export const todayIST = (offsetDays = 0): string =>
  new Date(Date.now() + 5.5 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
