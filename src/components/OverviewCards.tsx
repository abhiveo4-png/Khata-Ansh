import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight,
  PieChart,
  PiggyBank,
  Zap,
  Lock,
  Shield,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Layers
} from 'lucide-react';
import { FinancialSummary, Transaction, UserRole, CategoryBudget, CategoryDef, UdhaarRecord } from '../types';

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
  budgets = [],
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

  // Indian Standard Time (IST) Month
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istNow = new Date(utc + (3600000 * 5.5));
  const currentIstMonth = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, '0')}`;

  const activeMonth = selectedMonth || currentIstMonth;
  const isAllTime = activeMonth === 'all';

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

  // 1. Separate transactions into Previous Months and Current/Selected Month
  const prevTransactions = !isAllTime
    ? transactions.filter(t => t.date && t.date < `${activeMonth}-01`)
    : [];

  const monthTransactions = !isAllTime
    ? transactions.filter(t => t.date && t.date.startsWith(activeMonth))
    : transactions;

  // 2. Opening Balance / Carryforward from previous months
  let prevIncome = 0;
  let prevTotalExpense = 0;
  let prevPersonalExpense = 0;
  let prevUdhaarLent = 0;
  let prevUdhaarRecovered = 0;
  let prevPendingRim = 0;

  for (const t of prevTransactions) {
    const amt = Number(t.amount) || 0;
    const isRimInflow = Boolean(
      t.isReimbursementInflow ||
      (t.type === 'income' && (t.category === 'Reimbursement' || t.category === 'Reimbursement Received'))
    );
    const isUdhaarRecovery = Boolean(
      t.isUdhaarRecovery ||
      (t.type === 'income' && (t.category === 'Udhaar Recovery' || t.category === 'Udhaar Received' || t.category === 'Udhaar Settle' || (t.category && t.category.toLowerCase().includes('udhaar') && t.type === 'income')))
    );

    if (t.type === 'income') {
      if (isUdhaarRecovery) {
        prevUdhaarRecovered += amt;
      } else if (!isRimInflow) {
        prevIncome += amt;
      }
    } else {
      const isRim = Boolean(t.isReimbursement || t.category === 'Reimbursement');
      const isUdhaarLent = Boolean(
        t.isUdhaarLent ||
        t.category === 'Udhaar Given' ||
        t.category === 'Loan Given' ||
        (t.category && t.category.toLowerCase().includes('udhaar') && t.type === 'expense') ||
        (t.tags && t.tags.includes('udhaar-lent'))
      );
      if (isUdhaarLent) {
        prevUdhaarLent += amt;
      } else {
        prevTotalExpense += amt;
        if (isRim) {
          const settledAmt = t.reimbursementStatus === 'settled'
            ? amt
            : Math.min(amt, Math.max(0, Number(t.reimbursementSettledAmount) || 0));
          const rem = Math.max(0, amt - settledAmt);
          if (t.reimbursementStatus !== 'settled' && rem > 0) {
            prevPendingRim += rem;
          }
        } else if (!t.isSavingsTransfer && !t.isWifeTransfer && t.category !== 'Wife Transfer' && !t.isCcPayment && t.category !== 'CC Payment') {
          prevPersonalExpense += amt;
        }
      }
    }
  }

  // 3. Selected Month figures
  let monthIncome = 0;
  let monthRimRecovery = 0;
  let monthTotalExpense = 0;
  let monthPersonalExpense = 0;
  let monthBudgetSpent = 0;
  let monthUdhaarLent = 0;
  let monthUdhaarRecovered = 0;
  let monthPendingRim = 0;
  let monthIncomeCount = 0;
  let monthExpenseCount = 0;

  for (const t of monthTransactions) {
    const amt = Number(t.amount) || 0;
    const isRimInflow = Boolean(
      t.isReimbursementInflow ||
      (t.type === 'income' && (t.category === 'Reimbursement' || t.category === 'Reimbursement Received'))
    );
    const isUdhaarRecovery = Boolean(
      t.isUdhaarRecovery ||
      (t.type === 'income' && (t.category === 'Udhaar Recovery' || t.category === 'Udhaar Received' || t.category === 'Udhaar Settle' || (t.category && t.category.toLowerCase().includes('udhaar') && t.type === 'income')))
    );

    if (t.type === 'income') {
      if (isUdhaarRecovery) {
        monthUdhaarRecovered += amt;
      } else if (!isRimInflow) {
        monthIncome += amt;
        monthIncomeCount++;
      } else {
        monthRimRecovery += amt;
      }
    } else {
      const isRim = Boolean(t.isReimbursement || t.category === 'Reimbursement');
      const isUdhaarLent = Boolean(
        t.isUdhaarLent ||
        t.category === 'Udhaar Given' ||
        t.category === 'Loan Given' ||
        (t.category && t.category.toLowerCase().includes('udhaar') && t.type === 'expense') ||
        (t.tags && t.tags.includes('udhaar-lent'))
      );
      const catDef = categories.find(c => c.name.toLowerCase() === (t.category || '').toLowerCase());
      const isExemptFromBudget = Boolean(catDef?.excludeFromBudget) || isRim || isUdhaarLent || t.isSavingsTransfer || t.isWifeTransfer || t.category === 'Wife Transfer' || t.isCcPayment || t.category === 'CC Payment';

      if (isUdhaarLent) {
        monthUdhaarLent += amt;
      } else {
        monthTotalExpense += amt;
        monthExpenseCount++;
        if (isRim) {
          const settledAmt = t.reimbursementStatus === 'settled'
            ? amt
            : Math.min(amt, Math.max(0, Number(t.reimbursementSettledAmount) || 0));
          const rem = Math.max(0, amt - settledAmt);
          if (t.reimbursementStatus !== 'settled' && rem > 0) {
            monthPendingRim += rem;
          }
        } else if (!t.isSavingsTransfer && !t.isWifeTransfer && t.category !== 'Wife Transfer' && !t.isCcPayment && t.category !== 'CC Payment') {
          monthPersonalExpense += amt;
          if (!isExemptFromBudget) {
            monthBudgetSpent += amt;
          }
        }
      }
    }
  }

  // 4. Udhaar Tab Analysis (Dedicated Khata Records)
  const safeUdhaars = Array.isArray(udhaars) ? udhaars : [];
  const tabPendingLentRecords = safeUdhaars.filter(u => u && u.type === 'lent' && u.status !== 'settled');
  const tabSettledLentRecords = safeUdhaars.filter(u => u && u.type === 'lent' && u.status === 'settled');
  const tabPendingBorrowedRecords = safeUdhaars.filter(u => u && u.type === 'borrowed' && u.status !== 'settled');

  const tabPendingLent = tabPendingLentRecords.reduce((sum, u) => sum + (Number(u.amount) || 0), 0);
  const tabPendingBorrowed = tabPendingBorrowedRecords.reduce((sum, u) => sum + (Number(u.amount) || 0), 0);
  const tabTotalSettled = tabSettledLentRecords.reduce((sum, u) => sum + (Number(u.amount) || 0), 0);

  const monthTabPendingLent = tabPendingLentRecords
    .filter(u => !isAllTime ? (u.date && u.date.startsWith(activeMonth)) : true)
    .reduce((sum, u) => sum + (Number(u.amount) || 0), 0);

  const prevTabPendingLent = tabPendingLentRecords
    .filter(u => !isAllTime ? (u.date && u.date < `${activeMonth}-01`) : false)
    .reduce((sum, u) => sum + (Number(u.amount) || 0), 0);

  // Synchronized Bakaya: If Udhaar tab has records, its unsettled status is authoritative!
  const hasUdhaarTabEntries = safeUdhaars.length > 0;
  const effectiveTotalBakaya = hasUdhaarTabEntries
    ? Math.max(0, tabPendingLent - tabPendingBorrowed)
    : Math.max(0, (prevUdhaarLent + monthUdhaarLent) - (prevUdhaarRecovered + monthUdhaarRecovered));

  const effectiveMonthBakaya = hasUdhaarTabEntries
    ? monthTabPendingLent
    : Math.max(0, monthUdhaarLent - monthUdhaarRecovered);

  const effectivePrevBakaya = hasUdhaarTabEntries
    ? prevTabPendingLent
    : Math.max(0, prevUdhaarLent - prevUdhaarRecovered);

  const effectiveTotalSettled = hasUdhaarTabEntries
    ? tabTotalSettled
    : (prevUdhaarRecovered + monthUdhaarRecovered);

  // Opening & Cash Balance (Recovered cash flows back to liquid balance)
  const openingNetSavings = prevIncome - prevTotalExpense;
  const openingCashBalance = prevIncome - prevTotalExpense - prevUdhaarLent + prevUdhaarRecovered;

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

  const displayPersonalExpense = isFamily ? memberPersonalExpense : monthPersonalExpense;
  // Net Savings preserves Udhar as receivable asset (income - non-udhaar expense)
  const monthNetSavings = monthIncome - monthTotalExpense;
  const monthCashBalance = monthIncome - monthTotalExpense - monthUdhaarLent + monthUdhaarRecovered;

  // Cumulative / Total at the end of selected month
  const totalNetSavings = openingNetSavings + monthNetSavings;
  const totalCashBalance = openingCashBalance + monthCashBalance;
  const totalUdhaarLent = prevUdhaarLent + monthUdhaarLent;
  const totalPendingRim = prevPendingRim + monthPendingRim;

  // Budget calculations: monthlySpent excludes categories exempt from budget!
  const monthlyBudgetLimit = summary.monthlyBudget;
  const monthlySpent = monthBudgetSpent;
  const budgetPercentage = monthlyBudgetLimit > 0 ? Math.round((monthlySpent / monthlyBudgetLimit) * 100) : 0;
  const monthlySavingsRate = monthIncome > 0 ? Math.max(0, Math.round((monthNetSavings / monthIncome) * 100)) : 0;

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
    const currentIndex = availableMonths.indexOf(activeMonth);
    if (currentIndex >= 0 && currentIndex < availableMonths.length - 1) {
      onSelectMonth(availableMonths[currentIndex + 1]);
    } else {
      const [y, m] = activeMonth.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1);
      const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      onSelectMonth(prevMonthStr);
    }
  };

  const handleNextMonth = () => {
    if (!onSelectMonth || isAllTime) return;
    const currentIndex = availableMonths.indexOf(activeMonth);
    if (currentIndex > 0) {
      onSelectMonth(availableMonths[currentIndex - 1]);
    } else {
      const [y, m] = activeMonth.split('-').map(Number);
      const nextDate = new Date(y, m, 1);
      const nextMonthStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
      onSelectMonth(nextMonthStr);
    }
  };

  const isCurrentMonth = activeMonth === currentIstMonth;

  return (
    <div className="space-y-3">
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
              {availableMonths.map((m) => (
                <option key={m} value={m} className="bg-slate-900 text-white">
                  📅 {formatMonthName(m)} {m === currentIstMonth ? '• (Current Live)' : ''}
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
            disabled={isAllTime || isCurrentMonth}
            className="p-1.5 sm:p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer border border-white/[0.05]"
            title="Agla Mahina"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Mode Switchers */}
        <div className="flex items-center gap-2 text-xs">
          {!isAllTime ? (
            <>
              {isCurrentMonth ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Current Month
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectMonth?.(currentIstMonth)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-[11px] font-medium cursor-pointer transition-all"
                >
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  Jump to Current Month
                </button>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 1. Total Income (Month or Lifetime) */}
        <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-emerald-500/10 blur-2xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />
          
          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              {isAllTime ? 'Kul Kamai (All Time)' : `${formatMonthName(activeMonth)} Kamai`}
            </span>
            <div className="w-9 h-9 rounded-xl icon-badge-emerald flex items-center justify-center transition-transform group-hover:scale-110">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-baseline font-mono">
              <span className="text-emerald-400 mr-1 text-xl font-medium">₹</span>
              <span className={isFamily ? 'font-mono tracking-widest text-slate-400' : ''}>
                {displayAmount(monthIncome)}
              </span>
            </div>
            {monthRimRecovery > 0 && !isFamily && (
              <div className="text-[10px] text-cyan-300 font-medium mt-1 flex items-center gap-1">
                <span>💼 +₹{displayAmount(monthRimRecovery)} Rim Recovery (Exempt from Salary)</span>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="inline-flex items-center text-emerald-400 font-semibold">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              {isFamily ? '🔒 Masked' : `${monthIncomeCount} Entries`}
            </span>
            <span className="text-slate-400 text-[11px] font-medium">
              {isFamily ? 'Family Privacy' : isAllTime ? 'Lifetime Earnings' : isCurrentMonth ? 'Active Month' : 'Archived Month'}
            </span>
          </div>
        </div>

        {/* 2. Personal Expense / Family Member's Expense */}
        <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-rose-500/10 blur-2xl group-hover:bg-rose-500/20 transition-all pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
              {isFamily ? 'Aapka Kharcha' : isAllTime ? 'Personal Kharcha (All Time)' : `${formatMonthName(activeMonth)} Kharcha`}
            </span>
            <div className="w-9 h-9 rounded-xl icon-badge-rose flex items-center justify-center transition-transform group-hover:scale-110">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-baseline font-mono">
              <span className="text-rose-400 mr-1 text-xl font-medium">₹</span>
              <span>{displayAmount(displayPersonalExpense, true)}</span>
            </div>
            {monthUdhaarLent > 0 && !isFamily && (
              <div className="text-[10px] text-amber-300 font-medium mt-1 flex items-center gap-1 flex-wrap">
                <span>🤝 ₹{displayAmount(monthUdhaarLent)} Is Mahine Udhaar Diya</span>
                {effectiveMonthBakaya < monthUdhaarLent && (
                  <span className="text-[9px] text-emerald-300 font-semibold bg-emerald-950/60 px-1 rounded border border-emerald-500/30">
                    (₹{displayAmount(monthUdhaarLent - effectiveMonthBakaya)} Wapas Aaya • ₹{displayAmount(effectiveMonthBakaya)} Bakaya)
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="inline-flex items-center text-rose-400 font-semibold">
              <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
              {isFamily ? `${memberTxs.length} Transactions` : `${monthExpenseCount} Transactions`}
            </span>
            <span className="text-slate-400 text-[11px] font-medium">
              {isFamily ? (activeFamilyMemberName || 'Aapka hisaab') : 'Excludes Rim & Udhaar'}
            </span>
          </div>
        </div>

        {/* 3. Net Savings (Carryforward + Month Savings) */}
        <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group border-indigo-500/35">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-indigo-500/15 blur-2xl group-hover:bg-indigo-500/25 transition-all pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              Net Savings & Balance
            </span>
            <div className="w-9 h-9 rounded-xl icon-badge-cyan flex items-center justify-center transition-transform group-hover:scale-110">
              <PiggyBank className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-indigo-300 tracking-tight flex items-baseline font-mono">
              <span className="mr-1 text-xl font-medium text-indigo-400">₹</span>
              <span className={isFamily ? 'tracking-widest text-slate-400' : ''}>
                {displayAmount(totalNetSavings)}
              </span>
            </div>
            {effectiveTotalBakaya > 0 && !isFamily ? (
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <button 
                  type="button"
                  onClick={onNavigateToUdhaar}
                  className="inline-flex items-center text-[10px] font-medium text-emerald-400 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 px-2 py-0.5 rounded-md transition-all cursor-pointer shadow-xs text-left group"
                  title="Click karke Udhaar Khata (Wealth & Khata) kholein"
                >
                  {effectivePrevBakaya > 0 && !isAllTime ? (
                    <span>
                      🤝 <b>Udhaar Khata Bakaya:</b> ₹{displayAmount(effectiveTotalBakaya)} (Is Mahine: ₹{displayAmount(effectiveMonthBakaya)} • Pichla: ₹{displayAmount(effectivePrevBakaya)})
                    </span>
                  ) : (
                    <span>
                      🤝 <b>Udhaar Khata Bakaya:</b> ₹{displayAmount(effectiveTotalBakaya)} Lena Hai (Bachat Surakshit)
                    </span>
                  )}
                  {effectiveTotalSettled > 0 && (
                    <span className="ml-1 text-[9px] text-emerald-300/80 font-normal">
                      • ₹{displayAmount(effectiveTotalSettled)} Settle Hua
                    </span>
                  )}
                  <span className="ml-1 text-[9px] text-cyan-400 group-hover:underline font-mono">
                    [Khata ↗]
                  </span>
                </button>
              </div>
            ) : effectiveTotalSettled > 0 && !isFamily ? (
              <div className="mt-1 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onNavigateToUdhaar}
                  className="inline-flex items-center text-[10px] font-medium text-cyan-400 bg-cyan-950/50 border border-cyan-500/30 px-1.5 py-0.5 rounded-md hover:bg-cyan-900/50 cursor-pointer"
                  title="Sabhi Udhaar Settle ho chuke hain! Khata dekhne ke liye click karein"
                >
                  ✨ Udhaar Khata Settle (₹{displayAmount(effectiveTotalSettled)} Wapas Aaya) [Khata ↗]
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="font-semibold text-indigo-300">
              {isFamily ? '🔒 Hidden for Family' : !isAllTime && openingNetSavings !== 0 ? (
                `📦 Carry: ₹${displayAmount(openingNetSavings)} • Is Mahine: ₹${displayAmount(monthNetSavings)}`
              ) : (
                `Liquid Cash: ₹${displayAmount(totalCashBalance)}`
              )}
            </span>
            <span className="text-slate-400 text-[11px] font-medium">
              {isFamily ? 'Master Protected' : totalUdhaarLent > 0 ? `Cash: ₹${displayAmount(totalCashBalance)}` : `Bachat: ${monthlySavingsRate}%`}
            </span>
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
    </div>
  );
};
