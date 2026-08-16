import { CategoryDef } from '../types';

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  // Expense Categories
  {
    id: 'food_dining',
    name: 'Food & Dining',
    type: 'expense',
    icon: 'Utensils',
    color: '#F97316', // Orange
    bgLight: 'bg-orange-50 text-orange-700 border-orange-200',
    keywords: ['zomato', 'swiggy', 'food', 'restaurant', 'dinner', 'lunch', 'breakfast', 'snack', 'cafe', 'starbucks', 'chai', 'tea', 'coffee', 'mcdonalds', 'kfc', 'burger', 'pizza', 'biryani', 'dhaba', 'eating out'],
  },
  {
    id: 'groceries',
    name: 'Groceries & Sabzi',
    type: 'expense',
    icon: 'ShoppingCart',
    color: '#10B981', // Emerald
    bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    keywords: ['vegetable', 'vegetables', 'sabzi', 'grocery', 'groceries', 'supermarket', 'blinkit', 'zepto', 'instamart', 'bigbasket', 'milk', 'doodh', 'fruits', 'd-mart', 'ration', 'bread', 'eggs', 'paneer', 'chicken', 'mutton'],
  },
  {
    id: 'transport',
    name: 'Transportation & Fuel',
    type: 'expense',
    icon: 'Car',
    color: '#3B82F6', // Blue
    bgLight: 'bg-blue-50 text-blue-700 border-blue-200',
    keywords: ['petrol', 'diesel', 'fuel', 'uber', 'ola', 'rapido', 'auto', 'rickshaw', 'cab', 'metro', 'bus', 'train', 'flight', 'ticket', 'toll', 'parking', 'car wash', 'bike service', 'scooter'],
  },
  {
    id: 'bills_utilities',
    name: 'Bills & Utilities',
    type: 'expense',
    icon: 'Zap',
    color: '#EAB308', // Yellow
    bgLight: 'bg-amber-50 text-amber-700 border-amber-200',
    keywords: ['electricity', 'bijli', 'wifi', 'internet', 'broadband', 'water', 'gas', 'cylinder', 'mobile', 'recharge', 'jio', 'airtel', 'vi', 'maintenance', 'house tax', 'dth', 'bill'],
  },
  {
    id: 'shopping',
    name: 'Shopping & Apparel',
    type: 'expense',
    icon: 'ShoppingBag',
    color: '#EC4899', // Pink
    bgLight: 'bg-pink-50 text-pink-700 border-pink-200',
    keywords: ['amazon', 'flipkart', 'myntra', 'clothes', 'shoes', 'electronics', 'shopping', 'meesho', 'zara', 'h&m', 'tshirt', 'jeans', 'watch', 'gadget', 'headphones', 'cosmetics', 'mall'],
  },
  {
    id: 'housing_rent',
    name: 'Rent & Housing',
    type: 'expense',
    icon: 'Home',
    color: '#8B5CF6', // Purple
    bgLight: 'bg-purple-50 text-purple-700 border-purple-200',
    keywords: ['rent', 'kiraya', 'room rent', 'pg', 'flat rent', 'deposit', 'house', 'furniture', 'plumber', 'electrician', 'maid', 'kamwali', 'cook'],
  },
  {
    id: 'entertainment',
    name: 'Entertainment & Fun',
    type: 'expense',
    icon: 'Film',
    color: '#06B6D4', // Cyan
    bgLight: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    keywords: ['movie', 'cinema', 'pvr', 'inox', 'netflix', 'prime', 'spotify', 'hotstar', 'gaming', 'steam', 'party', 'concert', 'club', 'outing', 'trip', 'vacation', 'resort'],
  },
  {
    id: 'healthcare',
    name: 'Healthcare & Fitness',
    type: 'expense',
    icon: 'HeartPulse',
    color: '#EF4444', // Red
    bgLight: 'bg-rose-50 text-rose-700 border-rose-200',
    keywords: ['medicine', 'doctor', 'hospital', 'clinic', 'pharmacy', 'medical', 'gym', 'protein', 'supplements', 'test', 'dentist', 'apollo', 'pharmeasy', 'health insurance'],
  },
  {
    id: 'investment',
    name: 'Investments & Savings',
    type: 'expense',
    icon: 'TrendingUp',
    color: '#14B8A6', // Teal
    bgLight: 'bg-teal-50 text-teal-700 border-teal-200',
    keywords: ['sip', 'mutual fund', 'stocks', 'share market', 'crypto', 'gold', 'fd', 'rd', 'ppf', 'nps', 'zerodha', 'groww', 'savings'],
  },
  {
    id: 'education',
    name: 'Education & Learning',
    type: 'expense',
    icon: 'GraduationCap',
    color: '#6366F1', // Indigo
    bgLight: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    keywords: ['fees', 'course', 'books', 'udemy', 'college', 'school', 'tuition', 'coaching', 'subscription', 'exam', 'certifications'],
  },
  {
    id: 'other_expense',
    name: 'Other Expense',
    type: 'expense',
    icon: 'MoreHorizontal',
    color: '#64748B', // Slate
    bgLight: 'bg-slate-50 text-slate-700 border-slate-200',
    keywords: ['misc', 'gift', 'donation', 'fine', 'penalty', 'cash out', 'other'],
  },

  // Income Categories
  {
    id: 'salary',
    name: 'Salary & Employment',
    type: 'income',
    icon: 'Briefcase',
    color: '#10B981', // Emerald
    bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    keywords: ['salary', 'income', 'stipend', 'paycheck', 'wages', 'bonus', 'appraisal', 'incentive', 'overtime', 'job'],
  },
  {
    id: 'freelance_business',
    name: 'Freelance & Business',
    type: 'income',
    icon: 'Laptop',
    color: '#0EA5E9', // Sky
    bgLight: 'bg-sky-50 text-sky-700 border-sky-200',
    keywords: ['freelance', 'client', 'consulting', 'project', 'business', 'profit', 'sales', 'upwork', 'fiverr', 'contract', 'invoice'],
  },
  {
    id: 'investments_income',
    name: 'Investment Returns & Dividends',
    type: 'income',
    icon: 'Coins',
    color: '#8B5CF6', // Purple
    bgLight: 'bg-purple-50 text-purple-700 border-purple-200',
    keywords: ['dividend', 'interest', 'capital gains', 'crypto profit', 'rental income', 'rent received', 'returns'],
  },
  {
    id: 'cashback_refunds',
    name: 'Cashback & Refunds',
    type: 'income',
    icon: 'BadgePercent',
    color: '#F59E0B', // Amber
    bgLight: 'bg-amber-50 text-amber-700 border-amber-200',
    keywords: ['cashback', 'refund', 'reward', 'gpay scratch', 'credit', 'reimbursement', 'returned'],
  },
  {
    id: 'gift_income',
    name: 'Gifts & Allowance',
    type: 'income',
    icon: 'Gift',
    color: '#EC4899', // Pink
    bgLight: 'bg-pink-50 text-pink-700 border-pink-200',
    keywords: ['gift', 'pocket money', 'allowance', 'papa sent', 'mom sent', 'shagun', 'prize', 'won'],
  },
  {
    id: 'other_income',
    name: 'Other Income',
    type: 'income',
    icon: 'Wallet',
    color: '#10B981',
    bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    keywords: ['income', 'credit', 'received', 'credited', 'other'],
  },
  // Special Undefined / Uncategorized Fallback Category
  {
    id: 'uncategorized',
    name: 'Uncategorized',
    type: 'both',
    icon: 'HelpCircle',
    color: '#94A3B8', // Slate-400
    bgLight: 'bg-slate-100 text-slate-700 border-slate-300',
    keywords: ['undefined', 'uncategorized', 'unknown', 'misc', 'other'],
    isDefault: true,
    description: 'Auto-assigned when item does not match existing categories or needs review',
  },
];

