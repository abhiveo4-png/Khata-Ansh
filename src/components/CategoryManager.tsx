import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Tag, 
  HelpCircle, 
  Check, 
  X, 
  Sparkles, 
  Utensils,
  ShoppingCart,
  Car,
  Zap,
  ShoppingBag,
  Home,
  Film,
  HeartPulse,
  TrendingUp,
  GraduationCap,
  Briefcase,
  Laptop,
  Coins,
  BadgePercent,
  Gift,
  Wallet,
  Cpu,
  Terminal
} from 'lucide-react';
import { CategoryDef, TransactionType } from '../types';
import { safeFetchJson } from '../utils/api';

interface CategoryManagerProps {
  categories: CategoryDef[];
  onCategoriesChange?: (newCats: CategoryDef[]) => void;
  onCreateCategory?: (cat: Partial<CategoryDef>) => Promise<void>;
  onUpdateCategory?: (id: string, cat: Partial<CategoryDef>) => Promise<void>;
  onDeleteCategory?: (id: string) => Promise<void>;
}

const AVAILABLE_COLORS = [
  '#06B6D4', // Cyan
  '#10B981', // Emerald
  '#6366F1', // Indigo
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#3B82F6', // Blue
  '#F43F5E', // Red
  '#14B8A6', // Teal
  '#A855F7', // Violet
  '#64748B', // Slate
  '#0EA5E9', // Sky
];

