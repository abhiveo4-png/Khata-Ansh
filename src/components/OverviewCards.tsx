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
import { FinancialSummary, Transaction, UserRole, CategoryBudget } from '../types';

interface OverviewCardsProps {
  summary: FinancialSummary;
  transactions?: Transaction[];
  budgets?: CategoryBudget[];
  userRole?: UserRole;
  activeFamilyMemberName?: string;
  isPrivacyMode?: boolean;
  selectedMonth?: string;
  onSelectMonth?: (month: string) => void;
  availableMonths?: string[];
  onOpenReimbursementSummary?: () => void;
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({ 
  summary, 
  transactions = [],
  budgets = [],
  userRole = 'owner',
  activeFamilyMemberName,
  isPrivacyMode = false,
  selectedMonth = 'all',
  onSelectMonth,
  availableMonths = [],
  onOpenReimbursementSummary,
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
  let prevPendingRim = 0;

  for (const t of prevTransactions) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      prevIncome += amt;
    } else {
      prevTotalExpense += amt;
      const isRim = Boolean(t.isReimbursement || t.category === 'Reimbursement');
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

  const openingNetSavings = prevIncome - prevPersonalExpense; // Carryforward true savings
  const openingCashBalance = prevIncome - prevTotalExpense;   // Carryforward cash balance

  // 3. Selected Month figures
  let monthIncome = 0;
  let monthTotalExpense = 0;
  let monthPersonalExpense = 0;
  let monthPendingRim = 0;
  let monthIncomeCount = 0;
  let monthExpenseCount = 0;

  for (const t of monthTransactions) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      monthIncome += amt;
      monthIncomeCount++;
    } else {
      monthTotalExpense += amt;
      monthExpenseCount++;
      const isRim = Boolean(t.isReimbursement || t.category === 'Reimbursement');
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
      }
    }
  }

  // Active family member calculation in selected month
  const memberTxs = monthTransactions.filter(t => {
    if (!activeFamilyMemberName) return false;
    const u = (t.telegramUser || '').toLowerCase().trim();
    const mem = activeFamilyMemberName.toLowerCase().trim();
    return u === mem || u.includes(mem) || mem.includes(u);
  });
  const memberPersonalExpense = memberTxs
    .filter(t => t.type === 'expense' && !t.isSavingsTransfer)
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const displayPersonalExpense = isFamily ? memberPersonalExpense : monthPersonalExpense;
  const monthNetSavings = monthIncome - displayPersonalExpense;
  const monthCashBalance = monthIncome - monthTotalExpense;

  // Cumulative / Total at the end of selected month
  const totalNetSavings = openingNetSavings + monthNetSavings;
  const totalCashBalance = openingCashBalance + monthCashBalance;
  const totalPendingRim = prevPendingRim + monthPendingRim;

  // Budget calculations
  const monthlyBudgetLimit = summary.monthlyBudget;
  const monthlySpent = monthPersonalExpense;
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
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="inline-flex items-center text-rose-400 font-semibold">
              <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
              {isFamily ? `${memberTxs.length} Transactions` : `${monthExpenseCount} Transactions`}
            </span>
            <span className="text-slate-400 text-[11px] font-medium">
              {isFamily ? (activeFamilyMemberName || 'Aapka hisaab') : 'Excludes Rim'}
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
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="font-semibold text-indigo-300">
              {isFamily ? '🔒 Hidden for Family' : !isAllTime && openingNetSavings !== 0 ? (
                `📦 Carry: ₹${displayAmount(openingNetSavings)} • Is Mahine: ₹${displayAmount(monthNetSavings)}`
              ) : (
                `Cash Balance: ₹${displayAmount(totalCashBalance)}`
              )}
            </span>
            <span className="text-slate-400 text-[11px] font-medium">
              {isFamily ? 'Master Protected' : `Bachat: ${monthlySavingsRate}%`}
            </span>
          </div>
        </div>

        {/* 4. Monthly Budget Progress */}
        <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-cyan-500/10 blur-2xl group-hover:bg-cyan-500/20 transition-all pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
              Monthly Budget
            </span>
            <div className="w-9 h-9 rounded-xl icon-badge-cyan flex items-center justify-center transition-transform group-hover:scale-110">
              <PieChart className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-baseline font-mono">
              <span className="text-cyan-400 mr-1 text-xl font-medium">₹</span>
              <span className={isFamily ? 'tracking-widest text-slate-400' : ''}>
                {displayAmount(monthlyBudgetLimit)}
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="text-slate-300 text-[11px] font-medium">
              {isFamily ? '🔒 Limits Masked' : `Laga: ₹${displayAmount(monthlySpent)} • Bacha: ₹${displayAmount(Math.max(0, monthlyBudgetLimit - monthlySpent))}`}
            </span>
            <span className={`font-bold font-mono ${budgetPercentage > 100 ? 'text-rose-400' : 'text-cyan-400'}`}>
              {isFamily ? '••%' : `${budgetPercentage}%`}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
