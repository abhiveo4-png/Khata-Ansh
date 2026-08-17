import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight,
  PieChart
} from 'lucide-react';
import { FinancialSummary } from '../types';
import { formatCurrency } from '../utils/formatters';

interface OverviewCardsProps {
  summary: FinancialSummary;
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({ summary }) => {
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

      {/* 3. Net Savings */}
      <div className="bg-[#0e1526] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-md shadow-black/20 hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
            Net Bachat (Savings)
          </span>
          <div className="w-8 h-8 rounded-xl bg-indigo-950/70 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Wallet className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3">
          <div className={`text-2xl sm:text-3xl font-bold tracking-tight flex items-baseline ${
            isPositiveSavings ? 'text-white' : 'text-amber-400'
          }`}>
            <span className="mr-1 text-xl font-normal">{summary.netSavings < 0 ? '-₹' : '₹'}</span>
            <span>{Math.abs(summary.netSavings).toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-slate-800/80">
          <span className={`inline-flex items-center font-medium px-2 py-0.5 rounded-md ${
            summary.savingsRate >= 30 
              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30' 
              : summary.savingsRate >= 10 
              ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-500/30' 
              : 'bg-amber-950/60 text-amber-300 border border-amber-500/30'
          }`}>
            {summary.savingsRate}% Savings Rate
          </span>
          <span className="text-slate-400 text-[11px]">
            {summary.transactionCount} Total
          </span>
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
