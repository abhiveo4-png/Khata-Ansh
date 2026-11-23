import React, { useState } from 'react';
import { 
  HandCoins, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Plus, 
  CheckCircle2, 
  Clock, 
  Search, 
  MessageCircle, 
  Trash2, 
  Calendar,
  Users,
  ChevronDown,
  ChevronUp,
  Edit3,
  Pencil,
  Layers,
  RotateCcw,
  Wallet
} from 'lucide-react';
import { UdhaarRecord, AccountId } from '../types';
import { ALL_ACCOUNTS, isWifeCardAccount, isWifeOwnedAccount } from '../utils/accounts';

export interface UdhaarSettlePayload {
  amountSettled?: number;
  settleAccount?: AccountId | string;
  originAccount?: AccountId | string;
  settleDate?: string;
  notes?: string;
}

interface UdhaarKhataViewProps {
  records?: UdhaarRecord[];
  udhaars?: UdhaarRecord[];
  isPrivacyMode?: boolean;
  onAddRecord?: (record: Omit<UdhaarRecord, 'id' | 'createdAt'>) => Promise<void>;
  onAddUdhaar?: (record: Omit<UdhaarRecord, 'id' | 'createdAt'>) => Promise<void>;
  onSettleRecord?: (id: string, payload?: UdhaarSettlePayload) => Promise<void>;
  onSettleUdhaar?: (id: string, payload?: UdhaarSettlePayload) => Promise<void>;
  onDeleteRecord?: (id: string) => Promise<void>;
  onDeleteUdhaar?: (id: string) => Promise<void>;
  onUpdateRecord?: (id: string, updates: Partial<UdhaarRecord>) => Promise<void>;
  onUpdateUdhaar?: (id: string, updates: Partial<UdhaarRecord>) => Promise<void>;
}

