import React, { useState } from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  Copy, 
  Check, 
  Download,
  Bot,
  CheckCircle2,
  Eye,
  EyeOff
} from 'lucide-react';
import { BotConfig, UserProfile } from '../types';

interface FuturisticHudProps {
  botConfig: BotConfig | null;
  currentUser: UserProfile | null;
  transactionCount: number;
  isPrivacyMode?: boolean;
  onTogglePrivacyMode?: () => void;
  onOpenBotSetup: () => void;
  onOpenAiInsights: () => void;
  onRefresh: () => void;
  onExportCsv?: () => void;
}

export const FuturisticHud: React.FC<FuturisticHudProps> = ({
  botConfig,
  currentUser,
  transactionCount,
  isPrivacyMode = false,
  onTogglePrivacyMode,
  onOpenBotSetup,
  onOpenAiInsights,
  onRefresh,
  onExportCsv,
}) => {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleRefreshClick = () => {
    setIsSyncing(true);
    onRefresh();
    setTimeout(() => setIsSyncing(false), 600);
  };

  const linkCode = currentUser?.linkCode || currentUser?.telegramLinkCode;
  const isBotAdmin = currentUser?.email?.trim().toLowerCase() === 'abhiveo4@gmail.com';
  const isBotActive = Boolean(
    botConfig?.isConnected || 
    (botConfig?.botToken && botConfig?.botUsername) || 
    (botConfig?.isWebhookSet && botConfig?.botToken)
  );

  const handleCopyLinkCode = () => {
    if (linkCode) {
      navigator.clipboard.writeText(`/link ${linkCode}`);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-white/[0.08] rounded-2xl px-3.5 py-2.5 shadow-lg shadow-black/25">
      <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        
        {/* Left side: Link Code & Actions */}
        <div className="flex items-center space-x-2 shrink-0">
          
          {/* Telegram Bot Link Code Chip */}
          {linkCode ? (
            <button
              onClick={handleCopyLinkCode}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:border-cyan-400 text-slate-200 text-xs transition-all cursor-pointer group active:scale-95 backdrop-blur-md shadow-xs shadow-cyan-500/10"
              title="Click to copy /link command"
            >
              <span className="text-[11px] text-cyan-300 font-medium">Bot Link:</span>
              <span className="font-mono text-cyan-300 font-bold">/link {linkCode}</span>
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-in zoom-in-50 duration-200" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-cyan-400/80 group-hover:text-cyan-200 shrink-0 transition-transform group-hover:scale-110" />
              )}
            </button>
          ) : (
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-400">
              <span>Bot Link:</span>
              <span className="text-slate-300 font-mono font-medium">/link login</span>
            </div>
          )}

          {/* Desktop Only: Bot status indicator if admin */}
          {isBotAdmin && (
            <button
              onClick={onOpenBotSetup}
              className="hidden md:inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 hover:border-emerald-400 text-emerald-300 text-xs transition-all cursor-pointer backdrop-blur-md shadow-xs"
              title="Telegram Bot Settings (Admin)"
            >
              <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Bot className="w-3 h-3 text-emerald-400" />
              </div>
              <span className="text-[11px] text-emerald-300 font-medium">@{botConfig?.botUsername || 'khata_ansh_bot'}</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </button>
          )}
        </div>

        {/* Right side: Privacy Mode, Compact AI Tips, Ledger CSV & Sync Buttons */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          
          {/* Privacy Mode (Mask Balances) Button */}
          {onTogglePrivacyMode && (
            <button
              onClick={onTogglePrivacyMode}
              className={`inline-flex items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer active:scale-95 shadow-xs backdrop-blur-md ${
                isPrivacyMode
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-amber-500/20'
                  : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.1] text-slate-400 hover:text-slate-200'
              }`}
              title={isPrivacyMode ? 'Privacy Mode ON (Click to show amounts)' : 'Privacy Mode OFF (Click to hide/mask amounts ₹••••)'}
              aria-label="Toggle Privacy Mode"
            >
              {isPrivacyMode ? (
                <EyeOff className="w-4 h-4 text-amber-300 animate-pulse" />
              ) : (
                <Eye className="w-4 h-4 text-slate-300" />
              )}
            </button>
          )}

          {/* AI Tips Button (Icon-only on mobile, compact with text on larger screens) */}
          <button
            onClick={onOpenAiInsights}
            className="inline-flex items-center justify-center p-2 sm:px-3 sm:py-1.5 rounded-xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-500/40 hover:border-indigo-400 text-indigo-200 text-xs font-semibold transition-all cursor-pointer active:scale-95 shadow-md shadow-indigo-500/20 backdrop-blur-md"
            title="Gemini AI Tips & Insights"
            aria-label="Gemini AI Tips"
          >
            <Sparkles className="w-4 h-4 text-indigo-300 shrink-0" />
            <span className="hidden sm:inline text-[11px] font-semibold whitespace-nowrap ml-1.5 text-indigo-200">AI Tips</span>
          </button>

          {/* Ledger CSV Download Button (Icon-Only Compact) */}
          {onExportCsv && (
            <button
              onClick={onExportCsv}
              className="inline-flex items-center justify-center p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 hover:text-white text-xs transition-all cursor-pointer active:scale-95 shadow-xs shadow-emerald-500/15 backdrop-blur-md"
              title="Download Ledger as CSV"
              aria-label="Download Ledger CSV"
            >
              <Download className="w-4 h-4 text-emerald-400" />
            </button>
          )}

          {/* Sync Button */}
          <button
            onClick={handleRefreshClick}
            title="Refresh Transactions"
            className="inline-flex items-center justify-center p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-slate-400 hover:text-white text-xs transition-all cursor-pointer active:scale-95 shrink-0 backdrop-blur-md"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-indigo-400' : 'text-slate-300'}`} />
          </button>
        </div>

      </div>
    </div>
  );
};

