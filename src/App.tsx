import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  FileText,
  FolderPlus,
  PieChart, 
  Target, 
  RefreshCw,
  Lock,
  Coins,
  PiggyBank,
  Users,
  HandCoins,
  Fuel
} from 'lucide-react';
import { Transaction, FinancialSummary, BotConfig, CategoryBudget, UserProfile, CategoryDef, UdhaarRecord, FuelLog } from './types';
import { safeFetchJson, setActiveUserId, setAuthSession, getActiveUserId } from './utils/api';
import { DEFAULT_CATEGORIES } from './utils/categories';
import { Header } from './components/Header';
import { MobileNavDrawer } from './components/MobileNavDrawer';
import { OverviewCards } from './components/OverviewCards';
import { FuturisticHud } from './components/FuturisticHud';
import { InvestableSurplusTracker } from './components/InvestableSurplusTracker';
import { TelegramBotSetupModal } from './components/TelegramBotSetupModal';
import { TransactionList } from './components/TransactionList';
import { AnalyticsView } from './components/AnalyticsView';
import { BudgetManager } from './components/BudgetManager';
import { CategoryManager } from './components/CategoryManager';
import { AuthModal } from './components/AuthModal';
import { AiInsightsModal } from './components/AiInsightsModal';
import { ExcelBackupRestoreModal } from './components/ExcelBackupRestoreModal';
import { GullakView } from './components/GullakView';
import { UdhaarKhataView } from './components/UdhaarKhataView';
import { FuelMileageView } from './components/FuelMileageView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallBanner } from './components/PWAInstallBanner';

