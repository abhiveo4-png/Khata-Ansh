import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Trash2, 
  Calendar, 
  CalendarRange,
  ArrowUpRight, 
  ArrowDownRight, 
  Bot, 
  User, 
  Laptop, 
  CreditCard,
  ChevronDown,
  X,
  Banknote,
  Smartphone,
  Pencil,
  Briefcase,
  Sparkles,
  HeartHandshake,
  CheckCircle2,
  Clock,
  CheckSquare,
  Square,
  Zap,
  Building2,
  Layers,
  Wallet,
  IndianRupee,
  RotateCcw
} from 'lucide-react';
import { Transaction, TransactionType, CategoryDef, PaymentMethod, AccountId, UserRole } from '../types';
import { getCategoryByNameOrKeyword } from '../utils/categories';
import { formatCurrency, formatRelativeDate } from '../utils/formatters';
import { ALL_ACCOUNTS, ACCOUNTS_CONFIG } from '../utils/accounts';
import { safeFetchJson } from '../utils/api';
import { EditTransactionModal } from './EditTransactionModal';

interface TransactionListProps {
  transactions: Transaction[];
  categories: CategoryDef[];
  userRole?: UserRole;
  activeFamilyMemberName?: string;
  isPrivacyMode?: boolean;
  selectedMonth?: string;
  onSelectMonth?: (month: string) => void;
  availableMonths?: string[];
  onDeleteTransaction: (id: string) => Promise<void>;
  onEditTransaction?: (tx: Transaction) => Promise<void>;
  onUpdateTransactionCategory?: (id: string, newCategory: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  onRefresh?: () => Promise<void>;
  onOpenReimbursementSummary?: (txId?: string) => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  categories,
  userRole = 'owner',
  activeFamilyMemberName,
  isPrivacyMode = false,
  selectedMonth = 'all',
  onSelectMonth,
  availableMonths = [],
  onDeleteTransaction,
  onEditTransaction,
  onUpdateTransactionCategory,
  onClearAll,
  onRefresh,
  onOpenReimbursementSummary,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | TransactionType>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [specialFilter, setSpecialFilter] = useState<'all' | 'reimbursement' | 'family_trip_pooja' | 'savings_transfer'>('all');
  
  // Date Range (From Date & To Date) + Quick Presets
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [datePreset, setDatePreset] = useState<string>('all');
  
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc');

  // Edit Modal State
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Category changer dropdown state
  const [activeCategoryDropdownTxId, setActiveCategoryDropdownTxId] = useState<string | null>(null);

  // Bulk Selection State for fixing past transactions
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [bulkTargetAccount, setBulkTargetAccount] = useState<AccountId>('ICICI CC 0000');
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);

