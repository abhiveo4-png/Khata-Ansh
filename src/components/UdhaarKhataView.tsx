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
  Filter,
  UserCheck,
  Send
} from 'lucide-react';
import { UdhaarRecord } from '../types';

interface UdhaarKhataViewProps {
  records?: UdhaarRecord[];
  isPrivacyMode?: boolean;
  onAddRecord?: (record: Omit<UdhaarRecord, 'id' | 'createdAt'>) => Promise<void>;
  onSettleRecord?: (id: string) => Promise<void>;
  onDeleteRecord?: (id: string) => Promise<void>;
}

export const UdhaarKhataView: React.FC<UdhaarKhataViewProps> = ({
  records = [],
  isPrivacyMode = false,
  onAddRecord,
  onSettleRecord,
  onDeleteRecord,
}) => {
  const safeRecords = Array.isArray(records) ? records : [];
  const [filter, setFilter] = useState<'all' | 'lent' | 'borrowed' | 'settled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form State
  const [personName, setPersonName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'lent' | 'borrowed'>('lent');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculations
  const pendingLent = safeRecords
    .filter((r) => r && r.type === 'lent' && r.status !== 'settled')
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  const pendingBorrowed = safeRecords
    .filter((r) => r && r.type === 'borrowed' && r.status !== 'settled')
    .reduce((sum, r) => sum + (r.amount || 0), 0);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personName.trim() || !amount || parseFloat(amount) <= 0) return;

    setIsSubmitting(true);
    try {
      await onAddRecord({
        userId: '',
        personName: personName.trim(),
        amount: parseFloat(amount),
        type,
        description: description.trim() || undefined,
        date: date || new Date().toISOString().split('T')[0],
        status: 'pending',
      });
      setPersonName('');
      setAmount('');
      setDescription('');
      setIsAddModalOpen(false);
    } catch (err) {
      console.error('Error adding udhaar:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShareWhatsApp = (record: UdhaarRecord) => {
    const text = `Namaste ${record.personName}, TeleExpense par aapka ₹${record.amount.toLocaleString('en-IN')} ka hisaab note hai (${record.type === 'lent' ? 'Maine diya tha' : 'Aapse liya tha'}${record.description ? ` - ${record.description}` : ''}). Kripya suvidha anusar check karein! 🙏`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const formatAmount = (val: number) => {
    if (isPrivacyMode) return '₹••••';
    return `₹${val.toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Hero Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* You'll Get (Lena Hai) */}
        <div className="bg-[#0e1526] border border-emerald-500/30 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
              Lena Hai (You'll Get)
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-white mt-2 font-mono">
            {formatAmount(pendingLent)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {safeRecords.filter(r => r && r.type === 'lent' && r.status !== 'settled').length} logo se wapas lena hai
          </p>
        </div>

        {/* You'll Give (Dena Hai) */}
        <div className="bg-[#0e1526] border border-rose-500/30 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-rose-400 uppercase tracking-wider">
              Dena Hai (You'll Give)
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-white mt-2 font-mono">
            {formatAmount(pendingBorrowed)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {safeRecords.filter(r => r && r.type === 'borrowed' && r.status !== 'settled').length} logo ko chukana hai
          </p>
        </div>

        {/* Net Udhaar Status */}
        <div className="bg-[#0e1526] border border-indigo-500/30 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-indigo-400 uppercase tracking-wider">
              Net Udhaar Position
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <HandCoins className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-2xl sm:text-3xl font-bold mt-2 font-mono ${netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPrivacyMode ? '₹••••' : `${netBalance >= 0 ? '+' : ''}₹${netBalance.toLocaleString('en-IN')}`}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {netBalance >= 0 ? 'Aapka market me surplus hai' : 'Aapko kul itna dena baaki hai'}
          </p>
        </div>
      </div>

      {/* Telegram Tip Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-300">
        <div className="flex items-center space-x-2.5">
          <span className="px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-500/30 font-semibold text-[10px]">
            TELEGRAM KHATA
          </span>
          <span>
            Telegram par sidhe bhejein: <code className="bg-slate-950 px-1.5 py-0.5 rounded text-indigo-300">Diya 500 Rohan ko udhaar</code> ya <code className="bg-slate-950 px-1.5 py-0.5 rounded text-indigo-300">Liya 2000 Papa se</code>
          </span>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="w-full sm:w-auto px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer shadow-md transition-all shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Naya Udhaar Likhein</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        
        {/* Filter Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar bg-[#0e1526] p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filter === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Pending ({records.filter(r => r.status !== 'settled').length})
          </button>
          <button
            onClick={() => setFilter('lent')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filter === 'lent'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Lena Hai ({records.filter(r => r.type === 'lent' && r.status !== 'settled').length})
          </button>
          <button
            onClick={() => setFilter('borrowed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filter === 'borrowed'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Dena Hai ({records.filter(r => r.type === 'borrowed' && r.status !== 'settled').length})
          </button>
          <button
            onClick={() => setFilter('settled')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filter === 'settled'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Settled ({records.filter(r => r.status === 'settled').length})
          </button>
        </div>

        {/* Search Field */}
        <div className="relative min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Naam ya description dhundhein..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#0e1526] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Udhaar Ledger Cards */}
      {filteredRecords.length === 0 ? (
        <div className="bg-[#0e1526] rounded-2xl border border-slate-800 p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <HandCoins className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-white">Koi Udhaar Record Nahi Mila</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {filter === 'settled'
              ? 'Abhi tak koi settled transaction nahi hai.'
              : 'Naya khata jodne ke liye upar "Naya Udhaar Likhein" button dabayein ya Telegram par message karein.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredRecords.map((item) => {
            const isLent = item.type === 'lent';
            const isSettled = item.status === 'settled';

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
                        <h4 className="font-semibold text-sm text-white flex items-center gap-1.5">
                          {item.personName}
                          {isSettled && (
                            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                              Settled
                            </span>
                          )}
                        </h4>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{item.date}</span>
                          {item.time && <span>• {item.time}</span>}
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
                        {isLent ? '+' : '-'} {formatAmount(item.amount)}
                      </p>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wider ${
                          isLent ? 'text-emerald-400/80' : 'text-rose-400/80'
                        }`}
                      >
                        {isLent ? 'Lena Hai' : 'Dena Hai'}
                      </span>
                    </div>
                  </div>

                  {item.description && (
                    <p className="text-xs text-slate-300 mt-2.5 bg-slate-950/60 p-2 rounded-xl border border-slate-800/60">
                      📝 {item.description}
                    </p>
                  )}
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-800/80 text-xs">
                  <div className="flex items-center space-x-2">
                    {!isSettled && isLent && (
                      <button
                        onClick={() => handleShareWhatsApp(item)}
                        className="p-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1 cursor-pointer transition-colors"
                        title="WhatsApp Reminder Bhejein"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span className="text-[11px] hidden sm:inline">WhatsApp Remind</span>
                      </button>
                    )}
                    {!isSettled && (
                      <button
                        onClick={() => onSettleRecord(item.id)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center space-x-1 cursor-pointer transition-all active:scale-95"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isLent ? 'Wapas Mil Gaya' : 'Chuka Diya'}</span>
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => onDeleteRecord(item.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Delete Entry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Udhaar Record Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#0e1526] border border-slate-800 p-6 shadow-2xl text-slate-100">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <HandCoins className="w-5 h-5 text-indigo-400" />
              <span>Naya Udhaar / Khata Entry</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Kisko paisa diya ya kisse udhaar liya, uska hisaab yahan likhein.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setType('lent')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    type === 'lent'
                      ? 'bg-emerald-600 text-white shadow-md'
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
                      ? 'bg-rose-600 text-white shadow-md'
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
                  placeholder="e.g. Rohan, Papa, Sharma Ji, Aman"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
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
                    placeholder="500"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
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
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
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
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Udhaar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
