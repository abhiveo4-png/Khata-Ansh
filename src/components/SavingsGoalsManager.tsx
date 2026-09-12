import React, { useState, useEffect, useMemo } from 'react';
import { 
  PiggyBank, 
  Plus, 
  Target, 
  Sparkles, 
  Trash2, 
  Coins, 
  Trophy, 
  ArrowUpRight, 
  Check, 
  Calendar,
  Flame
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { SavingsGoal } from '../types';
import { safeFetchJson } from '../utils/api';

interface SavingsGoalsManagerProps {
  onRefreshSummary?: () => void;
}

export const SavingsGoalsManager: React.FC<SavingsGoalsManagerProps> = ({ onRefreshSummary }) => {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [contributeGoalId, setContributeGoalId] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [initialAmount, setInitialAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [category, setCategory] = useState('Gadget');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchGoals = async () => {
    setLoading(true);
    try {
      const { data } = await safeFetchJson<{ goals?: SavingsGoal[] }>('/api/goals');
      if (data?.goals) {
        setGoals(data.goals);
      }
    } catch (e) {
      console.error('Failed to fetch goals', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  const totalSaved = useMemo(() => {
    return goals.reduce((acc, g) => acc + (g.currentAmount || 0), 0);
  }, [goals]);

  const totalTarget = useMemo(() => {
    return goals.reduce((acc, g) => acc + (g.targetAmount || 0), 0);
  }, [goals]);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const numTarget = parseFloat(targetAmount.trim());
    const numInitial = parseFloat(initialAmount.trim()) || 0;

    if (!title.trim() || isNaN(numTarget) || numTarget <= 0) {
      showToast('Kripya sahi goal title aur target amount dalein', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await safeFetchJson<{ success?: boolean; goals?: SavingsGoal[] }>('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          targetAmount: numTarget,
          currentAmount: numInitial,
          deadline: deadline || undefined,
          category,
        }),
      });

      if (error || !data?.success) {
        showToast(error || 'Goal create karne me error aaya', 'error');
      } else {
        if (data.goals) setGoals(data.goals);
        setIsAddModalOpen(false);
        setTitle('');
        setTargetAmount('');
        setInitialAmount('');
        setDeadline('');
        showToast(`🎯 Naya goal "${title}" save ho gaya!`);
        if (onRefreshSummary) onRefreshSummary();
      }
    } catch (err: any) {
      showToast(err.message || 'Error occurred', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contributeGoalId) return;
    const numAdd = parseFloat(contributeAmount.trim());
    if (isNaN(numAdd) || numAdd === 0) {
      showToast('Kripya valid amount dalein', 'error');
      return;
    }

    try {
      const { data, error } = await safeFetchJson<{ success?: boolean; goals?: SavingsGoal[]; reached?: boolean }>(
        `/api/goals/${contributeGoalId}/contribute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: numAdd }),
        }
      );

      if (error || !data?.success) {
        showToast(error || 'Deposit failed', 'error');
      } else {
        if (data.goals) setGoals(data.goals);
        if (data.reached) {
          try {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
          } catch {}
          showToast('🎉 BADHAAI HO! Aapka Savings Goal complete ho gaya! 🏆');
        } else {
          showToast(`💰 ₹${Math.abs(numAdd).toLocaleString('en-IN')} Gullak me jama ho gaye!`);
        }
        setContributeGoalId(null);
        setContributeAmount('');
        if (onRefreshSummary) onRefreshSummary();
      }
    } catch (err: any) {
      showToast(err.message || 'Error', 'error');
    }
  };

  const handleDeleteGoal = async (id: string, goalTitle: string) => {
    if (!window.confirm(`Kya aap "${goalTitle}" goal ko delete karna chahte hain?`)) return;

    try {
      const { data, error } = await safeFetchJson<{ success?: boolean; goals?: SavingsGoal[] }>(`/api/goals/${id}`, {
        method: 'DELETE',
      });

      if (error || !data?.success) {
        showToast(error || 'Failed to delete goal', 'error');
      } else {
        if (data.goals) setGoals(data.goals);
        else setGoals((prev) => prev.filter((g) => g.id !== id));
        showToast(`🗑️ Goal delete ho gaya.`);
        if (onRefreshSummary) onRefreshSummary();
      }
    } catch (err: any) {
      showToast(err.message || 'Error', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-mono transition-all animate-in fade-in slide-in-from-top-2 duration-300 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-lg shadow-emerald-950/50'
              : 'bg-rose-950/90 border-rose-500/50 text-rose-200 shadow-lg shadow-rose-950/50'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold">{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-[#0c1222]/85 rounded-2xl border border-slate-800 backdrop-blur-xl p-5 sm:p-6 shadow-2xl shadow-black/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-950/80 border border-purple-500/40 text-purple-400 flex items-center justify-center">
                <PiggyBank className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-base sm:text-lg text-white font-display">
                SAVINGS GOALS & VIRTUAL GULLAK
              </h2>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300">
                {goals.length} ACTIVE TARGETS
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Naye phone, gadi ya emergency fund ke liye paise jama karein. Telegram par bhi likhein: <code className="text-cyan-300">500 gullak me dale</code> ya <code className="text-cyan-300">/goals</code>
            </p>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 text-xs font-mono font-bold flex items-center justify-center space-x-1.5 shadow-lg shadow-purple-950/50 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>NAYA GOAL BANAYEIN</span>
          </button>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-5">
          <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
              TOTAL GULLAK SAVINGS
            </span>
            <div className="text-xl sm:text-2xl font-bold font-mono text-purple-400 mt-1">
              ₹{totalSaved.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] font-mono text-purple-300/80 mt-1 block">Abhi tak jama kiye</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
              TOTAL TARGET AMOUNT
            </span>
            <div className="text-xl sm:text-2xl font-bold font-mono text-white mt-1">
              ₹{totalTarget.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] font-mono text-slate-400 mt-1 block">Saare goals ka target</span>
          </div>

          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
              OVERALL PROGRESS
            </span>
            <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-1">
              {totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0}%
            </div>
            <span className="text-[10px] font-mono text-emerald-400/80 mt-1 block">
              ₹{Math.max(0, totalTarget - totalSaved).toLocaleString('en-IN')} baki hai
            </span>
          </div>
        </div>
      </div>

      {/* Goals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {goals.map((g) => {
          const percent = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0;
          const isCompleted = g.currentAmount >= g.targetAmount;

          return (
            <div
              key={g.id}
              className={`p-4 rounded-2xl border transition-all duration-200 ${
                isCompleted
                  ? 'bg-emerald-950/20 border-emerald-500/50 shadow-lg shadow-emerald-950/30'
                  : 'bg-[#0c1222]/85 border-slate-800 hover:border-slate-700 shadow-lg shadow-black/40'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      isCompleted
                        ? 'bg-emerald-950 border-emerald-500/50 text-emerald-400'
                        : 'bg-purple-950/80 border-purple-500/40 text-purple-400'
                    }`}
                  >
                    {isCompleted ? <Trophy className="w-4 h-4 text-emerald-400" /> : <Target className="w-4 h-4" />}
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-white font-display truncate" title={g.title}>
                      {g.title}
                    </h3>
                    <span className="text-[9px] font-mono text-slate-400">
                      {g.category || 'Savings Target'}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0 font-mono">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      isCompleted
                        ? 'bg-emerald-950 border border-emerald-500 text-emerald-300'
                        : 'bg-purple-950 border border-purple-500/40 text-purple-300'
                    }`}
                  >
                    {percent}%
                  </span>
                </div>
              </div>

              {/* Amount Breakdown */}
              <div className="mt-4 flex items-baseline justify-between font-mono text-xs">
                <span className="text-slate-400">
                  JAMAA: <b className="text-white">₹{g.currentAmount.toLocaleString('en-IN')}</b>
                </span>
                <span className="text-slate-400">
                  TARGET: <b className="text-purple-300">₹{g.targetAmount.toLocaleString('en-IN')}</b>
                </span>
              </div>

              {/* Progress Bar */}
              <div className="mt-2 w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isCompleted ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-purple-400 shadow-sm shadow-purple-400'
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>

              {/* Actions */}
              <div className="mt-3.5 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setContributeGoalId(g.id);
                    setContributeAmount('');
                  }}
                  className="px-3 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-mono font-bold flex items-center space-x-1 transition-all cursor-pointer"
                >
                  <Coins className="w-3.5 h-3.5 text-purple-400" />
                  <span>+ Jama Karein</span>
                </button>

                <button
                  onClick={() => handleDeleteGoal(g.id, g.title)}
                  className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                  title="Delete goal"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {goals.length === 0 && !loading && (
        <div className="p-8 text-center bg-[#0c1222]/50 border border-slate-800 rounded-2xl">
          <p className="text-sm font-mono text-slate-400">Koi savings goal nahi banaya gaya hai. Naya goal jodein!</p>
        </div>
      )}

      {/* Deposit / Contribute Modal */}
      {contributeGoalId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c1222] border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white font-display flex items-center space-x-2">
              <Coins className="w-5 h-5 text-purple-400" />
              <span>Gullak Me Paise Jama Karein</span>
            </h3>

            <form onSubmit={handleContribute} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 500 ya 1000"
                  value={contributeAmount}
                  onChange={(e) => setContributeAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-sm focus:border-purple-500 outline-hidden"
                />
              </div>

              {/* Quick Add presets */}
              <div className="flex items-center space-x-1.5">
                {[500, 1000, 2000, 5000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setContributeAmount(String(amt))}
                    className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-purple-300 rounded-lg"
                  >
                    +₹{amt}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setContributeGoalId(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold shadow-lg"
                >
                  Jama Karein
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Goal Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c1222] border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white font-display flex items-center space-x-2">
              <Target className="w-5 h-5 text-purple-400" />
              <span>Naya Savings Target Banayein</span>
            </h3>

            <form onSubmit={handleCreateGoal} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  Goal Title (Kiske liye bachana hai) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. iPhone 16 / Goa Trip / New Bike"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-purple-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  Target Amount (Kitne rupaye chahiye) *
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 50000"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-sm focus:border-purple-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  Pehle se jama amount (Initial Savings)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 5000 (Optional)"
                  value={initialAmount}
                  onChange={(e) => setInitialAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-purple-500 outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold shadow-lg"
                >
                  {isSubmitting ? 'Saving...' : 'Goal Save Karein'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
