'use strict';

/**
 * Slack card content tests.
 *
 * Covers the three bulk-action card types (salesperson top-up, dairy top-up
 * — dues and deposit — and salesperson ledger reset), which previously
 * reused single-record event types (SALESPERSON_PAYMENT_RECORDED,
 * DAIRY_PAYMENT_RECORDED, SALESPERSON_UPDATED) whose templates expect fields
 * these bulk actions never supplied. That produced cards with the wrong
 * header ("Collection Recorded" / "Salesperson Updated" for a bulk top-up or
 * a ledger wipe) and literal "undefined" in place of the salesperson/brand
 * name.
 *
 * buildCard is a pure function (no network I/O), so these assert on its
 * output directly rather than through notifySlack.
 */

const { test, expect } = require('@playwright/test');
const { buildCard, SLACK_EVENTS } = require('../../utils/slack');

/** Pulls every text string out of a card's blocks, for loose substring checks. */
function allText(cardPayload) {
  const blocks = cardPayload.attachments[0].blocks;
  const parts = [cardPayload.text];
  for (const b of blocks) {
    if (b.text?.text) parts.push(b.text.text);
    if (b.fields) parts.push(...b.fields.map(f => f.text));
    if (b.elements) parts.push(...b.elements.map(e => e.text));
  }
  return parts.join('\n');
}

function headerText(cardPayload) {
  return cardPayload.attachments[0].blocks.find(b => b.type === 'header')?.text?.text;
}

test.describe('SALESPERSON_TOPUP_RECORDED card', () => {
  const DATA = {
    date: '2026-04-30', count: 2, total: 51250, createdBy: 'raghav',
    notes: 'Legacy dues', salespersonNames: ['K Pandu', 'Mahesh'],
  };

  test('has its own header, not "Collection Recorded"', () => {
    const c = buildCard(SLACK_EVENTS.SALESPERSON_TOPUP_RECORDED, DATA);
    expect(headerText(c)).toBe('💰 Salesperson Top-up Recorded');
  });

  test('lists the actual salespeople by name, not "undefined"', () => {
    const c = buildCard(SLACK_EVENTS.SALESPERSON_TOPUP_RECORDED, DATA);
    const text = allText(c);
    expect(text).toContain('K Pandu, Mahesh');
    expect(text).not.toContain('undefined');
  });

  test('shows the total amount and who added it', () => {
    const c = buildCard(SLACK_EVENTS.SALESPERSON_TOPUP_RECORDED, DATA);
    const text = allText(c);
    expect(text).toContain('₹51,250.00');
    expect(text).toContain('raghav');
    expect(text).toContain('Legacy dues');
  });

  test('falls back to a count when names are not supplied', () => {
    const c = buildCard(SLACK_EVENTS.SALESPERSON_TOPUP_RECORDED, { ...DATA, salespersonNames: undefined });
    expect(allText(c)).toContain('2 salesperson(s)');
  });

  test('omits the note field entirely when none was given', () => {
    const c = buildCard(SLACK_EVENTS.SALESPERSON_TOPUP_RECORDED, { ...DATA, notes: undefined });
    const noteField = c.attachments[0].blocks
      .flatMap(b => b.fields ?? [])
      .find(f => f.text.startsWith('*📝 Note*'));
    expect(noteField).toBeUndefined();
  });
});

test.describe('DAIRY_TOPUP_RECORDED card', () => {
  const DUES = {
    date: '2026-04-30', count: 2, total: 9000, createdBy: 'raghav',
    brandNames: ['Nandini', 'Jersey'],
  };

  test('gets the plain header and amber color', () => {
    const c = buildCard(SLACK_EVENTS.DAIRY_TOPUP_RECORDED, DUES);
    expect(headerText(c)).toBe('💰 Dairy Top-up Recorded');
    expect(c.attachments[0].color).toBe('#e8a838'); // AMBER
  });

  test('lists the actual brand names, not "undefined"', () => {
    const c = buildCard(SLACK_EVENTS.DAIRY_TOPUP_RECORDED, DUES);
    const text = allText(c);
    expect(text).toContain('Nandini, Jersey');
    expect(text).not.toContain('undefined');
  });

  test('has its own header, not "Dairy Payment Recorded"', () => {
    // The old bug reused DAIRY_PAYMENT_RECORDED, which implies a real payment
    // was received — misleading for a top-up, which is the opposite.
    const c = buildCard(SLACK_EVENTS.DAIRY_TOPUP_RECORDED, DUES);
    expect(headerText(c)).not.toBe('✅ Dairy Payment Recorded');
  });
});

