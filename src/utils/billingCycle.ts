import { Transaction } from '../types';
import {
  ACCOUNTS_CONFIG,
  CREDIT_CARDS,
  isCreditCardAccount,
  isExcludedWifeCardUdhaar,
  isWifeCardAccount,
} from './accounts';

export interface CardBillCycleWindow {
  paymentMonth: string; // YYYY-MM (the month in which this bill payment is due)
  startDate: string; // YYYY-MM-DD (inclusive)
  endDate: string; // YYYY-MM-DD (inclusive)
  dueDate: string; // YYYY-MM-DD
  billingDay: number;
  paymentDueDay: number;
  cycleLabel: string; // e.g. "13 Oct – 12 Nov"
  dueLabel: string; // e.g. "30 Nov"
}

export interface CardCycleReserveItem {
  cardId: string;
  shortName: string;
  isWifeCard: boolean;
  cycle: CardBillCycleWindow;
  cycleSpends: number;
  cycleRefunds: number;
  cycleBillAmount: number; // Math.max(0, cycleSpends - cycleRefunds)
  paidFromCurrentIncome: number;
  paidFromPreviousSavings: number;
  totalSettled: number;
  pendingReserve: number; // Math.max(0, cycleBillAmount - totalSettled)
  excludedWifeUdhaar: number;
}

export interface MonthlyCardReserveSummary {
  items: CardCycleReserveItem[];
  totalCycleBill: number;
  totalPaidFromCurrentIncome: number;
  totalPaidFromPreviousSavings: number;
  totalSettled: number;
  totalPendingReserve: number;
  totalExcludedWifeUdhaar: number;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
}

function formatYmd(year: number, month1Based: number, day: number): string {
  return `${year}-${pad2(month1Based)}-${pad2(day)}`;
}

function formatShortDate(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3) return ymd;
  const [, m, d] = parts;
  return `${pad2(d)} ${SHORT_MONTHS[(m - 1) % 12] || ''}`;
}

