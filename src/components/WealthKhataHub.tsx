import React, { useState, useEffect } from 'react';
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
  Coins
} from 'lucide-react';
import { InvestmentRecord, SavingsTransfer, UdhaarRecord, AccountId } from '../types';
import { safeFetchJson } from '../utils/api';
import { UdhaarKhataView } from './UdhaarKhataView';

interface WealthKhataHubProps {
  udhaars?: UdhaarRecord[];
  isPrivacyMode?: boolean;
  onAddUdhaar?: (record: Omit<UdhaarRecord, 'id' | 'createdAt'>) => Promise<void>;
  onSettleUdhaar?: (id: string) => Promise<void>;
  onDeleteUdhaar?: (id: string) => Promise<void>;
  onUpdateUdhaar?: (id: string, updates: Partial<UdhaarRecord>) => Promise<void>;
  onRefreshTransactions?: () => Promise<void>;
}

export const WealthKhataHub: React.FC<WealthKhataHubProps> = ({
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
  const [invType, setInvType] = useState<'RD' | 'FD' | 'Mutual Fund' | 'Gold' | 'PPF' | 'Other'>('RD');
  const [invName, setInvName] = useState('');
  const [invAmount, setInvAmount] = useState('');
  const [invAccount, setInvAccount] = useState<AccountId>('IC Bank');
  const [invDate, setInvDate] = useState(new Date().toISOString().split('T')[0]);
  const [invMaturity, setInvMaturity] = useState('');
  const [invRate, setInvRate] = useState('');
  const [invNotes, setInvNotes] = useState('');

  // Savings transfers state (e.g. transfers to wife's account)
  const [savingsTransfers, setSavingsTransfers] = useState<SavingsTransfer[]>([]);
  const [isAddTransferOpen, setIsAddTransferOpen] = useState(false);
  const [transAmount, setTransAmount] = useState('');
  const [transRecipient, setTransRecipient] = useState("Wife's Account");
  const [transAccount, setTransAccount] = useState<AccountId>('AX Bank');
  const [transDate, setTransDate] = useState(new Date().toISOString().split('T')[0]);
  const [transNotes, setTransNotes] = useState('');

  // Fetch investments and savings transfers
  const fetchWealthData = async () => {
    const [invRes, savRes] = await Promise.all([
      safeFetchJson<{ investments?: InvestmentRecord[] }>('/api/investments'),
      safeFetchJson<{ savingsTransfers?: SavingsTransfer[] }>('/api/savings-transfers'),
    ]);
    if (invRes.data?.investments) {
      setInvestments(invRes.data.investments);
    }
    if (savRes.data?.savingsTransfers) {
      setSavingsTransfers(savRes.data.savingsTransfers);
    }
  };

  useEffect(() => {
    fetchWealthData();
  }, []);

  const handleAddInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invName.trim() || !invAmount || isNaN(Number(invAmount))) return;
    const { data } = await safeFetchJson<{ success?: boolean; investments?: InvestmentRecord[] }>('/api/investments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: invType,
        name: invName.trim(),
        amount: Number(invAmount),
        account: invAccount,
        date: invDate,
        maturityDate: invMaturity || undefined,
        interestRate: invRate ? Number(invRate) : undefined,
        notes: invNotes.trim(),
      }),
    });
    if (data?.investments) {
      setInvestments(data.investments);
    }
    setInvName('');
    setInvAmount('');
    setInvMaturity('');
    setInvRate('');
    setInvNotes('');
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

  // Totals
  const totalInvestments = investments.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalSavingsTransferred = savingsTransfers.reduce((sum, s) => sum + (s.amount || 0), 0);
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
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              {investments.length} Active Plans
            </span>
          </div>

          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white">
              ₹{isPrivacyMode ? '••••••' : totalInvestments.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
              RD, FD & Mutual Fund ka paisa budget se nikal kar aapke asset pool me safe accumulate hota hai.
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
              <HeartHandshake className="w-4 h-4" />
              Savings to Wife's A/c
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
              {savingsTransfers.length} Transfers
            </span>
          </div>

          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white">
              ₹{isPrivacyMode ? '••••••' : totalSavingsTransferred.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
              Wife ke khate me bheja savings fund personal expense nahi hai — isliye monthly budget se minus nahi hota!
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs">
            <span className="text-rose-400 font-semibold flex items-center gap-1">
              Click to manage savings transfers &rarr;
            </span>
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
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                Investments Portfolio (RD, FD, Mutual Funds & Gold)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Paisa aapke bank se nikal kar investments me invest hua hai. Yahan sabhi RDs aur FDs ka record safe hai.
              </p>
            </div>
            <button
              onClick={() => setIsAddInvOpen(true)}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {investments.map((inv) => (
                <div
                  key={inv.id}
                  className="p-4 bg-slate-950/70 border border-white/[0.08] rounded-xl flex flex-col justify-between hover:border-cyan-500/30 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        {inv.type}
                      </span>
                      <h4 className="font-bold text-sm text-white mt-2">{inv.name}</h4>
                      <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
                        ₹{inv.amount.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteInvestment(inv.id)}
                      className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                      title="Delete investment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/[0.06] text-[11px] text-slate-400 space-y-1">
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
                    {inv.maturityDate && (
                      <div className="flex items-center justify-between">
                        <span>Maturity Date:</span>
                        <span className="font-mono text-slate-300">{inv.maturityDate}</span>
                      </div>
                    )}
                    {inv.notes && (
                      <div className="text-[10px] text-slate-500 italic mt-1 truncate">
                        "{inv.notes}"
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Savings to Wife Sub-Tab View */}
      {activeSubTab === 'savings' && (
        <div className="bg-slate-900/60 border border-white/[0.08] rounded-2xl p-5 backdrop-blur-xl shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-rose-400" />
                Wife's Account Savings Reserve
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Aapne jo savings ka paisa apni wife ke account me transfer kiya hai, yeh personal kharcha nahi hai aur monthly budget limit se deduct nahi hota.
              </p>
            </div>
            <button
              onClick={() => setIsAddTransferOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4" />
              + Transfer to Wife / Savings
            </button>
          </div>

          {savingsTransfers.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400 border border-dashed border-white/[0.08] rounded-xl">
              Abhi koi savings transfer record nahi hai. "+ Transfer to Wife" button se savings transfer add karein.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px] font-mono border-b border-white/[0.06]">
                  <tr>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Recipient</th>
                    <th className="py-2.5 px-4">Debited From Bank</th>
                    <th className="py-2.5 px-4">Note / Reason</th>
                    <th className="py-2.5 px-4 text-right">Transferred Amount</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {savingsTransfers.map((st) => (
                    <tr key={st.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 text-slate-400 font-mono whitespace-nowrap">
                        {st.date}
                      </td>
                      <td className="py-3 px-4 font-semibold text-white">
                        {st.recipient}
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-mono">
                        {st.fromAccount}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {st.notes || 'Monthly family savings reserve'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-400 whitespace-nowrap">
                        ₹{st.amount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDeleteSavingsTransfer(st.id)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Udhaar Khata Sub-Tab View */}
      {activeSubTab === 'udhaar' && (
        <UdhaarKhataView
          records={udhaars}
          isPrivacyMode={isPrivacyMode}
          onAddRecord={onAddUdhaar}
          onSettleRecord={onSettleUdhaar}
          onDeleteRecord={onDeleteUdhaar}
          onUpdateRecord={onUpdateUdhaar}
        />
      )}

      {/* Add Investment Modal */}
      {isAddInvOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                Add Investment Plan (RD / FD / SIP)
              </h3>
              <button
                onClick={() => setIsAddInvOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddInvestment} className="space-y-3.5 mt-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Investment Type</label>
                  <select
                    value={invType}
                    onChange={(e) => setInvType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
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
                  <label className="block text-slate-300 mb-1">Debited Account</label>
                  <select
                    value={invAccount}
                    onChange={(e) => setInvAccount(e.target.value as AccountId)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  >
                    <option value="IC Bank">IC Bank (ICICI Savings)</option>
                    <option value="AX Bank">AX Bank (Axis Salary)</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Plan / Bank Name</label>
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
                  <label className="block text-slate-300 mb-1">Invested Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="5000"
                    value={invAmount}
                    onChange={(e) => setInvAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Interest Rate (% p.a.)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="7.1"
                    value={invRate}
                    onChange={(e) => setInvRate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Investment Date</label>
                  <input
                    type="date"
                    value={invDate}
                    onChange={(e) => setInvDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Maturity Date (Optional)</label>
                  <input
                    type="date"
                    value={invMaturity}
                    onChange={(e) => setInvMaturity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Monthly auto-debit on 5th"
                  value={invNotes}
                  onChange={(e) => setInvNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddInvOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                >
                  Save Investment
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
              <p className="text-slate-300 text-[11px]">
                Yeh transfer aapke personal kharche me count nahi hoga, isse aapka monthly kharcha budget intact rahega.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Transferred Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="15000"
                    value={transAmount}
                    onChange={(e) => setTransAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">From Bank Account</label>
                  <select
                    value={transAccount}
                    onChange={(e) => setTransAccount(e.target.value as AccountId)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  >
                    <option value="AX Bank">AX Bank (Salary)</option>
                    <option value="IC Bank">IC Bank (Savings)</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Recipient Account Label</label>
                <input
                  type="text"
                  value={transRecipient}
                  onChange={(e) => setTransRecipient(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  required
                />
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
                <label className="block text-slate-300 mb-1">Note (Optional)</label>
                <input
                  type="text"
                  placeholder="Monthly savings / emergency reserve"
                  value={transNotes}
                  onChange={(e) => setTransNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddTransferOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
                >
                  Save Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
