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
    paymentMode: 'Top-up', brandNames: ['Nandini', 'Jersey'],
  };
  const DEPOSIT = { ...DUES, total: 20000, paymentMode: 'Deposit Top-up', brandNames: ['Nandini'], count: 1 };

  test('a dues top-up gets the plain header and amber color', () => {
    const c = buildCard(SLACK_EVENTS.DAIRY_TOPUP_RECORDED, DUES);
    expect(headerText(c)).toBe('💰 Dairy Top-up Recorded');
    expect(c.attachments[0].color).toBe('#e8a838'); // AMBER
  });

  test('a deposit top-up gets its own header and a distinct color', () => {
    const c = buildCard(SLACK_EVENTS.DAIRY_TOPUP_RECORDED, DEPOSIT);
    expect(headerText(c)).toBe('🏦 Dairy Deposit Top-up Recorded');
    expect(c.attachments[0].color).toBe('#0f9488'); // TEAL — distinct from dues' amber
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
