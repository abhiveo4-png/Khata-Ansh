import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Coins,
  ShieldCheck,
  PiggyBank,
  ArrowRight,
  Sparkles,
  Calculator,
  Calendar,
  Layers,
  CheckCircle2,
  DollarSign,
  PieChart as PieChartIcon,
  HelpCircle,
  Clock,
  Zap,
} from 'lucide-react';
import { Transaction, FinancialSummary } from '../types';
import { formatCurrency } from '../utils/formatters';

interface InvestableSurplusTrackerProps {
  summary: FinancialSummary;
  transactions: Transaction[];
}

export const InvestableSurplusTracker: React.FC<InvestableSurplusTrackerProps> = ({
  summary,
  transactions,
}) => {
  // Strategy selector for asset allocation of investable surplus
  const [allocationStrategy, setAllocationStrategy] = useState<'wealth' | 'balanced' | 'safe' | 'custom'>('balanced');
  const [customSipPct, setCustomSipPct] = useState<number>(50);
  const [customEmergencyPct, setCustomEmergencyPct] = useState<number>(30);
  const [customGoldFdPct, setCustomGoldFdPct] = useState<number>(20);

  // Simulation what-if expense
  const [simulatedExpense, setSimulatedExpense] = useState<number>(0);

  const totalIncome = summary.totalIncome;
  const totalExpense = summary.totalExpense;
  const investableSurplus = Math.max(0, totalIncome - totalExpense);
  const simulatedInvestableSurplus = Math.max(0, totalIncome - totalExpense - simulatedExpense);

  // Calculate day-by-day dynamic deductions from sorted transactions
  const chronologicalHistory = useMemo(() => {
    // Sort all transactions chronologically (oldest to newest)
    const sorted = [...transactions].sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time || '00:00'}`).getTime();
      const dateB = new Date(`${b.date}T${b.time || '00:00'}`).getTime();
      return dateA - dateB;
    });

    let runningIncome = 0;
    let runningExpense = 0;
    const history: Array<{
      id: string;
      date: string;
      type: 'income' | 'expense';
      amount: number;
      category: string;
      description: string;
      runningIncome: number;
      runningExpense: number;
      investableBalance: number;
    }> = [];

    sorted.forEach((tx) => {
      if (tx.type === 'income') {
        runningIncome += tx.amount;
      } else {
        runningExpense += tx.amount;
      }
      history.push({
        id: tx.id,
        date: tx.date,
        type: tx.type,
        amount: tx.amount,
        category: tx.category || 'General',
        description: tx.description || tx.category || '',
        runningIncome,
        runningExpense,
        investableBalance: Math.max(0, runningIncome - runningExpense),
      });
    });

    // Return the latest 8 events in reverse chronological order for the display ledger
    return history.reverse().slice(0, 8);
  }, [transactions]);

  // Allocation proportions
  const allocationBreakdown = useMemo(() => {
    let sipPct = 50;
    let emergencyPct = 30;
    let goldFdPct = 20;

    if (allocationStrategy === 'wealth') {
      sipPct = 65;
      emergencyPct = 20;
      goldFdPct = 15;
    } else if (allocationStrategy === 'safe') {
      sipPct = 25;
      emergencyPct = 45;
      goldFdPct = 30;
    } else if (allocationStrategy === 'custom') {
      sipPct = customSipPct;
      emergencyPct = customEmergencyPct;
      goldFdPct = customGoldFdPct;
    }

    const sipAmt = Math.round((investableSurplus * sipPct) / 100);
    const emergencyAmt = Math.round((investableSurplus * emergencyPct) / 100);
    const goldFdAmt = Math.max(0, investableSurplus - sipAmt - emergencyAmt);

    return {
      sipPct,
      emergencyPct,
      goldFdPct,
      sipAmt,
      emergencyAmt,
      goldFdAmt,
    };
  }, [allocationStrategy, investableSurplus, customSipPct, customEmergencyPct, customGoldFdPct]);

  return (
    <div className="bg-[#0b1222] border border-cyan-500/30 rounded-2xl p-5 sm:p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl relative overflow-hidden">
      {/* Background Subtle Accent Glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-cyan-500/10 via-indigo-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Title & Concept Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-5 border-b border-slate-800 relative z-10">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-950/90 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shadow-md shadow-cyan-950/50">
              <Coins className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-base sm:text-lg text-white font-display flex items-center gap-2">
              REAL-TIME INVESTABLE SURPLUS
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                LIVE POOL
              </span>
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Har kharche ke baad bacha hua amount automatically Investment balance me track hota hai.
          </p>
        </div>

        {/* Live Calculation Formula Pill */}
        <div className="px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] font-mono flex items-center space-x-2 text-slate-300">
          <span className="text-emerald-400 font-bold">Income (₹{totalIncome.toLocaleString('en-IN')})</span>
          <span className="text-slate-500">-</span>
          <span className="text-rose-400 font-bold">Kharcha (₹{totalExpense.toLocaleString('en-IN')})</span>
          <span className="text-slate-500">=</span>
          <span className="text-cyan-400 font-bold bg-cyan-950/70 px-2 py-0.5 rounded-md border border-cyan-500/30">
            ₹{investableSurplus.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 relative z-10">
        {/* 1. Total Income Pool */}
        <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30">
          <div className="flex items-center justify-between text-xs text-emerald-400 font-medium">
            <span>Kul Income (Kamai)</span>
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-white mt-2">
            ₹{totalIncome.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] font-mono text-emerald-400/80 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Base capital for spending & investing</span>
          </div>
        </div>

        {/* 2. Kharcha Deductions */}
        <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30">
          <div className="flex items-center justify-between text-xs text-rose-400 font-medium">
            <span>Kul Kharcha (Deducted)</span>
            <TrendingDown className="w-4 h-4" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-white mt-2">
            -₹{totalExpense.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] font-mono text-rose-400/80 mt-1 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>{transactions.filter(t => t.type === 'expense').length} kharche deduct huye</span>
          </div>
        </div>

        {/* 3. Real-Time Investable Balance */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-950/60 to-indigo-950/60 border-2 border-cyan-500/50 shadow-lg shadow-cyan-950/40">
          <div className="flex items-center justify-between text-xs text-cyan-300 font-semibold">
            <span>Current Investable Pool</span>
            <PiggyBank className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-cyan-300 mt-2">
            ₹{investableSurplus.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] font-mono text-cyan-400/90 mt-1 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>{totalIncome > 0 ? `${Math.round((investableSurplus / totalIncome) * 100)}% of Income Ready to Invest` : 'No Income recorded'}</span>
          </div>
        </div>
      </div>

      {/* Chronological Daily Kharcha Impact Breakdown (User's Example: 80k -> 2k kharch -> 78k -> 500 kharch -> 77.5k) */}
      <div className="mt-6 pt-5 border-t border-slate-800 relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <h3 className="text-xs font-bold font-display uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Live Kharcha Impact & Investment Timeline
          </h3>
          <span className="text-[11px] font-mono text-slate-400">
            Recent activity ka Investment balance par live asar
          </span>
        </div>

        {chronologicalHistory.length > 0 ? (
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl divide-y divide-slate-800/80 overflow-hidden">
            {chronologicalHistory.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-900/40 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                      item.type === 'income'
                        ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-950/60 border-rose-500/30 text-rose-400'
                    }`}
                  >
                    {item.type === 'income' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-white">
                        {item.description || item.category}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-sm bg-slate-900 border border-slate-800 text-slate-400">
                        {item.category}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      {item.date}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end sm:space-x-6 text-xs font-mono">
                  <div className="text-right">
                    <span
                      className={`font-bold ${
                        item.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {item.type === 'income' ? '+' : '-'}₹{item.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5 pl-3 sm:border-l sm:border-slate-800">
                    <span className="text-slate-400 text-[10px]">Investable:</span>
                    <span className="font-bold text-cyan-300">
                      ₹{item.investableBalance.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center bg-slate-950/40 rounded-xl border border-slate-800">
            <p className="text-xs font-mono text-slate-400">
              Transactions record hone par yahan step-by-step investment balance impact show hoga.
            </p>
          </div>
        )}
      </div>

      {/* Suggested Auto-Allocation Portfolio Grid (SIP, Emergency, Gold/FD) */}
      <div className="mt-6 pt-5 border-t border-slate-800 relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-xs font-bold font-display uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-indigo-400" />
              Smart Investment Allocation (₹{investableSurplus.toLocaleString('en-IN')} Pool)
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Bache huye amount ko in high-return aur safe options me invest karein.
            </p>
          </div>

          <div className="flex items-center space-x-1 bg-slate-950/80 p-1 border border-slate-800 rounded-xl text-xs font-mono">
            <button
              onClick={() => setAllocationStrategy('balanced')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                allocationStrategy === 'balanced'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Balanced (50:30:20)
            </button>
            <button
              onClick={() => setAllocationStrategy('wealth')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                allocationStrategy === 'wealth'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Growth (65:20:15)
            </button>
            <button
              onClick={() => setAllocationStrategy('safe')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                allocationStrategy === 'safe'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Conservative
            </button>
          </div>
        </div>

        {/* 3 Allocation Buckets */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Bucket 1: SIP & Mutual Funds */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/20">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                SIP & Equity ({allocationBreakdown.sipPct}%)
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-cyan-950 border border-cyan-500/30 text-cyan-300">
                High Return
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-white mt-2">
              ₹{allocationBreakdown.sipAmt.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Index Funds, Large Cap SIP, Nifty 50
            </p>
          </div>

          {/* Bucket 2: Emergency & Liquid Fund */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-indigo-500/20">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-indigo-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Emergency Reserve ({allocationBreakdown.emergencyPct}%)
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-indigo-950 border border-indigo-500/30 text-indigo-300">
                Liquid / Safe
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-white mt-2">
              ₹{allocationBreakdown.emergencyAmt.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Liquid Mutual Fund, High-interest Savings
            </p>
          </div>

          {/* Bucket 3: Gold / FD / PPF */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-500/20">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-400 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5" />
                Gold / Fixed Deposit ({allocationBreakdown.goldFdPct}%)
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-amber-950 border border-amber-500/30 text-amber-300">
                Guaranteed
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-white mt-2">
              ₹{allocationBreakdown.goldFdAmt.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Digital Gold, SGB, Bank FD, PPF
            </p>
          </div>
        </div>
      </div>

      {/* Interactive "What-If" Spending Impact Simulator */}
      <div className="mt-6 pt-5 border-t border-slate-800 relative z-10 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Calculator className="w-4 h-4 text-cyan-400" />
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                What-If Kharcha Simulator (Aage ka kharcha test karein)
              </h4>
              <p className="text-[11px] text-slate-400">
                Check karein agar aap aane wale dino me kuch kharcha karte hain to investment balance kitna bachega.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-slate-400">Naya Kharcha: ₹</span>
            <input
              type="number"
              min="0"
              step="500"
              value={simulatedExpense || ''}
              placeholder="e.g. 1500"
              onChange={(e) => setSimulatedExpense(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-28 px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white font-bold focus:outline-hidden focus:border-cyan-500"
            />
          </div>
        </div>

        {simulatedExpense > 0 && (
          <div className="mt-3 p-3 bg-cyan-950/40 border border-cyan-500/30 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs font-mono">
            <div className="text-slate-300">
              Agar <span className="text-rose-400 font-bold">₹{simulatedExpense.toLocaleString('en-IN')}</span> aur kharch hoga:
            </div>
            <div className="text-cyan-300 font-bold">
              Bacha hua Investment Balance: <span className="text-white bg-cyan-500/20 px-2 py-0.5 rounded border border-cyan-500/40">₹{simulatedInvestableSurplus.toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
