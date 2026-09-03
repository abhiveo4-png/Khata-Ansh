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
  Banknote,
  Smartphone,
  Pencil
} from 'lucide-react';
import { Transaction, TransactionType, CategoryDef, PaymentMethod } from '../types';
import { getCategoryByNameOrKeyword } from '../utils/categories';
import { formatCurrency, formatRelativeDate } from '../utils/formatters';
import { EditTransactionModal } from './EditTransactionModal';

interface TransactionListProps {
  transactions: Transaction[];
  categories: CategoryDef[];
  onDeleteTransaction: (id: string) => Promise<void>;
  onEditTransaction?: (tx: Transaction) => Promise<void>;
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

  // Edit Modal State
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Category changer dropdown state
  const [activeCategoryDropdownTxId, setActiveCategoryDropdownTxId] = useState<string | null>(null);

  // Extract unique members/sources
  const uniqueMembers = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => {
      if (t.telegramUser) set.add(t.telegramUser);
      else if (t.source === 'telegram') set.add('Telegram');
      else set.add('Web App');
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
          const memberLabel = tx.telegramUser || (tx.source === 'telegram' ? 'Telegram' : 'Web App');
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
    if (method.toLowerCase() === 'cash' || method.toLowerCase() === 'nagad') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-500/20">
          <Banknote className="w-3 h-3" />
          <span>Cash</span>
        </span>
      );
    }
    if (method.toLowerCase() === 'card') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-950/60 text-purple-300 border border-purple-500/20">
          <CreditCard className="w-3 h-3" />
          <span>Card</span>
        </span>
      );
    }
    if (method.toLowerCase().includes('bank')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-950/60 text-blue-300 border border-blue-500/20">
          <span>Bank Transfer</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-950/60 text-indigo-300 border border-indigo-500/20">
        <Smartphone className="w-3 h-3" />
        <span>UPI</span>
      </span>
    );
  };

  return (
    <div className="bg-[#0e1526] rounded-2xl border border-slate-800 shadow-xl shadow-black/20 overflow-hidden">
      
      {/* Ledger Header & Filter Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2.5">
              <h3 className="font-bold text-base text-white flex items-center space-x-2">
                <span>Kharcha & Kamai History</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-medium">
                  {filteredTransactions.length} of {transactions.length}
                </span>
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Telegram Bot aur Web App se add kiye gaye transactions ka hisaab
            </p>
          </div>

          <div className="flex items-center space-x-2">
            {transactions.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Kya aap sach me saare transactions delete karna chahte hain?')) {
                    onClearAll();
                  }
                }}
                className="text-xs text-slate-400 hover:text-rose-400 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-rose-500/30 hover:bg-rose-950/20 transition-all cursor-pointer"
              >
                Sab Delete Karein
              </button>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${uniqueMembers.length > 1 ? 'lg:grid-cols-6' : 'lg:grid-cols-5'} gap-2.5 text-xs`}>
          
          {/* Search Input */}
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Khojein: kharcha, category, amount..."
              className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
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
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Sabhi Types</option>
              <option value="income">🟢 Kamai (Income)</option>
              <option value="expense">🔴 Kharcha (Expense)</option>
            </select>
          </div>

          {/* Member Filter (if multiple unique members exist) */}
          {uniqueMembers.length > 1 && (
            <div>
              <select
                value={selectedMember}
                onChange={(e) => setSelectedMember(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-cyan-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">👥 Sabhi Members ({uniqueMembers.length})</option>
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
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Sabhi Categories</option>
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
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Sabhi Tareeq</option>
              <option value="today">Aaj (Today)</option>
              <option value="yesterday">Kal (Yesterday)</option>
              <option value="this_month">Is Mahine (This Month)</option>
            </select>
          </div>

        </div>

        {/* Active filter pill reset */}
        {hasActiveFilters && (
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-400">Filters active hain</span>
            <button
              onClick={resetFilters}
              className="text-indigo-400 hover:text-indigo-300 font-medium underline cursor-pointer"
            >
              Reset karein
            </button>
          </div>
        )}

      </div>

      {/* Transaction Records List */}
      {filteredTransactions.length === 0 ? (
        <div className="py-16 text-center px-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 mx-auto flex items-center justify-center mb-3">
            <Filter className="w-6 h-6 text-slate-400" />
          </div>
          <h4 className="text-sm font-semibold text-slate-200">Koi transaction nahi mila</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            {hasActiveFilters
              ? 'Filter criteria badlein ya filters reset karein.'
              : 'Telegram bot par message bhejein (jaise "300 dahi cash" ya "500 petrol upi") naya kharcha record karne ke liye.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60 overflow-x-auto">
          
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-2.5 bg-slate-950/60 text-xs font-semibold text-slate-400 border-b border-slate-800">
            <div className="col-span-4">Vivaran (Description)</div>
            <div className="col-span-3">Category</div>
            <div className="col-span-3">Payment & Tareeq</div>
            <div className="col-span-2 text-right">Rashi (Amount)</div>
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
                className={`grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 px-5 md:px-6 py-3.5 hover:bg-slate-800/30 transition-colors items-center text-xs relative ${
                  isUncategorized ? 'bg-amber-950/10 border-l-2 border-amber-400' : ''
                }`}
              >
                
                {/* Description & Note */}
                <div className="md:col-span-4 flex items-center space-x-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      isIncome 
                        ? 'bg-emerald-950/70 border-emerald-500/30 text-emerald-400' 
                        : 'bg-slate-900 border-slate-700/80 text-rose-400'
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
                      <span className="font-semibold text-white truncate text-sm">{tx.description}</span>
                    </div>
                  </div>
                </div>

                {/* Category Badge & Reclassification Selector */}
                <div className="md:col-span-3 relative">
                  <button
                    onClick={() => setActiveCategoryDropdownTxId(isDropdownOpen ? null : tx.id)}
                    className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium border transition-all cursor-pointer ${
                      isUncategorized
                        ? 'bg-amber-950/60 text-amber-300 border-amber-400/50 hover:bg-amber-900/60'
                        : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-slate-500'
                    }`}
                    title="Category badalne ke liye click karein"
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
                    <div className="absolute left-0 top-full mt-1.5 z-40 bg-[#0b1120] border border-slate-700 rounded-xl shadow-2xl p-2 w-60 max-h-60 overflow-y-auto">
                      <div className="text-[11px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider border-b border-slate-800 mb-1">
                        Category Badlein:
                      </div>
                      {categories.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleCategoryChange(tx.id, c.name)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center space-x-2 transition-colors cursor-pointer ${
                            tx.category === c.name
                              ? 'bg-indigo-950/80 text-indigo-300 font-semibold border border-indigo-500/40'
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
                    <button
                      onClick={() => setEditingTransaction(tx)}
                      className="text-slate-300 hover:text-indigo-300 text-[11px] flex items-center space-x-1 cursor-pointer transition-colors"
                      title="Tareeq ya details edit karein"
                    >
                      <Calendar className="w-3 h-3 text-slate-500" />
                      <span>{formatRelativeDate(tx.date)}</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                    {tx.telegramUser ? (
                      <span className="inline-flex items-center text-cyan-300 bg-cyan-950/60 border border-cyan-500/20 px-1.5 py-0.5 rounded text-[10px] space-x-1">
                        <User className="w-2.5 h-2.5 text-cyan-400" />
                        <span className="truncate max-w-[120px]">{tx.telegramUser}</span>
                      </span>
                    ) : tx.source === 'telegram' ? (
                      <span className="inline-flex items-center text-indigo-400 space-x-0.5 text-[10px]">
                        <Bot className="w-3 h-3" />
                        <span>Telegram Bot</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-[10px]">
                        <Laptop className="w-2.5 h-2.5 mr-1 text-slate-500" />
                        <span>Web App</span>
                      </span>
                    )}
                    {tx.time && <span>• {tx.time}</span>}
                  </div>
                </div>

                {/* Amount & Actions */}
                <div className="md:col-span-2 flex items-center justify-between md:justify-end space-x-2">
                  <div className="text-left md:text-right">
                    <span
                      className={`text-sm font-bold tracking-tight ${
                        isIncome ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isIncome ? '+₹' : '-₹'}{tx.amount.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setEditingTransaction(tx)}
                      title="Transaction ya Tareeq edit karein"
                      className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-950/40 rounded-xl transition-colors shrink-0 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onDeleteTransaction(tx.id)}
                      title="Transaction delete karein"
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-xl transition-colors shrink-0 cursor-pointer"
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

    </div>
  );
};
