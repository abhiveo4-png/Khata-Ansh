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
import { Transaction, AccountId, CardEmi, UserRole, CategoryDef, AccountBalancesData, AccountMeta } from '../types';
import {
  ACCOUNTS_CONFIG,
  DEFAULT_ACCOUNTS_CONFIG,
  ALL_ACCOUNTS,
  CREDIT_CARDS,
  BANK_ACCOUNTS,
  syncCustomAccounts,
  isWifeOwnedAccount,
  canonicalizeAccountId,
  loadSavedDeletedAccounts,
} from '../utils/accounts';
import {
  calculateMonthlyCardReserves,
  getCardBillCycleForPaymentMonth,
  getDefaultBillingStartDay,
  getNextMonthKey,
} from '../utils/billingCycle';
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

  const defaultCycleMonth = React.useMemo(() => {
    if (selectedMonth && selectedMonth !== 'all' && /^\d{4}-\d{2}$/.test(selectedMonth)) {
      return selectedMonth;
    }
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const ist = new Date(utc + 3600000 * 5.5);
    return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}`;
  }, [selectedMonth]);

  const [isRecordBillPaymentOpen, setIsRecordBillPaymentOpen] = useState(false);
  const [billTargetCard, setBillTargetCard] = useState<AccountId>('ICICI CC 0000');
  const [billAmount, setBillAmount] = useState('');
  const [billFromAccount, setBillFromAccount] = useState<AccountId>('AX Bank');
  const [billFundingSource, setBillFundingSource] = useState<'current_income' | 'previous_savings'>('current_income');
  const [billSettlementMode, setBillSettlementMode] = useState<'full' | 'partial'>('full');
  const [billCycleMonth, setBillCycleMonth] = useState<string>(defaultCycleMonth);
  const [billNotes, setBillNotes] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSettlingCard, setIsSettlingCard] = useState(false);

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
  const [initialEditBaseBalances, setInitialEditBaseBalances] = useState<Record<string, string>>({});
  const [editCardLimits, setEditCardLimits] = useState<Record<string, string>>({});
  const [editCardBillingStartDays, setEditCardBillingStartDays] = useState<Record<string, string>>({});
  const [editCardBillingDays, setEditCardBillingDays] = useState<Record<string, string>>({});
  const [editCardDueDays, setEditCardDueDays] = useState<Record<string, string>>({});
  const [editWifeBalance, setEditWifeBalance] = useState('');
  const [initialEditWifeBalance, setInitialEditWifeBalance] = useState('');
  const [isSavingBalances, setIsSavingBalances] = useState(false);

  // Individual Account / Card Limit & Balance Modal State
  const [editingSingleAccount, setEditingSingleAccount] = useState<AccountMeta | null>(null);
  const [singleBaseInput, setSingleBaseInput] = useState('');
  const [singleOriginalBase, setSingleOriginalBase] = useState('');
  const [singleLimitInput, setSingleLimitInput] = useState('');
  const [singleStartDayInput, setSingleStartDayInput] = useState('');
  const [singleBillingDayInput, setSingleBillingDayInput] = useState('');
  const [singleDueDayInput, setSingleDueDayInput] = useState('');
  const [isSavingSingleAccount, setIsSavingSingleAccount] = useState(false);

  // Add / Manage Card & Account Modal State
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false);
  const [newCardType, setNewCardType] = useState<'credit_card' | 'rupay_card' | 'bank_account' | 'cash'>('credit_card');
  const [newCardShortName, setNewCardShortName] = useState('');
  const [newCardFullName, setNewCardFullName] = useState('');
  const [newCardLimit, setNewCardLimit] = useState('150000');
  const [newCardOpeningBalance, setNewCardOpeningBalance] = useState('0');
  const [newCardBillingStartDay, setNewCardBillingStartDay] = useState('16');
  const [newCardBillingDay, setNewCardBillingDay] = useState('15');
  const [newCardDueDay, setNewCardDueDay] = useState('5');
  const [newCardColor, setNewCardColor] = useState('#ec4899');
  const [newCardIsWifeAccount, setNewCardIsWifeAccount] = useState(false);
  const [isSavingNewCard, setIsSavingNewCard] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState<AccountMeta | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const fetchBalances = async () => {
    const { data } = await safeFetchJson<AccountBalancesData>('/api/accounts/balances');
    if (data) {
      if (data.customAccounts || data.deletedAccounts || data.cardBillingDays || data.cardPaymentDueDays || data.cardBillingStartDays) {
        syncCustomAccounts(
          data.customAccounts,
          data.cardBillingDays,
          data.cardPaymentDueDays,
          data.cardBillingStartDays,
          data.deletedAccounts
        );
      }
      setBalancesData(data);
      const initialMap: Record<string, string> = {};
      const initialLimits: Record<string, string> = {};
      const initialStartDays: Record<string, string> = {};
      const initialBillingDays: Record<string, string> = {};
      const initialDueDays: Record<string, string> = {};
      for (const acc of ALL_ACCOUNTS) {
        initialMap[acc.id] = String(data.accountBaseBalances?.[acc.id] ?? '');
        if (acc.type === 'credit_card' || acc.type === 'rupay_card') {
          const endDayVal =
            data.cardBillingDays?.[acc.id] ?? data.accounts?.[acc.id]?.billingDay ?? acc.billingDay ?? 15;
          const startDayVal =
            data.cardBillingStartDays?.[acc.id] ??
            data.accounts?.[acc.id]?.billingStartDay ??
            acc.billingStartDay ??
            getDefaultBillingStartDay(endDayVal);
          initialLimits[acc.id] = String(data.cardCreditLimits?.[acc.id] || acc.creditLimit || 100000);
          initialStartDays[acc.id] = String(startDayVal);
          initialBillingDays[acc.id] = String(endDayVal);
          initialDueDays[acc.id] = String(
            data.cardPaymentDueDays?.[acc.id] ?? data.accounts?.[acc.id]?.paymentDueDay ?? acc.paymentDueDay ?? 5
          );
        }
      }
      setEditBaseBalances(initialMap);
      setInitialEditBaseBalances(initialMap);
      setEditCardLimits(initialLimits);
      setEditCardBillingStartDays(initialStartDays);
      setEditCardBillingDays(initialBillingDays);
      setEditCardDueDays(initialDueDays);
      const wifeVal = String(data.wifeBaseBalance ?? '');
      setEditWifeBalance(wifeVal);
      setInitialEditWifeBalance(wifeVal);
    }
  };

  const handleCreateCustomCard = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanShort = newCardShortName.trim();
    if (!cleanShort) return;
    setIsSavingNewCard(true);
    try {
      const badge = newCardType === 'rupay_card'
        ? 'RuPay CC'
        : newCardType === 'credit_card'
        ? `${cleanShort.split(' ')[0]} CC`
        : newCardType === 'cash'
        ? 'Cash / Wallet'
        : `${cleanShort.split(' ')[0]} Bank`;

      const { data, error } = await safeFetchJson<AccountBalancesData & { account?: any }>('/api/accounts/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cleanShort,
          shortName: cleanShort,
          name: (newCardFullName.trim() || cleanShort),
          type: newCardType,
          badge,
          color: newCardColor,
          isUpiCapable: newCardType === 'rupay_card' || newCardType === 'bank_account',
          creditLimit: parseFloat(newCardLimit) || 100000,
          openingBalance: parseFloat(newCardOpeningBalance) || 0,
          billingStartDay: parseInt(newCardBillingStartDay, 10) || getDefaultBillingStartDay(parseInt(newCardBillingDay, 10) || 15),
          billingDay: parseInt(newCardBillingDay, 10) || 15,
          paymentDueDay: parseInt(newCardDueDay, 10) || 5,
          isWifeAccount: newCardIsWifeAccount,
        }),
      });

      if (data) {
        if (data.customAccounts || data.deletedAccounts || data.cardBillingDays || data.cardPaymentDueDays || data.cardBillingStartDays) {
          syncCustomAccounts(
            data.customAccounts,
            data.cardBillingDays,
            data.cardPaymentDueDays,
            data.cardBillingStartDays,
            data.deletedAccounts
          );
        }
        setBalancesData(data);
        setSelectedAccountId(cleanShort);
        setNewCardShortName('');
        setNewCardFullName('');
        setNewCardOpeningBalance('0');
        setNewCardIsWifeAccount(false);
        setIsAddCardModalOpen(false);
        setToastMessage(`✅ Naya Card / Account "${cleanShort}" successfully add ho gaya!`);
        setTimeout(() => setToastMessage(null), 3500);
        await fetchBalances();
        if (onRefreshTransactions) await onRefreshTransactions();
      } else if (error) {
        setToastMessage(`⚠️ ${error}`);
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (err) {
      console.error(err);
      setToastMessage('⚠️ Card add karne me error aaya');
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsSavingNewCard(false);
    }
  };

  const handleDeleteCustomCard = async (cardId: string) => {
    setIsDeletingAccount(true);
    try {
      const { data, error } = await safeFetchJson<AccountBalancesData>(`/api/accounts/custom/${encodeURIComponent(cardId)}`, {
        method: 'DELETE',
      });
      if (data) {
        syncCustomAccounts(
          data.customAccounts,
          data.cardBillingDays,
          data.cardPaymentDueDays,
          data.cardBillingStartDays,
          data.deletedAccounts
        );
        setBalancesData(data);
        if (selectedAccountId === cardId) {
          setSelectedAccountId('all');
        }
        if (editingSingleAccount?.id === cardId) {
          setEditingSingleAccount(null);
        }
        setConfirmDeleteAccount(null);
        setToastMessage(`🗑️ "${cardId}" successfully delete ho gaya (purane transactions safe hain).`);
        setTimeout(() => setToastMessage(null), 3500);
        if (onRefreshTransactions) await onRefreshTransactions();
      } else if (error) {
        setToastMessage(`⚠️ ${error}`);
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (err) {
      console.error(err);
      setToastMessage('⚠️ Account/Card delete karne me error aaya');
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleRestoreDefaultAccount = async (accountId: string) => {
    try {
      const { data } = await safeFetchJson<AccountBalancesData>('/api/accounts/restore-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      if (data) {
        syncCustomAccounts(
          data.customAccounts,
          data.cardBillingDays,
          data.cardPaymentDueDays,
          data.cardBillingStartDays,
          data.deletedAccounts
        );
        setBalancesData(data);
        setToastMessage(`♻️ "${accountId}" wapas restore ho gaya!`);
        setTimeout(() => setToastMessage(null), 3000);
        if (onRefreshTransactions) await onRefreshTransactions();
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [transactions]);

  // Live calculation of wife transfers to ensure seamless real-time sync with Wealth Hub
  const liveWifeTransferred = React.useMemo(() => {
    return transactions.reduce((acc, t) => {
      if (t.isSavingsTransfer || t.isWifeTransfer || t.category === 'Wife Transfer' || t.category?.toLowerCase() === 'wife transfer') {
        return acc + (Number(t.amount) || 0);
      }
      return acc;
    }, 0);
  }, [transactions]);

  const displayWifeBalance = React.useMemo(() => {
    if (balancesData?.wifeSavings?.currentBalance !== undefined) {
      return balancesData.wifeSavings.currentBalance;
    }
    const base = Number(balancesData?.wifeBaseBalance ?? balancesData?.wifeSavings?.baseBalance) || 0;
    const serverTransferred = Number(balancesData?.wifeSavings?.totalTransferred) || 0;
    const effectiveTransferred = Math.max(serverTransferred, liveWifeTransferred);
    return base + effectiveTransferred;
  }, [balancesData, liveWifeTransferred]);

  const handleOpenSingleAccountModal = (acc: AccountMeta) => {
    setEditingSingleAccount(acc);
    const liveInfo = balancesData?.accounts?.[acc.id];
    const isCard = acc.type === 'credit_card' || acc.type === 'rupay_card';
    const currentBase =
      acc.id === 'Wife Account'
        ? (balancesData?.wifeBaseBalance ?? balancesData?.wifeSavings?.baseBalance ?? liveInfo?.baseBalance ?? 0)
        : (balancesData?.accountBaseBalances?.[acc.id] ?? liveInfo?.baseBalance ?? 0);
    const currentLimit = balancesData?.cardCreditLimits?.[acc.id] ?? liveInfo?.creditLimit ?? acc.creditLimit ?? 100000;
    const currentBillingDay = balancesData?.cardBillingDays?.[acc.id] ?? liveInfo?.billingDay ?? acc.billingDay ?? 15;
    const currentStartDay =
      balancesData?.cardBillingStartDays?.[acc.id] ??
      liveInfo?.billingStartDay ??
      acc.billingStartDay ??
      getDefaultBillingStartDay(currentBillingDay);
    const currentDueDay = balancesData?.cardPaymentDueDays?.[acc.id] ?? liveInfo?.paymentDueDay ?? acc.paymentDueDay ?? 5;
    const baseStr = String(currentBase);
    setSingleBaseInput(baseStr);
    setSingleOriginalBase(baseStr);
    setSingleLimitInput(isCard ? String(currentLimit) : '');
    setSingleStartDayInput(isCard ? String(currentStartDay) : '');
    setSingleBillingDayInput(isCard ? String(currentBillingDay) : '');
    setSingleDueDayInput(isCard ? String(currentDueDay) : '');
  };

  const handleSaveSingleAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSingleAccount) return;
    setIsSavingSingleAccount(true);
    try {
      const isCard = editingSingleAccount.type === 'credit_card' || editingSingleAccount.type === 'rupay_card';
      const baseVal = parseFloat(singleBaseInput) || 0;
      const origBaseVal = parseFloat(singleOriginalBase) || 0;
      const baseChanged =
        singleBaseInput.trim() !== singleOriginalBase.trim() &&
        baseVal !== origBaseVal;
      const hasNeverSetBase = balancesData?.accountBaseBalances?.[editingSingleAccount.id] === undefined && baseVal > 0;

      const bodyPayload: Record<string, any> = {};
      if (baseChanged || hasNeverSetBase) {
        if (editingSingleAccount.id === 'Wife Account') {
          bodyPayload.wifeBaseBalance = baseVal;
        } else {
          bodyPayload.accountBaseBalances = { [editingSingleAccount.id]: baseVal };
        }
      }

      if (isCard) {
        const limVal = parseFloat(singleLimitInput);
        if (!isNaN(limVal) && limVal > 0) {
          bodyPayload.cardCreditLimits = { [editingSingleAccount.id]: limVal };
        }
        const startNum = Math.round(Number(singleStartDayInput));
        if (!isNaN(startNum) && startNum >= 1 && startNum <= 31) {
          bodyPayload.cardBillingStartDays = { [editingSingleAccount.id]: startNum };
        }
        const billNum = Math.round(Number(singleBillingDayInput));
        if (!isNaN(billNum) && billNum >= 1 && billNum <= 31) {
          bodyPayload.cardBillingDays = { [editingSingleAccount.id]: billNum };
        }
        const dueNum = Math.round(Number(singleDueDayInput));
        if (!isNaN(dueNum) && dueNum >= 1 && dueNum <= 31) {
          bodyPayload.cardPaymentDueDays = { [editingSingleAccount.id]: dueNum };
        }
      }

      const { data } = await safeFetchJson<AccountBalancesData>('/api/accounts/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      if (data) {
        syncCustomAccounts(
          data.customAccounts,
          data.cardBillingDays,
          data.cardPaymentDueDays,
          data.cardBillingStartDays,
          data.deletedAccounts
        );
        setBalancesData(data);
        if (bodyPayload.accountBaseBalances) {
          setEditBaseBalances(prev => ({ ...prev, [editingSingleAccount.id]: String(baseVal) }));
          setInitialEditBaseBalances(prev => ({ ...prev, [editingSingleAccount.id]: String(baseVal) }));
        }
        if (isCard && bodyPayload.cardCreditLimits?.[editingSingleAccount.id]) {
          setEditCardLimits(prev => ({ ...prev, [editingSingleAccount.id]: String(bodyPayload.cardCreditLimits[editingSingleAccount.id]) }));
        }
        if (isCard && bodyPayload.cardBillingStartDays?.[editingSingleAccount.id]) {
          setEditCardBillingStartDays(prev => ({ ...prev, [editingSingleAccount.id]: String(bodyPayload.cardBillingStartDays[editingSingleAccount.id]) }));
        }
        if (isCard && bodyPayload.cardBillingDays?.[editingSingleAccount.id]) {
          setEditCardBillingDays(prev => ({ ...prev, [editingSingleAccount.id]: String(bodyPayload.cardBillingDays[editingSingleAccount.id]) }));
        }
        if (isCard && bodyPayload.cardPaymentDueDays?.[editingSingleAccount.id]) {
          setEditCardDueDays(prev => ({ ...prev, [editingSingleAccount.id]: String(bodyPayload.cardPaymentDueDays[editingSingleAccount.id]) }));
        }
      }
      setToastMessage(`✅ ${editingSingleAccount.shortName} ka ${isCard ? 'Limit, Start/End Cycle & Due' : 'Base Balance'} update ho gaya!`);
      setTimeout(() => setToastMessage(null), 3500);
      setEditingSingleAccount(null);
      if (onRefreshTransactions) await onRefreshTransactions();
    } catch (err) {
      console.error(err);
      setToastMessage('⚠️ Balance update karne me error aaya');
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsSavingSingleAccount(false);
    }
  };

  const handleSaveBalances = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBalances(true);
    try {
      const payloadBalances: Record<string, number> = {};
      for (const [k, v] of Object.entries(editBaseBalances)) {
        const strVal = String(v || '').trim();
        const initVal = String(initialEditBaseBalances[k] || '').trim();
        if (strVal !== initVal) {
          payloadBalances[k] = parseFloat(strVal) || 0;
        }
      }
      const payloadLimits: Record<string, number> = {};
      for (const [k, v] of Object.entries(editCardLimits)) {
        const lim = parseFloat(String(v || ''));
        if (!isNaN(lim) && lim > 0) payloadLimits[k] = lim;
      }
      const payloadStartDays: Record<string, number> = {};
      for (const [k, v] of Object.entries(editCardBillingStartDays)) {
        const dayNum = Math.round(Number(v));
        if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
          payloadStartDays[k] = dayNum;
        }
      }
      const payloadBillingDays: Record<string, number> = {};
      for (const [k, v] of Object.entries(editCardBillingDays)) {
        const dayNum = Math.round(Number(v));
        if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
          payloadBillingDays[k] = dayNum;
        }
      }
      const payloadDueDays: Record<string, number> = {};
      for (const [k, v] of Object.entries(editCardDueDays)) {
        const dayNum = Math.round(Number(v));
        if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
          payloadDueDays[k] = dayNum;
        }
      }

      const bodyPayload: Record<string, any> = {
        cardCreditLimits: payloadLimits,
        cardBillingStartDays: payloadStartDays,
        cardBillingDays: payloadBillingDays,
        cardPaymentDueDays: payloadDueDays,
      };
      if (Object.keys(payloadBalances).length > 0) {
        bodyPayload.accountBaseBalances = payloadBalances;
      }
      if (editWifeBalance.trim() !== initialEditWifeBalance.trim()) {
        bodyPayload.wifeBaseBalance = parseFloat(editWifeBalance) || 0;
      }

      const { data } = await safeFetchJson<AccountBalancesData>('/api/accounts/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      if (data) {
        syncCustomAccounts(
          data.customAccounts,
          data.cardBillingDays,
          data.cardPaymentDueDays,
          data.cardBillingStartDays,
          data.deletedAccounts
        );
        setBalancesData(data);
        setInitialEditBaseBalances({ ...editBaseBalances });
        setInitialEditWifeBalance(editWifeBalance);
      }
      setIsBalancesModalOpen(false);
      setToastMessage('✅ Balances, Limits & Bill Cycles successfully save ho gaye!');
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

  const openCardSettleModal = (preferredCardId?: string) => {
    const resolvedCard =
      preferredCardId ||
      (selectedAccountId !== 'all' &&
      (ACCOUNTS_CONFIG[selectedAccountId]?.type === 'credit_card' ||
        ACCOUNTS_CONFIG[selectedAccountId]?.type === 'rupay_card')
        ? selectedAccountId
        : CREDIT_CARDS[0]?.id || 'ICICI CC 0000');

    setBillTargetCard(resolvedCard);
    setBillCycleMonth(defaultCycleMonth);
    setBillFundingSource('current_income');
    setBillNotes('');
    setBillDate(new Date().toISOString().split('T')[0]);

    const cycleReserves = calculateMonthlyCardReserves(transactions, defaultCycleMonth);
    const cardReserveItem = cycleReserves.items.find((i) => i.cardId === resolvedCard);
    const liveOutstanding = balancesData?.accounts?.[resolvedCard]?.currentOutstanding ?? 0;
    const suggestedAmt =
      cardReserveItem && cardReserveItem.pendingReserve > 0
        ? cardReserveItem.pendingReserve
        : liveOutstanding > 0
        ? liveOutstanding
        : 0;

    setBillAmount(suggestedAmt > 0 ? String(suggestedAmt) : '');
    setBillSettlementMode('full');
    if (resolvedCard === 'AX CC 2904' && ACCOUNTS_CONFIG['Wife Account']) {
      setBillFromAccount('Wife Account');
    } else {
      setBillFromAccount('AX Bank');
    }
    setIsRecordBillPaymentOpen(true);
  };

  const handleRecordBillPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(billAmount);
    if (!billAmount || isNaN(numAmt) || numAmt <= 0) {
      setToastMessage('⚠️ Kripya valid settlement amount dalein');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }
    if (!billTargetCard || !billFromAccount) return;

    setIsSettlingCard(true);
    try {
      const { data, error } = await safeFetchJson<{
        success?: boolean;
        balances?: AccountBalancesData;
      }>('/api/accounts/settle-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: billTargetCard,
          fromAccount: billFromAccount,
          amount: numAmt,
          fundingSource: billFundingSource,
          settlementMode: billSettlementMode,
          date: billDate,
          cycleMonth: billCycleMonth,
          notes: billNotes.trim(),
        }),
      });

      if (data?.success) {
        if (data.balances) {
          setBalancesData(data.balances);
        } else {
          await fetchBalances();
        }
        if (onRefreshTransactions) {
          await onRefreshTransactions();
        }
        const fundLabel = billFundingSource === 'previous_savings' ? 'Previous Bank Savings' : 'Current Month Income';
        setToastMessage(
          `✅ ₹${numAmt.toLocaleString('en-IN')} settled: ${billFromAccount} → ${billTargetCard} (${fundLabel})`
        );
        setTimeout(() => setToastMessage(null), 4500);
        setIsRecordBillPaymentOpen(false);
        setBillAmount('');
        setBillNotes('');
      } else {
        setToastMessage(`⚠️ ${error || 'Card settlement save karne me samasya aayi'}`);
        setTimeout(() => setToastMessage(null), 3500);
      }
    } catch (err) {
      console.error('Card settlement error:', err);
      setToastMessage('⚠️ Card settlement save karne me samasya aayi');
      setTimeout(() => setToastMessage(null), 3500);
    } finally {
      setIsSettlingCard(false);
    }
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

  // Helper: identifies savings transfers sent into Wife's Savings A/c from any bank/cash account
  const isWifeTransferEntry = (t: Transaction) =>
    Boolean(
      t.isSavingsTransfer ||
      t.isWifeTransfer ||
      t.category === 'Wife Transfer' ||
      t.category?.toLowerCase() === 'wife transfer'
    );

  // Filter transactions for main view (resolving legacy aliases like "Axis 2904" -> "AX CC 2904")
  const currentMonthStr = new Date().toISOString().substring(0, 7);
  const filteredTxs = transactions.filter((t) => {
    if (selectedAccountId === 'all') return true;
    const resolvedAcc = canonicalizeAccountId(t.account);
    if (selectedAccountId === 'Wife Account') {
      return resolvedAcc === 'Wife Account' || isWifeTransferEntry(t);
    }
    return resolvedAcc === selectedAccountId;
  });

  const selectedMeta = selectedAccountId !== 'all' ? ACCOUNTS_CONFIG[selectedAccountId] : null;

  // Account stats (for Wife Account, incoming Wife Transfers count as Inflow/Credit, not Outflow)
  const totalAccountExpense = filteredTxs
    .filter((t) => {
      if (selectedAccountId === 'Wife Account' && isWifeTransferEntry(t)) return false;
      return t.type === 'expense';
    })
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const totalAccountIncome = filteredTxs
    .filter((t) => {
      if (selectedAccountId === 'Wife Account' && isWifeTransferEntry(t)) return true;
      return t.type === 'income';
    })
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const currentMonthExpense = filteredTxs
    .filter((t) => {
      if (selectedAccountId === 'Wife Account' && isWifeTransferEntry(t)) return false;
      return t.type === 'expense' && t.date?.startsWith(currentMonthStr);
    })
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  // Active EMIs for this card
  const cardEmis = emis.filter((e) => {
    if (selectedAccountId === 'all') return true;
    return e.cardId === selectedAccountId;
  });

  const totalMonthlyEmiAmount = cardEmis.reduce((sum, e) => sum + (e.monthlyAmount || 0), 0);
  const totalCardObligation = currentMonthExpense + totalMonthlyEmiAmount;

  // Bill-cycle reserve summary for active month, next month & settlement modal
  const nextCycleMonth = React.useMemo(() => getNextMonthKey(defaultCycleMonth), [defaultCycleMonth]);

  const activeCycleReserves = React.useMemo(
    () => calculateMonthlyCardReserves(transactions, defaultCycleMonth),
    [transactions, defaultCycleMonth, balancesData]
  );

  const nextMonthCycleReserves = React.useMemo(
    () => calculateMonthlyCardReserves(transactions, nextCycleMonth),
    [transactions, nextCycleMonth, balancesData]
  );

  const selectedCardCycleInfo = React.useMemo(() => {
    if (!selectedMeta || (selectedMeta.type !== 'credit_card' && selectedMeta.type !== 'rupay_card')) return null;
    const found = activeCycleReserves.items.find((i) => i.cardId === selectedMeta.id);
    if (found) return found;
    const bDay = balancesData?.cardBillingDays?.[selectedMeta.id] ?? selectedMeta.billingDay ?? 15;
    const sDay =
      balancesData?.cardBillingStartDays?.[selectedMeta.id] ??
      selectedMeta.billingStartDay ??
      getDefaultBillingStartDay(bDay);
    const dDay = balancesData?.cardPaymentDueDays?.[selectedMeta.id] ?? selectedMeta.paymentDueDay ?? 5;
    return {
      cardId: selectedMeta.id,
      shortName: selectedMeta.shortName,
      isWifeCard: Boolean(selectedMeta.isWifeAccount),
      cycle: getCardBillCycleForPaymentMonth(defaultCycleMonth, bDay, dDay, sDay),
      cycleSpends: 0,
      cycleRefunds: 0,
      cycleBillAmount: 0,
      paidFromCurrentIncome: 0,
      paidFromPreviousSavings: 0,
      totalSettled: 0,
      pendingReserve: 0,
      excludedWifeUdhaar: 0,
    };
  }, [activeCycleReserves, selectedMeta, balancesData, defaultCycleMonth]);

  const selectedCardNextCycleInfo = React.useMemo(() => {
    if (!selectedMeta || (selectedMeta.type !== 'credit_card' && selectedMeta.type !== 'rupay_card')) return null;
    const found = nextMonthCycleReserves.items.find((i) => i.cardId === selectedMeta.id);
    if (found) return found;
    const bDay = balancesData?.cardBillingDays?.[selectedMeta.id] ?? selectedMeta.billingDay ?? 15;
    const sDay =
      balancesData?.cardBillingStartDays?.[selectedMeta.id] ??
      selectedMeta.billingStartDay ??
      getDefaultBillingStartDay(bDay);
    const dDay = balancesData?.cardPaymentDueDays?.[selectedMeta.id] ?? selectedMeta.paymentDueDay ?? 5;
    return {
      cardId: selectedMeta.id,
      shortName: selectedMeta.shortName,
      isWifeCard: Boolean(selectedMeta.isWifeAccount),
      cycle: getCardBillCycleForPaymentMonth(nextCycleMonth, bDay, dDay, sDay),
      cycleSpends: 0,
      cycleRefunds: 0,
      cycleBillAmount: 0,
      paidFromCurrentIncome: 0,
      paidFromPreviousSavings: 0,
      totalSettled: 0,
      pendingReserve: 0,
      excludedWifeUdhaar: 0,
    };
  }, [nextMonthCycleReserves, selectedMeta, balancesData, nextCycleMonth]);

  const modalCardCycleInfo = React.useMemo(() => {
    const res = calculateMonthlyCardReserves(transactions, billCycleMonth);
    const found = res.items.find((i) => i.cardId === billTargetCard);
    if (found) return found;
    const meta = ACCOUNTS_CONFIG[billTargetCard];
    const bDay = balancesData?.cardBillingDays?.[billTargetCard] ?? meta?.billingDay ?? 15;
    const sDay =
      balancesData?.cardBillingStartDays?.[billTargetCard] ??
      meta?.billingStartDay ??
      getDefaultBillingStartDay(bDay);
    const dDay = balancesData?.cardPaymentDueDays?.[billTargetCard] ?? meta?.paymentDueDay ?? 5;
    return {
      cardId: billTargetCard,
      shortName: meta?.shortName || billTargetCard,
      isWifeCard: Boolean(meta?.isWifeAccount),
      cycle: getCardBillCycleForPaymentMonth(billCycleMonth, bDay, dDay, sDay),
      cycleSpends: 0,
      cycleRefunds: 0,
      cycleBillAmount: 0,
      paidFromCurrentIncome: 0,
      paidFromPreviousSavings: 0,
      totalSettled: 0,
      pendingReserve: 0,
      excludedWifeUdhaar: 0,
    };
  }, [transactions, billCycleMonth, billTargetCard, balancesData]);

  // Preview stats for Modal
  const modalPreviewTxs = filterTransactionsForStatement(
    transactions,
    exportAccountId,
    exportDateRange,
    exportStartDate,
    exportEndDate
  );

  const modalPreviewDebits = modalPreviewTxs
    .filter((t) => t.type === 'expense')
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
              {CREDIT_CARDS.length} Credit/RuPay Cards (incl. Wife's Card 2904), {BANK_ACCOUNTS.length} Bank Accounts (incl. Wife's A/c) & Cash ka bill cycle reserve, settlement aur EMI ledger.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Settle Card Bill Button (Available across all tabs) */}
            <button
              type="button"
              onClick={() => openCardSettleModal()}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-900/30 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>💳 Settle Card Bill</span>
            </button>

            {/* Add / Delete Cards & Accounts Button */}
            <button
              onClick={() => setIsAddCardModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-orange-900/30 cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <Plus className="w-3 h-3 -ml-1" />
              <span>+ Add / Delete Card & A/c</span>
            </button>

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
            const count =
              acc.id === 'Wife Account'
                ? transactions.filter((t) => canonicalizeAccountId(t.account) === 'Wife Account' || isWifeTransferEntry(t)).length
                : transactions.filter((t) => canonicalizeAccountId(t.account) === acc.id).length;
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
                {acc.id === 'Wife Account' ? (
                  <HeartHandshake className="w-3.5 h-3.5 text-pink-400" />
                ) : isRuPay ? (
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                ) : isCC ? (
                  <CreditCard className="w-3.5 h-3.5 text-sky-400" />
                ) : isBank ? (
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Wallet className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span>{acc.shortName}</span>
                {isWifeOwnedAccount(acc.id) && acc.id !== 'Wife Account' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-pink-500/20 text-pink-300 border border-pink-500/30">
                    👩 Wife
                  </span>
                )}
                {accBalInfo && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                    acc.id === 'Wife Account'
                      ? 'bg-pink-500/20 text-pink-300'
                      : isBank || acc.type === 'cash'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-sky-500/20 text-sky-300'
                  }`}>
                    {acc.id === 'Wife Account'
                      ? `₹${Math.round((displayWifeBalance || accBalInfo.currentBalance || 0) / 1000)}k`
                      : isBank || acc.type === 'cash'
                      ? `₹${Math.round(accBalInfo.currentBalance / 1000)}k`
                      : `₹${Math.round((accBalInfo.availableLimit || 0) / 1000)}k avl`}
                  </span>
                )}
                <span className="text-[10px] opacity-75 font-mono">({count})</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setIsAddCardModalOpen(true)}
            className="px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40"
            title="Naya Credit Card ya Bank Account jodein"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Card</span>
          </button>
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
              {CREDIT_CARDS.length} Cards
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-white mt-1.5">
            {isFamily || isPrivacyMode ? '••••••' : `₹${(balancesData?.totalCardAvailableLimit || 0).toLocaleString('en-IN')}`}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Total Limit: ₹{CREDIT_CARDS.reduce((sum, c) => sum + (balancesData?.cardCreditLimits?.[c.id] || balancesData?.accounts?.[c.id]?.creditLimit || c.creditLimit || 100000), 0).toLocaleString('en-IN')}
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

        {/* Stat 4: Wife's Savings Reserve (Single unified Wife's Savings A/c) */}
        <div
          onClick={() => setSelectedAccountId('Wife Account')}
          className={`bg-gradient-to-br from-pink-950/40 via-slate-900/80 to-purple-950/40 border rounded-2xl p-4 relative overflow-hidden cursor-pointer transition-all ${
            selectedAccountId === 'Wife Account'
              ? 'border-pink-400 ring-1 ring-pink-400/50 shadow-lg shadow-pink-950/40'
              : 'border-pink-500/30 hover:border-pink-400/60'
          }`}
          title="Wife's Savings A/c ledger dekhne ke liye click karein"
        >
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
            {isFamily || isPrivacyMode ? '••••••' : `₹${(displayWifeBalance || balancesData?.wifeSavings?.currentBalance || 0).toLocaleString('en-IN')}`}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Base + Transfers · Click Ledger</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (ACCOUNTS_CONFIG['Wife Account']) {
                  handleOpenSingleAccountModal(ACCOUNTS_CONFIG['Wife Account']);
                } else {
                  setIsBalancesModalOpen(true);
                }
              }}
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
          <div className="bg-slate-900/50 border border-white/[0.08] rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="text-xs text-slate-400 flex items-center justify-between gap-1.5">
                <span>Account Type & Badge</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenSingleAccountModal(selectedMeta)}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 border border-indigo-500/30 font-semibold cursor-pointer transition-colors"
                  >
                    ✏️ Edit
                  </button>
                  {selectedMeta.id !== 'Wife Account' && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAccount(selectedMeta)}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-semibold cursor-pointer transition-colors flex items-center gap-0.5"
                      title="Is Card ya Account ko delete karein"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="font-bold text-white text-sm">{selectedMeta.name}</span>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-white/[0.06] font-mono text-[10px] text-indigo-300">
                  {selectedMeta.type.replace('_', ' ').toUpperCase()}
                </span>
                {(selectedMeta.type === 'credit_card' || selectedMeta.type === 'rupay_card') ? (
                  (() => {
                    const endD = balancesData?.cardBillingDays?.[selectedMeta.id] ?? balancesData?.accounts?.[selectedMeta.id]?.billingDay ?? selectedMeta.billingDay ?? 15;
                    const startD =
                      balancesData?.cardBillingStartDays?.[selectedMeta.id] ??
                      balancesData?.accounts?.[selectedMeta.id]?.billingStartDay ??
                      selectedMeta.billingStartDay ??
                      getDefaultBillingStartDay(endD);
                    const dueD = balancesData?.cardPaymentDueDays?.[selectedMeta.id] ?? balancesData?.accounts?.[selectedMeta.id]?.paymentDueDay ?? selectedMeta.paymentDueDay ?? 5;
                    return (
                      <>
                        <span>
                          · Cycle: <strong className="text-emerald-300">{startD}th</strong>–<strong className="text-slate-200">{endD}th</strong>
                        </span>
                        <span>
                          · Due: <strong className="text-amber-300">{dueD}th</strong>
                        </span>
                      </>
                    );
                  })()
                ) : (
                  <span>· {selectedMeta.badge}</span>
                )}
              </div>
              {(selectedMeta.type === 'credit_card' || selectedMeta.type === 'rupay_card') && (
                <button
                  type="button"
                  onClick={() => handleOpenSingleAccountModal(selectedMeta)}
                  className="text-[10px] text-amber-300 hover:text-amber-200 underline font-semibold cursor-pointer"
                >
                  📅 Cycle Badlein
                </button>
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
                    : `₹${(balancesData?.accounts[selectedAccountId]?.availableLimit ?? Math.max(0, (balancesData?.cardCreditLimits?.[selectedAccountId] || selectedMeta.creditLimit || 100000) - currentMonthExpense)).toLocaleString('en-IN')}`}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                  <span>Total Limit: ₹{(balancesData?.accounts[selectedAccountId]?.creditLimit || balancesData?.cardCreditLimits?.[selectedAccountId] || selectedMeta.creditLimit || 100000).toLocaleString('en-IN')}</span>
                  <button
                    onClick={() => handleOpenSingleAccountModal(selectedMeta)}
                    className="text-sky-400 hover:text-sky-300 text-[10px] font-semibold underline cursor-pointer"
                  >
                    ✏️ Limit / Due Badlein
                  </button>
                </div>
              </div>

              <div className="bg-slate-900/50 border border-white/[0.08] rounded-2xl p-4">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>Current Spends / Outstanding</span>
                  <button
                    onClick={() => handleOpenSingleAccountModal(selectedMeta)}
                    className="text-rose-400 hover:text-rose-300 text-[10px] font-semibold underline cursor-pointer"
                  >
                    ✏️ Due Set Karein
                  </button>
                </div>
                <div className="text-xl font-bold text-rose-400 font-mono mt-1">
                  {isFamily || isPrivacyMode 
                    ? '••••••' 
                    : `₹${(balancesData?.accounts[selectedAccountId]?.currentOutstanding ?? currentMonthExpense).toLocaleString('en-IN')}`}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {isFamily ? '🔒 Master Card Spends Masked' : 'Debits, Spends & Active EMIs'}
                </div>
              </div>

              <div className="bg-gradient-to-br from-amber-950/40 to-indigo-950/40 border border-amber-500/35 rounded-2xl p-4">
                <div className="text-xs text-amber-300 font-medium flex items-center justify-between gap-1">
                  <span>Bill-Cycle Reserve ({defaultCycleMonth})</span>
                  {!isFamily && (
                    <button
                      type="button"
                      onClick={() => openCardSettleModal(selectedMeta.id)}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 border border-emerald-500/40 font-bold cursor-pointer transition-colors"
                    >
                      💳 Settle
                    </button>
                  )}
                </div>
                <div className="text-xl font-extrabold text-amber-300 font-mono mt-1">
                  {isFamily || isPrivacyMode
                    ? '••••••'
                    : `₹${(selectedCardCycleInfo?.pendingReserve ?? totalCardObligation).toLocaleString('en-IN')}`}
                </div>
                <div className="text-[11px] text-indigo-200/85 mt-1 space-y-0.5">
                  {isFamily ? (
                    '🔒 Hidden for Family'
                  ) : selectedCardCycleInfo ? (
                    <>
                      <div>
                        📅 {selectedCardCycleInfo.cycle.cycleLabel} · Due{' '}
                        <strong className="text-amber-300">{selectedCardCycleInfo.cycle.dueLabel}</strong>
                      </div>
                      <div className="text-[10px] text-slate-300 font-mono">
                        Cycle Bill: ₹{selectedCardCycleInfo.cycleBillAmount.toLocaleString('en-IN')}
                        {selectedCardCycleInfo.totalSettled > 0 && (
                          <span className="text-emerald-300 ml-1.5">
                            · Settled: ₹{selectedCardCycleInfo.totalSettled.toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>
                      {selectedCardNextCycleInfo && selectedCardNextCycleInfo.pendingReserve > 0 && (
                        <div className="text-[10px] text-cyan-300 font-mono pt-1 mt-1 border-t border-white/10">
                          ⏭️ Next Month ({nextCycleMonth}): ₹{selectedCardNextCycleInfo.pendingReserve.toLocaleString('en-IN')}{' '}
                          <span className="text-slate-400">
                            ({selectedCardNextCycleInfo.cycle.cycleLabel} · Due {selectedCardNextCycleInfo.cycle.dueLabel})
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    `Spends + EMIs: ₹${totalCardObligation.toLocaleString('en-IN')}`
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-gradient-to-br from-emerald-950/40 to-slate-900/80 border border-emerald-500/30 rounded-2xl p-4">
                <div className="text-xs text-emerald-300 font-medium flex items-center justify-between">
                  <span>Current Live Balance</span>
                  <button
                    onClick={() => handleOpenSingleAccountModal(selectedMeta)}
                    className="text-[10px] text-emerald-400 hover:underline cursor-pointer"
                  >
                    ✏️ Set Base Balance
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
        <div className="space-y-4">
          <div className="bg-slate-900/50 border border-white/[0.08] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-300 font-medium">
                Showing all accounts consolidated summary ({transactions.length} transactions total)
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Includes {CREDIT_CARDS.length} Credit/RuPay cards, {BANK_ACCOUNTS.length} Bank accounts & Cash ledger
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

          {/* Individual Cards & Banks Quick Grid with Per-Account Set Base/Limit Buttons (Wife's Savings already shown in Heart card above) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ALL_ACCOUNTS.filter((acc) => acc.id !== 'Wife Account').map((acc) => {
              const isCard = acc.type === 'credit_card' || acc.type === 'rupay_card';
              const accInfo = balancesData?.accounts?.[acc.id];
              const cardLimit = balancesData?.cardCreditLimits?.[acc.id] || accInfo?.creditLimit || acc.creditLimit || 100000;
              const liveBal = accInfo?.currentBalance ?? 0;
              const cardDue = accInfo?.currentOutstanding ?? 0;
              const avlLimit = accInfo?.availableLimit ?? Math.max(0, cardLimit - cardDue);
              const cardBillDay = balancesData?.cardBillingDays?.[acc.id] ?? accInfo?.billingDay ?? acc.billingDay ?? 15;
              const cardStartDay =
                balancesData?.cardBillingStartDays?.[acc.id] ??
                accInfo?.billingStartDay ??
                acc.billingStartDay ??
                getDefaultBillingStartDay(cardBillDay);
              const cardPayDueDay = balancesData?.cardPaymentDueDays?.[acc.id] ?? accInfo?.paymentDueDay ?? acc.paymentDueDay ?? 5;

              return (
                <div
                  key={acc.id}
                  onClick={() => setSelectedAccountId(acc.id)}
                  className="bg-slate-900/60 hover:bg-slate-900/90 border border-white/[0.08] hover:border-indigo-500/40 rounded-2xl p-3.5 cursor-pointer transition-all flex flex-col justify-between gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300">
                          {acc.badge}
                        </span>
                        {isWifeOwnedAccount(acc.id) && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">
                            👩 Wife
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-xs text-white mt-1.5">{acc.shortName}</h4>
                      <p className="text-[10px] text-slate-400 truncate max-w-[155px]">{acc.name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenSingleAccountModal(acc);
                          }}
                          className="px-2 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold cursor-pointer transition-colors"
                          title={isCard ? 'Is card ki Limit, Due aur Bill Cycle change karein' : 'Is bank/cash ka Base Balance set karein'}
                        >
                          ✏️ {isCard ? 'Edit' : 'Set Base'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteAccount(acc);
                          }}
                          className="p-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/35 text-rose-300 border border-rose-500/30 cursor-pointer transition-colors"
                          title={`"${acc.shortName}" delete karein`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      {isCard && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCardSettleModal(acc.id);
                          }}
                          className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold cursor-pointer transition-colors"
                          title="Is card ka bill partial ya full settle karein"
                        >
                          💳 Settle
                        </button>
                      )}
                    </div>
                  </div>

                  {isCard ? (
                    <div className="pt-2 border-t border-white/[0.06] space-y-0.5 text-[11px] font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Available:</span>
                        <span className="font-bold text-sky-300">
                          {isFamily || isPrivacyMode ? '••••' : `₹${avlLimit.toLocaleString('en-IN')}`}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">Limit: ₹{cardLimit.toLocaleString('en-IN')}</span>
                        <span className="text-rose-400">Due: ₹{cardDue.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-[10px] pt-0.5 text-amber-300/80">
                        <span>📅 {cardStartDay}th–{cardBillDay}th</span>
                        <span>⏰ Due: {cardPayDueDay}th</span>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-white/[0.06] space-y-0.5 text-[11px] font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Live Balance:</span>
                        <span className="font-bold text-emerald-400">
                          {isFamily || isPrivacyMode ? '••••' : `₹${liveBal.toLocaleString('en-IN')}`}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Base Set: ₹{(accInfo?.baseBalance || 0).toLocaleString('en-IN')}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
                  const isIncomingWifeTransfer = selectedAccountId === 'Wife Account' && isWifeTransferEntry(t);
                  const isInc = isIncomingWifeTransfer ? true : t.type === 'income';
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
                        <div className="text-white font-medium flex items-center gap-1.5 flex-wrap">
                          <span>{t.description || t.category}</span>
                          {isIncomingWifeTransfer && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30 font-semibold">
                              Transfer In from {currentAcc}
                            </span>
                          )}
                        </div>
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
                        {isIncomingWifeTransfer ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-pink-950/50 border border-pink-500/30 text-[11px] text-pink-200 font-medium">
                            {currentAcc} → Wife's Savings
                          </span>
                        ) : (
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
                        )}
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

      {/* Full Card Bill Settlement Modal (Partial / Full + From->To Account + Income vs Previous Savings Toggle) */}
      {isRecordBillPaymentOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsRecordBillPaymentOpen(false);
          }}
        >
          <div
            className="bg-slate-900 border border-emerald-500/40 rounded-2xl max-w-lg w-full shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[92dvh] flex flex-col overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-slate-900/95 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">
                    Credit Card Bill Settlement
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Partial ya Full settle karein • Account route & funding source chunein
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRecordBillPaymentOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordBillPayment} className="overflow-y-auto p-5 space-y-4 text-xs">
              {/* Account Route: From Account -> To Credit Card */}
              <div className="bg-slate-950/70 border border-indigo-500/25 rounded-xl p-3.5 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                  1. Kis Account Se → Kis Card Me Settle Ho Raha Hai
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      🏦 Kis Account Se (From)
                    </label>
                    <select
                      value={billFromAccount}
                      onChange={(e) => setBillFromAccount(e.target.value as AccountId)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-emerald-500 text-xs font-medium"
                    >
                      {ALL_ACCOUNTS.filter((a) => a.type === 'bank_account' || a.type === 'cash').map((acc) => {
                        const liveBal = balancesData?.accounts?.[acc.id]?.currentBalance;
                        return (
                          <option key={acc.id} value={acc.id}>
                            {isWifeOwnedAccount(acc.id) ? '👩 ' : acc.type === 'cash' ? '💵 ' : '🏦 '}
                            {acc.shortName}
                            {liveBal !== undefined ? ` (₹${liveBal.toLocaleString('en-IN')})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      💳 Kis Card Me (To Card)
                    </label>
                    <select
                      value={billTargetCard}
                      onChange={(e) => {
                        const nextCard = e.target.value as AccountId;
                        setBillTargetCard(nextCard);
                        const nextRes = calculateMonthlyCardReserves(transactions, billCycleMonth).items.find(
                          (i) => i.cardId === nextCard
                        );
                        const nextOut = balancesData?.accounts?.[nextCard]?.currentOutstanding ?? 0;
                        const sug = nextRes && nextRes.pendingReserve > 0 ? nextRes.pendingReserve : nextOut;
                        if (sug > 0) setBillAmount(String(sug));
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-emerald-500 text-xs font-medium"
                    >
                      {CREDIT_CARDS.map((c) => {
                        const out = balancesData?.accounts?.[c.id]?.currentOutstanding ?? 0;
                        return (
                          <option key={c.id} value={c.id}>
                            {isWifeOwnedAccount(c.id) ? '👩 ' : '💳 '}
                            {c.shortName} (Due ₹{out.toLocaleString('en-IN')})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                {/* Live Cycle Snapshot for Target Card */}
                <div className="bg-amber-950/25 border border-amber-500/25 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div>
                    <div className="text-amber-300 font-semibold">
                      📅 Bill Cycle ({billCycleMonth}): {modalCardCycleInfo.cycle.cycleLabel}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Due Date: {modalCardCycleInfo.cycle.dueLabel} · Already Settled: ₹{modalCardCycleInfo.totalSettled.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-amber-300 font-bold">
                      Cycle Pending: ₹{modalCardCycleInfo.pendingReserve.toLocaleString('en-IN')}
                    </div>
                    <div className="text-[10px] text-rose-300">
                      Total Outstanding: ₹{(balancesData?.accounts?.[billTargetCard]?.currentOutstanding ?? 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Settlement Mode: Full vs Partial + Amount */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-semibold">
                    2. Full ya Partial Settlement
                  </label>
                  <div className="inline-flex bg-slate-950 border border-slate-700 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setBillSettlementMode('full');
                        const fullAmt =
                          modalCardCycleInfo.pendingReserve > 0
                            ? modalCardCycleInfo.pendingReserve
                            : balancesData?.accounts?.[billTargetCard]?.currentOutstanding ?? 0;
                        if (fullAmt > 0) setBillAmount(String(fullAmt));
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                        billSettlementMode === 'full'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      ✅ Full Settle
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillSettlementMode('partial')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                        billSettlementMode === 'partial'
                          ? 'bg-amber-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      ✂️ Partial Settle
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-emerald-400 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    placeholder="Kitna amount pay karna hai (e.g. 12500)"
                    value={billAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBillAmount(val);
                      const num = Number(val) || 0;
                      const refBill =
                        modalCardCycleInfo.pendingReserve > 0
                          ? modalCardCycleInfo.pendingReserve
                          : balancesData?.accounts?.[billTargetCard]?.currentOutstanding ?? 0;
                      if (refBill > 0 && num > 0 && num < refBill) {
                        setBillSettlementMode('partial');
                      } else if (refBill > 0 && num >= refBill) {
                        setBillSettlementMode('full');
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2.5 text-white font-mono text-sm font-bold focus:outline-hidden focus:border-emerald-500"
                    required
                  />
                </div>

                {/* Quick Amount Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {modalCardCycleInfo.pendingReserve > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setBillAmount(String(modalCardCycleInfo.pendingReserve));
                          setBillSettlementMode('full');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-[10px] font-mono font-semibold cursor-pointer"
                      >
                        Full Cycle Bill (₹{modalCardCycleInfo.pendingReserve.toLocaleString('en-IN')})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBillAmount(String(Math.round(modalCardCycleInfo.pendingReserve / 2)));
                          setBillSettlementMode('partial');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-[10px] font-mono font-semibold cursor-pointer"
                      >
                        50% Partial (₹{Math.round(modalCardCycleInfo.pendingReserve / 2).toLocaleString('en-IN')})
                      </button>
                    </>
                  )}
                  {(balancesData?.accounts?.[billTargetCard]?.currentOutstanding ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const out = balancesData?.accounts?.[billTargetCard]?.currentOutstanding ?? 0;
                        setBillAmount(String(out));
                        setBillSettlementMode('full');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-300 text-[10px] font-mono font-semibold cursor-pointer"
                    >
                      Full Outstanding (₹{(balancesData?.accounts?.[billTargetCard]?.currentOutstanding ?? 0).toLocaleString('en-IN')})
                    </button>
                  )}
                </div>
              </div>

              {/* Funding Source Toggle: Current Month Income vs Previous Bank Savings */}
              <div className="space-y-2">
                <label className="block text-slate-300 font-semibold">
                  3. Yeh Payment Kahan Se Minus Karna Hai? (Toggle)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setBillFundingSource('current_income')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      billFundingSource === 'current_income'
                        ? 'bg-emerald-950/50 border-emerald-400 text-white ring-1 ring-emerald-400/50 shadow-md'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1.5 text-emerald-300">
                      <span>💰 Current Month Income se</span>
                    </div>
                    <p className="text-[10px] text-slate-300/90 mt-1 leading-relaxed">
                      Is mahine ki income se katega. Bank balance aur Card Reserve dono clear honge (no double-count).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBillFundingSource('previous_savings')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      billFundingSource === 'previous_savings'
                        ? 'bg-cyan-950/50 border-cyan-400 text-white ring-1 ring-cyan-400/50 shadow-md'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1.5 text-cyan-300">
                      <span>🏦 Pehle Ki Bank Savings se</span>
                    </div>
                    <p className="text-[10px] text-slate-300/90 mt-1 leading-relaxed">
                      Purani bank savings se deduct hoga. Current month ki income untouched rahegi!
                    </p>
                  </button>
                </div>
              </div>

              {/* Date, Cycle Month & Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-emerald-500 text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Bill Cycle Month</label>
                  <input
                    type="month"
                    value={billCycleMonth}
                    onChange={(e) => setBillCycleMonth(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-emerald-500 text-xs font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Note / Reference (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. CRED UPI / Nov Statement Paid"
                  value={billNotes}
                  onChange={(e) => setBillNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-emerald-500 text-xs"
                />
              </div>

              <div className="pt-2 border-t border-white/[0.08] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecordBillPaymentOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 cursor-pointer font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSettlingCard}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSettlingCard
                    ? 'Settling...'
                    : `✅ Confirm ${billSettlementMode === 'partial' ? 'Partial' : 'Full'} Settle`}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
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

                  {BANK_ACCOUNTS.filter((a) => a.id !== 'Wife Account').concat(ALL_ACCOUNTS.filter(a => a.type === 'cash')).map((acc) => (
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
                          step="any"
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
                        step="any"
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

                {/* Section 3: Credit Cards Limits & Current Spends/Due */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                    <span className="font-bold text-sm text-sky-400 font-sans flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4" />
                      3. Credit Cards (Credit Limit & Aaj Ka Due / Kharcha)
                    </span>
                    <span className="text-[10px] text-slate-400">Limit & Today's Due</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Har card ki total credit limit set/change karein, aur aaj ke hisab se jo current unpaid due/kharcha hai wo dalein. Iske baad hone wale naye transactions hi add/minus honge (purane transactions dobara add nahi honge):
                  </p>

                  <div className="space-y-3">
                    {CREDIT_CARDS.map((card) => {
                      const currentDueVal = parseFloat(editBaseBalances[card.id] || '0') || 0;
                      const currentLimitVal = parseFloat(editCardLimits[card.id] || String(balancesData?.cardCreditLimits?.[card.id] || card.creditLimit || 100000)) || (card.creditLimit || 100000);
                      const calculatedAvl = Math.max(0, currentLimitVal - currentDueVal);
                      const currentBillDay = editCardBillingDays[card.id] ?? String(balancesData?.cardBillingDays?.[card.id] ?? card.billingDay ?? 15);
                      const currentStartDay =
                        editCardBillingStartDays[card.id] ??
                        String(
                          balancesData?.cardBillingStartDays?.[card.id] ??
                            card.billingStartDay ??
                            getDefaultBillingStartDay(Number(currentBillDay) || 15)
                        );
                      const currentPayDueDay = editCardDueDays[card.id] ?? String(balancesData?.cardPaymentDueDays?.[card.id] ?? card.paymentDueDay ?? 5);
                      const bulkCurPreview = getCardBillCycleForPaymentMonth(
                        defaultCycleMonth,
                        Number(currentBillDay) || 15,
                        Number(currentPayDueDay) || 5,
                        Number(currentStartDay) || undefined
                      );

                      return (
                        <div key={card.id} className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2.5">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <span className="font-bold text-white text-xs flex items-center gap-1.5">
                              <CreditCard className="w-3.5 h-3.5 text-sky-400" />
                              {card.name}
                            </span>
                            <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                              Available Bacha: ₹{calculatedAvl.toLocaleString('en-IN')}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] text-slate-300 font-medium block mb-1">
                                💳 Total Credit Limit (₹)
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-2 text-slate-400 font-bold">₹</span>
                                <input
                                  type="number"
                                  step="any"
                                  placeholder={String(card.creditLimit || 100000)}
                                  value={editCardLimits[card.id] || ''}
                                  onChange={(e) => setEditCardLimits({ ...editCardLimits, [card.id]: e.target.value })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-white font-mono text-xs focus:border-sky-500 focus:outline-hidden"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[11px] text-rose-300 font-medium block mb-1">
                                🔴 Aaj Ka Due / Unpaid Spends (₹)
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-2 text-slate-400 font-bold">₹</span>
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="0"
                                  value={editBaseBalances[card.id] || ''}
                                  onChange={(e) => setEditBaseBalances({ ...editBaseBalances, [card.id]: e.target.value })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-white font-mono text-xs focus:border-rose-500 focus:outline-hidden"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-1">
                            <div>
                              <label className="text-[10px] text-emerald-300 font-medium block mb-1">
                                🟢 Start Date (1-31)
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={31}
                                placeholder={String(card.billingStartDay || 16)}
                                value={currentStartDay}
                                onChange={(e) =>
                                  setEditCardBillingStartDays({ ...editCardBillingStartDays, [card.id]: e.target.value })
                                }
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:border-emerald-500 focus:outline-hidden"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-amber-300 font-medium block mb-1">
                                🔴 End Date (1-31)
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={31}
                                placeholder={String(card.billingDay || 15)}
                                value={currentBillDay}
                                onChange={(e) => setEditCardBillingDays({ ...editCardBillingDays, [card.id]: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:border-amber-500 focus:outline-hidden"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-indigo-300 font-medium block mb-1">
                                ⏰ Due Date (1-31)
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={31}
                                placeholder={String(card.paymentDueDay || 5)}
                                value={currentPayDueDay}
                                onChange={(e) => setEditCardDueDays({ ...editCardDueDays, [card.id]: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:border-indigo-500 focus:outline-hidden"
                              />
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-400 font-sans">
                            📌 {defaultCycleMonth} Reserve: <strong className="text-amber-300 font-mono">{bulkCurPreview.cycleLabel}</strong> → Due <strong className="text-indigo-300 font-mono">{bulkCurPreview.dueLabel}</strong>
                          </div>
                        </div>
                      );
                    })}
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

      {/* Modal: Add New Card / Bank Account */}
      {isAddCardModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddCardModalOpen(false);
          }}
        >
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Naya Credit Card / Account Jodein
                  </h3>
                  <p className="text-xs text-slate-400">
                    Naya card add karte hi Kharcha, Reimbursement aur Card Reserve me dikhne lagega
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCardModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomCard} className="overflow-y-auto p-5 space-y-4 text-xs">
              {/* Type Selector */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  1. Card / Account Type Chunein
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCardType('credit_card')}
                    className={`p-2.5 rounded-xl border text-center font-semibold cursor-pointer transition-all ${
                      newCardType === 'credit_card'
                        ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    💳 Credit Card
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCardType('rupay_card')}
                    className={`p-2.5 rounded-xl border text-center font-semibold cursor-pointer transition-all ${
                      newCardType === 'rupay_card'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    ⚡ RuPay UPI CC
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCardType('bank_account')}
                    className={`p-2.5 rounded-xl border text-center font-semibold cursor-pointer transition-all ${
                      newCardType === 'bank_account'
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    🏦 Bank Account
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCardType('cash')}
                    className={`p-2.5 rounded-xl border text-center font-semibold cursor-pointer transition-all ${
                      newCardType === 'cash'
                        ? 'bg-teal-500/20 border-teal-400 text-teal-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    💵 Cash / Wallet
                  </button>
                </div>
              </div>

              {/* Short Name / Card ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    2. Short Name + Last 4 Digit *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={newCardType === 'bank_account' ? 'e.g. HDFC Bank' : 'e.g. HDFC CC 4512'}
                    value={newCardShortName}
                    onChange={(e) => setNewCardShortName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-semibold focus:border-amber-500 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Telegram me bhi last 4 digit likhne se auto-detect hoga
                  </span>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    3. Pura Naam (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder={newCardType === 'bank_account' ? 'e.g. HDFC Savings Account' : 'e.g. HDFC Millennia CC (4512)'}
                    value={newCardFullName}
                    onChange={(e) => setNewCardFullName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Credit Limit & Opening Due/Balance */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(newCardType === 'credit_card' || newCardType === 'rupay_card') && (
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      💳 Total Credit Limit (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="150000"
                      value={newCardLimit}
                      onChange={(e) => setNewCardLimit(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-hidden"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {newCardType === 'bank_account' ? '🏦 Starting Bank Balance (₹)' : '🔴 Aaj Ka Running Bill / Due (₹)'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0"
                    value={newCardOpeningBalance}
                    onChange={(e) => setNewCardOpeningBalance(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-rose-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Start Date, End Date & Due Date for Cards */}
              {(newCardType === 'credit_card' || newCardType === 'rupay_card') && (() => {
                const newCurPreview = getCardBillCycleForPaymentMonth(
                  defaultCycleMonth,
                  Number(newCardBillingDay) || 15,
                  Number(newCardDueDay) || 5,
                  Number(newCardBillingStartDay) || undefined
                );
                const newNextPreview = getCardBillCycleForPaymentMonth(
                  nextCycleMonth,
                  Number(newCardBillingDay) || 15,
                  Number(newCardDueDay) || 5,
                  Number(newCardBillingStartDay) || undefined
                );
                return (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-emerald-300 font-semibold mb-1 text-[11px]">
                          🟢 Start Date (1-31)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={newCardBillingStartDay}
                          onChange={(e) => setNewCardBillingStartDay(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-amber-300 font-semibold mb-1 text-[11px]">
                          🔴 End Date (1-31)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={newCardBillingDay}
                          onChange={(e) => setNewCardBillingDay(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-amber-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-indigo-300 font-semibold mb-1 text-[11px]">
                          ⏰ Due Date (1-31)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={newCardDueDay}
                          onChange={(e) => setNewCardDueDay(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                    </div>
                    <div className="bg-slate-950/80 border border-indigo-500/25 rounded-xl p-2.5 space-y-1 text-[10.5px]">
                      <div className="flex items-center justify-between text-amber-200">
                        <span>📌 Current Month ({defaultCycleMonth}) Reserve:</span>
                        <span className="font-mono font-bold">
                          {newCurPreview.cycleLabel} → Due {newCurPreview.dueLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-cyan-200">
                        <span>⏭️ Next Month ({nextCycleMonth}) Reserve:</span>
                        <span className="font-mono font-bold">
                          {newNextPreview.cycleLabel} → Due {newNextPreview.dueLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Wife's Card / Account Toggle */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-pink-950/30 border border-pink-500/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newCardIsWifeAccount}
                  onChange={(e) => setNewCardIsWifeAccount(e.target.checked)}
                  className="mt-0.5 rounded bg-slate-900 border-pink-500/50 text-pink-500 focus:ring-pink-500 h-4 w-4 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-pink-200 text-xs">
                    👩 Yeh Wife ka Card / Account hai
                  </div>
                  <div className="text-[10px] text-pink-200/75 mt-0.5">
                    Wife ke card se diya gaya Udhaar aapke monthly outflow & card reserve se automatically exclude rahega.
                  </div>
                </div>
              </label>

              {/* Color Picker */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  🎨 Card Color Theme
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { hex: '#ec4899', label: 'Pink' },
                    { hex: '#06b6d4', label: 'Cyan' },
                    { hex: '#8b5cf6', label: 'Violet' },
                    { hex: '#f59e0b', label: 'Amber' },
                    { hex: '#10b981', label: 'Emerald' },
                    { hex: '#3b82f6', label: 'Blue' },
                    { hex: '#ef4444', label: 'Red' },
                  ].map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setNewCardColor(c.hex)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer ${
                        newCardColor === c.hex ? 'border-white bg-slate-800 text-white' : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.hex }} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* All Active Cards & Accounts Manager (Delete any built-in or custom Card/Account) */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase flex items-center justify-between">
                  <span>Active Cards & Accounts ({ALL_ACCOUNTS.length})</span>
                  <span className="text-[10px] font-normal text-slate-500">Koi bhi card/account delete kar sakte hain</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {ALL_ACCOUNTS.filter(a => a.id !== 'Wife Account').map(acc => (
                    <div key={acc.id} className="flex items-center justify-between bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl">
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white truncate">{acc.shortName}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300 font-mono">
                            {acc.type.replace('_', ' ')}
                          </span>
                          {acc.isWifeAccount && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 font-bold">👩 Wife</span>
                          )}
                        </div>
                        <div className="text-slate-400 text-[10px] truncate">{acc.name}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteAccount(acc)}
                        className="text-rose-400 hover:text-rose-200 px-2 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 cursor-pointer flex items-center gap-1 text-[11px] shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  ))}
                </div>

                {/* Restore Removed Default Cards / Accounts */}
                {(() => {
                  const deletedList = balancesData?.deletedAccounts || loadSavedDeletedAccounts();
                  const restorable = deletedList.filter((id) => Boolean(DEFAULT_ACCOUNTS_CONFIG[id]));
                  if (restorable.length === 0) return null;
                  return (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                      <div className="text-[10px] font-bold text-amber-300/90 uppercase">
                        Removed Default Cards / Accounts (Click to Restore):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {restorable.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => handleRestoreDefaultAccount(id)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-200 border border-amber-500/35 text-[10.5px] font-semibold cursor-pointer transition-colors"
                          >
                            ♻️ Restore {id}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddCardModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingNewCard || !newCardShortName.trim()}
                  className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingNewCard ? 'Adding...' : '➕ Add Card / Account'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {/* Modal: Individual Single Card / Bank Limit & Base Balance Editor */}
      {editingSingleAccount && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingSingleAccount(null);
          }}
        >
          <div
            className="bg-slate-900 border border-indigo-500/40 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  {editingSingleAccount.id === 'Wife Account'
                    ? <HeartHandshake className="w-4 h-4 text-pink-400" />
                    : (editingSingleAccount.type === 'credit_card' || editingSingleAccount.type === 'rupay_card')
                    ? <CreditCard className="w-4 h-4 text-sky-400" />
                    : <Building2 className="w-4 h-4 text-emerald-400" />}
                  <span>{editingSingleAccount.shortName}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {editingSingleAccount.name} • {(editingSingleAccount.type === 'credit_card' || editingSingleAccount.type === 'rupay_card')
                    ? 'Limit, Due & Bill Cycle set karein'
                    : 'Alag se Base Balance set karein'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSingleAccount(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSingleAccount} className="p-5 space-y-4 text-xs">
              {(editingSingleAccount.type === 'credit_card' || editingSingleAccount.type === 'rupay_card') ? (
                <>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      💳 Total Credit Limit (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      value={singleLimitInput}
                      onChange={(e) => setSingleLimitInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:border-sky-500 focus:outline-hidden"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-rose-300 font-semibold mb-1">
                      🔴 Aaj Ka Running Due / Unpaid Spends (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={singleBaseInput}
                      onChange={(e) => setSingleBaseInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:border-rose-500 focus:outline-hidden"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Available Limit: <strong className="text-emerald-400 font-mono">₹{Math.max(0, (parseFloat(singleLimitInput) || 0) - (parseFloat(singleBaseInput) || 0)).toLocaleString('en-IN')}</strong>
                    </p>
                  </div>

                  {(() => {
                    const singleCurPreview = getCardBillCycleForPaymentMonth(
                      defaultCycleMonth,
                      Number(singleBillingDayInput) || 15,
                      Number(singleDueDayInput) || 5,
                      Number(singleStartDayInput) || undefined
                    );
                    const singleNextPreview = getCardBillCycleForPaymentMonth(
                      nextCycleMonth,
                      Number(singleBillingDayInput) || 15,
                      Number(singleDueDayInput) || 5,
                      Number(singleStartDayInput) || undefined
                    );
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-2.5 pt-1">
                          <div>
                            <label className="block text-emerald-300 font-semibold mb-1 text-[11px]">
                              🟢 Start Date (1–31)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={31}
                              required
                              value={singleStartDayInput}
                              onChange={(e) => setSingleStartDayInput(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-white font-mono text-sm focus:border-emerald-500 focus:outline-hidden"
                            />
                            <span className="text-[9.5px] text-slate-400 mt-1 block">
                              Cycle shuru tarikh
                            </span>
                          </div>
                          <div>
                            <label className="block text-amber-300 font-semibold mb-1 text-[11px]">
                              🔴 End Date (1–31)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={31}
                              required
                              value={singleBillingDayInput}
                              onChange={(e) => setSingleBillingDayInput(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-white font-mono text-sm focus:border-amber-500 focus:outline-hidden"
                            />
                            <span className="text-[9.5px] text-slate-400 mt-1 block">
                              Bill close tarikh
                            </span>
                          </div>
                          <div>
                            <label className="block text-indigo-300 font-semibold mb-1 text-[11px]">
                              ⏰ Due Date (1–31)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={31}
                              required
                              value={singleDueDayInput}
                              onChange={(e) => setSingleDueDayInput(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-white font-mono text-sm focus:border-indigo-500 focus:outline-hidden"
                            />
                            <span className="text-[9.5px] text-slate-400 mt-1 block">
                              Payment due tarikh
                            </span>
                          </div>
                        </div>

                        <div className="bg-slate-950/90 border border-indigo-500/30 rounded-xl p-3 space-y-1.5 text-[10.5px]">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                            Live Card Reserve Routing Preview
                          </div>
                          <div className="flex items-center justify-between gap-2 text-amber-200">
                            <span>📌 Current ({defaultCycleMonth}) Reserve:</span>
                            <span className="font-mono font-bold text-right">
                              {singleCurPreview.cycleLabel} → Due {singleCurPreview.dueLabel}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-cyan-200">
                            <span>⏭️ Next ({nextCycleMonth}) Reserve:</span>
                            <span className="font-mono font-bold text-right">
                              {singleNextPreview.cycleLabel} → Due {singleNextPreview.dueLabel}
                            </span>
                          </div>
                          <p className="text-[9.5px] text-slate-400 pt-1 border-t border-white/[0.06]">
                            💡 Start se End ke beech ke transactions jinka Due Date current month me aata hai wo Current Card Reserve me jayenge, baaki Next Month Reserve me.
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : (
                <div>
                  <label className="block text-emerald-300 font-semibold mb-1">
                    🏦 Aaj Ka Base / Opening Balance (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={singleBaseInput}
                    onChange={(e) => setSingleBaseInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono text-sm focus:border-emerald-500 focus:outline-hidden"
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Iske baad aane wale transactions aur auto-debits sirf is account me live add/deduct honge. Baaki accounts untouched rahenge.
                  </p>
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                <div>
                  {editingSingleAccount.id !== 'Wife Account' && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAccount(editingSingleAccount)}
                      className="px-3 py-2 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/40 text-rose-300 font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingSingleAccount(null)}
                    className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingSingleAccount}
                    className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSavingSingleAccount ? 'Saving...' : '💾 Save Only This Account'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Inline Delete Card / Account Confirmation */}
      {confirmDeleteAccount && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeletingAccount) setConfirmDeleteAccount(null);
          }}
        >
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2.5 text-rose-400">
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Card / Account Delete Karein?</h3>
                  <p className="text-[11px] text-slate-400">
                    {confirmDeleteAccount.shortName} ({confirmDeleteAccount.name})
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Ye card/account aapki active accounts list aur dropdowns se hat jayega. Aapke purane transactions safe rahenge{DEFAULT_ACCOUNTS_CONFIG[confirmDeleteAccount.id] ? ' aur aap ise kabhi bhi "Add / Delete Card & A/c" modal se wapas Restore kar sakte hain.' : '.'}
              </p>
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isDeletingAccount}
                  onClick={() => setConfirmDeleteAccount(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingAccount}
                  onClick={() => handleDeleteCustomCard(confirmDeleteAccount.id)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeletingAccount ? 'Deleting...' : 'Haan, Delete Karein'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
