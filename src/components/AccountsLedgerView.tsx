import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  Sparkles,
  Settings,
  Coins,
  HeartHandshake,
  RefreshCw
} from 'lucide-react';
import { Transaction, AccountId, CardEmi, UserRole, CategoryDef, AccountBalancesData } from '../types';
import { ACCOUNTS_CONFIG, ALL_ACCOUNTS, CREDIT_CARDS, BANK_ACCOUNTS } from '../utils/accounts';
import { safeFetchJson } from '../utils/api';
import { DEFAULT_CATEGORIES } from '../utils/categories';
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
  categories?: CategoryDef[];
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
  categories = DEFAULT_CATEGORIES,
}) => {
  const isFamily = userRole === 'family';
  const [selectedAccountId, setSelectedAccountId] = useState<AccountId | 'all'>('ICICI CC 0000');
  const [emis, setEmis] = useState<CardEmi[]>([]);
  const [isAddEmiOpen, setIsAddEmiOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'transaction' | 'emi'>('transaction');

  // Form states for Add Card Manual Transaction
  const [cardTxAccount, setCardTxAccount] = useState<AccountId>('ICICI CC 0000');
  const [cardTxType, setCardTxType] = useState<'expense' | 'income'>('expense');
  const [cardTxAmount, setCardTxAmount] = useState('');
  const [cardTxDesc, setCardTxDesc] = useState('');
  const [cardTxCategory, setCardTxCategory] = useState('Shopping & Apparel');
  const [cardTxDate, setCardTxDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [cardTxTime, setCardTxTime] = useState(() => {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  });
  const [cardTxRef, setCardTxRef] = useState('');
  const [emiCardAccount, setEmiCardAccount] = useState<AccountId>('ICICI CC 0000');
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);

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

  // Accounts & Cards Live Balance State
  const [balancesData, setBalancesData] = useState<AccountBalancesData | null>(null);
  const [isBalancesModalOpen, setIsBalancesModalOpen] = useState(false);
  const [editBaseBalances, setEditBaseBalances] = useState<Record<string, string>>({});
  const [editWifeBalance, setEditWifeBalance] = useState('');
  const [isSavingBalances, setIsSavingBalances] = useState(false);

  const fetchBalances = async () => {
    const { data } = await safeFetchJson<AccountBalancesData>('/api/accounts/balances');
    if (data) {
      setBalancesData(data);
      const initialMap: Record<string, string> = {};
      for (const acc of ALL_ACCOUNTS) {
        initialMap[acc.id] = String(data.accountBaseBalances?.[acc.id] ?? '');
      }
      setEditBaseBalances(initialMap);
      setEditWifeBalance(String(data.wifeBaseBalance ?? ''));
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [transactions]);

  const handleSaveBalances = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBalances(true);
    try {
      const payloadBalances: Record<string, number> = {};
      for (const [k, v] of Object.entries(editBaseBalances)) {
        payloadBalances[k] = parseFloat(String(v || '')) || 0;
      }
      const { data } = await safeFetchJson<AccountBalancesData>('/api/accounts/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountBaseBalances: payloadBalances,
          wifeBaseBalance: parseFloat(editWifeBalance) || 0,
        }),
      });
      if (data) {
        setBalancesData(data);
      }
      setIsBalancesModalOpen(false);
      setToastMessage('✅ Sabhi accounts ke opening balances successfully save ho gaye!');
      setTimeout(() => setToastMessage(null), 3500);
      if (onRefreshTransactions) await onRefreshTransactions();
    } catch (err) {
      console.error(err);
      setToastMessage('⚠️ Balances save karne me error aaya');
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsSavingBalances(false);
    }
  };

  // Form states for Add EMI
  const [emiTitle, setEmiTitle] = useState('');
  const [emiAmount, setEmiAmount] = useState('');
  const [emiTotalMonths, setEmiTotalMonths] = useState('12');
  const [emiPaidMonths, setEmiPaidMonths] = useState('0');
  const [emiDueDay, setEmiDueDay] = useState('15');
  const [emiNotes, setEmiNotes] = useState('');

  // Keep export account and cardTxAccount in sync with active tab when opened
  useEffect(() => {
    setExportAccountId(selectedAccountId);
    if (selectedAccountId !== 'all') {
      setCardTxAccount(selectedAccountId);
      setEmiCardAccount(selectedAccountId);
    }
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

  const handleAddCardTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = parseFloat(cardTxAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      setToastMessage('Kripya valid amount dalein');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }
    if (!cardTxDesc.trim()) {
      setToastMessage('Kripya description / merchant name dalein');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    try {
      setIsSubmittingTx(true);
      const targetCard = cardTxAccount || (selectedAccountId === 'all' ? 'ICICI CC 0000' : selectedAccountId);
      const fullDesc = cardTxRef.trim() ? `${cardTxDesc.trim()} (Ref: ${cardTxRef.trim()})` : cardTxDesc.trim();
      const defaultCat = cardTxType === 'income' ? 'Cashback & Rewards' : 'Shopping & Apparel';
      const { data } = await safeFetchJson<{ success?: boolean; transaction?: Transaction }>('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: cardTxType,
          amount: numAmt,
          category: cardTxCategory || defaultCat,
          description: fullDesc,
          date: cardTxDate || new Date().toISOString().split('T')[0],
          time: cardTxTime || undefined,
          paymentMethod: 'Card',
          account: targetCard,
          source: 'manual',
          tags: ['card_statement_entry', 'manual_card_match'],
        }),
      });

      if (data?.transaction || data?.success) {
        setToastMessage(`✅ Card Transaction successfully add ho gaya! (${targetCard})`);
        setTimeout(() => setToastMessage(null), 3500);
        setCardTxAmount('');
        setCardTxDesc('');
        setCardTxRef('');
        setIsAddEmiOpen(false);
        if (onRefreshTransactions) {
          await onRefreshTransactions();
        }
      }
    } catch (err: any) {
      console.error('Failed to add card transaction:', err);
      setToastMessage('Transaction save karne me samasya aayi');
      setTimeout(() => setToastMessage(null), 3500);
    } finally {
      setIsSubmittingTx(false);
    }
  };

  const handleAddEmi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emiTitle.trim() || !emiAmount || isNaN(Number(emiAmount))) return;
    const targetCard = selectedAccountId === 'all' ? (emiCardAccount || 'SBI CC 5733') : selectedAccountId;
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
    setToastMessage(`✅ EMI successfully add ho gayi! (${targetCard})`);
    setTimeout(() => setToastMessage(null), 3000);
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
            {/* Set Opening Balances Button */}
            <button
              onClick={() => setIsBalancesModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-sky-900/30 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>⚙️ Balances Set Karein</span>
            </button>

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

            <button
              onClick={() => {
                setModalTab('transaction');
                setIsAddEmiOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-900/30 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Card Entry / EMI Jodein</span>
            </button>

            {selectedMeta && (selectedMeta.type === 'credit_card' || selectedMeta.type === 'rupay_card') && (
              <button
                onClick={() => setIsRecordBillPaymentOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Bill Payment Record Karein</span>
              </button>
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
            const accBalInfo = balancesData?.accounts[acc.id];

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
                {accBalInfo && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                    isBank || acc.type === 'cash'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-sky-500/20 text-sky-300'
                  }`}>
                    {isBank || acc.type === 'cash'
                      ? `₹${Math.round(accBalInfo.currentBalance / 1000)}k`
                      : `₹${Math.round((accBalInfo.availableLimit || 0) / 1000)}k avl`}
                  </span>
                )}
                <span className="text-[10px] opacity-75 font-mono">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4-Stat Consolidated Live Balances Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Stat 1: Bank & Cash Total */}
        <div className="bg-gradient-to-br from-emerald-950/40 via-slate-900/80 to-slate-900/80 border border-emerald-500/30 rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-emerald-300 font-medium">
            <span className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-emerald-400" />
              Bank & Cash Total
            </span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
              Live Bacha
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-white mt-1.5">
            {isFamily || isPrivacyMode ? '••••••' : `₹${(balancesData?.totalBankCashBalance || 0).toLocaleString('en-IN')}`}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>ICICI + Axis + Cash</span>
            <button
              onClick={() => setIsBalancesModalOpen(true)}
              className="text-emerald-400 hover:text-emerald-300 text-[10px] font-semibold underline cursor-pointer"
            >
              Set Base
            </button>
          </div>
        </div>

        {/* Stat 2: Credit Cards Available Limit */}
        <div className="bg-gradient-to-br from-sky-950/40 via-slate-900/80 to-slate-900/80 border border-sky-500/30 rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-sky-300 font-medium">
            <span className="flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-sky-400" />
              Cards Available Limit
            </span>
            <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded font-mono">
              5 Cards
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-white mt-1.5">
            {isFamily || isPrivacyMode ? '••••••' : `₹${(balancesData?.totalCardAvailableLimit || 0).toLocaleString('en-IN')}`}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Total Limit: ₹6,40,000
          </div>
        </div>

        {/* Stat 3: Cards Spends / Due */}
        <div className="bg-gradient-to-br from-rose-950/40 via-slate-900/80 to-slate-900/80 border border-rose-500/30 rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-rose-300 font-medium">
            <span className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-rose-400" />
              Cards Spends / Due
            </span>
            <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded font-mono">
              Outstanding
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-rose-300 mt-1.5">
            {isFamily || isPrivacyMode ? '••••••' : `₹${(balancesData?.totalCardOutstanding || 0).toLocaleString('en-IN')}`}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Bills to pay & running spends
          </div>
        </div>

        {/* Stat 4: Wife's Savings Reserve */}
        <div className="bg-gradient-to-br from-pink-950/40 via-slate-900/80 to-purple-950/40 border border-pink-500/30 rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-pink-300 font-medium">
            <span className="flex items-center gap-1.5">
              <HeartHandshake className="w-4 h-4 text-pink-400" />
              Wife's Savings A/c
            </span>
            <span className="text-[10px] bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded font-mono">
              Live Balance
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-white mt-1.5">
            {isFamily || isPrivacyMode ? '••••••' : `₹${(balancesData?.wifeSavings.currentBalance || 0).toLocaleString('en-IN')}`}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Base + Transfers</span>
            <button
              onClick={() => setIsBalancesModalOpen(true)}
              className="text-pink-400 hover:text-pink-300 text-[10px] font-semibold underline cursor-pointer"
            >
              Update
            </button>
          </div>
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
              {selectedMeta.billingDay ? (
                <span>· Bill Cycle: {selectedMeta.billingDay}th</span>
              ) : (
                <span>· {selectedMeta.badge}</span>
              )}
            </div>
          </div>

          {(selectedMeta.type === 'credit_card' || selectedMeta.type === 'rupay_card') ? (
            <>
              <div className="bg-gradient-to-br from-sky-950/40 to-slate-900/80 border border-sky-500/30 rounded-2xl p-4">
                <div className="text-xs text-sky-300 font-medium flex items-center justify-between">
                  <span>Available Credit Limit</span>
                  <span className="text-[10px] text-slate-400 font-mono">Bacha Limit</span>
                </div>
                <div className="text-xl font-bold text-sky-300 font-mono mt-1">
                  {isFamily || isPrivacyMode 
                    ? '••••••' 
                    : `₹${(balancesData?.accounts[selectedAccountId]?.availableLimit ?? Math.max(0, (selectedMeta.creditLimit || 100000) - currentMonthExpense)).toLocaleString('en-IN')}`}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Total Limit: ₹{(selectedMeta.creditLimit || 100000).toLocaleString('en-IN')}
                </div>
              </div>

              <div className="bg-slate-900/50 border border-white/[0.08] rounded-2xl p-4">
                <div className="text-xs text-slate-400">Current Spends / Outstanding</div>
                <div className="text-xl font-bold text-rose-400 font-mono mt-1">
                  {isFamily || isPrivacyMode 
                    ? '••••••' 
                    : `₹${(balancesData?.accounts[selectedAccountId]?.currentOutstanding ?? currentMonthExpense).toLocaleString('en-IN')}`}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {isFamily ? '🔒 Master Card Spends Masked' : 'Debits, Spends & Active EMIs'}
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
              <div className="bg-gradient-to-br from-emerald-950/40 to-slate-900/80 border border-emerald-500/30 rounded-2xl p-4">
                <div className="text-xs text-emerald-300 font-medium flex items-center justify-between">
                  <span>Current Live Balance</span>
                  <button
                    onClick={() => setIsBalancesModalOpen(true)}
                    className="text-[10px] text-emerald-400 hover:underline cursor-pointer"
                  >
                    ✏️ Set Base
                  </button>
                </div>
                <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                  {isFamily || isPrivacyMode 
                    ? '••••••' 
                    : `₹${(balancesData?.accounts[selectedAccountId]?.currentBalance ?? (totalAccountIncome - totalAccountExpense)).toLocaleString('en-IN')}`}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Base: ₹{(balancesData?.accounts[selectedAccountId]?.baseBalance || 0).toLocaleString('en-IN')} | Real-time synced
                </div>
              </div>

              <div className="bg-slate-900/50 border border-white/[0.08] rounded-2xl p-4">
                <div className="text-xs text-slate-400">Is Account Me Inflow (Kamai)</div>
                <div className="text-xl font-bold text-emerald-300 font-mono mt-1">
                  {isFamily || isPrivacyMode ? '••••••' : `+₹${totalAccountIncome.toLocaleString('en-IN')}`}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {isFamily ? '🔒 Balance Inflow Masked' : 'Direct credits, salary & transfers'}
                </div>
              </div>

              <div className="bg-slate-900/50 border border-white/[0.08] rounded-2xl p-4">
                <div className="text-xs text-slate-400">Net Outflow / Lifetime</div>
                <div className="text-xl font-bold text-rose-400 font-mono mt-1">
                  {isFamily || isPrivacyMode ? '••••••' : `-₹${totalAccountExpense.toLocaleString('en-IN')}`}
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
              onClick={() => {
                setModalTab('emi');
                setIsAddEmiOpen(true);
              }}
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
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setModalTab('transaction');
                setIsAddEmiOpen(true);
              }}
              className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Card Entry Jodein</span>
            </button>
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

      {/* Add Card Transaction / Add EMI Unified Modal */}
      {isAddEmiOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  {modalTab === 'transaction' ? (
                    <>
                      <CreditCard className="w-4 h-4 text-indigo-400" />
                      Card Entry (Bank Statement Match)
                    </>
                  ) : (
                    <>
                      <Clock className="w-4 h-4 text-indigo-400" />
                      Underlying Card EMI Jodein
                    </>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {modalTab === 'transaction' 
                    ? 'Bank / Card statement se missing entries match karne ke liye direct add karein'
                    : 'Gadgets & loans ki monthly EMI schedule aur tenure track karein'}
                </p>
              </div>
              <button
                onClick={() => setIsAddEmiOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Switcher - Same Modal as requested */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950/80 border border-white/[0.08] rounded-xl my-3.5">
              <button
                type="button"
                onClick={() => setModalTab('transaction')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  modalTab === 'transaction'
                    ? 'bg-indigo-600 text-white shadow-md font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>💳 Card Entry (Statement Match)</span>
              </button>
              <button
                type="button"
                onClick={() => setModalTab('emi')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  modalTab === 'emi'
                    ? 'bg-indigo-600 text-white shadow-md font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>📑 Card EMI / Loan</span>
              </button>
            </div>

            {/* TAB 1: Manual Card Transaction for Statement Match */}
            {modalTab === 'transaction' && (
              <form onSubmit={handleAddCardTransaction} className="space-y-3.5 text-xs font-mono">
                {/* Account / Card Selector */}
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold flex items-center justify-between">
                    <span>Card / Account Chunein</span>
                    <span className="text-[10px] text-indigo-400 font-normal">Statement Match Target</span>
                  </label>
                  <select
                    value={cardTxAccount}
                    onChange={(e) => setCardTxAccount(e.target.value as AccountId)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs font-mono"
                  >
                    <optgroup label="Credit Cards & RuPay Cards">
                      {CREDIT_CARDS.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.badge})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Bank Accounts & Cash">
                      {BANK_ACCOUNTS.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                      <option value="Cash">Cash in Hand / Pocket</option>
                    </optgroup>
                  </select>
                </div>

                {/* Entry Type Toggle (Debit vs Credit) */}
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Entry Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCardTxType('expense');
                        if (cardTxCategory === 'Cashback & Rewards' || cardTxCategory === 'Refund') {
                          setCardTxCategory('Shopping & Apparel');
                        }
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        cardTxType === 'expense'
                          ? 'bg-rose-500/20 border-rose-500/60 text-rose-300 ring-1 ring-rose-500/50'
                          : 'bg-slate-950/60 border-white/[0.08] text-slate-400 hover:text-white'
                      }`}
                    >
                      <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
                      <span>Kharcha / Spend (Debit)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCardTxType('income');
                        setCardTxCategory('Cashback & Rewards');
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        cardTxType === 'income'
                          ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 ring-1 ring-emerald-500/50'
                          : 'bg-slate-950/60 border-white/[0.08] text-slate-400 hover:text-white'
                      }`}
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Refund / Cashback (Credit)</span>
                    </button>
                  </div>
                </div>

                {/* Amount & Category */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Amount (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 font-bold">₹</span>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        placeholder="0.00"
                        value={cardTxAmount}
                        onChange={(e) => setCardTxAmount(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-7 pr-3 py-2 text-white font-bold focus:outline-hidden focus:border-indigo-500 text-xs"
                        required
                        autoFocus
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Category</label>
                    <select
                      value={cardTxCategory}
                      onChange={(e) => setCardTxCategory(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs font-mono"
                    >
                      {cardTxType === 'expense' ? (
                        <>
                          {categories.map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </>
                      ) : (
                        <>
                          <option value="Cashback & Rewards">Cashback & Rewards</option>
                          <option value="Refund">Refund / Reversal</option>
                          <option value="Salary & Employment">Salary & Employment</option>
                          <option value="Freelance & Side Hustles">Freelance & Side Hustles</option>
                          <option value="Business & Sales">Business & Sales</option>
                          <option value="Other Income">Other Income</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                {/* Description / Merchant Name */}
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Merchant / Description (Vivran)</label>
                  <input
                    type="text"
                    placeholder="e.g. Amazon IN, Indian Oil Petrol, Zomato, Card Annual Fee, Forex..."
                    value={cardTxDesc}
                    onChange={(e) => setCardTxDesc(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                    required
                  />
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      Statement Date
                    </label>
                    <input
                      type="date"
                      value={cardTxDate}
                      onChange={(e) => setCardTxDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      Time (Optional)
                    </label>
                    <input
                      type="time"
                      value={cardTxTime}
                      onChange={(e) => setCardTxTime(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>

                {/* Statement Reference / Auth Code (Optional) */}
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold flex items-center justify-between">
                    <span>Reference / Auth Code (Optional)</span>
                    <span className="text-[10px] text-slate-500 font-normal">Statement RRN / Note</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. RRN: 428910284910 / Auth: 829103"
                    value={cardTxRef}
                    onChange={(e) => setCardTxRef(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                  />
                </div>

                {/* Buttons */}
                <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setIsAddEmiOpen(false)}
                    className="px-3.5 py-2 rounded-xl text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingTx}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-900/30 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingTx ? (
                      <span>Saving Entry...</span>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>💾 Statement Entry Save Karein</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: Underlying Card EMI Form */}
            {modalTab === 'emi' && (
              <form onSubmit={handleAddEmi} className="space-y-3.5 text-xs font-mono">
                {/* Select Card for EMI */}
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Underlying Card Chunein</label>
                  <select
                    value={selectedAccountId !== 'all' ? selectedAccountId : emiCardAccount}
                    onChange={(e) => setEmiCardAccount(e.target.value as AccountId)}
                    disabled={selectedAccountId !== 'all'}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs font-mono disabled:opacity-60"
                  >
                    {CREDIT_CARDS.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.badge})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">EMI Item / Gadget Name</label>
                  <input
                    type="text"
                    placeholder="e.g. iPhone 16 Pro EMI / MacBook / AC"
                    value={emiTitle}
                    onChange={(e) => setEmiTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                    required
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Monthly EMI (₹)</label>
                    <input
                      type="number"
                      placeholder="4500"
                      value={emiAmount}
                      onChange={(e) => setEmiAmount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Monthly Due Date</label>
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
                    <label className="block text-slate-300 mb-1 font-semibold">Total Months (Tenure)</label>
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
                    <label className="block text-slate-300 mb-1 font-semibold">Already Paid Months</label>
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

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Notes (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 0% No Cost EMI Amazon / 9 months remaining"
                    value={emiNotes}
                    onChange={(e) => setEmiNotes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setIsAddEmiOpen(false)}
                    className="px-3.5 py-2 rounded-xl text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer shadow-md shadow-indigo-900/30"
                  >
                    Save EMI
                  </button>
                </div>
              </form>
            )}
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

      {/* Set Account & Cards Opening Balances Modal */}
      {isBalancesModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsBalancesModalOpen(false);
          }}
        >
          <div
            className="relative bg-[#0f172a] border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[88dvh] my-auto animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-sans">
                    Accounts Opening Balances (One-Time Setup)
                  </h3>
                  <p className="text-xs text-slate-400 font-sans">
                    Starting balance set karein. Uske baad sabhi transactions se auto-deduct / add hota rahega!
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBalancesModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveBalances} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-6 text-xs font-mono overscroll-contain">
                {/* Section 1: Bank Accounts & Cash */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                    <span className="font-bold text-sm text-emerald-400 font-sans flex items-center gap-1.5">
                      <Building2 className="w-4 h-4" />
                      1. Bank Accounts & Cash (Available Liquid Funds)
                    </span>
                    <span className="text-[10px] text-slate-400">Current Starting Balance</span>
                  </div>

                  {BANK_ACCOUNTS.concat(ALL_ACCOUNTS.filter(a => a.type === 'cash')).map((acc) => (
                    <div key={acc.id} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-300 font-semibold font-sans flex items-center gap-1.5">
                          {acc.type === 'cash' ? <Wallet className="w-3.5 h-3.5 text-emerald-400" /> : <Building2 className="w-3.5 h-3.5 text-sky-400" />}
                          {acc.name} ({acc.badge})
                        </label>
                        {balancesData?.accounts[acc.id] && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            Live abhi: ₹{(balancesData.accounts[acc.id].currentBalance || 0).toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 font-bold">₹</span>
                        <input
                          type="number"
                          placeholder="e.g. 50000"
                          value={editBaseBalances[acc.id] || ''}
                          onChange={(e) => setEditBaseBalances({ ...editBaseBalances, [acc.id]: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-white font-mono focus:outline-hidden focus:border-sky-500 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Section 2: Wife's Savings Account */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                    <span className="font-bold text-sm text-rose-400 font-sans flex items-center gap-1.5">
                      <HeartHandshake className="w-4 h-4" />
                      2. Wife's Savings Account (Starting Reserve)
                    </span>
                    <span className="text-[10px] text-slate-400">Wealth Section Sync</span>
                  </div>

                  <div className="p-3 bg-slate-950/70 border border-rose-500/20 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-rose-200 font-semibold font-sans">
                        Wife's Account Opening / Starting Balance
                      </label>
                      {balancesData?.wifeSavings && (
                        <span className="text-[10px] text-rose-300 font-mono">
                          Live abhi: ₹{balancesData.wifeSavings.currentBalance.toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-rose-400 font-bold">₹</span>
                      <input
                        type="number"
                        placeholder="e.g. 25000"
                        value={editWifeBalance}
                        onChange={(e) => setEditWifeBalance(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-white font-mono focus:outline-hidden focus:border-rose-500 text-xs"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 font-sans">
                      Wife ke khate me pehle se kitna balance tha. Iske baad jab bhi aap wife ko paise bhejenge wo live add hota rahega!
                    </p>
                  </div>
                </div>

                {/* Section 3: Credit Cards Unpaid / Opening Balance */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                    <span className="font-bold text-sm text-sky-400 font-sans flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4" />
                      3. Credit Cards (Opening Unpaid / Outstanding - Optional)
                    </span>
                    <span className="text-[10px] text-slate-400">Pehle Ka Baki Due</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Agar tracking start karne se pehle kisi card ka bill unpaid tha ya starting spends the, to yahan dalein (warna 0 chhod dein):
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CREDIT_CARDS.map((card) => (
                      <div key={card.id} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-slate-300 font-semibold font-sans text-[11px] truncate" title={card.name}>
                            {card.shortName}
                          </label>
                          <span className="text-[10px] text-sky-300 font-mono">
                            Limit: ₹{(card.creditLimit || 100000) / 1000}k
                          </span>
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-slate-400 font-bold">₹</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={editBaseBalances[card.id] || ''}
                            onChange={(e) => setEditBaseBalances({ ...editBaseBalances, [card.id]: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-white font-mono focus:outline-hidden focus:border-sky-500 text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fixed Footer Buttons */}
              <div className="p-4 border-t border-slate-800 bg-slate-900/95 shrink-0 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBalancesModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingBalances}
                  className="px-5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer font-sans"
                >
                  {isSavingBalances ? 'Save ho raha hai...' : '💾 Balances Save Karein'}
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
