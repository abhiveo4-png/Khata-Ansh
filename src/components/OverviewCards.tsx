import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  PieChart, 
  ArrowUpRight, 
  ArrowDownRight,
  ShieldCheck,
  Zap,
  Activity,
  Gauge
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
      
      {/* 1. Total Income (Cyber Emerald Glow) */}
      <div className="relative group bg-[#0c1222]/80 backdrop-blur-xl rounded-2xl border border-emerald-500/20 hover:border-emerald-500/50 p-4 sm:p-5 shadow-lg shadow-black/40 transition-all duration-300 overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/10 transition-all" />
        <div className="absolute top-0 left-0 w-8 h-[2px] bg-emerald-400" />
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-400">
              TOTAL INFLOW
            </span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-inner">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3.5">
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight flex items-baseline">
            <span className="text-emerald-400 mr-1 text-xl">₹</span>
            <span>{summary.totalIncome.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-emerald-500/10">
          <span className="inline-flex items-center text-emerald-400 font-mono text-[11px] font-semibold">
            <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
            {summary.incomeCount} CREDITS
          </span>
          <span className="text-slate-400 text-[11px] font-mono">SALARY / REVENUE</span>
        </div>
      </div>

      {/* 2. Total Expense (Cyber Rose Glow) */}
      <div className="relative group bg-[#0c1222]/80 backdrop-blur-xl rounded-2xl border border-rose-500/20 hover:border-rose-500/50 p-4 sm:p-5 shadow-lg shadow-black/40 transition-all duration-300 overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-rose-500/10 transition-all" />
        <div className="absolute top-0 left-0 w-8 h-[2px] bg-rose-400" />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-rose-400">
              TOTAL OUTFLOW
            </span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-400 flex items-center justify-center shadow-inner">
            <TrendingDown className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3.5">
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight flex items-baseline">
            <span className="text-rose-400 mr-1 text-xl">₹</span>
            <span>{summary.totalExpense.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-rose-500/10">
          <span className="inline-flex items-center text-rose-400 font-mono text-[11px] font-semibold">
            <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
            {summary.expenseCount} DEBITS
          </span>
          <span className="text-slate-400 text-[11px] font-mono">BILLS & DAILY</span>
        </div>
      </div>

      {/* 3. Net Savings / Treasury (Cyber Indigo/Cyan Glow) */}
      <div className="relative group bg-[#0c1222]/80 backdrop-blur-xl rounded-2xl border border-cyan-500/25 hover:border-cyan-400/60 p-4 sm:p-5 shadow-lg shadow-black/40 transition-all duration-300 overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/10 transition-all" />
        <div className="absolute top-0 left-0 w-8 h-[2px] bg-cyan-400" />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-cyan-400">
              NET TREASURY
            </span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shadow-inner">
            <Wallet className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3.5">
          <div className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight flex items-baseline ${
            isPositiveSavings ? 'text-cyan-300' : 'text-amber-400'
          }`}>
            <span className="mr-1 text-xl">{summary.netSavings < 0 ? '-₹' : '₹'}</span>
            <span>{Math.abs(summary.netSavings).toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-cyan-500/10">
          <span className={`inline-flex items-center font-mono text-[11px] font-bold px-2 py-0.5 rounded-md border ${
            summary.savingsRate >= 30 
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40' 
              : summary.savingsRate >= 10 
              ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40' 
              : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
          }`}>
            {summary.savingsRate}% SAVED
          </span>
          <span className="text-slate-400 text-[11px] font-mono">RETAINED RATIO</span>
        </div>
      </div>

      {/* 4. Cyber Budget Velocity Gauge */}
      <div className="relative group bg-[#0c1222]/80 backdrop-blur-xl rounded-2xl border border-indigo-500/25 hover:border-indigo-400/60 p-4 sm:p-5 shadow-lg shadow-black/40 transition-all duration-300 overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/10 transition-all" />
        <div className="absolute top-0 left-0 w-8 h-[2px] bg-indigo-400" />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-indigo-400">
              BUDGET VELOCITY
            </span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-indigo-950/60 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shadow-inner">
            <Gauge className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3.5 flex items-baseline justify-between">
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight">
            {budgetPercentage}%
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            CAP: {formatCurrency(summary.monthlyBudget)}
          </span>
        </div>

        <div className="mt-3 pt-2.5 border-t border-indigo-500/10">
          <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800 p-[1px]">
            <div 
              className={`h-full rounded-full transition-all duration-700 ${
                budgetPercentage > 90 
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500 shadow-sm shadow-rose-500/50' 
                  : budgetPercentage > 70 
                  ? 'bg-gradient-to-r from-cyan-500 to-amber-500 shadow-sm shadow-amber-500/50' 
                  : 'bg-gradient-to-r from-emerald-500 to-cyan-400 shadow-sm shadow-cyan-500/50'
              }`}
              style={{ width: `${Math.min(100, budgetPercentage)}%` }}
            />
          </div>
        </div>
      </div>

    </div>
  );
};
