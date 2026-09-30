import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Building2, 
  Wallet, 
  Plus, 
  Trash2, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownLeft, 
  AlertCircle, 
  CheckCircle2, 
  X,
  Clock,
  Layers,
  Zap,
  TrendingDown,
  ReceiptText,
  Download,
  FileSpreadsheet,
  Filter,
  Sparkles
} from 'lucide-react';
import { Transaction, AccountId, CardEmi, UserRole } from '../types';
import { ACCOUNTS_CONFIG, ALL_ACCOUNTS } from '../utils/accounts';
import { safeFetchJson } from '../utils/api';
import { 
  exportAccountStatementToExcel, 
  filterTransactionsForStatement,
  StatementExportOptions 
} from '../utils/statementExport';

interface AccountsLedgerViewProps {
  transactions: Transaction[];
  onUpdateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
  onRefreshTransactions?: () => Promise<void>;
  userRole?: UserRole;
  activeFamilyMemberName?: string;
  isPrivacyMode?: boolean;
  selectedMonth?: string;
  onSelectMonth?: (month: string) => void;
  availableMonths?: string[];
}

export const AccountsLedgerView: React.FC<AccountsLedgerViewProps> = ({
  transactions,
  onUpdateTransaction,
  onRefreshTransactions,
  userRole = 'owner',
  activeFamilyMemberName,
  isPrivacyMode = false,
  selectedMonth = 'all',
  onSelectMonth,
  availableMonths = [],
}) => {
  const isFamily = userRole === 'family';
  const [selectedAccountId, setSelectedAccountId] = useState<AccountId | 'all'>('ICICI CC 0000');
  const [emis, setEmis] = useState<CardEmi[]>([]);
  const [isAddEmiOpen, setIsAddEmiOpen] = useState(false);
  const [isRecordBillPaymentOpen, setIsRecordBillPaymentOpen] = useState(false);
  const [billAmount, setBillAmount] = useState('');
  const [billFromAccount, setBillFromAccount] = useState<AccountId>('AX Bank');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);

  // Statement Export Modal & State
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [exportAccountId, setExportAccountId] = useState<AccountId | 'all'>(selectedAccountId);
  const [exportDateRange, setExportDateRange] = useState<StatementExportOptions['dateRange']>('all');
  const [exportStartDate, setExportStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [exportEndDate, setExportEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [exportIncludeEmis, setExportIncludeEmis] = useState(true);
  const [exportIncludeOverview, setExportIncludeOverview] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form states for Add EMI
  const [emiTitle, setEmiTitle] = useState('');
  const [emiAmount, setEmiAmount] = useState('');
  const [emiTotalMonths, setEmiTotalMonths] = useState('12');
  const [emiPaidMonths, setEmiPaidMonths] = useState('0');
  const [emiDueDay, setEmiDueDay] = useState('15');
  const [emiNotes, setEmiNotes] = useState('');

  // Keep export account in sync with active tab when opened
  useEffect(() => {
    setExportAccountId(selectedAccountId);
  }, [selectedAccountId]);

  // Fetch EMIs
  const fetchEmis = async () => {
    const { data } = await safeFetchJson<{ emis?: CardEmi[] }>('/api/emis');
    if (data?.emis) {
      setEmis(data.emis);
    }
  };

  useEffect(() => {
    fetchEmis();
  }, []);

  const handleAddEmi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emiTitle.trim() || !emiAmount || isNaN(Number(emiAmount))) return;
    const targetCard = selectedAccountId === 'all' ? 'SBI CC 5733' : selectedAccountId;
    const { data } = await safeFetchJson<{ success?: boolean; emis?: CardEmi[] }>('/api/emis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: targetCard,
        title: emiTitle.trim(),
        monthlyAmount: Number(emiAmount),
        totalMonths: Number(emiTotalMonths) || 12,
        paidMonths: Number(emiPaidMonths) || 0,
        dueDay: Number(emiDueDay) || 15,
        notes: emiNotes.trim(),
      }),
    });
    if (data?.emis) {
      setEmis(data.emis);
    }
    setEmiTitle('');
    setEmiAmount('');
    setEmiPaidMonths('0');
    setEmiNotes('');
    setIsAddEmiOpen(false);
  };

  const handleDeleteEmi = async (id: string) => {
    const { data } = await safeFetchJson<{ success?: boolean; emis?: CardEmi[] }>(`/api/emis/${id}`, {
      method: 'DELETE',
    });
    if (data?.emis) {
      setEmis(data.emis);
    }
  };

  const handleRecordBillPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billAmount || isNaN(Number(billAmount)) || Number(billAmount) <= 0) return;
    const targetCard = selectedAccountId === 'all' ? 'ICICI CC 0000' : selectedAccountId;
    
    // Create an entry that pays the bill from the selected bank account to this card
    await safeFetchJson('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'expense',
        amount: Number(billAmount),
        category: 'Bills & Utilities',
        description: `CC Bill Payment: ${targetCard} (Paid from ${billFromAccount})`,
        date: billDate,
        paymentMethod: 'Net Banking',
        account: billFromAccount,
        isSavingsTransfer: false,
        tags: ['credit-card-bill', targetCard.toLowerCase()],
      }),
    });

    if (onRefreshTransactions) {
      await onRefreshTransactions();
    }
    setIsRecordBillPaymentOpen(false);
    setBillAmount('');
  };

  const handleReassignAccount = async (txId: string, newAccount: AccountId) => {
    await onUpdateTransaction(txId, { account: newAccount });
    if (onRefreshTransactions) {
      await onRefreshTransactions();
    }
  };

  // Trigger Excel Statement Download
  const handleDownloadStatement = (targetAccId: AccountId | 'all' = exportAccountId, range = exportDateRange) => {
    try {
      const res = exportAccountStatementToExcel({
        accountId: targetAccId,
        transactions,
        emis,
        dateRange: range,
        startDate: exportStartDate,
        endDate: exportEndDate,
        includeEmis: exportIncludeEmis,
        includeOverview: exportIncludeOverview,
      });

      if (res.success) {
        setIsStatementModalOpen(false);
        setToastMessage(`Statement downloaded successfully: ${res.filename} (${res.txCount} transactions)`);
        setTimeout(() => setToastMessage(null), 5000);
      }
    } catch (err: any) {
      console.error('Error generating statement:', err);
      alert('Failed to generate statement: ' + (err?.message || 'Unknown error'));
    }
  };

  // Filter transactions for main view
  const currentMonthStr = new Date().toISOString().substring(0, 7);
  const filteredTxs = transactions.filter((t) => {
    if (selectedAccountId === 'all') return true;
    return t.account === selectedAccountId;
  });

  const selectedMeta = selectedAccountId !== 'all' ? ACCOUNTS_CONFIG[selectedAccountId] : null;

  // Account stats
  const totalAccountExpense = filteredTxs
    .filter((t) => t.type === 'expense' && !t.isSavingsTransfer)
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const totalAccountIncome = filteredTxs
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const currentMonthExpense = filteredTxs
    .filter((t) => t.type === 'expense' && t.date?.startsWith(currentMonthStr) && !t.isSavingsTransfer)
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  // Active EMIs for this card
  const cardEmis = emis.filter((e) => {
    if (selectedAccountId === 'all') return true;
    return e.cardId === selectedAccountId;
  });

  const totalMonthlyEmiAmount = cardEmis.reduce((sum, e) => sum + (e.monthlyAmount || 0), 0);
  const totalCardObligation = currentMonthExpense + totalMonthlyEmiAmount;

  // Preview stats for Modal
  const modalPreviewTxs = filterTransactionsForStatement(
    transactions,
    exportAccountId,
    exportDateRange,
    exportStartDate,
    exportEndDate
  );

  const modalPreviewDebits = modalPreviewTxs
    .filter((t) => t.type === 'expense' && !t.isSavingsTransfer)
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const modalPreviewCredits = modalPreviewTxs
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-950 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold animate-in slide-in-from-top-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-emerald-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Banner & Header */}
      <div className="bg-slate-900/60 border border-white/[0.08] rounded-2xl p-4 sm:p-5 backdrop-blur-xl shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">
                Accounts & Cards Ledger
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              1 RuPay UPI CC, 4 Credit Cards, 2 Bank Accounts & Cash ka alag-alag statement, underlying EMIs aur bill tracker.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Download Statement Button */}
            <button
              onClick={() => {
                setExportAccountId(selectedAccountId);
                setIsStatementModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-900/30 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <Download className="w-3 h-3" />
              <span>Download Statement (Excel)</span>
            </button>

            {selectedMeta && (selectedMeta.type === 'credit_card' || selectedMeta.type === 'rupay_card') && (
              <>
                <button
                  onClick={() => setIsAddEmiOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Underlying EMI Jodein
                </button>
                <button
                  onClick={() => setIsRecordBillPaymentOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Bill Payment Record Karein
                </button>
              </>
            )}
          </div>
        </div>

        {/* Account Selector Horizontal Tabs */}
        <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setSelectedAccountId('all')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              selectedAccountId === 'all'
                ? 'bg-white text-slate-900 shadow-md font-bold'
                : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            All Accounts ({transactions.length})
          </button>

          {ALL_ACCOUNTS.map((acc) => {
            const isSelected = selectedAccountId === acc.id;
            const count = transactions.filter((t) => t.account === acc.id).length;
            const isRuPay = acc.type === 'rupay_card';
            const isCC = acc.type === 'credit_card';
            const isBank = acc.type === 'bank_account';

            return (
              <button
                key={acc.id}
                onClick={() => setSelectedAccountId(acc.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-2 border ${
                  isSelected
                    ? 'bg-slate-800 text-white shadow-md border-indigo-500/50 ring-1 ring-indigo-500/40'
                    : 'bg-slate-950/40 text-slate-300 border-white/[0.06] hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {isRuPay ? (
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                ) : isCC ? (
                  <CreditCard className="w-3.5 h-3.5 text-sky-400" />
                ) : isBank ? (
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Wallet className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span>{acc.shortName}</span>
                <span className="text-[10px] opacity-75 font-mono">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Account Overview Strip / Stats */}
      {selectedMeta ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/50 border border-white/[0.08] rounded-2xl p-4">
            <div className="text-xs text-slate-400">Account Type & Badge</div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="font-bold text-white text-sm">{selectedMeta.name}</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-white/[0.06] font-mono text-[10px] text-indigo-300">
                {selectedMeta.type.replace('_', ' ').toUpperCase()}
              </span>
              {selectedMeta.billingDay && (
                <span>· Bill Cycle: {selectedMeta.billingDay}th</span>
              )}
            </div>
          </div>

          <div className="bg-slate-900/50 border border-white/[0.08] rounded-2xl p-4">
            <div className="text-xs text-slate-400">Is Mahine Ka Kharcha</div>
            <div className="text-xl font-bold text-rose-400 font-mono mt-1">
              {isFamily || isPrivacyMode ? '••••••' : `₹${currentMonthExpense.toLocaleString('en-IN')}`}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {isFamily ? '🔒 Master Card Spends Masked' : 'Current month active transactions'}
            </div>
          </div>

          {(selectedMeta.type === 'credit_card' || selectedMeta.type === 'rupay_card') ? (
            <>
              <div className="bg-slate-900/50 border border-white/[0.08] rounded-2xl p-4">
                <div className="text-xs text-slate-400">Active EMIs This Month</div>
                <div className="text-xl font-bold text-amber-400 font-mono mt-1">
                  {isFamily || isPrivacyMode ? '••••••' : `₹${totalMonthlyEmiAmount.toLocaleString('en-IN')}`}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {isFamily ? '🔒 EMI Details Masked' : `${cardEmis.length} running installments`}
                </div>
              </div>

              <div className="bg-gradient-to-br from-indigo-950/40 to-purple-950/40 border border-indigo-500/30 rounded-2xl p-4">
                <div className="text-xs text-indigo-300 font-medium">Kul Monthly Obligation</div>
                <div className="text-xl font-extrabold text-white font-mono mt-1">
                  {isFamily || isPrivacyMode ? '••••••' : `₹${totalCardObligation.toLocaleString('en-IN')}`}
                </div>
                <div className="text-[11px] text-indigo-200/80 mt-1">
                  {isFamily ? '🔒 Hidden for Family' : `Spends + EMIs (Bill Date: ~${selectedMeta.billingDay || 15}th)`}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-slate-900/50 border border-white/[0.08] rounded-2xl p-4">
                <div className="text-xs text-slate-400">Is Account Me Inflow (Kamai)</div>
                <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                  {isFamily || isPrivacyMode ? '••••••' : `₹${totalAccountIncome.toLocaleString('en-IN')}`}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {isFamily ? '🔒 Balance Inflow Masked' : 'Direct credits & salary'}
                </div>
              </div>

              <div className="bg-slate-900/50 border border-white/[0.08] rounded-2xl p-4">
                <div className="text-xs text-slate-400">Net Outflow / Lifetime</div>
                <div className="text-xl font-bold text-slate-200 font-mono mt-1">
                  {isFamily || isPrivacyMode ? '••••••' : `₹${totalAccountExpense.toLocaleString('en-IN')}`}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {isFamily ? '🔒 Total Outflow Masked' : 'Kul kharcha from this account'}
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="bg-slate-900/50 border border-white/[0.08] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-300 font-medium">
              Showing all accounts consolidated summary ({transactions.length} transactions total)
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Includes 5 Credit/RuPay cards, 2 Bank accounts & Cash ledger
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-indigo-400">
              Kul Kharcha: {isFamily || isPrivacyMode ? '₹••••••' : `₹${totalAccountExpense.toLocaleString('en-IN')}`}
            </span>
            <button
              onClick={() => {
                setExportAccountId('all');
                setIsStatementModalOpen(true);
              }}
              className="px-3 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3 h-3" />
              Consolidated Excel Statement
            </button>
          </div>
        </div>
      )}

      {/* Underlying EMIs Section for Cards */}
      {selectedAccountId !== 'all' && (selectedMeta?.type === 'credit_card' || selectedMeta?.type === 'rupay_card') && (
        <div className="bg-slate-900/40 border border-white/[0.08] rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">
                Underlying Active EMIs on {selectedAccountId}
              </h3>
            </div>
            <button
              onClick={() => setIsAddEmiOpen(true)}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Nayi EMI Jodein
            </button>
          </div>

          {cardEmis.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-white/[0.08] rounded-xl">
              Is card par koi active underlying EMI nahi hai. "+ Nayi EMI Jodein" button se phone/laptop/gadget ki monthly EMI add kar sakte hain.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cardEmis.map((emi) => {
                const progressPct = Math.min(100, Math.round((emi.paidMonths / emi.totalMonths) * 100));
                return (
                  <div
                    key={emi.id}
                    className="p-3.5 bg-slate-950/60 border border-white/[0.08] rounded-xl flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-bold text-white">{emi.title}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          ₹{emi.monthlyAmount.toLocaleString('en-IN')} / month · Due on {emi.dueDay}th
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteEmi(emi.id)}
                        className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                        title="Delete EMI"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                        <span>Tenure: {emi.paidMonths} / {emi.totalMonths} months paid</span>
                        <span className="font-mono text-indigo-300">{progressPct}%</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-indigo-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Account Statement / Ledger Table */}
      <div className="bg-slate-900/60 border border-white/[0.08] rounded-2xl overflow-hidden backdrop-blur-xl shadow-lg">
        <div className="px-5 py-3.5 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <ReceiptText className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">
              Statement Ledger ({filteredTxs.length} entries)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setExportAccountId(selectedAccountId);
                setIsStatementModalOpen(true);
              }}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export {selectedAccountId === 'all' ? 'All' : selectedAccountId} Excel</span>
            </button>
            <span className="text-xs text-slate-400 hidden lg:inline">
              · Dropdown se inline account shift karein
            </span>
          </div>
        </div>

        {filteredTxs.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400">
            Is account ke liye koi transaction record nahi hua hai. Naya kharcha add karte waqt yeh account select karein.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px] font-mono border-b border-white/[0.06]">
                <tr>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4">Account / Card</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredTxs.map((t) => {
                  const isInc = t.type === 'income';
                  const currentAcc = (t.account as AccountId) || 'ICICI CC 0000';
                  const isOwnTx = !isFamily || Boolean(
                    (activeFamilyMemberName && (
                      (t.telegramUser && (
                        t.telegramUser.toLowerCase().includes(activeFamilyMemberName.toLowerCase().trim()) ||
                        activeFamilyMemberName.toLowerCase().trim().includes(t.telegramUser.toLowerCase())
                      )) ||
                      (t.source === 'manual' && t.telegramUser === activeFamilyMemberName)
                    ))
                  );

                  return (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 text-slate-400 font-mono whitespace-nowrap">
                        {t.date}
                        {t.time && <span className="ml-1 text-[10px] text-slate-500">{t.time}</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-white font-medium">{t.description || t.category}</div>
                        {t.rawMessage && (
                          <div className="text-[10px] text-slate-500 truncate max-w-xs">{t.rawMessage}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/[0.06] text-slate-300 border border-white/[0.06]">
                          {t.category}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={currentAcc}
                          onChange={(e) => handleReassignAccount(t.id, e.target.value as AccountId)}
                          className="bg-slate-950 border border-white/[0.1] rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                        >
                          {ALL_ACCOUNTS.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.shortName} ({a.type.replace('_', ' ')})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={`py-3 px-4 text-right font-mono font-bold ${isInc ? 'text-emerald-400' : 'text-slate-100'}`}>
                        {isOwnTx ? (
                          <span>{isInc ? '+' : '-'}₹{isPrivacyMode ? '•••' : t.amount.toLocaleString('en-IN')}</span>
                        ) : (
                          <span className="text-slate-500 font-normal text-[11px]">
                            {isInc ? '+' : '-'}₹•••••• <span className="text-[9px] text-indigo-400/80 bg-indigo-950/60 px-1 py-0.2 rounded border border-indigo-500/30 ml-1">🔒 Masked</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Download Statement Excel Modal */}
      {isStatementModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    Download Account & Card Statement
                  </h3>
                  <p className="text-xs text-slate-400">
                    Export high-fidelity Excel (.xlsx) bank/card statement
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsStatementModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5 mt-5 text-xs">
              {/* Account Selection */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5 flex items-center gap-1.5">
                  <ReceiptText className="w-3.5 h-3.5 text-indigo-400" />
                  Select Account / Card
                </label>
                <select
                  value={exportAccountId}
                  onChange={(e) => setExportAccountId(e.target.value as AccountId | 'all')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-hidden focus:border-emerald-500 font-medium"
                >
                  <option value="all">📊 Consolidated Statement (All Accounts & Cards Combined)</option>
                  <optgroup label="Credit & RuPay Cards">
                    {ALL_ACCOUNTS.filter(a => a.type === 'credit_card' || a.type === 'rupay_card').map(a => (
                      <option key={a.id} value={a.id}>💳 {a.name} ({a.shortName})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Bank Accounts & Cash">
                    {ALL_ACCOUNTS.filter(a => a.type === 'bank_account' || a.type === 'cash').map(a => (
                      <option key={a.id} value={a.id}>🏦 {a.name} ({a.shortName})</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Statement Period / Date Filter */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  Statement Time Period
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'all', label: 'All Time (Full)' },
                    { id: 'this_month', label: 'Current Month' },
                    { id: 'last_month', label: 'Last Month' },
                    { id: 'last_90_days', label: 'Last 90 Days' },
                    { id: 'fy', label: 'Financial Year (FY)' },
                    { id: 'custom', label: 'Custom Range...' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setExportDateRange(p.id as any)}
                      className={`px-3 py-2 rounded-xl text-center font-medium transition-all cursor-pointer border ${
                        exportDateRange === p.id
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-bold shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Custom Date Pickers */}
                {exportDateRange === 'custom' && (
                  <div className="grid grid-cols-2 gap-3 mt-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">From (Start Date)</label>
                      <input
                        type="date"
                        value={exportStartDate}
                        onChange={(e) => setExportStartDate(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">To (End Date)</label>
                      <input
                        type="date"
                        value={exportEndDate}
                        onChange={(e) => setExportEndDate(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Extra Excel Sheets Inclusions */}
              <div className="bg-slate-950/50 border border-white/[0.06] rounded-2xl p-4 space-y-3">
                <div className="text-xs font-semibold text-slate-300">Additional Statement Sheets (.xlsx)</div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportIncludeEmis}
                      onChange={(e) => setExportIncludeEmis(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                    />
                    <span>Include <strong>Underlying EMIs & Loans Schedule Sheet</strong> (tenure, balance, monthly burden)</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportIncludeOverview}
                      onChange={(e) => setExportIncludeOverview(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                    />
                    <span>Include <strong>Accounts Portfolio Summary Sheet</strong> (all accounts spend comparison)</span>
                  </label>
                </div>
              </div>

              {/* Live Statement Summary Box */}
              <div className="p-4 bg-gradient-to-br from-emerald-950/40 via-slate-900/60 to-teal-950/40 border border-emerald-500/30 rounded-2xl">
                <div className="flex items-center justify-between text-xs text-emerald-300 font-semibold mb-2">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    Statement Preview & Summary
                  </span>
                  <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono text-[11px]">
                    {modalPreviewTxs.length} Transactions
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-emerald-500/20">
                  <div>
                    <div className="text-[10px] text-slate-400">Total Inflow / Credits</div>
                    <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                      ₹{modalPreviewCredits.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Total Outflow / Spends</div>
                    <div className="text-sm font-bold text-rose-400 font-mono mt-0.5">
                      ₹{modalPreviewDebits.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Net Movement</div>
                    <div className="text-sm font-bold text-slate-200 font-mono mt-0.5">
                      ₹{(modalPreviewCredits - modalPreviewDebits).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsStatementModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadStatement()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/40 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download Excel Statement (.xlsx)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add EMI Modal */}
      {isAddEmiOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                Underlying EMI Jodein
              </h3>
              <button
                onClick={() => setIsAddEmiOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddEmi} className="space-y-3.5 mt-4 text-xs font-mono">
              <div>
                <label className="block text-slate-300 mb-1">EMI Item / Gadget Name</label>
                <input
                  type="text"
                  placeholder="e.g. iPhone 16 Pro EMI / MacBook / AC"
                  value={emiTitle}
                  onChange={(e) => setEmiTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Monthly EMI (₹)</label>
                  <input
                    type="number"
                    placeholder="4500"
                    value={emiAmount}
                    onChange={(e) => setEmiAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Monthly Due Date</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={emiDueDay}
                    onChange={(e) => setEmiDueDay(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Total Months (Tenure)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={emiTotalMonths}
                    onChange={(e) => setEmiTotalMonths(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Already Paid Months</label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={emiPaidMonths}
                    onChange={(e) => setEmiPaidMonths(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddEmiOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                >
                  Save EMI
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Bill Payment Modal */}
      {isRecordBillPaymentOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Record Card Bill Payment
              </h3>
              <button
                onClick={() => setIsRecordBillPaymentOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordBillPayment} className="space-y-3.5 mt-4 text-xs font-mono">
              <p className="text-slate-300 text-[11px]">
                Card ka bill pay karne par yeh aapke Bank Account se debit record karega bina double expense count hue.
              </p>

              <div>
                <label className="block text-slate-300 mb-1">Paying Bill For Card</label>
                <input
                  type="text"
                  disabled
                  value={selectedAccountId}
                  className="w-full bg-slate-950/70 border border-slate-700 rounded-xl px-3 py-2 text-slate-400 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Bill Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="12500"
                    value={billAmount}
                    onChange={(e) => setBillAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-emerald-500 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Debited From Bank</label>
                  <select
                    value={billFromAccount}
                    onChange={(e) => setBillFromAccount(e.target.value as AccountId)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-emerald-500 text-xs"
                  >
                    <option value="AX Bank">AX Bank (Salary)</option>
                    <option value="IC Bank">IC Bank (Savings)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-emerald-500 text-xs"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecordBillPaymentOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
