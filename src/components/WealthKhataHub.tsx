import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  TrendingUp, 
  HeartHandshake, 
  HandCoins, 
  Plus, 
  Trash2, 
  Calendar, 
  Sparkles, 
  Building2, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ShieldCheck, 
  X,
  Layers,
  Coins,
  Edit3,
  Calculator,
  Clock,
  CheckCircle2,
  AlertCircle,
  Settings
} from 'lucide-react';
import { InvestmentRecord, SavingsTransfer, UdhaarRecord, AccountId, AccountBalancesData, Transaction } from '../types';
import { safeFetchJson } from '../utils/api';
import { calculateInvestmentMetrics } from '../utils/investmentCalculator';
import { UdhaarKhataView } from './UdhaarKhataView';

interface WealthKhataHubProps {
  transactions?: Transaction[];
  udhaars?: UdhaarRecord[];
  isPrivacyMode?: boolean;
  onAddUdhaar?: (record: Omit<UdhaarRecord, 'id' | 'createdAt'>) => Promise<void>;
  onSettleUdhaar?: (id: string) => Promise<void>;
  onDeleteUdhaar?: (id: string) => Promise<void>;
  onUpdateUdhaar?: (id: string, updates: Partial<UdhaarRecord>) => Promise<void>;
  onRefreshTransactions?: () => Promise<void>;
}

