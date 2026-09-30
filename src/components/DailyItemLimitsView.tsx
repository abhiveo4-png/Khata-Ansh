import React, { useState, useEffect, useMemo } from 'react';
import {
  Target,
  Plus,
  Search,
  Check,
  X,
  Edit2,
  Trash2,
  AlertTriangle,
  Flame,
  Coffee,
  Cigarette,
  Utensils,
  Fuel,
  Info,
  Calendar,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Power,
  Sliders,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { DailyItemLimit, DailyLimitsSummary, Transaction, CategoryDef } from '../types';
import { safeFetchJson } from '../utils/api';

interface DailyItemLimitsViewProps {
  transactions?: Transaction[];
  categories?: CategoryDef[];
  onRefreshTransactions?: () => void;
}

const PRESET_SUGGESTIONS = [
  {
    name: 'Sutta / Cigarette',
    keywords: ['sutta', 'cigarette', 'bidi', 'gold flake', 'advance', 'marlboro', 'smoke', 'cigg'],
    limit: 50,
    category: 'Food & Dining',
    notes: 'Max ₹50/day (2-3 sutta quota)',
    icon: Cigarette,
  },
  {
    name: 'Chai & Coffee',
    keywords: ['chai', 'tea', 'coffee', 'tapri', 'nescafe', 'cappuccino'],
    limit: 30,
    category: 'Food & Dining',
    notes: 'Tapri & office chai cap',
    icon: Coffee,
  },
  {
    name: 'Fast Food & Snacks',
    keywords: ['zomato', 'swiggy', 'burger', 'pizza', 'samosa', 'momo', 'maggi', 'chips', 'cold drink'],
    limit: 150,
    category: 'Food & Dining',
    notes: 'Bahar ka junk food limit',
    icon: Utensils,
  },
  {
    name: 'Daily Petrol / Commute',
    keywords: ['petrol', 'diesel', 'fuel', 'cng', 'auto', 'metro', 'rapido', 'uber', 'ola'],
    limit: 120,
    category: 'Transportation',
    notes: 'Daily travel kharcha cap',
    icon: Fuel,
  },
];

export const DailyItemLimitsView: React.FC<DailyItemLimitsViewProps> = ({
  transactions = [],
  categories = [],
  onRefreshTransactions,
}) => {
  const [limits, setLimits] = useState<DailyItemLimit[]>([]);
  const [summary, setSummary] = useState<DailyLimitsSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'exceeded' | 'warning' | 'safe' | 'paused'>('all');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<DailyItemLimit | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formLimit, setFormLimit] = useState<number>(50);
  const [formKeywords, setFormKeywords] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('Food & Dining');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formError, setFormError] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Fetch daily limits from backend
  const loadDailyLimits = async () => {
    setIsLoading(true);
    try {
      const { data } = await safeFetchJson<{ success: boolean; dailyLimits: DailyItemLimit[]; summary: DailyLimitsSummary }>(
        '/api/daily-limits'
      );
      if (data && data.dailyLimits) {
        setLimits(data.dailyLimits);
        setSummary(data.summary);
      }
    } catch (err) {
      console.error('Failed to load daily limits:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDailyLimits();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const openAddModal = (preset?: typeof PRESET_SUGGESTIONS[0]) => {
    if (preset) {
      setEditingItem(null);
      setFormName(preset.name);
      setFormLimit(preset.limit);
      setFormKeywords(preset.keywords.join(', '));
      setFormCategory(preset.category);
      setFormNotes(preset.notes);
      setFormIsActive(true);
    } else {
      setEditingItem(null);
      setFormName('');
      setFormLimit(50);
      setFormKeywords('');
      setFormCategory(categories[0]?.name || 'Food & Dining');
      setFormNotes('');
      setFormIsActive(true);
    }
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (item: DailyItemLimit) => {
    setEditingItem(item);
    setFormName(item.itemName);
    setFormLimit(item.dailyLimit);
    setFormKeywords((item.keywords || []).join(', '));
    setFormCategory(item.category || 'Food & Dining');
    setFormNotes(item.notes || '');
    setFormIsActive(item.isActive);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Kripya saman ka naam daalein (e.g. Sutta, Chai, Pizza)');
      return;
    }
    if (formLimit <= 0) {
      setFormError('Daily limit ₹0 se zyada honi chahiye');
      return;
    }

    setIsSaving(true);
    setFormError('');

    const keywordsArray = formKeywords
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean);

    const payload = {
      itemName: formName.trim(),
      dailyLimit: formLimit,
      keywords: keywordsArray.length > 0 ? keywordsArray : [formName.trim().toLowerCase()],
      category: formCategory,
      notes: formNotes.trim(),
      isActive: formIsActive,
    };

    try {
      if (editingItem) {
        // Update
        const { data, error } = await safeFetchJson<{ success: boolean; dailyLimits: DailyItemLimit[]; summary: DailyLimitsSummary; message: string }>(
          `/api/daily-limits/${editingItem.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          }
        );
        if (error || !data?.success) {
          setFormError(error || 'Limit update karne me error aaya');
          return;
        }
        setLimits(data.dailyLimits);
        setSummary(data.summary);
        setIsModalOpen(false);
        showToast(data.message || 'Limit update ho gaya!');
      } else {
        // Create
        const { data, error } = await safeFetchJson<{ success: boolean; dailyLimits: DailyItemLimit[]; summary: DailyLimitsSummary; message: string }>(
          '/api/daily-limits',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
        if (error || !data?.success) {
          setFormError(error || 'Limit add karne me error aaya');
          return;
        }
        setLimits(data.dailyLimits);
        setSummary(data.summary);
        setIsModalOpen(false);
        showToast(data.message || 'Naya daily limit add ho gaya!');
      }
    } catch (err: any) {
      setFormError(err.message || 'Save karne me samasya aayi');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { data } = await safeFetchJson<{ success: boolean; dailyLimits: DailyItemLimit[]; summary: DailyLimitsSummary; message: string }>(
        `/api/daily-limits/${id}/toggle`,
        { method: 'PATCH' }
      );
      if (data && data.success) {
        setLimits(data.dailyLimits);
        setSummary(data.summary);
        showToast(data.message);
      }
    } catch (err) {
      console.error('Failed to toggle limit:', err);
    }
  };

  const handleDelete = async (id: string, itemName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Kya aap sach me "${itemName}" ka daily limit hatana chahte hain?`)) {
      return;
    }
    try {
      const { data } = await safeFetchJson<{ success: boolean; dailyLimits: DailyItemLimit[]; summary: DailyLimitsSummary; message: string }>(
        `/api/daily-limits/${id}`,
        { method: 'DELETE' }
      );
      if (data && data.success) {
        setLimits(data.dailyLimits);
        setSummary(data.summary);
        showToast(data.message);
      }
    } catch (err) {
      console.error('Failed to delete limit:', err);
    }
  };

  // Quick tweak limit +/- ₹10
  const handleQuickTweak = async (item: DailyItemLimit, delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newLimit = Math.max(10, item.dailyLimit + delta);
    try {
      const { data } = await safeFetchJson<{ success: boolean; dailyLimits: DailyItemLimit[]; summary: DailyLimitsSummary }>(
        `/api/daily-limits/${item.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ dailyLimit: newLimit }),
        }
      );
      if (data && data.success) {
        setLimits(data.dailyLimits);
        setSummary(data.summary);
        showToast(`"${item.itemName}" limit ab ₹${newLimit} hai!`);
      }
    } catch (err) {
      console.error('Failed to tweak limit:', err);
    }
  };

  // Filter & Search Progress List
  const filteredProgress = useMemo(() => {
    if (!summary || !summary.progressList) return [];

    return summary.progressList.filter(prog => {
      const { limitItem, isExceeded, isWarning } = prog;

      // Filter by query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = limitItem.itemName.toLowerCase().includes(q);
        const matchesKw = limitItem.keywords.some(k => k.toLowerCase().includes(q));
        const matchesCat = (limitItem.category || '').toLowerCase().includes(q);
        if (!matchesName && !matchesKw && !matchesCat) return false;
      }

      // Filter by type
      if (filterType === 'paused') {
        return !limitItem.isActive;
      }
      if (filterType === 'exceeded') {
        return limitItem.isActive && isExceeded;
      }
      if (filterType === 'warning') {
        return limitItem.isActive && isWarning;
      }
      if (filterType === 'safe') {
        return limitItem.isActive && !isExceeded && !isWarning;
      }

      return true;
    });
  }, [summary, searchQuery, filterType]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Top Banner & Heading */}
      <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500 text-white rounded-xl shadow-sm">
                <Target className="w-6 h-6" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100">
                Per-Day Item Limits (Custom Saman Quota)
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Aap kisi bhi specific saman (jaise <b>Sutta, Chai, Zomato, Petrol</b>) ka rozana kharch limit set kar sakte hain. Telegram bot aur web app live alert karenge agar aap limit cross karenge!
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              id="refresh-daily-limits-btn"
              onClick={loadDailyLimits}
              disabled={isLoading}
              className="p-2.5 text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800 rounded-xl transition border border-slate-200 dark:border-slate-700"
              title="Refresh Status"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              id="open-add-daily-limit-modal-btn"
              onClick={() => openAddModal()}
              className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-medium shadow-md hover:shadow-lg transition flex items-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Naya Item Limit Jodein</span>
            </button>
          </div>
        </div>

        {/* Live Summary Stat Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700/60 p-3.5 rounded-xl shadow-sm">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Daily Cap</span>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                ₹{summary.totalDailyLimitsCap.toLocaleString('en-IN')}<span className="text-xs font-normal text-slate-500">/day</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Across {summary.activeCount} active items</div>
            </div>

            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700/60 p-3.5 rounded-xl shadow-sm">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Aaj Ka Kharcha (Spent)</span>
              <div className={`text-lg font-bold mt-0.5 ${summary.exceededCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}`}>
                ₹{summary.totalSpentTodayOnLimitedItems.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Tarikh: {summary.todayDate}</div>
            </div>

            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700/60 p-3.5 rounded-xl shadow-sm">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Remaining Quota</span>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                ₹{Math.max(0, summary.totalDailyLimitsCap - summary.totalSpentTodayOnLimitedItems).toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Aaj bacha hua quota</div>
            </div>

            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700/60 p-3.5 rounded-xl shadow-sm">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Quota Health</span>
              <div className="text-base font-bold mt-1">
                {summary.exceededCount > 0 ? (
                  <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {summary.exceededCount} Over Limit!
                  </span>
                ) : summary.warningCount > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Flame className="w-4 h-4 shrink-0" />
                    {summary.warningCount} Near Cap
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="w-4 h-4 shrink-0" />
                    All Safe 🟢
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {summary.exceededCount > 0 ? 'Dhyan se kharch karein' : 'Control me hai'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Presets (1-Click Setup) */}
      <div className="bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Quick 1-Click Popular Saman Presets
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">(Rozana ke aam kharche)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRESET_SUGGESTIONS.map(preset => {
            const Icon = preset.icon;
            const alreadyExists = limits.some(
              l => l.itemName.toLowerCase() === preset.name.toLowerCase()
            );

            return (
              <div
                key={preset.name}
                className={`flex items-center justify-between p-3 rounded-xl border transition ${
                  alreadyExists
                    ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50/30 dark:hover:bg-amber-950/10'
                }`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {preset.name}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      ₹{preset.limit}/din
                    </div>
                  </div>
                </div>

                {alreadyExists ? (
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full shrink-0">
                    <Check className="w-3 h-3" /> Added
                  </span>
                ) : (
                  <button
                    id={`add-preset-${preset.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                    onClick={() => openAddModal(preset)}
                    className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 px-2.5 py-1 rounded-lg transition border border-amber-200 dark:border-amber-800 shrink-0"
                  >
                    + Add
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="search-daily-limits-input"
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search saman ya keyword..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800 dark:text-slate-200"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All Items' },
            { id: 'exceeded', label: '🚨 Over Limit' },
            { id: 'warning', label: '🟡 Near Limit' },
            { id: 'safe', label: '🟢 Safe' },
            { id: 'paused', label: '⏸️ Paused' },
          ].map(f => (
            <button
              key={f.id}
              id={`filter-daily-limit-${f.id}`}
              onClick={() => setFilterType(f.id as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap transition ${
                filterType === f.id
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Limits Cards List */}
      {isLoading ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Daily limits load ho rahe hain...</p>
        </div>
      ) : filteredProgress.length === 0 ? (
        <div className="text-center py-14 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Target className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {searchQuery ? 'Koi saman match nahi hua' : 'Koi Daily Item Limit nahi mili'}
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
            {searchQuery
              ? `"${searchQuery}" se koi item ya keyword nahi mila. Filter reset karein.`
              : 'Rozana ke specific saman par limit lagane ke liye upar diye presets me se chunein ya naya add karein.'}
          </p>
          <div className="mt-4">
            <button
              onClick={() => openAddModal()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium transition inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Naya Saman Jodein
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProgress.map(prog => {
            const {
              limitItem,
              spentToday,
              remainingToday,
              percentageToday,
              isExceeded,
              isWarning,
              matchingCount,
              matchingTransactions,
            } = prog;

            const isExpanded = expandedItemId === limitItem.id;

            // Bar color calculation
            let barColor = 'bg-emerald-500';
            let badgeBg = 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300';
            let statusText = `₹${remainingToday.toLocaleString('en-IN')} bacha`;

            if (!limitItem.isActive) {
              barColor = 'bg-slate-400';
              badgeBg = 'bg-slate-100 dark:bg-slate-800 text-slate-500';
              statusText = 'Paused';
            } else if (isExceeded) {
              barColor = 'bg-rose-500';
              badgeBg = 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300';
              statusText = `🚨 ₹${(spentToday - limitItem.dailyLimit).toLocaleString('en-IN')} Over Limit!`;
            } else if (isWarning) {
              barColor = 'bg-amber-500';
              badgeBg = 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300';
              statusText = `🟡 ${percentageToday}% used (₹${remainingToday.toLocaleString('en-IN')} bacha)`;
            }

            return (
              <div
                key={limitItem.id}
                className={`bg-white dark:bg-slate-800 rounded-2xl border transition shadow-sm hover:shadow-md ${
                  isExceeded && limitItem.isActive
                    ? 'border-rose-300 dark:border-rose-900/60 ring-1 ring-rose-300 dark:ring-rose-900/40'
                    : isWarning && limitItem.isActive
                    ? 'border-amber-300 dark:border-amber-900/60'
                    : 'border-slate-200 dark:border-slate-700'
                } ${!limitItem.isActive ? 'opacity-65' : ''}`}
              >
                {/* Header */}
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                          {limitItem.itemName}
                        </h4>
                        {limitItem.category && (
                          <span className="text-[11px] font-medium bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">
                            {limitItem.category}
                          </span>
                        )}
                      </div>

                      {limitItem.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 italic">
                          "{limitItem.notes}"
                        </p>
                      )}
                    </div>

                    {/* Active/Paused Switch and Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        id={`toggle-active-${limitItem.id}`}
                        onClick={e => handleToggleActive(limitItem.id, e)}
                        className={`p-1.5 rounded-lg transition text-xs font-medium flex items-center gap-1 ${
                          limitItem.isActive
                            ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100'
                            : 'text-slate-400 bg-slate-100 dark:bg-slate-750 hover:bg-slate-200'
                        }`}
                        title={limitItem.isActive ? 'Pause Limit' : 'Activate Limit'}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{limitItem.isActive ? 'Active' : 'Paused'}</span>
                      </button>

                      <button
                        id={`edit-daily-limit-${limitItem.id}`}
                        onClick={() => openEditModal(limitItem)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                        title="Edit Limit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        id={`delete-daily-limit-${limitItem.id}`}
                        onClick={e => handleDelete(limitItem.id, limitItem.itemName, e)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                        title="Delete Limit"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress & Stat Row */}
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        Spent Aaj:{' '}
                        <b className={`text-sm ${isExceeded && limitItem.isActive ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}`}>
                          ₹{spentToday.toLocaleString('en-IN')}
                        </b>{' '}
                        / ₹{limitItem.dailyLimit.toLocaleString('en-IN')}
                      </div>

                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeBg}`}>
                        {statusText}
                      </span>
                    </div>

                    {/* Progress Track */}
                    <div className="w-full bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barColor} transition-all duration-500 rounded-full`}
                        style={{ width: `${Math.min(100, percentageToday)}%` }}
                      />
                    </div>
                  </div>

                  {/* Quick Limit Adjuster Buttons (+/- 10) & Keywords */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2 flex-wrap text-xs">
                    {/* Keywords */}
                    <div className="flex items-center gap-1.5 overflow-hidden flex-wrap max-w-xs">
                      <span className="text-[11px] text-slate-400 shrink-0">Tags:</span>
                      {limitItem.keywords.slice(0, 3).map(kw => (
                        <span
                          key={kw}
                          className="text-[10px] bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded"
                        >
                          {kw}
                        </span>
                      ))}
                      {limitItem.keywords.length > 3 && (
                        <span className="text-[10px] text-slate-400">
                          +{limitItem.keywords.length - 3} more
                        </span>
                      )}
                    </div>

                    {/* Quick +/- Tweak */}
                    <div className="flex items-center gap-1 shrink-0 ml-auto">
                      <span className="text-[11px] text-slate-400 mr-1">Tweak Quota:</span>
                      <button
                        onClick={e => handleQuickTweak(limitItem, -10, e)}
                        className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded text-xs font-semibold"
                        title="- ₹10 daily limit"
                      >
                        -10
                      </button>
                      <button
                        onClick={e => handleQuickTweak(limitItem, +10, e)}
                        className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded text-xs font-semibold"
                        title="+ ₹10 daily limit"
                      >
                        +10
                      </button>
                    </div>
                  </div>

                  {/* Expandable Accordion for Today's Transactions */}
                  {matchingCount > 0 && (
                    <button
                      onClick={() => setExpandedItemId(isExpanded ? null : limitItem.id)}
                      className="mt-3 w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 pt-2 border-t border-dashed border-slate-200 dark:border-slate-700"
                    >
                      <span>
                        Aaj ke matching expenses: <b>{matchingCount}</b> (₹{spentToday})
                      </span>
                      <div className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                        <span>{isExpanded ? 'Hide' : 'View Transactions'}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </div>
                    </button>
                  )}
                </div>

                {/* Expanded Transactions Sub-list */}
                {isExpanded && matchingCount > 0 && (
                  <div className="bg-slate-50/80 dark:bg-slate-900/40 p-3 sm:p-4 rounded-b-2xl border-t border-slate-200 dark:border-slate-700/80 space-y-2">
                    {matchingTransactions.map(tx => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between text-xs bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60"
                      >
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {tx.description}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {tx.time || 'Aaj'} • {tx.paymentMethod}
                          </div>
                        </div>
                        <div className="font-bold text-rose-600 dark:text-rose-400">
                          ₹{tx.amount.toLocaleString('en-IN')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Telegram Bot Helper Guide */}
      <div className="bg-gradient-to-br from-sky-50 to-blue-50 dark:from-slate-800/60 dark:to-slate-900/60 border border-sky-200 dark:border-sky-900/50 rounded-2xl p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-sky-500 text-white rounded-xl shadow-sm shrink-0">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              Telegram Bot Command Shortcuts:
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Aap Telegram chat me directly bhi per-day item limits set aur monitor kar sakte hain:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
              <div className="bg-white/80 dark:bg-slate-800/80 p-2.5 rounded-xl border border-sky-100 dark:border-sky-950/60">
                <code className="text-sky-600 dark:text-sky-400 font-bold">limit sutta 60</code>
                <div className="text-slate-500 text-[11px] mt-0.5">Sutta ka per-day limit ₹60 set karein</div>
              </div>
              <div className="bg-white/80 dark:bg-slate-800/80 p-2.5 rounded-xl border border-sky-100 dark:border-sky-950/60">
                <code className="text-sky-600 dark:text-sky-400 font-bold">limit chai 40</code>
                <div className="text-slate-500 text-[11px] mt-0.5">Chai ka daily quota ₹40 set karein</div>
              </div>
              <div className="bg-white/80 dark:bg-slate-800/80 p-2.5 rounded-xl border border-sky-100 dark:border-sky-950/60">
                <code className="text-sky-600 dark:text-sky-400 font-bold">/dailylimits</code>
                <div className="text-slate-500 text-[11px] mt-0.5">Aaj ke sabhi saman ka progress report dekhein</div>
              </div>
              <div className="bg-white/80 dark:bg-slate-800/80 p-2.5 rounded-xl border border-sky-100 dark:border-sky-950/60">
                <span className="text-rose-600 dark:text-rose-400 font-bold">Instant Bot Alerts</span>
                <div className="text-slate-500 text-[11px] mt-0.5">Kharcha record hote hi exceed alert milta hai</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Daily Limit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-700/80">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-500 text-white rounded-xl">
                  <Target className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">
                  {editingItem ? 'Edit Saman Limit' : 'Naya Saman Daily Limit Jodein'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-4 sm:p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2 border border-rose-200 dark:border-rose-900">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Saman Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Saman / Item Ka Naam <span className="text-rose-500">*</span>
                </label>
                <input
                  id="daily-limit-item-name-input"
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Sutta, Chai, Zomato, Petrol, Daru"
                  required
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 text-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Daily Limit Amount in ₹ */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Per-Day Quota Limit (₹/din) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                    ₹
                  </span>
                  <input
                    id="daily-limit-amount-input"
                    type="number"
                    min="1"
                    step="1"
                    value={formLimit}
                    onChange={e => setFormLimit(Number(e.target.value) || 0)}
                    required
                    className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 text-slate-800 dark:text-slate-100 font-bold"
                  />
                </div>

                {/* Quick amount chips */}
                <div className="flex items-center gap-1.5 mt-2">
                  {[30, 50, 100, 150, 200].map(val => (
                    <button
                      type="button"
                      key={val}
                      onClick={() => setFormLimit(val)}
                      className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-slate-600 dark:text-slate-300 rounded text-xs transition"
                    >
                      ₹{val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Matching Keywords */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Matching Keywords (Comma separated)
                </label>
                <input
                  id="daily-limit-keywords-input"
                  type="text"
                  value={formKeywords}
                  onChange={e => setFormKeywords(e.target.value)}
                  placeholder="e.g. sutta, cigarette, bidi, smoke"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 text-slate-800 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Telegram ya app me jab bhi in keywords ka kharcha aayega, ye limit me count hoga.
                </p>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Linked Category
                </label>
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 text-slate-800 dark:text-slate-100"
                >
                  <option value="Food & Dining">Food & Dining</option>
                  <option value="Transportation">Transportation</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Health & Medical">Health & Medical</option>
                  <option value="Bills & Utilities">Bills & Utilities</option>
                  <option value="Personal Care">Personal Care</option>
                  <option value="Other">Other / Misc</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes / Goal */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Notes / Goal (Optional)
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="e.g. Health ke liye control karna hai"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 text-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Limit Active Rakhein
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Rozana ke expenses par limit track karein
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={e => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  id="save-daily-limit-btn"
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition shadow-md flex items-center gap-1.5"
                >
                  {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{editingItem ? 'Update Limit' : 'Save Limit'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
