import React, { useState } from 'react';
import { X, Plus, Calendar, Tag, CreditCard, Check, Zap, Terminal } from 'lucide-react';
import { Transaction, TransactionType, PaymentMethod, CategoryDef } from '../types';
import { getCurrentDateStr } from '../utils/formatters';

interface AddTransactionModalProps {
  isOpen: boolean;
  categories: CategoryDef[];
  onClose: () => void;
  onAddTransaction: (tx: Partial<Transaction>) => Promise<void>;
}

const AMOUNT_PRESETS = [100, 200, 500, 1000, 2000, 5000];
const PAYMENT_METHODS: PaymentMethod[] = ['UPI', 'Cash', 'Card', 'Net Banking', 'Bank Transfer', 'Other'];

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
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const filteredCategories = categories.filter(
    (c) => c.type === type || c.type === 'both'
  );

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

    setIsSubmitting(true);
    try {
      await onAddTransaction({
        type,
        amount: numAmount,
        category,
        description: description.trim(),
        date: date || getCurrentDateStr(),
        paymentMethod,
        source: 'manual',
        tags,
      });

      // Reset form
      setAmount('');
      setDescription('');
      setTags([]);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#090d18] border border-cyan-500/30 rounded-2xl max-w-lg w-full shadow-2xl shadow-cyan-950/50 overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Cyber Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-base text-white font-display">NAYA KHARCHA / INCOME JODEIN</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs font-mono">
          
          {/* Type Toggle */}
          <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setType('expense');
                setCategory('Food & Dining');
              }}
              className={`py-2 rounded-lg font-bold uppercase transition-all cursor-pointer ${
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
              className={`py-2 rounded-lg font-bold uppercase transition-all cursor-pointer ${
                type === 'income'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🟢 KAMAI (INCOME)
            </button>
          </div>

          {/* Amount Field */}
          <div>
            <label className="block text-slate-400 uppercase tracking-wider mb-1">RASHMI / AMOUNT (₹)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-400 font-bold text-base">₹</span>
              <input
                type="number"
                step="any"
                required
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full pl-8 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-base font-bold text-cyan-300 focus:outline-hidden focus:border-cyan-400"
              />
            </div>
            
            {/* Quick Amount Chips */}
            <div className="flex items-center space-x-1.5 mt-2 overflow-x-auto no-scrollbar">
              <span className="text-[10px] text-slate-500 mr-1">QUICK AMOUNT:</span>
              {AMOUNT_PRESETS.map((amt) => (
                <button
                  type="button"
                  key={amt}
                  onClick={() => setAmount(amt.toString())}
                  className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-cyan-950 border border-slate-800 text-cyan-300 text-[11px] font-mono cursor-pointer"
                >
                  +{amt}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-slate-400 uppercase tracking-wider mb-1">VIVARAN / DESCRIPTION (NOTE)</label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === 'expense' ? 'Jaise: Doodh, Petrol, Zomato, Grocery' : 'Jaise: Salary, Freelance project, Rent mila'}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-cyan-400"
            />
          </div>

          {/* Category Selector */}
          <div>
            <label className="block text-slate-400 uppercase tracking-wider mb-1">CATEGORY CHUNIYE</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-cyan-300 focus:outline-hidden focus:border-cyan-400"
            >
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date & Payment Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>TAREEQ (DATE)</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                <span>PAYMENT METHOD</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-cyan-400"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-slate-400 uppercase tracking-wider mb-1">TAGS (OPTIONAL)</label>
            <div className="flex items-center space-x-2">
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
                placeholder="Tag likh kar enter karein"
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-3 py-2 bg-slate-900 border border-slate-700 hover:border-cyan-400 text-cyan-300 rounded-xl font-bold cursor-pointer"
              >
                ADD
              </button>
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-[10px]"
                  >
                    <span>#{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="hover:text-rose-400 ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl shadow-md transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              {isSubmitting ? (
                <span>SAVE HO RAHA HAI...</span>
              ) : (
                <>
                  <Plus className="w-4 h-4 stroke-[3]" />
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