// A deposit top-up is a standalone ledger entry (DairyDepositTopUp), not a
// DairyPayment — it gets its own event/card rather than reusing
// DAIRY_TOPUP_RECORDED, so it's never mistaken for a change to what the
// dairy is owed for stock.
test.describe('DAIRY_DEPOSIT_TOPUP_RECORDED card', () => {
  const DATA = {
    date: '2026-04-30', count: 1, total: 20000, createdBy: 'raghav',
    brandNames: ['Nandini'],
  };

  test('gets its own header and a teal color, distinct from the dues top-up', () => {
    const c = buildCard(SLACK_EVENTS.DAIRY_DEPOSIT_TOPUP_RECORDED, DATA);
    expect(headerText(c)).toBe('🏦 Dairy Deposit Top-up Recorded');
    expect(c.attachments[0].color).toBe('#0f9488'); // TEAL
  });

  test('lists the actual brand names and total, not "undefined"', () => {
    const c = buildCard(SLACK_EVENTS.DAIRY_DEPOSIT_TOPUP_RECORDED, DATA);
    const text = allText(c);
    expect(text).toContain('Nandini');
    expect(text).toContain('₹20,000.00');
    expect(text).toContain('raghav');
    expect(text).not.toContain('undefined');
  });
});

test.describe('SALESPERSON_LEDGER_RESET card', () => {
  const DATA = {
    salespersonNames: ['K Pandu'], payments: 3, dispatches: 5, balances: 7, by: 'raghav',
  };

  test('has its own header, not "Salesperson Updated"', () => {
    const c = buildCard(SLACK_EVENTS.SALESPERSON_LEDGER_RESET, DATA);
    expect(headerText(c)).toBe('🧹 Salesperson Ledger Reset');
  });

  test('is colored red as a destructive action', () => {
    const c = buildCard(SLACK_EVENTS.SALESPERSON_LEDGER_RESET, DATA);
    expect(c.attachments[0].color).toBe('#e01e5a'); // RED
  });

  test('never shows the misleading "Active ✅" status the old card carried', () => {
    // The old bug reused SALESPERSON_UPDATED, whose template renders an
    // isActive field that defaults to "Active ✅" when absent — nonsensical
    // for a ledger wipe, and not what actually happened.
    const c = buildCard(SLACK_EVENTS.SALESPERSON_LEDGER_RESET, DATA);
    expect(allText(c)).not.toContain('Active ✅');
  });

  test('reports what was actually removed, not "undefined"', () => {
    const c = buildCard(SLACK_EVENTS.SALESPERSON_LEDGER_RESET, DATA);
    const text = allText(c);
    expect(text).toContain('K Pandu');
    expect(text).toContain('3');
    expect(text).toContain('5');
    expect(text).toContain('7');
    expect(text).toContain('raghav');
    expect(text).not.toContain('undefined');
  });

  test('lists every salesperson in a multi-select reset', () => {
    const c = buildCard(SLACK_EVENTS.SALESPERSON_LEDGER_RESET, {
      ...DATA, salespersonNames: ['K Pandu', 'Mahesh', 'Ravi'],
    });
    expect(allText(c)).toContain('K Pandu, Mahesh, Ravi');
  });
});

// ─── Slack audit additions ────────────────────────────────────────────────
// Coverage for the gaps closed in the full Slack-card audit: salesman self-
// service actions (password change, dispatch submit, actor-attributed
// dispatch save/delete), admin/superadmin security & money actions (brands,
// admin users, salesperson pricing, global product access), and process-
// level error visibility that previously didn't exist at all.

test.describe('PASSWORD_CHANGED card', () => {
  test('shows the role-specific header and who changed it', () => {
    const c = buildCard(SLACK_EVENTS.PASSWORD_CHANGED, { username: 'raghav', role: 'Admin', ip: '1.2.3.4' });
    expect(headerText(c)).toBe('🔑 Admin Password Changed');
    expect(allText(c)).toContain('raghav');
    expect(allText(c)).toContain('1.2.3.4');
  });

  test('salesman self-service uses the Salesman header', () => {
    const c = buildCard(SLACK_EVENTS.PASSWORD_CHANGED, { username: 'mahesh', role: 'Salesman', ip: '5.6.7.8' });
    expect(headerText(c)).toBe('🔑 Salesman Password Changed');
  });
});

test.describe('PIN_FAILED card', () => {
  test('reports who entered the wrong PIN', () => {
    const c = buildCard(SLACK_EVENTS.PIN_FAILED, { username: 'raghav', role: 'Admin', ip: '1.2.3.4' });
    expect(headerText(c)).toBe('🚫 Wrong PIN Entered');
    expect(allText(c)).toContain('raghav');
    expect(c.attachments[0].color).toBe('#e01e5a'); // RED
  });
});

