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
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({ summary }) => {
  const investableSurplus = Math.max(0, summary.totalIncome - summary.totalExpense);
  const isPositiveSavings = summary.netSavings >= 0;
  const budgetPercentage = summary.monthlyBudget > 0 
    ? Math.min(100, Math.round((summary.totalExpense / summary.monthlyBudget) * 100))
    : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      
      {/* 1. Total Income */}
      <div className="bg-[#0e1526] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-md shadow-black/20 hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Kul Income (Kamai)
          </span>
          <div className="w-8 h-8 rounded-xl bg-emerald-950/70 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-baseline">
            <span className="text-emerald-400 mr-1 text-xl font-normal">₹</span>
            <span>{summary.totalIncome.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-slate-800/80">
          <span className="inline-flex items-center text-emerald-400 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
            {summary.incomeCount} Entries
          </span>
          <span className="text-slate-400 text-[11px]">Salary & Earnings</span>
        </div>
      </div>

      {/* 2. Total Expense */}
      <div className="bg-[#0e1526] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-md shadow-black/20 hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">
            Kul Kharcha (Expense)
          </span>
          <div className="w-8 h-8 rounded-xl bg-rose-950/70 border border-rose-500/20 text-rose-400 flex items-center justify-center">
            <TrendingDown className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-baseline">
            <span className="text-rose-400 mr-1 text-xl font-normal">₹</span>
            <span>{summary.totalExpense.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-slate-800/80">
          <span className="inline-flex items-center text-rose-400 font-medium">
            <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
            {summary.expenseCount} Transactions
          </span>
          <span className="text-slate-400 text-[11px]">Daily & Bills</span>
        </div>
      </div>

      {/* 3. Real-Time Investable Balance (Income - Kharcha = Investment) */}
      <div className="bg-gradient-to-br from-[#0a1728] to-[#0e1526] border border-cyan-500/40 rounded-2xl p-4 sm:p-5 shadow-lg shadow-cyan-950/20 hover:border-cyan-400/60 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-cyan-400" />
            Investable Balance
          </span>
          <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shadow-xs">
            <PiggyBank className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-bold text-cyan-300 tracking-tight flex items-baseline font-mono">
            <span className="mr-1 text-xl font-normal text-cyan-400">₹</span>
            <span>{investableSurplus.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-slate-800/80">
          <span className="inline-flex items-center text-cyan-300 font-medium text-[11px] bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
            {summary.savingsRate}% Ready to Invest
          </span>
          <span className="text-slate-400 text-[11px]">Income - Kharcha</span>
        </div>
      </div>

      {/* 4. Monthly Budget Progress */}
      <div className="bg-[#0e1526] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-md shadow-black/20 hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">
            Monthly Budget
          </span>
          <div className="w-8 h-8 rounded-xl bg-violet-950/70 border border-violet-500/20 text-violet-400 flex items-center justify-center">
            <PieChart className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-between">
          <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {budgetPercentage}%
          </div>
          <span className="text-xs text-slate-400">
            Limit: {formatCurrency(summary.monthlyBudget)}
          </span>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-800/80">
          <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                budgetPercentage > 90 
                  ? 'bg-rose-500' 
                  : budgetPercentage > 75 
                  ? 'bg-amber-500' 
                  : 'bg-indigo-500'
              }`}
              style={{ width: `${Math.min(100, budgetPercentage)}%` }}
            />
          </div>
        </div>
      </div>

    </div>
  );
};

