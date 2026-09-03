import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  TrendingUp, 
  Lightbulb, 
  CheckCircle2, 
  RefreshCw,
  Cpu,
  AlertTriangle,
  PiggyBank,
  ArrowDownRight,
  TrendingDown,
  Coins
} from 'lucide-react';
import { FinancialSummary, AiFinancialInsights } from '../types';
import { safeFetchJson } from '../utils/api';

interface AiInsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: FinancialSummary;
}

export const AiInsightsModal: React.FC<AiInsightsModalProps> = ({
  isOpen,
  onClose,
  summary,
}) => {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<AiFinancialInsights | null>(null);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const { data } = await safeFetchJson<{ insights?: AiFinancialInsights }>('/api/ai/insights', {
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

  const avoidable = insights?.avoidableExpenses;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#090d18] border border-cyan-500/30 rounded-2xl max-w-2xl w-full shadow-2xl shadow-cyan-950/60 overflow-hidden relative animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-950 via-slate-900 to-indigo-950 px-6 py-4 flex items-center justify-between text-white border-b border-cyan-500/20">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-inner shadow-cyan-500/20">
              <Cpu className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-white tracking-wide font-display">
                  GEMINI AI FINANCIAL ADVISOR
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/90 border border-cyan-500/40 text-cyan-300 font-bold">
                  GEMINI 3.8 FLASH
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Faltu kharcha analysis, potential bachat aur smart finance tips
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-xs">
          
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <Sparkles className="w-10 h-10 text-cyan-400 animate-spin mx-auto" />
              <h4 className="text-sm font-semibold text-white font-display">GEMINI AI AAPKE KHARCHON KO ANALYZE KAR RAHA HAI...</h4>
              <p className="text-xs text-slate-400 font-mono">Faltu kharche aur saving opportunities detect ki ja rahi hain</p>
            </div>
          ) : insights ? (
            <>
              {/* Financial Health & Overview */}
              <div className="bg-gradient-to-br from-[#0d1629] to-[#0f1d38] rounded-2xl p-5 border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                      FINANCIAL HEALTH SCORE
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      insights.verdict === 'Excellent' || insights.verdict === 'Good'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                        : 'bg-amber-950 text-amber-300 border-amber-500/40'
                    }`}>
                      {insights.verdict || 'GOOD'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {insights.overview}
                  </p>
                </div>
                <div className="text-center sm:text-right bg-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-700/60 shrink-0">
                  <div className="text-2xl font-black text-white font-mono">
                    {insights.healthScore || 85}<span className="text-sm font-normal text-slate-400">/100</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Score Status</span>
                </div>
              </div>

              {/* FALTU KHARCHA & POTENTIAL SAVINGS SPOTLIGHT */}
              {avoidable && (
                <div className="bg-slate-900/90 rounded-2xl p-5 border border-amber-500/30 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-950/80 border border-amber-500/40 flex items-center justify-center text-amber-400">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-xs tracking-wide">
                          FALTU KHARCHA AUR POTENTIAL BACHAT
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          Discretionary kharche jinhein control karke aap moti bachat kar sakte hain
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 3 Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    
                    {/* Avoidable Spent */}
                    <div className="p-3.5 bg-rose-950/20 border border-rose-500/30 rounded-xl space-y-1">
                      <span className="text-[10px] text-rose-300 font-semibold uppercase tracking-wider flex items-center gap-1">
                        <TrendingDown className="w-3 h-3 text-rose-400" />
                        Faltu / Avoidable
                      </span>
                      <div className="text-lg font-bold text-rose-400 font-mono">
                        ₹{avoidable.totalAvoidableAmount.toLocaleString('en-IN')}
                      </div>
                      <p className="text-[10px] text-rose-300/80 font-mono">
                        Kul kharche ka {avoidable.percentageOfExpenses}%
                      </p>
                    </div>

                    {/* Potential Monthly Savings */}
                    <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-1">
                      <span className="text-[10px] text-emerald-300 font-semibold uppercase tracking-wider flex items-center gap-1">
                        <PiggyBank className="w-3 h-3 text-emerald-400" />
                        Mahine Ki Bachat
                      </span>
                      <div className="text-lg font-bold text-emerald-400 font-mono">
                        +₹{avoidable.potentialMonthlySavings.toLocaleString('en-IN')}
                      </div>
                      <p className="text-[10px] text-emerald-300/80 font-mono">
                        Agar 60% control karein
                      </p>
                    </div>

                    {/* Yearly Savings */}
                    <div className="p-3.5 bg-cyan-950/20 border border-cyan-500/30 rounded-xl space-y-1">
                      <span className="text-[10px] text-cyan-300 font-semibold uppercase tracking-wider flex items-center gap-1">
                        <Coins className="w-3 h-3 text-cyan-400" />
                        1 Saal Ki Bachat
                      </span>
                      <div className="text-lg font-bold text-cyan-300 font-mono">
                        +₹{avoidable.potentialYearlySavings.toLocaleString('en-IN')}
                      </div>
                      <p className="text-[10px] text-cyan-300/80 font-mono">
                        Yearly wealth generation
                      </p>
                    </div>

                  </div>

                  {/* Identified Faltu Items Breakdown */}
                  {avoidable.items && avoidable.items.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <span>Yeh Paisa Kaha Faltu Kharch Hua:</span>
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {avoidable.items.map((item, idx) => (
                          <div 
                            key={idx} 
                            className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 flex items-start justify-between gap-3"
                          >
                            <div className="space-y-0.5">
                              <div className="font-semibold text-white text-xs">
                                {item.title}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {item.reason || item.category}
                              </div>
                              <span className="inline-block text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono mt-1">
                                {item.category}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-rose-400 text-xs shrink-0">
                              ₹{item.amount.toLocaleString('en-IN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Investment Advice */}
                  {avoidable.investmentAdvice && (
                    <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-950/40 via-cyan-950/30 to-slate-950 border border-cyan-500/30 flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-md bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0 mt-0.5">
                        <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                          GEMINI INVESTMENT PROJECTION
                        </span>
                        <p className="text-xs text-slate-200 leading-relaxed">
                          {avoidable.investmentAdvice}
                        </p>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* Bachat & Action Tips */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center space-x-1.5">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  <span>GEMINI ACTION TIPS (BACHAT KAISE KAREIN)</span>
                </h4>
                <div className="space-y-2">
                  {insights.savingTips?.map((tip, i) => (
                    <div
                      key={i}
                      className="p-3.5 bg-amber-950/15 rounded-xl border border-amber-500/30 text-xs text-amber-200 flex items-start space-x-3"
                    >
                      <span className="w-5 h-5 rounded-md bg-amber-950 border border-amber-500/40 text-amber-300 font-bold flex items-center justify-center shrink-0 text-[10px] font-mono">
                        0{i + 1}
                      </span>
                      <span className="text-xs text-slate-200 leading-relaxed font-sans">{tip}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key Observations */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 flex items-center space-x-1.5">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  <span>KHAAS OBSERVATIONS</span>
                </h4>
                <div className="space-y-2">
                  {insights.keyInsights?.map((item, i) => (
                    <div
                      key={i}
                      className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-start space-x-2.5"
                    >
                      <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <span className="text-xs leading-relaxed font-sans">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

            </>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              Data available nahi hai. Pehle kuch transactions record karein.
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-950 border-t border-slate-800 px-6 py-3.5 flex items-center justify-between text-xs">
          <button
            onClick={fetchInsights}
            disabled={loading}
            className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>FIR SE RE-ANALYZE KAREIN</span>
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
          >
            THEEK HAI / BAND KAREIN
          </button>
        </div>

      </div>
    </div>
  );
};