function shiftMonth(year: number, month1Based: number, deltaMonths: number): { year: number; month: number } {
  const d = new Date(year, month1Based - 1 + deltaMonths, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * Computes the statement billing cycle window whose payment is due in `paymentMonth` (YYYY-MM).
 *
 * Example 1 (billingDay = 12, paymentDueDay = 30, paymentMonth = '2026-11'):
 *   paymentDueDay (30) > billingDay (12) => bill closes in the SAME month (12 Nov 2026),
 *   covers 13 Oct 2026 to 12 Nov 2026, due 30 Nov 2026.
 *
 * Example 2 (billingDay = 18, paymentDueDay = 7, paymentMonth = '2026-11'):
 *   paymentDueDay (7) <= billingDay (18) => bill closed in the PREVIOUS month (18 Oct 2026),
 *   covers 19 Sep 2026 to 18 Oct 2026, due 07 Nov 2026.
 */
export function getCardBillCycleForPaymentMonth(
  paymentMonth: string,
  billingDayInput?: number,
  paymentDueDayInput?: number
): CardBillCycleWindow {
  const billingDay = Math.min(31, Math.max(1, Math.round(Number(billingDayInput) || 15)));
  const paymentDueDay = Math.min(31, Math.max(1, Math.round(Number(paymentDueDayInput) || 5)));

  const [yRaw, mRaw] = paymentMonth.split('-').map(Number);
  const now = new Date();
  const year = !isNaN(yRaw) && yRaw > 2000 ? yRaw : now.getFullYear();
  const month = !isNaN(mRaw) && mRaw >= 1 && mRaw <= 12 ? mRaw : now.getMonth() + 1;

  // Statement end month: same month if due date is after billing date; previous month otherwise
  const endYM = paymentDueDay > billingDay ? { year, month } : shiftMonth(year, month, -1);
  const prevEndYM = shiftMonth(endYM.year, endYM.month, -1);

  const clampedEndDay = Math.min(billingDay, daysInMonth(endYM.year, endYM.month));
  const clampedPrevEndDay = Math.min(billingDay, daysInMonth(prevEndYM.year, prevEndYM.month));
  const clampedDueDay = Math.min(paymentDueDay, daysInMonth(year, month));

  // Cycle starts the day after previous statement closed (no double-counting across consecutive months)
  const startDateObj = new Date(prevEndYM.year, prevEndYM.month - 1, clampedPrevEndDay + 1);
  const startDate = formatYmd(startDateObj.getFullYear(), startDateObj.getMonth() + 1, startDateObj.getDate());
  const endDate = formatYmd(endYM.year, endYM.month, clampedEndDay);
  const dueDate = formatYmd(year, month, clampedDueDay);

  return {
    paymentMonth: `${year}-${pad2(month)}`,
    startDate,
    endDate,
    dueDate,
    billingDay,
    paymentDueDay,
    cycleLabel: `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`,
    dueLabel: formatShortDate(dueDate),
  };
}

/**
 * Helper: Extract target card ID from a CC Payment transaction (supports both new `targetCardAccount` and legacy descriptions/tags)
 */
export function resolveTargetCardFromCcPayment(tx: Transaction): string | null {
  if (tx.targetCardAccount) return tx.targetCardAccount;
  if (tx.isCardPaymentCredit && tx.account && isCreditCardAccount(tx.account)) {
    return tx.account;
  }
  if (Array.isArray(tx.tags)) {
    const cardTag = tx.tags.find((tg) => tg.startsWith('card:'));
    if (cardTag) return cardTag.slice(5);
  }
  const desc = (tx.description || '').toLowerCase();
  for (const card of CREDIT_CARDS) {
    if (desc.includes(card.id.toLowerCase()) || desc.includes(card.shortName.toLowerCase())) {
      return card.id;
    }
    const digits = card.id.match(/\b(\d{4})\b/);
    if (digits && desc.includes(digits[1])) {
      return card.id;
    }
  }
  return null;
}

/**
 * Helper: Check whether a transaction is a Credit Card bill payment debit (from Bank/Cash)
 */
export function isCcPaymentDebitTx(tx: Transaction): boolean {
  if (tx.type !== 'expense') return false;
  if (tx.isCardPaymentCredit) return false;
  const lowerCat = (tx.category || '').toLowerCase();
  return Boolean(
    tx.isCcPayment ||
    lowerCat === 'cc payment' ||
    lowerCat.includes('cc payment') ||
    lowerCat.includes('credit card payment') ||
    lowerCat.includes('cc bill') ||
    (Array.isArray(tx.tags) && (tx.tags.includes('credit-card-bill') || tx.tags.includes('cc-settlement')))
  );
}

/**
 * Helper: Check whether a transaction is the paired credit leg on a Credit Card account
 * (reduces card outstanding without inflating Total Income)
 */
export function isCcPaymentCreditTx(tx: Transaction): boolean {
  if (tx.type !== 'income') return false;
  return Boolean(
    tx.isCardPaymentCredit ||
    tx.isCcPayment ||
    tx.category === 'CC Payment Credit' ||
    (Array.isArray(tx.tags) && tx.tags.includes('cc-payment-credit'))
  );
}

/**
 * Calculates bill-cycle-based Card Reserve for a given payment month (`YYYY-MM`).
 * Automatically excludes Udhaar Given on Wife's Card (e.g. Axis Card 2904),
 * and nets out any partial/full card bill settlements done for that cycle!
 */
export function calculateMonthlyCardReserves(
  transactions: Transaction[],
  paymentMonth: string
): MonthlyCardReserveSummary {
  // Gather all known card IDs (built-in + custom + any card present in transactions)
  const cardIdSet = new Set<string>(CREDIT_CARDS.map((c) => c.id));
  for (const tx of transactions) {
    if (tx.account && isCreditCardAccount(tx.account)) {
      cardIdSet.add(tx.account);
    }
  }

  const items: CardCycleReserveItem[] = [];
  let totalCycleBill = 0;
  let totalPaidFromCurrentIncome = 0;
  let totalPaidFromPreviousSavings = 0;
  let totalSettled = 0;
  let totalPendingReserve = 0;
  let totalExcludedWifeUdhaar = 0;

  for (const cardId of cardIdSet) {
    const meta = ACCOUNTS_CONFIG[cardId];
    const cycle = getCardBillCycleForPaymentMonth(
      paymentMonth,
      meta?.billingDay ?? 15,
      meta?.paymentDueDay ?? 5
    );

    let cycleSpends = 0;
    let cycleRefunds = 0;
    let excludedWifeUdhaar = 0;
    let paidFromCurrentIncome = 0;
    let paidFromPreviousSavings = 0;

    for (const tx of transactions) {
      const amt = Number(tx.amount) || 0;
      if (amt <= 0 || !tx.date) continue;

      // 1. Check if this is a CC Bill Settlement DEBIT targeting this card for this paymentMonth
      if (isCcPaymentDebitTx(tx)) {
        const targetCard = resolveTargetCardFromCcPayment(tx);
        const txCycleMonth = tx.ccSettlementCycleMonth || tx.date.substring(0, 7);
        if (targetCard === cardId && txCycleMonth === paymentMonth) {
          if (tx.ccPaymentFundingSource === 'previous_savings' || tx.tags?.includes('funded:previous_savings')) {
            paidFromPreviousSavings += amt;
          } else {
            paidFromCurrentIncome += amt;
          }
        }
        continue;
      }

      // Skip paired card payment credit leg from cycle refunds (already counted via debit leg above)
      if (isCcPaymentCreditTx(tx)) {
        continue;
      }

      // 2. Check card spends / merchant refunds strictly inside [cycle.startDate, cycle.endDate]
      const txAcc = (tx.account || '').trim();
      if (txAcc !== cardId) continue;
      if (tx.date < cycle.startDate || tx.date > cycle.endDate) continue;

      if (tx.type === 'expense') {
        if (isExcludedWifeCardUdhaar(tx)) {
          excludedWifeUdhaar += amt;
        } else {
          cycleSpends += amt;
        }
      } else if (tx.type === 'income') {
        // Cashback / merchant refund on the card reduces the bill
        cycleRefunds += amt;
      }
    }

    const cycleBillAmount = Math.max(0, Math.round((cycleSpends - cycleRefunds) * 100) / 100);
    const cardTotalSettled = Math.round((paidFromCurrentIncome + paidFromPreviousSavings) * 100) / 100;
    const pendingReserve = Math.max(0, Math.round((cycleBillAmount - cardTotalSettled) * 100) / 100);

    if (cycleBillAmount > 0 || cardTotalSettled > 0 || excludedWifeUdhaar > 0) {
      items.push({
        cardId,
        shortName: meta?.shortName || cardId,
        isWifeCard: isWifeCardAccount(cardId),
        cycle,
        cycleSpends,
        cycleRefunds,
        cycleBillAmount,
        paidFromCurrentIncome,
        paidFromPreviousSavings,
        totalSettled: cardTotalSettled,
        pendingReserve,
        excludedWifeUdhaar,
      });
    }

    totalCycleBill += cycleBillAmount;
    totalPaidFromCurrentIncome += paidFromCurrentIncome;
    totalPaidFromPreviousSavings += paidFromPreviousSavings;
    totalSettled += cardTotalSettled;
    totalPendingReserve += pendingReserve;
    totalExcludedWifeUdhaar += excludedWifeUdhaar;
  }

  // Sort by highest pending reserve, then highest cycle bill
  items.sort((a, b) => (b.pendingReserve - a.pendingReserve) || (b.cycleBillAmount - a.cycleBillAmount));

  return {
    items,
    totalCycleBill: Math.round(totalCycleBill * 100) / 100,
    totalPaidFromCurrentIncome: Math.round(totalPaidFromCurrentIncome * 100) / 100,
    totalPaidFromPreviousSavings: Math.round(totalPaidFromPreviousSavings * 100) / 100,
    totalSettled: Math.round(totalSettled * 100) / 100,
    totalPendingReserve: Math.round(totalPendingReserve * 100) / 100,
    totalExcludedWifeUdhaar: Math.round(totalExcludedWifeUdhaar * 100) / 100,
  };
}
