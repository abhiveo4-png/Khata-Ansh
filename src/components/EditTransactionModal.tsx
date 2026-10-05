import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Calendar, 
  CreditCard, 
  Briefcase, 
  HeartHandshake,
  Check, 
  ArrowUpRight, 
  ArrowDownRight 
} from 'lucide-react';
import { Transaction, CategoryDef, PaymentMethod, TransactionType, AccountId } from '../types';
import { ALL_ACCOUNTS } from '../utils/accounts';

interface EditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  categories: CategoryDef[];
  onSave: (updatedTx: Transaction) => Promise<void>;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  isOpen,
  onClose,
  transaction,
  categories,
  onSave,
}) => {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [account, setAccount] = useState<AccountId>('ICICI CC 0000');
  const [isReimbursement, setIsReimbursement] = useState(false);
  const [reimbursementStatus, setReimbursementStatus] = useState<'pending' | 'settled' | 'partial'>('pending');
  const [reimbursementSettledAmount, setReimbursementSettledAmount] = useState<string>('');
  const [isSavingsTransfer, setIsSavingsTransfer] = useState(false);
  const [isInvestment, setIsInvestment] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (transaction) {
      setDescription(transaction.description || '');
      setAmount(transaction.amount || '');
      setType(transaction.type || 'expense');
      setCategory(transaction.category || 'Uncategorized');
      setDate(transaction.date || new Date().toISOString().split('T')[0]);
      setPaymentMethod(transaction.paymentMethod || 'UPI');
      setAccount((transaction.account as AccountId) || 'ICICI CC 0000');
      setIsReimbursement(Boolean(transaction.isReimbursement));
      setReimbursementStatus(transaction.reimbursementStatus || 'pending');
      setReimbursementSettledAmount(
        transaction.reimbursementSettledAmount !== undefined
          ? String(transaction.reimbursementSettledAmount)
          : (transaction.reimbursementStatus === 'settled' ? String(transaction.amount || '') : '0')
      );
      setIsSavingsTransfer(Boolean(transaction.isSavingsTransfer));
      setIsInvestment(Boolean(transaction.isInvestment));
      setError(null);
    }
  }, [transaction]);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen || !transaction) return null;
  if (typeof document === 'undefined') return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Vivaran (Description) likhna zaroori hai.');
      return;
    }
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Sahi rashi (Amount) dalein.');
      return;
    }
    if (!date) {
      setError('Tareeq (Date) select karein.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updated: Transaction = {
        ...transaction,
        description: description.trim(),
        amount: numAmount,
        type,
        category: category || 'Uncategorized',
        date,
        paymentMethod,
        account,
        isReimbursement,
        reimbursementStatus: isReimbursement ? reimbursementStatus : undefined,
        reimbursementSettledAmount: isReimbursement ? (Number(reimbursementSettledAmount) || 0) : undefined,
        isSavingsTransfer,
        isInvestment,
      };

      await onSave(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Transaction update karne me error aaya.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredCategories = categories.filter(c => c.type === type || c.type === 'both');

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="relative bg-[#0f172a] border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[88dvh] my-auto animate-in fade-in zoom-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center space-x-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              type === 'income' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
            }`}>
              {type === 'income' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white font-sans">Transaction Badlein / Edit Karein</h3>
              <p className="text-[11px] text-slate-400 font-sans">Card, Account ya Reimbursement status change karein</p>
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

        {error && (
          <div className="mx-5 sm:mx-6 mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 shrink-0">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          {/* Scrollable form body */}
          <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4 text-xs font-mono overscroll-contain">
            {/* Type Toggle */}
            <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setType('expense')}
                className={`py-2 rounded-lg font-bold transition-all cursor-pointer ${
                  type === 'expense'
                    ? 'bg-rose-950 text-rose-300 border border-rose-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🔴 KHARCHA (EXPENSE)
              </button>
              <button
                type="button"
                onClick={() => setType('income')}
                className={`py-2 rounded-lg font-bold transition-all cursor-pointer ${
                  type === 'income'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🟢 KAMAI (INCOME)
              </button>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-slate-400 mb-1">RASHMI (₹)</label>
              <input
                type="number"
                step="any"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-bold font-mono focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-slate-400 mb-1">VIVARAN / DESCRIPTION</label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            {/* Account / Card Selector */}
            <div>
              <label className="block text-slate-400 mb-1 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                ASSIGN TO CARD / BANK ACCOUNT
              </label>
              <select
                value={account}
                onChange={(e) => setAccount(e.target.value as AccountId)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-indigo-300 font-semibold focus:outline-hidden focus:border-indigo-500 cursor-pointer"
              >
                {ALL_ACCOUNTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.badge})
                  </option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-slate-400 mb-1">CATEGORY</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-hidden focus:border-indigo-500 cursor-pointer"
              >
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Reimbursement & Savings Settings */}
            {type === 'expense' && (
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5" />
                    Office Reimbursement (Budget se minus nahi hoga)
                  </span>
                  <input
                    type="checkbox"
                    checked={isReimbursement}
                    onChange={(e) => setIsReimbursement(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700 cursor-pointer"
                  />
                </label>

                {isReimbursement && (
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px]">Claim Status:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setReimbursementStatus('pending');
                            setReimbursementSettledAmount('0');
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                            reimbursementStatus === 'pending'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          Pending
                        </button>
                        <button
                          type="button"
                          onClick={() => setReimbursementStatus('partial')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                            reimbursementStatus === 'partial'
                              ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          Partial
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReimbursementStatus('settled');
                            setReimbursementSettledAmount(String(amount || ''));
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                            reimbursementStatus === 'settled'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          Settled
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                        <span>Wapas Mila Hua Amount (₹):</span>
                        <span className="font-mono text-cyan-300">
                          Baki: ₹{Math.max(0, (Number(amount) || 0) - (Number(reimbursementSettledAmount) || 0)).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max={Number(amount) || 0}
                          value={reimbursementSettledAmount}
                          onChange={(e) => {
                            const val = e.target.value;
                            setReimbursementSettledAmount(val);
                            const num = Number(val) || 0;
                            const total = Number(amount) || 0;
                            if (num >= total && total > 0) {
                              setReimbursementStatus('settled');
                            } else if (num > 0) {
                              setReimbursementStatus('partial');
                            } else {
                              setReimbursementStatus('pending');
                            }
                          }}
                          placeholder="0"
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-hidden focus:border-cyan-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setReimbursementSettledAmount(String(amount || ''));
                            setReimbursementStatus('settled');
                          }}
                          className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold shrink-0 cursor-pointer"
                        >
                          Full
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-slate-800">
                  <span className="font-bold text-rose-300 flex items-center gap-1.5">
                    <HeartHandshake className="w-3.5 h-3.5" />
                    Savings Transfer to Wife
                  </span>
                  <input
                    type="checkbox"
                    checked={isSavingsTransfer}
                    onChange={(e) => setIsSavingsTransfer(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-500 bg-slate-900 border-slate-700 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-slate-800">
                  <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                    📈 RD, FD ya Investment Expense
                  </span>
                  <input
                    type="checkbox"
                    checked={isInvestment}
                    onChange={(e) => setIsInvestment(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 cursor-pointer"
                  />
                </label>
              </div>
            )}

            {/* Date & Payment Method */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">TAREEQ (DATE)</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-hidden focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">PAYMENT METHOD</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI/Cash">UPI/Cash (Pending / Unassigned)</option>
                  <option value="Card">Card</option>
                  <option value="Net Banking">Net Banking</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Fixed / Sticky Footer Buttons */}
          <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-900/95 shrink-0 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer font-sans"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors cursor-pointer font-sans"
            >
              {isSaving ? 'Save ho raha hai...' : 'Update Karein'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
