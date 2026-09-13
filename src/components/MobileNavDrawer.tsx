import React, { useEffect } from 'react';
import { 
  FileText, 
  PiggyBank, 
  Coins, 
  FolderPlus, 
  PieChart, 
  Target, 
  X, 
  Wallet, 
  User, 
  Bot, 
  Sparkles, 
  FileSpreadsheet, 
  Download, 
  LogOut, 
  ChevronRight,
  Send,
  HandCoins,
  Fuel,
  Eye,
  EyeOff
} from 'lucide-react';
import { UserProfile } from '../types';

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'transactions' | 'gullak' | 'investments' | 'categories' | 'analytics' | 'budgets' | 'udhaar' | 'fuel';
  onSelectTab: (tab: 'transactions' | 'gullak' | 'investments' | 'categories' | 'analytics' | 'budgets' | 'udhaar' | 'fuel') => void;
  transactionCount: number;
  categoryCount: number;
  surplusAmount: number;
  udhaarCount?: number;
  fuelLogCount?: number;
  isPrivacyMode?: boolean;
  onTogglePrivacyMode?: () => void;
  currentUser: UserProfile | null;
  botUsername?: string;
  onOpenUserModal: () => void;
  onOpenBotSetup: () => void;
  onOpenAiInsights: () => void;
  onOpenBackupModal: () => void;
  onExportCsv: () => void;
  onLogout?: () => void;
}

