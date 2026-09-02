import React, { useState, useEffect, useMemo } from 'react';
import {
  Target,
  Edit2,
  Check,
  AlertCircle,
  TrendingUp,
  ShieldAlert,
  FileSpreadsheet,
  Search,
  Plus,
  Trash2,
  Utensils,
  ShoppingCart,
  Car,
  Zap,
  ShoppingBag,
  Home,
  Film,
  HeartPulse,
  GraduationCap,
  Briefcase,
  Laptop,
  Coins,
  BadgePercent,
  Gift,
  Wallet,
  Tag,
  HelpCircle,
  Filter,
} from 'lucide-react';
import { CategoryBudget, Transaction, CategoryDef } from '../types';
import { formatCurrency } from '../utils/formatters';
import { safeFetchJson } from '../utils/api';
import { ExcelBudgetImportModal } from './ExcelBudgetImportModal';

const ICON_MAP: Record<string, React.ElementType> = {
  Utensils,
  ShoppingCart,
  Car,
  Zap,
  ShoppingBag,
  Home,
  Film,
  HeartPulse,
  TrendingUp,
  GraduationCap,
  Briefcase,
  Laptop,
  Coins,
  BadgePercent,
  Gift,
  Wallet,
  Tag,
  HelpCircle,
};

interface BudgetManagerProps {
  budgets: CategoryBudget[];
  transactions: Transaction[];
  categories: CategoryDef[];
  onUpdateBudgets: (newBudgets: CategoryBudget[]) => Promise<void>;
  onCategoriesUpdated?: (newCategories: CategoryDef[], newBudgets?: CategoryBudget[]) => void;
  onRefreshTransactions?: () => void;
}

