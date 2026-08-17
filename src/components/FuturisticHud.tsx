import React, { useState, useEffect } from 'react';
import { 
  Bot,
  Sparkles, 
  Users, 
  Send,
  RefreshCw,
  SlidersHorizontal,
  ShieldCheck,
  Zap,
  CheckCircle2
} from 'lucide-react';
import { BotConfig, UserProfile } from '../types';

interface FuturisticHudProps {
  botConfig: BotConfig | null;
  currentUser: UserProfile | null;
  transactionCount: number;
  onOpenBotSetup: () => void;
  onOpenLogs: () => void;
  onOpenAiInsights: () => void;
  onRefresh: () => void;
  onQuickSimulate?: (msg: string) => void;
}

export const FuturisticHud: React.FC<FuturisticHudProps> = ({
  botConfig,
  currentUser,
  transactionCount,
  onOpenBotSetup,
  onOpenLogs,
  onOpenAiInsights,
  onRefresh,
  onQuickSimulate,
}) => {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [quickInput, setQuickInput] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  const handleRefreshClick = () => {
    setIsSyncing(true);
    onRefresh();
    setTimeout(() => setIsSyncing(false), 600);
  };

  const handleSimulateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    setIsSimulating(true);
    if (onQuickSimulate) {
      onQuickSimulate(quickInput.trim());
    }
    setQuickInput('');
    setTimeout(() => setIsSimulating(false), 500);
  };

  const isBotActive = Boolean(
    botConfig?.isConnected || 
    (botConfig?.botToken && botConfig?.botUsername) || 
    (botConfig?.isWebhookSet && botConfig?.botToken)
  );

  return (
    <div className="w-full bg-[#0d1424] border border-slate-800/80 rounded-2xl p-3 sm:p-3.5 shadow-lg shadow-black/20">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        
        {/* Left: Active Indicators */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          
          {/* Telegram Bot Status Badge */}
          <button
            onClick={onOpenBotSetup}
            className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/70 hover:border-emerald-500/50 transition-all text-slate-200 cursor-pointer group"
          >
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isBotActive ? 'bg-emerald-400' : 'bg-amber-400'
              }`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                isBotActive ? 'bg-emerald-500' : 'bg-amber-500'
              }`} />
            </span>
            <span className="text-[11px] font-medium text-slate-400">Telegram Bot:</span>
            <span className="font-semibold text-emerald-400 group-hover:text-emerald-300">
              @{botConfig?.botUsername || 'khata_ansh_bot'}
            </span>
          </button>

          {/* AI Smart Engine Badge */}
          <button
            onClick={onOpenAiInsights}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 hover:border-indigo-400/60 text-indigo-200 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[11px] font-medium text-indigo-300">Gemini 3.7 AI:</span>
            <span className="font-semibold text-cyan-300">Active</span>
          </button>

          {/* Family Link Badge */}
          {currentUser && currentUser.linkedMembers && currentUser.linkedMembers.length > 0 && (
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-violet-950/30 border border-violet-500/20 text-[11px] text-violet-300">
              <Users className="w-3.5 h-3.5 text-violet-400" />
              <span>{currentUser.linkedMembers.length} Members Judhe Hain</span>
            </div>
          )}
        </div>

        {/* Right: Quick AI Simulator Input & Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-2">
          
          <form onSubmit={handleSimulateSubmit} className="relative w-full sm:w-80">
            <input
              type="text"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder="Test karein: '250 sabzi cash', '500 petrol'..."
              className="w-full pl-3 pr-20 py-1.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/40 transition-all"
            />
            <button
              type="submit"
              disabled={isSimulating || !quickInput.trim()}
              className="absolute right-1 top-1 bottom-1 px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold flex items-center space-x-1 disabled:opacity-40 transition-all cursor-pointer"
            >
              <span>AI Test</span>
              <Send className="w-2.5 h-2.5" />
            </button>
          </form>

          <div className="flex items-center space-x-1.5 shrink-0 self-end sm:self-auto">
            <button
              onClick={handleRefreshClick}
              title="Khata Sync / Refresh karein"
              className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            <button
              onClick={onOpenLogs}
              title="Telegram Bot Logs dekhein"
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <span>Logs</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
