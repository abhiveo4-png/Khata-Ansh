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
    <div className="w-full bg-[#0e1526]/95 border border-slate-800/90 rounded-xl px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        
        {/* Left side: Link Code & Actions */}
        <div className="flex items-center space-x-2 shrink-0">
          
          {/* Telegram Bot Link Code Chip */}
          {linkCode ? (
            <button
              onClick={handleCopyLinkCode}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-cyan-500/30 hover:border-cyan-500/60 text-slate-200 text-xs transition-all cursor-pointer group active:scale-95"
              title="Click to copy /link command"
            >
              <span className="text-[11px] text-slate-400">Bot Link:</span>
              <span className="font-mono text-cyan-300 font-semibold">/link {linkCode}</span>
              {copiedCode ? (
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400 group-hover:text-cyan-300 shrink-0" />
              )}
            </button>
          ) : (
            <div className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
              <span>Bot Link:</span>
              <span className="text-slate-300 font-mono">/link login</span>
            </div>
          )}

          {/* Desktop Only: Bot status indicator if admin */}
          {isBotAdmin && (
            <button
              onClick={onOpenBotSetup}
              className="hidden md:inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-slate-300 text-xs transition-colors cursor-pointer"
              title="Telegram Bot Settings (Admin)"
            >
              <Bot className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] text-slate-400">@{botConfig?.botUsername || 'khata_ansh_bot'}</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            </button>
          )}
        </div>

        {/* Right side: Privacy Mode, Compact AI Tips, Ledger CSV & Sync Buttons */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          
          {/* Privacy Mode (Mask Balances) Button */}
          {onTogglePrivacyMode && (
            <button
              onClick={onTogglePrivacyMode}
              className={`inline-flex items-center justify-center p-1.5 rounded-lg border text-xs transition-all cursor-pointer active:scale-95 shadow-sm ${
                isPrivacyMode
                  ? 'bg-amber-950/70 border-amber-500/50 text-amber-300'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={isPrivacyMode ? 'Privacy Mode ON (Click to show amounts)' : 'Privacy Mode OFF (Click to hide/mask amounts ₹••••)'}
              aria-label="Toggle Privacy Mode"
            >
              {isPrivacyMode ? (
                <EyeOff className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* AI Tips Button (Icon-only on mobile, compact with text on larger screens) */}
          <button
            onClick={onOpenAiInsights}
            className="inline-flex items-center justify-center p-1.5 sm:px-2.5 sm:py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/70 border border-indigo-500/30 text-indigo-200 text-xs font-medium transition-all cursor-pointer active:scale-95 shadow-sm"
            title="Gemini AI Tips & Insights"
            aria-label="Gemini AI Tips"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="hidden sm:inline text-[11px] font-semibold whitespace-nowrap ml-1">AI Tips</span>
          </button>

          {/* Ledger CSV Download Button (Icon-Only Compact) */}
          {onExportCsv && (
            <button
              onClick={onExportCsv}
              className="inline-flex items-center justify-center p-1.5 rounded-lg bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 text-xs transition-all cursor-pointer active:scale-95 shadow-sm"
              title="Download Ledger as CSV"
              aria-label="Download Ledger CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Sync Button */}
          <button
            onClick={handleRefreshClick}
            title="Refresh Transactions"
            className="inline-flex items-center justify-center p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white text-xs transition-colors cursor-pointer active:scale-95 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>

      </div>
    </div>
  );
};