export function getCategoryByNameOrKeyword(
  rawName: string, 
  isIncome: boolean, 
  customCategories?: CategoryDef[]
): CategoryDef {
  const categoryPool = (customCategories && customCategories.length > 0) ? customCategories : DEFAULT_CATEGORIES;
  const normalized = (rawName || '').toLowerCase().trim();
  const targetType = isIncome ? 'income' : 'expense';

  // 1. Exact match by name
  const exact = categoryPool.find(
    (c) => c.name.toLowerCase() === normalized && (c.type === targetType || c.type === 'both')
  );
  if (exact) return exact;

  // 2. Keyword match
  const keywordMatch = categoryPool.find(
    (c) =>
      (c.type === targetType || c.type === 'both') &&
      c.keywords &&
      c.keywords.some((k) => normalized.includes(k.toLowerCase()) || k.toLowerCase().includes(normalized))
  );
  if (keywordMatch) return keywordMatch;

  // 3. Fallback to Uncategorized if present in pool
  const uncat = categoryPool.find((c) => c.id === 'uncategorized' || c.name.toLowerCase() === 'uncategorized' || c.name.toLowerCase() === 'undefined');
  if (uncat) return uncat;

  // 4. Default fallback
  return isIncome
    ? categoryPool.find((c) => c.id === 'other_income') || DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1]
    : categoryPool.find((c) => c.id === 'other_expense') || DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
}
