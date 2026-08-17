import React, { useState, useEffect } from 'react';
import { X, Activity, Trash2, RefreshCw, CheckCircle2, AlertCircle, Clock, Bot, Send, Terminal } from 'lucide-react';
import { TelegramLog } from '../types';
import { formatDate } from '../utils/formatters';
import { safeFetchJson } from '../utils/api';

interface TelegramLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TelegramLogsModal: React.FC<TelegramLogsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [logs, setLogs] = useState<TelegramLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data } = await safeFetchJson<{ logs?: TelegramLog[] }>('/api/telegram/logs');
      if (data?.logs) {
        setLogs(data.logs);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm('Purge all webhook event logs?')) return;
    const { ok } = await safeFetchJson('/api/telegram/logs', { method: 'DELETE' });
    if (ok) {
      setLogs([]);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#090d18] border border-cyan-500/30 rounded-2xl max-w-2xl w-full shadow-2xl shadow-cyan-950/50 overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Cyber Header */}
        <div className="bg-gradient-to-r from-cyan-950 via-slate-900 to-indigo-950 px-6 py-4 flex items-center justify-between text-white border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white font-display">TELEGRAM WEBHOOK LOGS</h3>
              <p className="text-xs text-slate-400 font-mono">
                Telegram se aaye messages aur bot ke responses ka live record
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

        {/* Action bar */}
        <div className="px-6 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
          <span className="text-cyan-400">{logs.length} MESSAGES RECORDED</span>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchLogs}
              className="px-2.5 py-1 rounded-lg border border-slate-800 hover:bg-slate-900 text-slate-300 flex items-center space-x-1 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>REFRESH KAREIN</span>
            </button>
            {logs.length > 0 && (
              <button
                onClick={handleClearLogs}
                className="px-2.5 py-1 rounded-lg border border-slate-800 hover:bg-rose-950/40 text-rose-400 flex items-center space-x-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>LOGS SAAF KAREIN</span>
              </button>
            )}
          </div>
        </div>

        {/* Logs content */}
        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              Abhi tak koi webhook message nahi aaya hai.
            </div>
          ) : (
            logs.map((log) => {
              const isSuccess = log.status === 'success';
              return (
                <div
                  key={log.id}
                  className={`p-3.5 rounded-xl border ${
                    isSuccess
                      ? 'bg-slate-900/60 border-slate-800 hover:border-cyan-500/40'
                      : 'bg-rose-950/20 border-rose-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                      {isSuccess ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      )}
                      <span className="font-bold text-white uppercase">{log.status === 'success' ? 'Kamyab' : 'Error'}</span>
                      {log.action && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/30 text-cyan-300 text-[10px]">
                          {log.action}
                        </span>
                      )}
                    </div>
                    <span className="text-slate-500 text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-slate-300 text-[11px]">
                    {log.rawText && (
                      <p className="flex items-center gap-1">
                        <span className="text-slate-500">MESSAGE:</span>
                        <span className="text-cyan-300 font-bold">"{log.rawText}"</span>
                      </p>
                    )}
                    {log.sender && (
                      <p className="flex items-center gap-1">
                        <span className="text-slate-500">BHEJNE WALA:</span>
                        <span className="text-white">{log.sender}</span>
                      </p>
                    )}
                    {log.response && (
                      <p className="flex items-center gap-1">
                        <span className="text-slate-500">BOT JAWAB:</span>
                        <span className="text-slate-400">{log.response}</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="bg-slate-950 px-6 py-3 border-t border-slate-800 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 border border-slate-700 hover:text-white text-slate-300 rounded-xl text-xs font-mono font-bold cursor-pointer"
          >
            BAND KAREIN
          </button>
        </div>

      </div>
    </div>
  );
};
