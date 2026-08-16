import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Activity, 
  Cpu, 
  Zap, 
  Users, 
  Terminal, 
  Wifi, 
  Sparkles,
  Send,
  CheckCircle2,
  RefreshCw
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
  const [latency, setLatency] = useState<number>(14);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [quickInput, setQuickInput] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Slight jitter for realistic cyber latency readout
  useEffect(() => {
    const interval = setInterval(() => {
      setLatency(prev => Math.floor(12 + Math.random() * 8));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleRefreshClick = () => {
    setIsSyncing(true);
    onRefresh();
    setTimeout(() => setIsSyncing(false), 800);
  };

  const handleSimulateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    setIsSimulating(true);
    if (onQuickSimulate) {
      onQuickSimulate(quickInput.trim());
    }
    setQuickInput('');
    setTimeout(() => setIsSimulating(false), 600);
  };

  const isBotActive = Boolean(
    botConfig?.isConnected || 
    (botConfig?.botToken && botConfig?.botUsername) || 
    (botConfig?.isWebhookSet && botConfig?.botToken)
  );

  return (
    <div className="w-full bg-[#0a0f1d]/90 border border-indigo-500/20 rounded-2xl p-3 sm:p-4 backdrop-blur-xl relative overflow-hidden shadow-2xl shadow-indigo-950/40">
      {/* Decorative cyber grid overlay & corner markers */}
      <div className="absolute inset-0 cyber-grid opacity-30 pointer-events-none" />
      <div className="absolute top-0 left-0 w-8 h-[2px] bg-gradient-to-r from-cyan-400 to-transparent" />
      <div className="absolute top-0 left-0 w-[2px] h-8 bg-gradient-to-b from-cyan-400 to-transparent" />
      <div className="absolute bottom-0 right-0 w-8 h-[2px] bg-gradient-to-l from-indigo-500 to-transparent" />
      <div className="absolute bottom-0 right-0 w-[2px] h-8 bg-gradient-to-t from-indigo-500 to-transparent" />

      <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3.5">
        
        {/* Left: Real-time Telemetry Status Matrix */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          
          {/* Bot Gateway Telemetry */}
          <button
            onClick={onOpenBotSetup}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/60 hover:border-emerald-500/50 transition-all text-slate-200 group"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isBotActive ? 'bg-emerald-400' : 'bg-amber-400'
              }`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                isBotActive ? 'bg-emerald-500' : 'bg-amber-500'
              }`} />
            </span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">TELEGRAM GATEWAY:</span>
            <span className="font-mono font-bold text-emerald-400 group-hover:text-emerald-300">
              @{botConfig?.botUsername || 'khata_ansh_bot'}
            </span>
          </button>

          {/* AI Neural Engine Indicator */}
          <button
            onClick={onOpenAiInsights}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 hover:border-indigo-400/60 text-indigo-200 transition-all group"
          >
            <Cpu className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-indigo-300">GEMINI 3.7 FLASH:</span>
            <span className="font-mono font-bold text-cyan-400 group-hover:text-cyan-300">ONLINE (AI AUTO-TAG)</span>
          </button>

          {/* Latency & Ping */}
          <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-slate-400">
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span className="text-slate-500">PING:</span>
            <span className="text-emerald-400 font-bold">{latency}ms</span>
          </div>

          {/* Multi-Member Active Count */}
          {currentUser && currentUser.linkedMembers && currentUser.linkedMembers.length > 0 && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-violet-950/40 border border-violet-500/30 text-[11px] font-mono text-violet-300">
              <Users className="w-3 h-3 text-violet-400" />
              <span>FAMILY LINK:</span>
              <span className="font-bold text-white">{currentUser.linkedMembers.length} ACTIVE</span>
            </div>
          )}
        </div>

        {/* Right: Cyber Action Bar & Direct AI Simulation Prompt */}
        <div className="w-full lg:w-auto flex flex-col sm:flex-row items-center gap-2">
          
          {/* Direct Cyber Quick Parser Input */}
          <form onSubmit={handleSimulateSubmit} className="relative w-full sm:w-72">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <input
              type="text"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder="Test prompt: '250 petrol upi'..."
              className="w-full pl-8 pr-16 py-1.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-xs font-mono text-cyan-200 placeholder:text-slate-500 focus:outline-hidden focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 transition-all"
            />
            <button
              type="submit"
              disabled={isSimulating || !quickInput.trim()}
              className="absolute right-1 top-1 bottom-1 px-2.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 rounded-lg text-[10px] font-mono font-bold flex items-center space-x-1 disabled:opacity-40 transition-all"
            >
              <span>SEND</span>
              <Send className="w-2.5 h-2.5" />
            </button>
          </form>

          {/* Quick HUD Action Buttons */}
          <div className="flex items-center space-x-1.5 shrink-0 self-end sm:self-auto">
            <button
              onClick={handleRefreshClick}
              title="Sync Ledger"
              className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-cyan-400 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
            </button>

            <button
              onClick={onOpenLogs}
              title="Inspect Webhook Logs"
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-indigo-400 text-slate-300 hover:text-white text-xs font-mono flex items-center space-x-1.5 transition-all"
            >
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">LOGS</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