test.describe('Dispatch actor attribution', () => {
  test('DISPATCH_SAVED shows who did it — admin', () => {
    const c = buildCard(SLACK_EVENTS.DISPATCH_SAVED, {
      salespersonName: 'K Pandu', date: '2026-04-30', itemCount: 4, totalAmount: 1200, by: 'Admin (raghav)',
    });
    expect(allText(c)).toContain('Admin (raghav)');
  });

  test('DISPATCH_SAVED shows self-entry distinctly from admin', () => {
    const c = buildCard(SLACK_EVENTS.DISPATCH_SAVED, {
      salespersonName: 'K Pandu', date: '2026-04-30', itemCount: 4, totalAmount: 1200, by: 'Salesperson (self)',
    });
    expect(allText(c)).toContain('Salesperson (self)');
  });

  test('DISPATCH_DELETED also carries the by field', () => {
    const c = buildCard(SLACK_EVENTS.DISPATCH_DELETED, {
      salespersonName: 'K Pandu', date: '2026-04-30', totalAmount: 1200, by: 'Salesperson (self)',
    });
    expect(allText(c)).toContain('Salesperson (self)');
  });
});

test.describe('DISPATCH_SUBMITTED card', () => {
  test('confirms the salesman finalized their entry', () => {
    const c = buildCard(SLACK_EVENTS.DISPATCH_SUBMITTED, {
      salespersonName: 'K Pandu', date: '2026-04-30', itemCount: 4, totalAmount: 1200,
    });
    expect(headerText(c)).toBe('📮 Stock Entry Submitted');
    expect(allText(c)).toContain('K Pandu');
  });
});

test.describe('DISPATCH_LOCK_CHANGED card', () => {
  test('locked action gets its own header and amber color', () => {
    const c = buildCard(SLACK_EVENTS.DISPATCH_LOCK_CHANGED, {
      action: 'locked', salespersonName: 'K Pandu', date: '2026-04-30', by: 'Admin (raghav)',
    });
    expect(headerText(c)).toBe('🔒 Dispatch Locked');
    expect(c.attachments[0].color).toBe('#e8a838'); // AMBER
  });

  test('unlocked and opened actions get distinct headers', () => {
    const unlocked = buildCard(SLACK_EVENTS.DISPATCH_LOCK_CHANGED, {
      action: 'unlocked', salespersonName: 'K Pandu', date: '2026-04-30', by: 'Admin (raghav)',
    });
    const opened = buildCard(SLACK_EVENTS.DISPATCH_LOCK_CHANGED, {
      action: 'opened', salespersonName: 'K Pandu', date: '2026-04-30', by: 'Admin (raghav)',
    });
    expect(headerText(unlocked)).toBe('🔓 Dispatch Unlocked');
    expect(headerText(opened)).toBe('🔓 Dispatch Reopened for Entry');
  });
});

test.describe('Salesperson pricing cards', () => {
  test('SALESPERSON_PRICES_UPDATED reports who and how many', () => {
    const c = buildCard(SLACK_EVENTS.SALESPERSON_PRICES_UPDATED, {
      salespersonName: 'K Pandu', count: 6, by: 'raghav',
    });
    expect(headerText(c)).toBe('💲 Salesperson Prices Updated');
    expect(allText(c)).toContain('K Pandu');
    expect(allText(c)).toContain('raghav');
  });

  test('SALESPERSON_PRICES_COPIED shows source and target', () => {
    const c = buildCard(SLACK_EVENTS.SALESPERSON_PRICES_COPIED, {
      fromName: 'K Pandu', toName: 'Mahesh', count: 10, by: 'raghav',
    });
    expect(headerText(c)).toBe('📋 Salesperson Prices Copied');
    const text = allText(c);
    expect(text).toContain('K Pandu');
    expect(text).toContain('Mahesh');
  });

  test('SALESPERSON_PRICES_BULK_UPDATED shows product and affected count', () => {
    const c = buildCard(SLACK_EVENTS.SALESPERSON_PRICES_BULK_UPDATED, {
      salespersonNames: ['K Pandu', 'Mahesh'], count: 2, productName: 'Toned Milk 500ml', price: 24, by: 'raghav',
    });
    expect(headerText(c)).toBe('💲 Salesperson Prices Bulk Updated');
    const text = allText(c);
    expect(text).toContain('Toned Milk 500ml');
    expect(text).toContain('₹24.00');
  });

  test('PRODUCT_PRICES_CLEARED is a destructive (red) card', () => {
    const c = buildCard(SLACK_EVENTS.PRODUCT_PRICES_CLEARED, {
      productName: 'Toned Milk 500ml', brandName: 'Nandini', count: 8, by: 'raghav',
    });
    expect(headerText(c)).toBe('🧹 Custom Prices Cleared');
    expect(c.attachments[0].color).toBe('#e01e5a'); // RED
  });
});