export const WealthKhataHub: React.FC<WealthKhataHubProps> = ({
  transactions = [],
  udhaars = [],
  isPrivacyMode = false,
  onAddUdhaar,
  onSettleUdhaar,
  onDeleteUdhaar,
  onUpdateUdhaar,
  onRefreshTransactions,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'investments' | 'savings' | 'udhaar'>('investments');

  // Investments state
  const [investments, setInvestments] = useState<InvestmentRecord[]>([]);
  const [isAddInvOpen, setIsAddInvOpen] = useState(false);
  const [editingInvId, setEditingInvId] = useState<string | null>(null);

  // Form states
  const [invType, setInvType] = useState<'RD' | 'FD' | 'Mutual Fund' | 'Gold' | 'PPF' | 'Other'>('RD');
  const [invName, setInvName] = useState('');
  const [invAmount, setInvAmount] = useState('');
  const [invAccount, setInvAccount] = useState<AccountId>('IC Bank');
  const [invDate, setInvDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [invMaturity, setInvMaturity] = useState('');
  const [invRate, setInvRate] = useState('');
  const [invNotes, setInvNotes] = useState('');
  const [invTenureMonths, setInvTenureMonths] = useState('12');
  const [invPaidMonths, setInvPaidMonths] = useState('1');

  // Savings transfers state (e.g. transfers to wife's account)
  const [savingsTransfers, setSavingsTransfers] = useState<SavingsTransfer[]>([]);
  const [isAddTransferOpen, setIsAddTransferOpen] = useState(false);
  const [transAmount, setTransAmount] = useState('');
  const [transRecipient, setTransRecipient] = useState("Wife's Account");
  const [transAccount, setTransAccount] = useState<AccountId>('AX Bank');
  const [transDate, setTransDate] = useState(new Date().toISOString().split('T')[0]);
  const [transNotes, setTransNotes] = useState('');

  // Wife's Account Base & Live Balance states
  const [balancesData, setBalancesData] = useState<AccountBalancesData | null>(null);
  const [wifeBaseBalance, setWifeBaseBalance] = useState<number>(0);
  const [isEditWifeBaseOpen, setIsEditWifeBaseOpen] = useState(false);
  const [newWifeBaseInput, setNewWifeBaseInput] = useState('');
  const [isSavingWifeBase, setIsSavingWifeBase] = useState(false);

  // Fetch investments, savings transfers, and live account balances
  const fetchWealthData = async () => {
    const [invRes, savRes, balRes] = await Promise.all([
      safeFetchJson<{ investments?: InvestmentRecord[] }>('/api/investments'),
      safeFetchJson<{ savingsTransfers?: SavingsTransfer[] }>('/api/savings-transfers'),
      safeFetchJson<AccountBalancesData>('/api/accounts/balances'),
    ]);
    if (invRes.data?.investments) {
      setInvestments(invRes.data.investments);
    }
    if (savRes.data?.savingsTransfers) {
      setSavingsTransfers(savRes.data.savingsTransfers);
    }
    if (balRes.data) {
      setBalancesData(balRes.data);
      setWifeBaseBalance(Number(balRes.data.wifeBaseBalance) || 0);
    }
  };

  useEffect(() => {
    fetchWealthData();
  }, [transactions]);

  const handleSaveWifeBase = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingWifeBase(true);
    try {
      const val = parseFloat(newWifeBaseInput) || 0;
      const { data } = await safeFetchJson<AccountBalancesData>('/api/accounts/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wifeBaseBalance: Math.max(0, val) }),
      });
      if (data) {
        setBalancesData(data);
        setWifeBaseBalance(Number(data.wifeBaseBalance) || 0);
      }
      setIsEditWifeBaseOpen(false);
      if (onRefreshTransactions) await onRefreshTransactions();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingWifeBase(false);
    }
  };

  // Open modal to add new investment
  const handleOpenAddInvestment = () => {
    setEditingInvId(null);
    setInvType('RD');
    setInvName('');
    setInvAmount('');
    setInvAccount('IC Bank');
    const todayStr = new Date().toISOString().split('T')[0];
    setInvDate(todayStr);
    setInvTenureMonths('12');
    setInvPaidMonths('1');
    const mat = new Date();
    mat.setFullYear(mat.getFullYear() + 1);
    setInvMaturity(mat.toISOString().split('T')[0]);
    setInvRate('6.25');
    setInvNotes('');
    setIsAddInvOpen(true);
  };

  // Open modal to edit existing investment
  const handleOpenEditInvestment = (inv: InvestmentRecord) => {
    setEditingInvId(inv.id);
    setInvType(inv.type);
    setInvName(inv.name);
    setInvAmount(String(inv.monthlyAmount || inv.amount || ''));
    setInvAccount(inv.account || 'IC Bank');
    setInvDate(inv.date || new Date().toISOString().split('T')[0]);
    setInvMaturity(inv.maturityDate || '');
    setInvRate(inv.interestRate !== undefined ? String(inv.interestRate) : '');
    setInvNotes(inv.notes || '');

    const metrics = calculateInvestmentMetrics(inv);
    setInvTenureMonths(String(inv.totalInstallments || metrics.totalInstallments || 12));
    setInvPaidMonths(String(inv.paidInstallments !== undefined ? inv.paidInstallments : metrics.paidInstallments));
    setIsAddInvOpen(true);
  };

  const handleAddInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invName.trim() || !invAmount || isNaN(Number(invAmount))) return;
    const numAmt = Number(invAmount);
    const isRd = invType === 'RD' || invType === 'Mutual Fund';
    const paidM = isRd ? (Number(invPaidMonths) || 1) : 1;
    const tenureM = isRd ? (Number(invTenureMonths) || 12) : 1;

    const payload = {
      type: invType,
      name: invName.trim(),
      amount: numAmt,
      monthlyAmount: isRd ? numAmt : undefined,
      paidInstallments: isRd ? paidM : undefined,
      totalInstallments: isRd ? tenureM : undefined,
      account: invAccount,
      date: invDate,
      maturityDate: invMaturity || undefined,
      interestRate: invRate ? Number(invRate) : undefined,
      notes: invNotes.trim(),
    };

    if (editingInvId) {
      const { data } = await safeFetchJson<{ success?: boolean; investments?: InvestmentRecord[] }>(`/api/investments/${editingInvId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (data?.investments) {
        setInvestments(data.investments);
      }
    } else {
      const { data } = await safeFetchJson<{ success?: boolean; investments?: InvestmentRecord[] }>('/api/investments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (data?.investments) {
        setInvestments(data.investments);
      }
    }

    setEditingInvId(null);
    setIsAddInvOpen(false);
    if (onRefreshTransactions) await onRefreshTransactions();
  };

  const handleDeleteInvestment = async (id: string) => {
    const { data } = await safeFetchJson<{ success?: boolean; investments?: InvestmentRecord[] }>(`/api/investments/${id}`, {
      method: 'DELETE',
    });
    if (data?.investments) {
      setInvestments(data.investments);
    }
    if (onRefreshTransactions) await onRefreshTransactions();
  };

  const handleAddSavingsTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transAmount || isNaN(Number(transAmount))) return;
    const { data } = await safeFetchJson<{ success?: boolean; savingsTransfers?: SavingsTransfer[] }>('/api/savings-transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(transAmount),
        recipient: transRecipient.trim(),
        fromAccount: transAccount,
        date: transDate,
        notes: transNotes.trim(),
      }),
    });
    if (data?.savingsTransfers) {
      setSavingsTransfers(data.savingsTransfers);
    }
    setTransAmount('');
    setTransNotes('');
    setIsAddTransferOpen(false);
    if (onRefreshTransactions) await onRefreshTransactions();
  };

  const handleDeleteSavingsTransfer = async (id: string) => {
    const { data } = await safeFetchJson<{ success?: boolean; savingsTransfers?: SavingsTransfer[] }>(`/api/savings-transfers/${id}`, {
      method: 'DELETE',
    });
    if (data?.savingsTransfers) {
      setSavingsTransfers(data.savingsTransfers);
    }
    if (onRefreshTransactions) await onRefreshTransactions();
  };

  // Live calculation inside modal
  const liveModalMetrics = useMemo(() => {
    const numAmt = Number(invAmount) || 0;
    const isRd = invType === 'RD' || invType === 'Mutual Fund';
    return calculateInvestmentMetrics({
      type: invType,
      amount: numAmt,
      monthlyAmount: isRd ? numAmt : undefined,
      date: invDate,
      maturityDate: invMaturity || undefined,
      interestRate: Number(invRate) || 0,
      paidInstallments: isRd ? (Number(invPaidMonths) || undefined) : undefined,
      totalInstallments: isRd ? (Number(invTenureMonths) || undefined) : undefined,
    });
  }, [invType, invAmount, invDate, invMaturity, invRate, invPaidMonths, invTenureMonths]);

  // Overall Portfolio Totals
  const totalInvestments = useMemo(() => {
    return investments.reduce((sum, i) => sum + calculateInvestmentMetrics(i).currentValue, 0);
  }, [investments]);

  const totalInvestedPrincipal = useMemo(() => {
    return investments.reduce((sum, i) => sum + calculateInvestmentMetrics(i).depositedPrincipal, 0);
  }, [investments]);

  const totalEarnedInterest = Math.max(0, totalInvestments - totalInvestedPrincipal);

  // Total savings transferred to wife (combining dedicated transfers and any transactions marked isSavingsTransfer)
  const totalSavingsTransferred = useMemo(() => {
    let total = savingsTransfers.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    if (transactions && transactions.length > 0) {
      for (const t of transactions) {
        if (t.isSavingsTransfer) {
          const tAmt = Number(t.amount) || 0;
          const isDupe = savingsTransfers.some(
            s => Number(s.amount) === tAmt && s.date === t.date
          );
          if (!isDupe) {
            total += tAmt;
          }
        }
      }
    }
    return total;
  }, [savingsTransfers, transactions]);

  const wifeCurrentLiveBalance = wifeBaseBalance + totalSavingsTransferred;

  const pendingLent = udhaars
    .filter((u) => u.type === 'lent' && u.status !== 'settled')
    .reduce((sum, u) => sum + (Number(u.amount) || 0), 0);
  const pendingBorrowed = udhaars
    .filter((u) => u.type === 'borrowed' && u.status !== 'settled')
    .reduce((sum, u) => sum + (Number(u.amount) || 0), 0);
  const netUdhaar = pendingLent - pendingBorrowed;

  return (
    <div className="space-y-6">
      {/* 3 Clickable Top Cards (Investments, Savings to Wife, Udhaar Khata) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Investments Card */}
        <div
          onClick={() => setActiveSubTab('investments')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden backdrop-blur-xl ${
            activeSubTab === 'investments'
              ? 'bg-cyan-950/40 border-cyan-500/60 ring-2 ring-cyan-500/30 shadow-xl shadow-cyan-950/40'
              : 'bg-slate-900/60 border-white/[0.08] hover:border-cyan-500/40 hover:bg-slate-900/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" />
              Investments (RD / FD / SIP)
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
              {investments.length} Active Plans
            </span>
          </div>

          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white flex items-baseline gap-2">
              <span>₹{isPrivacyMode ? '••••••' : totalInvestments.toLocaleString('en-IN')}</span>
              {totalEarnedInterest > 0 && !isPrivacyMode && (
                <span className="text-xs font-semibold text-emerald-400 font-mono">
                  (+₹{totalEarnedInterest.toLocaleString('en-IN')} Byaj)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
              {isPrivacyMode
                ? 'Investments portfolio hidden in privacy mode'
                : `₹${totalInvestedPrincipal.toLocaleString('en-IN')} Total Deposited · +₹${totalEarnedInterest.toLocaleString('en-IN')} Earned Byaj`}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs">
            <span className="text-cyan-400 font-semibold flex items-center gap-1">
              Click to manage & view details &rarr;
            </span>
          </div>
        </div>

        {/* 2. Savings Transfer to Wife / Reserve Card */}
        <div
          onClick={() => setActiveSubTab('savings')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden backdrop-blur-xl ${
            activeSubTab === 'savings'
              ? 'bg-rose-950/40 border-rose-500/60 ring-2 ring-rose-500/30 shadow-xl shadow-rose-950/40'
              : 'bg-slate-900/60 border-white/[0.08] hover:border-rose-500/40 hover:bg-slate-900/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
              <HeartHandshake className="w-4 h-4 text-rose-400" />
              Wife's Savings A/c (Live Balance)
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
              {savingsTransfers.length} Transfers
            </span>
          </div>

          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white flex items-baseline gap-2">
              <span>₹{isPrivacyMode ? '••••••' : wifeCurrentLiveBalance.toLocaleString('en-IN')}</span>
              {wifeBaseBalance > 0 && !isPrivacyMode && (
                <span className="text-[11px] font-semibold text-rose-300 font-mono">
                  (Base: ₹{wifeBaseBalance.toLocaleString('en-IN')})
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
              {isPrivacyMode
                ? 'Wife savings masked in privacy mode'
                : `Starting Base: ₹${wifeBaseBalance.toLocaleString('en-IN')} · Bheja: +₹${totalSavingsTransferred.toLocaleString('en-IN')} · Real-time live update`}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs">
            <span className="text-rose-400 font-semibold flex items-center gap-1">
              Click to view reserve & transfers &rarr;
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setNewWifeBaseInput(String(wifeBaseBalance || ''));
                setIsEditWifeBaseOpen(true);
              }}
              className="text-[11px] text-rose-300 hover:text-white bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/30 px-2 py-0.5 rounded-lg cursor-pointer transition-colors"
            >
              ✏️ Set Base
            </button>
          </div>
        </div>

        {/* 3. Udhaar Khata Card */}
        <div
          onClick={() => setActiveSubTab('udhaar')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden backdrop-blur-xl ${
            activeSubTab === 'udhaar'
              ? 'bg-emerald-950/40 border-emerald-500/60 ring-2 ring-emerald-500/30 shadow-xl shadow-emerald-950/40'
              : 'bg-slate-900/60 border-white/[0.08] hover:border-emerald-500/40 hover:bg-slate-900/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
              <HandCoins className="w-4 h-4" />
              Udhaar Khata (Diya / Liya)
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {udhaars.filter((u) => u.status !== 'settled').length} Active
            </span>
          </div>

          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white">
              ₹{isPrivacyMode ? '••••••' : Math.abs(netUdhaar).toLocaleString('en-IN')}
              <span className="text-xs font-normal text-slate-400 ml-1.5">
                {netUdhaar >= 0 ? '(Lena hai)' : '(Dena hai)'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
              Doston aur rishtedaaron ka hisaab: Diye ₹{pendingLent.toLocaleString('en-IN')} · Liye ₹{pendingBorrowed.toLocaleString('en-IN')}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs">
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              Click for WhatsApp reminders & settlement &rarr;
            </span>
          </div>
        </div>
      </div>

      {/* Active Sub-Tab View */}
      {activeSubTab === 'investments' && (
        <div className="bg-slate-900/60 border border-white/[0.08] rounded-2xl p-5 backdrop-blur-xl shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] flex-wrap gap-2">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                Investments Portfolio (RD, FD, Mutual Funds & Gold)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Yahan aapki sabhi RDs, FDs aur Investments ka real-time accumulated value (Principal + Byaj) calculate hota hai.
              </p>
            </div>
            <button
              onClick={handleOpenAddInvestment}
              className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4" />
              + Nayi RD / FD Jodein
            </button>
          </div>

          {investments.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400 border border-dashed border-white/[0.08] rounded-xl">
              Abhi koi RD ya FD record nahi hai. "+ Nayi RD / FD Jodein" button se apna investment plan add karein.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {investments.map((inv) => {
                const metrics = calculateInvestmentMetrics(inv);
                return (
                  <div
                    key={inv.id}
                    className="p-4 bg-slate-950/70 border border-white/[0.08] rounded-xl flex flex-col justify-between hover:border-cyan-500/40 transition-all shadow-sm"
                  >
                    <div>
                      {/* Top Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              {inv.type === 'RD' ? 'Recurring Deposit (RD)' : inv.type}
                            </span>
                            {metrics.isRecurring && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                                ₹{metrics.monthlyAmount.toLocaleString('en-IN')} / mo
                              </span>
                            )}
                          </div>
                          <h4 className="font-bold text-sm text-white mt-2">{inv.name}</h4>
                          
                          {/* Current Accumulated Value */}
                          <div className="mt-1.5">
                            <span className="text-[10px] text-slate-400 block uppercase font-mono tracking-wider">Current Portfolio Value</span>
                            <div className="text-xl font-bold font-mono text-cyan-300 flex items-baseline gap-1.5">
                              <span>₹{metrics.currentValue.toLocaleString('en-IN')}</span>
                              {metrics.accruedInterest > 0 && (
                                <span className="text-xs font-semibold text-emerald-400 font-mono">
                                  (+₹{metrics.accruedInterest.toLocaleString('en-IN')} Byaj)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEditInvestment(inv)}
                            className="text-slate-500 hover:text-cyan-400 p-1.5 transition-colors cursor-pointer rounded-lg hover:bg-white/[0.05]"
                            title="Edit investment plan"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteInvestment(inv.id)}
                            className="text-slate-500 hover:text-rose-400 p-1.5 transition-colors cursor-pointer rounded-lg hover:bg-white/[0.05]"
                            title="Delete investment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Breakdown Block */}
                      <div className="mt-3.5 p-2.5 bg-slate-900/80 border border-white/[0.06] rounded-xl text-xs space-y-1.5 font-mono">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">
                            {metrics.isRecurring 
                              ? `Deposited (${metrics.paidInstallments} Installments):` 
                              : 'Principal Invested:'}
                          </span>
                          <span className="font-bold text-white">
                            ₹{metrics.depositedPrincipal.toLocaleString('en-IN')}
                          </span>
                        </div>
                        {metrics.accruedInterest > 0 && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">Earned Interest (Byaj):</span>
                            <span className="font-bold text-emerald-400">
                              +₹{metrics.accruedInterest.toLocaleString('en-IN')}
                            </span>
                          </div>
                        )}

                        {/* Tenure Progress for Recurring Deposits */}
                        {metrics.isRecurring && (
                          <div className="pt-1.5 border-t border-white/[0.04]">
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                              <span>Tenure Progress:</span>
                              <span>{metrics.paidInstallments} of {metrics.totalInstallments} months ({metrics.progressPercent}%)</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full transition-all duration-300"
                                style={{ width: `${metrics.progressPercent}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Metadata & Maturity Projections */}
                    <div className="mt-4 pt-3 border-t border-white/[0.06] text-[11px] text-slate-400 space-y-1.5 font-mono">
                      <div className="flex items-center justify-between">
                        <span>Debited Account:</span>
                        <span className="font-semibold text-slate-200">{inv.account}</span>
                      </div>
                      {inv.interestRate && (
                        <div className="flex items-center justify-between">
                          <span>Interest Rate:</span>
                          <span className="font-semibold text-emerald-400">{inv.interestRate}% p.a.</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span>Start Date:</span>
                        <span className="text-slate-300">{inv.date}</span>
                      </div>
                      {inv.maturityDate && (
                        <div className="flex items-center justify-between">
                          <span>Maturity Date:</span>
                          <span className="text-slate-300">{inv.maturityDate}</span>
                        </div>
                      )}
                      {metrics.maturityAmount > metrics.currentValue && (
                        <div className="mt-2 pt-2 border-t border-white/[0.04] bg-cyan-950/30 border border-cyan-500/20 p-2 rounded-lg flex items-center justify-between text-[11px]">
                          <span className="text-cyan-300 font-semibold flex items-center gap-1">
                            <Coins className="w-3.5 h-3.5 text-cyan-400" /> Maturity Value:
                          </span>
                          <span className="font-bold text-cyan-200 font-mono">
                            ₹{metrics.maturityAmount.toLocaleString('en-IN')}
                          </span>
                        </div>
                      )}
                      {inv.notes && (
                        <div className="text-[10px] text-slate-500 italic mt-1 truncate">
                          "{inv.notes}"
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Savings to Wife Sub-Tab View */}
      {activeSubTab === 'savings' && (
        <div className="space-y-4">
          {/* Real-Time Live Balance Tracker Banner */}
          <div className="bg-gradient-to-r from-rose-950/60 via-purple-950/40 to-slate-900/80 border border-rose-500/30 rounded-2xl p-5 backdrop-blur-xl shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-rose-500/20">
              <div>
                <span className="text-[10px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  🌸 Real-Time Balance Tracker
                </span>
                <h3 className="text-lg font-bold text-white mt-1.5 flex items-center gap-2">
                  <HeartHandshake className="w-5 h-5 text-rose-400" />
                  Wife's Account Savings & Live Balance
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Jab bhi aap wife ke account me paise bhejte hain, wo yahan real-time update hota hai aur initial opening balance ke saath live bachat dikhata hai.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setNewWifeBaseInput(String(wifeBaseBalance || ''));
                    setIsEditWifeBaseOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 font-semibold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>✏️ Set / Edit Base Balance</span>
                </button>
                <button
                  onClick={() => setIsAddTransferOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Savings Transfer Record Karein</span>
                </button>
              </div>
            </div>

            {/* 3 Metric Cards for Wife's Account */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-4">
              <div className="p-3.5 bg-slate-950/70 border border-rose-500/20 rounded-xl">
                <div className="flex items-center justify-between text-xs text-rose-300 font-medium">
                  <span>📌 Starting / Opening Base</span>
                  <button
                    onClick={() => {
                      setNewWifeBaseInput(String(wifeBaseBalance || ''));
                      setIsEditWifeBaseOpen(true);
                    }}
                    className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
                <div className="text-xl font-bold font-mono text-white mt-1">
                  ₹{isPrivacyMode ? '••••••' : wifeBaseBalance.toLocaleString('en-IN')}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Tracking start karte samay wife ke account me tha
                </p>
              </div>

              <div className="p-3.5 bg-slate-950/70 border border-purple-500/20 rounded-xl">
                <div className="text-xs text-purple-300 font-medium">
                  💸 Kul Transfers Bheje
                </div>
                <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                  +₹{isPrivacyMode ? '••••••' : totalSavingsTransferred.toLocaleString('en-IN')}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {savingsTransfers.length} dedicated transfers recorded
                </p>
              </div>

              <div className="p-3.5 bg-gradient-to-br from-rose-900/40 to-slate-950/90 border border-rose-500/40 rounded-xl shadow-inner">
                <div className="text-xs text-rose-200 font-semibold flex items-center justify-between">
                  <span>💎 Kul Live Balance (Real-Time)</span>
                  <span className="text-[9px] bg-rose-500/30 text-rose-200 px-1.5 py-0.2 rounded font-mono">
                    Live Synced
                  </span>
                </div>
                <div className="text-2xl font-extrabold font-mono text-white mt-1">
                  ₹{isPrivacyMode ? '••••••' : wifeCurrentLiveBalance.toLocaleString('en-IN')}
                </div>
                <p className="text-[10px] text-rose-300/80 mt-1">
                  Base (₹{wifeBaseBalance.toLocaleString('en-IN')}) + Bheja (₹{totalSavingsTransferred.toLocaleString('en-IN')})
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-white/[0.08] rounded-2xl p-5 backdrop-blur-xl shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] flex-wrap gap-2">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <HeartHandshake className="w-4 h-4 text-rose-400" />
                  Wife Ko Bheje Gaye Transfers Ki History
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Har transfer personal kharcha nahi mana jata aur monthly budget se deduct nahi hota.
                </p>
              </div>
            </div>

          {savingsTransfers.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400 border border-dashed border-white/[0.08] rounded-xl">
              Abhi koi savings transfer record nahi hai. "+ Savings Transfer Record Karein" se transfer add karein.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {savingsTransfers.map((s) => (
                <div
                  key={s.id}
                  className="p-4 bg-slate-950/70 border border-white/[0.08] rounded-xl flex flex-col justify-between hover:border-rose-500/30 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        Savings Reserve
                      </span>
                      <h4 className="font-bold text-sm text-white mt-2">{s.recipient}</h4>
                      <div className="text-lg font-bold font-mono text-rose-400 mt-1">
                        ₹{s.amount.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteSavingsTransfer(s.id)}
                      className="text-slate-500 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                      title="Delete transfer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/[0.06] text-[11px] text-slate-400 space-y-1 font-mono">
                    <div className="flex items-center justify-between">
                      <span>From Account:</span>
                      <span className="font-semibold text-slate-200">{s.fromAccount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Date:</span>
                      <span className="text-slate-300">{s.date}</span>
                    </div>
                    {s.notes && (
                      <div className="text-[10px] text-slate-500 italic mt-1 truncate">
                        "{s.notes}"
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      )}

      {/* Udhaar Khata Sub-Tab View */}
      {activeSubTab === 'udhaar' && (
        <div className="space-y-4">
          <UdhaarKhataView
            udhaars={udhaars}
            isPrivacyMode={isPrivacyMode}
            onAddUdhaar={onAddUdhaar}
            onSettleUdhaar={onSettleUdhaar}
            onDeleteUdhaar={onDeleteUdhaar}
            onUpdateUdhaar={onUpdateUdhaar}
          />
        </div>
      )}

      {/* Add / Edit Investment Modal */}
      {isAddInvOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  {editingInvId ? 'Investment Plan Edit Karein' : 'Nayi RD / FD / Investment Jodein'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  RD, FD, Mutual Fund ya SIP ka record rakhein aur exact accumulated value dekhein
                </p>
              </div>
              <button
                onClick={() => setIsAddInvOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddInvestment} className="space-y-3.5 mt-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Investment Type</label>
                  <select
                    value={invType}
                    onChange={(e) => {
                      const newType = e.target.value as any;
                      setInvType(newType);
                      if (newType === 'RD') {
                        setInvRate(invRate || '6.25');
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                  >
                    <option value="RD">Recurring Deposit (RD)</option>
                    <option value="FD">Fixed Deposit (FD)</option>
                    <option value="Mutual Fund">Mutual Fund / SIP</option>
                    <option value="Gold">Digital / Physical Gold</option>
                    <option value="PPF">Public Provident Fund (PPF)</option>
                    <option value="Other">Other Investment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Debited Account</label>
                  <select
                    value={invAccount}
                    onChange={(e) => setInvAccount(e.target.value as AccountId)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                  >
                    <option value="IC Bank">IC Bank (ICICI Savings)</option>
                    <option value="AX Bank">AX Bank (Axis Salary)</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Plan / Bank Name</label>
                <input
                  type="text"
                  placeholder="e.g. ICICI 1-Year RD / HDFC Flexi FD"
                  value={invName}
                  onChange={(e) => setInvName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">
                    {invType === 'RD' || invType === 'Mutual Fund' ? 'Monthly Installment (₹)' : 'Invested Principal (₹)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-bold">₹</span>
                    <input
                      type="number"
                      placeholder="5000"
                      value={invAmount}
                      onChange={(e) => setInvAmount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-7 pr-3 py-2 text-white text-xs font-bold"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Interest Rate (% p.a.)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="6.25"
                    value={invRate}
                    onChange={(e) => setInvRate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    {invType === 'RD' ? 'RD Start Date' : 'Investment Date'}
                  </label>
                  <input
                    type="date"
                    value={invDate}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setInvDate(newDate);
                      if (invType === 'RD' && newDate) {
                        const start = new Date(newDate);
                        const now = new Date();
                        let elapsed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
                        if (now.getDate() >= start.getDate()) {
                          elapsed += 1;
                        }
                        setInvPaidMonths(String(Math.max(1, elapsed)));
                        const tM = Number(invTenureMonths) || 12;
                        const mat = new Date(start);
                        mat.setMonth(mat.getMonth() + tM);
                        setInvMaturity(mat.toISOString().split('T')[0]);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    Maturity Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={invMaturity}
                    onChange={(e) => {
                      const newMat = e.target.value;
                      setInvMaturity(newMat);
                      if (invDate && newMat) {
                        const start = new Date(invDate);
                        const end = new Date(newMat);
                        const diffM = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                        if (diffM > 0) {
                          setInvTenureMonths(String(diffM));
                        }
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  />
                </div>
              </div>

              {/* RD Specific: Tenure & Already Paid Installments */}
              {(invType === 'RD' || invType === 'Mutual Fund') && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/60 border border-white/[0.06] rounded-xl">
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Total Tenure (Months)</label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={invTenureMonths}
                      onChange={(e) => {
                        const newTenure = e.target.value;
                        setInvTenureMonths(newTenure);
                        if (invDate && Number(newTenure) > 0) {
                          const mat = new Date(invDate);
                          mat.setMonth(mat.getMonth() + Number(newTenure));
                          setInvMaturity(mat.toISOString().split('T')[0]);
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Paid Months Till Date</label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={invPaidMonths}
                      onChange={(e) => setInvPaidMonths(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Live Calculation Preview Box */}
              {Number(invAmount) > 0 && (
                <div className="p-3.5 bg-cyan-950/40 border border-cyan-500/40 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5 text-cyan-400" />
                      Live RD & Byaj Calculation
                    </span>
                    <span className="text-[10px] text-cyan-400 font-mono">
                      {invType === 'RD' 
                        ? `${liveModalMetrics.paidInstallments} of ${liveModalMetrics.totalInstallments} Installments` 
                        : 'Lump Sum Principal'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-cyan-500/20 text-[11px] font-mono">
                    <div>
                      <span className="text-slate-400 block">Ab Tak Jama Principal:</span>
                      <span className="font-bold text-white text-sm">
                        ₹{liveModalMetrics.depositedPrincipal.toLocaleString('en-IN')}
                      </span>
                      {invType === 'RD' && (
                        <span className="text-[10px] text-slate-400 block">
                          ({liveModalMetrics.paidInstallments} × ₹{liveModalMetrics.monthlyAmount.toLocaleString('en-IN')})
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-400 block">Accrued Interest (Byaj):</span>
                      <span className="font-bold text-emerald-400 text-sm">
                        +₹{liveModalMetrics.accruedInterest.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-emerald-500/80 block">
                        {invRate ? `@ ${invRate}% p.a.` : 'Quarterly Compounded'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-cyan-500/20 flex items-center justify-between font-mono">
                    <div>
                      <span className="text-[10px] text-cyan-300 block font-semibold uppercase">Current Portfolio Value:</span>
                      <span className="text-base font-bold text-cyan-300">
                        ₹{liveModalMetrics.currentValue.toLocaleString('en-IN')}
                      </span>
                    </div>
                    {liveModalMetrics.maturityAmount > 0 && (
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Maturity Par Expected:</span>
                        <span className="text-xs font-bold text-slate-200">
                          ₹{liveModalMetrics.maturityAmount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. RD For Priyansh / Monthly auto-debit on 3rd"
                  value={invNotes}
                  onChange={(e) => setInvNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsAddInvOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-900/30 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{editingInvId ? 'Update Investment Plan' : 'Save Investment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Savings Transfer Modal */}
      {isAddTransferOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-rose-400" />
                Transfer to Wife / Savings Reserve
              </h3>
              <button
                onClick={() => setIsAddTransferOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSavingsTransfer} className="space-y-3.5 mt-4 text-xs font-mono">
              <div>
                <label className="block text-slate-300 mb-1">Transfer Amount (₹)</label>
                <input
                  type="number"
                  placeholder="15000"
                  value={transAmount}
                  onChange={(e) => setTransAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Recipient Name</label>
                  <input
                    type="text"
                    value={transRecipient}
                    onChange={(e) => setTransRecipient(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">From Account</label>
                  <select
                    value={transAccount}
                    onChange={(e) => setTransAccount(e.target.value as AccountId)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  >
                    <option value="AX Bank">AX Bank (Axis Salary)</option>
                    <option value="IC Bank">IC Bank (ICICI Savings)</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Transfer Date</label>
                <input
                  type="date"
                  value={transDate}
                  onChange={(e) => setTransDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Monthly savings reserve transfer"
                  value={transNotes}
                  onChange={(e) => setTransNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsAddTransferOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer shadow-md shadow-rose-900/30"
                >
                  Save Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal to Set / Edit Wife's Starting Base Balance */}
      {isEditWifeBaseOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditWifeBaseOpen(false);
          }}
        >
          <div
            className="relative bg-[#0f172a] border border-rose-500/40 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col my-auto animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <HeartHandshake className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-sans">
                    Wife's Account Base Balance
                  </h3>
                  <p className="text-xs text-slate-400 font-sans">
                    Starting / Opening balance update karein
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditWifeBaseOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWifeBase} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-rose-300 mb-1.5 font-sans">
                  Starting / Opening Base Balance (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold font-mono">₹</span>
                  <input
                    type="number"
                    placeholder="e.g. 25000"
                    value={newWifeBaseInput}
                    onChange={(e) => setNewWifeBaseInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2.5 text-white font-mono focus:outline-hidden focus:border-rose-500 text-sm"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-2 font-sans">
                  Yeh wife ke account ka initial starting balance hai. Iske baad jo bhi transfers aap bhejenge, wo real time isme judte rahenge.
                </p>
              </div>

              <div className="p-3.5 bg-rose-950/30 border border-rose-500/20 rounded-xl text-xs text-rose-200 space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span>Transfers Sent to Wife:</span>
                  <span className="font-bold text-emerald-400">+₹{totalSavingsTransferred.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between font-bold text-white pt-1.5 border-t border-rose-500/20 text-sm">
                  <span>Naya Total Live Balance:</span>
                  <span className="text-pink-400">
                    ₹{((parseFloat(newWifeBaseInput) || 0) + totalSavingsTransferred).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditWifeBaseOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer text-xs font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingWifeBase}
                  className="px-5 py-2 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer text-xs font-sans"
                >
                  {isSavingWifeBase ? 'Save ho raha hai...' : '💾 Base Balance Save Karein'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
