import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  TrendingUp, 
  Lightbulb, 
  CheckCircle2, 
  RefreshCw,
  Cpu,
  Zap,
  Activity
} from 'lucide-react';
import { FinancialSummary } from '../types';
import { safeFetchJson } from '../utils/api';

interface AiInsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: FinancialSummary;
}

interface InsightsData {
  overview: string;
  keyInsights: string[];
  savingTips: string[];
  healthScore: number;
  verdict: 'Excellent' | 'Good' | 'Needs Attention' | 'Critical';
}

export const AiInsightsModal: React.FC<AiInsightsModalProps> = ({
  isOpen,
  onClose,
  summary,
}) => {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<InsightsData | null>(null);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const { data } = await safeFetchJson<{ insights?: InsightsData }>('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (data?.insights) {
        setInsights(data.insights);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !insights) {
      fetchInsights();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#090d18] border border-cyan-500/30 rounded-2xl max-w-xl w-full shadow-2xl shadow-cyan-950/50 overflow-hidden relative animate-in fade-in zoom-in duration-200">
        
        {/* Cyber Header */}
        <div className="bg-gradient-to-r from-cyan-950 via-indigo-950 to-slate-950 px-6 py-4 flex items-center justify-between text-white border-b border-cyan-500/20">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
              <Cpu className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-white font-display">GEMINI NEURAL WEALTH MATRIX</h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-bold">
                  AI 3.7 FLASH
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Predictive cashflow telemetry & optimization algorithms
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto font-mono text-xs">
          
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Sparkles className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
              <h4 className="text-sm font-semibold text-white font-display">SYNTHESIZING NEURAL TELEMETRY...</h4>
              <p className="text-xs text-slate-400 font-mono">Gemini 3.7 Flash is evaluating cashflow vectors</p>
            </div>
          ) : insights ? (
            <>
              {/* Financial Health Score Banner */}
              <div className="bg-gradient-to-br from-[#0c1426] to-[#0f1b33] rounded-2xl p-5 border border-cyan-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
                    SYSTEM HEALTH COEFFICIENT
                  </span>
                  <div className="flex items-baseline space-x-3 mt-1">
                    <span className="text-3xl font-extrabold text-white font-mono">
                      {insights.healthScore || 85}/100
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                      insights.verdict === 'Excellent' || insights.verdict === 'Good'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                        : 'bg-amber-950 text-amber-300 border-amber-500/40'
                    }`}>
                      {insights.verdict || 'OPTIMAL'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed font-sans">
                    {insights.overview}
                  </p>
                </div>
              </div>

              {/* Key Observations */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center space-x-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  <span>KEY CASHFLOW OBSERVATIONS</span>
                </h4>
                <div className="space-y-2">
                  {insights.keyInsights?.map((item, i) => (
                    <div
                      key={i}
                      className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-200 flex items-start space-x-2.5"
                    >
                      <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <span className="font-sans text-xs">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Saving Tips */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center space-x-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                  <span>AI OPTIMIZATION VECTORS</span>
                </h4>
                <div className="space-y-2">
                  {insights.savingTips?.map((tip, i) => (
                    <div
                      key={i}
                      className="p-3 bg-amber-950/20 rounded-xl border border-amber-500/30 text-xs text-amber-200 flex items-start space-x-2.5"
                    >
                      <span className="w-5 h-5 rounded-md bg-amber-950 border border-amber-500/40 text-amber-300 font-bold flex items-center justify-center shrink-0 text-[10px] font-mono">
                        0{i + 1}
                      </span>
                      <span className="font-sans text-xs">{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              No telemetry available.
            </div>
          )}

        </div>

        {/* Cyber Footer */}
        <div className="bg-slate-950 border-t border-slate-800 px-6 py-3.5 flex items-center justify-between font-mono text-xs">
          <button
            onClick={fetchInsights}
            disabled={loading}
            className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center space-x-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>RE-COMPUTE</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl font-bold transition-all cursor-pointer"
          >
            CLOSE HUD
          </button>
        </div>

      </div>
    </div>
  );
};
