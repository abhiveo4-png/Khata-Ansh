import React from 'react';
import { 
  Bot, 
  Sparkles, 
  Download, 
  Send, 
  User, 
  ChevronDown, 
  LogOut, 
  LogIn,
  CheckCircle2,
  Copy,
  Wallet,
  FileSpreadsheet,
  Menu
} from 'lucide-react';
import { BotConfig, UserProfile } from '../types';

interface HeaderProps {
  currentUser: UserProfile | null;
  botConfig: BotConfig | null;
  onOpenMobileDrawer?: () => void;
  onOpenUserModal: () => void;
  onOpenBotSetup: () => void;
  onOpenAiInsights: () => void;
  onExportCsv: () => void;
  onOpenBackupModal?: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  botConfig,
  onOpenMobileDrawer,
  onOpenUserModal,
  onOpenBotSetup,
  onOpenAiInsights,
  onExportCsv,
  onOpenBackupModal,
  onLogout,
}) => {
  const isBotActive = Boolean(
    botConfig?.isConnected || 
    (botConfig?.botToken && botConfig?.botUsername) || 
    (botConfig?.isWebhookSet && botConfig?.botToken)
  );

  const isBotAdmin = currentUser?.email?.trim().toLowerCase() === 'abhiveo4@gmail.com';

  return (
    <header className="bg-[#0b1120]/95 border-b border-slate-800/90 backdrop-blur-md sticky top-0 z-30 shadow-md shadow-black/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3.5">
          
          {/* Logo & Branding */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5 sm:space-x-3">
              {/* Left 3-Bar (Hamburger) Menu Button for Mobile */}
              <button
                onClick={onOpenMobileDrawer}
                className="md:hidden p-2 -ml-1 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 flex items-center justify-center cursor-pointer transition-all active:scale-95 shadow-sm"
                aria-label="Open 3-bar menu"
                title="Kharcha & Kamai Options (3-Bar)"
              >
                <Menu className="w-5 h-5 text-indigo-400" />
              </button>

              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-indigo-900/30 shrink-0">
                <Wallet className="w-5 h-5" />
              </div>

              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                    TeleExpense <span className="text-indigo-400">AI</span>
                  </h1>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 hidden xs:inline-block">
                    Smart Khata
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Telegram Bot + Gemini AI Kharcha & Kamai Ledger
                </p>
              </div>
            </div>

            {/* Mobile Profile Trigger */}
            <div className="flex items-center space-x-2 md:hidden">
              <button
                onClick={onOpenUserModal}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-indigo-400" />
                <span className="truncate max-w-[90px]">{currentUser?.name || 'Login'}</span>
              </button>
            </div>
          </div>

          {/* Desktop Controls & Action Matrix (Hidden on Mobile view) */}
          <div className="hidden md:flex items-center flex-wrap gap-2">
            
            {/* Current User Account & Link Code Badge */}
            {currentUser ? (
              <div className="inline-flex items-center rounded-xl bg-slate-900 border border-slate-700/80 p-0.5">
                <button
                  onClick={onOpenUserModal}
                  className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-lg hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                  title="Profile, Family Members aur Telegram Link Code dekhein"
                >
                  <div className="w-5 h-5 rounded-md bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px]">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-semibold text-slate-200 max-w-[120px] truncate">{currentUser.name}</span>
                  
                  {currentUser.linkedMembers && currentUser.linkedMembers.length > 1 && (
                    <span className="text-[10px] font-medium text-cyan-300 bg-cyan-950/70 border border-cyan-500/30 px-1.5 py-0.5 rounded">
                      👥 {currentUser.linkedMembers.length}
                    </span>
                  )}

                  <span className="font-mono text-[10px] text-indigo-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-700">
                    /link {currentUser.linkCode}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors ml-0.5 cursor-pointer"
                    title="Khata logout karein"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={onOpenUserModal}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Khata Chuniye</span>
              </button>
            )}

            {/* Telegram Bot Setup Link - Only visible for abhiveo4@gmail.com */}
            {isBotAdmin && (
              <button
                onClick={onOpenBotSetup}
                className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs border transition-all cursor-pointer ${
                  isBotActive
                    ? 'bg-emerald-950/30 hover:bg-emerald-950/50 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-950/30 hover:bg-amber-950/50 text-amber-300 border-amber-500/30'
                }`}
                title="Telegram Bot Connect & Configure (Admin)"
              >
                <Bot className="w-3.5 h-3.5 text-emerald-400" />
                <span>@{botConfig?.botUsername || 'khata_ansh_bot'}</span>
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              </button>
            )}

            {/* Backup & Restore Excel/CSV Button */}
            <button
              onClick={onOpenBackupModal || onExportCsv}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-cyan-950/60 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 hover:text-white transition-all shadow-sm cursor-pointer"
              title="Excel/CSV backup download karein ya naye khate me raw messages ke sath restore karein"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
              <span>Backup & Restore</span>
            </button>

            {/* AI Insights Button */}
            <button
              onClick={onOpenAiInsights}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-950/80 to-purple-950/80 border border-indigo-500/40 hover:border-indigo-400 text-indigo-200 hover:text-white transition-all shadow-sm cursor-pointer"
              title="Gemini AI se janein kaha faltu kharcha hua aur kitni bachat ho sakti hai"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>AI Tips & Bachat</span>
            </button>

            {/* Quick Export CSV Button */}
            <button
              onClick={onExportCsv}
              title="Quick CSV download"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
