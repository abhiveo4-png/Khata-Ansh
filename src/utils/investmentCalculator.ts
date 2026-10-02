import { InvestmentRecord } from '../types';

export interface InvestmentMetrics {
  monthlyAmount: number;
  paidInstallments: number;
  totalInstallments: number;
  depositedPrincipal: number;
  accruedInterest: number;
  currentValue: number;
  maturityPrincipal: number;
  maturityInterest: number;
  maturityAmount: number;
  isRecurring: boolean;
  progressPercent: number;
}

/**
 * Calculates current accumulated value, accrued interest, and maturity projections
 * for Recurring Deposits (RD), Fixed Deposits (FD), SIPs, and other investment plans.
 */
export function calculateInvestmentMetrics(
  inv: Partial<InvestmentRecord>,
  asOfDateStr?: string
): InvestmentMetrics {
  const type = inv.type || 'RD';
  const isRecurring = type === 'RD' || type === 'Mutual Fund' || (inv.monthlyAmount !== undefined && inv.monthlyAmount > 0);
  const rate = Number(inv.interestRate) || 0;
  const rawAmt = Number(inv.monthlyAmount) || Number(inv.amount) || 0;
  const startDateStr = inv.date || new Date().toISOString().split('T')[0];
  const startDate = new Date(startDateStr);
  const asOfDate = asOfDateStr ? new Date(asOfDateStr) : new Date();

  if (isRecurring) {
    const monthlyAmt = rawAmt;

    // 1. Calculate Total Tenure (Months)
    let totalMonths = Number(inv.totalInstallments) || 0;
    if (!totalMonths && inv.maturityDate && inv.date) {
      const matDate = new Date(inv.maturityDate);
      const diffY = matDate.getFullYear() - startDate.getFullYear();
      const diffM = matDate.getMonth() - startDate.getMonth();
      const diffDays = matDate.getDate() - startDate.getDate();
      totalMonths = Math.max(1, diffY * 12 + diffM + (diffDays >= 15 ? 1 : 0));
    }
    if (!totalMonths) totalMonths = 12; // Standard 1 year default

    // 2. Calculate Paid Installments till date
    let paidCount = Number(inv.paidInstallments);
    if (paidCount === undefined || isNaN(paidCount) || paidCount <= 0) {
      // Auto-compute months elapsed from startDate to asOfDate
      const startY = startDate.getFullYear();
      const startM = startDate.getMonth();
      const startD = startDate.getDate();

      const curY = asOfDate.getFullYear();
      const curM = asOfDate.getMonth();
      const curD = asOfDate.getDate();

      let monthsElapsed = (curY - startY) * 12 + (curM - startM);
      // If current day is >= installment due day, count this month's installment as paid
      if (curD >= startD) {
        monthsElapsed += 1;
      }
      paidCount = Math.max(1, Math.min(totalMonths, monthsElapsed));
    }

    const depositedPrincipal = paidCount * monthlyAmt;

    // 3. Accrued Interest (Quarterly Compounded Indian Banking Standard for RD)
    // Formula: Each installment i has been earning interest for (paidCount - i + 1) months
    let accruedInterest = 0;
    if (rate > 0) {
      const quarterlyRate = (rate / 100) / 4;
      for (let i = 1; i <= paidCount; i++) {
        const monthsHeld = paidCount - i + 1;
        // Compounding factor for monthsHeld: (1 + r/4)^(monthsHeld / 3) - 1
        const compFactor = Math.pow(1 + quarterlyRate, monthsHeld / 3) - 1;
        accruedInterest += monthlyAmt * compFactor;
      }
    }
    accruedInterest = Math.round(accruedInterest);
    const currentValue = depositedPrincipal + accruedInterest;

    // 4. Maturity Projection at end of tenure
    const maturityPrincipal = totalMonths * monthlyAmt;
    let maturityInterest = 0;
    if (rate > 0) {
      const quarterlyRate = (rate / 100) / 4;
      for (let i = 1; i <= totalMonths; i++) {
        const monthsHeld = totalMonths - i + 1;
        const compFactor = Math.pow(1 + quarterlyRate, monthsHeld / 3) - 1;
        maturityInterest += monthlyAmt * compFactor;
      }
    }
    maturityInterest = Math.round(maturityInterest);
    const maturityAmount = maturityPrincipal + maturityInterest;
    const progressPercent = Math.min(100, Math.round((paidCount / totalMonths) * 100));

    return {
      monthlyAmount: monthlyAmt,
      paidInstallments: paidCount,
      totalInstallments: totalMonths,
      depositedPrincipal,
      accruedInterest,
      currentValue,
      maturityPrincipal,
      maturityInterest,
      maturityAmount,
      isRecurring: true,
      progressPercent,
    };
  } else {
    // Lump Sum (FD, Gold, PPF, Other)
    const principal = rawAmt;
    let accruedInterest = 0;
    let currentValue = principal;

    if (rate > 0 && inv.date) {
      const diffTime = Math.max(0, asOfDate.getTime() - startDate.getTime());
      const years = diffTime / (1000 * 60 * 60 * 24 * 365.25);
      const quarterlyRate = (rate / 100) / 4;
      accruedInterest = Math.round(principal * (Math.pow(1 + quarterlyRate, 4 * years) - 1));
      currentValue = principal + accruedInterest;
    }

    let maturityAmount = currentValue;
    let maturityInterest = accruedInterest;
    let totalDays = 365;
    let daysPassed = 0;

    if (inv.date && inv.maturityDate) {
      const matDate = new Date(inv.maturityDate);
      totalDays = Math.max(1, Math.round((matDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      daysPassed = Math.max(0, Math.min(totalDays, Math.round((asOfDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))));
      
      if (rate > 0) {
        const years = totalDays / 365.25;
        const quarterlyRate = (rate / 100) / 4;
        maturityInterest = Math.round(principal * (Math.pow(1 + quarterlyRate, 4 * years) - 1));
        maturityAmount = principal + maturityInterest;
      }
    }

    const progressPercent = Math.min(100, Math.round((daysPassed / totalDays) * 100));

    return {
      monthlyAmount: 0,
      paidInstallments: 1,
      totalInstallments: 1,
      depositedPrincipal: principal,
      accruedInterest,
      currentValue,
      maturityPrincipal: principal,
      maturityInterest,
      maturityAmount,
      isRecurring: false,
      progressPercent,
    };
  }
}
