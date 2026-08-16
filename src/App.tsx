import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Bot, 
  Sparkles, 
  Download, 
  Activity, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  PieChart, 
  Target, 
  FileText,
  HelpCircle,
  RefreshCw,
  FolderPlus,
  KeyRound,
  UserCheck,
  Radio,
  Cpu,
  Zap,
  Terminal,
  Lock
} from 'lucide-react';
import { Transaction, FinancialSummary, BotConfig, CategoryBudget, UserProfile, CategoryDef } from './types';
import { safeFetchJson, getActiveUserId, setActiveUserId, setAuthSession } from './utils/api';
import { DEFAULT_CATEGORIES } from './utils/categories';
import { Header } from './components/Header';
import { OverviewCards } from './components/OverviewCards';
import { FuturisticHud } from './components/FuturisticHud';
import { TelegramBotSetupModal } from './components/TelegramBotSetupModal';
import { AddTransactionModal } from './components/AddTransactionModal';
import { TransactionList } from './components/TransactionList';
import { AnalyticsView } from './components/AnalyticsView';
import { BudgetManager } from './components/BudgetManager';
import { CategoryManager } from './components/CategoryManager';
import { AuthModal } from './components/AuthModal';
import { AiInsightsModal } from './components/AiInsightsModal';
import { TelegramLogsModal } from './components/TelegramLogsModal';

