import React, { useState, useEffect, useRef } from 'react';
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
  TrendingDown,
  Coins,
  Send,
  MessageSquare,
  Bot,
  User,
  ShieldCheck,
  CreditCard,
  Target,
  Key,
  Check,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { FinancialSummary, AiFinancialInsights, AiChatMessage } from '../types';
import { safeFetchJson } from '../utils/api';

function FormattedAiMessage({ text }: { text: string }) {
  // Convert markdown bold and HTML tags to clean formatted HTML safely
  const formattedHtml = text
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/(?<!\*)\*(.*?)\*(?!\*)/g, '<i>$1</i>')
    .replace(/<b>(.*?)<\/b>/g, '<strong class="font-bold text-white tracking-wide">$1</strong>')
    .replace(/<i>(.*?)<\/i>/g, '<em class="italic text-cyan-200/90">$1</em>')
    .replace(/<code>(.*?)<\/code>/g, '<code class="bg-cyan-950/90 px-1.5 py-0.5 rounded text-cyan-300 border border-cyan-500/40 font-mono text-[11px]">$1</code>')
    .replace(/\n/g, '<br />');

  return (
    <div
      className="text-xs leading-relaxed font-sans"
      dangerouslySetInnerHTML={{ __html: formattedHtml }}
    />
  );
}

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
  const [activeTab, setActiveTab] = useState<'chat' | 'insights'>('chat');
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<AiFinancialInsights | null>(null);

  // Key status and inline key configuration
  const [geminiKeyInfo, setGeminiKeyInfo] = useState<{ hasKey: boolean; maskedKey?: string } | null>(null);
  const [showKeyBar, setShowKeyBar] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keySaveMsg, setKeySaveMsg] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome_msg',
      sender: 'ai',
      text: `Namaste! Main aapka <b>Gemini AI Financial Planner & Wealth Advisor</b> hoon. 🤖\n\nAapka live khata (Bank balances, Credit Card dues, Expenses, Investments, Udhaar aur Goals) mere paas connected hai.\n\nAap mujhse <b>financial planning, goal strategy, investments (Mutual Funds, FD, Gold), credit card management ya kharcha kam karne</b> ke baare me kuch bhi poochh sakte hain!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      model: 'Gemini 3.8 Flash'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const checkGeminiKey = async () => {
    const { data } = await safeFetchJson<{ hasKey: boolean; maskedKey?: string }>('/api/gemini/config');
    if (data) {
      setGeminiKeyInfo(data);
    }
  };

  const handleSaveGeminiKey = async () => {
    const cleanKey = keyInput.trim();
    if (!cleanKey) return;
    setIsSavingKey(true);
    setKeySaveMsg(null);
    try {
      const { data } = await safeFetchJson<{ success?: boolean; message?: string }>('/api/gemini/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: cleanKey }),
      });
      if (data?.success) {
        setKeySaveMsg('✅ API Key successfully saved and active!');
        setKeyInput('');
        checkGeminiKey();
        setTimeout(() => {
          setShowKeyBar(false);
          setKeySaveMsg(null);
        }, 2000);
      } else {
        setKeySaveMsg('Key saved.');
      }
    } finally {
      setIsSavingKey(false);
    }
  };

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
    if (isOpen) {
      checkGeminiKey();
      if (!insights) {
        fetchInsights();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const handleSendMessage = async (customPrompt?: string) => {
    const questionText = (customPrompt || inputValue).trim();
    if (!questionText || isAsking) return;

    const userMsg: AiChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: questionText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customPrompt) setInputValue('');
    setIsAsking(true);

    try {
      const historyPayload = messages
        .filter(m => m.id !== 'welcome_msg' && !m.id.startsWith('err_'))
        .slice(-8)
        .map(m => ({ role: (m.sender === 'user' ? 'user' : 'model') as 'user' | 'model', text: m.text }));

      const { data, error } = await safeFetchJson<{ text: string; model?: string }>('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questionText, history: historyPayload })
      });

      if (data?.text) {
        const aiMsg: AiChatMessage = {
          id: `ai_${Date.now()}`,
          sender: 'ai',
          text: data.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          model: data.model || 'Gemini 3.8 Flash'
        };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        const errorMsg: AiChatMessage = {
          id: `err_${Date.now()}`,
          sender: 'ai',
          text: error || 'Kshama karein, abhi answer generate karne me dikkat aayi. Kripya thodi der baad prayas karein.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } catch {
      const errorMsg: AiChatMessage = {
        id: `err_${Date.now()}`,
        sender: 'ai',
        text: 'Network issue. Kripya dobara try karein.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsAsking(false);
    }
  };

  if (!isOpen) return null;

  const avoidable = insights?.avoidableExpenses;

  const quickPrompts = [
    { label: '🎯 Monthly Budget & Planning', text: 'Meri monthly bachat badhane ke liye ek detailed financial planning batao mere kharchon aur kamai ke hisaab se.' },
    { label: '📈 Best Investment Strategy', text: 'Mere live surplus aur balance ke hisaab se best investment allocation (Mutual Funds, FD, Gold) kya hona chahiye?' },
    { label: '💳 Credit Cards Optimization', text: 'Mere sabhi credit cards ke dues aur limits ko dekh kar repayment aur optimization strategy batao.' },
    { label: '⚠️ Faltu Kharcha Reduction', text: 'Mere kharchon me se kaun si aisi cheezein hain jinhe control karke main sabse zyada paise bacha sakta hu?' },
    { label: '🏁 Goal Roadmap & Timeline', text: 'Agle 1 saal me mere savings goals ko pura karne ke liye mujhe monthly kitna save karna padega?' },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[#090d18] border border-cyan-500/30 rounded-2xl max-w-3xl w-full shadow-2xl shadow-cyan-950/60 overflow-hidden relative animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-950 via-slate-900 to-indigo-950 px-5 py-3.5 flex items-center justify-between text-white border-b border-cyan-500/20 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-inner shadow-cyan-500/20">
              <Cpu className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-sm sm:text-base text-white tracking-wide font-display">
                  GEMINI AI FINANCIAL ADVISOR
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/90 border border-cyan-500/40 text-cyan-300 font-bold">
                  GEMINI PRO & FLASH
                </span>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Live Ledger Grounded: Bank, Cards, Goals & Investments
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

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/80 px-4 pt-2 shrink-0">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'chat'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/30 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>💬 Chat With AI Advisor (/ask)</span>
          </button>
          <button
            onClick={() => setActiveTab('insights')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'insights'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/30 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>📊 Faltu Kharcha & Health Score</span>
          </button>
        </div>

        {/* Tab 1: Interactive Chat with Advisor */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0 bg-[#070b14]">
            
            {/* Gemini API Key Status & Quick Setup Bar */}
            <div className="px-3 py-2 bg-slate-950 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${geminiKeyInfo?.hasKey ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'}`} />
                <span className="text-slate-300 font-medium">
                  {geminiKeyInfo?.hasKey ? (
                    <>
                      <span className="text-emerald-400 font-bold">Gemini Pro & Flash Active</span>
                      {geminiKeyInfo.maskedKey && <span className="text-slate-400 font-mono text-[10px] ml-1.5">({geminiKeyInfo.maskedKey})</span>}
                    </>
                  ) : (
                    <>
                      <span className="text-cyan-300 font-bold">Smart Local Engine Active</span>
                      <span className="text-slate-400 ml-1.5">• Google AI Studio key jod kar live Gemini reasoning activate karein</span>
                    </>
                  )}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowKeyBar(prev => !prev)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold cursor-pointer transition-all"
              >
                <Key className="w-3 h-3 text-cyan-400" />
                <span>{showKeyBar ? 'Hide Key' : geminiKeyInfo?.hasKey ? 'Change Key' : '🔑 Set Gemini Key'}</span>
                {showKeyBar ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
              </button>
            </div>

            {/* Inline Key Configuration Bar */}
            {showKeyBar && (
              <div className="p-3 bg-cyan-950/40 border-b border-cyan-500/30 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs animate-in fade-in">
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Google AI Studio (aistudio.google.com) key paste karein (AIzaSy...)"
                    className="flex-1 bg-slate-950 text-white border border-slate-700 focus:border-cyan-400 rounded-xl px-3 py-1.5 text-xs font-mono focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveGeminiKey}
                    disabled={isSavingKey || !keyInput.trim()}
                    className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-all"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isSavingKey ? 'Saving...' : 'Save & Activate'}</span>
                  </button>
                </div>
                {keySaveMsg && (
                  <span className="text-[11px] text-emerald-300 font-medium sm:ml-2">
                    {keySaveMsg}
                  </span>
                )}
              </div>
            )}

            {/* Quick Prompt Pills */}
            <div className="p-3 border-b border-slate-800/80 bg-slate-900/40 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                Prompt Ideas:
              </span>
              {quickPrompts.map((qp, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(qp.text)}
                  disabled={isAsking}
                  className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 shrink-0 transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  {qp.label}
                </button>
              ))}
            </div>

            {/* Chat Messages List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex items-start gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.sender === 'ai' && (
                    <div className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-cyan-400" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 space-y-1.5 shadow-md ${
                      m.sender === 'user'
                        ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white rounded-tr-none'
                        : 'bg-slate-900/90 border border-cyan-500/20 text-slate-200 rounded-tl-none'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-[10px] opacity-70 pb-1 border-b border-white/10">
                      <span className="font-bold">
                        {m.sender === 'user' ? 'Aap (User)' : 'Gemini AI Financial Advisor'}
                      </span>
                      <span className="font-mono">{m.timestamp}</span>
                    </div>

                    {m.sender === 'ai' ? (
                      <FormattedAiMessage text={m.text} />
                    ) : (
                      <div className="text-xs leading-relaxed whitespace-pre-line font-sans">
                        {m.text}
                      </div>
                    )}

                    {m.model && (
                      <div className="text-[9px] font-mono text-cyan-400/80 pt-1">
                        Model: {m.model}
                      </div>
                    )}
                  </div>

                  {m.sender === 'user' && (
                    <div className="w-7 h-7 rounded-lg bg-indigo-950 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-indigo-400" />
                    </div>
                  )}
                </div>
              ))}

              {isAsking && (
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-cyan-400 animate-spin" />
                  </div>
                  <div className="bg-slate-900/90 border border-cyan-500/30 rounded-2xl rounded-tl-none p-3.5 space-y-1">
                    <div className="flex items-center gap-2 text-cyan-300 font-semibold text-xs">
                      <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      <span>Gemini AI ledger analyze karke answer generate kar raha hai...</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono">Bank balances, credit card dues aur budgets calculate ho rahe hain</p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Box */}
            <div className="p-3 border-t border-slate-800 bg-slate-950 flex items-center gap-2 shrink-0">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Apna sawaal likhein (e.g. Meri best investment strategy kya hai?)"
                disabled={isAsking}
                className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim() || isAsking}
                className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Poochhein</span>
              </button>
            </div>

          </div>
        )}

        {/* Tab 2: Faltu Kharcha & Score Analysis */}
        {activeTab === 'insights' && (
          <div className="p-6 space-y-6 overflow-y-auto text-xs flex-1">
            
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
        )}

        {/* Footer */}
        <div className="bg-slate-950 border-t border-slate-800 px-5 py-3 flex items-center justify-between text-xs shrink-0">
          {activeTab === 'insights' ? (
            <button
              onClick={fetchInsights}
              disabled={loading}
              className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>FIR SE RE-ANALYZE KAREIN</span>
            </button>
          ) : (
            <span className="text-[11px] text-slate-400 font-mono">
              Telegram par bhi <code>/ask</code> aur <code>/done</code> se live baat karein!
            </span>
          )}
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
          >
            BAND KAREIN
          </button>
        </div>

      </div>
    </div>
  );
};
