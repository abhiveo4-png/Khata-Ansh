import React, { useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight,
  PieChart,
  PiggyBank,
  Zap,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Layers,
  CreditCard,
  Landmark,
  Wallet,
  CheckCircle2
} from 'lucide-react';
import { FinancialSummary, Transaction, UserRole, CategoryBudget, CategoryDef, UdhaarRecord } from '../types';
import { CREDIT_CARDS, isCreditCardAccount, isExcludedWifeCardUdhaar } from '../utils/accounts';
import {
  calculateMonthlyCardReserves,
  getNextMonthKey,
  isCcPaymentCreditTx,
  isCcPaymentDebitTx,
} from '../utils/billingCycle';

interface OverviewCardsProps {
  summary: FinancialSummary;
  transactions?: Transaction[];
  udhaars?: UdhaarRecord[];
  budgets?: CategoryBudget[];
  categories?: CategoryDef[];
  userRole?: UserRole;
  activeFamilyMemberName?: string;
  isPrivacyMode?: boolean;
  selectedMonth?: string;
  onSelectMonth?: (month: string) => void;
  availableMonths?: string[];
  onOpenReimbursementSummary?: () => void;
  onNavigateToUdhaar?: () => void;
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({ 
  summary, 
  transactions = [],
  udhaars = [],
  categories = [],
  userRole = 'owner',
  activeFamilyMemberName,
  isPrivacyMode = false,
  selectedMonth = 'all',
  onSelectMonth,
  availableMonths = [],
  onOpenReimbursementSummary,
  onNavigateToUdhaar,
}) => {
  const isFamily = userRole === 'family';
  const [includeCarryforward, setIncludeCarryforward] = useState(false);

  // Indian Standard Time (IST) Month
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istNow = new Date(utc + (3600000 * 5.5));
  const currentIstMonth = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, '0')}`;
  const nextIstMonth = getNextMonthKey(currentIstMonth);

  const activeMonth = selectedMonth || currentIstMonth;
  const isAllTime = activeMonth === 'all';
  const nextMonthOfActive = !isAllTime ? getNextMonthKey(activeMonth) : null;

  const dropdownMonths = Array.from(new Set([nextIstMonth, currentIstMonth, ...availableMonths]))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
    .sort((a, b) => b.localeCompare(a));

  // Format month name label (e.g. '2026-10' -> 'October 2026')
  const formatMonthName = (mStr: string) => {
    if (mStr === 'all') return 'Sabhi Mahine (All Time)';
    try {
      const [y, m] = mStr.split('-').map(Number);
      const date = new Date(y, m - 1, 1);
      return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    } catch {
      return mStr;
    }
  };

  // Helper: Check if a transaction was paid via Credit Card
  const isCreditCardTx = (t: Transaction): boolean => {
    const acc = (t.account || '').trim();
    if (isCreditCardAccount(acc)) return true;
    if (!acc && t.paymentMethod === 'Card') return true;
    return false;
  };

  const getCardLabel = (t: Transaction): string => {
    const acc = (t.account || '').trim();
    const found = CREDIT_CARDS.find(c => c.id === acc);
    if (found) return found.shortName;
    if (acc) return acc;
    return 'Credit Card';
  };

  // 1. Separate transactions into Previous Months and Current/Selected Month
  const prevTransactions = !isAllTime
    ? transactions.filter(t => t.date && t.date < `${activeMonth}-01`)
    : [];

  const monthTransactions = !isAllTime
    ? transactions.filter(t => t.date && t.date.startsWith(activeMonth))
    : transactions;

  // 2. Previous Months Carryforward calculation
  let prevTotalInflow = 0;
  let prevTotalKharcha = 0;
  let prevBankCashKharcha = 0;
  let prevPendingRim = 0;

  for (const t of prevTransactions) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      if (isCcPaymentCreditTx(t)) continue;
      prevTotalInflow += amt;
    } else {
      if (isExcludedWifeCardUdhaar(t)) continue;
      const isCcBillPayment = isCcPaymentDebitTx(t);
      if (!isCcBillPayment) {
        prevTotalKharcha += amt;
        if (!isCreditCardTx(t)) {
          prevBankCashKharcha += amt;
        }
      }
      const isRim = Boolean(t.isReimbursement || t.category === 'Reimbursement');
      if (isRim) {
        const settledAmt = t.reimbursementStatus === 'settled'
          ? amt
          : Math.min(amt, Math.max(0, Number(t.reimbursementSettledAmount) || 0));
        const rem = Math.max(0, amt - settledAmt);
        if (t.reimbursementStatus !== 'settled' && rem > 0) {
          prevPendingRim += rem;
        }
      }
    }
  }

  const prevFinalSavingsCarry = prevTotalInflow - prevTotalKharcha;

  // 3. Selected Month Seedha Hisaab Figures
  let regularIncome = 0;
  let rimRecoveryIncome = 0;
  let udhaarRecoveryIncome = 0;
  let monthIncomeCount = 0;

  // Expenses breakdown by Purpose (Bank + Cash + Card combined)
  let budgetAndGharKharcha = 0; // Personal/Budget/Ghar kharcha
  let rimKharcha = 0;           // Reimbursement kharcha
  let udhaarDiyaKharcha = 0;    // Udhar diya (excluding Wife Card 2904 Udhaar)
  let excludedWifeCardUdhaarTotal = 0; // Tracked transparently, excluded from owner's outflow
  let ccPaymentDone = 0;        // Credit card bill paid from bank
  let ccPaidFromCurrentIncomeMonth = 0;
  let ccPaidFromPreviousSavingsMonth = 0;
  let monthBudgetSpent = 0;     // Strictly for Monthly Budget progress bar
  let monthExpenseCount = 0;

  // Expenses breakdown by Payment Source (Bank & Cash vs Credit Cards)
  let bankOnlyKharcha = 0;
  let cashOnlyKharcha = 0;
  let cardTotalKharcha = 0;
  const cardWiseBreakdown: Record<string, number> = {};

  let monthPendingRim = 0;

  for (const t of monthTransactions) {
    const amt = Number(t.amount) || 0;
    const isRimInflow = Boolean(
      t.isReimbursementInflow ||
      (t.type === 'income' && (t.category === 'Reimbursement' || t.category === 'Reimbursement Received'))
    );
    const isUdhaarRecovery = Boolean(
      t.isUdhaarRecovery ||
      (t.type === 'income' && (
        t.category === 'Udhaar Recovery' ||
        t.category === 'Udhaar Received' ||
        t.category === 'Udhaar Settle' ||
        (t.category && t.category.toLowerCase().includes('udhaar'))
      ))
    );

    if (t.type === 'income') {
      // Paired CC bill settlement credit leg on card ledger is NOT income
      if (isCcPaymentCreditTx(t)) continue;
      monthIncomeCount++;
      if (isUdhaarRecovery) {
        udhaarRecoveryIncome += amt;
      } else if (isRimInflow) {
        rimRecoveryIncome += amt;
      } else {
        regularIncome += amt;
      }
    } else {
      if (isCcPaymentDebitTx(t)) {
        ccPaymentDone += amt;
        const isPrevSavingsFunded =
          t.ccPaymentFundingSource === 'previous_savings' ||
          t.tags?.includes('cc-funding:previous_savings') ||
          t.tags?.includes('funded:previous_savings');
        if (isPrevSavingsFunded) {
          ccPaidFromPreviousSavingsMonth += amt;
        } else {
          ccPaidFromCurrentIncomeMonth += amt;
        }
        continue;
      }

      // Exclude Udhaar Given via Wife's Card (e.g. AX CC 2904) from owner's monthly outflow
      if (isExcludedWifeCardUdhaar(t)) {
        excludedWifeCardUdhaarTotal += amt;
        continue;
      }

      monthExpenseCount++;
      const isRim = Boolean(t.isReimbursement || t.category === 'Reimbursement');
      const isUdhaarRepaid = Boolean(
        t.isUdhaarRepaid ||
        t.category === 'Udhaar Repaid' ||
        (t.tags && t.tags.includes('udhaar-repaid'))
      );
      const isUdhaarLent = !isUdhaarRepaid && Boolean(
        t.isUdhaarLent ||
        t.category === 'Udhaar Given' ||
        t.category === 'Loan Given' ||
        (t.category && t.category.toLowerCase().includes('udhaar') && t.type === 'expense') ||
        (t.tags && t.tags.includes('udhaar-lent'))
      );

      // 3A. Purpose Breakdown
      if (isUdhaarLent) {
        udhaarDiyaKharcha += amt;
      } else if (isRim) {
        rimKharcha += amt;
        const settledAmt = t.reimbursementStatus === 'settled'
          ? amt
          : Math.min(amt, Math.max(0, Number(t.reimbursementSettledAmount) || 0));
        const rem = Math.max(0, amt - settledAmt);
        if (t.reimbursementStatus !== 'settled' && rem > 0) {
          monthPendingRim += rem;
        }
      } else {
        budgetAndGharKharcha += amt;
        const catDef = categories.find(c => c.name.toLowerCase() === (t.category || '').toLowerCase());
        const isExemptFromBudget = Boolean(catDef?.excludeFromBudget) || isUdhaarRepaid || t.isSavingsTransfer || t.isWifeTransfer || t.category === 'Wife Transfer';
        if (!isExemptFromBudget) {
          monthBudgetSpent += amt;
        }
      }

      // 3B. Payment Source Breakdown (Bank/Cash vs Credit Card)
      if (isCreditCardTx(t)) {
        cardTotalKharcha += amt;
        const cLabel = getCardLabel(t);
        cardWiseBreakdown[cLabel] = (cardWiseBreakdown[cLabel] || 0) + amt;
      } else if (t.account === 'Cash' || t.paymentMethod === 'Cash') {
        cashOnlyKharcha += amt;
      } else {
        bankOnlyKharcha += amt;
      }
    }
  }

  // 3C. Bill-Cycle-Based Card Reserve Calculation (for selected month & next month preview)
  const monthlyCardReserves = !isAllTime
    ? calculateMonthlyCardReserves(transactions, activeMonth)
    : null;
  const nextMonthCardReserves = nextMonthOfActive
    ? calculateMonthlyCardReserves(transactions, nextMonthOfActive)
    : null;

  // 4. Core Seedha Hisaab Totals
  // Total Income (including Salary + RIM Recovery + Udhar Recovery)
  const monthTotalIncome = regularIncome + rimRecoveryIncome + udhaarRecoveryIncome;
  const effectiveTotalIncome = (!isAllTime && includeCarryforward)
    ? monthTotalIncome + prevFinalSavingsCarry
    : monthTotalIncome;

  // Total Kharcha (Bank + Cash + All Cards — Budget + RIM + Udhar Diya, excluding Wife Card 2904 Udhaar)
  const totalBankAndCashKharcha = bankOnlyKharcha + cashOnlyKharcha;
  const totalAllKharcha = totalBankAndCashKharcha + cardTotalKharcha;

  // CC payments funded from current month income vs previous bank savings
  const ccPaidFromCurrentIncome = monthlyCardReserves
    ? monthlyCardReserves.totalPaidFromCurrentIncome
    : ccPaidFromCurrentIncomeMonth;
  const ccPaidFromPreviousSavings = monthlyCardReserves
    ? monthlyCardReserves.totalPaidFromPreviousSavings
    : ccPaidFromPreviousSavingsMonth;
  const totalCcSettledForView = monthlyCardReserves
    ? monthlyCardReserves.totalSettled
    : ccPaymentDone;

  // Bank & Cash Balance currently in hand (deducting Bank/Cash kharcha + CC bills paid from current month income)
  // Note: CC bills paid from previous bank savings do NOT reduce current month's Bank/Cash income balance!
  const bankAndCashInHand = effectiveTotalIncome - totalBankAndCashKharcha - ccPaidFromCurrentIncome;

  // Card Reserve: Strictly by each card's Bill Cycle due in `activeMonth` (minus partial/full settlements already done)
  const cardReserveAmount = monthlyCardReserves
    ? monthlyCardReserves.totalPendingReserve
    : Math.max(0, cardTotalKharcha - ccPaymentDone);
  const cardBreakdownEntries = Object.entries(cardWiseBreakdown).sort((a, b) => b[1] - a[1]);

  // Final Pure Savings (After setting aside pending Bill-Cycle Card Reserve)
  const finalPureSavings = bankAndCashInHand - cardReserveAmount;
  const displayExcludedWifeUdhaar = Math.max(
    excludedWifeCardUdhaarTotal,
    monthlyCardReserves?.totalExcludedWifeUdhaar || 0
  );

  // Udhaar Tab Pending info for quick reference (accounting for partial settlements)
  const safeUdhaars = Array.isArray(udhaars) ? udhaars : [];
  const getRemainingUdhaar = (u: UdhaarRecord) =>
    Math.max(0, (Number(u.amount) || 0) - (Number(u.settledAmount) || 0));
  const tabPendingLent = safeUdhaars
    .filter(u => u && u.type === 'lent' && u.status !== 'settled')
    .reduce((sum, u) => sum + getRemainingUdhaar(u), 0);
  const tabPendingBorrowed = safeUdhaars
    .filter(u => u && u.type === 'borrowed' && u.status !== 'settled')
    .reduce((sum, u) => sum + getRemainingUdhaar(u), 0);
  const effectiveTotalBakaya = safeUdhaars.length > 0
    ? Math.max(0, tabPendingLent - tabPendingBorrowed)
    : Math.max(0, udhaarDiyaKharcha - udhaarRecoveryIncome);

  const totalPendingRim = prevPendingRim + monthPendingRim;

  // Active family member calculation in selected month
  const memberTxs = monthTransactions.filter(t => {
    if (!activeFamilyMemberName) return false;
    const u = (t.telegramUser || '').toLowerCase().trim();
    const mem = activeFamilyMemberName.toLowerCase().trim();
    return u === mem || u.includes(mem) || mem.includes(u);
  });
  const memberPersonalExpense = memberTxs
    .filter(t => t.type === 'expense' && !t.isSavingsTransfer && !t.isUdhaarLent && t.category !== 'Udhaar Given')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  // Budget calculations
  const monthlyBudgetLimit = summary.monthlyBudget;
  const monthlySpent = monthBudgetSpent;
  const budgetPercentage = monthlyBudgetLimit > 0 ? Math.round((monthlySpent / monthlyBudgetLimit) * 100) : 0;
  const monthlySavingsRate = effectiveTotalIncome > 0 ? Math.max(0, Math.round((finalPureSavings / effectiveTotalIncome) * 100)) : 0;

  const displayAmount = (val: number, isMemberOwnAmount: boolean = false) => {
    if (isFamily && !isMemberOwnAmount) {
      return '••••••';
    }
    if (isPrivacyMode) {
      return '••••••';
    }
    return val.toLocaleString('en-IN');
  };

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (!onSelectMonth || isAllTime) return;
    const currentIndex = dropdownMonths.indexOf(activeMonth);
    if (currentIndex >= 0 && currentIndex < dropdownMonths.length - 1) {
      onSelectMonth(dropdownMonths[currentIndex + 1]);
    } else {
      const [y, m] = activeMonth.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1);
      const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      onSelectMonth(prevMonthStr);
    }
  };

  const handleNextMonth = () => {
    if (!onSelectMonth || isAllTime || activeMonth >= nextIstMonth) return;
    const currentIndex = dropdownMonths.indexOf(activeMonth);
    if (currentIndex > 0) {
      onSelectMonth(dropdownMonths[currentIndex - 1]);
    } else {
      const nextMonthStr = getNextMonthKey(activeMonth);
      if (nextMonthStr <= nextIstMonth) {
        onSelectMonth(nextMonthStr);
      }
    }
  };

  const isCurrentMonth = activeMonth === currentIstMonth;
  const isNextMonthView = activeMonth === nextIstMonth;

  return (
    <div className="space-y-3.5">
      {/* Sleek Month Navigator & Rollover Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-900/80 border border-white/[0.08] p-2.5 sm:p-3 rounded-2xl backdrop-blur-md shadow-lg shadow-black/20">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            disabled={isAllTime}
            className="p-1.5 sm:p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer border border-white/[0.05]"
            title="Pichla Mahina"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Month Dropdown */}
          <div className="relative">
            <select
              value={activeMonth}
              onChange={(e) => onSelectMonth?.(e.target.value)}
              aria-label="Mahina chunein"
              className="appearance-none bg-slate-800 border border-indigo-500/30 text-white text-xs sm:text-sm font-bold py-1.5 sm:py-2 pl-8 sm:pl-9 pr-8 rounded-xl cursor-pointer hover:border-indigo-400 focus:outline-none transition-all shadow-inner"
            >
              {dropdownMonths.map((m) => (
                <option key={m} value={m} className="bg-slate-900 text-white">
                  📅 {formatMonthName(m)}{' '}
                  {m === currentIstMonth
                    ? '• (Current Live)'
                    : m === nextIstMonth
                    ? '• (Next Month Reserve)'
                    : ''}
                </option>
              ))}
              <option value="all" className="bg-slate-900 text-cyan-300">
                🌐 Sabhi Mahine (Lifetime All-Time)
              </option>
            </select>
            <Calendar className="w-3.5 h-3.5 text-indigo-400 absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            disabled={isAllTime || activeMonth >= nextIstMonth}
            className="p-1.5 sm:p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer border border-white/[0.05]"
            title="Agla Mahina (Next Month Reserve Dekhein)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Mode Switchers */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {!isAllTime && prevFinalSavingsCarry !== 0 && !isFamily && (
            <button
              type="button"
              onClick={() => setIncludeCarryforward(!includeCarryforward)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-semibold cursor-pointer transition-all ${
                includeCarryforward
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                  : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
              }`}
              title="Pichle mahino ki bachat is mahine ki income me jodein ya alag rakhein"
            >
              <span>📦 Pichla Carryforward ({prevFinalSavingsCarry >= 0 ? '+' : ''}₹{displayAmount(prevFinalSavingsCarry)}): {includeCarryforward ? 'ON' : 'OFF'}</span>
            </button>
          )}

          {!isAllTime ? (
            <>
              {isCurrentMonth ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Current Month
                </span>
              ) : (
                <>
                  {isNextMonthView && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[11px] font-semibold">
                      ⏭️ Next Month Card Reserve View
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectMonth?.(currentIstMonth)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-[11px] font-medium cursor-pointer transition-all"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    Jump to Current Month
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => onSelectMonth?.('all')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 text-[11px] font-medium cursor-pointer transition-all"
                title="Pura All-Time Lifetime Hisaab Dekhein"
              >
                <Layers className="w-3 h-3 text-cyan-400" />
                All-Time View
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onSelectMonth?.(currentIstMonth)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-[11px] font-bold cursor-pointer transition-all"
            >
              <Calendar className="w-3 h-3 text-indigo-400" />
              Return to Current Month ({formatMonthName(currentIstMonth)})
            </button>
          )}

          {totalPendingRim > 0 && !isFamily && (
            <button
              type="button"
              onClick={() => onOpenReimbursementSummary?.()}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-cyan-950/80 hover:bg-cyan-900/80 border border-cyan-500/40 text-cyan-300 text-[11px] font-semibold cursor-pointer transition-all shadow-xs"
              title="Click karein settlement hub kholne ke liye"
            >
              <span>💼 ₹{displayAmount(totalPendingRim)} office rim pending (Settle)</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 4 Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 1. Total Income (Bank + RIM + Udhar Wapas) */}
        <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-emerald-500/10 blur-2xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />
          
          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              {isAllTime ? 'Total Income (All Time)' : 'Total Income (In Bank)'}
            </span>
            <div className="w-9 h-9 rounded-xl icon-badge-emerald flex items-center justify-center transition-transform group-hover:scale-110">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-baseline font-mono">
              <span className="text-emerald-400 mr-1 text-xl font-medium">₹</span>
              <span className={isFamily ? 'font-mono tracking-widest text-slate-400' : ''}>
                {displayAmount(effectiveTotalIncome)}
              </span>
            </div>

            {!isFamily && (
              <div className="mt-2 space-y-1 text-[11px]">
                <div className="flex items-center justify-between text-slate-300">
                  <span>💵 Salary / Regular:</span>
                  <span className="font-mono font-semibold text-emerald-300">₹{displayAmount(regularIncome)}</span>
                </div>
                {rimRecoveryIncome > 0 && (
                  <div className="flex items-center justify-between text-cyan-300">
                    <span>💼 RIM Settled:</span>
                    <span className="font-mono font-semibold">+₹{displayAmount(rimRecoveryIncome)}</span>
                  </div>
                )}
                {udhaarRecoveryIncome > 0 && (
                  <div className="flex items-center justify-between text-amber-300">
                    <span>🤝 Udhar Wapas:</span>
                    <span className="font-mono font-semibold">+₹{displayAmount(udhaarRecoveryIncome)}</span>
                  </div>
                )}
                {includeCarryforward && !isAllTime && prevFinalSavingsCarry !== 0 && (
                  <div className="flex items-center justify-between text-indigo-300">
                    <span>📦 Pichla Carry:</span>
                    <span className="font-mono font-semibold">₹{displayAmount(prevFinalSavingsCarry)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="inline-flex items-center text-emerald-400 font-semibold">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              {isFamily ? '🔒 Masked' : `${monthIncomeCount} Inflows`}
            </span>
            <span className="text-slate-400 text-[11px] font-medium">
              {isFamily ? 'Family Privacy' : 'Salary + RIM + Udhar'}
            </span>
          </div>
        </div>

        {/* 2. Total Kharcha (Bank + Cash + All Cards) */}
        <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-rose-500/10 blur-2xl group-hover:bg-rose-500/20 transition-all pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
              {isFamily ? 'Aapka Kharcha' : 'Total Kharcha (Bank+Cash+Card)'}
            </span>
            <div className="w-9 h-9 rounded-xl icon-badge-rose flex items-center justify-center transition-transform group-hover:scale-110">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-baseline font-mono">
              <span className="text-rose-400 mr-1 text-xl font-medium">₹</span>
              <span>{displayAmount(isFamily ? memberPersonalExpense : totalAllKharcha, true)}</span>
            </div>

            {!isFamily && (
              <div className="mt-2 space-y-1 text-[11px]">
                <div className="flex items-center justify-between text-emerald-300 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                  <span className="flex items-center gap-1">
                    <Landmark className="w-3 h-3" /> Bank & Cash se:
                  </span>
                  <span className="font-mono font-bold">₹{displayAmount(totalBankAndCashKharcha)}</span>
                </div>
                <div className="flex items-center justify-between text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/20">
                  <span className="flex items-center gap-1">
                    <CreditCard className="w-3 h-3" /> Credit Cards se:
                  </span>
                  <span className="font-mono font-bold">₹{displayAmount(cardTotalKharcha)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="inline-flex items-center text-rose-400 font-semibold">
              <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
              {isFamily ? `${memberTxs.length} Entries` : `${monthExpenseCount} Expenses`}
            </span>
            <span className="text-slate-400 text-[10px] font-mono">
              {isFamily
                ? (activeFamilyMemberName || 'Aapka hisaab')
                : `Budget: ₹${displayAmount(budgetAndGharKharcha)} • RIM: ₹${displayAmount(rimKharcha)} • Udhar: ₹${displayAmount(udhaarDiyaKharcha)}`}
            </span>
          </div>
        </div>

        {/* 3. Bank & Cash Balance -> Card Reserve -> Final Savings */}
        <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group border-indigo-500/40">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-indigo-500/15 blur-2xl group-hover:bg-indigo-500/25 transition-all pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              Final Safe Savings
            </span>
            <div className="w-9 h-9 rounded-xl icon-badge-cyan flex items-center justify-center transition-transform group-hover:scale-110">
              <PiggyBank className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight flex items-baseline font-mono">
              <span className="mr-1 text-xl font-medium text-emerald-500">₹</span>
              <span className={isFamily ? 'tracking-widest text-slate-400' : ''}>
                {displayAmount(finalPureSavings)}
              </span>
            </div>

            {!isFamily && (
              <div className="mt-2 space-y-1 text-[11px]">
                <div className="flex items-center justify-between text-slate-200 bg-slate-800/70 px-2 py-0.5 rounded border border-white/10">
                  <span>🏦 Bank & Cash Balance:</span>
                  <span className="font-mono font-bold text-cyan-300">₹{displayAmount(bankAndCashInHand)}</span>
                </div>
                <div className="flex items-center justify-between text-amber-300 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-500/30">
                  <span>💳 (-) Card Reserve {!isAllTime ? '(Bill Cycle)' : ''}:</span>
                  <span className="font-mono font-bold">-₹{displayAmount(cardReserveAmount)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="font-semibold text-indigo-300">
              {isFamily ? '🔒 Hidden for Family' : `Bachat Rate: ${monthlySavingsRate}%`}
            </span>
            {effectiveTotalBakaya > 0 && !isFamily ? (
              <button
                type="button"
                onClick={onNavigateToUdhaar}
                className="text-[10px] font-semibold text-emerald-400 hover:underline cursor-pointer"
              >
                🤝 Udhar Lena Baki: ₹{displayAmount(effectiveTotalBakaya)} ↗
              </button>
            ) : (
              <span className="text-slate-400 text-[11px] font-medium">
                100% Free for Savings
              </span>
            )}
          </div>
        </div>

        {/* 4. Monthly Budget Progress */}
        <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-cyan-500/10 blur-2xl group-hover:bg-cyan-500/20 transition-all pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5 text-cyan-400" />
              Monthly Budget
            </span>
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg border ${
              budgetPercentage > 100 
                ? 'bg-rose-950/70 border-rose-500/50 text-rose-300' 
                : budgetPercentage >= 80 
                ? 'bg-amber-950/70 border-amber-500/50 text-amber-300'
                : 'bg-cyan-950/70 border-cyan-500/40 text-cyan-300'
            }`}>
              {isFamily ? '••%' : `${budgetPercentage}% Lag Gaya`}
            </span>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-baseline font-mono">
              <span className="text-cyan-400 mr-1 text-xl font-medium">₹</span>
              <span className={isFamily ? 'tracking-widest text-slate-400' : ''}>
                {displayAmount(monthlySpent)}
              </span>
              <span className="text-xs font-sans font-medium text-slate-400 ml-2">
                / ₹{displayAmount(monthlyBudgetLimit)} Limit
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10 gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-mono font-bold">
              📉 Laga: ₹{displayAmount(monthlySpent)}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-bold">
              🟢 Bacha: ₹{displayAmount(Math.max(0, monthlyBudgetLimit - monthlySpent))}
            </span>
          </div>
        </div>

      </div>

      {/* Dedicated Seedha Hisaab & Card Reserve Strip (Visible to Owner) */}
      {!isFamily && (
        <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3.5 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Seedha Hisaab & Bill-Cycle Card Reserve
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {formatMonthName(activeMonth)}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Har card ka reserve uske statement bill cycle ke hisaab se calculate hota hai (due in {formatMonthName(activeMonth)})
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {displayExcludedWifeUdhaar > 0 && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-pink-950/60 border border-pink-500/35 text-pink-200 text-[11px] font-medium"
                  title="Wife ke card (AX CC 2904) se diya gaya udhaar aapke monthly outflow aur card reserve se excluded hai"
                >
                  👩 Wife Card Udhaar Excluded: <span className="font-mono font-bold">₹{displayAmount(displayExcludedWifeUdhaar)}</span>
                </span>
              )}
              {totalCcSettledForView > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  CC Settled: ₹{displayAmount(totalCcSettledForView)}
                  {ccPaidFromPreviousSavings > 0 && (
                    <span className="text-[10px] text-cyan-300 ml-1">
                      (🏦 Past Sav: ₹{displayAmount(ccPaidFromPreviousSavings)})
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Step-by-Step Visual Equation */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-stretch">
            {/* Step 1: Total Income */}
            <div className="bg-slate-950/70 border border-emerald-500/25 rounded-xl p-3 flex flex-col justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                1. Total Income (Bank)
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-white my-1">
                ₹{displayAmount(effectiveTotalIncome)}
              </div>
              <div className="text-[10px] text-slate-400 space-y-0.5 border-t border-white/[0.06] pt-1.5">
                <div>Salary/Inc: ₹{displayAmount(regularIncome)}</div>
                {(rimRecoveryIncome > 0 || udhaarRecoveryIncome > 0) && (
                  <div className="text-cyan-300">
                    + RIM: ₹{displayAmount(rimRecoveryIncome)} • Udhar: ₹{displayAmount(udhaarRecoveryIncome)}
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Total Kharcha (All Sources & Purposes) */}
            <div className="bg-slate-950/70 border border-rose-500/25 rounded-xl p-3 flex flex-col justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
                2. Total Kharcha (Sab)
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-white my-1">
                ₹{displayAmount(totalAllKharcha)}
              </div>
              <div className="text-[10px] text-slate-300 space-y-0.5 border-t border-white/[0.06] pt-1.5">
                <div className="flex justify-between">
                  <span>🏠 Budget/Ghar:</span>
                  <span className="font-mono">₹{displayAmount(budgetAndGharKharcha)}</span>
                </div>
                <div className="flex justify-between text-cyan-300">
                  <span>💼 Reimburse:</span>
                  <span className="font-mono">₹{displayAmount(rimKharcha)}</span>
                </div>
                <div className="flex justify-between text-amber-300">
                  <span>🤝 Udhar Diya:</span>
                  <span className="font-mono">₹{displayAmount(udhaarDiyaKharcha)}</span>
                </div>
              </div>
            </div>

            {/* Step 3: Bank & Cash Kharcha vs Bank Balance Left */}
            <div className="bg-slate-950/70 border border-cyan-500/30 rounded-xl p-3 flex flex-col justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                3. Bank & Cash Balance
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-cyan-300 my-1">
                ₹{displayAmount(bankAndCashInHand)}
              </div>
              <div className="text-[10px] text-slate-300 space-y-0.5 border-t border-white/[0.06] pt-1.5">
                <div className="flex justify-between text-rose-300">
                  <span>(-) Bank/Cash Kharcha:</span>
                  <span className="font-mono">₹{displayAmount(totalBankAndCashKharcha)}</span>
                </div>
                {ccPaidFromCurrentIncome > 0 && (
                  <div className="flex justify-between text-amber-300">
                    <span>(-) CC Paid (Income):</span>
                    <span className="font-mono">₹{displayAmount(ccPaidFromCurrentIncome)}</span>
                  </div>
                )}
                <div className="text-[9px] text-slate-400">
                  (Bank: ₹{displayAmount(bankOnlyKharcha)} • Cash: ₹{displayAmount(cashOnlyKharcha)})
                </div>
              </div>
            </div>

            {/* Step 4: Bill-Cycle Card Reserve (To set aside for CC bills due in activeMonth) */}
            <div className="bg-amber-950/25 border border-amber-500/35 rounded-xl p-3 flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center justify-between gap-1">
                  <span>4. Card Reserve 💳</span>
                  <span className="text-[9px] bg-amber-500/20 text-amber-200 px-1.5 py-0.5 rounded whitespace-nowrap">
                    {!isAllTime ? 'Due This Month' : 'Alag Rakhein'}
                  </span>
                </div>
                <div className="text-lg sm:text-xl font-extrabold font-mono text-amber-300 my-1">
                  ₹{displayAmount(cardReserveAmount)}
                </div>
              </div>
              <div className="text-[10px] text-amber-200/90 space-y-1 border-t border-amber-500/20 pt-1.5 max-h-36 overflow-y-auto pr-0.5">
                {!isAllTime && monthlyCardReserves ? (
                  monthlyCardReserves.items.length > 0 ? (
                    monthlyCardReserves.items.map((item) => (
                      <div key={item.cardId} className="bg-black/25 rounded px-1.5 py-1 border border-amber-500/15">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-semibold text-amber-100">
                            {item.isWifeCard ? '👩 ' : ''}{item.shortName}
                          </span>
                          <span className={`font-mono font-bold ${item.pendingReserve === 0 ? 'text-emerald-400' : 'text-amber-300'}`}>
                            {item.pendingReserve === 0 ? '✅ Paid' : `₹${displayAmount(item.pendingReserve)}`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-amber-300/75 mt-0.5">
                          <span>{item.cycle.cycleLabel}</span>
                          <span>Due {item.cycle.dueLabel}</span>
                        </div>
                        {item.totalSettled > 0 && (
                          <div className="text-[9px] text-emerald-300/90 mt-0.5">
                            Bill ₹{displayAmount(item.cycleBillAmount)} • Settled ₹{displayAmount(item.totalSettled)}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400">Is mahine due koi Card bill pending nahi</div>
                  )
                ) : cardBreakdownEntries.length > 0 ? (
                  cardBreakdownEntries.map(([cardName, amt]) => (
                    <div key={cardName} className="flex justify-between">
                      <span className="truncate pr-1">{cardName}:</span>
                      <span className="font-mono font-bold">₹{displayAmount(amt)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-400">Koi Card kharcha nahi</div>
                )}

                {/* Next Month Card Reserve Preview (Spends whose cycle Due Date falls in Next Month) */}
                {!isAllTime && nextMonthOfActive && nextMonthCardReserves && nextMonthCardReserves.totalPendingReserve > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-indigo-400/25">
                    <button
                      type="button"
                      onClick={() => onSelectMonth?.(nextMonthOfActive)}
                      className="w-full text-left bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-400/35 rounded-lg p-1.5 transition-colors cursor-pointer"
                      title={`${formatMonthName(nextMonthOfActive)} ka Card Reserve view kholne ke liye click karein`}
                    >
                      <div className="flex items-center justify-between gap-1 text-[9.5px] font-bold text-indigo-200">
                        <span>⏭️ Next Month ({formatMonthName(nextMonthOfActive).split(' ')[0]})</span>
                        <span className="font-mono text-cyan-300">
                          ₹{displayAmount(nextMonthCardReserves.totalPendingReserve)} ↗
                        </span>
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {nextMonthCardReserves.items
                          .filter((ni) => ni.pendingReserve > 0)
                          .slice(0, 3)
                          .map((ni) => (
                            <div key={ni.cardId} className="flex items-center justify-between text-[9px] text-indigo-200/80 gap-1">
                              <span className="truncate">
                                {ni.shortName} ({ni.cycle.cycleLabel} · Due {ni.cycle.dueLabel})
                              </span>
                              <span className="font-mono font-semibold text-cyan-200 shrink-0">
                                ₹{displayAmount(ni.pendingReserve)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Step 5: Final Pure Savings */}
            <div className="bg-emerald-950/30 border-2 border-emerald-500/40 rounded-xl p-3 flex flex-col justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 flex items-center justify-between">
                <span>5. Final Savings 💰</span>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-200 px-1.5 py-0.5 rounded">Pure Bachat</span>
              </div>
              <div className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-400 my-1">
                ₹{displayAmount(finalPureSavings)}
              </div>
              <div className="text-[10px] text-emerald-200/90 space-y-0.5 border-t border-emerald-500/20 pt-1.5">
                <div className="font-mono">
                  ₹{displayAmount(bankAndCashInHand)} (Bank) - ₹{displayAmount(cardReserveAmount)} (Card)
                </div>
                <div className="text-[9px] text-emerald-300/80">
                  {ccPaidFromPreviousSavings > 0
                    ? `🏦 ₹${displayAmount(ccPaidFromPreviousSavings)} purani savings se settle hua (income safe)`
                    : 'Ye rashi aap sidha Savings me dal sakte hain'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