export const MobileNavDrawer: React.FC<MobileNavDrawerProps> = ({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  transactionCount,
  categoryCount,
  surplusAmount,
  udhaarCount = 0,
  fuelLogCount = 0,
  isPrivacyMode = false,
  onTogglePrivacyMode,
  currentUser,
  botUsername,
  onOpenUserModal,
  onOpenBotSetup,
  onOpenAiInsights,
  onOpenBackupModal,
  onExportCsv,
  onLogout,
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const navItems = [
    {
      id: 'transactions' as const,
      label: 'Kharcha & Kamai',
      sublabel: 'Transactions & Ledger',
      icon: FileText,
      badge: `${transactionCount} entries`,
      badgeColor: 'bg-indigo-950/80 text-indigo-300 border-indigo-500/30',
      activeColor: 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40',
      iconColor: 'text-indigo-400',
    },
    {
      id: 'udhaar' as const,
      label: 'Udhaar / Khata Book',
      sublabel: 'Lena Hai / Dena Hai',
      icon: HandCoins,
      badge: `${udhaarCount} khata`,
      badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30',
      activeColor: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40',
      iconColor: 'text-emerald-400',
    },
    {
      id: 'fuel' as const,
      label: 'Fuel & Mileage Tracker',
      sublabel: 'Odometer & Running Cost',
      icon: Fuel,
      badge: `${fuelLogCount} logs`,
      badgeColor: 'bg-cyan-950/80 text-cyan-300 border-cyan-500/30',
      activeColor: 'bg-cyan-600/20 text-cyan-300 border-cyan-500/40',
      iconColor: 'text-cyan-400',
    },
    {
      id: 'gullak' as const,
      label: 'Gullak (Bacha Budget)',
      sublabel: 'Smart Savings Pot',
      icon: PiggyBank,
      badge: 'Savings',
      badgeColor: 'bg-amber-950/80 text-amber-300 border-amber-500/30',
      activeColor: 'bg-amber-600/20 text-amber-300 border-amber-500/40',
      iconColor: 'text-amber-400',
    },
    {
      id: 'investments' as const,
      label: 'Investable Pool',
      sublabel: 'Surplus & Allocation',
      icon: Coins,
      badge: isPrivacyMode ? '₹••••' : `₹${Math.max(0, surplusAmount).toLocaleString('en-IN')}`,
      badgeColor: 'bg-cyan-950/80 text-cyan-300 border-cyan-500/30',
      activeColor: 'bg-cyan-600/20 text-cyan-300 border-cyan-500/40',
      iconColor: 'text-cyan-400',
    },
    {
      id: 'categories' as const,
      label: 'Categories',
      sublabel: 'Organize Expenses',
      icon: FolderPlus,
      badge: `${categoryCount} tags`,
      badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
      activeColor: 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40',
      iconColor: 'text-purple-400',
    },
    {
      id: 'analytics' as const,
      label: 'Analytics & Charts',
      sublabel: 'Monthly Visual Trends',
      icon: PieChart,
      badge: 'Insights',
      badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
      activeColor: 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40',
      iconColor: 'text-emerald-400',
    },
    {
      id: 'budgets' as const,
      label: 'Monthly Budgets',
      sublabel: 'Category Spending Limits',
      icon: Target,
      badge: 'Limits',
      badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
      activeColor: 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40',
      iconColor: 'text-rose-400',
    },
  ];


  return (
    <div className="fixed inset-0 z-50 md:hidden animate-in fade-in duration-200">
      {/* Dimmed backdrop */}
      <div 
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sliding Drawer Container */}
      <div 
        className="fixed inset-y-0 left-0 w-5/6 max-w-xs bg-[#0b1120] border-r border-slate-800 shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-300"
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800/90 flex items-center justify-between bg-[#080d1a]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-indigo-900/40">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-sm text-white">TeleExpense</span>
                <span className="text-[10px] font-extrabold text-indigo-400 bg-indigo-950/90 border border-indigo-500/40 px-1 py-0.2 rounded">AI</span>
              </div>
              <p className="text-[10px] text-slate-400">Khata Navigation</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Profile Card in Drawer */}
        <div className="p-3 bg-slate-900/60 border-b border-slate-800/60">
          {currentUser ? (
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/80 border border-slate-800">
              <button
                onClick={() => {
                  onClose();
                  onOpenUserModal();
                }}
                className="flex items-center space-x-2.5 text-left overflow-hidden cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{currentUser.name}</p>
                  <p className="text-[10px] font-mono text-indigo-300">/link {currentUser.linkCode}</p>
                </div>
              </button>

              {onLogout && (
                <button
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-950/40 transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => {
                onClose();
                onOpenUserModal();
              }}
              className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 shadow-sm cursor-pointer transition-all"
            >
              <User className="w-3.5 h-3.5" />
              <span>Khata Login / Select</span>
            </button>
          )}
        </div>

        {/* Main Navigation List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
            Menu Options
          </p>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? `${item.activeColor} shadow-sm font-semibold`
                    : 'border-transparent hover:border-slate-800 bg-slate-900/30 hover:bg-slate-900 text-slate-300'
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className={`p-1.5 rounded-lg bg-slate-950 border border-slate-800 shrink-0 ${item.iconColor}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-medium truncate ${isSelected ? 'text-white font-bold' : 'text-slate-200'}`}>
                      {item.label}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {item.sublabel}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md border ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                  <ChevronRight className={`w-3 h-3 ${isSelected ? 'text-white' : 'text-slate-500'}`} />
                </div>
              </button>
            );
          })}

          {/* Quick Action Tools in Drawer */}
          <div className="pt-3 mt-2 border-t border-slate-800/80 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
              Backup, Export & Tools
            </p>

            {/* Privacy Mode (Mask Balances) Toggle */}
            {onTogglePrivacyMode && (
              <button
                onClick={onTogglePrivacyMode}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium cursor-pointer transition-all ${
                  isPrivacyMode
                    ? 'bg-amber-950/40 text-amber-300 border-amber-500/40'
                    : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  {isPrivacyMode ? (
                    <EyeOff className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <Eye className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="font-semibold">
                    {isPrivacyMode ? 'Privacy Mode Active (Amounts Hidden)' : 'Privacy Mode (Mask ₹••••)'}
                  </span>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                  isPrivacyMode
                    ? 'bg-amber-900/50 text-amber-200 border-amber-500/50 font-bold'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {isPrivacyMode ? 'ON' : 'OFF'}
                </span>
              </button>
            )}

            {/* Backup & Restore Option */}
            <button
              onClick={() => {
                onClose();
                onOpenBackupModal();
              }}
              className="w-full flex items-center justify-between p-2.5 rounded-xl text-cyan-300 hover:bg-cyan-950/40 bg-cyan-950/20 border border-cyan-500/30 text-xs font-medium cursor-pointer transition-all"
            >
              <div className="flex items-center space-x-2.5">
                <FileSpreadsheet className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="font-semibold">Backup & Restore (Excel)</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-cyan-500/70" />
            </button>

            {/* Download / Export Ledger CSV Option */}
            <button
              onClick={() => {
                onClose();
                onExportCsv();
              }}
              className="w-full flex items-center justify-between p-2.5 rounded-xl text-emerald-300 hover:bg-emerald-950/40 bg-emerald-950/20 border border-emerald-500/30 text-xs font-medium cursor-pointer transition-all"
            >
              <div className="flex items-center space-x-2.5">
                <Download className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold">Download Ledger (CSV)</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-emerald-500/70" />
            </button>

            {/* AI Insights */}
            <button
              onClick={() => {
                onClose();
                onOpenAiInsights();
              }}
              className="w-full flex items-center justify-between p-2.5 rounded-xl text-indigo-300 hover:bg-indigo-950/40 bg-indigo-950/20 border border-indigo-500/30 text-xs font-medium cursor-pointer transition-all"
            >
              <div className="flex items-center space-x-2.5">
                <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Gemini AI Bachat Tips</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-indigo-500/70" />
            </button>

            {/* Telegram Bot Setup - Only for abhiveo4@gmail.com */}
            {currentUser?.email?.trim().toLowerCase() === 'abhiveo4@gmail.com' && (
              <button
                onClick={() => {
                  onClose();
                  onOpenBotSetup();
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl text-emerald-300 hover:bg-emerald-950/40 bg-emerald-950/20 border border-emerald-500/30 text-xs font-medium cursor-pointer transition-all"
              >
                <div className="flex items-center space-x-2.5">
                  <Bot className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-semibold">Telegram Bot Setup (Admin)</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-emerald-500/70" />
              </button>
            )}
          </div>

          {/* Telegram-Only Entry Info Card */}
          <div className="mt-3 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
            <p className="text-slate-300 font-semibold flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-indigo-400" />
              Kharcha Telegram Bot se add karein
            </p>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Telegram par <span className="text-emerald-400 font-medium">@{botUsername || 'khata_ansh_bot'}</span> ko message karein jaise: <span className="text-slate-200 font-mono bg-slate-950 px-1 py-0.5 rounded">chai 20</span> ya <span className="text-slate-200 font-mono bg-slate-950 px-1 py-0.5 rounded">salary 45000</span>.
            </p>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-3 border-t border-slate-800/90 bg-[#080d1a] text-center">
          <p className="text-[10px] text-slate-400">
            TeleExpense AI • Smart Telegram Ledger
          </p>
        </div>
      </div>
    </div>
  );
};
