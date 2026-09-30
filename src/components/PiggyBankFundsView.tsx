import React, { useState, useEffect, useMemo } from 'react';
import {
  PiggyBank,
  Sparkles,
  Home,
  HeartPulse,
  ShieldAlert,
  Car,
  Plus,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  TrendingUp,
  Target,
  Edit2,
  Trash2,
  Check,
  X,
  Clock,
  ArrowLeftRight,
  Layers,
  AlertCircle,
  Filter,
  Search,
  Calendar,
  Plane,
  ShoppingBag,
  Landmark,
  Gem,
  RefreshCw,
  Info,
} from 'lucide-react';
import { PiggyBankItem, PiggyBankTransaction, PiggyBankSummary } from '../types';

interface PiggyBankFundsViewProps {
  userId?: string;
  onRefreshUserData?: () => void;
}

const FUND_ICONS: Record<string, React.ElementType> = {
  Home,
  HeartPulse,
  ShieldAlert,
  Car,
  Plane,
  ShoppingBag,
  Landmark,
  Gem,
  PiggyBank,
  Sparkles,
  TrendingUp,
  Wallet,
};

const COLOR_OPTIONS = [
  { name: 'Emerald', value: '#10B981' },
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Rose', value: '#F43F5E' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Indigo', value: '#6366F1' },
];

