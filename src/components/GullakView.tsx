import React, { useState, useEffect } from 'react';
import { 
  PiggyBank, 
  TrendingUp, 
  Calendar, 
  Sparkles, 
  CheckCircle2, 
  ArrowUpRight, 
  FolderKanban, 
  RefreshCw, 
  HelpCircle,
  Coins,
  ShieldCheck,
  Zap,
  Layers
} from 'lucide-react';
import { GullakSummary } from '../types';

interface GullakViewProps {
  authToken: string | null;
}

export const GullakView: React.FC<GullakViewProps> = ({ authToken }) => {
  const [data, setData] = useState<GullakSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  const fetchGullakData = async () => {
    try {
      setLoading(true);
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const res = await fetch('/api/gullak', { headers });
      if (res.ok) {
        const json: GullakSummary = await res.json();
        setData(json);
        if (json.monthlyHistory && json.monthlyHistory.length > 0 && !selectedMonth) {
          setSelectedMonth(json.monthlyHistory[0].month);
        }
      }
    } catch (err) {
      console.error('Failed to fetch Gullak data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGullakData();
  }, [authToken]);

  if (loading && !data) {
    return (
      <div className="py-24 text-center space-y-4">
        <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mx-auto" />
        <p className="text-slate-400 text-sm">Gullak bachat hisab calculate ho raha hai...</p>
      </div>
    );
  }

  const currentMonthData = data?.monthlyHistory?.find(m => m.month === selectedMonth) || data?.monthlyHistory?.[0];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner & Overview */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 p-6 sm:p-8">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 shrink-0">
              <PiggyBank className="w-9 h-9" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Gullak (Bacha Hua Budget)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Auto Piggy Bank
                </span>
              </div>
              <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-xl">
                Monthly category budget se jitna paisa bach jata hai (jaise Room Rent 12,000 me se sirf 11,000 laga), wo bacha hua ₹1,000 automatically is Gullak me jama hota hai.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-stretch md:self-auto justify-end">
            <button
              onClick={fetchGullakData}
              className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-2 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 pt-6 border-t border-slate-800/80">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-amber-500/20">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Kul Gullak Bachat (Total Saved)</span>
              <Coins className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-amber-400 mt-2 font-mono">
              ₹{(data?.totalGullakSavings || 0).toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Sabhi mahino ka kul bacha hua surplus budget
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-emerald-500/20">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Is Mahine Ki Bachat</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-emerald-400 mt-2 font-mono">
              ₹{(data?.currentMonthSaved || 0).toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Active month ke category budget se bachi rashi
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-500/20">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Pichle Mahino Ka Bacha Fund</span>
              <Layers className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-cyan-300 mt-2 font-mono">
              ₹{(data?.pastMonthsSaved || 0).toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Past months se bacha hua cumulative fund
            </p>
          </div>
        </div>
      </div>

      {/* Month Selector Tabs */}
      {data?.monthlyHistory && data.monthlyHistory.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              Mahine Ka Category-Wise Bachat Hisaab
            </h3>

            {/* Month selector pill buttons */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {data.monthlyHistory.map((m) => (
                <button
                  key={m.month}
                  onClick={() => setSelectedMonth(m.month)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all shrink-0 cursor-pointer ${
                    (selectedMonth === m.month || (!selectedMonth && m === data.monthlyHistory[0]))
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                      : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {m.monthName} ({m.totalSaved > 0 ? `+₹${m.totalSaved.toLocaleString('en-IN')}` : '₹0'})
                </button>
              ))}
            </div>
          </div>

          {/* Detailed Selected Month Breakdown Card */}
          {currentMonthData && (
            <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h4 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>{currentMonthData.monthName}</span>
                    <span className="text-xs font-normal text-slate-400">
                      ({currentMonthData.month})
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Kul Set Budget: ₹{currentMonthData.totalBudget.toLocaleString('en-IN')} • Kharcha: ₹{currentMonthData.totalSpent.toLocaleString('en-IN')}
                  </p>
                </div>

                <div className="px-4 py-2 rounded-2xl bg-emerald-950/60 border border-emerald-500/30 text-right shrink-0">
                  <span className="text-[11px] text-emerald-400/90 font-medium block">
                    Gullak Me Jama (Saved)
                  </span>
                  <span className="text-xl font-bold font-mono text-emerald-300">
                    ₹{currentMonthData.totalSaved.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Category savings rows */}
              {currentMonthData.categories.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Is mahine koi category budget set nahi tha. Monthly Budgets tab me jakar category limit set karein!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentMonthData.categories.map((cat, idx) => {
                    const percentUsed = cat.budgetLimit > 0 ? Math.min(100, Math.round((cat.spent / cat.budgetLimit) * 100)) : 0;
                    const isFullySaved = cat.spent === 0 && cat.savedAmount > 0;
                    const isExceeded = cat.spent > cat.budgetLimit;

                    return (
                      <div
                        key={idx}
                        className={`p-4 rounded-2xl border transition-all ${
                          cat.savedAmount > 0
                            ? 'bg-slate-900/90 border-emerald-500/20 hover:border-emerald-500/40'
                            : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <FolderKanban className="w-4 h-4 text-indigo-400" />
                              <span className="font-semibold text-sm text-white">
                                {cat.category}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400">
                              Budget: <span className="text-slate-200">₹{cat.budgetLimit.toLocaleString('en-IN')}</span> | Kharcha: <span className="text-slate-200">₹{cat.spent.toLocaleString('en-IN')}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {cat.savedAmount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                +₹{cat.savedAmount.toLocaleString('en-IN')} bacha
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-xl border border-rose-500/20">
                                {isExceeded ? `Over ₹${(cat.spent - cat.budgetLimit).toLocaleString('en-IN')}` : 'Budget used'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-3 space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>Usage: {percentUsed}%</span>
                            <span>{cat.savedAmount > 0 ? `Bacha: ${100 - percentUsed}%` : '0% bacha'}</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                cat.savedAmount > 0 ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                              style={{ width: `${Math.min(100, percentUsed)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* All-time Category Breakdown & Bot Command Help */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* All-Time Category Savings Table */}
        <div className="lg:col-span-2 p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            All-Time Category Bachat Contribution
          </h3>
          <p className="text-xs text-slate-400">
            Kis category ke bache hue budget se Gullak me sabse zyada fund jama hua hai:
          </p>

          <div className="space-y-3 pt-2">
            {data?.categoryBreakdown && data.categoryBreakdown.length > 0 ? (
              data.categoryBreakdown.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: item.color || '#6366F1' }}
                    >
                      {item.category.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">{item.category}</div>
                      <div className="text-[11px] text-slate-400">
                        Is mahine bacha: ₹{item.currentMonthSaved.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <span className="text-sm font-bold text-amber-400">
                      ₹{item.totalSaved.toLocaleString('en-IN')}
                    </span>
                    <span className="block text-[10px] text-slate-400">Kul Bachat</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-slate-400 text-xs">
                Abhi tak koi category budget set nahi hai.
              </div>
            )}
          </div>
        </div>

        {/* Telegram Bot & Auto-Savings Guide */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 space-y-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-400" />
            Telegram Bot Se Gullak Check Karein
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Aap aur aapke linked family members Telegram bot me bhi Gullak ka hisaab dekh sakte hain.
          </p>

          <div className="space-y-2.5 pt-2">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
              <div className="font-mono text-amber-300 font-semibold">/gullak</div>
              <div className="text-slate-400 text-[11px] mt-0.5">
                Current month aur all-time bacha hua budget report dekhein.
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
              <div className="font-mono text-indigo-300 font-semibold">🐷 Gullak Button</div>
              <div className="text-slate-400 text-[11px] mt-0.5">
                Telegram ke main keyboard par ek click me Gullak open karein.
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
              <div className="font-mono text-emerald-300 font-semibold">/budget</div>
              <div className="text-slate-400 text-[11px] mt-0.5">
                Har category ki current spending aur remaining limit dekhein.
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Real-time sync: Naya kharcha add hote hi Gullak balance auto-update hota hai.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
