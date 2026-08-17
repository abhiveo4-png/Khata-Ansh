import React, { useState } from 'react';
import { Target, Edit2, Check, AlertCircle, TrendingUp, Sparkles, ShieldAlert, Cpu } from 'lucide-react';
import { CategoryBudget, Transaction } from '../types';
import { formatCurrency } from '../utils/formatters';

interface BudgetManagerProps {
  budgets: CategoryBudget[];
  transactions: Transaction[];
  onUpdateBudgets: (newBudgets: CategoryBudget[]) => Promise<void>;
}

export const BudgetManager: React.FC<BudgetManagerProps> = ({
  budgets,
  transactions,
  onUpdateBudgets,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedBudgets, setEditedBudgets] = useState<CategoryBudget[]>(budgets);
  const [isSaving, setIsSaving] = useState(false);

  // Calculate spent per category
  const spentMap: Record<string, number> = {};
  transactions.forEach((tx) => {
    if (tx.type === 'expense') {
      spentMap[tx.category] = (spentMap[tx.category] || 0) + tx.amount;
    }
  });

  const handleLimitChange = (category: string, newLimit: number) => {
    setEditedBudgets((prev) =>
      prev.map((b) => (b.category === category ? { ...b, limit: Math.max(0, newLimit) } : b))
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateBudgets(editedBudgets);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save budgets', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-[#0c1222]/85 rounded-2xl border border-slate-800 backdrop-blur-xl p-5 sm:p-6 shadow-2xl shadow-black/50">
      
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-base text-white font-display">CATEGORY BUDGET LIMITS</h3>
          </div>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Har category ke kharche ki limit set karein aur overspend hone se bachein
          </p>
        </div>

        <div>
          {isEditing ? (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  setEditedBudgets(budgets);
                  setIsEditing(false);
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-mono text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-mono font-bold flex items-center space-x-1 shadow-md shadow-cyan-950/50 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>SAVE KAREIN</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setEditedBudgets(budgets);
                setIsEditing(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-300 flex items-center space-x-1.5 cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>BUDGET BADLEIN</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid of Category Budgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {(isEditing ? editedBudgets : budgets).map((b) => {
          const spent = spentMap[b.category] || 0;
          const limit = b.limit;
          const percent = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
          const isOver = spent > limit && limit > 0;

          return (
            <div
              key={b.category}
              className={`p-4 rounded-xl border transition-all ${
                isOver
                  ? 'bg-rose-950/20 border-rose-500/50 shadow-md shadow-rose-950/30'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white font-display truncate">
                  {b.category}
                </span>
                {isOver && (
                  <span className="px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-500/40 text-rose-300 text-[10px] font-mono font-bold flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    LIMIT EXCEEDED
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-baseline justify-between font-mono">
                <div className="text-xs text-slate-400">
                  KHARCHA: <span className="text-white font-bold">₹{spent.toLocaleString('en-IN')}</span>
                </div>
                {isEditing ? (
                  <div className="flex items-center space-x-1">
                    <span className="text-xs text-cyan-400">LIMIT: ₹</span>
                    <input
                      type="number"
                      value={b.limit}
                      onChange={(e) => handleLimitChange(b.category, parseInt(e.target.value) || 0)}
                      className="w-20 px-2 py-1 bg-slate-950 border border-cyan-500/40 rounded-lg text-xs font-mono font-bold text-cyan-300 focus:outline-hidden"
                    />
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">
                    LIMIT: <span className="text-cyan-400 font-bold">₹{limit.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>

              {/* Laser Progress Bar */}
              <div className="mt-3">
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isOver
                        ? 'bg-rose-500 shadow-sm shadow-rose-500'
                        : percent > 80
                        ? 'bg-amber-400 shadow-sm shadow-amber-400'
                        : 'bg-cyan-400 shadow-sm shadow-cyan-400'
                    }`}
                    style={{ width: `${Math.min(100, percent)}%` }}
                  />
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>{percent}% KHARCH HUWA</span>
                <span>
                  {limit > spent ? `₹${(limit - spent).toLocaleString('en-IN')} BACHA HAI` : `₹${(spent - limit).toLocaleString('en-IN')} EXTRA KHARCH`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
