import React, { useState } from 'react';
import { 
  Bot,
  Sparkles, 
  Users, 
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  Plus
} from 'lucide-react';
import { BotConfig, UserProfile } from '../types';

interface FuturisticHudProps {
  botConfig: BotConfig | null;
  currentUser: UserProfile | null;
  transactionCount: number;
  onOpenBotSetup: () => void;
  onOpenAiInsights: () => void;
  onRefresh: () => void;
  onOpenAddModal?: () => void;
}

export const FuturisticHud: React.FC<FuturisticHudProps> = ({
  botConfig,
  currentUser,
  transactionCount,
  onOpenBotSetup,
  onOpenAiInsights,
  onRefresh,
  onOpenAddModal,
}) => {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleRefreshClick = () => {
    setIsSyncing(true);
    onRefresh();
    setTimeout(() => setIsSyncing(false), 600);
  };

  const handleCopyLinkCode = () => {
    const code = currentUser?.linkCode || currentUser?.telegramLinkCode;
    if (code) {
      navigator.clipboard.writeText(`/link ${code}`);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const isBotActive = Boolean(
    botConfig?.isConnected || 
    (botConfig?.botToken && botConfig?.botUsername) || 
    (botConfig?.isWebhookSet && botConfig?.botToken)
  );

  const linkCode = currentUser?.linkCode || currentUser?.telegramLinkCode;

  return (
    <div className="w-full bg-[#0e1526] border border-slate-800 rounded-2xl px-4 py-3 shadow-md shadow-black/20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        
        {/* Left: Active Status Badges */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          
          {/* Telegram Bot Live Status */}
          <button
            onClick={onOpenBotSetup}
            className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 transition-all text-slate-200 cursor-pointer group"
            title="Telegram Bot Settings"
          >
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isBotActive ? 'bg-emerald-400' : 'bg-amber-400'
              }`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                isBotActive ? 'bg-emerald-500' : 'bg-amber-500'
              }`} />
            </span>
            <span className="text-[11px] text-slate-400">Telegram Bot:</span>
            <span className="font-semibold text-emerald-400 group-hover:text-emerald-300">
              @{botConfig?.botUsername || 'khata_ansh_bot'}
            </span>
          </button>

          {/* AI Insights Chip */}
          <button
            onClick={onOpenAiInsights}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/40 border border-indigo-500/20 hover:border-indigo-500/50 text-indigo-200 transition-all cursor-pointer"
            title="AI Financial Insights"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[11px] text-indigo-300 font-medium">Gemini AI Active</span>
          </button>

          {/* Telegram Link Code Chip (if user has code) */}
          {currentUser && linkCode && !currentUser.telegramChatId && (
            <button
              onClick={handleCopyLinkCode}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 hover:border-cyan-500/50 text-slate-300 hover:text-white transition-all cursor-pointer text-xs"
              title="Click to copy /link command"
            >
              <span className="text-[11px] text-slate-400">Bot Link:</span>
              <span className="font-mono text-cyan-300 font-semibold">/link {linkCode}</span>
              {copiedCode ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400" />
              )}
            </button>
          )}

          {/* Family Link Badge */}
          {currentUser && currentUser.linkedMembers && currentUser.linkedMembers.length > 1 && (
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-violet-950/30 border border-violet-500/20 text-[11px] text-violet-300">
              <Users className="w-3.5 h-3.5 text-violet-400" />
              <span>{currentUser.linkedMembers.length} Members</span>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-2 self-end sm:self-auto shrink-0">
          <button
            onClick={handleRefreshClick}
            title="Refresh Transactions"
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
            <span className="text-[11px] font-medium">Sync Now</span>
          </button>

          {onOpenAddModal && (
            <button
              onClick={onOpenAddModal}
              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Entry</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