const AVAILABLE_ICONS = [
  { name: 'Utensils', icon: Utensils, label: 'Food & Dining' },
  { name: 'ShoppingCart', icon: ShoppingCart, label: 'Groceries' },
  { name: 'Car', icon: Car, label: 'Transport' },
  { name: 'Zap', icon: Zap, label: 'Bills & Power' },
  { name: 'ShoppingBag', icon: ShoppingBag, label: 'Shopping' },
  { name: 'Home', icon: Home, label: 'Housing / Rent' },
  { name: 'Film', icon: Film, label: 'Entertainment' },
  { name: 'HeartPulse', icon: HeartPulse, label: 'Health' },
  { name: 'TrendingUp', icon: TrendingUp, label: 'Investment' },
  { name: 'GraduationCap', icon: GraduationCap, label: 'Education' },
  { name: 'Briefcase', icon: Briefcase, label: 'Job / Salary' },
  { name: 'Laptop', icon: Laptop, label: 'Freelance / Work' },
  { name: 'Coins', icon: Coins, label: 'Dividends / Returns' },
  { name: 'BadgePercent', icon: BadgePercent, label: 'Cashback' },
  { name: 'Gift', icon: Gift, label: 'Gifts' },
  { name: 'Wallet', icon: Wallet, label: 'Wallet / Misc' },
  { name: 'Tag', icon: Tag, label: 'General Tag' },
  { name: 'HelpCircle', icon: HelpCircle, label: 'Uncategorized' },
];

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  categories,
  onCategoriesChange,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDef | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<TransactionType | 'both'>('expense');
  const [icon, setIcon] = useState('Tag');
  const [color, setColor] = useState('#06B6D4');
  const [keywordsText, setKeywordsText] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openCreateModal = () => {
    setEditingCategory(null);
    setName('');
    setType('expense');
    setIcon('Tag');
    setColor('#06B6D4');
    setKeywordsText('');
    setDescription('');
    setError('');
    setIsModalOpen(true);
  };

  const openEditModal = (cat: CategoryDef) => {
    setEditingCategory(cat);
    setName(cat.name);
    setType(cat.type);
    setIcon(cat.icon || 'Tag');
    setColor(cat.color || '#06B6D4');
    setKeywordsText(cat.keywords ? cat.keywords.join(', ') : '');
    setDescription(cat.description || '');
    setError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a category name.');
      return;
    }

    const keywords = keywordsText
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    if (keywords.length === 0) {
      keywords.push(name.trim().toLowerCase());
    }

    setIsSubmitting(true);
    setError('');

    try {
      if (editingCategory) {
        if (onUpdateCategory) {
          await onUpdateCategory(editingCategory.id, {
            name: name.trim(),
            type,
            icon,
            color,
            keywords,
            description: description.trim(),
          });
        } else {
          const { data } = await safeFetchJson<{ categories?: CategoryDef[] }>(`/api/categories/${editingCategory.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), type, icon, color, keywords, description: description.trim() }),
          });
          if (data?.categories && onCategoriesChange) onCategoriesChange(data.categories);
        }
      } else {
        if (onCreateCategory) {
          await onCreateCategory({
            name: name.trim(),
            type,
            icon,
            color,
            keywords,
            description: description.trim(),
            isCustom: true,
          });
        } else {
          const { data } = await safeFetchJson<{ categories?: CategoryDef[] }>('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), type, icon, color, keywords, description: description.trim(), isCustom: true }),
          });
          if (data?.categories && onCategoriesChange) onCategoriesChange(data.categories);
        }
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this category?')) return;
    if (onDeleteCategory) {
      await onDeleteCategory(id);
    } else {
      const { data } = await safeFetchJson<{ categories?: CategoryDef[] }>(`/api/categories/${id}`, {
        method: 'DELETE',
      });
      if (data?.categories && onCategoriesChange) onCategoriesChange(data.categories);
    }
  };

  const filteredCategories = categories.filter((c) => {
    if (filterType === 'all') return true;
    return c.type === filterType || c.type === 'both';
  });

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Cyber Actions */}
      <div className="bg-[#0c1222]/85 rounded-2xl p-5 border border-slate-800 backdrop-blur-xl shadow-2xl shadow-black/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <h2 className="text-base font-bold text-white font-display">AI CATEGORY TAXONOMY & NEURAL MAPPINGS</h2>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
              {categories.length} NODES
            </span>
          </div>
          <p className="text-xs font-mono text-slate-400 mt-1 max-w-2xl">
            Configure custom category rules and keywords. Telegram messages are parsed by Gemini AI and mapped automatically.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          {/* Type Filter Buttons */}
          <div className="flex bg-slate-950 p-1 rounded-xl text-xs font-mono border border-slate-800 text-slate-400">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                filterType === 'all' ? 'bg-slate-800 text-white font-bold' : 'hover:text-white'
              }`}
            >
              ALL ({categories.length})
            </button>
            <button
              onClick={() => setFilterType('expense')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                filterType === 'expense' ? 'bg-rose-950 text-rose-300 font-bold border border-rose-500/40' : 'hover:text-white'
              }`}
            >
              OUTFLOW
            </button>
            <button
              onClick={() => setFilterType('income')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                filterType === 'income' ? 'bg-emerald-950 text-emerald-300 font-bold border border-emerald-500/40' : 'hover:text-white'
              }`}
            >
              INFLOW
            </button>
          </div>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-mono font-bold shadow-md shadow-cyan-950/50 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>NEW NODE</span>
          </button>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCategories.map((c) => {
          const isIncome = c.type === 'income';
          return (
            <div
              key={c.id}
              className="bg-[#0c1222]/80 border border-slate-800/90 rounded-2xl p-4 backdrop-blur-xl hover:border-cyan-500/40 transition-all shadow-lg flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 truncate">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 border border-white/10"
                      style={{ backgroundColor: c.color || '#06B6D4' }}
                    >
                      <Tag className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-sm text-white font-display truncate">{c.name}</span>
                  </div>

                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                      isIncome
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-950/60 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {c.type.toUpperCase()}
                  </span>
                </div>

                {/* Keywords Cloud */}
                <div className="mt-3">
                  <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                    AI KEYWORDS:
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                    {c.keywords && c.keywords.length > 0 ? (
                      c.keywords.map((kw, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700/80 text-cyan-300 text-[10px] font-mono"
                        >
                          {kw}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-500 font-mono italic">No custom keywords</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                <span className="text-[10px] text-slate-500">{c.isCustom ? 'USER DEFINED' : 'SYSTEM PRESET'}</span>
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => openEditModal(c)}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-cyan-300 hover:border-cyan-400 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  {c.isCustom && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal for Creating / Editing Category */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#090d18] border border-cyan-500/30 rounded-2xl max-w-lg w-full p-6 shadow-2xl shadow-cyan-950/40 relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-bold text-white font-display">
                {editingCategory ? 'EDIT CATEGORY NODE' : 'CREATE CATEGORY NODE'}
              </h3>
            </div>

            {error && (
              <div className="mt-3 p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-mono">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4 font-mono text-xs">
              <div>
                <label className="block text-slate-400 uppercase tracking-wider mb-1">Category Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Gym & Supplements, Crypto Staking"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-hidden focus:border-cyan-400 text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-400 uppercase tracking-wider mb-1">Flow Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['expense', 'income', 'both'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`py-2 px-3 rounded-xl uppercase font-bold border transition-colors cursor-pointer ${
                        type === t
                          ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300'
                          : 'border-slate-800 text-slate-400 hover:bg-slate-900'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-400 uppercase tracking-wider mb-1.5">Color Tag</label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
                        color === c ? 'ring-2 ring-offset-2 ring-cyan-400 scale-110' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {color === c && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-400 uppercase tracking-wider mb-1">
                  AI Detection Keywords (Comma Separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. whey, creatine, gym, fitness, protein"
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-cyan-200 focus:outline-hidden focus:border-cyan-400 text-xs"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Gemini AI will automatically tag transactions with these keywords to this node.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-md shadow-cyan-950"
                >
                  {isSubmitting ? 'SAVING...' : 'SAVE NODE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
