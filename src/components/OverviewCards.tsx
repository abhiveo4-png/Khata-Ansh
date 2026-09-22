import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Coins, 
  ArrowUpRight, 
  ArrowDownRight,
  PieChart,
  PiggyBank,
  Zap
} from 'lucide-react';
import { FinancialSummary } from '../types';
import { formatCurrency } from '../utils/formatters';

interface OverviewCardsProps {
  summary: FinancialSummary;
  isPrivacyMode?: boolean;
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({ summary, isPrivacyMode = false }) => {
  const investableSurplus = Math.max(0, summary.totalIncome - summary.totalExpense);
  const isPositiveSavings = summary.netSavings >= 0;
  const budgetPercentage = summary.monthlyBudget > 0 
    ? Math.min(100, Math.round((summary.totalExpense / summary.monthlyBudget) * 100))
    : 0;

  const displayAmount = (val: number) => {
    if (isPrivacyMode) return '••••';
    return val.toLocaleString('en-IN');
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      
      {/* 1. Total Income */}
      <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group">
        {/* Subtle glass ambient glow */}
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
            <span>{displayAmount(summary.totalIncome)}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
          <span className="inline-flex items-center text-emerald-400 font-semibold">
            <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
            {summary.incomeCount} Entries
          </span>
          <span className="text-slate-400 text-[11px] font-medium">Salary & Earnings</span>
        </div>
      </div>

      {/* 2. Total Expense */}
      <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group">
        {/* Subtle glass ambient glow */}
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-rose-500/10 blur-2xl group-hover:bg-rose-500/20 transition-all pointer-events-none" />

        <div className="flex items-center justify-between relative z-10">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
            Kul Kharcha (Expense)
          </span>
          <div className="w-9 h-9 rounded-xl icon-badge-rose flex items-center justify-center transition-transform group-hover:scale-110">
            <TrendingDown className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3 relative z-10">
          <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-baseline">
            <span className="text-rose-400 mr-1 text-xl font-medium">₹</span>
            <span>{displayAmount(summary.totalExpense)}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
          <span className="inline-flex items-center text-rose-400 font-semibold">
            <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
            {summary.expenseCount} Transactions
          </span>
          <span className="text-slate-400 text-[11px] font-medium">Daily & Bills</span>
        </div>
      </div>

      {/* 3. Real-Time Investable Balance (Income - Kharcha = Investment) */}
      <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group border-cyan-500/35">
        {/* Subtle cyan ambient glow */}
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-cyan-500/15 blur-2xl group-hover:bg-cyan-500/25 transition-all pointer-events-none" />

        <div className="flex items-center justify-between relative z-10">
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            Investable Balance
          </span>
          <div className="w-9 h-9 rounded-xl icon-badge-cyan flex items-center justify-center transition-transform group-hover:scale-110">
            <PiggyBank className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3 relative z-10">
          <div className="text-2xl sm:text-3xl font-extrabold text-cyan-300 tracking-tight flex items-baseline font-mono">
            <span className="mr-1 text-xl font-medium text-cyan-400">₹</span>
            <span>{displayAmount(investableSurplus)}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
          <span className="inline-flex items-center text-cyan-300 font-bold text-[11px] bg-cyan-500/15 px-2 py-0.5 rounded-lg border border-cyan-500/30">
            {summary.savingsRate}% Ready to Invest
          </span>
          <span className="text-slate-400 text-[11px] font-medium">Income - Kharcha</span>
        </div>
      </div>

      {/* 4. Monthly Budget Progress */}
      <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group">
        {/* Subtle violet ambient glow */}
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-purple-500/10 blur-2xl group-hover:bg-purple-500/20 transition-all pointer-events-none" />

        <div className="flex items-center justify-between relative z-10">
          <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
            Monthly Budget
          </span>
          <div className="w-9 h-9 rounded-xl icon-badge-purple flex items-center justify-center transition-transform group-hover:scale-110">
            <PieChart className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-between relative z-10">
          <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {budgetPercentage}%
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Limit: {isPrivacyMode ? '₹••••' : formatCurrency(summary.monthlyBudget)}
          </span>
        </div>

        <div className="mt-3 pt-2.5 border-t border-white/[0.08] relative z-10">
          <div className="w-full bg-black/40 rounded-full h-2 overflow-hidden border border-white/[0.08] p-[1px]">
            <div 
              className={`h-full rounded-full transition-all duration-500 shadow-sm ${
                budgetPercentage > 90 
                  ? 'bg-gradient-to-r from-rose-500 to-red-600' 
                  : budgetPercentage > 75 
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500' 
                  : 'bg-gradient-to-r from-indigo-500 to-purple-500'
              }`}
              style={{ width: `${Math.min(100, budgetPercentage)}%` }}
            />
          </div>
        </div>
      </div>

    </div>
  );
};

