import React, { useState } from 'react';
import { X, Plus, Calendar, Tag, CreditCard, Check, Zap, Building2, Briefcase, Sparkles, HeartHandshake, ShieldCheck } from 'lucide-react';
import { Transaction, TransactionType, PaymentMethod, CategoryDef, AccountId } from '../types';
import { getCurrentDateStr } from '../utils/formatters';
import { ALL_ACCOUNTS, detectAccount, detectReimbursement, detectSavingsTransfer, detectInvestment, detectFamilyTripPooja } from '../utils/accounts';

interface AddTransactionModalProps {
  isOpen: boolean;
  categories: CategoryDef[];
  onClose: () => void;
  onAddTransaction: (tx: Partial<Transaction>) => Promise<void>;
}

const AMOUNT_PRESETS = [100, 200, 500, 1000, 2000, 5000];
const PAYMENT_METHODS: PaymentMethod[] = ['UPI', 'Cash', 'Card', 'Net Banking', 'Bank Transfer', 'UPI/Cash', 'Other'];

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  categories,
  onClose,
  onAddTransaction,
}) => {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food & Dining');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(getCurrentDateStr());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [account, setAccount] = useState<AccountId>('ICICI CC 0000');
  const [isReimbursement, setIsReimbursement] = useState(false);
  const [isSavingsTransfer, setIsSavingsTransfer] = useState(false);
  const [isInvestment, setIsInvestment] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const filteredCategories = categories.filter(
    (c) => c.type === type || c.type === 'both'
  );

  // Smart detection when typing description
  const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDescription(val);

    // Auto-detect account if mentioned in text
    const detectedAcc = detectAccount(val);
    if (detectedAcc) {
      setAccount(detectedAcc);
    }

    // Auto-detect reimbursement (Point 1: Rim / reimburse / claim)
    if (detectReimbursement(val)) {
      setIsReimbursement(true);
      if (categories.some((c) => c.name === 'Reimbursement')) {
        setCategory('Reimbursement');
      }
    }

    // Auto-detect Family Trip & Pooja (Point 4)
    if (detectFamilyTripPooja(val)) {
      if (categories.some((c) => c.name === 'Family Trip & Pooja')) {
        setCategory('Family Trip & Pooja');
      }
    }

    // Auto-detect savings transfer to wife (Point 5)
    if (detectSavingsTransfer(val)) {
      setIsSavingsTransfer(true);
      if (categories.some((c) => c.name.toLowerCase() === 'wife transfer')) {
        setCategory('Wife Transfer');
      }
      setAccount('AX Bank');
    }

    // Auto-detect investment
    if (detectInvestment(val)) {
      setIsInvestment(true);
      if (categories.some((c) => c.name === 'Investments & Savings')) {
        setCategory('Investments & Savings');
      }
    }
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0 || !description.trim()) {
      return;
    }

    const isWifeTr = category.toLowerCase() === 'wife transfer' || isSavingsTransfer;
    const isCcPay = category.toLowerCase() === 'cc payment';
    const finalAccount = (isWifeTr || isCcPay) && (!account || account.includes('CC')) ? 'AX Bank' : account;

    setIsSubmitting(true);
    try {
      await onAddTransaction({
        type,
        amount: numAmount,
        category,
        description: description.trim(),
        date: date || getCurrentDateStr(),
        paymentMethod,
        account: finalAccount,
        isReimbursement: isReimbursement || category === 'Reimbursement',
        isReimbursementInflow: type === 'income' && (isReimbursement || category === 'Reimbursement'),
        reimbursementStatus: (type === 'income' && (isReimbursement || category === 'Reimbursement')) ? 'settled' : (isReimbursement ? 'pending' : undefined),
        isSavingsTransfer: isWifeTr,
        isWifeTransfer: isWifeTr,
        isCcPayment: isCcPay,
        isInvestment,
        source: 'manual',
        tags,
      });

      // Reset form
      setAmount('');
      setDescription('');
      setIsReimbursement(false);
      setIsSavingsTransfer(false);
      setIsInvestment(false);
      setTags([]);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4">
      <div className="bg-[#090d18] border border-cyan-500/30 rounded-2xl max-w-2xl w-full shadow-2xl shadow-cyan-950/50 flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden animate-in fade-in zoom-in duration-150">
        
        {/* Compact Header */}
        <div className="px-4 py-3 sm:px-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/90 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white font-sans tracking-wide">NAYA TRANSACTION JODEIN</h3>
              <p className="text-[10px] text-slate-400 font-sans">Kharcha ya Income ledger me record karein</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          <div className="overflow-y-auto flex-1 p-3.5 sm:p-5 space-y-3 sm:space-y-3.5 text-xs font-mono">
            
            {/* Top Bar: Type Toggle */}
            <div className="grid grid-cols-2 p-0.5 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setType('expense');
                  setCategory('Food & Dining');
                }}
                className={`py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all cursor-pointer ${
                  type === 'expense'
                    ? 'bg-rose-950 text-rose-300 border border-rose-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🔴 KHARCHA (EXPENSE)
              </button>
              <button
                type="button"
                onClick={() => {
                  setType('income');
                  setCategory('Salary & Employment');
                }}
                className={`py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all cursor-pointer ${
                  type === 'income'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🟢 KAMAI (INCOME)
              </button>
            </div>

            {/* 2-Column Responsive Grid on Desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              
              {/* Left Column: Amount, Description, Special Toggles */}
              <div className="space-y-3">
                {/* Amount Field */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">RASHI / AMOUNT (₹)</label>
                    {/* Quick Amount Chips */}
                    <div className="flex items-center space-x-1">
                      {[100, 500, 1000, 2000].map((amt) => (
                        <button
                          type="button"
                          key={amt}
                          onClick={() => setAmount(amt.toString())}
                          className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-cyan-950 border border-slate-800 text-cyan-300 text-[10px] cursor-pointer"
                        >
                          +{amt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400 font-bold text-sm">₹</span>
                    <input
                      type="number"
                      step="any"
                      required
                      min="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      className="w-full pl-7 pr-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-sm font-bold text-cyan-300 focus:outline-hidden focus:border-cyan-400"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">
                    VIVARAN / DESCRIPTION
                  </label>
                  <input
                    type="text"
                    required
                    value={description}
                    onChange={handleDescriptionChange}
                    placeholder="Jaise: Rim 100 Cab, Petrol, Doodh"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-hidden focus:border-cyan-400"
                  />
                </div>

                {/* Special Toggles / Pills */}
                {type === 'expense' && (
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">
                      SPECIAL TAG (OPTIONAL)
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const next = !isReimbursement;
                          setIsReimbursement(next);
                          if (next && categories.some((c) => c.name === 'Reimbursement')) {
                            setCategory('Reimbursement');
                          }
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                          isReimbursement
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-xs'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-300'
                        }`}
                        title="Monthly budget limit se deduct nahi hoga"
                      >
                        <Briefcase className="w-3 h-3 text-cyan-400" />
                        <span>Office Reimbursement</span>
                        {isReimbursement && <Check className="w-3 h-3 text-cyan-400" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const next = !isSavingsTransfer;
                          setIsSavingsTransfer(next);
                          if (next) {
                            if (categories.some(c => c.name.toLowerCase() === 'wife transfer')) {
                              setCategory('Wife Transfer');
                            }
                            setAccount('AX Bank');
                          }
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                          isSavingsTransfer
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-xs'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-300'
                        }`}
                        title="Wife ke account me bheja bachat fund"
                      >
                        <HeartHandshake className="w-3 h-3 text-rose-400" />
                        <span>Wife Transfer</span>
                        {isSavingsTransfer && <Check className="w-3 h-3 text-rose-400" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Special Toggle for Reimbursement Inflow (Income Mode) */}
                {type === 'income' && (
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">
                      RECOVERY TAG (OPTIONAL)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isReimbursement;
                        setIsReimbursement(next);
                        if (next) {
                          setCategory('Reimbursement');
                          if (!description || description.trim() === 'Income') {
                            setDescription('Office Reimbursement Received');
                          }
                          if (account && account.includes('CC')) setAccount('AX Bank');
                        } else {
                          if (category === 'Reimbursement') setCategory('Salary & Employment');
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                        isReimbursement || category === 'Reimbursement'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-xs'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-300'
                      }`}
                      title="Bank Account me credit (+) hoga, par Monthly Salary/Income me count nahi hoga"
                    >
                      <Briefcase className="w-3 h-3 text-cyan-400" />
                      <span>Office Reimbursement Recovery (Bank Credit)</span>
                      {(isReimbursement || category === 'Reimbursement') && <Check className="w-3 h-3 text-cyan-400" />}
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Category, Account, Date & Payment Mode, Tags */}
              <div className="space-y-3">
                {/* Category Selector */}
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">
                    CATEGORY
                  </label>
                  <select
                    value={category}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCategory(val);
                      if (val.toLowerCase() === 'reimbursement') {
                        setIsReimbursement(true);
                      } else if (val.toLowerCase() === 'wife transfer') {
                        setIsSavingsTransfer(true);
                        setAccount('AX Bank');
                      } else if (val.toLowerCase() === 'cc payment') {
                        setAccount('AX Bank');
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-cyan-300 focus:outline-hidden focus:border-cyan-400 cursor-pointer"
                  >
                    {filteredCategories.map((c) => (
                      <option key={c.id} value={c.name} className="bg-slate-900 text-white">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Account / Card Selector */}
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-indigo-400" />
                      ACCOUNT / CARD
                    </span>
                  </label>
                  <select
                    value={account}
                    onChange={(e) => setAccount(e.target.value as AccountId)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-hidden focus:border-cyan-400 cursor-pointer"
                  >
                    <optgroup label="💳 Credit & RuPay Cards" className="bg-slate-900 text-slate-300 font-bold">
                      {ALL_ACCOUNTS.filter(a => a.type === 'credit_card' || a.type === 'rupay_card').map(a => (
                        <option key={a.id} value={a.id} className="bg-slate-900 text-white font-normal">
                          {a.shortName} • ({a.badge})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="🏦 Bank Accounts" className="bg-slate-900 text-slate-300 font-bold">
                      {ALL_ACCOUNTS.filter(a => a.type === 'bank_account').map(a => (
                        <option key={a.id} value={a.id} className="bg-slate-900 text-white font-normal">
                          {a.shortName} • ({a.badge})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="💵 Cash" className="bg-slate-900 text-slate-300 font-bold">
                      {ALL_ACCOUNTS.filter(a => a.type === 'cash').map(a => (
                        <option key={a.id} value={a.id} className="bg-slate-900 text-white font-normal">
                          {a.shortName} • ({a.badge})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Date & Payment Method */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1 flex items-center space-x-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      <span>TAREEQ</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-hidden focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1 flex items-center space-x-1">
                      <CreditCard className="w-3 h-3 text-slate-500" />
                      <span>MODE</span>
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-hidden focus:border-cyan-400 cursor-pointer"
                    >
                      {PAYMENT_METHODS.map((pm) => (
                        <option key={pm} value={pm} className="bg-slate-900 text-white">
                          {pm}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Tags (Optional) */}
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">
                    TAGS (OPTIONAL)
                  </label>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Tag + Enter"
                      className="flex-1 px-2.5 py-1.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-hidden focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 hover:border-cyan-400 text-cyan-300 text-[11px] rounded-xl font-bold cursor-pointer"
                    >
                      ADD
                    </button>
                  </div>

                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-[10px]"
                        >
                          <span>#{t}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(t)}
                            className="hover:text-rose-400 ml-0.5 cursor-pointer"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>

          </div>

          {/* Compact Footer Actions */}
          <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-t border-slate-800/80 bg-slate-950/90 flex items-center justify-end space-x-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>SAVING...</span>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>ENTRY SAVE KAREIN</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
