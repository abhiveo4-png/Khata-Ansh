import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Coins, 
  ArrowUpRight, 
  ArrowDownRight,
  PieChart,
  PiggyBank,
  Zap,
  Lock,
  Shield
} from 'lucide-react';
import { FinancialSummary, Transaction, UserRole } from '../types';
import { formatCurrency } from '../utils/formatters';

interface OverviewCardsProps {
  summary: FinancialSummary;
  transactions?: Transaction[];
  userRole?: UserRole;
  activeFamilyMemberName?: string;
  isPrivacyMode?: boolean;
  onOpenReimbursementSummary?: () => void;
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({ 
  summary, 
  transactions = [],
  userRole = 'owner',
  activeFamilyMemberName,
  isPrivacyMode = false,
  onOpenReimbursementSummary,
}) => {
  const isFamily = userRole === 'family';

  // Calculate personal spend of this family member
  const memberTxs = transactions.filter(t => {
    if (!activeFamilyMemberName) return false;
    const u = (t.telegramUser || '').toLowerCase().trim();
    const mem = activeFamilyMemberName.toLowerCase().trim();
    return u === mem || u.includes(mem) || mem.includes(u);
  });

  const memberPersonalExpense = memberTxs
    .filter(t => t.type === 'expense' && !t.isSavingsTransfer)
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const personalExpense = isFamily
    ? memberPersonalExpense
    : (summary.personalExpense !== undefined ? summary.personalExpense : summary.totalExpense);

  const pendingReimbursements = summary.pendingReimbursements || 0;
  const netSavings = summary.totalIncome - (summary.personalExpense !== undefined ? summary.personalExpense : summary.totalExpense) + pendingReimbursements;

  const displayAmount = (val: number, isMemberOwnAmount: boolean = false) => {
    if (isFamily && !isMemberOwnAmount) {
      return '••••••';
    }
    if (isPrivacyMode) {
      return '••••••';
    }
    return val.toLocaleString('en-IN');
  };

  return (
    <div className="space-y-3">
      {/* Dynamic Savings Formula Banner */}
      <div className="px-4 py-2.5 rounded-xl bg-slate-900/60 border border-white/[0.08] flex flex-wrap items-center justify-between gap-2 text-xs font-mono backdrop-blur-md">
        <div className="flex items-center gap-2 flex-wrap text-slate-300">
          <span className="font-bold text-white flex items-center gap-1">
            {isFamily ? (
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            )}
            {isFamily ? 'Family Privacy Active:' : 'Savings Formula:'}
          </span>
          <span className="text-emerald-400">Income (₹{displayAmount(summary.totalIncome)})</span>
          <span>-</span>
          <span className="text-rose-400">
            {isFamily ? 'Aapka Kharcha' : 'Personal Kharcha'} (₹{displayAmount(personalExpense, isFamily)})
          </span>
          <span>+</span>
          <button
            type="button"
            onClick={() => onOpenReimbursementSummary?.()}
            className="text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer transition-all"
            title="Reimbursement summary and settlement hub kholein"
          >
            Reimbursement (₹{displayAmount(pendingReimbursements)})
          </button>
          <span>=</span>
          <span className="font-extrabold text-white bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30">
            Net Savings: ₹{displayAmount(netSavings)}
          </span>
        </div>
        {isFamily ? (
          <span className="text-[11px] text-indigo-300 bg-indigo-950/60 px-2.5 py-0.5 rounded-md border border-indigo-500/30 font-sans flex items-center gap-1">
            <Lock className="w-3 h-3 text-indigo-400" />
            Owner & Global balances masked
          </span>
        ) : pendingReimbursements > 0 && (
          <button
            type="button"
            onClick={() => onOpenReimbursementSummary?.()}
            className="text-[11px] text-cyan-300 bg-cyan-950/80 hover:bg-cyan-900/80 px-2.5 py-0.5 rounded-md border border-cyan-500/40 font-sans cursor-pointer transition-all flex items-center gap-1 shadow-xs"
            title="Click karein settlement hub kholne ke liye"
          >
            <span>💼 ₹{displayAmount(pendingReimbursements)} office rim pending (Settle)</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 1. Total Income */}
        <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-emerald-500/10 blur-2xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />
          
          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Kul Income (Kamai)
            </span>
            <div className="w-9 h-9 rounded-xl icon-badge-emerald flex items-center justify-center transition-transform group-hover:scale-110">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-baseline">
              <span className="text-emerald-400 mr-1 text-xl font-medium">₹</span>
              <span className={isFamily ? 'font-mono tracking-widest text-slate-400' : ''}>
                {displayAmount(summary.totalIncome)}
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="inline-flex items-center text-emerald-400 font-semibold">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              {isFamily ? '🔒 Masked' : `${summary.incomeCount} Entries`}
            </span>
            <span className="text-slate-400 text-[11px] font-medium">
              {isFamily ? 'Family Privacy' : 'Salary & Earnings'}
            </span>
          </div>
        </div>

        {/* 2. Personal Expense / Family Member's Expense */}
        <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-rose-500/10 blur-2xl group-hover:bg-rose-500/20 transition-all pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
              {isFamily ? 'Aapka Kharcha' : 'Personal Kharcha'}
            </span>
            <div className="w-9 h-9 rounded-xl icon-badge-rose flex items-center justify-center transition-transform group-hover:scale-110">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-baseline">
              <span className="text-rose-400 mr-1 text-xl font-medium">₹</span>
              <span>{displayAmount(personalExpense, true)}</span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="inline-flex items-center text-rose-400 font-semibold">
              <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
              {isFamily ? `${memberTxs.length} Transactions` : `${summary.expenseCount} Transactions`}
            </span>
            <span className="text-slate-400 text-[11px] font-medium">
              {isFamily ? (activeFamilyMemberName || 'Aapka hisaab') : 'Excludes Rim'}
            </span>
          </div>
        </div>

        {/* 3. Net Savings (Income - Personal Kharcha + Rim) */}
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
                {displayAmount(netSavings)}
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="font-semibold text-indigo-300">
              {isFamily ? '🔒 Hidden for Family' : `Bachat Rate: ${summary.savingsRate}%`}
            </span>
            <span className="text-slate-400 text-[11px] font-medium">
              {isFamily ? 'Master Protected' : 'Lifetime Unspent'}
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
                {displayAmount(summary.monthlyBudget)}
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="text-slate-300 text-[11px] font-medium">
              {isFamily ? '🔒 Limits Masked' : `Kharcha: ₹${displayAmount(summary.monthlySpent)}`}
            </span>
            <span className="text-cyan-400 font-bold font-mono">
              {isFamily ? '••%' : `${summary.monthlyBudget > 0 ? Math.round((summary.monthlySpent / summary.monthlyBudget) * 100) : 0}%`}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
