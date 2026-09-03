import React, { useState } from 'react';
import { 
  X, 
  Bot, 
  Check, 
  Copy, 
  ExternalLink, 
  AlertTriangle, 
  ShieldCheck, 
  RefreshCw, 
  Trash2,
  Send,
  Sparkles,
  Cpu,
  Radio,
  Terminal,
  Zap
} from 'lucide-react';
import { BotConfig } from '../types';
import { safeFetchJson } from '../utils/api';

interface TelegramBotSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  botConfig: BotConfig | null;
  webhookUrl: string;
  appUrl: string;
  onRefreshConfig: () => void;
}

export const TelegramBotSetupModal: React.FC<TelegramBotSetupModalProps> = ({
  isOpen,
  onClose,
  botConfig,
  webhookUrl,
  appUrl,
  onRefreshConfig,
}) => {
  const [tokenInput, setTokenInput] = useState(botConfig?.botToken || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingWebhook, setIsSettingWebhook] = useState(false);
  const [isSyncingCommands, setIsSyncingCommands] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSyncCommands = async () => {
    setIsSyncingCommands(true);
    setStatusMessage(null);
    try {
      const { data, error } = await safeFetchJson<{ success?: boolean; message?: string; error?: string }>('/api/telegram/sync-commands', {
        method: 'POST',
      });
      if (data?.success) {
        setStatusMessage({
          type: 'success',
          text: '✅ Telegram Bot Menu List & Handy Action Buttons safaltapoorvak Telegram server par sync ho gaye! Ab aap Telegram me bot ke Menu button aur quick buttons dekh sakte hain.',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: data?.error || error || 'Failed to sync Telegram commands.',
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error syncing commands' });
    } finally {
      setIsSyncingCommands(false);
    }
  };

  const handleSaveAndSetWebhook = async () => {
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid Telegram Bot Token from @BotFather' });
      return;
    }

    setIsSettingWebhook(true);
    setStatusMessage(null);

    try {
      // 1. Save Token
      await safeFetchJson('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: trimmed }),
      });

      // 2. Set Webhook
      const { data: hookData } = await safeFetchJson<{ success?: boolean; error?: string }>('/api/telegram/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: trimmed,
          webhookUrl: webhookUrl,
        }),
      });

      if (hookData?.success) {
        setStatusMessage({
          type: 'success',
          text: `⚡ Neural bot link established! Webhook registered. Send messages like "300 zomato" to @${botConfig?.botUsername || 'your bot'} on Telegram!`,
        });
        onRefreshConfig();
      } else {
        setStatusMessage({
          type: 'error',
          text: hookData?.error || 'Failed to register webhook with Telegram API.',
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Network error connecting to Telegram' });
    } finally {
      setIsSettingWebhook(false);
    }
  };

  const handleDeleteWebhook = async () => {
    if (!confirm('Are you sure you want to disconnect Telegram Webhook?')) return;
    setIsSaving(true);
    try {
      await safeFetchJson('/api/telegram/delete-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: tokenInput }),
      });
      setStatusMessage({ type: 'success', text: 'Webhook disconnected.' });
      onRefreshConfig();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#090d18] border border-cyan-500/30 rounded-2xl max-w-2xl w-full shadow-2xl shadow-cyan-950/50 overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-cyan-950 via-slate-900 to-indigo-950 px-6 py-4 flex items-center justify-between text-white border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white font-display">TELEGRAM BOT CONNECT KAREIN</h3>
              <p className="text-xs text-slate-400 font-mono">
                Telegram Webhook ke zariye direct kharcha aur kamai record karein
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto font-mono text-xs">
          
          {/* Status banner */}
          {(botConfig?.isConnected || (botConfig?.botToken && botConfig?.botUsername)) ? (
            <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-4 flex items-start space-x-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-200">
                <p className="font-bold text-sm text-emerald-300 font-display">
                  TELEGRAM BOT CONNECTED HAI & ACTIVE HAI
                </p>
                <p className="mt-1">
                  Bot username: <b className="text-cyan-300">@{botConfig.botUsername || 'Telegram Bot'}</b>
                </p>
                <p className="mt-0.5 text-slate-400">
                  Telegram par bheja gaya koi bhi message (jaise "300 petrol upi") turant AI dwara samajh kar khate me jud jayega.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-4 flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200">
                <p className="font-bold text-sm text-amber-300 font-display">
                  BOT DISCONNECTED HAI
                </p>
                <p className="mt-1">
                  Neeche diye gaye 2-minute ke asaan steps se apna free Telegram bot connect karein.
                </p>
              </div>
            </div>
          )}

          {statusMessage && (
            <div className={`rounded-xl p-3.5 text-xs font-mono border ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
            }`}>
              {statusMessage.text}
            </div>
          )}

          {/* 3 Step Guide */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
              BOT SETUP KE ASAAN STEPS:
            </h4>

            <div className="grid grid-cols-1 gap-2.5 text-xs">
              
              {/* Step 1 */}
              <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white font-display">
                    1. Telegram par Bot Token banayein
                  </span>
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 font-bold inline-flex items-center space-x-1"
                  >
                    <span>@BotFather kholein</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-slate-400 text-[11px] mt-1 font-mono">
                  BotFather ko <code className="text-cyan-300 bg-slate-950 px-1 rounded">/newbot</code> command bhejein aur wahan se mila API Token copy karein.
                </p>
              </div>

              {/* Step 2 */}
              <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 space-y-2">
                <span className="font-bold text-white font-display">
                  2. Telegram Bot Token yahan paste karein
                </span>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="HTTP API Token paste karein (jaise: 123456789:ABCdef...)"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-cyan-300 text-xs font-mono focus:border-cyan-400 outline-hidden"
                />
              </div>

              {/* Step 3 */}
              <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white font-display">
                    3. Webhook URL (Auto-generated)
                  </span>
                  <button
                    onClick={handleCopyWebhook}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="p-2 bg-slate-950 rounded-lg text-[10px] text-slate-400 break-all border border-slate-800">
                  {webhookUrl}
                </div>
              </div>

            </div>
          </div>

          {/* Telegram Handy Buttons & Command Menu Showcase */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 rounded-xl p-4 border border-cyan-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold text-white font-display uppercase tracking-wider">
                  TELEGRAM HANDY BUTTONS & MENU LIST
                </h4>
              </div>
              <button
                onClick={handleSyncCommands}
                disabled={isSyncingCommands}
                className="px-2.5 py-1 bg-cyan-950/80 hover:bg-cyan-900/80 border border-cyan-500/40 rounded-lg text-[10px] text-cyan-300 font-bold flex items-center space-x-1 cursor-pointer transition-colors"
                title="Telegram Botfather commands and menu button ko sync karein"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncingCommands ? 'animate-spin' : ''}`} />
                <span>{isSyncingCommands ? 'SYNC HO RAHA HAI...' : 'SYNC MENU & BUTTONS'}</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-300">
              Bot ke sath <b>Handy Keyboard Buttons</b>, <b>Inline Action Buttons</b>, aur Telegram ka <b>Menu Button</b> activate kar diya gaya hai. Telegram me bas in buttons par tap karein:
            </p>

            {/* Visual Interactive Preview of Buttons */}
            <div className="bg-slate-950/90 rounded-xl p-3 border border-slate-800 space-y-2">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>📱 TELEGRAM CHAT SCREEN BUTTONS PREVIEW</span>
                <span className="text-emerald-400 font-bold">● ACTIVE</span>
              </div>
              
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <div className="bg-slate-900 border border-cyan-500/30 text-cyan-200 px-2.5 py-1.5 rounded-lg text-center font-bold text-[11px]">
                  💰 Balance
                </div>
                <div className="bg-slate-900 border border-cyan-500/30 text-cyan-200 px-2.5 py-1.5 rounded-lg text-center font-bold text-[11px]">
                  📊 Summary
                </div>
                <div className="bg-slate-900 border border-amber-500/30 text-amber-200 px-2.5 py-1.5 rounded-lg text-center font-bold text-[11px]">
                  🤖 AI Tips & Bachat
                </div>
                <div className="bg-slate-900 border border-indigo-500/30 text-indigo-200 px-2.5 py-1.5 rounded-lg text-center font-bold text-[11px]">
                  🕒 Recent 5 Tx
                </div>
                <div className="bg-slate-900 border border-purple-500/30 text-purple-200 px-2.5 py-1.5 rounded-lg text-center font-bold text-[11px]">
                  🏷️ Categories
                </div>
                <div className="bg-slate-900 border border-rose-500/30 text-rose-200 px-2.5 py-1.5 rounded-lg text-center font-bold text-[11px]">
                  ↩️ Undo Last
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                <div className="bg-slate-900/60 border border-slate-700/60 text-slate-300 px-2 py-1 rounded-lg text-center text-[10px]">
                  ❓ Help & Guide
                </div>
                <div className="bg-slate-900/60 border border-slate-700/60 text-slate-300 px-2 py-1 rounded-lg text-center text-[10px]">
                  📱 Handy Buttons
                </div>
              </div>
            </div>

            {/* Menu List items */}
            <div className="text-[10px] text-slate-400 space-y-1">
              <span className="font-bold text-slate-300">📋 Telegram "Menu" Button me registered commands:</span>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[10px] text-slate-400">
                <span>• <code>/balance</code> - Kul bachat</span>
                <span>• <code>/summary</code> - Mahina report</span>
                <span>• <code>/tips</code> - Gemini Faltu kharcha</span>
                <span>• <code>/recent</code> - Aakhri 5 transactions</span>
                <span>• <code>/buttons</code> - Handy buttons</span>
                <span>• <code>/categories</code> - Active categories</span>
                <span>• <code>/undo</code> - Aakhri kharcha delete</span>
                <span>• <code>/help</code> - Full guide</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            {botConfig?.botToken && (
              <button
                onClick={handleDeleteWebhook}
                disabled={isSaving}
                className="text-rose-400 hover:text-rose-300 text-xs flex items-center space-x-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>BOT DISCONNECT KAREIN</span>
              </button>
            )}

            <div className="flex items-center space-x-2 ml-auto">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
              >
                BAND KAREIN
              </button>
              <button
                onClick={handleSaveAndSetWebhook}
                disabled={isSettingWebhook}
                className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-md shadow-cyan-950 flex items-center space-x-1.5 cursor-pointer"
              >
                {isSettingWebhook ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>CONNECT HO RAHA HAI...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 stroke-[3]" />
                    <span>BOT CONNECT KAREIN</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