export const UdhaarKhataView: React.FC<UdhaarKhataViewProps> = ({
  records,
  udhaars,
  isPrivacyMode = false,
  onAddRecord,
  onAddUdhaar,
  onSettleRecord,
  onSettleUdhaar,
  onDeleteRecord,
  onDeleteUdhaar,
  onUpdateRecord,
  onUpdateUdhaar,
}) => {
  const actualRecords = (Array.isArray(records) && records.length > 0)
    ? records
    : (Array.isArray(udhaars) ? udhaars : Array.isArray(records) ? records : []);
  const safeRecords = actualRecords;

  const handleAdd = onAddRecord || onAddUdhaar;
  const handleSettle = onSettleRecord || onSettleUdhaar;
  const handleDelete = onDeleteRecord || onDeleteUdhaar;
  const handleUpdate = onUpdateRecord || onUpdateUdhaar;

  const [viewMode, setViewMode] = useState<'grouped' | 'list'>('grouped');
  const [filter, setFilter] = useState<'all' | 'lent' | 'borrowed' | 'settled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [expandedPeople, setExpandedPeople] = useState<Record<string, boolean>>({});

  // Full Record Editing Modal State (Amount, Person Name, Date, Type, Description)
  const [editingRecord, setEditingRecord] = useState<UdhaarRecord | null>(null);
  const [editPersonName, setEditPersonName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState<'lent' | 'borrowed'>('lent');
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAccount, setEditAccount] = useState<AccountId>('Cash');
  const [isSavingRecord, setIsSavingRecord] = useState(false);

  // Settlement Modal State (Partial or Full + From->To Bank/Cash/Card Account)
  const [settlingRecord, setSettlingRecord] = useState<UdhaarRecord | null>(null);
  const [settleModeInput, setSettleModeInput] = useState<'full' | 'partial'>('full');
  const [settleAmountInput, setSettleAmountInput] = useState('');
  const [settleOriginAccountInput, setSettleOriginAccountInput] = useState<string>('AX Bank');
  const [settleAccountInput, setSettleAccountInput] = useState<string>('AX Bank');
  const [settleDateInput, setSettleDateInput] = useState(() => new Date().toISOString().split('T')[0]);
  const [settleNotesInput, setSettleNotesInput] = useState('');
  const [isSettlingRecord, setIsSettlingRecord] = useState(false);

  // Form State
  const [personName, setPersonName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'lent' | 'borrowed'>('lent');
  const [account, setAccount] = useState<AccountId>('Cash');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getRemainingAmount = (r: UdhaarRecord): number => {
    if (!r || r.status === 'settled') return 0;
    return Math.max(0, (Number(r.amount) || 0) - (Number(r.settledAmount) || 0));
  };

  // Calculations (using Remaining Amount after partial settlements)
  const pendingLent = safeRecords
    .filter((r) => r && r.type === 'lent' && r.status !== 'settled')
    .reduce((sum, r) => sum + getRemainingAmount(r), 0);

  const pendingBorrowed = safeRecords
    .filter((r) => r && r.type === 'borrowed' && r.status !== 'settled')
    .reduce((sum, r) => sum + getRemainingAmount(r), 0);

  const netBalance = pendingLent - pendingBorrowed;

  // Filtered list
  const filteredRecords = safeRecords.filter((r) => {
    if (!r) return false;
    const matchesFilter =
      filter === 'all'
        ? r.status !== 'settled'
        : filter === 'settled'
        ? r.status === 'settled'
        : r.type === filter && r.status !== 'settled';

    const matchesSearch =
      (r.personName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  // Grouped by person
  const groupedByPerson = React.useMemo(() => {
    const map: Record<string, {
      displayName: string;
      totalLent: number;
      totalBorrowed: number;
      netDue: number;
      entries: UdhaarRecord[];
      pendingCount: number;
    }> = {};

    for (const r of filteredRecords) {
      const key = (r.personName || 'Unknown').trim().toLowerCase();
      if (!map[key]) {
        map[key] = {
          displayName: r.personName.trim(),
          totalLent: 0,
          totalBorrowed: 0,
          netDue: 0,
          entries: [],
          pendingCount: 0,
        };
      }
      const remAmt = getRemainingAmount(r);
      if (r.status !== 'settled') {
        map[key].pendingCount++;
        if (r.type === 'lent') {
          map[key].totalLent += remAmt;
        } else {
          map[key].totalBorrowed += remAmt;
        }
      }
      map[key].netDue = map[key].totalLent - map[key].totalBorrowed;
      map[key].entries.push(r);
    }

    const list = Object.values(map);
    list.sort((a, b) => Math.abs(b.netDue) - Math.abs(a.netDue));
    return list;
  }, [filteredRecords]);

  const togglePersonExpand = (key: string) => {
    setExpandedPeople(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleOpenSettleModal = (item: UdhaarRecord) => {
    const rem = getRemainingAmount(item);
    setSettlingRecord(item);
    setSettleModeInput('full');
    setSettleAmountInput(String(rem || item.amount));
    setSettleOriginAccountInput(item.account || 'AX Bank');
    const preferredAcc = item.account && ALL_ACCOUNTS.some(a => a.id === item.account && (a.type === 'bank_account' || a.type === 'cash'))
      ? item.account
      : isWifeCardAccount(item.account)
      ? 'Wife Account'
      : 'AX Bank';
    setSettleAccountInput(preferredAcc);
    setSettleDateInput(new Date().toISOString().split('T')[0]);
    setSettleNotesInput('');
  };

  const handleConfirmSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingRecord || !handleSettle) return;
    const rem = getRemainingAmount(settlingRecord);
    const parsedAmt = parseFloat(settleAmountInput);
    if (isNaN(parsedAmt) || parsedAmt <= 0) return;

    setIsSettlingRecord(true);
    try {
      await handleSettle(settlingRecord.id, {
        amountSettled: Math.min(rem, parsedAmt),
        originAccount: settleOriginAccountInput || settlingRecord.account,
        settleAccount: settleAccountInput || 'AX Bank',
        settleDate: settleDateInput || new Date().toISOString().split('T')[0],
        notes: settleNotesInput.trim() || undefined,
      });
      setSettlingRecord(null);
    } catch (err) {
      console.error('Error settling udhaar:', err);
    } finally {
      setIsSettlingRecord(false);
    }
  };

  const handleReopenRecord = async (item: UdhaarRecord) => {
    if (!handleUpdate) return;
    await handleUpdate(item.id, { status: 'pending' });
  };

  const handleOpenEditRecord = (item: UdhaarRecord) => {
    setEditingRecord(item);
    setEditPersonName(item.personName || '');
    setEditAmount(String(item.amount || ''));
    setEditType(item.type || 'lent');
    setEditDate(item.date || new Date().toISOString().split('T')[0]);
    setEditDescription(item.description || '');
    setEditAccount((item.account as AccountId) || 'Cash');
  };

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord || !handleUpdate) return;
    const parsedAmt = parseFloat(editAmount);
    if (!editPersonName.trim() || isNaN(parsedAmt) || parsedAmt <= 0) return;

    setIsSavingRecord(true);
    try {
      await handleUpdate(editingRecord.id, {
        personName: editPersonName.trim(),
        amount: parsedAmt,
        type: editType,
        date: editDate || new Date().toISOString().split('T')[0],
        description: editDescription.trim() || undefined,
        account: editAccount,
      });
      setEditingRecord(null);
    } catch (err) {
      console.error('Error updating udhaar record:', err);
    } finally {
      setIsSavingRecord(false);
    }
  };

  const setQuickDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setEditDate(`${yyyy}-${mm}-${dd}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personName.trim() || !amount || parseFloat(amount) <= 0 || !handleAdd) return;

    setIsSubmitting(true);
    try {
      await handleAdd({
        userId: '',
        personName: personName.trim(),
        amount: parseFloat(amount),
        type,
        account,
        description: description.trim() || undefined,
        date: date || new Date().toISOString().split('T')[0],
        status: 'pending',
      });
      setPersonName('');
      setAmount('');
      setDescription('');
      setAccount('Cash');
      setIsAddModalOpen(false);
    } catch (err) {
      console.error('Error adding udhaar:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShareWhatsApp = (personName: string, netDue: number, entries: UdhaarRecord[] = []) => {
    const isLena = netDue > 0;
    const absAmt = Math.abs(netDue).toLocaleString('en-IN');

    // Filter pending non-settled entries
    const pendingEntries = entries.filter((e) => e.status !== 'settled');
    const sorted = [...pendingEntries].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    let detailsList = '';
    if (sorted.length > 0) {
      detailsList = sorted
        .map((e) => {
          const rem = getRemainingAmount(e);
          const settledAmt = Number(e.settledAmount) || 0;
          const amtStr = `₹${rem.toLocaleString('en-IN')}`;
          const partialNote = settledAmt > 0 ? ` (Kul ₹${(Number(e.amount) || 0).toLocaleString('en-IN')} me ₹${settledAmt.toLocaleString('en-IN')} mila)` : '';
          const descStr = e.description ? ` (${e.description})` : '';
          const typeNote = e.type === 'borrowed' ? ' [Liya/Adjust]' : '';
          return `• ${e.date || 'N/A'}: ${amtStr}${partialNote}${descStr}${typeNote}`;
        })
        .join('\n');
    } else {
      detailsList = `• Kul Bakaya: ₹${absAmt}`;
    }

    const text = isLena
      ? `Hi ${personName}, Namaskar -\n\nMere TeleExpense AI ledger me aapko diya gaya udhar bakaya hai jiski details:\n\n📅 Date-wise Details:\n${detailsList}\n\n💰 Kul Bakaya Raqam (Total Due): ₹${absAmt}\n\nPlease check kare or apna udhar amount settle kare. 🙏`
      : `Hi ${personName}, Namaskar -\n\nTeleExpense khata ke mutabik mujhe aapko kul ₹${absAmt} chukana hai. Main jald hi hisaab clear kar dunga!\n\nDhanyawad! 🙏`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleShareWhatsAppSingle = (record: UdhaarRecord) => {
    const rem = record.status === 'settled' ? (Number(record.amount) || 0) : getRemainingAmount(record);
    const amtStr = `₹${rem.toLocaleString('en-IN')}`;
    const descStr = record.description ? ` (${record.description})` : '';
    const dateStr = record.date || 'N/A';

    const text = record.type === 'lent'
      ? `Hi ${record.personName}, Namaskar -\n\nMere TeleExpense AI ledger me aapko diya gaya udhar bakaya hai jiski details:\n\n📅 Date-wise Details:\n• ${dateStr}: ${amtStr}${descStr}\n\n💰 Kul Bakaya Raqam (Total Due): ${amtStr}\n\nPlease check kare or apna udhar amount settle kare. 🙏`
      : `Hi ${record.personName}, Namaskar -\n\nTeleExpense khata ke mutabik mujhe aapka tareeq ${dateStr} ka ${amtStr}${descStr} chukana hai. Main jald hi hisaab clear kar dunga!\n\nDhanyawad! 🙏`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const formatAmount = (val: number) => {
    if (isPrivacyMode) return '₹••••';
    return `₹${val.toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Hero Summary with Glassy Aesthetics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* You'll Get (Lena Hai) */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 relative overflow-hidden border border-emerald-500/20 bg-emerald-950/15 shadow-lg shadow-emerald-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Lena Hai (You'll Get)
            </span>
            <div className="icon-badge icon-badge-emerald">
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-white mt-2 font-mono drop-shadow-sm">
            {formatAmount(pendingLent)}
          </p>
          <p className="text-xs text-emerald-300/70 mt-1">
            {safeRecords.filter(r => r && r.type === 'lent' && r.status !== 'settled').length} logo se wapas lena hai
          </p>
        </div>

        {/* You'll Give (Dena Hai) */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 relative overflow-hidden border border-rose-500/20 bg-rose-950/15 shadow-lg shadow-rose-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
              Dena Hai (You'll Give)
            </span>
            <div className="icon-badge icon-badge-rose">
              <ArrowUpRight className="w-4 h-4 text-rose-400" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-white mt-2 font-mono drop-shadow-sm">
            {formatAmount(pendingBorrowed)}
          </p>
          <p className="text-xs text-rose-300/70 mt-1">
            {safeRecords.filter(r => r && r.type === 'borrowed' && r.status !== 'settled').length} logo ko chukana hai
          </p>
        </div>

        {/* Net Udhaar Status */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 relative overflow-hidden border border-indigo-500/20 bg-indigo-950/15 shadow-lg shadow-indigo-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
              Net Udhaar Position
            </span>
            <div className="icon-badge icon-badge-indigo">
              <HandCoins className="w-4 h-4 text-indigo-400" />
            </div>
          </div>
          <p className={`text-2xl sm:text-3xl font-bold mt-2 font-mono drop-shadow-sm ${netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPrivacyMode ? '₹••••' : `${netBalance >= 0 ? '+' : ''}₹${netBalance.toLocaleString('en-IN')}`}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {netBalance >= 0 ? 'Aapka market me surplus hai' : 'Aapko kul itna dena baaki hai'}
          </p>
        </div>
      </div>

      {/* Telegram Tip Banner */}
      <div className="glass-card rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-300">
        <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
          <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold text-[10px] uppercase tracking-wider">
            TELEGRAM KHATA
          </span>
          <span className="text-slate-300">
            Telegram par sidhe bhejein: <code className="bg-black/40 px-1.5 py-0.5 rounded text-indigo-300 border border-white/[0.06]">2000 diya Jiju ko</code> ya <code className="bg-black/40 px-1.5 py-0.5 rounded text-indigo-300 border border-white/[0.06]">date change Jiju 14 Sep</code>
          </span>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer shadow-md shadow-indigo-600/30 transition-all shrink-0 active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Naya Udhaar Likhein</span>
        </button>
      </div>

      {/* Controls Bar: View Switcher, Filter Pills & Search */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        
        {/* Left: View Mode Toggle */}
        <div className="flex items-center space-x-1 bg-white/[0.04] p-1 rounded-xl border border-white/[0.08] backdrop-blur-md shrink-0">
          <button
            onClick={() => setViewMode('grouped')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
              viewMode === 'grouped'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Ek Naam Ka Combined Summary</span>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
              viewMode === 'list'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Saare Transactions</span>
          </button>
        </div>

        {/* Middle: Filter Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar bg-white/[0.04] p-1 rounded-xl border border-white/[0.08] backdrop-blur-md">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              filter === 'all'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Pending ({safeRecords.filter(r => r.status !== 'settled').length})
          </button>
          <button
            onClick={() => setFilter('lent')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              filter === 'lent'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Lena Hai ({safeRecords.filter(r => r.type === 'lent' && r.status !== 'settled').length})
          </button>
          <button
            onClick={() => setFilter('borrowed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              filter === 'borrowed'
                ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Dena Hai ({safeRecords.filter(r => r.type === 'borrowed' && r.status !== 'settled').length})
          </button>
          <button
            onClick={() => setFilter('settled')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              filter === 'settled'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Settled ({safeRecords.filter(r => r.status === 'settled').length})
          </button>
        </div>

        {/* Right: Search Field */}
        <div className="relative min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Naam ya reason dhundhein..."
            className="w-full pl-9 pr-3 py-1.5 glass-input rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
          />
        </div>
      </div>

      {/* Main Ledger Content */}
      {filteredRecords.length === 0 ? (
        <div className="bg-[#0e1526] rounded-2xl border border-slate-800 p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <HandCoins className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-white">Koi Udhaar Record Nahi Mila</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {filter === 'settled'
              ? 'Abhi tak koi settled transaction nahi hai.'
              : 'Naya khata jodne ke liye upar "Naya Udhaar Likhein" button dabayein ya Telegram par "2000 diya Jiju ko 14th Sep" bhejein.'}
          </p>
        </div>
      ) : viewMode === 'grouped' ? (
        /* 👥 Grouped By Person View (Ek naam ki saari entries combine) */
        <div className="space-y-4">
          {groupedByPerson.map((group) => {
            const key = group.displayName.toLowerCase();
            const isExpanded = Boolean(expandedPeople[key]);
            const isLena = group.netDue > 0;
            const isDena = group.netDue < 0;

            return (
              <div
                key={key}
                className={`rounded-2xl border transition-all ${
                  group.pendingCount === 0
                    ? 'bg-slate-900/40 border-slate-800/80'
                    : isLena
                    ? 'bg-[#0c1626] border-emerald-500/30 hover:border-emerald-500/50'
                    : isDena
                    ? 'bg-[#180f1e] border-rose-500/30 hover:border-rose-500/50'
                    : 'bg-[#0e1526] border-slate-800'
                } shadow-md overflow-hidden`}
              >
                {/* Person Header Card */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-3.5">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-base shrink-0 ${
                        group.pendingCount === 0
                          ? 'bg-slate-800 text-slate-400'
                          : isLena
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {group.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-white flex items-center gap-2">
                        {group.displayName}
                        {group.pendingCount === 0 && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                            Hisab Barabar
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>{group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'} kul</span>
                        <span>•</span>
                        <span className="text-indigo-300 font-medium">
                          {group.pendingCount} pending
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Net Summary & Action Buttons */}
                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4">
                    <div className="text-left sm:text-right">
                      <p
                        className={`text-xl sm:text-2xl font-black font-mono ${
                          group.pendingCount === 0
                            ? 'text-slate-400'
                            : isLena
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {formatAmount(Math.abs(group.netDue))}
                      </p>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md inline-block mt-0.5 ${
                          group.pendingCount === 0
                            ? 'bg-slate-800 text-slate-400'
                            : isLena
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {group.pendingCount === 0 ? 'Clear' : isLena ? 'Net Lena Hai' : 'Net Dena Hai'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {group.pendingCount > 0 && isLena && (
                        <button
                          onClick={() => handleShareWhatsApp(group.displayName, group.netDue, group.entries)}
                          className="p-2 rounded-xl bg-emerald-950/70 hover:bg-emerald-900 text-emerald-400 border border-emerald-500/30 cursor-pointer transition-colors"
                          title="WhatsApp par Total Reminder bhejein"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => togglePersonExpand(key)}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-all border border-slate-700"
                      >
                        <span>{isExpanded ? 'Chhupayein' : 'Entries Dekhein'}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sub-entries Breakdown */}
                {isExpanded && (
                  <div className="border-t border-slate-800/80 bg-slate-950/50 p-4 space-y-2.5">
                    <div className="flex items-center justify-between text-xs text-slate-400 px-1 mb-1">
                      <span className="font-semibold text-slate-300">
                        {group.displayName} Ki Saari Tareeq-Vaar Entries:
                      </span>
                      <span>Tareeq badalne ke liye 📅 button dabayein</span>
                    </div>

                    {group.entries.map((item) => {
                      const itemIsLent = item.type === 'lent';
                      const itemIsSettled = item.status === 'settled';
                      const settledAmt = Math.max(0, Number(item.settledAmount) || 0);
                      const remainingAmt = getRemainingAmount(item);
                      const isPartial = !itemIsSettled && settledAmt > 0;
                      const pctSettled = item.amount > 0 ? Math.min(100, Math.round((settledAmt / item.amount) * 100)) : 0;

                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl p-3 border transition-all flex flex-col gap-2 ${
                            itemIsSettled
                              ? 'bg-slate-900/30 border-slate-800/60 opacity-70'
                              : itemIsLent
                              ? 'bg-[#0c192c] border-emerald-500/20'
                              : 'bg-[#22101e] border-rose-500/20'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                            <div className="flex items-center space-x-3">
                              <div className="text-left">
                                <div className="flex items-center flex-wrap gap-1.5">
                                  <span className={`text-xs font-bold font-mono ${itemIsSettled ? 'text-slate-400 line-through' : itemIsLent ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {itemIsLent ? '+ ' : '- '}{formatAmount(isPartial ? remainingAmt : item.amount)}
                                  </span>
                                  {isPartial && (
                                    <span className="text-[10px] font-mono text-slate-400">
                                      (Kul {formatAmount(item.amount)})
                                    </span>
                                  )}
                                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${itemIsLent ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'}`}>
                                    {itemIsLent ? 'Diya Tha' : 'Liya Tha'}
                                  </span>
                                  {isPartial && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                                      Partial: {formatAmount(settledAmt)} {itemIsLent ? 'Mila' : 'Chukaya'}
                                    </span>
                                  )}
                                  {itemIsSettled && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                      Settled {item.settledInAccount ? `(${item.settledInAccount})` : ''}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5 mt-1">
                                  <Calendar className="w-3 h-3 text-indigo-400" />
                                  <span className="font-medium text-slate-300">{item.date}</span>
                                  {item.time && <span>• {item.time}</span>}
                                  {item.account && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-slate-800/90 text-indigo-300 border border-indigo-500/20">
                                      {isWifeOwnedAccount(item.account) ? '👩 ' : '💳 '}{item.account}
                                    </span>
                                  )}
                                  {itemIsLent && isWifeCardAccount(item.account) && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-pink-500/20 text-pink-300 border border-pink-500/35">
                                      Wife Card • Outflow Excluded
                                    </span>
                                  )}
                                  {item.description && <span className="text-slate-400 italic">({item.description})</span>}
                                </p>
                              </div>
                            </div>

                            {/* Individual Entry Actions */}
                            <div className="flex items-center flex-wrap gap-1.5 self-end sm:self-center">
                              {!itemIsSettled && itemIsLent && (
                                <button
                                  onClick={() => handleShareWhatsAppSingle(item)}
                                  className="px-2 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 text-emerald-400 border border-emerald-500/30 text-[11px] font-medium flex items-center space-x-1 cursor-pointer transition-colors"
                                  title="WhatsApp par reminder bhejein"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  <span>Remind</span>
                                </button>
                              )}

                              <button
                                onClick={() => handleOpenEditRecord(item)}
                                className="px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium flex items-center space-x-1 cursor-pointer transition-colors shadow-sm"
                                title="Raqam, naam ya date badlein"
                              >
                                <Pencil className="w-3 h-3 text-indigo-400" />
                                <span>Edit</span>
                              </button>

                              {!itemIsSettled && handleSettle && (
                                <button
                                  onClick={() => handleOpenSettleModal(item)}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium flex items-center space-x-1 cursor-pointer transition-all shadow-sm active:scale-95"
                                  title="Partial ya full amount settle karein aur account chunein"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>{isPartial ? 'Baki Settle' : 'Settle'}</span>
                                </button>
                              )}

                              {(itemIsSettled || isPartial) && handleUpdate && (
                                <button
                                  onClick={() => handleReopenRecord(item)}
                                  className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-medium flex items-center space-x-1 cursor-pointer transition-colors"
                                  title="Reset & Reopen full amount"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Reopen</span>
                                </button>
                              )}

                              {handleDelete && (
                                <button
                                  onClick={() => handleDelete(item.id)}
                                  className="p-1 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Partial Settlement Progress & History */}
                          {isPartial && (
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pctSettled}%` }} />
                            </div>
                          )}
                          {Array.isArray(item.settlementHistory) && item.settlementHistory.length > 0 && (
                            <div className="text-[10px] text-slate-400 bg-slate-900/60 border border-white/[0.05] rounded-lg px-2.5 py-1.5 space-y-0.5">
                              <span className="font-semibold text-slate-300 block">Settlement History:</span>
                              {item.settlementHistory.map((sh) => (
                                <div key={sh.id} className="flex items-center justify-between font-mono">
                                  <span>• {sh.date} • {sh.account}{sh.notes ? ` (${sh.notes})` : ''}</span>
                                  <span className="text-emerald-400 font-bold">₹{(Number(sh.amount) || 0).toLocaleString('en-IN')}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* 📄 Flat List View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredRecords.map((item) => {
            const isLent = item.type === 'lent';
            const isSettled = item.status === 'settled';
            const settledAmt = Math.max(0, Number(item.settledAmount) || 0);
            const remainingAmt = getRemainingAmount(item);
            const isPartial = !isSettled && settledAmt > 0;
            const pctSettled = item.amount > 0 ? Math.min(100, Math.round((settledAmt / item.amount) * 100)) : 0;

            return (
              <div
                key={item.id}
                className={`rounded-2xl p-4 border transition-all ${
                  isSettled
                    ? 'bg-slate-900/40 border-slate-800/80 opacity-75'
                    : isLent
                    ? 'bg-[#0c1626] border-emerald-500/30 hover:border-emerald-500/50'
                    : 'bg-[#180f1e] border-rose-500/30 hover:border-rose-500/50'
                } shadow-md flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                          isSettled
                            ? 'bg-slate-800 text-slate-400'
                            : isLent
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {item.personName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-white flex items-center flex-wrap gap-1.5">
                          {item.personName}
                          {isSettled && (
                            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                              Settled {item.settledInAccount ? `• ${item.settledInAccount}` : ''}
                            </span>
                          )}
                          {isPartial && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Partial ({pctSettled}%)
                            </span>
                          )}
                        </h4>
                        <p className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{item.date}</span>
                          {item.time && <span>• {item.time}</span>}
                          {item.account && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-slate-800/90 text-indigo-300 border border-indigo-500/20">
                              {isWifeOwnedAccount(item.account) ? '👩 ' : '💳 '}{item.account}
                            </span>
                          )}
                          {isLent && isWifeCardAccount(item.account) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-pink-500/20 text-pink-300 border border-pink-500/35">
                              Wife Card • Outflow Excluded
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p
                        className={`text-base font-bold font-mono ${
                          isSettled
                            ? 'text-slate-400 line-through'
                            : isLent
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {isLent ? '+' : '-'} {formatAmount(isPartial ? remainingAmt : item.amount)}
                      </p>
                      {isPartial ? (
                        <span className="text-[10px] text-amber-300 font-mono block">
                          Mila: {formatAmount(settledAmt)} / {formatAmount(item.amount)}
                        </span>
                      ) : (
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider ${
                            isLent ? 'text-emerald-400/80' : 'text-rose-400/80'
                          }`}
                        >
                          {isLent ? 'Lena Hai' : 'Dena Hai'}
                        </span>
                      )}
                    </div>
                  </div>

                  {isPartial && (
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2.5">
                      <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pctSettled}%` }} />
                    </div>
                  )}

                  {item.description && (
                    <p className="text-xs text-slate-300 mt-2.5 bg-slate-950/60 p-2 rounded-xl border border-slate-800/60">
                      📝 {item.description}
                    </p>
                  )}

                  {Array.isArray(item.settlementHistory) && item.settlementHistory.length > 0 && (
                    <div className="mt-2 text-[10px] text-slate-400 bg-slate-950/60 border border-slate-800/80 rounded-xl p-2 space-y-0.5">
                      <span className="font-semibold text-slate-300 block">Settlement History:</span>
                      {item.settlementHistory.map((sh) => (
                        <div key={sh.id} className="flex items-center justify-between font-mono">
                          <span>• {sh.date} • {sh.account}{sh.notes ? ` (${sh.notes})` : ''}</span>
                          <span className="text-emerald-400 font-bold">₹{(Number(sh.amount) || 0).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-800/80 text-xs">
                  <div className="flex items-center flex-wrap gap-1.5">
                    <button
                      onClick={() => handleOpenEditRecord(item)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 flex items-center space-x-1 cursor-pointer transition-colors shadow-sm"
                      title="Raqam, naam ya date badlein"
                    >
                      <Pencil className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-[11px] font-medium hidden sm:inline">Edit</span>
                    </button>

                    {!isSettled && isLent && (
                      <button
                        onClick={() => handleShareWhatsAppSingle(item)}
                        className="p-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1 cursor-pointer transition-colors"
                        title="WhatsApp Reminder Bhejein"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span className="text-[11px] hidden sm:inline">Remind</span>
                      </button>
                    )}
                    {!isSettled && handleSettle && (
                      <button
                        onClick={() => handleOpenSettleModal(item)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center space-x-1 cursor-pointer transition-all active:scale-95 shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isPartial ? 'Baki Settle' : isLent ? 'Wapas Mil Gaya' : 'Chuka Diya'}</span>
                      </button>
                    )}
                    {(isSettled || isPartial) && handleUpdate && (
                      <button
                        onClick={() => handleReopenRecord(item)}
                        className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 flex items-center space-x-1 cursor-pointer transition-colors text-[11px]"
                        title="Reopen & Reset settlements"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reopen</span>
                      </button>
                    )}
                  </div>

                  {handleDelete && (
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Delete Entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ✏️ Full Record Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-950/95 border border-white/[0.15] p-6 shadow-2xl text-slate-100 backdrop-blur-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Pencil className="w-5 h-5 text-indigo-400" />
              <span>Udhaar Entry Edit / Badlein</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Raqam, vyakti ka naam, tareeq ya note me badlav karein:
            </p>

            <form onSubmit={handleSaveRecord} className="mt-4 space-y-3.5">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-white/[0.04] rounded-xl border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setEditType('lent')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    editType === 'lent'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>Diya (Lena Hai)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditType('borrowed')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    editType === 'borrowed'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Liya (Dena Hai)</span>
                </button>
              </div>

              {/* Person Name */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Vyakti Ka Naam (Person Name) *
                </label>
                <input
                  type="text"
                  required
                  value={editPersonName}
                  onChange={(e) => setEditPersonName(e.target.value)}
                  className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400"
                  placeholder="e.g. Jiju, Rohan, Papa"
                />
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Raqam (Amount ₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-400"
                    placeholder="2000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tareeq (Date) *
                  </label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              {/* Quick Date Chips */}
              <div>
                <p className="text-[11px] text-slate-400 mb-1.5">Quick Date Select:</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickDate(0)}
                    className="py-1.5 px-2 bg-white/[0.05] hover:bg-white/[0.1] text-xs text-slate-200 rounded-lg border border-white/[0.08] font-medium transition-colors cursor-pointer"
                  >
                    🟢 Aaj
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDate(-1)}
                    className="py-1.5 px-2 bg-white/[0.05] hover:bg-white/[0.1] text-xs text-slate-200 rounded-lg border border-white/[0.08] font-medium transition-colors cursor-pointer"
                  >
                    🟡 Kal
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDate(-2)}
                    className="py-1.5 px-2 bg-white/[0.05] hover:bg-white/[0.1] text-xs text-slate-200 rounded-lg border border-white/[0.08] font-medium transition-colors cursor-pointer"
                  >
                    🟠 Parso
                  </button>
                </div>
              </div>

              {/* Description / Reason */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Vivaran (Description / Reason)
                </label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="e.g. 2000 diya jiju ko"
                  className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400"
                />
              </div>

              {/* Account / Card / Cash Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Kahan Se Diya / Liya (Account / Card / Cash)
                </label>
                <select
                  value={editAccount}
                  onChange={(e) => setEditAccount(e.target.value as AccountId)}
                  className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400 bg-slate-900 cursor-pointer"
                >
                  {ALL_ACCOUNTS.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-slate-900 text-white">
                      {acc.badge}: {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 rounded-xl border border-white/[0.1] bg-white/[0.05] text-slate-300 text-xs font-medium hover:bg-white/[0.1] cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRecord}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-600/30 disabled:opacity-50 active:scale-95"
                >
                  {isSavingRecord ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Udhaar Record Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-950/95 border border-white/[0.15] p-6 shadow-2xl text-slate-100 backdrop-blur-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <div className="icon-badge icon-badge-indigo">
                <HandCoins className="w-4 h-4 text-indigo-400" />
              </div>
              <span>Naya Udhaar / Khata Entry</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Kisko paisa diya ya kisse udhaar liya, uska hisaab yahan darj karein.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-white/[0.04] rounded-xl border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setType('lent')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    type === 'lent'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>Diya (Lena Hai)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('borrowed')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    type === 'borrowed'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Liya (Dena Hai)</span>
                </button>
              </div>

              {/* Person Name */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Vyakti ka Naam (Person Name) *
                </label>
                <input
                  type="text"
                  required
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  placeholder="e.g. Rohan, Papa, Sharma Ji, Jiju"
                  className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400"
                />
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Raqam (Amount ₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="2000"
                    className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tareeq (Date)
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400 font-mono"
                  />
                </div>
              </div>

              {/* Description / Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Vivaran (Description / Reason)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Lunch bill split, petrol udhaar, emergency"
                  className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400"
                />
              </div>

              {/* Account / Card / Cash Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Kahan Se Diya / Liya (Account / Card / Cash)
                </label>
                <select
                  value={account}
                  onChange={(e) => setAccount(e.target.value as AccountId)}
                  className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400 bg-slate-900 cursor-pointer"
                >
                  {ALL_ACCOUNTS.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-slate-900 text-white">
                      {acc.badge}: {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-white/[0.1] bg-white/[0.05] text-slate-300 text-xs font-medium hover:bg-white/[0.1] cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-600/30 disabled:opacity-50 active:scale-95"
                >
                  {isSubmitting ? 'Saving...' : 'Save Udhaar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 💰 Settle Udhaar Modal (Partial/Full Amount + Select Bank/Cash/Card Account) */}
      {settlingRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSettlingRecord(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-slate-950/95 border border-indigo-500/40 p-6 shadow-2xl text-slate-100 backdrop-blur-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>
                {settlingRecord.type === 'lent' ? 'Udhaar Wapas Aaya (Settle)' : 'Udhaar Chukaya (Pay Back)'}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {settlingRecord.personName} • Kul ₹{(Number(settlingRecord.amount) || 0).toLocaleString('en-IN')} me se ab{' '}
              <strong className="text-amber-300">₹{getRemainingAmount(settlingRecord).toLocaleString('en-IN')} baki</strong> hai.
            </p>

            <form onSubmit={handleConfirmSettle} className="mt-4 space-y-4">
              {/* Full / Partial Mode Switcher */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 border border-white/[0.08] rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setSettleModeInput('full');
                    setSettleAmountInput(String(getRemainingAmount(settlingRecord)));
                  }}
                  className={`py-1.5 px-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    settleModeInput === 'full'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ✅ Full Settle
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettleModeInput('partial');
                    const rem = getRemainingAmount(settlingRecord);
                    if (Number(settleAmountInput) >= rem) {
                      setSettleAmountInput(String(Math.max(1, Math.round(rem / 2))));
                    }
                  }}
                  className={`py-1.5 px-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    settleModeInput === 'partial'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ✂️ Partial Settle
                </button>
              </div>

              {/* Amount to Settle + Quick Percentage Chips */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    Kitni Raqam Settle Karni Hai (₹) *
                  </label>
                  <span className="text-[10px] font-mono text-amber-300">
                    Max Baki: ₹{getRemainingAmount(settlingRecord).toLocaleString('en-IN')}
                  </span>
                </div>
                <input
                  type="number"
                  required
                  min="1"
                  max={getRemainingAmount(settlingRecord)}
                  step="any"
                  value={settleAmountInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSettleAmountInput(v);
                    const rem = getRemainingAmount(settlingRecord);
                    setSettleModeInput(Number(v) >= rem ? 'full' : 'partial');
                  }}
                  className="w-full px-3 py-2 glass-input rounded-xl text-sm font-bold text-white font-mono focus:outline-none focus:border-emerald-400"
                  autoFocus
                />
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[
                    { label: '25%', pct: 0.25 },
                    { label: '50% (Aadha)', pct: 0.5 },
                    { label: 'Full Baki', pct: 1 },
                  ].map((chip) => {
                    const rem = getRemainingAmount(settlingRecord);
                    const val = chip.pct === 1 ? rem : Math.max(1, Math.round(rem * chip.pct));
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          setSettleAmountInput(String(val));
                          setSettleModeInput(chip.pct === 1 ? 'full' : 'partial');
                        }}
                        className="py-1.5 px-2 rounded-lg bg-white/[0.05] hover:bg-indigo-600/30 border border-white/[0.08] hover:border-indigo-400/50 text-[11px] font-mono text-slate-200 cursor-pointer transition-colors"
                      >
                        {chip.label} (₹{val.toLocaleString('en-IN')})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Account Route: Kis Account Se -> Kis Account Me */}
              <div className="p-3 rounded-xl bg-slate-900/80 border border-indigo-500/25 space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-cyan-400" />
                  Account Route (Kis Account Se → Kis Account Me)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      {settlingRecord.type === 'lent'
                        ? 'Kis Account Se Diya Tha (From)'
                        : 'Kis Account Me Liya Tha (Origin)'}
                    </label>
                    <select
                      value={settleOriginAccountInput}
                      onChange={(e) => setSettleOriginAccountInput(e.target.value)}
                      className="w-full px-2.5 py-2 glass-input rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400 bg-slate-950 cursor-pointer font-mono"
                    >
                      <optgroup label="Bank Accounts & Cash" className="bg-slate-950 text-emerald-300">
                        {ALL_ACCOUNTS.filter(a => a.type === 'bank_account' || a.type === 'cash').map((acc) => (
                          <option key={acc.id} value={acc.id} className="bg-slate-900 text-white">
                            {isWifeOwnedAccount(acc.id) ? '👩 ' : ''}{acc.shortName}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Credit & RuPay Cards" className="bg-slate-950 text-sky-300">
                        {ALL_ACCOUNTS.filter(a => a.type === 'credit_card' || a.type === 'rupay_card').map((acc) => (
                          <option key={acc.id} value={acc.id} className="bg-slate-900 text-white">
                            {isWifeOwnedAccount(acc.id) ? '👩 ' : ''}{acc.shortName}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-cyan-300 mb-1">
                      {settlingRecord.type === 'lent'
                        ? 'Kis Account Me Aaya? (To) *'
                        : 'Kis Account Se Chukaya? (From) *'}
                    </label>
                    <select
                      value={settleAccountInput}
                      onChange={(e) => setSettleAccountInput(e.target.value)}
                      className="w-full px-2.5 py-2 glass-input rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 bg-slate-950 cursor-pointer font-mono"
                    >
                      <optgroup label="Bank Accounts & Cash" className="bg-slate-950 text-emerald-300">
                        {ALL_ACCOUNTS.filter(a => a.type === 'bank_account' || a.type === 'cash').map((acc) => (
                          <option key={acc.id} value={acc.id} className="bg-slate-900 text-white">
                            {isWifeOwnedAccount(acc.id) ? '👩 ' : ''}{acc.shortName} ({acc.badge})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Credit & RuPay Cards" className="bg-slate-950 text-sky-300">
                        {ALL_ACCOUNTS.filter(a => a.type === 'credit_card' || a.type === 'rupay_card').map((acc) => (
                          <option key={acc.id} value={acc.id} className="bg-slate-900 text-white">
                            {isWifeOwnedAccount(acc.id) ? '👩 ' : ''}{acc.shortName} ({acc.badge})
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  {settlingRecord.type === 'lent'
                    ? `Route: ${settleOriginAccountInput} (Udhaar Diya) → ${settleAccountInput} me credit hoga.`
                    : `Route: ${settleAccountInput} se debit hokar Udhaar chukaya record hoga.`}
                </p>
              </div>

              {/* Date & Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Settlement Tareeq
                  </label>
                  <input
                    type="date"
                    value={settleDateInput}
                    onChange={(e) => setSettleDateInput(e.target.value)}
                    className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-400"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={settleNotesInput}
                    onChange={(e) => setSettleNotesInput(e.target.value)}
                    placeholder="e.g. GPay / Cash"
                    className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setSettlingRecord(null)}
                  className="px-4 py-2 rounded-xl border border-white/[0.1] bg-white/[0.05] text-slate-300 text-xs font-medium hover:bg-white/[0.1] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSettlingRecord}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSettlingRecord ? 'Settling...' : '✅ Confirm & Settle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
