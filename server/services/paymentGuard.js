'use strict';

const AppError = require('../utils/AppError');

/**
 * Server-side over-payment guard. Asserts that a proposed payment doesn't
 * exceed the latest outstanding balance for the entity (brand or salesperson).
 *
 * Client-side, PaymentForm already disables the Save button when the amount
 * exceeds the balance — but the only honest place to enforce this is the API,
 * because any caller with a valid JWT could otherwise POST a payment that
 * leaves the entity in credit.
 *
 * The "outstanding" concept is the most recent closingBalance, clamped at 0.
 * If the entity is already in credit (closing < 0), no further payment is
 * allowed. If the entity owes ₹X, payment up to ₹X is allowed.
 *
 * Note: UPDATE flows are not guarded here. The existing payment's amount is
 * already factored into the current balance, so a naive recheck would
 * double-count. Increases-with-overshoot in updates are a separate concern.
 */

/** Asserts that the proposed dairy payment doesn't exceed outstanding. */
async function assertDairyPaymentWithinBalance(tx, brandId, amount) {
  const latest = await tx.dairyBalance.findFirst({
    where: { brandId },
    orderBy: { balanceDate: 'desc' },
    select: { closingBalance: true },
  });
  const outstanding = Math.max(0, Number(latest?.closingBalance ?? 0));
  if (amount > outstanding) {
    throw new AppError(
      outstanding === 0
        ? 'No outstanding balance for this brand — nothing to pay.'
        : `Payment of ₹${amount} exceeds outstanding balance of ₹${outstanding.toFixed(2)}.`,
      400,
    );
  }
}

/** Asserts that the proposed salesperson collection doesn't exceed outstanding. */
async function assertSalespersonPaymentWithinBalance(tx, salespersonId, amount) {
  const latest = await tx.salespersonBalance.findFirst({
    where: { salespersonId },
    orderBy: { balanceDate: 'desc' },
    select: { closingBalance: true },
  });
  const outstanding = Math.max(0, Number(latest?.closingBalance ?? 0));
  if (amount > outstanding) {
    throw new AppError(
      outstanding === 0
        ? 'No outstanding balance for this salesperson — nothing to collect.'
        : `Payment of ₹${amount} exceeds outstanding balance of ₹${outstanding.toFixed(2)}.`,
      400,
    );
  }
}

// ─── UPDATE-side guards ──────────────────────────────────────────────────────
//
// The latest closingBalance already factors in the *old* amount, so a naive
// recheck on the new amount would block valid edits (e.g. lowering a payment)
// and let through some invalid ones. The right test is delta:
//   delta = newAmount − oldAmount
//   reject when delta > outstanding   (increase would overdraw)
//   decreases are always safe (outstanding goes back up)
//
// Date changes don't complicate this: the global closing only changes by
// delta regardless of where the payment lives in time.

async function assertDairyPaymentUpdateWithinBalance(tx, brandId, newAmount, oldAmount) {
  const delta = newAmount - oldAmount;
  if (delta <= 0) return; // decreases (or no-change) are always safe

  const latest = await tx.dairyBalance.findFirst({
    where: { brandId },
    orderBy: { balanceDate: 'desc' },
    select: { closingBalance: true },
  });
  const outstanding = Math.max(0, Number(latest?.closingBalance ?? 0));
  if (delta > outstanding) {
    throw new AppError(
      outstanding === 0
        ? `Cannot increase payment by ₹${delta} — no remaining outstanding balance for this brand.`
        : `Increase of ₹${delta} would exceed remaining outstanding balance of ₹${outstanding.toFixed(2)}.`,
      400,
    );
  }
}

async function assertSalespersonPaymentUpdateWithinBalance(tx, salespersonId, newAmount, oldAmount) {
  const delta = newAmount - oldAmount;
  if (delta <= 0) return;

  const latest = await tx.salespersonBalance.findFirst({
    where: { salespersonId },
    orderBy: { balanceDate: 'desc' },
    select: { closingBalance: true },
  });
  const outstanding = Math.max(0, Number(latest?.closingBalance ?? 0));
  if (delta > outstanding) {
    throw new AppError(
      outstanding === 0
        ? `Cannot increase payment by ₹${delta} — no remaining outstanding balance for this salesperson.`
        : `Increase of ₹${delta} would exceed remaining outstanding balance of ₹${outstanding.toFixed(2)}.`,
      400,
    );
  }
}

module.exports = {
  assertDairyPaymentWithinBalance,
  assertSalespersonPaymentWithinBalance,
  assertDairyPaymentUpdateWithinBalance,
  assertSalespersonPaymentUpdateWithinBalance,
};
