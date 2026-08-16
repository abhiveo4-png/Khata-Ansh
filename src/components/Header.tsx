import React from 'react';
import { 
  Bot, 
  Sparkles, 
  Plus, 
  Download, 
  Activity, 
  Send, 
  CheckCircle2, 
  AlertCircle,
  User,
  ChevronDown,
  LogOut,
  LogIn,
  Layers,
  Zap
} from 'lucide-react';
import { BotConfig, UserProfile } from '../types';

interface HeaderProps {
  currentUser: UserProfile | null;
  botConfig: BotConfig | null;
  onOpenUserModal: () => void;
  onOpenBotSetup: () => void;
  onOpenAddModal: () => void;
  onOpenAiInsights: () => void;
  onOpenLogs: () => void;
  onExportCsv: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  botConfig,
  onOpenUserModal,
  onOpenBotSetup,
  onOpenAddModal,
  onOpenAiInsights,
  onOpenLogs,
  onExportCsv,
  onLogout,
}) => {
  const isBotActive = Boolean(
    botConfig?.isConnected || 
    (botConfig?.botToken && botConfig?.botUsername) || 
    (botConfig?.isWebhookSet && botConfig?.botToken)
  );

  return (
    <header className="bg-[#080c18]/90 border-b border-indigo-500/15 backdrop-blur-xl sticky top-0 z-30 shadow-xl shadow-black/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3.5">
          
          {/* Logo & Branding */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3.5">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-indigo-600 rounded-xl blur-xs opacity-75 group-hover:opacity-100 transition duration-300" />
                <div className="relative w-10 h-10 rounded-xl bg-[#090d1a] border border-cyan-400/40 flex items-center justify-center text-cyan-400 shadow-inner">
                  <Send className="w-5 h-5 -rotate-12 translate-x-0.5" />
                </div>
              </div>

              <div>
                <div className="flex items-center space-x-2.5">
                  <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-white font-display flex items-center gap-1.5">
                    TeleExpense <span className="bg-gradient-to-r from-cyan-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent">AI</span>
                  </h1>
                  <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-bold shadow-xs">
                    CYBER V2.4
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono hidden sm:flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Telegram AI Ingestion • Gemini 3.7 Neural Engine • Multi-User Quantum Ledger
                </p>
              </div>
            </div>

            {/* Mobile Profile Trigger */}
            <div className="flex items-center space-x-2 md:hidden">
              <button
                onClick={onOpenUserModal}
                className="flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-mono bg-indigo-950/60 text-indigo-200 border border-indigo-500/40"
              >
                <User className="w-3.5 h-3.5 text-cyan-400" />
                <span className="truncate max-w-[90px]">{currentUser?.name || 'Log In'}</span>
              </button>
            </div>
          </div>

          {/* Controls & Action Matrix */}
          <div className="flex items-center flex-wrap gap-2">
            
            {/* Current User Account & Link Code Badge */}
            {currentUser ? (
              <div className="inline-flex items-center rounded-xl bg-slate-900/90 border border-slate-700/80 p-0.5 shadow-inner">
                <button
                  onClick={onOpenUserModal}
                  className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-lg hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors"
                  title="View Profile, Family Members & Telegram Link Code"
                >
                  <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white font-bold flex items-center justify-center text-[10px] font-mono shadow-xs">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-semibold text-slate-200 max-w-[120px] truncate">{currentUser.name}</span>
                  
                  {currentUser.linkedMembers && currentUser.linkedMembers.length > 1 && (
                    <span className="text-[10px] font-mono font-bold text-cyan-300 bg-cyan-950/80 border border-cyan-500/30 px-1.5 py-0.5 rounded">
                      👥 {currentUser.linkedMembers.length}
                    </span>
                  )}

                  <span className="font-mono text-[10px] text-cyan-400 bg-[#050b14] px-1.5 py-0.5 rounded border border-cyan-500/30">
                    /link {currentUser.linkCode}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors ml-0.5"
                    title="Switch Account"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={onOpenUserModal}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-bold font-mono shadow-md transition-all"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>SELECT ACCOUNT</span>
              </button>
            )}

            {/* Telegram Bot Setup Link */}
            <button
              onClick={onOpenBotSetup}
              className={`hidden sm:inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-mono border transition-all ${
                isBotActive
                  ? 'bg-emerald-950/40 hover:bg-emerald-950/60 text-emerald-300 border-emerald-500/40 shadow-xs shadow-emerald-950'
                  : 'bg-amber-950/40 hover:bg-amber-950/60 text-amber-300 border-amber-500/40'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-emerald-400" />
              <span>@{botConfig?.botUsername || 'khata_ansh_bot'}</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            </button>

            {/* AI Insights Button */}
            <button
              onClick={onOpenAiInsights}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-950/80 via-violet-950/80 to-slate-900 border border-indigo-500/40 hover:border-indigo-400 text-indigo-200 hover:text-white transition-all shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono text-[11px] uppercase">AI INSIGHTS</span>
            </button>

            {/* Export CSV */}
            <button
              onClick={onExportCsv}
              title="Export Transactions to CSV"
              className="inline-flex items-center p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white text-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {/* Manual Add Button */}
            <button
              onClick={onOpenAddModal}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 shadow-md shadow-cyan-950/50 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>ADD ENTRY</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
