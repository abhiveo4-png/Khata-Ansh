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
    keywords: ['zomato', 'swiggy', 'food', 'khana', 'restaurant', 'dinner', 'lunch', 'breakfast', 'nashta', 'snack', 'cafe', 'starbucks', 'chai', 'tea', 'coffee', 'mcdonalds', 'kfc', 'burger', 'pizza', 'biryani', 'dhaba', 'eating out', 'thali', 'samosa', 'maggi', 'momos', 'pani puri', 'golgappe', 'sweet', 'mithai', 'party'],
  },
  {
    id: 'groceries',
    name: 'Groceries & Sabzi',
    type: 'expense',
    icon: 'ShoppingCart',
    color: '#10B981', // Emerald
    bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    keywords: ['vegetable', 'vegetables', 'sabzi', 'grocery', 'groceries', 'supermarket', 'blinkit', 'zepto', 'instamart', 'bigbasket', 'milk', 'doodh', 'dahi', 'curd', 'fruits', 'fal', 'd-mart', 'ration', 'bread', 'eggs', 'anda', 'paneer', 'chicken', 'mutton', 'machli', 'oil', 'tel', 'aata', 'chawal', 'dal', 'cheeni', 'namak', 'masala'],
  },
  {
    id: 'transport',
    name: 'Transportation & Fuel',
    type: 'expense',
    icon: 'Car',
    color: '#3B82F6', // Blue
    bgLight: 'bg-blue-50 text-blue-700 border-blue-200',
    keywords: ['petrol', 'diesel', 'fuel', 'uber', 'ola', 'rapido', 'auto', 'rickshaw', 'cab', 'metro', 'bus', 'train', 'flight', 'ticket', 'toll', 'parking', 'car wash', 'bike service', 'scooter', 'bhada', 'gadi', 'cng'],
  },
  {
    id: 'bills_utilities',
    name: 'Bills & Utilities',
    type: 'expense',
    icon: 'Zap',
    color: '#EAB308', // Yellow
    bgLight: 'bg-amber-50 text-amber-700 border-amber-200',
    keywords: ['electricity', 'bijli', 'bijli bill', 'wifi', 'internet', 'broadband', 'water', 'pani', 'gas', 'cylinder', 'mobile', 'recharge', 'jio', 'airtel', 'vi', 'maintenance', 'house tax', 'dth', 'bill', 'light bill'],
  },
  {
    id: 'shopping',
    name: 'Shopping & Apparel',
    type: 'expense',
    icon: 'ShoppingBag',
    color: '#EC4899', // Pink
    bgLight: 'bg-pink-50 text-pink-700 border-pink-200',
    keywords: ['amazon', 'flipkart', 'myntra', 'clothes', 'kapde', 'shoes', 'juta', 'electronics', 'shopping', 'meesho', 'zara', 'h&m', 'tshirt', 'jeans', 'watch', 'ghadi', 'gadget', 'headphones', 'cosmetics', 'mall', 'saree', 'kurta'],
  },
  {
    id: 'housing_rent',
    name: 'Rent & Housing',
    type: 'expense',
    icon: 'Home',
    color: '#8B5CF6', // Purple
    bgLight: 'bg-purple-50 text-purple-700 border-purple-200',
    keywords: ['rent', 'kiraya', 'room rent', 'pg', 'flat rent', 'deposit', 'house', 'makan', 'furniture', 'plumber', 'electrician', 'maid', 'kamwali', 'cook', 'bai'],
  },
  {
    id: 'entertainment',
    name: 'Entertainment & Fun',
    type: 'expense',
    icon: 'Film',
    color: '#06B6D4', // Cyan
    bgLight: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    keywords: ['movie', 'cinema', 'film', 'pvr', 'inox', 'netflix', 'prime', 'spotify', 'hotstar', 'gaming', 'steam', 'party', 'concert', 'club', 'outing', 'trip', 'ghoomna', 'vacation', 'resort'],
  },
  {
    id: 'healthcare',
    name: 'Healthcare & Fitness',
    type: 'expense',
    icon: 'HeartPulse',
    color: '#EF4444', // Red
    bgLight: 'bg-rose-50 text-rose-700 border-rose-200',
    keywords: ['medicine', 'dawa', 'dawai', 'doctor', 'hospital', 'clinic', 'pharmacy', 'medical', 'gym', 'protein', 'supplements', 'test', 'dentist', 'apollo', 'pharmeasy', 'health insurance', 'bimari', 'dawaiya'],
  },
  {
    id: 'investment',
    name: 'Investments & Savings',
    type: 'expense',
    icon: 'TrendingUp',
    color: '#14B8A6', // Teal
    bgLight: 'bg-teal-50 text-teal-700 border-teal-200',
    keywords: ['sip', 'mutual fund', 'stocks', 'share market', 'crypto', 'gold', 'sona', 'fd', 'rd', 'ppf', 'nps', 'zerodha', 'groww', 'savings', 'bachat', 'invest'],
  },
  {
    id: 'education',
    name: 'Education & Learning',
    type: 'expense',
    icon: 'GraduationCap',
    color: '#6366F1', // Indigo
    bgLight: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    keywords: ['fees', 'course', 'books', 'kitab', 'udemy', 'college', 'school', 'tuition', 'coaching', 'subscription', 'exam', 'certifications', 'padhai'],
  },
  {
    id: 'family_trip_pooja',
    name: 'Family Trip & Pooja',
    type: 'expense',
    icon: 'Sparkles',
    color: '#F59E0B', // Amber
    bgLight: 'bg-amber-50 text-amber-700 border-amber-200',
    keywords: ['pooja', 'puja', 'trip', 'family trip', 'mandir', 'prasad', 'pandit', 'samagri', 'havan', 'yatra', 'darshan', 'holiday', 'vacation', 'temple', 'religious', 'ganga', 'kedarnath', 'tirupati'],
    description: 'Family travel, holidays & religious rituals / pooja samagri',
  },
  {
    id: 'reimbursement',
    name: 'Reimbursement',
    type: 'expense',
    icon: 'Briefcase',
    color: '#06B6D4', // Cyan
    bgLight: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    keywords: ['rim', 'reimburse', 'reimbursement', 'office claim', 'client trip', 'reimbursable', 'claim'],
    description: 'Office or business claimable expenses (does not eat personal monthly budget)',
  },
  {
    id: 'wife_transfer',
    name: 'Wife Transfer',
    type: 'expense',
    icon: 'UserCheck',
    color: '#8B5CF6', // Purple
    bgLight: 'bg-purple-50 text-purple-700 border-purple-200',
    keywords: ['wife transfer', 'wife', 'wife ko', 'patni', 'wife ko diya', 'wife sent', 'wife payment'],
    description: 'Bank transfer to wife (deducted from bank balance, excluded from monthly budget)',
    excludeFromBudget: true,
  },
  {
    id: 'cc_payment',
    name: 'CC Payment',
    type: 'expense',
    icon: 'CreditCard',
    color: '#EC4899', // Pink
    bgLight: 'bg-pink-50 text-pink-700 border-pink-200',
    keywords: ['cc payment', 'credit card payment', 'credit card bill', 'cc bill', 'credit card bhar diya', 'cc bill paid'],
    description: 'Credit Card bill payment for previous month spends (deducted from bank balance, excluded from monthly budget)',
    excludeFromBudget: true,
  },
  {
    id: 'udhaar_given',
    name: 'Udhaar Given',
    type: 'expense',
    icon: 'ArrowUpRight',
    color: '#F59E0B', // Amber
    bgLight: 'bg-amber-50 text-amber-700 border-amber-200',
    keywords: ['udhaar diya', 'udhar diya', 'udhar', 'udhaar', 'loan diya', 'lent', 'advance diya', 'dost ko diya'],
    description: 'Money lent to someone (deducted from Bank/Card/Cash account balance, but EXCLUDED from monthly expense budget)',
    excludeFromBudget: true,
  },
  {
    id: 'other_expense',
    name: 'Other Expense',
    type: 'expense',
    icon: 'MoreHorizontal',
    color: '#64748B', // Slate
    bgLight: 'bg-slate-50 text-slate-700 border-slate-200',
    keywords: ['misc', 'gift', 'donation', 'daan', 'fine', 'penalty', 'challan', 'cash out', 'other', 'kharcha', 'kharch'],
  },

  // Income Categories
  {
    id: 'salary',
    name: 'Salary & Employment',
    type: 'income',
    icon: 'Briefcase',
    color: '#10B981', // Emerald
    bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    keywords: ['salary', 'tankhwa', 'income', 'stipend', 'paycheck', 'wages', 'bonus', 'appraisal', 'incentive', 'overtime', 'job', 'kamai'],
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
    id: 'udhaar_recovery',
    name: 'Udhaar Received',
    type: 'income',
    icon: 'ArrowDownLeft',
    color: '#10B981', // Emerald
    bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    keywords: ['udhaar wapas', 'udhar wapas', 'udhar mila', 'udhaar mila', 'udhar aaya', 'loan repayment', 'khata settled'],
    description: 'Udhaar money returned by friend/family (adds to bank/cash, does not count as salary income)',
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
