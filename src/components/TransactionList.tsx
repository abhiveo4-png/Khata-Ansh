import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Trash2, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  Bot, 
  User, 
  Laptop, 
  CreditCard,
  ChevronDown,
  X,
  AlertCircle,
  Banknote,
  Smartphone,
  SlidersHorizontal,
  Terminal,
  Zap
} from 'lucide-react';
import { Transaction, TransactionType, CategoryDef, PaymentMethod } from '../types';
import { getCategoryByNameOrKeyword } from '../utils/categories';
import { formatCurrency, formatRelativeDate } from '../utils/formatters';

interface TransactionListProps {
  transactions: Transaction[];
  categories: CategoryDef[];
  onDeleteTransaction: (id: string) => Promise<void>;
  onEditTransaction?: (tx: Transaction) => void;
  onUpdateTransactionCategory?: (id: string, newCategory: string) => Promise<void>;
  onClearAll: () => Promise<void>;
}

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  categories,
  onDeleteTransaction,
  onEditTransaction,
  onUpdateTransactionCategory,
  onClearAll,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | TransactionType>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMember, setSelectedMember] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'this_month'>('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc');

  // Category changer dropdown state
  const [activeCategoryDropdownTxId, setActiveCategoryDropdownTxId] = useState<string | null>(null);

  // Extract unique members/sources
  const uniqueMembers = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => {
      if (t.telegramUser) set.add(t.telegramUser);
      else if (t.source === 'telegram') set.add('Telegram');
      else set.add('Web / Manual');
    });
    return Array.from(set).sort();
  }, [transactions]);

  // Filtered & Sorted Transactions
  const filteredTransactions = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const currentMonth = today.slice(0, 7);

    return transactions
      .filter((tx) => {
        // Type filter
        if (selectedType !== 'all' && tx.type !== selectedType) return false;

        // Category filter
        if (selectedCategory !== 'all' && tx.category !== selectedCategory) return false;

        // Member filter
        if (selectedMember !== 'all') {
          const memberLabel = tx.telegramUser || (tx.source === 'telegram' ? 'Telegram' : 'Web / Manual');
          if (memberLabel !== selectedMember) return false;
        }

        // Date filter
        if (dateFilter === 'today' && tx.date !== today) return false;
        if (dateFilter === 'yesterday' && tx.date !== yesterday) return false;
        if (dateFilter === 'this_month' && !tx.date.startsWith(currentMonth)) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchDesc = tx.description.toLowerCase().includes(q);
          const matchCat = tx.category.toLowerCase().includes(q);
          const matchAmt = tx.amount.toString().includes(q);
          const matchTag = tx.tags?.some((t) => t.toLowerCase().includes(q));
          const matchRaw = tx.rawMessage?.toLowerCase().includes(q);
          const matchPm = tx.paymentMethod?.toLowerCase().includes(q);
          const matchUser = tx.telegramUser?.toLowerCase().includes(q);
          if (!matchDesc && !matchCat && !matchAmt && !matchTag && !matchRaw && !matchPm && !matchUser) return false;
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
  }, [transactions, searchQuery, selectedType, selectedCategory, selectedMember, dateFilter, sortBy]);

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => set.add(t.category));
    return Array.from(set).sort();
  }, [transactions]);

  const hasActiveFilters = searchQuery || selectedType !== 'all' || selectedCategory !== 'all' || selectedMember !== 'all' || dateFilter !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedType('all');
    setSelectedCategory('all');
    setSelectedMember('all');
    setDateFilter('all');
  };

  const handleCategoryChange = async (txId: string, newCatName: string) => {
    setActiveCategoryDropdownTxId(null);
    if (onUpdateTransactionCategory) {
      await onUpdateTransactionCategory(txId, newCatName);
    }
  };

  const renderPaymentBadge = (pm?: PaymentMethod | string) => {
    const method = pm || 'UPI';
    if (method.toLowerCase() === 'cash') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-500/30">
          <Banknote className="w-3 h-3" />
          <span>CASH</span>
        </span>
      );
    }
    if (method.toLowerCase() === 'card') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-950/70 text-purple-300 border border-purple-500/30">
          <CreditCard className="w-3 h-3" />
          <span>CARD</span>
        </span>
      );
    }
    if (method.toLowerCase().includes('bank')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-blue-950/70 text-blue-300 border border-blue-500/30">
          <span>🏦 BANK</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-cyan-950/70 text-cyan-300 border border-cyan-500/30">
        <Smartphone className="w-3 h-3" />
        <span>UPI</span>
      </span>
    );
  };

  return (
    <div className="bg-[#0c1222]/85 rounded-2xl border border-slate-800 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Ledger Header & Futuristic Filter Matrix */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <h3 className="font-bold text-base text-white font-display tracking-tight flex items-center space-x-2">
                <span>QUANTUM LEDGER STREAM</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-500/30 text-indigo-300 text-[11px] font-mono font-bold">
                  {filteredTransactions.length} / {transactions.length} RECORDS
                </span>
              </h3>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Decentralized multi-source ingestion via Telegram bot & manual terminal
            </p>
          </div>

          <div className="flex items-center space-x-2">
            {transactions.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to purge all transaction records?')) {
                    onClearAll();
                  }
                }}
                className="text-xs font-mono text-slate-400 hover:text-rose-400 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-rose-500/40 hover:bg-rose-950/20 transition-all"
              >
                PURGE ALL
              </button>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${uniqueMembers.length > 1 ? 'lg:grid-cols-6' : 'lg:grid-cols-5'} gap-2.5 text-xs font-mono`}>
          
          {/* Cyber Search Input */}
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search note, category, member, amount..."
              className="w-full pl-8 pr-3 py-2 bg-slate-950/90 border border-slate-700/80 rounded-xl text-xs text-cyan-200 placeholder:text-slate-500 focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-950/90 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-cyan-400"
            >
              <option value="all">ALL CASHFLOW</option>
              <option value="income">🟢 INFLOW ONLY</option>
              <option value="expense">🔴 OUTFLOW ONLY</option>
            </select>
          </div>

          {/* Member Filter (if multiple unique members exist) */}
          {uniqueMembers.length > 1 && (
            <div>
              <select
                value={selectedMember}
                onChange={(e) => setSelectedMember(e.target.value)}
                className="w-full px-3 py-2 bg-indigo-950/60 border border-indigo-500/40 rounded-xl text-xs text-cyan-300 font-bold focus:outline-hidden focus:border-cyan-400"
              >
                <option value="all">👥 ALL MEMBERS ({uniqueMembers.length})</option>
                {uniqueMembers.map((m) => (
                  <option key={m} value={m}>
                    👤 {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950/90 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-cyan-400"
            >
              <option value="all">ALL CATEGORIES</option>
              {uniqueCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-950/90 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-cyan-400"
            >
              <option value="all">ALL TIMEFRAMES</option>
              <option value="today">TODAY</option>
              <option value="yesterday">YESTERDAY</option>
              <option value="this_month">THIS MONTH</option>
            </select>
          </div>

        </div>

        {/* Active filter pill reset */}
        {hasActiveFilters && (
          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="text-slate-400">ACTIVE FILTERS APPLIED</span>
            <button
              onClick={resetFilters}
              className="text-cyan-400 hover:text-cyan-300 font-bold underline"
            >
              RESET ALL
            </button>
          </div>
        )}

      </div>

      {/* Transaction Records List */}
      {filteredTransactions.length === 0 ? (
        <div className="py-16 text-center px-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 mx-auto flex items-center justify-center mb-3">
            <Filter className="w-6 h-6 text-cyan-400/60" />
          </div>
          <h4 className="text-sm font-semibold text-slate-200 font-display">NO TELEMETRY MATCH</h4>
          <p className="text-xs text-slate-400 font-mono max-w-sm mx-auto mt-1">
            {hasActiveFilters
              ? 'Adjust query criteria or reset filter parameters.'
              : 'Dispatch a Telegram message (e.g. "300 dahi cash" or "500 petrol upi") to log an entry.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60 overflow-x-auto">
          
          {/* Cyber Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-2.5 bg-slate-950/70 text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 border-b border-slate-800/80">
            <div className="col-span-4">NOTE / RAW PAYLOAD</div>
            <div className="col-span-3">AI CATEGORY</div>
            <div className="col-span-3">PAYMENT & TELEMETRY</div>
            <div className="col-span-2 text-right">VALUATION / OP</div>
          </div>

          {/* List Items */}
          {filteredTransactions.map((tx) => {
            const isIncome = tx.type === 'income';
            const catDef = getCategoryByNameOrKeyword(tx.category, isIncome, categories);
            const isUncategorized = tx.category === 'Uncategorized' || tx.category.toLowerCase() === 'undefined';
            const isDropdownOpen = activeCategoryDropdownTxId === tx.id;

            return (
              <div
                key={tx.id}
                className={`grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 px-5 md:px-6 py-3.5 hover:bg-slate-800/40 transition-colors items-center text-xs relative ${
                  isUncategorized ? 'bg-amber-950/10 border-l-2 border-amber-400' : ''
                }`}
              >
                
                {/* Description & Note */}
                <div className="md:col-span-4 flex items-center space-x-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      isIncome 
                        ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400 shadow-xs shadow-emerald-950' 
                        : 'bg-slate-900 border-slate-700/80 text-rose-400 shadow-xs'
                    }`}
                  >
                    {isIncome ? (
                      <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-rose-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-white truncate font-display text-sm">{tx.description}</span>
                    </div>
                    {tx.rawMessage && (
                      <div className="text-[11px] text-cyan-300/80 font-mono mt-0.5 truncate max-w-xs flex items-center gap-1">
                        <Terminal className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                        <span>"{tx.rawMessage}"</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Category Badge & Reclassification Selector */}
                <div className="md:col-span-3 relative">
                  <button
                    onClick={() => setActiveCategoryDropdownTxId(isDropdownOpen ? null : tx.id)}
                    className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-[11px] font-mono font-medium border transition-all cursor-pointer ${
                      isUncategorized
                        ? 'bg-amber-950/60 text-amber-300 border-amber-400/50 hover:bg-amber-900/60'
                        : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-cyan-400/60'
                    }`}
                    title="Click to change AI Category"
                  >
                    <span 
                      className="w-2 h-2 rounded-full shrink-0" 
                      style={{ backgroundColor: catDef.color || '#6366F1' }}
                    />
                    <span className="truncate max-w-[130px]">{tx.category}</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>

                  {/* Popover Dropdown for Category Changer */}
                  {isDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1.5 z-40 bg-[#090d19] border border-cyan-500/30 rounded-2xl shadow-2xl shadow-black/80 p-2 w-60 max-h-60 overflow-y-auto animate-in fade-in zoom-in duration-150 backdrop-blur-xl">
                      <div className="text-[10px] font-mono font-bold text-cyan-400 px-2 py-1 uppercase tracking-wider border-b border-slate-800 mb-1">
                        RECLASSIFY CATEGORY:
                      </div>
                      {categories.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleCategoryChange(tx.id, c.name)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono flex items-center space-x-2 transition-colors cursor-pointer ${
                            tx.category === c.name
                              ? 'bg-cyan-950/70 text-cyan-300 font-bold border border-cyan-500/40'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: c.color || '#6366F1' }}
                          />
                          <span className="truncate">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payment Method & Date */}
                <div className="md:col-span-3 flex flex-col space-y-1">
                  <div className="flex items-center space-x-2">
                    {renderPaymentBadge(tx.paymentMethod)}
                    <span className="text-slate-300 font-mono text-[11px] flex items-center space-x-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      <span>{formatRelativeDate(tx.date)}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-slate-400">
                    {tx.telegramUser ? (
                      <span className="inline-flex items-center text-cyan-300 bg-cyan-950/70 border border-cyan-500/30 px-1.5 py-0.5 rounded font-medium space-x-1">
                        <User className="w-2.5 h-2.5 text-cyan-400" />
                        <span className="truncate max-w-[120px]">{tx.telegramUser}</span>
                      </span>
                    ) : tx.source === 'telegram' ? (
                      <span className="inline-flex items-center text-indigo-400 space-x-0.5">
                        <Bot className="w-3 h-3" />
                        <span>TG_BOT</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
                        <Laptop className="w-2.5 h-2.5 mr-1 text-slate-500" />
                        <span>{tx.source || 'WEB_APP'}</span>
                      </span>
                    )}
                    {tx.time && <span>• {tx.time}</span>}
                  </div>
                </div>

                {/* Amount & Actions */}
                <div className="md:col-span-2 flex items-center justify-between md:justify-end space-x-3">
                  <div className="text-left md:text-right">
                    <span
                      className={`text-sm font-extrabold font-mono tracking-tight ${
                        isIncome ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isIncome ? '+₹' : '-₹'}{tx.amount.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <button
                    onClick={() => onDeleteTransaction(tx.id)}
                    title="Delete record"
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-xl transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