export const PiggyBankFundsView: React.FC<PiggyBankFundsViewProps> = ({
  userId,
  onRefreshUserData,
}) => {
  const [funds, setFunds] = useState<PiggyBankItem[]>([]);
  const [transactions, setTransactions] = useState<PiggyBankTransaction[]>([]);
  const [summary, setSummary] = useState<PiggyBankSummary>({
    totalInAllFunds: 0,
    surplusFundBalance: 0,
    totalAllocatedToGoals: 0,
    totalTargetGoals: 0,
    currentMonthUncollectedSurplus: 0,
    activeFundsCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modals state
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [showTransferSurplusModal, setShowTransferSurplusModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingFund, setEditingFund] = useState<PiggyBankItem | null>(null);

  // Form states
  const [selectedTargetFundId, setSelectedTargetFundId] = useState<string>('');
  const [actionAmount, setActionAmount] = useState<string>('');
  const [actionNote, setActionNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create Fund Form State
  const [newFundName, setNewFundName] = useState('');
  const [newFundCategory, setNewFundCategory] = useState<PiggyBankItem['category']>('general');
  const [newFundTarget, setNewFundTarget] = useState('');
  const [newFundInitial, setNewFundInitial] = useState('');
  const [newFundIcon, setNewFundIcon] = useState('PiggyBank');
  const [newFundColor, setNewFundColor] = useState('#3B82F6');
  const [newFundNotes, setNewFundNotes] = useState('');

  // History filter
  const [historyFilterFundId, setHistoryFilterFundId] = useState<string>('all');
  const [historySearch, setHistorySearch] = useState('');

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast(null);
    }, 4000);
  };

  const fetchPiggyBanks = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/piggy-banks${userId ? `?userId=${userId}` : ''}`);
      if (!res.ok) throw new Error('Failed to load piggy banks');
      const data = await res.json();
      setFunds(data.piggyBanks || []);
      setTransactions(data.transactions || []);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error loading piggy bank funds');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPiggyBanks();
  }, [userId]);

  const surplusFund = useMemo(() => {
    return funds.find(f => f.isSurplusFund || f.name.toLowerCase() === 'surplus fund');
  }, [funds]);

  const goalFunds = useMemo(() => {
    return funds.filter(f => !f.isSurplusFund && f.name.toLowerCase() !== 'surplus fund');
  }, [funds]);

  // Open Accommodate Modal with specific target fund
  const handleOpenAllocate = (targetId?: string) => {
    if (goalFunds.length === 0) {
      setErrorMsg('Pehle kam se kam ek Piggy Bank Fund banayein!');
      return;
    }
    setSelectedTargetFundId(targetId || goalFunds[0]?.id || '');
    setActionAmount('');
    setActionNote('');
    setShowAllocateModal(true);
  };

  // Submit Accommodate from Surplus
  const handleAllocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(actionAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('Kripya valid transfer amount dalein');
      return;
    }
    if ((surplusFund?.currentBalance || 0) < amt) {
      setErrorMsg(`Surplus Fund me sirf ₹${(surplusFund?.currentBalance || 0).toLocaleString('en-IN')} bache hain.`);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await fetch('/api/piggy-banks/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetFundId: selectedTargetFundId,
          amount: amt,
          note: actionNote,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to allocate funds');
      }

      setFunds(data.piggyBanks || []);
      setTransactions(data.transactions || []);
      if (data.summary) setSummary(data.summary);
      setShowAllocateModal(false);
      showToast(data.message || 'Paisa safaltapoorvak accommodate ho gaya!');
      if (onRefreshUserData) onRefreshUserData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Transfer Monthly Surplus into Surplus Fund
  const handleTransferSurplusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(actionAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('Kripya valid surplus amount dalein');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await fetch('/api/piggy-banks/transfer-surplus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          note: actionNote || 'Month surplus deposit',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to transfer surplus');
      }

      setFunds(data.piggyBanks || []);
      setTransactions(data.transactions || []);
      if (data.summary) setSummary(data.summary);
      setShowTransferSurplusModal(false);
      showToast(data.message || 'Surplus Fund me jama ho gaya!');
      if (onRefreshUserData) onRefreshUserData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Direct Deposit Submit
  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(actionAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('Kripya valid deposit amount dalein');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await fetch('/api/piggy-banks/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundId: selectedTargetFundId,
          amount: amt,
          note: actionNote,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to deposit into fund');
      }

      setFunds(data.piggyBanks || []);
      setTransactions(data.transactions || []);
      if (data.summary) setSummary(data.summary);
      setShowDepositModal(false);
      showToast(data.message || 'Deposit safal raha!');
      if (onRefreshUserData) onRefreshUserData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Withdraw Submit
  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(actionAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('Kripya valid withdrawal amount dalein');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await fetch('/api/piggy-banks/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundId: selectedTargetFundId,
          amount: amt,
          note: actionNote,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to withdraw from fund');
      }

      setFunds(data.piggyBanks || []);
      setTransactions(data.transactions || []);
      if (data.summary) setSummary(data.summary);
      setShowWithdrawModal(false);
      showToast(data.message || 'Raqam nikaal li gayi!');
      if (onRefreshUserData) onRefreshUserData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Fund Submit
  const handleCreateFundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFundName.trim()) {
      setErrorMsg('Fund ka naam zaroori hai');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await fetch('/api/piggy-banks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFundName.trim(),
          category: newFundCategory,
          targetAmount: parseFloat(newFundTarget) || 0,
          initialBalance: parseFloat(newFundInitial) || 0,
          icon: newFundIcon,
          color: newFundColor,
          notes: newFundNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create piggy bank');
      }

      setFunds(data.piggyBanks || []);
      setTransactions(data.transactions || []);
      if (data.summary) setSummary(data.summary);
      setShowCreateModal(false);
      // Reset form
      setNewFundName('');
      setNewFundTarget('');
      setNewFundInitial('');
      setNewFundNotes('');
      showToast(`Naya fund "${data.fund.name}" safaltapoorvak ban gaya!`);
      if (onRefreshUserData) onRefreshUserData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit Fund Submit
  const handleEditFundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFund) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await fetch(`/api/piggy-banks/${editingFund.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingFund.name,
          category: editingFund.category,
          targetAmount: editingFund.targetAmount,
          icon: editingFund.icon,
          color: editingFund.color,
          notes: editingFund.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update fund');
      }

      setFunds(data.piggyBanks || []);
      setTransactions(data.transactions || []);
      if (data.summary) setSummary(data.summary);
      setEditingFund(null);
      showToast('Fund update ho gaya!');
      if (onRefreshUserData) onRefreshUserData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Fund
  const handleDeleteFund = async (fund: PiggyBankItem) => {
    if (fund.isSurplusFund) return;
    const confirmText = fund.currentBalance > 0
      ? `Kya aap "${fund.name}" ko delete karna chahte hain? Iska bacha hua ₹${fund.currentBalance.toLocaleString('en-IN')} automatically Surplus Fund me wapas chala jayega.`
      : `Kya aap "${fund.name}" ko delete karna chahte hain?`;

    if (!window.confirm(confirmText)) return;

    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/piggy-banks/${fund.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete fund');
      }

      setFunds(data.piggyBanks || []);
      setTransactions(data.transactions || []);
      if (data.summary) setSummary(data.summary);
      showToast(data.message || 'Fund delete ho gaya');
      if (onRefreshUserData) onRefreshUserData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchFund =
        historyFilterFundId === 'all' ||
        t.sourceFundId === historyFilterFundId ||
        t.targetFundId === historyFilterFundId;

      const matchSearch =
        !historySearch.trim() ||
        (t.note && t.note.toLowerCase().includes(historySearch.toLowerCase())) ||
        (t.targetFundName && t.targetFundName.toLowerCase().includes(historySearch.toLowerCase())) ||
        (t.sourceFundName && t.sourceFundName.toLowerCase().includes(historySearch.toLowerCase()));

      return matchFund && matchSearch;
    });
  }, [transactions, historyFilterFundId, historySearch]);

  const targetFundForModal = goalFunds.find(f => f.id === selectedTargetFundId) || goalFunds[0];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3 rounded-xl bg-emerald-600 text-white font-medium shadow-2xl animate-fade-in border border-emerald-400/40">
          <Check className="w-5 h-5 text-emerald-100" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start justify-between shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
            <p className="text-sm font-medium">{errorMsg}</p>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-rose-500 hover:text-rose-700 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Glassmorphic Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 shadow-2xl border border-white/10">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-80 h-80 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-emerald-300 tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Smart Savings & Accommodate Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <PiggyBank className="w-8 h-8 text-emerald-400" />
              Piggy Banks & Dedicated Funds
            </h1>
            <p className="text-slate-300 text-sm max-w-2xl leading-relaxed">
              Mahine ka bacha surplus paisa ek jagah store karein aur House Construction (HC), Medical, Car Purchase aur Emergency jaise specific funds me accommodate karein.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleOpenAllocate()}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-sm font-semibold shadow-lg shadow-emerald-500/25 transition-all transform hover:-translate-y-0.5 flex items-center gap-2"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>✨ Accommodate Surplus</span>
            </button>
            <button
              onClick={() => {
                setActionAmount(summary.currentMonthUncollectedSurplus > 0 ? String(summary.currentMonthUncollectedSurplus) : '');
                setActionNote('');
                setShowTransferSurplusModal(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-sm font-semibold backdrop-blur-md border border-white/20 transition-all flex items-center gap-2"
            >
              <ArrowDownRight className="w-4 h-4 text-emerald-300" />
              <span>📥 Move Month Surplus</span>
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-white text-sm font-medium border border-white/15 transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4 text-indigo-300" />
              <span>New Piggy Bank</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top 4 Overview Metrics (Glassmorphic Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Surplus Fund Card (Special Star) */}
        <div className="relative overflow-hidden p-5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-emerald-500/30 shadow-lg shadow-emerald-500/5 group hover:border-emerald-500 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              Surplus Fund (Available)
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              ₹{(surplusFund?.currentBalance || 0).toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Ready to accommodate into goal funds
            </p>
          </div>
          <button
            onClick={() => handleOpenAllocate()}
            className="mt-3 w-full py-1.5 px-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 transition-all flex items-center justify-center gap-1"
          >
            <span>Distribute / Accommodate</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* 2. Total Saved in Goals */}
        <div className="p-5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" />
              Total in Goal Funds
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              ₹{summary.totalAllocatedToGoals.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
              <span>Target: ₹{summary.totalTargetGoals.toLocaleString('en-IN')}</span>
              <span className="font-semibold text-indigo-600">
                {summary.totalTargetGoals > 0 ? Math.round((summary.totalAllocatedToGoals / summary.totalTargetGoals) * 100) : 0}%
              </span>
            </div>
          </div>
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all duration-500"
              style={{
                width: `${summary.totalTargetGoals > 0 ? Math.min(100, Math.round((summary.totalAllocatedToGoals / summary.totalTargetGoals) * 100)) : 0}%`,
              }}
            />
          </div>
        </div>

        {/* 3. Month's Net Surplus */}
        <div className="p-5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Is Mahine Ka Surplus
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              ₹{summary.currentMonthUncollectedSurplus.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Kamai - Kharcha is mahine ka net
            </p>
          </div>
          {summary.currentMonthUncollectedSurplus > 0 ? (
            <button
              onClick={() => {
                setActionAmount(String(summary.currentMonthUncollectedSurplus));
                setActionNote('');
                setShowTransferSurplusModal(true);
              }}
              className="mt-3 w-full py-1.5 px-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-100 transition-all flex items-center justify-center gap-1"
            >
              <span>Move into Surplus Fund</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          ) : (
            <div className="mt-3 text-xs text-slate-400 italic text-center py-1">
              No surplus yet this month
            </div>
          )}
        </div>

        {/* 4. Active Piggy Bank Goals Count */}
        <div className="p-5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Active Funds
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center">
              <PiggyBank className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {goalFunds.length} Goals
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              HC, Medical, Car & Emergency Funds
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-3 w-full py-1.5 px-3 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-xs font-semibold hover:bg-purple-100 transition-all flex items-center justify-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add Another Goal</span>
          </button>
        </div>
      </div>

      {/* Main Piggy Bank Funds Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <PiggyBank className="w-5 h-5 text-indigo-600" />
              Aapke Piggy Bank Funds
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Har fund ka target set karein aur surplus fund se paisa accommodate karein
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchPiggyBanks}
              disabled={isLoading}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              title="Refresh Funds"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Funds Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
          {goalFunds.map(fund => {
            const IconComponent = FUND_ICONS[fund.icon] || PiggyBank;
            const progress = fund.targetAmount > 0
              ? Math.min(100, Math.round((fund.currentBalance / fund.targetAmount) * 100))
              : 0;

            return (
              <div
                key={fund.id}
                className="relative group rounded-3xl p-6 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800 shadow-md hover:shadow-2xl transition-all duration-300 flex flex-col justify-between"
              >
                {/* Top bar: Icon, Name, Target, Actions */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div
                        className="w-13 h-13 rounded-2xl flex items-center justify-center shadow-md transition-transform group-hover:scale-105"
                        style={{
                          backgroundColor: `${fund.color}15`,
                          color: fund.color,
                          border: `1.5px solid ${fund.color}35`,
                        }}
                      >
                        <IconComponent className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-slate-900 dark:text-white text-base leading-snug">
                            {fund.name}
                          </h3>
                        </div>
                        <span
                          className="inline-block px-2 py-0.5 mt-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: `${fund.color}15`,
                            color: fund.color,
                          }}
                        >
                          {fund.category}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingFund(fund)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                        title="Edit Target / Details"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteFund(fund)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
                        title="Delete Fund"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Notes / Description */}
                  {fund.notes && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5 line-clamp-1 italic">
                      "{fund.notes}"
                    </p>
                  )}

                  {/* Amount & Progress Bar */}
                  <div className="mt-5 space-y-2">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                          Current Savings
                        </span>
                        <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                          ₹{fund.currentBalance.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                          Target Goal
                        </span>
                        <span className="text-base font-bold text-slate-700 dark:text-slate-300">
                          ₹{fund.targetAmount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    {/* Progress indicator */}
                    <div className="space-y-1">
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${progress}%`,
                            backgroundColor: fund.color,
                          }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[11px] font-medium text-slate-400">
                        <span>{progress}% Achieved</span>
                        <span>
                          {fund.targetAmount > fund.currentBalance
                            ? `₹${(fund.targetAmount - fund.currentBalance).toLocaleString('en-IN')} baaki`
                            : '🎉 Goal Reached!'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Bottom Quick Actions */}
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleOpenAllocate(fund.id)}
                    className="py-2 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-all flex items-center justify-center gap-1 border border-emerald-500/20 hover:scale-[1.02]"
                    title="Transfer money from Surplus Fund to this fund"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Accommodate</span>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedTargetFundId(fund.id);
                      setActionAmount('');
                      setActionNote('');
                      setShowDepositModal(true);
                    }}
                    className="py-2 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Deposit</span>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedTargetFundId(fund.id);
                      setActionAmount('');
                      setActionNote('');
                      setShowWithdrawModal(true);
                    }}
                    className="py-2 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all flex items-center justify-center gap-1"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
                    <span>Spend</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fund History / Allocation Ledger */}
      <div className="mt-8 rounded-3xl p-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-500" />
              Piggy Bank Activity & Allocation Ledger
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Surplus deposits, goal allocations, aur fund withdrawals ka poora hisaab
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search notes or funds..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Fund Filter */}
            <select
              value={historyFilterFundId}
              onChange={e => setHistoryFilterFundId(e.target.value)}
              className="py-1.5 px-3 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              <option value="all">All Funds</option>
              {funds.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Activity List */}
        <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800/60">
          {filteredTransactions.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              <PiggyBank className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>Abhi tak koi activity nahi hui hai.</p>
              <p className="text-xs text-slate-400 mt-1">
                Surplus fund se kisi goal fund me paise accommodate karein ya direct deposit karein.
              </p>
            </div>
          ) : (
            filteredTransactions.slice(0, 20).map(t => {
              const isSurplusDeposit = t.type === 'surplus_deposit';
              const isAllocation = t.type === 'allocation_out' || t.type === 'allocation_in';
              const isDirectDeposit = t.type === 'direct_deposit';
              const isWithdrawal = t.type === 'withdrawal';

              return (
                <div key={t.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isAllocation
                          ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60'
                          : isSurplusDeposit
                          ? 'bg-teal-100 text-teal-600 dark:bg-teal-950/60'
                          : isDirectDeposit
                          ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/60'
                          : 'bg-rose-100 text-rose-600 dark:bg-rose-950/60'
                      }`}
                    >
                      {isAllocation ? (
                        <Sparkles className="w-4 h-4" />
                      ) : isSurplusDeposit ? (
                        <ArrowDownRight className="w-4 h-4" />
                      ) : isDirectDeposit ? (
                        <Plus className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                          {isAllocation
                            ? `Accommodated: ${t.sourceFundName || 'Surplus'} ➡️ ${t.targetFundName}`
                            : isSurplusDeposit
                            ? `Surplus Deposit (${t.targetFundName || 'Surplus Fund'})`
                            : isDirectDeposit
                            ? `Direct Deposit: ${t.targetFundName}`
                            : `Withdrawn from: ${t.sourceFundName}`}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isAllocation
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                              : isSurplusDeposit
                              ? 'bg-teal-50 text-teal-600 border border-teal-200'
                              : isDirectDeposit
                              ? 'bg-blue-50 text-blue-600 border border-blue-200'
                              : 'bg-rose-50 text-rose-600 border border-rose-200'
                          }`}
                        >
                          {t.type.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>{t.date} {t.time || ''}</span>
                        {t.note && <span>• {t.note}</span>}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-base font-black ${
                        isWithdrawal ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {isWithdrawal ? '-' : '+'}₹{t.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ----------------- MODAL 1: ACCOMMODATE FROM SURPLUS ----------------- */}
      {showAllocateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Accommodate from Surplus Fund
                  </h3>
                  <p className="text-xs text-slate-500">
                    Surplus Fund se paisa nikaal kar goal piggy bank me transfer karein
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAllocateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Surplus Banner */}
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  Surplus Fund Available:
                </span>
                <div className="text-xl font-extrabold text-emerald-900 dark:text-emerald-100">
                  ₹{(surplusFund?.currentBalance || 0).toLocaleString('en-IN')}
                </div>
              </div>
              <Sparkles className="w-6 h-6 text-emerald-500/70" />
            </div>

            <form onSubmit={handleAllocateSubmit} className="space-y-4">
              {/* Target Fund Dropdown */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Destination Fund (Kaha Daalna Hai?)
                </label>
                <select
                  value={selectedTargetFundId}
                  onChange={e => setSelectedTargetFundId(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none text-sm"
                  required
                >
                  {goalFunds.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} (Current: ₹{f.currentBalance.toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount Input & Quick Percentages */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Transfer Amount (₹)
                  </label>
                  {surplusFund && surplusFund.currentBalance > 0 && (
                    <div className="flex gap-1.5">
                      {[0.25, 0.5, 0.75, 1].map(ratio => {
                        const val = Math.round(surplusFund.currentBalance * ratio);
                        return (
                          <button
                            type="button"
                            key={ratio}
                            onClick={() => setActionAmount(String(val))}
                            className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-950 text-slate-700 dark:text-slate-300 hover:text-emerald-700 transition-all border border-slate-200 dark:border-slate-700"
                          >
                            {ratio * 100}%
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  placeholder="e.g. 10000"
                  value={actionAmount}
                  onChange={e => setActionAmount(e.target.value)}
                  max={surplusFund?.currentBalance || 0}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              {/* Note / Purpose */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Note / Reason (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Monthly surplus accommodated for HC Cement & Bricks"
                  value={actionNote}
                  onChange={e => setActionNote(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Live Preview calculation */}
              {parseFloat(actionAmount) > 0 && targetFundForModal && (
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-xs space-y-1 border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Surplus Fund Naya Balance:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      ₹{Math.max(0, (surplusFund?.currentBalance || 0) - parseFloat(actionAmount)).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{targetFundForModal.name} Naya Balance:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{(targetFundForModal.currentBalance + parseFloat(actionAmount)).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAllocateModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !parseFloat(actionAmount) || (surplusFund?.currentBalance || 0) < parseFloat(actionAmount)}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Transferring...' : '✨ Confirm Accommodate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL 2: TRANSFER MONTH SURPLUS TO SURPLUS FUND ----------------- */}
      {showTransferSurplusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
                  <ArrowDownRight className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Move Month's Surplus into Surplus Fund
                  </h3>
                  <p className="text-xs text-slate-500">
                    Is mahine ki bachat ko Surplus Fund me jama karein
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTransferSurplusModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <span>
                  Is mahine ka calculated net surplus <b>₹{summary.currentMonthUncollectedSurplus.toLocaleString('en-IN')}</b> hai. Ise Surplus Fund me jama karke aap aage chal kar HC Fund ya Car Fund me distribute kar sakte hain.
                </span>
              </div>
            </div>

            <form onSubmit={handleTransferSurplusSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Surplus Amount (₹)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 15000"
                  value={actionAmount}
                  onChange={e => setActionAmount(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. September month savings deposit"
                  value={actionNote}
                  onChange={e => setActionNote(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferSurplusModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !parseFloat(actionAmount)}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-sm shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Transferring...' : '📥 Deposit to Surplus Fund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL 3: DIRECT DEPOSIT ----------------- */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Direct Deposit into Fund
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kahi aur se aaya hua paisa sidhe kisi piggy bank me add karein
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDepositModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDepositSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Select Piggy Bank Fund
                </label>
                <select
                  value={selectedTargetFundId}
                  onChange={e => setSelectedTargetFundId(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                >
                  {funds.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} (Current: ₹{f.currentBalance.toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Amount (₹)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 5000"
                  value={actionAmount}
                  onChange={e => setActionAmount(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Extra gift money, bonus, or cash addition"
                  value={actionNote}
                  onChange={e => setActionNote(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDepositModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !parseFloat(actionAmount)}
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding...' : '➕ Confirm Deposit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL 4: WITHDRAW / SPEND ----------------- */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Spend / Withdraw from Fund
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kisi piggy bank fund se paise nikaal kar kharch karein
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleWithdrawSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Select Piggy Bank Fund
                </label>
                <select
                  value={selectedTargetFundId}
                  onChange={e => setSelectedTargetFundId(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  required
                >
                  {funds.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} (Available: ₹{f.currentBalance.toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Withdrawal Amount (₹)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 20000"
                  value={actionAmount}
                  onChange={e => setActionAmount(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Spent On / Purpose (Required)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bought bricks for construction / Doctor hospital payment"
                  value={actionNote}
                  onChange={e => setActionNote(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !parseFloat(actionAmount)}
                  className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-500/25 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Withdrawing...' : '💸 Confirm Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL 5: CREATE NEW PIGGY BANK ----------------- */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
                  <PiggyBank className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Create New Piggy Bank Fund
                  </h3>
                  <p className="text-xs text-slate-500">
                    Alag saving goal ke liye dedicated fund banayein
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFundSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Fund Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Vacation & Travel Fund / Gold Purchase / Sister Wedding"
                  value={newFundName}
                  onChange={e => setNewFundName(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Category
                  </label>
                  <select
                    value={newFundCategory}
                    onChange={e => setNewFundCategory(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="construction">Construction & Housing</option>
                    <option value="medical">Medical & Health</option>
                    <option value="emergency">Emergency & Operation</option>
                    <option value="vehicle">Vehicle & Car</option>
                    <option value="investment">Investment & Assets</option>
                    <option value="general">General Goal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Target Goal (₹)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 200000"
                    value={newFundTarget}
                    onChange={e => setNewFundTarget(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Initial Deposit (₹) - Optional
                </label>
                <input
                  type="number"
                  placeholder="e.g. 0"
                  value={newFundInitial}
                  onChange={e => setNewFundInitial(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Icon Picker */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Choose Icon
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(FUND_ICONS).map(iconKey => {
                    const IconC = FUND_ICONS[iconKey];
                    const isSelected = newFundIcon === iconKey;
                    return (
                      <button
                        type="button"
                        key={iconKey}
                        onClick={() => setNewFundIcon(iconKey)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 scale-105'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        <IconC className="w-5 h-5" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Accent Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(c => {
                    const isSelected = newFundColor === c.value;
                    return (
                      <button
                        type="button"
                        key={c.value}
                        onClick={() => setNewFundColor(c.value)}
                        className={`w-7 h-7 rounded-full transition-transform ${
                          isSelected ? 'scale-125 ring-2 ring-offset-2 ring-indigo-500' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: c.value }}
                      />
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Short Description / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Long term family goal for 2027"
                  value={newFundNotes}
                  onChange={e => setNewFundNotes(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newFundName.trim()}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : '✨ Create Piggy Bank'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL 6: EDIT FUND ----------------- */}
      {editingFund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Edit {editingFund.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Target amount, icon ya color badlein
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingFund(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditFundSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Fund Name
                </label>
                <input
                  type="text"
                  value={editingFund.name}
                  onChange={e => setEditingFund({ ...editingFund, name: e.target.value })}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Target Goal (₹)
                </label>
                <input
                  type="number"
                  value={editingFund.targetAmount}
                  onChange={e => setEditingFund({ ...editingFund, targetAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>

              {/* Icon Picker */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Choose Icon
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(FUND_ICONS).map(iconKey => {
                    const IconC = FUND_ICONS[iconKey];
                    const isSelected = editingFund.icon === iconKey;
                    return (
                      <button
                        type="button"
                        key={iconKey}
                        onClick={() => setEditingFund({ ...editingFund, icon: iconKey })}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 scale-105'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        <IconC className="w-5 h-5" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Accent Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(c => {
                    const isSelected = editingFund.color === c.value;
                    return (
                      <button
                        type="button"
                        key={c.value}
                        onClick={() => setEditingFund({ ...editingFund, color: c.value })}
                        className={`w-7 h-7 rounded-full transition-transform ${
                          isSelected ? 'scale-125 ring-2 ring-offset-2 ring-indigo-500' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: c.value }}
                      />
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Notes / Description
                </label>
                <input
                  type="text"
                  value={editingFund.notes || ''}
                  onChange={e => setEditingFund({ ...editingFund, notes: e.target.value })}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingFund(null)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