export default function App() {
  // Multi-user Profile State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Core Financial State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<CategoryDef[]>(DEFAULT_CATEGORIES);
  const [summary, setSummary] = useState<FinancialSummary>({
    totalIncome: 0,
    totalExpense: 0,
    netSavings: 0,
    savingsRate: 0,
    transactionCount: 0,
    incomeCount: 0,
    expenseCount: 0,
    monthlyBudget: 0,
    monthlySpent: 0,
    dailyAverageExpense: 0,
  });
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [botConfig, setBotConfig] = useState<BotConfig | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [appUrl, setAppUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'transactions' | 'categories' | 'analytics' | 'budgets'>('transactions');

  // Modals state
  const [isBotSetupOpen, setIsBotSetupOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAiInsightsOpen, setIsAiInsightsOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch Current User & All Users
  const fetchUsers = useCallback(async () => {
    const { data } = await safeFetchJson<{ user?: UserProfile; users?: UserProfile[] }>('/api/users/me');
    if (data?.user) {
      setCurrentUser(data.user);
      setActiveUserId(data.user.id);
    }
    if (data?.users) {
      setUsersList(data.users);
    }
  }, []);

  // Fetch transactions and summary
  const fetchTransactions = useCallback(async () => {
    const { data } = await safeFetchJson<{ transactions?: Transaction[]; summary?: FinancialSummary }>('/api/transactions');
    if (data?.transactions) {
      setTransactions(data.transactions);
    }
    if (data?.summary) {
      setSummary(data.summary);
    }
  }, []);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    const { data } = await safeFetchJson<{ categories?: CategoryDef[] }>('/api/categories');
    if (data?.categories && data.categories.length > 0) {
      setCategories(data.categories);
    }
  }, []);

  // Fetch bot config
  const fetchBotConfig = useCallback(async () => {
    const { data } = await safeFetchJson<{ config?: BotConfig; webhookUrl?: string; appUrl?: string }>('/api/telegram/config');
    if (data?.config) {
      setBotConfig(data.config);
    }
    if (data?.webhookUrl) {
      setWebhookUrl(data.webhookUrl);
    }
    if (data?.appUrl) {
      setAppUrl(data.appUrl);
    }
  }, []);

  // Fetch category budgets
  const fetchBudgets = useCallback(async () => {
    const { data } = await safeFetchJson<{ budgets?: CategoryBudget[] }>('/api/budgets');
    if (data?.budgets) {
      setBudgets(data.budgets);
    }
  }, []);

  // Switch / Login User handler
  const handleSelectUser = async (user: UserProfile, token?: string) => {
    setCurrentUser(user);
    setAuthSession(user.id, token);
    await Promise.all([fetchTransactions(), fetchCategories(), fetchBudgets(), fetchBotConfig()]);
  };

  // Logout handler
  const handleLogout = () => {
    setAuthSession('');
    setCurrentUser(null);
    setTransactions([]);
    setBudgets([]);
    setIsAuthModalOpen(true);
  };

  // Register User handler
  const handleRegister = async (name: string, email: string, password?: string): Promise<UserProfile | null> => {
    const { data, error } = await safeFetchJson<{ success?: boolean; user?: UserProfile; token?: string; error?: string }>('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    if (error || data?.error) {
      throw new Error(data?.error || error || 'Failed to create user');
    }
    if (data?.user) {
      setAuthSession(data.user.id, data.token);
      await fetchUsers();
      return data.user;
    }
    return null;
  };

  // Quick simulate message parser
  const handleQuickSimulate = async (msg: string) => {
    try {
      await safeFetchJson('/api/telegram/simulate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      await fetchTransactions();
    } catch (err) {
      console.error('Simulation error', err);
    }
  };

  // Initial load
  useEffect(() => {
    const initApp = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          fetchUsers(),
          fetchCategories(),
          fetchBotConfig(),
        ]);
        await Promise.all([
          fetchTransactions(),
          fetchBudgets(),
        ]);
      } catch (err) {
        console.error('Failed to initialize app', err);
      } finally {
        setIsLoading(false);
      }
    };
    initApp();
  }, [fetchUsers, fetchCategories, fetchBotConfig, fetchTransactions, fetchBudgets]);

  // Real-time polling every 4 seconds to sync Telegram messages immediately
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTransactions();
      fetchBotConfig();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchTransactions, fetchBotConfig]);

  // Handlers for transactions
  const handleAddTransaction = async (txData: Partial<Transaction>) => {
    const { data } = await safeFetchJson<{ transaction?: Transaction; summary?: FinancialSummary }>('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txData),
    });
    if (data?.transaction) {
      setTransactions((prev) => [data.transaction!, ...prev]);
      if (data.summary) {
        setSummary(data.summary);
      }
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    const { data } = await safeFetchJson<{ success?: boolean; summary?: FinancialSummary }>(`/api/transactions/${id}`, {
      method: 'DELETE',
    });
    if (data?.success) {
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      if (data.summary) {
        setSummary(data.summary);
      }
    }
  };

  // Reclassify / Change category of a transaction
  const handleUpdateTransactionCategory = async (id: string, newCategory: string) => {
    const { data } = await safeFetchJson<{ success?: boolean }>(`/api/transactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: newCategory }),
    });
    if (data?.success) {
      await fetchTransactions();
    }
  };

  const handleClearAll = async () => {
    const { data } = await safeFetchJson<{ success?: boolean; summary?: FinancialSummary }>('/api/transactions', { method: 'DELETE' });
    if (data?.success) {
      setTransactions([]);
      if (data.summary) {
        setSummary(data.summary);
      }
    }
  };

  const handleUpdateBudgets = async (newBudgets: CategoryBudget[]) => {
    const { data } = await safeFetchJson<{ success?: boolean; budgets?: CategoryBudget[] }>('/api/budgets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newBudgets }),
    });
    if (data?.success && data.budgets) {
      setBudgets(data.budgets);
      fetchTransactions();
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (transactions.length === 0) {
      alert('No transactions to export.');
      return;
    }

    const headers = ['Date', 'Type', 'Amount (INR)', 'Category', 'Description', 'Payment Method', 'Source', 'Raw Message'];
    const rows = transactions.map((t) => [
      t.date,
      t.type.toUpperCase(),
      t.amount,
      `"${t.category.replace(/"/g, '""')}"`,
      `"${t.description.replace(/"/g, '""')}"`,
      t.paymentMethod || 'UPI',
      t.source || 'manual',
      `"${(t.rawMessage || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `teleexpense_${currentUser?.name || 'records'}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#070a13] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden">
      
      {/* Background Cyber Ambient Lights */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Application Header */}
      <Header
        botConfig={botConfig}
        currentUser={currentUser}
        onOpenUserModal={() => setIsAuthModalOpen(true)}
        onOpenBotSetup={() => setIsBotSetupOpen(true)}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenAiInsights={() => setIsAiInsightsOpen(true)}
        onOpenLogs={() => setIsLogsOpen(true)}
        onExportCsv={handleExportCsv}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 relative z-10">
        
        {/* Real-time Telemetry Status HUD */}
        <FuturisticHud
          botConfig={botConfig}
          currentUser={currentUser}
          transactionCount={transactions.length}
          onOpenBotSetup={() => setIsBotSetupOpen(true)}
          onOpenLogs={() => setIsLogsOpen(true)}
          onOpenAiInsights={() => setIsAiInsightsOpen(true)}
          onRefresh={fetchTransactions}
          onQuickSimulate={handleQuickSimulate}
        />

        {/* Unauthenticated / Guest Vault Notice */}
        {!currentUser && (
          <div className="bg-gradient-to-r from-indigo-950/70 via-[#0c1426] to-cyan-950/70 rounded-2xl p-5 border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl backdrop-blur-xl">
            <div className="flex items-start sm:items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white font-display">
                  NO ACCOUNT CONNECTED
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Sign in with your email or register a new vault to track private and family Telegram expenses.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold rounded-xl text-xs font-mono shrink-0 shadow-lg cursor-pointer text-center"
            >
              LOG IN / OPEN VAULT
            </button>
          </div>
        )}

        {/* Telegram Linking Card for Current User */}
        {currentUser && !currentUser.telegramChatId && (
          <div className="bg-gradient-to-r from-cyan-950/60 via-[#0c1426] to-indigo-950/60 rounded-2xl p-4 sm:p-5 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-cyan-500/30 backdrop-blur-xl">
            <div className="flex items-start sm:items-center space-x-3.5">
              <div className="w-11 h-11 rounded-xl bg-cyan-950 border border-cyan-400/40 flex items-center justify-center shrink-0 text-cyan-300">
                <Bot className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-sm sm:text-base text-white font-display">
                    BIND TELEGRAM GATEWAY FOR {currentUser.name.toUpperCase()}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[10px] font-mono font-bold">
                    UNLINKED
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 font-mono">
                  Open Telegram Bot <span className="font-bold text-cyan-300">@{botConfig?.botUsername || 'khata_ansh_bot'}</span> and send: <code className="bg-slate-950 px-2 py-0.5 rounded font-mono text-cyan-300 font-bold border border-cyan-500/30">/link {currentUser.linkCode || currentUser.telegramLinkCode}</code>
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0 w-full md:w-auto">
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="w-full md:w-auto px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-mono font-bold shadow-md shadow-cyan-950/50 transition-all text-center cursor-pointer"
              >
                OPEN LINK HUB
              </button>
            </div>
          </div>
        )}

        {/* Executive Summary Cards */}
        <OverviewCards summary={summary} />

        {/* Cyber Navigation Matrix Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800/90 pb-0">
          <div className="flex items-center space-x-2 sm:space-x-4 overflow-x-auto no-scrollbar">
            
            <button
              onClick={() => setActiveTab('transactions')}
              className={`pb-3.5 text-xs sm:text-sm font-bold font-display border-b-2 flex items-center space-x-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'transactions'
                  ? 'border-cyan-400 text-cyan-300 text-shadow-glow'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>TRANSACTIONS STREAM ({transactions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('categories')}
              className={`pb-3.5 text-xs sm:text-sm font-bold font-display border-b-2 flex items-center space-x-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'categories'
                  ? 'border-cyan-400 text-cyan-300 text-shadow-glow'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FolderPlus className="w-4 h-4" />
              <span>AI TAXONOMY ({categories.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`pb-3.5 text-xs sm:text-sm font-bold font-display border-b-2 flex items-center space-x-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'analytics'
                  ? 'border-cyan-400 text-cyan-300 text-shadow-glow'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <PieChart className="w-4 h-4" />
              <span>ANALYTICS MATRIX</span>
            </button>

            <button
              onClick={() => setActiveTab('budgets')}
              className={`pb-3.5 text-xs sm:text-sm font-bold font-display border-b-2 flex items-center space-x-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'budgets'
                  ? 'border-cyan-400 text-cyan-300 text-shadow-glow'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Target className="w-4 h-4" />
              <span>BUDGET CAPS</span>
            </button>
          </div>

          <div className="pb-3.5 hidden sm:flex items-center space-x-2">
            <button
              onClick={() => {
                fetchTransactions();
                fetchCategories();
              }}
              title="Refresh ledger & taxonomy"
              className="p-1.5 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-cyan-300 hover:border-cyan-400/50 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tab Views */}
        {activeTab === 'transactions' && (
          <TransactionList
            transactions={transactions}
            categories={categories}
            onDeleteTransaction={handleDeleteTransaction}
            onUpdateTransactionCategory={handleUpdateTransactionCategory}
            onClearAll={handleClearAll}
          />
        )}

        {activeTab === 'categories' && (
          <CategoryManager
            categories={categories}
            onCategoriesChange={(newCats) => {
              setCategories(newCats);
              fetchTransactions();
            }}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView transactions={transactions} />
        )}

        {activeTab === 'budgets' && (
          <BudgetManager
            budgets={budgets}
            transactions={transactions}
            onUpdateBudgets={handleUpdateBudgets}
          />
        )}

      </main>

      {/* Futuristic Cyber Footer */}
      <footer className="bg-[#05070e] border-t border-slate-800/80 py-5 mt-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-slate-500 gap-3">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>TELE-EXPENSE QUANTUM • GEMINI 3.7 FLASH & TELEGRAM BOT WEBHOOK ENGINE</span>
          </div>
          <div className="flex items-center space-x-4 text-[11px]">
            <button onClick={() => setIsAuthModalOpen(true)} className="hover:text-cyan-300 transition-colors">
              MULTI-USER MATRIX
            </button>
            <button onClick={() => setIsBotSetupOpen(true)} className="hover:text-cyan-300 transition-colors">
              BOT GATEWAY
            </button>
            <button onClick={() => setIsLogsOpen(true)} className="hover:text-cyan-300 transition-colors">
              WEBHOOK LOGS
            </button>
            <button onClick={() => setIsAiInsightsOpen(true)} className="hover:text-cyan-300 transition-colors">
              AI WEALTH MATRIX
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        allUsers={usersList}
        onSelectUser={handleSelectUser}
        onLogin={handleSelectUser}
        onRegister={handleRegister}
        onRefreshUsers={fetchUsers}
        onLogout={handleLogout}
        botUsername={botConfig?.botUsername}
      />

      <TelegramBotSetupModal
        isOpen={isBotSetupOpen}
        onClose={() => setIsBotSetupOpen(false)}
        botConfig={botConfig}
        webhookUrl={webhookUrl}
        appUrl={appUrl}
        onRefreshConfig={() => {
          fetchBotConfig();
          fetchTransactions();
        }}
      />

      <AddTransactionModal
        isOpen={isAddModalOpen}
        categories={categories}
        onClose={() => setIsAddModalOpen(false)}
        onAddTransaction={handleAddTransaction}
      />

      <AiInsightsModal
        isOpen={isAiInsightsOpen}
        onClose={() => setIsAiInsightsOpen(false)}
        summary={summary}
      />

      <TelegramLogsModal
        isOpen={isLogsOpen}
        onClose={() => setIsLogsOpen(false)}
      />

    </div>
  );
}