export const BudgetManager: React.FC<BudgetManagerProps> = ({
  budgets,
  transactions,
  categories,
  onUpdateBudgets,
  onCategoriesUpdated,
  onRefreshTransactions,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedBudgets, setEditedBudgets] = useState<CategoryBudget[]>(budgets);
  const [isSaving, setIsSaving] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'exceeded' | 'warning' | 'safe' | 'unallocated'>('all');
  const [deletingCatName, setDeletingCatName] = useState<string | null>(null);

  // Keep editedBudgets synchronized when prop updates
  useEffect(() => {
    // Process only active categories so old removed categories don't linger
    const unified: CategoryBudget[] = [];

    categories.forEach((cat) => {
      const catName = cat.name;
      const existing = budgets.find((b) => b.category.toLowerCase() === catName.toLowerCase());
      unified.push({
        category: catName,
        limit: existing ? existing.limit : 0,
        spent: existing ? existing.spent : 0,
        period: 'monthly',
      });
    });

    setEditedBudgets(unified);
  }, [budgets, categories]);

  // Calculate spent per category from current month transactions
  const spentMap: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach((tx) => {
      if (tx.type === 'expense') {
        const catName = tx.category || 'Uncategorized';
        map[catName.toLowerCase()] = (map[catName.toLowerCase()] || 0) + tx.amount;
      }
    });
    return map;
  }, [transactions]);

  // Master list of displayed budget items synced with categories
  const displayBudgets = useMemo(() => {
    const sourceList = isEditing ? editedBudgets : budgets;

    // Guarantee that only currently defined categories appear in the list
    const merged: Array<{
      category: string;
      limit: number;
      spent: number;
      categoryDef?: CategoryDef;
    }> = [];

    categories.forEach((cat) => {
      const budgetEntry = sourceList.find((b) => b.category.toLowerCase() === cat.name.toLowerCase());
      const spent = spentMap[cat.name.toLowerCase()] || 0;
      merged.push({
        category: cat.name,
        limit: budgetEntry ? budgetEntry.limit : 0,
        spent,
        categoryDef: cat,
      });
    });

    return merged;
  }, [categories, budgets, editedBudgets, isEditing, spentMap]);

  // Filtered list based on search and status
  const filteredBudgets = useMemo(() => {
    return displayBudgets.filter((item) => {
      // Search check
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.category.toLowerCase().includes(q);
        const matchesKeywords = item.categoryDef?.keywords?.some((k) => k.toLowerCase().includes(q));
        if (!matchesName && !matchesKeywords) return false;
      }

      // Status filter check
      const spent = item.spent;
      const limit = item.limit;
      const isOver = limit > 0 && spent > limit;
      const percent = limit > 0 ? (spent / limit) * 100 : 0;

      if (statusFilter === 'exceeded') return isOver;
      if (statusFilter === 'warning') return limit > 0 && percent >= 80 && !isOver;
      if (statusFilter === 'safe') return limit > 0 && percent < 80;
      if (statusFilter === 'unallocated') return limit === 0;

      return true;
    });
  }, [displayBudgets, searchQuery, statusFilter]);

  // Summary statistics
  const totalBudgetLimit = useMemo(() => {
    return displayBudgets.reduce((acc, b) => acc + (b.limit || 0), 0);
  }, [displayBudgets]);

  const totalSpent = useMemo(() => {
    return displayBudgets.reduce((acc, b) => acc + (b.spent || 0), 0);
  }, [displayBudgets]);

  const exceededCount = useMemo(() => {
    return displayBudgets.filter((b) => b.limit > 0 && b.spent > b.limit).length;
  }, [displayBudgets]);

  const handleLimitChange = (categoryName: string, newLimit: number) => {
    const val = Math.max(0, newLimit);
    setEditedBudgets((prev) => {
      const exists = prev.some((b) => b.category.toLowerCase() === categoryName.toLowerCase());
      if (exists) {
        return prev.map((b) =>
          b.category.toLowerCase() === categoryName.toLowerCase() ? { ...b, limit: val } : b
        );
      }
      return [...prev, { category: categoryName, limit: val, spent: 0, period: 'monthly' }];
    });
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

  const handleExcelImportSuccess = (newCats: CategoryDef[], newBudge: CategoryBudget[]) => {
    if (onCategoriesUpdated) {
      onCategoriesUpdated(newCats, newBudge);
    }
    onUpdateBudgets(newBudge);
  };

  const handleDeleteCategory = async (categoryName: string, categoryId?: string) => {
    if (categoryName.toLowerCase() === 'uncategorized') {
      alert('Uncategorized fallback category ko delete nahi kiya ja sakta.');
      return;
    }

    const confirmMsg = `Kya aap "${categoryName}" category ko delete karna chahte hain?\n\nIs category ka budget aur category list se record hat jayega. Purane transactions 'Uncategorized' me move ho jayenge.`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingCatName(categoryName);
    try {
      const targetId = categoryId || categoryName;
      const { data, error } = await safeFetchJson<{
        success: boolean;
        categories: CategoryDef[];
        budgets: CategoryBudget[];
      }>(`/api/categories/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      });

      if (error || !data?.success) {
        alert(error || 'Category delete karne me error aaya.');
        return;
      }

      // Update local and parent states
      const updatedCats = data.categories || categories.filter(c => c.name.toLowerCase() !== categoryName.toLowerCase());
      const updatedBudgets = data.budgets || budgets.filter(b => b.category.toLowerCase() !== categoryName.toLowerCase());

      setEditedBudgets((prev) => prev.filter(b => b.category.toLowerCase() !== categoryName.toLowerCase()));

      if (onCategoriesUpdated) {
        onCategoriesUpdated(updatedCats, updatedBudgets);
      }
      if (onRefreshTransactions) {
        onRefreshTransactions();
      }
    } catch (err: any) {
      console.error('Delete category error', err);
      alert('Failed to delete category: ' + err.message);
    } finally {
      setDeletingCatName(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Budget Controls */}
      <div className="bg-[#0c1222]/85 rounded-2xl border border-slate-800 backdrop-blur-xl p-5 sm:p-6 shadow-2xl shadow-black/50">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 flex items-center justify-center">
                <Target className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-base sm:text-lg text-white font-display">
                MONTHLY BUDGET & ALLOCATION
              </h2>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
                {displayBudgets.length} CATEGORIES
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Har category ke liye monthly kharcha limit set karein. Categories tab ke sath 100% sync hai.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Excel Import Button */}
            <button
              onClick={() => setIsExcelModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/40 text-xs font-mono font-semibold text-emerald-300 flex items-center space-x-1.5 shadow-md shadow-emerald-950/30 transition-all cursor-pointer"
              title="Excel template se categories aur budget auto allocate karein"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>EXCEL SE ALLOCATE KAREIN</span>
            </button>

            {isEditing ? (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setEditedBudgets(budgets);
                    setIsEditing(false);
                  }}
                  className="px-3.5 py-2 rounded-xl border border-slate-700 text-xs font-mono text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-mono font-bold flex items-center space-x-1.5 shadow-lg shadow-cyan-950/50 transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{isSaving ? 'SAVING...' : 'SAVE BUDGETS'}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setEditedBudgets(budgets);
                  setIsEditing(true);
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-300 flex items-center space-x-1.5 transition-all cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>LIMITS EDIT KAREIN</span>
              </button>
            )}
          </div>
        </div>

        {/* Financial Highlights Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-1">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
              TOTAL MONTHLY BUDGET
            </span>
            <div className="text-base sm:text-lg font-bold font-mono text-cyan-400 mt-0.5">
              ₹{totalBudgetLimit.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
              CURRENT MONTH SPENT
            </span>
            <div className="text-base sm:text-lg font-bold font-mono text-rose-400 mt-0.5">
              ₹{totalSpent.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
              REMAINING BUDGET
            </span>
            <div
              className={`text-base sm:text-lg font-bold font-mono mt-0.5 ${
                totalBudgetLimit - totalSpent >= 0 ? 'text-emerald-400' : 'text-rose-500'
              }`}
            >
              ₹{Math.max(0, totalBudgetLimit - totalSpent).toLocaleString('en-IN')}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
              BUDGET HEALTH
            </span>
            <div className="text-xs sm:text-sm font-bold font-mono text-slate-200 mt-1 flex items-center gap-1.5">
              {exceededCount > 0 ? (
                <span className="text-rose-400 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  {exceededCount} Over Limit
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  All Under Control
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Category search karein..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-mono text-white placeholder:text-slate-400 focus:outline-hidden focus:border-cyan-500/50"
            />
          </div>

          <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all shrink-0 cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-cyan-500/20 border border-cyan-500/60 text-cyan-300'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({displayBudgets.length})
            </button>
            <button
              onClick={() => setStatusFilter('exceeded')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all shrink-0 cursor-pointer ${
                statusFilter === 'exceeded'
                  ? 'bg-rose-500/20 border border-rose-500/60 text-rose-300'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Over Limit ({displayBudgets.filter((b) => b.limit > 0 && b.spent > b.limit).length})
            </button>
            <button
              onClick={() => setStatusFilter('warning')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all shrink-0 cursor-pointer ${
                statusFilter === 'warning'
                  ? 'bg-amber-500/20 border border-amber-500/60 text-amber-300'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              &gt;80% Used ({displayBudgets.filter((b) => b.limit > 0 && b.spent <= b.limit && (b.spent / b.limit) >= 0.8).length})
            </button>
            <button
              onClick={() => setStatusFilter('unallocated')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all shrink-0 cursor-pointer ${
                statusFilter === 'unallocated'
                  ? 'bg-slate-700/50 border border-slate-500 text-slate-200'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              No Limit (₹0) ({displayBudgets.filter((b) => b.limit === 0).length})
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Category Budgets (Showing ALL categories from Categories tab) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBudgets.map((b) => {
          const spent = b.spent;
          const limit = b.limit;
          const percent = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
          const isOver = spent > limit && limit > 0;
          const isNear = limit > 0 && percent >= 80 && !isOver;

          // Icon and Color styling
          const iconName = b.categoryDef?.icon || 'Tag';
          const IconComp = ICON_MAP[iconName] || Tag;
          const catColor = b.categoryDef?.color || '#06B6D4';

          return (
            <div
              key={b.category}
              className={`p-4 rounded-2xl border transition-all duration-200 ${
                isOver
                  ? 'bg-rose-950/20 border-rose-500/40 shadow-lg shadow-rose-950/20'
                  : isNear
                  ? 'bg-amber-950/15 border-amber-500/40 shadow-md shadow-amber-950/20'
                  : 'bg-[#0c1222]/85 border-slate-800 hover:border-slate-700 shadow-lg shadow-black/40'
              }`}
            >
              {/* Category Header with Icon & Type */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: `${catColor}15`,
                      borderColor: `${catColor}40`,
                      color: catColor,
                    }}
                  >
                    <IconComp className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-white font-display truncate" title={b.category}>
                      {b.category}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {b.categoryDef?.isCustom && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-sm bg-indigo-950/70 border border-indigo-500/30 text-indigo-300">
                          CUSTOM
                        </span>
                      )}
                      <span className="text-[9px] font-mono text-slate-400 capitalize">
                        {b.categoryDef?.type || 'expense'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 shrink-0">
                  {isOver ? (
                    <span className="px-2 py-0.5 rounded-md bg-rose-950/90 border border-rose-500/50 text-rose-300 text-[10px] font-mono font-bold flex items-center gap-1 shrink-0">
                      <ShieldAlert className="w-3 h-3 text-rose-400" />
                      EXCEEDED
                    </span>
                  ) : isNear ? (
                    <span className="px-2 py-0.5 rounded-md bg-amber-950/90 border border-amber-500/50 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-1 shrink-0">
                      <AlertCircle className="w-3 h-3 text-amber-400" />
                      {percent}%
                    </span>
                  ) : limit === 0 ? (
                    <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-slate-400 text-[10px] font-mono font-bold shrink-0">
                      NO LIMIT
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold shrink-0">
                      ON TRACK
                    </span>
                  )}

                  {/* Delete category button */}
                  {b.category.toLowerCase() !== 'uncategorized' && (
                    <button
                      onClick={() => handleDeleteCategory(b.category, b.categoryDef?.id)}
                      disabled={deletingCatName === b.category}
                      title={`"${b.category}" category aur iska budget delete karein`}
                      className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 border border-transparent hover:border-rose-500/30 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Amount and Limit Details */}
              <div className="mt-4 flex items-baseline justify-between font-mono text-xs">
                <div className="text-slate-400">
                  SPENT: <span className="text-white font-bold">₹{spent.toLocaleString('en-IN')}</span>
                </div>
                {isEditing ? (
                  <div className="flex items-center space-x-1.5">
                    <span className="text-cyan-400 text-xs">LIMIT: ₹</span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={b.limit}
                      onChange={(e) => handleLimitChange(b.category, parseInt(e.target.value) || 0)}
                      className="w-24 px-2 py-1 bg-slate-950 border border-cyan-500/50 rounded-lg text-xs font-mono font-bold text-cyan-300 focus:outline-hidden focus:ring-1 focus:ring-cyan-400"
                    />
                  </div>
                ) : (
                  <div className="text-slate-400">
                    LIMIT:{' '}
                    <span className="text-cyan-400 font-bold">
                      {limit > 0 ? `₹${limit.toLocaleString('en-IN')}` : '₹0 (Not Set)'}
                    </span>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              <div className="mt-3">
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isOver
                        ? 'bg-rose-500 shadow-sm shadow-rose-500'
                        : percent > 80
                        ? 'bg-amber-400 shadow-sm shadow-amber-400'
                        : limit === 0
                        ? 'bg-slate-700'
                        : 'bg-cyan-400 shadow-sm shadow-cyan-400'
                    }`}
                    style={{ width: `${limit > 0 ? Math.min(100, percent) : 0}%` }}
                  />
                </div>
              </div>

              {/* Sub status text */}
              <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>{limit > 0 ? `${percent}% USED` : 'UNLIMITED'}</span>
                <span>
                  {limit > 0
                    ? limit >= spent
                      ? `₹${(limit - spent).toLocaleString('en-IN')} REMAINING`
                      : `₹${(spent - limit).toLocaleString('en-IN')} OVER BUDGET`
                    : 'Kharche ki limit set karein'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {filteredBudgets.length === 0 && (
        <div className="p-8 text-center bg-[#0c1222]/50 border border-slate-800 rounded-2xl">
          <p className="text-sm font-mono text-slate-400">Koi category match nahi hui.</p>
        </div>
      )}

      {/* Excel Budget Import Modal */}
      <ExcelBudgetImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        categories={categories}
        budgets={budgets}
        onImportSuccess={handleExcelImportSuccess}
      />
    </div>
  );
};
