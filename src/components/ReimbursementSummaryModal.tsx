import React, { useState, useMemo } from 'react';
import {
  X,
  Briefcase,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Plus,
  RefreshCw,
  Wallet,
  ArrowRight,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Edit2,
  RotateCcw,
  Check,
  TrendingUp,
} from 'lucide-react';
import { Transaction } from '../types';
import { safeFetchJson } from '../utils/api';

interface ReimbursementSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  onRefreshTransactions?: () => void;
  onEditTransaction?: (tx: Transaction) => Promise<void>;
  onOpenAddTransaction?: (defaultCategory?: string) => void;
  selectedTxId?: string | null;
}

export const ReimbursementSummaryModal: React.FC<ReimbursementSummaryModalProps> = ({
  isOpen,
  onClose,
  transactions,
  onRefreshTransactions,
  onEditTransaction,
  onOpenAddTransaction,
  selectedTxId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'partial' | 'settled'>('all');
  const [activeSettleTxId, setActiveSettleTxId] = useState<string | null>(selectedTxId || null);
  const [settleAmountInput, setSettleAmountInput] = useState<string>('');
  const [settleNoteInput, setSettleNoteInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSettlingAll, setIsSettlingAll] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Filter all reimbursement transactions
  const reimbursementTxs = useMemo(() => {
    return transactions.filter(
      (tx) => tx.isReimbursement || tx.category?.toLowerCase() === 'reimbursement'
    );
  }, [transactions]);

  // Overall Financial Calculations
  const stats = useMemo(() => {
    let totalClaimed = 0;
    let totalSettled = 0;
    let totalRemaining = 0;
    let pendingCount = 0;
    let partialCount = 0;
    let settledCount = 0;

    reimbursementTxs.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      totalClaimed += amt;

      const settledAmt =
        tx.reimbursementStatus === 'settled'
          ? amt
          : Math.min(amt, Math.max(0, Number(tx.reimbursementSettledAmount) || 0));

      const remaining = Math.max(0, amt - settledAmt);

      totalSettled += settledAmt;
      totalRemaining += remaining;

      if (tx.reimbursementStatus === 'settled' || (settledAmt >= amt && amt > 0)) {
        settledCount++;
      } else if (settledAmt > 0) {
        partialCount++;
      } else {
        pendingCount++;
      }
    });

    const percentSettled = totalClaimed > 0 ? Math.round((totalSettled / totalClaimed) * 100) : 0;

    return {
      totalClaimed,
      totalSettled,
      totalRemaining,
      totalCount: reimbursementTxs.length,
      pendingCount,
      partialCount,
      settledCount,
      percentSettled,
    };
  }, [reimbursementTxs]);

  // Filtered transactions for display
  const filteredTxs = useMemo(() => {
    return reimbursementTxs.filter((tx) => {
      const amt = Number(tx.amount) || 0;
      const settledAmt =
        tx.reimbursementStatus === 'settled'
          ? amt
          : Math.min(amt, Math.max(0, Number(tx.reimbursementSettledAmount) || 0));
      const remaining = Math.max(0, amt - settledAmt);

      // Status filter
      if (statusFilter === 'settled') {
        if (tx.reimbursementStatus !== 'settled' && settledAmt < amt) return false;
      } else if (statusFilter === 'partial') {
        if (settledAmt <= 0 || settledAmt >= amt) return false;
      } else if (statusFilter === 'pending') {
        if (settledAmt > 0) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const descMatch = tx.description?.toLowerCase().includes(q);
        const accMatch = tx.account?.toLowerCase().includes(q);
        const amtMatch = String(tx.amount).includes(q);
        const dateMatch = tx.date?.includes(q);
        if (!descMatch && !accMatch && !amtMatch && !dateMatch) return false;
      }

      return true;
    });
  }, [reimbursementTxs, statusFilter, searchQuery]);

  // Open inline settlement form
  const handleOpenSettleForm = (tx: Transaction) => {
    if (activeSettleTxId === tx.id) {
      setActiveSettleTxId(null);
      return;
    }
    const amt = Number(tx.amount) || 0;
    const settledAmt =
      tx.reimbursementStatus === 'settled'
        ? amt
        : Math.min(amt, Math.max(0, Number(tx.reimbursementSettledAmount) || 0));
    const remaining = Math.max(0, amt - settledAmt);

    setActiveSettleTxId(tx.id);
    setSettleAmountInput(remaining > 0 ? String(remaining) : String(amt));
    setSettleNoteInput('');
  };

  // Submit Settlement (Full or Partial)
  const handleConfirmSettle = async (tx: Transaction, isFullDirect: boolean = false) => {
    const amt = Number(tx.amount) || 0;
    const currentlySettled =
      tx.reimbursementStatus === 'settled'
        ? amt
        : Math.min(amt, Math.max(0, Number(tx.reimbursementSettledAmount) || 0));
    const currentRemaining = Math.max(0, amt - currentlySettled);

    let amountToSettleNow = isFullDirect ? currentRemaining : Number(settleAmountInput);

    if (isNaN(amountToSettleNow) || amountToSettleNow <= 0) {
      showToast('Kripya valid settlement amount daalein (Greater than 0)', 'error');
      return;
    }

    const newTotalSettled = Math.min(amt, currentlySettled + amountToSettleNow);
    const newRemaining = Math.max(0, amt - newTotalSettled);
    const nextStatus = newTotalSettled >= amt ? 'settled' : 'partial';

    setIsSubmitting(true);
    try {
      const { data, error } = await safeFetchJson<{
        success: boolean;
        transaction: Transaction;
        remainingAmount: number;
      }>(`/api/transactions/${tx.id}/settle-reimbursement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settledAmount: newTotalSettled,
          isFullSettle: newTotalSettled >= amt,
          notes: settleNoteInput.trim() ? `Settle: ${settleNoteInput.trim()}` : undefined,
        }),
      });

      if (error || !data?.success) {
        // Fallback to direct PUT
        if (onEditTransaction) {
          await onEditTransaction({
            ...tx,
            isReimbursement: true,
            reimbursementStatus: nextStatus,
            reimbursementSettledAmount: newTotalSettled,
          });
        }
      }

      showToast(
        newTotalSettled >= amt
          ? `🎉 ₹${amountToSettleNow.toLocaleString('en-IN')} pura settle ho gaya!`
          : `✅ ₹${amountToSettleNow.toLocaleString('en-IN')} settle hua. Baki ₹${newRemaining.toLocaleString('en-IN')} bacha hai.`
      );

      setActiveSettleTxId(null);
      setSettleAmountInput('');
      setSettleNoteInput('');

      if (onRefreshTransactions) {
        onRefreshTransactions();
      }
    } catch (err: any) {
      showToast('Settlement me error aaya: ' + (err.message || 'Unknown'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Re-open settled transaction to pending
  const handleReopenToPending = async (tx: Transaction) => {
    setIsSubmitting(true);
    try {
      if (onEditTransaction) {
        await onEditTransaction({
          ...tx,
          isReimbursement: true,
          reimbursementStatus: 'pending',
          reimbursementSettledAmount: 0,
        });
      }
      showToast('Reimbursement claim wapas "Pending" mark ho gaya!');
      setActiveSettleTxId(null);
      if (onRefreshTransactions) onRefreshTransactions();
    } catch (err: any) {
      showToast('Update me error aaya: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Settle All Pending / Partial Claims in 1-Click
  const handleSettleAll = async () => {
    if (stats.totalRemaining <= 0) {
      showToast('Koi pending reimbursement claim baki nahi hai.', 'error');
      return;
    }

    if (!window.confirm(`Kya aap saare pending reimbursement claims (Kul: ₹${stats.totalRemaining.toLocaleString('en-IN')}) ko ek sath Full Settle mark karna chahte hain?`)) {
      return;
    }

    setIsSettlingAll(true);
    try {
      const { data, error } = await safeFetchJson<{
        success: boolean;
        settledCount: number;
        totalSettledAmount: number;
      }>('/api/transactions/settle-all-reimbursements', {
        method: 'POST',
      });

      if (error || !data?.success) {
        showToast(error || 'Failed to settle all reimbursements', 'error');
      } else {
        showToast(`🎉 ${data.settledCount} claims (Kul ₹${(data.totalSettledAmount || stats.totalRemaining).toLocaleString('en-IN')}) successfully settle ho gaye!`);
        if (onRefreshTransactions) onRefreshTransactions();
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setIsSettlingAll(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden shadow-cyan-950/50">
        
        {/* Toast Notification */}
        {toastMessage && (
          <div
            className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-xs font-semibold shadow-xl border flex items-center gap-2 transition-all ${
              toastMessage.type === 'error'
                ? 'bg-rose-950 border-rose-500/50 text-rose-200'
                : 'bg-emerald-950 border-emerald-500/50 text-emerald-200'
            }`}
          >
            {toastMessage.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            <span>{toastMessage.text}</span>
          </div>
        )}

        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-white/[0.08] bg-slate-900/90 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-inner">
              <Briefcase className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  Reimbursements Summary & Settlement Hub
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  Budget Exempted 🛡️
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Office / client claimable expenses. Yeh aapke Monthly Budget se minus nahi hote.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenAddTransaction && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAddTransaction('Reimbursement');
                }}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-lg shadow-cyan-600/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Naya Claim Add Karein</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/[0.08] rounded-xl transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Body (Scrollable) */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">

          {/* Budget Exemption Alert Banner */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-cyan-950/40 via-indigo-950/30 to-slate-900 border border-cyan-500/30 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="text-cyan-200 font-semibold">
                Budget Exemption Active: Aapka Personal Budget Surakshit Hai!
              </p>
              <p className="text-slate-300 leading-relaxed">
                Is category ke kharche (jaise cab, client lunch, travel ticket) <b>Monthly Category Budget</b> ya <b>Personal Expense</b> me deduct nahi hote. Yeh company/client se claim hone par niche diye gaye <b>"Settle"</b> button se settle kiye ja sakte hain.
              </p>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Total Claimed */}
            <div className="glass-card p-3 sm:p-4 rounded-xl border border-white/[0.08] bg-slate-950/40">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Kul Claimed</span>
                <Briefcase className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="text-lg sm:text-xl font-bold text-white font-mono">
                ₹{stats.totalClaimed.toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {stats.totalCount} kul office/trip kharche
              </div>
            </div>

            {/* Total Settled */}
            <div className="glass-card p-3 sm:p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10">
              <div className="flex items-center justify-between text-emerald-400 text-xs mb-1">
                <span>Wapas Mila (Settled)</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-lg sm:text-xl font-bold text-emerald-300 font-mono">
                ₹{stats.totalSettled.toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-emerald-400/80 mt-1">
                {stats.settledCount} claims fully clear
              </div>
            </div>

            {/* Total Remaining / Pending */}
            <div className="glass-card p-3 sm:p-4 rounded-xl border border-amber-500/20 bg-amber-950/10">
              <div className="flex items-center justify-between text-amber-400 text-xs mb-1">
                <span>Lena Baki (Pending)</span>
                <Clock className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-lg sm:text-xl font-bold text-amber-300 font-mono">
                ₹{stats.totalRemaining.toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-amber-400/80 mt-1">
                {stats.pendingCount + stats.partialCount} claims baki
              </div>
            </div>

            {/* Settlement Progress */}
            <div className="glass-card p-3 sm:p-4 rounded-xl border border-indigo-500/20 bg-indigo-950/10">
              <div className="flex items-center justify-between text-indigo-400 text-xs mb-1">
                <span>Settlement Dar</span>
                <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="text-lg sm:text-xl font-bold text-indigo-300 font-mono">
                {stats.percentSettled}%
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, stats.percentSettled)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Action Row: Search, Tabs & Quick Settle All */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-950/60 rounded-xl border border-white/[0.08] overflow-x-auto text-xs shrink-0">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'all'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sabhi ({stats.totalCount})
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'pending'
                    ? 'bg-amber-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Baki / Pending ({stats.pendingCount})
              </button>
              <button
                onClick={() => setStatusFilter('partial')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'partial'
                    ? 'bg-orange-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Partial ({stats.partialCount})
              </button>
              <button
                onClick={() => setStatusFilter('settled')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'settled'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Settled ({stats.settledCount})
              </button>
            </div>

            {/* Search and Settle All Button */}
            <div className="flex items-center gap-2 flex-1 justify-end">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Karcha ya amount search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-950/60 border border-white/[0.08] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-cyan-500"
                />
              </div>

              {stats.totalRemaining > 0 && (
                <button
                  onClick={handleSettleAll}
                  disabled={isSettlingAll}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shadow-lg shadow-emerald-950"
                  title="Ek sath saare pending claims full settle karein"
                >
                  {isSettlingAll ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Quick Settle All (₹{stats.totalRemaining.toLocaleString('en-IN')})</span>
                </button>
              )}
            </div>
          </div>

          {/* Transactions List */}
          <div className="space-y-3">
            {filteredTxs.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-xl border border-dashed border-white/[0.1] bg-slate-950/20">
                <Briefcase className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                <h3 className="text-sm font-semibold text-white">Koi Reimbursement Transaction Nahi Mila</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {searchQuery || statusFilter !== 'all'
                    ? 'Aapke search ya filter criteria se koi claim match nahi hua.'
                    : 'Telegram bot par message bhejein (jaise: "500 cab rim" ya "1200 lunch reimbursement") ya niche button se add karein.'}
                </p>
                {onOpenAddTransaction && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenAddTransaction('Reimbursement');
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-lg shadow-cyan-600/20"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Naya Reimbursement Claim Add Karein</span>
                  </button>
                )}
              </div>
            ) : (
              filteredTxs.map((tx) => {
                const totalAmt = Number(tx.amount) || 0;
                const settledAmt =
                  tx.reimbursementStatus === 'settled'
                    ? totalAmt
                    : Math.min(totalAmt, Math.max(0, Number(tx.reimbursementSettledAmount) || 0));
                const remainingAmt = Math.max(0, totalAmt - settledAmt);

                const isSettled = tx.reimbursementStatus === 'settled' || (settledAmt >= totalAmt && totalAmt > 0);
                const isPartial = !isSettled && settledAmt > 0;
                const isPending = !isSettled && settledAmt === 0;

                const isExpanded = activeSettleTxId === tx.id;

                return (
                  <div
                    key={tx.id}
                    className={`glass-card rounded-xl border transition-all overflow-hidden ${
                      isExpanded
                        ? 'border-cyan-500/50 bg-slate-900/90 shadow-xl shadow-cyan-950/30'
                        : isSettled
                        ? 'border-emerald-500/20 bg-slate-950/30 opacity-90'
                        : isPartial
                        ? 'border-orange-500/30 bg-slate-950/40'
                        : 'border-white/[0.08] bg-slate-950/40 hover:border-cyan-500/30'
                    }`}
                  >
                    {/* Main Row */}
                    <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      
                      {/* Left: Info */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            isSettled
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : isPartial
                              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {isSettled ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Briefcase className="w-4 h-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white text-sm truncate">
                              {tx.description || 'Office Expense'}
                            </span>

                            {/* Status Badge */}
                            {isSettled ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Pura Settled</span>
                              </span>
                            ) : isPartial ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
                                <Clock className="w-3 h-3" />
                                <span>Partial (₹{settledAmt.toLocaleString('en-IN')} Mila)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <Clock className="w-3 h-3" />
                                <span>Pending Claim</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                            <span>📅 {tx.date}</span>
                            {tx.time && <span>• ⏰ {tx.time}</span>}
                            <span>• 💳 {tx.paymentMethod || 'UPI/Cash'}</span>
                            {tx.account && (
                              <span className="text-slate-500">[{tx.account}]</span>
                            )}
                            {tx.telegramUser && (
                              <span className="text-cyan-400/80">by @{tx.telegramUser}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Amounts & Settlement Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.05]">
                        <div className="text-right">
                          <div className="text-base sm:text-lg font-bold text-white font-mono">
                            ₹{totalAmt.toLocaleString('en-IN')}
                          </div>

                          {/* Remaining / Settled subtext */}
                          {isSettled ? (
                            <div className="text-[11px] text-emerald-400 font-medium">
                              ✓ ₹{totalAmt.toLocaleString('en-IN')} pura wapas mil gaya
                            </div>
                          ) : (
                            <div className="text-[11px] text-amber-300 font-medium font-mono">
                              Baki: ₹{remainingAmt.toLocaleString('en-IN')}
                              {settledAmt > 0 && (
                                <span className="text-slate-400 font-sans ml-1">
                                  (₹{settledAmt.toLocaleString('en-IN')} mila)
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Settle / Manage Button */}
                        <div className="flex items-center gap-1.5">
                          {!isSettled ? (
                            <button
                              onClick={() => handleOpenSettleForm(tx)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                                isExpanded
                                  ? 'bg-slate-800 text-white border border-slate-700'
                                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-950'
                              }`}
                            >
                              <Wallet className="w-3.5 h-3.5" />
                              <span>{isExpanded ? 'Band Karein' : 'Settle Karein'}</span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReopenToPending(tx)}
                              disabled={isSubmitting}
                              className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-amber-300 hover:bg-white/[0.05] rounded-xl border border-white/[0.08] transition-all cursor-pointer flex items-center gap-1"
                              title="Wapas pending claim banayein"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span className="hidden sm:inline">Reopen</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Inline Settlement Form */}
                    {isExpanded && !isSettled && (
                      <div className="px-4 py-3.5 bg-slate-950/80 border-t border-cyan-500/20 space-y-3 animate-in slide-in-from-top-2 duration-150">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-cyan-300 font-semibold flex items-center gap-1.5">
                            <Wallet className="w-4 h-4 text-cyan-400" />
                            Settlement Manager (Kitna Paisa Mila?)
                          </span>
                          <span className="text-slate-400">
                            Kul Claim: <b className="text-white">₹{totalAmt.toLocaleString('en-IN')}</b> • Baki: <b className="text-amber-300">₹{remainingAmt.toLocaleString('en-IN')}</b>
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Amount Input */}
                          <div>
                            <label className="block text-[11px] font-medium text-slate-400 mb-1">
                              Abhi Kitna Amount Receive Hua (₹):
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">
                                ₹
                              </span>
                              <input
                                type="number"
                                min="1"
                                max={remainingAmt}
                                value={settleAmountInput}
                                onChange={(e) => setSettleAmountInput(e.target.value)}
                                placeholder={`Ex: ${remainingAmt}`}
                                className="w-full pl-7 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm focus:outline-hidden focus:border-cyan-500"
                              />
                            </div>
                          </div>

                          {/* Quick Settle Presets */}
                          <div>
                            <label className="block text-[11px] font-medium text-slate-400 mb-1">
                              Quick Amount Select:
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSettleAmountInput(String(remainingAmt))}
                                className="flex-1 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Pura (₹{remainingAmt.toLocaleString('en-IN')})</span>
                              </button>

                              {remainingAmt > 100 && (
                                <button
                                  type="button"
                                  onClick={() => setSettleAmountInput(String(Math.round(remainingAmt / 2)))}
                                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                                >
                                  50% (₹{Math.round(remainingAmt / 2).toLocaleString('en-IN')})
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Optional Notes */}
                        <div>
                          <label className="block text-[11px] font-medium text-slate-400 mb-1">
                            Settlement Note (Optional):
                          </label>
                          <input
                            type="text"
                            value={settleNoteInput}
                            onChange={(e) => setSettleNoteInput(e.target.value)}
                            placeholder="e.g. Cleared via payroll / Cash returned / Client NEFT"
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-cyan-500"
                          />
                        </div>

                        {/* Submission Buttons */}
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setActiveSettleTxId(null)}
                            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>

                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleConfirmSettle(tx, false)}
                            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-cyan-950"
                          >
                            {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            <span>
                              {Number(settleAmountInput) >= remainingAmt
                                ? 'Pura Settle Confirm Karein'
                                : `Partial ₹${(Number(settleAmountInput) || 0).toLocaleString('en-IN')} Settle Karein`}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-slate-900/90 flex items-center justify-between gap-3 shrink-0 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">
              {filteredTxs.length} claims dikh rahe hain
            </span>
            {stats.totalRemaining > 0 && (
              <span className="text-amber-400 font-mono">
                • ₹{stats.totalRemaining.toLocaleString('en-IN')} lena baki
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors cursor-pointer"
          >
            Band Karein
          </button>
        </div>

      </div>
    </div>
  );
};
