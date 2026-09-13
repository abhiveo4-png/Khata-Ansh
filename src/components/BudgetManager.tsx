import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Target,
  Edit2,
  Check,
  X,
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
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { CategoryBudget, Transaction, CategoryDef } from '../types';
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
  // Global bulk editing mode
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  // Bulk inputs mapping category name -> string representation of limit
  const [bulkInputValues, setBulkInputValues] = useState<Record<string, string>>({});
  const [isSavingBulk, setIsSavingBulk] = useState(false);

  // Single card inline editing mode
  const [singleEditingCat, setSingleEditingCat] = useState<string | null>(null);
  const [singleInputValue, setSingleInputValue] = useState<string>('');
  const [isSavingSingle, setIsSavingSingle] = useState(false);
  const singleInputRef = useRef<HTMLInputElement | null>(null);

  // Toast / feedback message
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'exceeded' | 'warning' | 'safe' | 'unallocated'>('all');
  const [deletingCatName, setDeletingCatName] = useState<string | null>(null);

  // Focus single input when singleEditingCat changes
  useEffect(() => {
    if (singleEditingCat && singleInputRef.current) {
      singleInputRef.current.focus();
      singleInputRef.current.select();
    }
  }, [singleEditingCat]);

  // Sync bulk inputs from props whenever budgets change (only when not actively editing)
  useEffect(() => {
    if (isBulkEditing || singleEditingCat) return;

    const initialMap: Record<string, string> = {};
    categories.forEach((cat) => {
      const existing = budgets.find((b) => b.category.toLowerCase() === cat.name.toLowerCase());
      initialMap[cat.name] = existing ? String(existing.limit) : '0';
    });
    setBulkInputValues(initialMap);
  }, [budgets, categories, isBulkEditing, singleEditingCat]);

  // Calculate spent per category from current month transactions
  const spentMap: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach((tx) => {
      if (tx.type === 'expense') {
        const catName = tx.category || 'Uncategorized';
        map[catName.toLowerCase()] = (map[catName.toLowerCase()] || 0) + (Number(tx.amount) || 0);
      }
    });
    return map;
  }, [transactions]);

  // Master list of displayed budget items synced with categories
  const displayBudgets = useMemo(() => {
    const merged: Array<{
      category: string;
      limit: number;
      spent: number;
      categoryDef?: CategoryDef;
    }> = [];

    categories.forEach((cat) => {
      let limit = 0;
      if (isBulkEditing) {
        const valStr = bulkInputValues[cat.name];
        limit = valStr !== undefined ? Math.max(0, parseInt(valStr, 10) || 0) : 0;
      } else {
        const budgetEntry = budgets.find((b) => b.category.toLowerCase() === cat.name.toLowerCase());
        limit = budgetEntry ? budgetEntry.limit : 0;
      }

      const spent = spentMap[cat.name.toLowerCase()] || 0;
      merged.push({
        category: cat.name,
        limit,
        spent,
        categoryDef: cat,
      });
    });

    return merged;
  }, [categories, budgets, bulkInputValues, isBulkEditing, spentMap]);

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
    return (displayBudgets || []).reduce((acc, b) => acc + (b?.limit || 0), 0);
  }, [displayBudgets]);

  const totalSpent = useMemo(() => {
    return (displayBudgets || []).reduce((acc, b) => acc + (b?.spent || 0), 0);
  }, [displayBudgets]);

  const exceededCount = useMemo(() => {
    return (displayBudgets || []).filter((b) => b && b.limit > 0 && b.spent > b.limit).length;
  }, [displayBudgets]);

  // Helper to trigger toast
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // ---------------- Single Card Edit Handlers ----------------

  const handleStartSingleEdit = (categoryName: string, currentLimit: number) => {
    setSingleEditingCat(categoryName);
    setSingleInputValue(currentLimit > 0 ? String(currentLimit) : '');
  };

  const handleCancelSingleEdit = () => {
    setSingleEditingCat(null);
    setSingleInputValue('');
  };

  const handleSaveSingleEdit = async (categoryName: string) => {
    const parsedLimit = Math.max(0, parseInt(singleInputValue.trim(), 10) || 0);
    setIsSavingSingle(true);
    try {
      // Build unified new budgets list
      const updatedList: CategoryBudget[] = categories.map((cat) => {
        if (cat.name.toLowerCase() === categoryName.toLowerCase()) {
          return {
            category: cat.name,
            limit: parsedLimit,
            spent: spentMap[cat.name.toLowerCase()] || 0,
            period: 'monthly',
          };
        }
        const existing = budgets.find((b) => b.category.toLowerCase() === cat.name.toLowerCase());
        return {
          category: cat.name,
          limit: existing ? existing.limit : 0,
          spent: existing ? existing.spent : 0,
          period: 'monthly',
        };
      });

      // Send to server
      const { data, error } = await safeFetchJson<{
        success: boolean;
        budgets: CategoryBudget[];
      }>('/api/budgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: categoryName, limit: parsedLimit, newBudgets: updatedList }),
      });

      if (error || !data?.success) {
        showToast(error || 'Budget update karne me dikkat aayi', 'error');
      } else {
        await onUpdateBudgets(data.budgets || updatedList);
        setSingleEditingCat(null);
        showToast(`✅ "${categoryName}" ka monthly budget ₹${parsedLimit.toLocaleString('en-IN')} set ho gaya!`);
      }
    } catch (err: any) {
      console.error('Failed to save single budget', err);
      showToast('Budget save karne me error aaya: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setIsSavingSingle(false);
    }
  };

  const handleSingleQuickAdd = (amount: number) => {
    const current = Math.max(0, parseInt(singleInputValue.trim(), 10) || 0);
    if (amount === 0) {
      setSingleInputValue('0');
    } else {
      setSingleInputValue(String(current + amount));
    }
  };

  // ---------------- Bulk Edit Handlers ----------------

  const handleStartBulkEdit = () => {
    const map: Record<string, string> = {};
    categories.forEach((cat) => {
      const existing = budgets.find((b) => b.category.toLowerCase() === cat.name.toLowerCase());
      map[cat.name] = existing ? String(existing.limit) : '0';
    });
    setBulkInputValues(map);
    setIsBulkEditing(true);
    setSingleEditingCat(null);
  };

  const handleCancelBulkEdit = () => {
    setIsBulkEditing(false);
  };

  const handleBulkInputChange = (categoryName: string, value: string) => {
    // Allow digits or empty string
    const clean = value.replace(/[^0-9]/g, '');
    setBulkInputValues((prev) => ({
      ...prev,
      [categoryName]: clean,
    }));
  };

  const handleSaveBulk = async () => {
    setIsSavingBulk(true);
    try {
      const updatedList: CategoryBudget[] = categories.map((cat) => {
        const valStr = bulkInputValues[cat.name];
        const limit = valStr !== undefined ? Math.max(0, parseInt(valStr, 10) || 0) : 0;
        return {
          category: cat.name,
          limit,
          spent: spentMap[cat.name.toLowerCase()] || 0,
          period: 'monthly',
        };
      });

      await onUpdateBudgets(updatedList);
      setIsBulkEditing(false);
      showToast(`✅ Saare ${updatedList.length} categories ke budgets successfully save ho gaye!`);
    } catch (err: any) {
      console.error('Failed to save bulk budgets', err);
      showToast('Budgets save karne me error aaya: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setIsSavingBulk(false);
    }
  };

  const handleBulkQuickApply = (action: 'zero' | '5000' | '10000' | 'add1000') => {
    setBulkInputValues((prev) => {
      const next = { ...prev };
      categories.forEach((cat) => {
        const current = Math.max(0, parseInt(next[cat.name] || '0', 10) || 0);
        if (action === 'zero') next[cat.name] = '0';
        else if (action === '5000') next[cat.name] = '5000';
        else if (action === '10000') next[cat.name] = '10000';
        else if (action === 'add1000') next[cat.name] = String(current + 1000);
      });
      return next;
    });
  };

  // ---------------- Category Deletion ----------------

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
        showToast(error || 'Category delete karne me error aaya.', 'error');
        return;
      }

      const updatedCats = data.categories || categories.filter(c => c.name.toLowerCase() !== categoryName.toLowerCase());
      const updatedBudgets = data.budgets || budgets.filter(b => b.category.toLowerCase() !== categoryName.toLowerCase());

      if (onCategoriesUpdated) {
        onCategoriesUpdated(updatedCats, updatedBudgets);
      }
      if (onRefreshTransactions) {
        onRefreshTransactions();
      }
      showToast(`🗑️ "${categoryName}" category delete ho gayi.`);
    } catch (err: any) {
      console.error('Delete category error', err);
      showToast('Failed to delete category: ' + err.message, 'error');
    } finally {
      setDeletingCatName(null);
    }
  };

  const handleExcelImportSuccess = (newCats: CategoryDef[], newBudge: CategoryBudget[]) => {
    if (onCategoriesUpdated) {
      onCategoriesUpdated(newCats, newBudge);
    }
    onUpdateBudgets(newBudge);
    showToast('📊 Excel file se saari categories aur budgets successfully allocate ho gaye!');
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification Alert */}
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
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
              Har category ke card par <b>Pencil Icon ✏️</b> dabayein ya upar <b>"LIMITS EDIT KAREIN"</b> se sabhi limits badlein.
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

            {isBulkEditing ? (
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCancelBulkEdit}
                  className="px-3.5 py-2 rounded-xl border border-slate-700 text-xs font-mono text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleSaveBulk}
                  disabled={isSavingBulk}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-mono font-bold flex items-center space-x-1.5 shadow-lg shadow-cyan-950/50 transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{isSavingBulk ? 'SAVING ALL...' : 'SAVE ALL BUDGETS'}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleStartBulkEdit}
                className="px-4 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/40 text-xs font-mono font-bold text-cyan-300 flex items-center space-x-1.5 transition-all cursor-pointer shadow-md shadow-cyan-950/30"
              >
                <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>LIMITS EDIT KAREIN (BULK)</span>
              </button>
            )}
          </div>
        </div>

        {/* Bulk Editing Quick Tools Bar (When bulk editing is active) */}
        {isBulkEditing && (
          <div className="mt-4 p-3 bg-cyan-950/30 border border-cyan-500/30 rounded-xl flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono">
            <div className="flex items-center space-x-1.5 text-cyan-300 font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Bulk Quick Presets:</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => handleBulkQuickApply('5000')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] hover:border-cyan-500/40 transition-all"
              >
                All ₹5,000
              </button>
              <button
                onClick={() => handleBulkQuickApply('10000')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] hover:border-cyan-500/40 transition-all"
              >
                All ₹10,000
              </button>
              <button
                onClick={() => handleBulkQuickApply('add1000')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] hover:border-cyan-500/40 transition-all"
              >
                +₹1,000 to All
              </button>
              <button
                onClick={() => handleBulkQuickApply('zero')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-rose-950/50 border border-slate-700 hover:border-rose-500/40 text-rose-300 text-[11px] transition-all"
              >
                Reset All to ₹0
              </button>
            </div>
          </div>
        )}

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

      {/* Grid of Category Budgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBudgets.map((b) => {
          const spent = b.spent;
          const limit = b.limit;
          const percent = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
          const isOver = spent > limit && limit > 0;
          const isNear = limit > 0 && percent >= 80 && !isOver;

          const isCardSingleEditing = singleEditingCat === b.category;

          // Icon and Color styling
          const iconName = b.categoryDef?.icon || 'Tag';
          const IconComp = ICON_MAP[iconName] || Tag;
          const catColor = b.categoryDef?.color || '#06B6D4';

          return (
            <div
              key={b.category}
              className={`p-4 rounded-2xl border transition-all duration-200 ${
                isCardSingleEditing
                  ? 'bg-slate-900 border-cyan-400 shadow-xl shadow-cyan-950/50 ring-1 ring-cyan-500/40'
                  : isOver
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
                  {b.category.toLowerCase() !== 'uncategorized' && !isBulkEditing && !isCardSingleEditing && (
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

                {/* Limit Section */}
                {isBulkEditing ? (
                  /* Bulk Editing Input */
                  <div className="flex items-center space-x-1">
                    <span className="text-cyan-400 text-xs">₹</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={bulkInputValues[b.category] ?? String(b.limit)}
                      placeholder="0"
                      onChange={(e) => handleBulkInputChange(b.category, e.target.value)}
                      className="w-24 px-2 py-1 bg-slate-950 border border-cyan-500/60 rounded-lg text-xs font-mono font-bold text-cyan-300 focus:outline-hidden focus:ring-1 focus:ring-cyan-400 text-right"
                    />
                  </div>
                ) : isCardSingleEditing ? (
                  /* Single Card Inline Editor */
                  <div className="flex items-center space-x-1">
                    <span className="text-cyan-400 text-xs font-bold">₹</span>
                    <input
                      ref={singleInputRef}
                      type="text"
                      inputMode="numeric"
                      value={singleInputValue}
                      placeholder="0"
                      onChange={(e) => setSingleInputValue(e.target.value.replace(/[^0-9]/g, ''))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveSingleEdit(b.category);
                        else if (e.key === 'Escape') handleCancelSingleEdit();
                      }}
                      className="w-24 px-2 py-1 bg-slate-950 border border-cyan-400 rounded-lg text-xs font-mono font-bold text-cyan-300 focus:outline-hidden ring-1 ring-cyan-400 text-right shadow-inner"
                    />
                  </div>
                ) : (
                  /* Normal View with Quick Pencil / Edit Trigger */
                  <div className="flex items-center space-x-1.5">
                    <div
                      onClick={() => handleStartSingleEdit(b.category, b.limit)}
                      className="group flex items-center space-x-1 cursor-pointer bg-slate-950/60 hover:bg-cyan-950/40 border border-slate-800 hover:border-cyan-500/40 px-2 py-0.5 rounded-lg transition-all"
                      title="Is category ki monthly budget limit edit karein"
                    >
                      <span className="text-slate-400 text-[11px]">LIMIT:</span>
                      <span className="text-cyan-400 font-bold">
                        {limit > 0 ? `₹${limit.toLocaleString('en-IN')}` : '₹0'}
                      </span>
                      <Edit2 className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 transition-colors ml-0.5" />
                    </div>
                  </div>
                )}
              </div>

              {/* Single Card Editing Action Panel & Quick Add Buttons */}
              {isCardSingleEditing && (
                <div className="mt-3 pt-2.5 border-t border-cyan-500/20 space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => handleSingleQuickAdd(500)}
                        className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 hover:border-cyan-500/40 text-[10px] font-mono text-cyan-300"
                      >
                        +500
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSingleQuickAdd(1000)}
                        className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 hover:border-cyan-500/40 text-[10px] font-mono text-cyan-300"
                      >
                        +1k
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSingleQuickAdd(5000)}
                        className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 hover:border-cyan-500/40 text-[10px] font-mono text-cyan-300"
                      >
                        +5k
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSingleQuickAdd(0)}
                        className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 hover:border-rose-500/40 text-[10px] font-mono text-rose-300"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={handleCancelSingleEdit}
                        className="p-1 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isSavingSingle}
                        onClick={() => handleSaveSingleEdit(b.category)}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-mono font-bold flex items-center space-x-1 shadow-md transition-all cursor-pointer"
                        title="Save limit"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>{isSavingSingle ? '...' : 'SAVE'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

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