export default function App() {
  // Multi-user Profile State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalInitialTab, setAuthModalInitialTab] = useState<'family' | 'switch' | 'register'>('family');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Privacy Mode State (Mask balances in public)
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('teleexpense_privacy_mode') === 'true';
    } catch {
      return false;
    }
  });

  const togglePrivacyMode = () => {
    setIsPrivacyMode(prev => {
      const next = !prev;
      try {
        localStorage.setItem('teleexpense_privacy_mode', String(next));
      } catch {}
      return next;
    });
  };

  // Core Financial State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<CategoryDef[]>(DEFAULT_CATEGORIES);
  const [udhaars, setUdhaars] = useState<UdhaarRecord[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
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
  const [activeTab, setActiveTab] = useState<'transactions' | 'gullak' | 'investments' | 'categories' | 'analytics' | 'budgets' | 'udhaar' | 'fuel'>('transactions');

  // Modals state
  const [isBotSetupOpen, setIsBotSetupOpen] = useState(false);
  const [isAiInsightsOpen, setIsAiInsightsOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Helper for localStorage caching
  const getCachedTransactions = (userId: string): Transaction[] => {
    try {
      const key = `teleexpense_tx_cache_${userId || 'default'}`;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const setCachedTransactions = (userId: string, txs: Transaction[]) => {
    try {
      const key = `teleexpense_tx_cache_${userId || 'default'}`;
      localStorage.setItem(key, JSON.stringify(txs));
    } catch {
      // ignore
    }
  };

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
    const activeUid = getActiveUserId() || 'user_ansh';
    const { data } = await safeFetchJson<{ transactions?: Transaction[]; summary?: FinancialSummary }>('/api/transactions');
    
    if (data?.transactions) {
      setTransactions(data.transactions);
      setCachedTransactions(activeUid, data.transactions);
    }
    if (data?.summary) {
      setSummary(data.summary);
    }
  }, []);

  // Fetch Udhaar records
  const fetchUdhaars = useCallback(async () => {
    const { data } = await safeFetchJson<{ udhaars?: UdhaarRecord[] }>('/api/udhaar');
    if (data?.udhaars) {
      setUdhaars(data.udhaars);
    }
  }, []);

  // Fetch Fuel logs
  const fetchFuelLogs = useCallback(async () => {
    const { data } = await safeFetchJson<{ logs?: FuelLog[]; fuelLogs?: FuelLog[] }>('/api/fuel');
    if (data?.logs || data?.fuelLogs) {
      setFuelLogs(data.logs || data.fuelLogs || []);
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
    const { data } = await safeFetchJson<{ budgets?: CategoryBudget[]; summary?: FinancialSummary }>('/api/budgets');
    if (data?.budgets) {
      setBudgets(data.budgets);
    }
    if (data?.summary) {
      setSummary(data.summary);
    }
  }, []);

  // Switch / Login User handler
  const handleSelectUser = async (user: UserProfile, token?: string) => {
    setCurrentUser(user);
    setAuthSession(user.id, token);
    await Promise.all([fetchTransactions(), fetchCategories(), fetchBudgets(), fetchBotConfig(), fetchUdhaars(), fetchFuelLogs()]);
  };

  // Logout handler
  const handleLogout = () => {
    setAuthSession('');
    setCurrentUser(null);
    setTransactions([]);
    setBudgets([]);
    setAuthModalInitialTab('switch');
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

  // Initial load - run strictly ONCE on mount
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;

    const initApp = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          fetchUsers(),
          fetchCategories(),
          fetchBotConfig(),
          fetchUdhaars(),
          fetchFuelLogs(),
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
  }, [fetchUsers, fetchCategories, fetchBotConfig, fetchUdhaars, fetchFuelLogs, fetchTransactions, fetchBudgets]);

  // Ultra-Low-Bandwidth Smart Sync Engine:
  // Instead of polling 4 large endpoints every 4s (which burned ~4GB/day!),
  // we check a tiny 35-byte version counter every 10s only when the tab is actively visible.
  // When the tab is in background/screen locked, zero requests are sent.
  const lastSyncVersionRef = useRef<number | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  useEffect(() => {
    const syncIfUpdated = async () => {
      // Pause completely if tab is hidden / minimized / phone locked
      if (document.hidden) return;
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      try {
        const { data } = await safeFetchJson<{ v?: number; txCount?: number; udhaarCount?: number; fuelCount?: number }>('/api/sync/version');
        if (data && typeof data.v === 'number') {
          if (lastSyncVersionRef.current === null) {
            lastSyncVersionRef.current = data.v;
          } else if (data.v !== lastSyncVersionRef.current) {
            // New record detected (from Telegram or another tab) -> re-fetch data
            lastSyncVersionRef.current = data.v;
            await Promise.all([
              fetchTransactions(),
              fetchUdhaars(),
              fetchFuelLogs(),
            ]);
          }
        }
      } catch {
        // Silent recovery
      } finally {
        isSyncingRef.current = false;
      }
    };

    // Check every 10s when tab is active
    const interval = setInterval(syncIfUpdated, 10000);

    // When user comes back to the tab, immediately check for updates
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncIfUpdated();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchTransactions, fetchUdhaars, fetchFuelLogs]);

  // Handlers for transactions
  const handleAddTransaction = async (txData: Partial<Transaction>) => {
    const { data } = await safeFetchJson<{ transaction?: Transaction; summary?: FinancialSummary }>('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txData),
    });
    if (data?.transaction) {
      setTransactions((prev) => {
        const next = [data.transaction!, ...prev];
        const activeUid = currentUser?.id || getActiveUserId() || 'user_ansh';
        setCachedTransactions(activeUid, next);
        return next;
      });
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
      setTransactions((prev) => {
        const next = prev.filter((t) => t.id !== id);
        const activeUid = currentUser?.id || getActiveUserId() || 'user_ansh';
        setCachedTransactions(activeUid, next);
        return next;
      });
      if (data.summary) {
        setSummary(data.summary);
      }
    }
  };

  // Reclassify / Change category or full details of a transaction
  const handleEditTransaction = async (updatedTx: Transaction) => {
    const { data } = await safeFetchJson<{ transaction?: Transaction; summary?: FinancialSummary }>(`/api/transactions/${updatedTx.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedTx),
    });
    if (data?.transaction) {
      setTransactions((prev) => {
        const next = prev.map((t) => (t.id === updatedTx.id ? data.transaction! : t));
        const activeUid = currentUser?.id || getActiveUserId() || 'user_ansh';
        setCachedTransactions(activeUid, next);
        return next;
      });
      if (data.summary) {
        setSummary(data.summary);
      }
    }
  };

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
      const activeUid = currentUser?.id || getActiveUserId() || 'user_ansh';
      setCachedTransactions(activeUid, []);
      setTransactions([]);
      if (data.summary) {
        setSummary(data.summary);
      }
    }
  };

  const handleUpdateBudgets = async (newBudgets: CategoryBudget[]) => {
    const { data } = await safeFetchJson<{ success?: boolean; budgets?: CategoryBudget[]; summary?: FinancialSummary }>('/api/budgets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newBudgets }),
    });
    if (data?.success && data.budgets) {
      setBudgets(data.budgets);
      if (data.summary) {
        setSummary(data.summary);
      }
      fetchTransactions();
    }
  };

  // Udhaar Handlers
  const handleAddUdhaar = async (newRecord: Omit<UdhaarRecord, 'id' | 'createdAt'>) => {
    const { data } = await safeFetchJson<{ success?: boolean; udhaar?: UdhaarRecord; udhaars?: UdhaarRecord[] }>('/api/udhaar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRecord),
    });
    if (data?.udhaars) {
      setUdhaars(data.udhaars);
    } else {
      await fetchUdhaars();
    }
  };

  const handleSettleUdhaar = async (id: string) => {
    const { data } = await safeFetchJson<{ success?: boolean; udhaars?: UdhaarRecord[] }>(`/api/udhaar/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'settled' }),
    });
    if (data?.udhaars) {
      setUdhaars(data.udhaars);
    } else {
      await fetchUdhaars();
    }
  };

  const handleDeleteUdhaar = async (id: string) => {
    const { data } = await safeFetchJson<{ success?: boolean; udhaars?: UdhaarRecord[] }>(`/api/udhaar/${id}`, {
      method: 'DELETE',
    });
    if (data?.udhaars) {
      setUdhaars(data.udhaars);
    } else {
      await fetchUdhaars();
    }
  };

  // Fuel Handlers
  const handleAddFuelLog = async (newLog: Omit<FuelLog, 'id' | 'createdAt'>) => {
    const { data } = await safeFetchJson<{ success?: boolean; log?: FuelLog; fuelLogs?: FuelLog[]; summary?: FinancialSummary }>('/api/fuel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLog),
    });
    if (data?.fuelLogs) {
      setFuelLogs(data.fuelLogs);
    } else {
      await fetchFuelLogs();
    }
    if (data?.summary) {
      setSummary(data.summary);
    }
    await fetchTransactions();
  };

  const handleDeleteFuelLog = async (id: string) => {
    const { data } = await safeFetchJson<{ success?: boolean; fuelLogs?: FuelLog[] }>(`/api/fuel/${id}`, {
      method: 'DELETE',
    });
    if (data?.fuelLogs) {
      setFuelLogs(data.fuelLogs);
    } else {
      await fetchFuelLogs();
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
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Top Application Header */}
      <Header
        botConfig={botConfig}
        currentUser={currentUser}
        onOpenMobileDrawer={() => setIsMobileNavOpen(true)}
        onOpenUserModal={() => setIsAuthModalOpen(true)}
        onOpenBotSetup={() => setIsBotSetupOpen(true)}
        onOpenAiInsights={() => setIsAiInsightsOpen(true)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        onExportCsv={handleExportCsv}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* PWA Offline & Install Status */}
        <OfflineIndicator />
        <PWAInstallBanner />

        {/* Status Bar */}
        <FuturisticHud
          botConfig={botConfig}
          currentUser={currentUser}
          transactionCount={transactions.length}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacyMode={togglePrivacyMode}
          onOpenBotSetup={() => setIsBotSetupOpen(true)}
          onOpenAiInsights={() => setIsAiInsightsOpen(true)}
          onRefresh={fetchTransactions}
          onExportCsv={handleExportCsv}
        />

        {/* Unauthenticated / Guest Notice */}
        {!currentUser && (
          <div className="bg-[#0e1526] rounded-2xl p-5 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
            <div className="flex items-start sm:items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-white">
                  Koi khata select nahi hai
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Apne personal ya family Telegram khate se judne ke liye Login karein ya Naya Khata banayein.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-xs shrink-0 cursor-pointer text-center transition-all"
            >
              Login / Khata Kholein
            </button>
          </div>
        )}

        {/* Pending Member Requests Notification Banner */}
        {currentUser?.pendingRequests && currentUser.pendingRequests.length > 0 && (
          <div className="bg-amber-950/40 rounded-2xl p-4 sm:p-5 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg animate-in fade-in">
            <div className="flex items-start sm:items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm text-white">
                    {currentUser.pendingRequests.length} Naye Member Link Requests Aaye Hain!
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    Action Required
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  {currentUser.pendingRequests.map(r => r.name).join(', ')} ne aapke khate se judne ke liye request bheji hai.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setAuthModalInitialTab('family');
                setIsAuthModalOpen(true);
              }}
              className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shrink-0 cursor-pointer text-center transition-all shadow-md"
            >
              Requests Review & Approve Karein
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <OverviewCards summary={summary} isPrivacyMode={isPrivacyMode} />

        {/* Horizontal Navigation Tabs - Desktop only (On mobile, accessible exclusively via the 3-bar drawer) */}
        <div className="hidden md:flex items-center justify-between border-b border-slate-800 pb-0 gap-2">
          <div className="flex items-center space-x-2 sm:space-x-4 overflow-x-auto no-scrollbar scroll-smooth">
            
            <button
              onClick={() => setActiveTab('transactions')}
              className={`pb-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center space-x-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'transactions'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Kharcha & Kamai ({transactions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('udhaar')}
              className={`pb-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center space-x-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'udhaar'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <HandCoins className="w-4 h-4 text-emerald-400" />
              <span className="flex items-center gap-1.5">
                Udhaar / Khata Book
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-emerald-950/90 text-emerald-300 border border-emerald-500/40">
                  {udhaars.filter(u => u.status === 'pending').length} Active
                </span>
              </span>
            </button>

            <button
              onClick={() => setActiveTab('fuel')}
              className={`pb-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center space-x-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'fuel'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Fuel className="w-4 h-4 text-amber-400" />
              <span className="flex items-center gap-1.5">
                Fuel & Mileage
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-amber-950/90 text-amber-300 border border-amber-500/40">
                  {fuelLogs.length} Logs
                </span>
              </span>
            </button>

            <button
              onClick={() => setActiveTab('gullak')}
              className={`pb-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center space-x-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'gullak'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <PiggyBank className="w-4 h-4 text-amber-400" />
              <span className="flex items-center gap-1.5">
                Gullak (Bacha Budget)
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-amber-950/90 text-amber-300 border border-amber-500/40">
                  Savings
                </span>
              </span>
            </button>

            <button
              onClick={() => setActiveTab('investments')}
              className={`pb-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center space-x-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'investments'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Coins className="w-4 h-4 text-cyan-400" />
              <span className="flex items-center gap-1.5">
                Investable Pool
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-cyan-950/90 text-cyan-300 border border-cyan-500/40">
                  ₹{Math.max(0, summary.totalIncome - summary.totalExpense).toLocaleString('en-IN')}
                </span>
              </span>
            </button>

            <button
              onClick={() => setActiveTab('categories')}
              className={`pb-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center space-x-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'categories'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FolderPlus className="w-4 h-4" />
              <span>Categories ({categories.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`pb-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center space-x-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'analytics'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <PieChart className="w-4 h-4" />
              <span>Analytics & Charts</span>
            </button>

            <button
              onClick={() => setActiveTab('budgets')}
              className={`pb-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center space-x-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'budgets'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Target className="w-4 h-4" />
              <span>Monthly Budgets</span>
            </button>
          </div>

          <div className="pb-3 flex items-center space-x-2">
            <button
              onClick={() => {
                fetchTransactions();
                fetchCategories();
                fetchBudgets();
                fetchUdhaars();
                fetchFuelLogs();
              }}
              title="Refresh ledger"
              className="p-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-600 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tab Views */}
        {activeTab === 'transactions' && (
          <div className="space-y-6">
            <TransactionList
              transactions={transactions}
              categories={categories}
              onDeleteTransaction={handleDeleteTransaction}
              onEditTransaction={handleEditTransaction}
              onUpdateTransactionCategory={handleUpdateTransactionCategory}
              onClearAll={handleClearAll}
            />
          </div>
        )}

        {activeTab === 'udhaar' && (
          <UdhaarKhataView
            records={udhaars}
            isPrivacyMode={isPrivacyMode}
            onAddRecord={handleAddUdhaar}
            onSettleRecord={handleSettleUdhaar}
            onDeleteRecord={handleDeleteUdhaar}
          />
        )}

        {activeTab === 'fuel' && (
          <FuelMileageView
            logs={fuelLogs}
            isPrivacyMode={isPrivacyMode}
            onAddLog={handleAddFuelLog}
            onDeleteLog={handleDeleteFuelLog}
          />
        )}

        {activeTab === 'gullak' && (
          <GullakView
            authToken={localStorage.getItem('teleexpense_auth_token') || localStorage.getItem('auth_token')}
            currentUser={currentUser}
            onUserUpdate={(updatedUser) => setCurrentUser(updatedUser)}
          />
        )}

        {activeTab === 'investments' && (
          <InvestableSurplusTracker
            summary={summary}
            transactions={transactions}
          />
        )}

        {activeTab === 'categories' && (
          <CategoryManager
            categories={categories}
            onCategoriesChange={(newCats) => {
              setCategories(newCats);
              fetchBudgets();
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
            categories={categories}
            onUpdateBudgets={handleUpdateBudgets}
            onRefreshTransactions={fetchTransactions}
            onCategoriesUpdated={(newCats, newBudge) => {
              setCategories(newCats);
              if (newBudge) {
                setBudgets(newBudge);
              } else {
                fetchBudgets();
              }
              fetchTransactions();
            }}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="bg-[#0b1120] border-t border-slate-800/80 py-5 mt-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-3">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>TeleExpense AI • Telegram Bot + Gemini AI Khata Engine</span>
          </div>
          <div className="flex items-center space-x-4 text-xs">
            <button onClick={() => setIsBackupModalOpen(true)} className="text-cyan-400 hover:text-cyan-300 font-mono transition-colors cursor-pointer">
              Backup / Restore (Excel)
            </button>
            <button onClick={() => setIsAuthModalOpen(true)} className="hover:text-white transition-colors cursor-pointer">
              Accounts & Family
            </button>
            {currentUser?.email?.trim().toLowerCase() === 'abhiveo4@gmail.com' && (
              <button onClick={() => setIsBotSetupOpen(true)} className="text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer">
                Bot Config
              </button>
            )}
            <button onClick={() => setIsAiInsightsOpen(true)} className="hover:text-white transition-colors cursor-pointer">
              AI Insights
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <MobileNavDrawer
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        transactionCount={transactions.length}
        categoryCount={categories.length}
        surplusAmount={summary.totalIncome - summary.totalExpense}
        udhaarCount={udhaars.filter(u => u.status === 'pending').length}
        fuelLogCount={fuelLogs.length}
        isPrivacyMode={isPrivacyMode}
        onTogglePrivacyMode={togglePrivacyMode}
        currentUser={currentUser}
        botUsername={botConfig?.botUsername}
        onOpenUserModal={() => setIsAuthModalOpen(true)}
        onOpenBotSetup={() => setIsBotSetupOpen(true)}
        onOpenAiInsights={() => setIsAiInsightsOpen(true)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        onExportCsv={handleExportCsv}
        onLogout={handleLogout}
      />

      <ExcelBackupRestoreModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        transactions={transactions}
        categories={categories}
        currentUser={currentUser}
        udhaars={udhaars}
        fuelLogs={fuelLogs}
        onRestoreSuccess={(data) => {
          if (data.transactions) setTransactions(data.transactions);
          if (data.categories) setCategories(data.categories);
          if (data.budgets) setBudgets(data.budgets);
          if (data.summary) setSummary(data.summary);
          if (data.udhaars) setUdhaars(data.udhaars);
          if (data.fuelLogs) setFuelLogs(data.fuelLogs);
          fetchBudgets();
          fetchTransactions();
          fetchUdhaars();
          fetchFuelLogs();
        }}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        allUsers={usersList}
        initialTab={authModalInitialTab}
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

      <AiInsightsModal
        isOpen={isAiInsightsOpen}
        onClose={() => setIsAiInsightsOpen(false)}
        summary={summary}
      />

    </div>
  );
}
