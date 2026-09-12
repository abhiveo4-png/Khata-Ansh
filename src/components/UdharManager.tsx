import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Plus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Search, 
  Calendar,
  AlertCircle,
  TrendingUp,
  Sparkles,
  Phone,
  HandCoins,
  Receipt
} from 'lucide-react';
import { UdharDebt } from '../types';
import { safeFetchJson } from '../utils/api';

interface UdharManagerProps {
  onRefreshSummary?: () => void;
}

export const UdharManager: React.FC<UdharManagerProps> = ({ onRefreshSummary }) => {
  const [debts, setDebts] = useState<UdharDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'you_lent' | 'you_borrowed' | 'settled'>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form State
  const [personName, setPersonName] = useState('');
  const [type, setType] = useState<'you_lent' | 'you_borrowed'>('you_lent');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchDebts = async () => {
    setLoading(true);
    try {
      const { data } = await safeFetchJson<{ debts?: UdharDebt[] }>('/api/debts');
      if (data?.debts) {
        setDebts(data.debts);
      }
    } catch (e) {
      console.error('Failed to fetch debts', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDebts();
  }, []);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalLent = 0; // Lena hai
    let totalBorrowed = 0; // Dena hai
    let pendingCount = 0;

    debts.forEach((d) => {
      if (!d.isSettled) {
        pendingCount++;
        if (d.type === 'you_lent') {
          totalLent += d.amount;
        } else {
          totalBorrowed += d.amount;
        }
      }
    });

    const netBalance = totalLent - totalBorrowed;
    return { totalLent, totalBorrowed, netBalance, pendingCount };
  }, [debts]);

  // Filtered Debts
  const filteredDebts = useMemo(() => {
    return debts.filter((d) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = d.personName.toLowerCase().includes(q);
        const matchDesc = (d.description || '').toLowerCase().includes(q);
        if (!matchName && !matchDesc) return false;
      }

      if (filterType === 'you_lent') return !d.isSettled && d.type === 'you_lent';
      if (filterType === 'you_borrowed') return !d.isSettled && d.type === 'you_borrowed';
      if (filterType === 'settled') return d.isSettled;

      return true;
    });
  }, [debts, searchQuery, filterType]);

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount.trim());
    if (!personName.trim() || isNaN(numAmount) || numAmount <= 0) {
      showToast('Kripya sahi naam aur amount dalein', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await safeFetchJson<{ success?: boolean; debt?: UdharDebt; debts?: UdharDebt[] }>('/api/debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personName: personName.trim(),
          type,
          amount: numAmount,
          description: description.trim() || (type === 'you_lent' ? `Given to ${personName}` : `Borrowed from ${personName}`),
          dueDate: dueDate || undefined,
        }),
      });

      if (error || !data?.success) {
        showToast(error || 'Failed to add debt record', 'error');
      } else {
        if (data.debts) setDebts(data.debts);
        else if (data.debt) setDebts((prev) => [data.debt!, ...prev]);
        setIsAddModalOpen(false);
        setPersonName('');
        setAmount('');
        setDescription('');
        setDueDate('');
        showToast(`✅ ${personName} ka udhar record save ho gaya!`);
        if (onRefreshSummary) onRefreshSummary();
      }
    } catch (err: any) {
      showToast(err.message || 'Error occurred', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleSettle = async (debt: UdharDebt) => {
    try {
      const newStatus = !debt.isSettled;
      const { data, error } = await safeFetchJson<{ success?: boolean; debts?: UdharDebt[] }>(`/api/debts/${debt.id}/settle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSettled: newStatus }),
      });

      if (error || !data?.success) {
        showToast(error || 'Failed to update status', 'error');
      } else {
        if (data.debts) setDebts(data.debts);
        else {
          setDebts((prev) =>
            prev.map((d) => (d.id === debt.id ? { ...d, isSettled: newStatus, settledAt: newStatus ? new Date().toISOString() : undefined } : d))
          );
        }
        showToast(newStatus ? `🤝 ${debt.personName} ka hisaab chukta / settled ho gaya!` : `Reopened debt record`);
        if (onRefreshSummary) onRefreshSummary();
      }
    } catch (err: any) {
      showToast(err.message || 'Error updating status', 'error');
    }
  };

  const handleDeleteDebt = async (debt: UdharDebt) => {
    if (!window.confirm(`Kya aap ${debt.personName} ka ₹${debt.amount} ka record delete karna chahte hain?`)) return;

    try {
      const { data, error } = await safeFetchJson<{ success?: boolean; debts?: UdharDebt[] }>(`/api/debts/${debt.id}`, {
        method: 'DELETE',
      });

      if (error || !data?.success) {
        showToast(error || 'Failed to delete record', 'error');
      } else {
        if (data.debts) setDebts(data.debts);
        else setDebts((prev) => prev.filter((d) => d.id !== debt.id));
        showToast(`🗑️ Record delete ho gaya.`);
        if (onRefreshSummary) onRefreshSummary();
      }
    } catch (err: any) {
      showToast(err.message || 'Error deleting', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-mono transition-all animate-in fade-in slide-in-from-top-2 duration-300 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-lg shadow-emerald-950/50'
              : 'bg-rose-950/90 border-rose-500/50 text-rose-200 shadow-lg shadow-rose-950/50'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold">{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-[#0c1222]/85 rounded-2xl border border-slate-800 backdrop-blur-xl p-5 sm:p-6 shadow-2xl shadow-black/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-950/80 border border-amber-500/40 text-amber-400 flex items-center justify-center">
                <HandCoins className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-base sm:text-lg text-white font-display">
                UDHAR-KHATA & LENDING LEDGER
              </h2>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300">
                {metrics.pendingCount} PENDING
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Kisko kitna udhar diya (Lena hai) aur kisse kitna liya (Dena hai) track karein. Telegram par bhi direct type karein: <code className="text-cyan-300">500 rohit ko udhar diye</code>
            </p>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-mono font-bold flex items-center justify-center space-x-1.5 shadow-lg shadow-amber-950/50 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>NAYA UDHAR JODEIN</span>
          </button>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-5">
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-mono uppercase tracking-wider">AAPKO LENA HAI (YOU LENT)</span>
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-1">
              ₹{metrics.totalLent.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] font-mono text-emerald-400/80 mt-1 block">Logon se wapas aane hain</span>
          </div>

          <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-mono uppercase tracking-wider">AAPKO DENA HAI (YOU BORROWED)</span>
              <ArrowUpRight className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-rose-400 mt-1">
              ₹{metrics.totalBorrowed.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] font-mono text-rose-400/80 mt-1 block">Aapko chukana hai</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-mono uppercase tracking-wider">NET OUTSTANDING</span>
              <TrendingUp className="w-4 h-4 text-cyan-400" />
            </div>
            <div className={`text-xl sm:text-2xl font-bold font-mono mt-1 ${metrics.netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {metrics.netBalance >= 0 ? '+' : '-'}₹{Math.abs(metrics.netBalance).toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] font-mono text-slate-400 mt-1 block">
              {metrics.netBalance >= 0 ? 'Net profit / surplus to receive' : 'Net payable balance'}
            </span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Person name ya reason search karein..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-mono text-white placeholder:text-slate-400 focus:outline-hidden focus:border-amber-500/50"
            />
          </div>

          <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all shrink-0 cursor-pointer ${
                filterType === 'all'
                  ? 'bg-amber-500/20 border border-amber-500/60 text-amber-300'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({debts.length})
            </button>
            <button
              onClick={() => setFilterType('you_lent')}
              className={`px-3 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all shrink-0 cursor-pointer ${
                filterType === 'you_lent'
                  ? 'bg-emerald-500/20 border border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Lena Hai ({debts.filter((d) => !d.isSettled && d.type === 'you_lent').length})
            </button>
            <button
              onClick={() => setFilterType('you_borrowed')}
              className={`px-3 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all shrink-0 cursor-pointer ${
                filterType === 'you_borrowed'
                  ? 'bg-rose-500/20 border border-rose-500/60 text-rose-300'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Dena Hai ({debts.filter((d) => !d.isSettled && d.type === 'you_borrowed').length})
            </button>
            <button
              onClick={() => setFilterType('settled')}
              className={`px-3 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all shrink-0 cursor-pointer ${
                filterType === 'settled'
                  ? 'bg-cyan-500/20 border border-cyan-500/60 text-cyan-300'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Settled / Chukta ({debts.filter((d) => d.isSettled).length})
            </button>
          </div>
        </div>
      </div>

      {/* Debts List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredDebts.map((d) => {
          const isLent = d.type === 'you_lent';

          return (
            <div
              key={d.id}
              className={`p-4 rounded-2xl border transition-all duration-200 ${
                d.isSettled
                  ? 'bg-slate-950/40 border-slate-800/80 opacity-60'
                  : isLent
                  ? 'bg-emerald-950/15 border-emerald-500/30 shadow-lg shadow-emerald-950/20'
                  : 'bg-rose-950/15 border-rose-500/30 shadow-lg shadow-rose-950/20'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      d.isSettled
                        ? 'bg-slate-900 border-slate-700 text-slate-400'
                        : isLent
                        ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-400'
                        : 'bg-rose-950/80 border-rose-500/50 text-rose-400'
                    }`}
                  >
                    {d.isSettled ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isLent ? (
                      <ArrowDownLeft className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-white font-display truncate" title={d.personName}>
                      {d.personName}
                    </h3>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded-sm font-bold uppercase ${
                        d.isSettled
                          ? 'bg-slate-800 text-slate-400'
                          : isLent
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-950 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {d.isSettled ? 'SETTLED / CHUKTA' : isLent ? 'AAPKO LENA HAI' : 'AAPKO DENA HAI'}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0 font-mono">
                  <div className={`text-base font-bold ${isLent ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ₹{d.amount.toLocaleString('en-IN')}
                  </div>
                  <span className="text-[10px] text-slate-400">{d.date}</span>
                </div>
              </div>

              {d.description && (
                <p className="mt-3 text-xs font-mono text-slate-300 line-clamp-2 bg-slate-950/50 p-2 rounded-lg border border-slate-800">
                  {d.description}
                </p>
              )}

              {/* Action Buttons */}
              <div className="mt-3.5 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleToggleSettle(d)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                    d.isSettled
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{d.isSettled ? 'Reopen' : 'Mark Settled (Chukta)'}</span>
                </button>

                <button
                  onClick={() => handleDeleteDebt(d)}
                  className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                  title="Delete record"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredDebts.length === 0 && !loading && (
        <div className="p-8 text-center bg-[#0c1222]/50 border border-slate-800 rounded-2xl">
          <p className="text-sm font-mono text-slate-400">Koi udhar-khata record nahi mila.</p>
        </div>
      )}

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c1222] border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white font-display flex items-center space-x-2">
              <HandCoins className="w-5 h-5 text-amber-400" />
              <span>Naya Udhar-Khata Record Jodein</span>
            </h3>

            <form onSubmit={handleAddDebt} className="space-y-3.5 font-mono text-xs">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setType('you_lent')}
                  className={`py-2 rounded-lg font-bold text-center transition-all ${
                    type === 'you_lent' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Maine Diya (Lena Hai)
                </button>
                <button
                  type="button"
                  onClick={() => setType('you_borrowed')}
                  className={`py-2 rounded-lg font-bold text-center transition-all ${
                    type === 'you_borrowed' ? 'bg-rose-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Maine Liya (Dena Hai)
                </button>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  Vyakti Ka Naam (Person Name) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rohit Sharma / Rahul / Shopkeeper"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-amber-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-sm focus:border-amber-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  Description / Reason (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Movie ticket share / Urgent medical help"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-amber-500 outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg"
                >
                  {isSubmitting ? 'Saving...' : 'Save Udhar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