  // Helper date generators
  const getTodayStr = () => new Date().toISOString().split('T')[0];

  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };

  const getLast7DaysStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  };

  const getMonthStartStr = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  };

  const getLastMonthRange = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    const from = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-01`;
    const to = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    return { from, to };
  };

  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    const today = getTodayStr();
    if (preset === 'all') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'today') {
      setFromDate(today);
      setToDate(today);
    } else if (preset === 'yesterday') {
      const yest = getYesterdayStr();
      setFromDate(yest);
      setToDate(yest);
    } else if (preset === 'last_7_days') {
      setFromDate(getLast7DaysStr());
      setToDate(today);
    } else if (preset === 'this_month') {
      setFromDate(getMonthStartStr());
      setToDate(today);
    } else if (preset === 'last_month') {
      const { from, to } = getLastMonthRange();
      setFromDate(from);
      setToDate(to);
    }
  };

  const handleFromDateChange = (val: string) => {
    setFromDate(val);
    setDatePreset('custom');
  };

  const handleToDateChange = (val: string) => {
    setToDate(val);
    setDatePreset('custom');
  };

  const handleClearDates = () => {
    setFromDate('');
    setToDate('');
    setDatePreset('all');
  };

  // Filtered & Sorted Transactions
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        // Type filter
        if (selectedType !== 'all' && tx.type !== selectedType) return false;

        // Category filter
        if (selectedCategory !== 'all' && tx.category !== selectedCategory) return false;

        // Account filter
        if (selectedAccount !== 'all') {
          const acc = tx.account || 'ICICI CC 0000';
          if (acc !== selectedAccount) return false;
        }

        // Special filter
        if (specialFilter === 'reimbursement' && !tx.isReimbursement && tx.category !== 'Reimbursement') return false;
        if (specialFilter === 'family_trip_pooja' && tx.category !== 'Family Trip & Pooja') return false;
        if (specialFilter === 'savings_transfer' && !tx.isSavingsTransfer) return false;

        // Date Range filter (From Date & To Date)
        const txDate = (tx.date || '').slice(0, 10);
        if (fromDate && txDate < fromDate) return false;
        if (toDate && txDate > toDate) return false;

        // Month filter (when selectedMonth is active and no custom date range is set)
        if (selectedMonth && selectedMonth !== 'all' && !fromDate && !toDate) {
          if (!txDate.startsWith(selectedMonth)) return false;
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchDesc = tx.description.toLowerCase().includes(q);
          const matchCat = tx.category.toLowerCase().includes(q);
          const matchAmt = tx.amount.toString().includes(q);
          const matchTag = tx.tags?.some((t) => t.toLowerCase().includes(q));
          const matchRaw = tx.rawMessage?.toLowerCase().includes(q);
          const matchPm = tx.paymentMethod?.toLowerCase().includes(q);
          const matchAcc = (tx.account || '').toLowerCase().includes(q);
          if (!matchDesc && !matchCat && !matchAmt && !matchTag && !matchRaw && !matchPm && !matchAcc) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'date_desc') {
          return new Date(b.date + 'T' + (b.time || '00:00')).getTime() - new Date(a.date + 'T' + (a.time || '00:00')).getTime();
        }
        if (sortBy === 'date_asc') {
          return new Date(a.date + 'T' + (a.time || '00:00')).getTime() - new Date(b.date + 'T' + (b.time || '00:00')).getTime();
        }
        if (sortBy === 'amount_desc') {
          return b.amount - a.amount;
        }
        if (sortBy === 'amount_asc') {
          return a.amount - b.amount;
        }
        return 0;
      });
  }, [transactions, searchQuery, selectedType, selectedCategory, selectedAccount, specialFilter, fromDate, toDate, sortBy, selectedMonth]);

  // Financial Sum Totals for the currently filtered transactions
  const summary = useMemo(() => {
    let totalExpense = 0;
    let totalIncome = 0;
    let totalReimbursement = 0;
    let totalFamilyTripPooja = 0;
    let totalSavingsTransfer = 0;
    let expenseCount = 0;
    let incomeCount = 0;

    filteredTransactions.forEach((tx) => {
      if (tx.type === 'expense') {
        totalExpense += tx.amount;
        expenseCount++;
        if (tx.isReimbursement) totalReimbursement += tx.amount;
        if (tx.category === 'Family Trip & Pooja') totalFamilyTripPooja += tx.amount;
        if (tx.isSavingsTransfer) totalSavingsTransfer += tx.amount;
      } else if (tx.type === 'income') {
        totalIncome += tx.amount;
        incomeCount++;
      }
    });

    const netBalance = totalIncome - totalExpense;
    const totalCombined = totalExpense + totalIncome;

    return {
      totalExpense,
      totalIncome,
      netBalance,
      totalCombined,
      expenseCount,
      incomeCount,
      totalCount: filteredTransactions.length,
      totalReimbursement,
      totalFamilyTripPooja,
      totalSavingsTransfer,
    };
  }, [filteredTransactions]);

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => set.add(t.category));
    return Array.from(set).sort();
  }, [transactions]);

  const hasActiveFilters = 
    Boolean(searchQuery) || 
    selectedType !== 'all' || 
    selectedCategory !== 'all' || 
    selectedAccount !== 'all' || 
    specialFilter !== 'all' || 
    Boolean(fromDate) ||
    Boolean(toDate);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedType('all');
    setSelectedCategory('all');
    setSelectedAccount('all');
    setSpecialFilter('all');
    setFromDate('');
    setToDate('');
    setDatePreset('all');
  };

  const handleCategoryChange = async (txId: string, newCatName: string) => {
    setActiveCategoryDropdownTxId(null);
    if (onUpdateTransactionCategory) {
      await onUpdateTransactionCategory(txId, newCatName);
    }
  };

  // Inline fast account re-assign
  const handleAccountChange = async (tx: Transaction, newAcc: AccountId) => {
    if (onEditTransaction) {
      await onEditTransaction({ ...tx, account: newAcc });
    }
  };

  // Toggle Reimbursement Claim Status
  const handleToggleReimbursementStatus = async (tx: Transaction) => {
    const nextStatus = tx.reimbursementStatus === 'settled' ? 'pending' : 'settled';
    if (onEditTransaction) {
      await onEditTransaction({
        ...tx,
        isReimbursement: true,
        reimbursementStatus: nextStatus,
      });
    }
  };

  // Bulk Selection Handlers
  const handleSelectAllFiltered = () => {
    if (selectedTxIds.length === filteredTransactions.length) {
      setSelectedTxIds([]);
    } else {
      setSelectedTxIds(filteredTransactions.map((t) => t.id));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedTxIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleApplyBulkAccount = async () => {
    if (selectedTxIds.length === 0) return;
    setIsApplyingBulk(true);
    try {
      await safeFetchJson('/api/transactions/bulk-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionIds: selectedTxIds,
          account: bulkTargetAccount,
        }),
      });
      setSelectedTxIds([]);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      console.error('Bulk assign error:', err);
    } finally {
      setIsApplyingBulk(false);
    }
  };

  return (
    <>
      <div className="glass-card overflow-hidden">
      
      {/* Ledger Header & Filter Toolbar */}
      <div className="p-4 sm:p-5 border-b border-white/[0.08] space-y-4">
        
        {/* Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2.5">
              <h3 className="font-bold text-base text-white flex items-center space-x-2 flex-wrap">
                <span>Kharcha & Kamai Ledger</span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/[0.08] text-slate-200 border border-white/[0.1] text-xs font-semibold backdrop-blur-md">
                  {filteredTransactions.length} of {transactions.length}
                </span>
                {selectedMonth && selectedMonth !== 'all' && (
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium font-sans">
                    📅 {selectedMonth}
                  </span>
                )}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              RuPay UPI CC, 4 Credit Cards, 2 Bank Accounts & Cash transactions ka hisaab
            </p>
          </div>

          <div className="flex items-center space-x-2">
            {/* Quick Type Filter Pills */}
            <div className="flex items-center bg-black/40 border border-white/[0.1] rounded-xl p-1 text-xs">
              <button
                onClick={() => setSelectedType('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  selectedType === 'all'
                    ? 'bg-indigo-600 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sabhi
              </button>
              <button
                onClick={() => setSelectedType('expense')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  selectedType === 'expense'
                    ? 'bg-rose-500/80 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-rose-300'
                }`}
              >
                Kharcha
              </button>
              <button
                onClick={() => setSelectedType('income')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  selectedType === 'income'
                    ? 'bg-emerald-500/80 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-emerald-300'
                }`}
              >
                Kamai
              </button>
            </div>

            {transactions.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Kya aap sach me saare transactions delete karna chahte hain?')) {
                    onClearAll();
                  }
                }}
                className="text-xs text-slate-400 hover:text-rose-300 px-3 py-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:border-rose-500/40 hover:bg-rose-500/15 transition-all cursor-pointer backdrop-blur-md active:scale-95"
              >
                Sab Delete Karein
              </button>
            )}
          </div>
        </div>

        {/* TOP SUM AMOUNT CARDS (Reflects Sum Amount at top of Kharcha & Kamai Ledger) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          
          {/* Card 1: Kul Kharcha */}
          <button
            type="button"
            onClick={() => setSelectedType(prev => prev === 'expense' ? 'all' : 'expense')}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer backdrop-blur-md relative overflow-hidden group ${
              selectedType === 'expense'
                ? 'bg-rose-500/20 border-rose-500/60 shadow-lg shadow-rose-950/40 ring-1 ring-rose-400'
                : 'bg-rose-500/[0.07] border-rose-500/20 hover:border-rose-500/40 hover:bg-rose-500/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-rose-300">
                {userRole === 'family' ? 'Aapka Kharcha' : 'Kul Kharcha (Expense)'}
              </span>
              <div className="w-6 h-6 rounded-lg bg-rose-500/20 flex items-center justify-center text-rose-400">
                <ArrowDownRight className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg sm:text-2xl font-black text-rose-300 mt-1 font-mono tracking-tight">
              {isPrivacyMode ? '••••••' : formatCurrency(summary.totalExpense)}
            </div>
            <div className="flex items-center justify-between text-[10px] text-rose-400/80 mt-1">
              <span>{summary.expenseCount} transactions</span>
              {selectedType === 'expense' ? (
                <span className="text-[9px] bg-rose-500/30 px-1.5 py-0.2 rounded font-bold">Filtered</span>
              ) : (
                <span className="text-[9px] opacity-70 group-hover:opacity-100">Click to filter</span>
              )}
            </div>
          </button>

          {/* Card 2: Kul Kamai */}
          <button
            type="button"
            onClick={() => setSelectedType(prev => prev === 'income' ? 'all' : 'income')}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer backdrop-blur-md relative overflow-hidden group ${
              selectedType === 'income'
                ? 'bg-emerald-500/20 border-emerald-500/60 shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-400'
                : 'bg-emerald-500/[0.07] border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-300">Kul Kamai (Income)</span>
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg sm:text-2xl font-black text-emerald-300 mt-1 font-mono tracking-tight">
              {userRole === 'family' || isPrivacyMode ? '••••••' : formatCurrency(summary.totalIncome)}
            </div>
            <div className="flex items-center justify-between text-[10px] text-emerald-400/80 mt-1">
              <span>{userRole === 'family' ? '🔒 Masked' : `${summary.incomeCount} transactions`}</span>
              {selectedType === 'income' ? (
                <span className="text-[9px] bg-emerald-500/30 px-1.5 py-0.2 rounded font-bold">Filtered</span>
              ) : (
                <span className="text-[9px] opacity-70 group-hover:opacity-100">Click to filter</span>
              )}
            </div>
          </button>

          {/* Card 3: Net Bachat / Hisaab */}
          <div className="p-3 rounded-2xl border bg-indigo-500/[0.07] border-indigo-500/20 backdrop-blur-md text-left">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-indigo-300">Net Hisaab (Kamai - Kharcha)</span>
              <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Wallet className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className={`text-lg sm:text-2xl font-black mt-1 font-mono tracking-tight ${
              userRole === 'family' || isPrivacyMode ? 'text-slate-400 tracking-widest' : summary.netBalance >= 0 ? 'text-emerald-300' : 'text-rose-300'
            }`}>
              {userRole === 'family' || isPrivacyMode ? '••••••' : `${summary.netBalance >= 0 ? '+' : ''}${formatCurrency(summary.netBalance)}`}
            </div>
            <div className="text-[10px] text-indigo-300/80 mt-1 flex items-center justify-between">
              <span>{userRole === 'family' ? '🔒 Family Privacy' : summary.netBalance >= 0 ? 'Surplus / Bachat' : 'Deficit / Extra Kharcha'}</span>
              {summary.totalReimbursement > 0 && userRole !== 'family' && (
                <span className="text-[9px] text-amber-300 font-mono">
                  (Rim: {formatCurrency(summary.totalReimbursement)})
                </span>
              )}
            </div>
          </div>

          {/* Card 4: Total Filtered Sum */}
          <button
            type="button"
            onClick={() => setSelectedType('all')}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer backdrop-blur-md relative overflow-hidden group ${
              selectedType === 'all'
                ? 'bg-cyan-500/15 border-cyan-500/40 shadow-lg shadow-cyan-950/30'
                : 'bg-white/[0.04] border-white/[0.1] hover:border-cyan-500/30 hover:bg-white/[0.07]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-cyan-300">
                {selectedType === 'expense'
                  ? 'Selected Kharcha Sum'
                  : selectedType === 'income'
                  ? 'Selected Kamai Sum'
                  : 'Kul Filtered Sum'}
              </span>
              <div className="w-6 h-6 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Layers className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg sm:text-2xl font-black text-white mt-1 font-mono tracking-tight">
              {isPrivacyMode ? '••••••' : formatCurrency(
                selectedType === 'expense'
                  ? summary.totalExpense
                  : selectedType === 'income'
                  ? summary.totalIncome
                  : summary.totalCombined
              )}
            </div>
            <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
              <span>{filteredTransactions.length} records</span>
              {(fromDate || toDate) ? (
                <span className="text-[9px] text-cyan-300 font-medium">Date Range Active</span>
              ) : (
                <span className="text-[9px] text-slate-500">Sabhi Tareeq</span>
              )}
            </div>
          </button>

        </div>

        {/* Filter Toolbar - Row 1: Search, Accounts, Tags, Categories, Sorting */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
          
          {/* Search Input */}
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Khojein: kharcha, card, rim, pooja..."
              className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/[0.1] rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 backdrop-blur-md"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Account Filter */}
          <div>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full px-3 py-2 bg-black/40 border border-white/[0.1] rounded-xl text-xs text-indigo-300 font-semibold focus:outline-none focus:border-indigo-400 backdrop-blur-md cursor-pointer"
            >
              <option value="all" className="bg-slate-900">💳 Sabhi Cards & Bank</option>
              {ALL_ACCOUNTS.map((a) => (
                <option key={a.id} value={a.id} className="bg-slate-900">
                  {a.shortName} ({a.badge})
                </option>
              ))}
            </select>
          </div>

          {/* Special Category Filter (Reimbursement, Family Trip & Pooja) */}
          <div>
            <select
              value={specialFilter}
              onChange={(e) => setSpecialFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-black/40 border border-white/[0.1] rounded-xl text-xs text-amber-300 font-semibold focus:outline-none focus:border-amber-400 backdrop-blur-md cursor-pointer"
            >
              <option value="all" className="bg-slate-900">⭐ Sabhi Special Tags</option>
              <option value="reimbursement" className="bg-slate-900">💼 Reimbursement (Rim)</option>
              <option value="family_trip_pooja" className="bg-slate-900">🪔 Family Trip & Pooja</option>
              <option value="savings_transfer" className="bg-slate-900">💖 Savings to Wife</option>
            </select>
            {specialFilter === 'reimbursement' && onOpenReimbursementSummary && (
              <button
                type="button"
                onClick={() => onOpenReimbursementSummary()}
                className="mt-1 w-full py-1 px-2 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 rounded-xl text-[11px] font-semibold text-cyan-300 transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
              >
                <Briefcase className="w-3 h-3 text-cyan-400" />
                <span>Open Claims & Settle Hub</span>
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-black/40 border border-white/[0.1] rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-400 backdrop-blur-md cursor-pointer"
            >
              <option value="all" className="bg-slate-900">Sabhi Categories</option>
              {uniqueCategories.map((c) => (
                <option key={c} value={c} className="bg-slate-900">
                  {c}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Filter Toolbar - Row 2: Dedicated From Date & To Date Range Picker */}
        <div className="p-3 rounded-2xl bg-black/30 border border-white/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs">
          
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-xs">
              <CalendarRange className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Tareeq Filter (Date Range):</span>
            </div>

            {/* Quick Presets Dropdown */}
            <select
              value={datePreset}
              onChange={(e) => handleDatePresetChange(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-900/90 border border-white/[0.15] rounded-xl text-xs text-cyan-300 font-medium focus:outline-none focus:border-cyan-400 cursor-pointer"
            >
              <option value="all" className="bg-slate-900">Sabhi Tareeq (All)</option>
              <option value="today" className="bg-slate-900">Aaj (Today)</option>
              <option value="yesterday" className="bg-slate-900">Kal (Yesterday)</option>
              <option value="last_7_days" className="bg-slate-900">Pichle 7 Din (Last 7 Days)</option>
              <option value="this_month" className="bg-slate-900">Is Mahine (This Month)</option>
              <option value="last_month" className="bg-slate-900">Pichla Mahina (Last Month)</option>
              <option value="custom" className="bg-slate-900">Custom (From - To)</option>
            </select>

            {/* From Date Input */}
            <div className="flex items-center gap-1 bg-slate-900/90 border border-white/[0.15] rounded-xl px-2.5 py-1 focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400/30">
              <span className="text-[11px] font-bold text-slate-400">From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => handleFromDateChange(e.target.value)}
                className="bg-transparent text-xs text-slate-200 focus:outline-none [color-scheme:dark] cursor-pointer"
              />
            </div>

            {/* To Date Input */}
            <div className="flex items-center gap-1 bg-slate-900/90 border border-white/[0.15] rounded-xl px-2.5 py-1 focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400/30">
              <span className="text-[11px] font-bold text-slate-400">To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => handleToDateChange(e.target.value)}
                className="bg-transparent text-xs text-slate-200 focus:outline-none [color-scheme:dark] cursor-pointer"
              />
            </div>

            {/* Clear Date Filter Button */}
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={handleClearDates}
                className="flex items-center gap-1 text-[11px] text-rose-300 hover:text-white bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 px-2 py-1 rounded-lg transition-all cursor-pointer"
                title="Date range clear karein"
              >
                <X className="w-3 h-3" />
                <span>Date Reset</span>
              </button>
            )}
          </div>

          {/* Active Date Indicator or Sort Options */}
          <div className="flex items-center gap-2 flex-wrap">
            {(fromDate || toDate) && (
              <div className="text-[11px] text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-2.5 py-1 rounded-xl flex items-center gap-1 font-mono">
                <span>📅 {fromDate || 'Shuruat'}</span>
                <span>se</span>
                <span>{toDate || 'Aaj tak'}</span>
              </div>
            )}

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1 text-slate-400 text-xs">
              <span>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-2 py-1 bg-slate-900 border border-white/[0.1] rounded-lg text-xs text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="date_desc">Tareeq (Naye pehle)</option>
                <option value="date_asc">Tareeq (Purane pehle)</option>
                <option value="amount_desc">Amount (Bada pehle)</option>
                <option value="amount_asc">Amount (Chhota pehle)</option>
              </select>
            </div>
          </div>

        </div>

        {/* Active filter pill reset */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between text-xs pt-1 border-t border-white/[0.05]">
            <div className="flex items-center space-x-2 text-slate-400">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              <span>Filters active hain ({filteredTransactions.length} records matching)</span>
            </div>
            <button
              onClick={resetFilters}
              className="text-indigo-400 hover:text-indigo-300 font-semibold underline cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Sabhi Filters Reset Karein</span>
            </button>
          </div>
        )}

        {/* BULK ACCOUNT REASSIGN TOOLBAR (Solves User's Problem of Fixing Past Mixed UPI Transactions) */}
        {selectedTxIds.length > 0 && (
          <div className="p-3 rounded-xl bg-indigo-950/70 border border-indigo-500/40 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in">
            <div className="flex items-center gap-2 text-white font-medium">
              <CheckSquare className="w-4 h-4 text-indigo-400" />
              <span>{selectedTxIds.length} transactions select kiye hain</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-300">Assign To:</span>
              <select
                value={bulkTargetAccount}
                onChange={(e) => setBulkTargetAccount(e.target.value as AccountId)}
                className="bg-slate-900 border border-indigo-400/50 rounded-lg px-2.5 py-1 text-xs text-indigo-200 focus:outline-hidden"
              >
                {ALL_ACCOUNTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <button
                onClick={handleApplyBulkAccount}
                disabled={isApplyingBulk}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isApplyingBulk ? 'Assigning...' : 'Assign Selected'}
              </button>

              <button
                onClick={() => setSelectedTxIds([])}
                className="px-2 py-1 text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Transaction Records List */}
      {filteredTransactions.length === 0 ? (
        <div className="py-16 text-center px-4">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-slate-400 mx-auto flex items-center justify-center mb-3 shadow-inner">
            <Filter className="w-6 h-6 text-slate-400" />
          </div>
          <h4 className="text-sm font-semibold text-slate-200">
            {selectedMonth && selectedMonth !== 'all' && transactions.length > 0
              ? `Chune huye mahine (${selectedMonth}) me koi transaction nahi hai`
              : 'Koi transaction nahi mila'}
          </h4>
          <div className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            {selectedMonth && selectedMonth !== 'all' && transactions.length > 0 ? (
              <div className="space-y-3">
                <p>
                  Aapke khate me kul <b>{transactions.length} entries</b> recorded hain jo doosre mahino ki hain.
                </p>
                {onSelectMonth && (
                  <button
                    onClick={() => onSelectMonth('all')}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-md inline-flex items-center gap-1.5 transition-all"
                  >
                    <span>🌟 Sabhi {transactions.length} Transactions Dekhein (All Months)</span>
                  </button>
                )}
              </div>
            ) : (
              <p>
                {hasActiveFilters
                  ? 'Filter criteria badlein ya filters reset karein.'
                  : 'Naya kharcha add karein ya Telegram par message bhejein.'}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06] overflow-x-auto">
          
          {/* Table Header with Select All Checkbox */}
          <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-2.5 bg-black/40 text-[11px] font-semibold text-slate-400 border-b border-white/[0.06] items-center">
            <div className="col-span-1 flex items-center">
              <button
                onClick={handleSelectAllFiltered}
                className="text-slate-400 hover:text-white cursor-pointer"
                title="Select / Deselect all"
              >
                {selectedTxIds.length === filteredTransactions.length && filteredTransactions.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-indigo-400" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="col-span-4">Vivaran (Description)</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-3">Card / Bank A/c</div>
            <div className="col-span-2 text-right">Rashi & Date</div>
          </div>

          {/* List Items */}
          {filteredTransactions.map((tx) => {
            const isIncome = tx.type === 'income';
            const catDef = getCategoryByNameOrKeyword(tx.category, isIncome, categories);
            const isUncategorized = tx.category === 'Uncategorized' || tx.category.toLowerCase() === 'undefined';
            const isSelected = selectedTxIds.includes(tx.id);
            const currentAcc = (tx.account as AccountId) || 'ICICI CC 0000';
            const accMeta = ACCOUNTS_CONFIG[currentAcc] || ACCOUNTS_CONFIG['ICICI CC 0000'];

            const isFamily = userRole === 'family';
            const isOwnTx = !isFamily || Boolean(
              (activeFamilyMemberName && (
                (tx.telegramUser && (
                  tx.telegramUser.toLowerCase().includes(activeFamilyMemberName.toLowerCase().trim()) ||
                  activeFamilyMemberName.toLowerCase().trim().includes(tx.telegramUser.toLowerCase())
                )) ||
                (tx.source === 'manual' && tx.telegramUser === activeFamilyMemberName)
              ))
            );

            return (
              <div
                key={tx.id}
                className={`grid grid-cols-1 md:grid-cols-12 gap-3 px-5 md:px-6 py-3.5 hover:bg-white/[0.03] transition-colors items-center text-xs relative ${
                  isSelected ? 'bg-indigo-950/30' : isUncategorized ? 'bg-amber-500/[0.06] border-l-2 border-amber-400' : ''
                }`}
              >
                {/* Checkbox for Bulk selection */}
                <div className="hidden md:flex col-span-1 items-center">
                  <button
                    onClick={() => handleToggleSelectRow(tx.id)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </div>
                
                {/* Description & Note */}
                <div className="md:col-span-4 flex items-center space-x-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform hover:scale-110 ${
                      isIncome 
                        ? 'icon-badge-emerald' 
                        : 'icon-badge-rose'
                    }`}
                  >
                    {isIncome ? (
                      <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-rose-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <span className="font-semibold text-white truncate text-sm">{tx.description}</span>
                      
                      {/* Reimbursement Badge with Clickable Status & Settlement Launcher */}
                      {Boolean(tx.isReimbursementInflow || (tx.type === 'income' && (tx.isReimbursement || tx.category === 'Reimbursement'))) ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          <Briefcase className="w-2.5 h-2.5" />
                          <span>Rim Inflow (Bank Credited)</span>
                        </span>
                      ) : (tx.isReimbursement || tx.category === 'Reimbursement') && (
                        <button
                          onClick={() => {
                            if (onOpenReimbursementSummary) {
                              onOpenReimbursementSummary(tx.id);
                            } else {
                              handleToggleReimbursementStatus(tx);
                            }
                          }}
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-pointer transition-all ${
                            tx.reimbursementStatus === 'settled'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              : tx.reimbursementStatus === 'partial'
                              ? 'bg-orange-500/20 text-orange-300 border-orange-500/40 hover:bg-orange-500/30'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                          }`}
                          title="Click karein settlement modal kholne ya status change karne ke liye"
                        >
                          <Briefcase className="w-2.5 h-2.5" />
                          <span>
                            {tx.reimbursementStatus === 'settled'
                              ? 'Rim Settled'
                              : tx.reimbursementStatus === 'partial'
                              ? `Partial (₹${(Number(tx.reimbursementSettledAmount) || 0).toLocaleString('en-IN')})`
                              : 'Rim Pending'}
                          </span>
                        </button>
                      )}

                      {/* Family Trip & Pooja Badge */}
                      {tx.category === 'Family Trip & Pooja' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                          <span>Pooja/Trip</span>
                        </span>
                      )}

                      {/* Savings Transfer Badge */}
                      {tx.isSavingsTransfer && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          <HeartHandshake className="w-2.5 h-2.5 text-rose-400" />
                          <span>Wife A/c</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Category Inline Dropdown directly on row */}
                <div className="md:col-span-2">
                  <div className="relative inline-flex items-center group max-w-full">
                    <select
                      value={tx.category}
                      onChange={(e) => {
                        const newCat = e.target.value;
                        if (onUpdateTransactionCategory) {
                          onUpdateTransactionCategory(tx.id, newCat);
                        }
                      }}
                      className={`appearance-none bg-slate-900 border rounded-lg pl-6 pr-6 py-1 text-[11px] font-medium cursor-pointer focus:outline-hidden transition-all max-w-[145px] truncate ${
                        isUncategorized
                          ? 'border-amber-500/60 text-amber-300 bg-amber-950/40 ring-1 ring-amber-500/30 font-bold shadow-xs'
                          : 'border-white/[0.1] text-slate-200 hover:border-indigo-400/50'
                      }`}
                      title="Click karein category turant badalne ke liye"
                    >
                      {isUncategorized && (
                        <option value="Uncategorized" className="bg-slate-900 text-amber-400 font-bold">
                          ⚠️ Uncategorized
                        </option>
                      )}
                      {categories.map((c) => (
                        <option key={c.id || c.name} value={c.name} className="bg-slate-900 text-slate-200">
                          {c.name}
                        </option>
                      ))}
                      {!categories.some((c) => c.name.toLowerCase() === tx.category.toLowerCase()) && !isUncategorized && (
                        <option value={tx.category} className="bg-slate-900 text-slate-200">
                          {tx.category}
                        </option>
                      )}
                    </select>
                    <span 
                      className="w-2 h-2 rounded-full absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" 
                      style={{ backgroundColor: isUncategorized ? '#F59E0B' : (catDef.color || '#6366F1') }}
                    />
                    <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none group-hover:text-white" />
                  </div>
                </div>

                {/* Card / Bank Account Inline Dropdown (Point 2) */}
                <div className="md:col-span-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={currentAcc}
                      onChange={(e) => handleAccountChange(tx, e.target.value as AccountId)}
                      className="bg-slate-900 border border-white/[0.1] rounded-lg px-2 py-1 text-[11px] text-slate-200 cursor-pointer focus:outline-hidden focus:border-indigo-400 max-w-[180px]"
                    >
                      {ALL_ACCOUNTS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.shortName}
                        </option>
                      ))}
                    </select>

                    <span
                      className={`text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded ${
                        tx.paymentMethod === 'UPI/Cash'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'text-slate-400'
                      }`}
                      title={tx.paymentMethod === 'UPI/Cash' ? 'Mode not specified - click Edit to assign' : undefined}
                    >
                      {tx.paymentMethod || 'UPI/Cash'}
                    </span>
                  </div>
                </div>

                {/* Amount, Date & Actions */}
                <div className="md:col-span-2 flex items-center justify-between md:justify-end space-x-3">
                  <div className="text-left md:text-right">
                    {isOwnTx ? (
                      <div
                        className={`text-sm font-extrabold tracking-tight font-mono ${
                          isIncome ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isIncome ? '+₹' : '-₹'}{isPrivacyMode ? '••••••' : tx.amount.toLocaleString('en-IN')}
                      </div>
                    ) : (
                      <div className="flex flex-col items-start md:items-end">
                        <span className="text-sm font-bold font-mono tracking-widest text-slate-400 select-none">
                          {isIncome ? '+₹' : '-₹'}••••••
                        </span>
                        <span className="text-[9px] font-sans text-indigo-300/90 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-500/30 mt-0.5">
                          🔒 Masked (Family)
                        </span>
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400">
                      {formatRelativeDate(tx.date)}
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setEditingTransaction(tx)}
                      title="Edit transaction details"
                      className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 rounded-xl transition-all shrink-0 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onDeleteTransaction(tx.id)}
                      title="Delete transaction"
                      className="p-1.5 text-slate-400 hover:text-rose-300 hover:bg-rose-500/20 rounded-xl transition-all shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      </div>

      {/* Edit Transaction Modal */}
      <EditTransactionModal
        isOpen={!!editingTransaction}
        onClose={() => setEditingTransaction(null)}
        transaction={editingTransaction}
        categories={categories}
        onSave={async (updated) => {
          if (onEditTransaction) {
            await onEditTransaction(updated);
          }
        }}
      />
    </>
  );
};
