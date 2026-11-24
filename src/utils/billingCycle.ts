import { Transaction } from '../types';
import {
  ACCOUNTS_CONFIG,
  CREDIT_CARDS,
  canonicalizeAccountId,
  isCreditCardAccount,
  isExcludedWifeCardUdhaar,
  isWifeCardAccount,
} from './accounts';

export interface CardBillCycleWindow {
  paymentMonth: string; // YYYY-MM (the month in which this bill payment is due)
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (inclusive)
  dueDate: string; // YYYY-MM-DD
  billingStartDay: number;
  billingDay: number;
  paymentDueDay: number;
  exclusiveStart?: boolean; // true only when startDay === endDay to avoid double-counting boundary day
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
  cycleBillAmount: number; // Math.max(0, cycleSpends - cycleRefunds) — owner's reserve share (excludes Wife Card Udhaar)
  paidFromCurrentIncome: number;
  paidFromPreviousSavings: number;
  totalSettled: number;
  pendingReserve: number; // Math.max(0, cycleBillAmount - totalSettled) — owner's monthly reserve share
  excludedWifeUdhaar: number;
  totalCardCycleSpends: number; // Full card spends in cycle (personal + Udhaar)
  totalCardCycleBill: number; // Math.max(0, totalCardCycleSpends - cycleRefunds) — true bank statement bill
  totalCardCyclePending: number; // Math.max(0, totalCardCycleBill - totalSettled) — true remaining bank bill
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

export function getNextMonthKey(monthKey: string): string {
  const [yRaw, mRaw] = monthKey.split('-').map(Number);
  const now = new Date();
  const year = !isNaN(yRaw) && yRaw > 2000 ? yRaw : now.getFullYear();
  const month = !isNaN(mRaw) && mRaw >= 1 && mRaw <= 12 ? mRaw : now.getMonth() + 1;
  const next = shiftMonth(year, month, 1);
  return `${next.year}-${pad2(next.month)}`;
}

export function getDefaultBillingStartDay(billingEndDay?: number): number {
  const endDay = Math.min(31, Math.max(1, Math.round(Number(billingEndDay) || 15)));
  return endDay >= 31 ? 1 : endDay + 1;
}

/**
 * Computes the statement billing cycle window (Start Date, End Date, Due Date)
 * whose payment is DUE in `paymentMonth` (YYYY-MM).
 *
 * Rules:
 * 1. Due Date determines the reserve month:
 *    - If paymentDueDay > billingEndDay (e.g. End 12, Due 30): bill closes in the SAME month as Due Date.
 *    - If paymentDueDay <= billingEndDay (e.g. End 18, Due 7): bill closed in the PREVIOUS month before Due Date.
 * 2. Start Date vs End Date determines the cycle start month:
 *    - If billingStartDay < billingEndDay (e.g. Start 1, End 25): cycle starts in the SAME month as End Date.
 *    - If billingStartDay >= billingEndDay (e.g. Start 13, End 12 or Start 12, End 12): cycle starts in the PREVIOUS month.
 */
export function getCardBillCycleForPaymentMonth(
  paymentMonth: string,
  billingDayInput?: number,
  paymentDueDayInput?: number,
  billingStartDayInput?: number
): CardBillCycleWindow {
  const billingDay = Math.min(31, Math.max(1, Math.round(Number(billingDayInput) || 15)));
  const paymentDueDay = Math.min(31, Math.max(1, Math.round(Number(paymentDueDayInput) || 5)));
  const rawStart = Number(billingStartDayInput);
  const billingStartDay =
    !isNaN(rawStart) && rawStart >= 1 && rawStart <= 31
      ? Math.round(rawStart)
      : getDefaultBillingStartDay(billingDay);

  const [yRaw, mRaw] = paymentMonth.split('-').map(Number);
  const now = new Date();
  const year = !isNaN(yRaw) && yRaw > 2000 ? yRaw : now.getFullYear();
  const month = !isNaN(mRaw) && mRaw >= 1 && mRaw <= 12 ? mRaw : now.getMonth() + 1;

  // Statement end month: same month if due date is strictly after end date; previous month otherwise
  const endYM = paymentDueDay > billingDay ? { year, month } : shiftMonth(year, month, -1);
  // Statement start month: same month if startDay < endDay; previous month if startDay >= endDay
  const startYM = billingStartDay < billingDay ? endYM : shiftMonth(endYM.year, endYM.month, -1);

  const clampedStartDay = Math.min(billingStartDay, daysInMonth(startYM.year, startYM.month));
  const clampedEndDay = Math.min(billingDay, daysInMonth(endYM.year, endYM.month));
  const clampedDueDay = Math.min(paymentDueDay, daysInMonth(year, month));

  const startDate = formatYmd(startYM.year, startYM.month, clampedStartDay);
  const endDate = formatYmd(endYM.year, endYM.month, clampedEndDay);
  const dueDate = formatYmd(year, month, clampedDueDay);

  // If user enters Start === End (e.g. Start 12, End 12), use (startDate, endDate] so the 12th is never double-counted across consecutive months
  const exclusiveStart = billingStartDay === billingDay;

  return {
    paymentMonth: `${year}-${pad2(month)}`,
    startDate,
    endDate,
    dueDate,
    billingStartDay,
    billingDay,
    paymentDueDay,
    exclusiveStart,
    cycleLabel: `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`,
    dueLabel: formatShortDate(dueDate),
  };
}

/**
 * Helper: Extract target card ID from a CC Payment transaction (supports both new `targetCardAccount` and legacy descriptions/tags)
 */
export function resolveTargetCardFromCcPayment(tx: Transaction): string | null {
  if (tx.targetCardAccount) return canonicalizeAccountId(tx.targetCardAccount);
  if (tx.isCardPaymentCredit && tx.account && isCreditCardAccount(tx.account)) {
    return canonicalizeAccountId(tx.account);
  }
  if (Array.isArray(tx.tags)) {
    const cardTag = tx.tags.find((tg) => tg.startsWith('cc-target:') || tg.startsWith('card:'));
    if (cardTag) return canonicalizeAccountId(cardTag.replace(/^(cc-target:|card:)/, ''));
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
    const resolved = canonicalizeAccountId(tx.account);
    if (resolved && isCreditCardAccount(resolved)) {
      cardIdSet.add(resolved);
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
      meta?.paymentDueDay ?? 5,
      meta?.billingStartDay
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

      // 2. Check card spends / merchant refunds inside this cycle's Start Date -> End Date
      const txAcc = canonicalizeAccountId(tx.account);
      if (txAcc !== cardId) continue;
      const beforeStart = cycle.exclusiveStart ? tx.date <= cycle.startDate : tx.date < cycle.startDate;
      if (beforeStart || tx.date > cycle.endDate) continue;

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
    const totalCardCycleSpends = Math.round((cycleSpends + excludedWifeUdhaar) * 100) / 100;
    const totalCardCycleBill = Math.max(0, Math.round((totalCardCycleSpends - cycleRefunds) * 100) / 100);
    const cardTotalSettled = Math.round((paidFromCurrentIncome + paidFromPreviousSavings) * 100) / 100;
    const pendingReserve = Math.max(0, Math.round((cycleBillAmount - cardTotalSettled) * 100) / 100);
    const totalCardCyclePending = Math.max(0, Math.round((totalCardCycleBill - cardTotalSettled) * 100) / 100);

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
        totalCardCycleSpends,
        totalCardCycleBill,
        totalCardCyclePending,
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