test.describe('PRODUCT_GLOBAL_ACCESS_UPDATED card', () => {
  test('shows enabled state, price and blast radius', () => {
    const c = buildCard(SLACK_EVENTS.PRODUCT_GLOBAL_ACCESS_UPDATED, {
      name: 'Curd 200ml', brandName: 'Nandini', isEnabled: true, price: 18, count: 12, by: 'raghav',
    });
    expect(headerText(c)).toBe('🌐 Product Access Updated — All Salespeople');
    const text = allText(c);
    expect(text).toContain('Enabled ✅');
    expect(text).toContain('12 salespeople');
  });

  test('shows Disabled when access is revoked', () => {
    const c = buildCard(SLACK_EVENTS.PRODUCT_GLOBAL_ACCESS_UPDATED, {
      name: 'Curd 200ml', brandName: 'Nandini', isEnabled: false, count: 12, by: 'raghav',
    });
    expect(allText(c)).toContain('Disabled ❌');
  });
});

test.describe('Brand cards', () => {
  test('BRAND_CREATED shows deposit config', () => {
    const c = buildCard(SLACK_EVENTS.BRAND_CREATED, {
      name: 'Heritage', depositEnabled: true, depositPerLitre: 2, by: 'raghav',
    });
    expect(headerText(c)).toBe('🆕 Brand Added');
    expect(allText(c)).toContain('Heritage');
  });

  test('BRAND_UPDATED plain update keeps the normal header and color', () => {
    const c = buildCard(SLACK_EVENTS.BRAND_UPDATED, {
      name: 'Nandini', depositEnabled: true, depositPerLitre: 2, isActive: true, isArchived: false, by: 'raghav',
    });
    expect(headerText(c)).toBe('✏️ Brand Updated');
    expect(c.attachments[0].color).toBe('#e8a838'); // AMBER
  });

  test('BRAND_UPDATED with isArchived becomes a red, irreversible-warning card', () => {
    const c = buildCard(SLACK_EVENTS.BRAND_UPDATED, {
      name: 'Old Brand', depositEnabled: false, isActive: false, isArchived: true, by: 'raghav',
    });
    expect(headerText(c)).toBe('📦 Brand Archived');
    expect(c.attachments[0].color).toBe('#e01e5a'); // RED
    expect(allText(c)).toContain('cannot be restored');
  });
});

test.describe('Admin user cards (superadmin-only)', () => {
  test('ADMIN_USER_CREATED reports the new user, role and creator', () => {
    const c = buildCard(SLACK_EVENTS.ADMIN_USER_CREATED, { username: 'newadmin', role: 'admin', by: 'raghav' });
    expect(headerText(c)).toBe('🆕 Admin User Created');
    expect(allText(c)).toContain('newadmin');
    expect(allText(c)).toContain('raghav');
  });

  test('ADMIN_USER_UPDATED reports status changes', () => {
    const c = buildCard(SLACK_EVENTS.ADMIN_USER_UPDATED, { username: 'someadmin', role: 'admin', isActive: false, by: 'raghav' });
    expect(headerText(c)).toBe('✏️ Admin User Updated');
    expect(allText(c)).toContain('Deactivated ❌');
  });

  test('ADMIN_USER_DELETED is colored red', () => {
    const c = buildCard(SLACK_EVENTS.ADMIN_USER_DELETED, { username: 'oldadmin', role: 'admin', by: 'raghav' });
    expect(headerText(c)).toBe('🗑️ Admin User Deleted');
    expect(c.attachments[0].color).toBe('#e01e5a'); // RED
  });
});

test.describe('Process-level error cards', () => {
  test('SERVER_BOOT_FAILED reports the failing stage', () => {
    const c = buildCard(SLACK_EVENTS.SERVER_BOOT_FAILED, {
      env: 'production', stage: 'migrations', message: 'connection refused',
    });
    expect(headerText(c)).toBe('🆘 Server Failed to Start');
    expect(allText(c)).toContain('migrations');
    expect(allText(c)).toContain('connection refused');
    expect(c.attachments[0].color).toBe('#e01e5a'); // RED
  });

  test('PROCESS_CRASH reports the crash type and message', () => {
    const c = buildCard(SLACK_EVENTS.PROCESS_CRASH, {
      env: 'production', type: 'uncaughtException', message: 'Cannot read properties of undefined',
    });
    expect(headerText(c)).toBe('☠️ Uncaught Process Crash');
    expect(allText(c)).toContain('uncaughtException');
    expect(c.attachments[0].color).toBe('#e01e5a'); // RED
  });
});
