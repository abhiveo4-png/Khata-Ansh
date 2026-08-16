import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Persistence directory
const DATA_DIR = path.join(process.cwd(), '.data');
const USERS_DIR = path.join(DATA_DIR, 'users');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const BOT_CONFIG_FILE = path.join(DATA_DIR, 'bot_config.json');
const LOGS_FILE = path.join(DATA_DIR, 'telegram_logs.json');

// Global Legacy files (for auto-migration)
const LEGACY_TX_FILE = path.join(DATA_DIR, 'transactions.json');
const LEGACY_BUDGETS_FILE = path.join(DATA_DIR, 'budgets.json');

// Types
export interface LinkedMember {
  id: string; // e.g. "mem_838107368"
  name: string; // Telegram user name e.g. "Ansh", "Pooja"
  customAlias?: string; // Optional custom nickname e.g. "Wife", "Husband", "Mom"
  role?: 'owner' | 'member' | 'partner' | 'family';
  telegramChatId: string;
  telegramUsername?: string;
  linkedAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  password?: string;
  telegramChatId?: string;
  telegramUsername?: string;
  linkedMembers?: LinkedMember[]; // Multiple connected family / team members
  linkCode: string; // 6-digit linking code
  createdAt: string;
}

export type TransactionType = 'income' | 'expense';
export type PaymentMethod = 'UPI' | 'Cash' | 'Card' | 'Net Banking' | 'Bank Transfer' | 'Other';

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  date: string; // YYYY-MM-DD
  time?: string;
  paymentMethod?: PaymentMethod;
  source: 'telegram' | 'manual' | 'simulator' | 'import';
  telegramChatId?: string;
  telegramMessageId?: number;
  telegramUser?: string;
  rawMessage?: string;
  createdAt: string;
  tags?: string[];
}

export interface CategoryDef {
  id: string;
  name: string;
  type: TransactionType | 'both';
  icon: string;
  color: string;
  bgLight?: string;
  keywords: string[];
  isCustom?: boolean;
  isDefault?: boolean;
  description?: string;
}

export interface CategoryBudget {
  category: string;
  limit: number;
  spent?: number;
  period: 'monthly';
}

export interface TelegramLog {
  id: string;
  userId?: string;
  timestamp: string;
  type: 'incoming_message' | 'webhook_setup' | 'webhook_error' | 'bot_reply' | 'parse_error';
  chatId?: string;
  user?: string;
  rawText?: string;
  parsedTransactions?: Array<{
    type: TransactionType;
    amount: number;
    category: string;
    description: string;
  }>;
  botReply?: string;
  status: 'success' | 'warning' | 'error';
  details?: string;
}

export interface BotConfig {
  botToken: string;
  botUsername?: string;
  botName?: string;
  webhookUrl?: string;
  isWebhookSet: boolean;
  isConnected?: boolean;
  lastWebhookCheck?: string;
  pendingUpdateCount?: number;
  lastError?: string;
}

export interface FinancialSummary {
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  savingsRate: number;
  transactionCount: number;
  incomeCount: number;
  expenseCount: number;
  monthlyBudget: number;
  monthlySpent: number;
  dailyAverageExpense: number;
}

// Default standard categories including Uncategorized
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  {
    id: 'food_dining',
    name: 'Food & Dining',
    type: 'expense',
    icon: 'Utensils',
    color: '#F97316',
    bgLight: 'bg-orange-50 text-orange-700 border-orange-200',
    keywords: ['zomato', 'swiggy', 'food', 'restaurant', 'dinner', 'lunch', 'breakfast', 'snack', 'cafe', 'starbucks', 'chai', 'tea', 'coffee', 'mcdonalds', 'kfc', 'burger', 'pizza', 'biryani', 'dhaba', 'dahi', 'curd', 'eating out'],
    isDefault: true,
  },
  {
    id: 'groceries',
    name: 'Groceries & Sabzi',
    type: 'expense',
    icon: 'ShoppingCart',
    color: '#10B981',
    bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    keywords: ['vegetable', 'vegetables', 'sabzi', 'grocery', 'groceries', 'supermarket', 'blinkit', 'zepto', 'instamart', 'bigbasket', 'milk', 'doodh', 'fruits', 'd-mart', 'ration', 'bread', 'eggs', 'paneer', 'chicken', 'mutton', 'atta', 'rice'],
    isDefault: true,
  },
  {
    id: 'transport',
    name: 'Transportation & Fuel',
    type: 'expense',
    icon: 'Car',
    color: '#3B82F6',
    bgLight: 'bg-blue-50 text-blue-700 border-blue-200',
    keywords: ['petrol', 'diesel', 'fuel', 'uber', 'ola', 'rapido', 'auto', 'rickshaw', 'cab', 'metro', 'bus', 'train', 'flight', 'ticket', 'toll', 'parking', 'car wash', 'bike service', 'scooter'],
    isDefault: true,
  },
  {
    id: 'bills_utilities',
    name: 'Bills & Utilities',
    type: 'expense',
    icon: 'Zap',
    color: '#EAB308',
    bgLight: 'bg-amber-50 text-amber-700 border-amber-200',
    keywords: ['electricity', 'bijli', 'wifi', 'internet', 'broadband', 'water', 'gas', 'cylinder', 'mobile', 'recharge', 'jio', 'airtel', 'vi', 'maintenance', 'house tax', 'dth', 'bill'],
    isDefault: true,
  },
  {
    id: 'shopping',
    name: 'Shopping & Apparel',
    type: 'expense',
    icon: 'ShoppingBag',
    color: '#EC4899',
    bgLight: 'bg-pink-50 text-pink-700 border-pink-200',
    keywords: ['amazon', 'flipkart', 'myntra', 'clothes', 'shoes', 'electronics', 'shopping', 'meesho', 'zara', 'h&m', 'tshirt', 'jeans', 'watch', 'gadget', 'headphones', 'cosmetics', 'mall'],
    isDefault: true,
  },
  {
    id: 'housing_rent',
    name: 'Rent & Housing',
    type: 'expense',
    icon: 'Home',
    color: '#8B5CF6',
    bgLight: 'bg-purple-50 text-purple-700 border-purple-200',
    keywords: ['rent', 'kiraya', 'room rent', 'pg', 'flat rent', 'deposit', 'house', 'furniture', 'plumber', 'electrician', 'maid', 'kamwali', 'cook'],
    isDefault: true,
  },
  {
    id: 'entertainment',
    name: 'Entertainment & Fun',
    type: 'expense',
    icon: 'Film',
    color: '#06B6D4',
    bgLight: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    keywords: ['movie', 'cinema', 'pvr', 'inox', 'netflix', 'prime', 'spotify', 'hotstar', 'gaming', 'steam', 'party', 'concert', 'club', 'outing', 'trip', 'vacation', 'resort'],
    isDefault: true,
  },
  {
    id: 'healthcare',
    name: 'Healthcare & Fitness',
    type: 'expense',
    icon: 'HeartPulse',
    color: '#EF4444',
    bgLight: 'bg-rose-50 text-rose-700 border-rose-200',
    keywords: ['medicine', 'doctor', 'hospital', 'clinic', 'pharmacy', 'medical', 'gym', 'protein', 'supplements', 'test', 'dentist', 'apollo', 'pharmeasy', 'health insurance'],
    isDefault: true,
  },
  {
    id: 'investment',
    name: 'Investments & Savings',
    type: 'expense',
    icon: 'TrendingUp',
    color: '#14B8A6',
    bgLight: 'bg-teal-50 text-teal-700 border-teal-200',
    keywords: ['sip', 'mutual fund', 'stocks', 'share market', 'crypto', 'gold', 'fd', 'rd', 'ppf', 'nps', 'zerodha', 'groww', 'savings'],
    isDefault: true,
  },
  {
    id: 'education',
    name: 'Education & Learning',
    type: 'expense',
    icon: 'GraduationCap',
    color: '#6366F1',
    bgLight: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    keywords: ['fees', 'course', 'books', 'udemy', 'college', 'school', 'tuition', 'coaching', 'subscription', 'exam', 'certifications'],
    isDefault: true,
  },
  {
    id: 'other_expense',
    name: 'Other Expense',
    type: 'expense',
    icon: 'MoreHorizontal',
    color: '#64748B',
    bgLight: 'bg-slate-50 text-slate-700 border-slate-200',
    keywords: ['misc', 'gift', 'donation', 'fine', 'penalty', 'cash out', 'other'],
    isDefault: true,
  },
  // Income Categories
  {
    id: 'salary',
    name: 'Salary & Employment',
    type: 'income',
    icon: 'Briefcase',
    color: '#10B981',
    bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    keywords: ['salary', 'income', 'stipend', 'paycheck', 'wages', 'bonus', 'appraisal', 'incentive', 'overtime', 'job'],
    isDefault: true,
  },
  {
    id: 'freelance_business',
    name: 'Freelance & Business',
    type: 'income',
    icon: 'Laptop',
    color: '#0EA5E9',
    bgLight: 'bg-sky-50 text-sky-700 border-sky-200',
    keywords: ['freelance', 'client', 'consulting', 'project', 'business', 'profit', 'sales', 'upwork', 'fiverr', 'contract', 'invoice'],
    isDefault: true,
  },
  {
    id: 'investments_income',
    name: 'Investment Returns & Dividends',
    type: 'income',
    icon: 'Coins',
    color: '#8B5CF6',
    bgLight: 'bg-purple-50 text-purple-700 border-purple-200',
    keywords: ['dividend', 'interest', 'capital gains', 'crypto profit', 'rental income', 'rent received', 'returns'],
    isDefault: true,
  },
  {
    id: 'cashback_refunds',
    name: 'Cashback & Refunds',
    type: 'income',
    icon: 'BadgePercent',
    color: '#F59E0B',
    bgLight: 'bg-amber-50 text-amber-700 border-amber-200',
    keywords: ['cashback', 'refund', 'reward', 'gpay scratch', 'credit', 'reimbursement', 'returned'],
    isDefault: true,
  },
  {
    id: 'gift_income',
    name: 'Gifts & Allowance',
    type: 'income',
    icon: 'Gift',
    color: '#EC4899',
    bgLight: 'bg-pink-50 text-pink-700 border-pink-200',
    keywords: ['gift', 'pocket money', 'allowance', 'papa sent', 'mom sent', 'shagun', 'prize', 'won'],
    isDefault: true,
  },
  {
    id: 'other_income',
    name: 'Other Income',
    type: 'income',
    icon: 'Wallet',
    color: '#10B981',
    bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    keywords: ['income', 'credit', 'received', 'credited', 'other'],
    isDefault: true,
  },
  // Uncategorized / Undefined Fallback Category
  {
    id: 'uncategorized',
    name: 'Uncategorized',
    type: 'both',
    icon: 'HelpCircle',
    color: '#94A3B8',
    bgLight: 'bg-slate-100 text-slate-700 border-slate-300',
    keywords: ['undefined', 'uncategorized', 'unknown', 'misc', 'random'],
    isDefault: true,
    description: 'Auto-assigned when item does not match existing categories or needs review',
  },
];

const DEFAULT_BUDGETS: CategoryBudget[] = [
  { category: 'Food & Dining', limit: 6000, period: 'monthly' },
  { category: 'Groceries & Sabzi', limit: 4000, period: 'monthly' },
  { category: 'Transportation & Fuel', limit: 3500, period: 'monthly' },
  { category: 'Bills & Utilities', limit: 3000, period: 'monthly' },
  { category: 'Shopping & Apparel', limit: 5000, period: 'monthly' },
  { category: 'Entertainment & Fun', limit: 2500, period: 'monthly' },
  { category: 'Healthcare & Fitness', limit: 2000, period: 'monthly' },
  { category: 'Investments & Savings', limit: 15000, period: 'monthly' },
];

// In-Memory store with File sync
function loadJson<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Error loading ${filePath}:`, err);
  }
  return defaultValue;
}

function saveJson<T>(filePath: string, data: T): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error saving ${filePath}:`, err);
  }
}

// Generate random 6-digit numeric link code
function generateLinkCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ---------------- Multi-User Data Management ----------------

interface UserDataStore {
  transactions: Transaction[];
  budgets: CategoryBudget[];
  categories: CategoryDef[];
}

let users: UserProfile[] = loadJson<UserProfile[]>(USERS_FILE, []);
let telegramLogs: TelegramLog[] = loadJson<TelegramLog[]>(LOGS_FILE, []);
let botConfig: BotConfig = loadJson<BotConfig>(BOT_CONFIG_FILE, {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '8805911705:AAFqlnYNiguHCdar15R3XX8JJkuI0nXNanc',
  isWebhookSet: true,
  isConnected: true,
  botUsername: 'khata_ansh_bot',
  botName: 'khatabot',
});

// Initialize default users if empty & migrate linkedMembers
if (users.length === 0) {
  const defaultUser: UserProfile = {
    id: 'user_ansh',
    name: 'Ansh',
    email: 'ansh@teleexpense.ai',
    linkedMembers: [],
    linkCode: '838107',
    createdAt: new Date().toISOString(),
  };
  users.push(defaultUser);
  saveJson(USERS_FILE, users);
} else {
  let modified = false;
  for (const u of users) {
    if (!u.linkedMembers) {
      u.linkedMembers = [];
      if (u.telegramChatId) {
        u.linkedMembers.push({
          id: `mem_${u.telegramChatId}`,
          name: u.telegramUsername || u.name,
          customAlias: `${u.name} (Owner)`,
          role: 'owner',
          telegramChatId: u.telegramChatId,
          telegramUsername: u.telegramUsername,
          linkedAt: u.createdAt || new Date().toISOString(),
        });
      }
      modified = true;
    }
  }
  if (modified) {
    saveJson(USERS_FILE, users);
  }
}

// Helper to get a user's data file path
function getUserDataFilePath(userId: string): string {
  return path.join(USERS_DIR, `${userId}.json`);
}

// Cache of loaded user data
const userDataCache = new Map<string, UserDataStore>();

function getUserData(userId: string): UserDataStore {
  if (userDataCache.has(userId)) {
    return userDataCache.get(userId)!;
  }

  const filePath = getUserDataFilePath(userId);
  let store: UserDataStore;

  if (fs.existsSync(filePath)) {
    store = loadJson<UserDataStore>(filePath, {
      transactions: [],
      budgets: [...DEFAULT_BUDGETS],
      categories: [...DEFAULT_CATEGORIES],
    });
    // Ensure default categories exist if custom array is corrupted or missing uncategorized
    if (!store.categories || store.categories.length === 0) {
      store.categories = [...DEFAULT_CATEGORIES];
    } else if (!store.categories.some(c => c.name.toLowerCase() === 'uncategorized' || c.id === 'uncategorized')) {
      store.categories.push(DEFAULT_CATEGORIES.find(c => c.id === 'uncategorized')!);
    }
  } else {
    // Check if legacy files exist to migrate to primary user
    let initialTx: Transaction[] = [];
    let initialBudgets: CategoryBudget[] = [...DEFAULT_BUDGETS];

    if (userId === 'user_ansh' && fs.existsSync(LEGACY_TX_FILE)) {
      initialTx = loadJson<Transaction[]>(LEGACY_TX_FILE, []).map(t => ({ ...t, userId }));
    }
    if (userId === 'user_ansh' && fs.existsSync(LEGACY_BUDGETS_FILE)) {
      initialBudgets = loadJson<CategoryBudget[]>(LEGACY_BUDGETS_FILE, DEFAULT_BUDGETS);
    }

    store = {
      transactions: initialTx,
      budgets: initialBudgets,
      categories: [...DEFAULT_CATEGORIES],
    };
    saveJson(filePath, store);
  }

  userDataCache.set(userId, store);
  return store;
}

function saveUserData(userId: string, store: UserDataStore): void {
  userDataCache.set(userId, store);
  const filePath = getUserDataFilePath(userId);
  saveJson(filePath, store);
}

// Helper to sanitize UserProfile removing sensitive credentials
function toSafeUser(u: UserProfile | null) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    hasPassword: Boolean(u.password),
    telegramChatId: u.telegramChatId,
    telegramUsername: u.telegramUsername,
    linkedMembers: u.linkedMembers || [],
    linkCode: u.linkCode,
    createdAt: u.createdAt,
  };
}

// Helper to resolve request user from headers or query
function getRequestUser(req: express.Request): UserProfile | null {
  const authHeader = req.headers['authorization'];
  const userIdHeader = req.headers['x-user-id'] as string;
  const userQuery = req.query.userId as string;

  let targetId = userIdHeader || userQuery;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const rawToken = authHeader.replace('Bearer ', '').trim();
    try {
      if (rawToken.length > 20) {
        const decoded = JSON.parse(Buffer.from(rawToken, 'base64').toString('utf-8'));
        if (decoded && decoded.userId) {
          targetId = decoded.userId;
        }
      } else {
        targetId = rawToken;
      }
    } catch {
      targetId = rawToken;
    }
  }

  if (targetId) {
    const found = users.find(u => u.id === targetId || u.email.toLowerCase() === targetId.toLowerCase());
    if (found) return found;
  }

  return null;
}

// Calculate Financial Summary for a user
function calculateUserSummary(userId: string): FinancialSummary {
  const store = getUserData(userId);
  const txList = store.transactions;
  const budgetList = store.budgets;

  let totalIncome = 0;
  let totalExpense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let monthlySpent = 0;

  const now = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  for (const t of txList) {
    if (t.type === 'income') {
      totalIncome += t.amount;
      incomeCount++;
    } else {
      totalExpense += t.amount;
      expenseCount++;
      if (t.date && t.date.startsWith(currentMonthPrefix)) {
        monthlySpent += t.amount;
      }
    }
  }

  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.max(0, Math.round((netSavings / totalIncome) * 100)) : 0;
  const monthlyBudget = budgetList.reduce((acc, b) => acc + (b.limit || 0), 0);

  const daysInMonthSoFar = Math.max(1, now.getDate());
  const dailyAverageExpense = Math.round(monthlySpent / daysInMonthSoFar);

  return {
    totalIncome,
    totalExpense,
    netSavings,
    savingsRate,
    transactionCount: txList.length,
    incomeCount,
    expenseCount,
    monthlyBudget,
    monthlySpent,
    dailyAverageExpense,
  };
}

// Gemini AI Client setup
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ---------------- Payment Method Detection ----------------

export function detectPaymentMethod(text: string): PaymentMethod {
  const lower = text.toLowerCase();

  // Cash detection
  if (
    /\b(cash|nagad|rokda|in cash|by cash|cash me|cash diya|cash mila)\b/i.test(lower) ||
    lower.endsWith(' cash') ||
    lower.startsWith('cash ')
  ) {
    return 'Cash';
  }

  // Card detection
  if (/\b(card|credit card|debit card|visa|mastercard|amex|rupay card|pos)\b/i.test(lower)) {
    return 'Card';
  }

  // Bank Transfer / Net Banking
  if (/\b(bank|net banking|netbanking|bank transfer|neft|rtgs|imps|cheque|account transfer|salary credit)\b/i.test(lower)) {
    return 'Bank Transfer';
  }

  // UPI detection (very common in India)
  if (/\b(upi|gpay|google pay|phonepe|phone pe|paytm|bhim|cred|scan|qr|amazon pay)\b/i.test(lower)) {
    return 'UPI';
  }

  // Default to UPI for general digital messages, or Cash if implied
  return 'UPI';
}

// ---------------- Fallback Rule-based parser ----------------

function parseFallback(rawText: string, userCategories: CategoryDef[]): Array<{
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  date?: string;
  paymentMethod?: PaymentMethod;
}> {
  const results: Array<{
    type: TransactionType;
    amount: number;
    category: string;
    description: string;
    date?: string;
    paymentMethod?: PaymentMethod;
  }> = [];

  const text = rawText.trim();
  const segments = text.split(/,|\n|\band\b|\baur\b/i).map(s => s.trim()).filter(Boolean);

  for (const seg of segments) {
    const segLower = seg.toLowerCase();

    // Detect Payment Method for this segment
    const paymentMethod = detectPaymentMethod(seg);

    // Date extraction
    let extractedDate: string | undefined = undefined;
    const dateMatch = seg.match(/(?:on\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(?:\d{2,4})?)/i) ||
                      seg.match(/(?:on\s+)?(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);

    if (dateMatch) {
      try {
        const parsed = new Date(dateMatch[1]);
        if (!isNaN(parsed.getTime())) {
          extractedDate = parsed.toISOString().split('T')[0];
        }
      } catch (e) {}
    }

    if (segLower.includes('yesterday') || segLower.includes('kal')) {
      const yesterday = new Date(Date.now() - 86400000);
      extractedDate = yesterday.toISOString().split('T')[0];
    } else if (segLower.includes('today') || segLower.includes('aaj')) {
      extractedDate = new Date().toISOString().split('T')[0];
    }

    // Extract amount with strict unit boundary detection
    // Matches: "250", "₹250", "rs 250", "2.5k", "5k", "10 thousand", "2 lakh", "1.5 cr"
    // DOES NOT trigger on words starting with 'k' like "250 kamla", "250 kurkure", "100 kaju"
    const amountMatch = seg.match(/(?:(?:rs\.?|inr|₹)\s*)?(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|thousand|hazar|lakh|lakhs|lac|lacs|cr|crore|crores)?(?:\s*(?:rs\.?|inr|₹|rupees|rupaye))?(?!\w)/i);
    if (!amountMatch) continue;

    let amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    const unit = amountMatch[2]?.toLowerCase();

    if (unit === 'k' || unit === 'thousand' || unit === 'hazar') {
      amount = amount * 1000;
    } else if (unit === 'lakh' || unit === 'lakhs' || unit === 'lac' || unit === 'lacs') {
      amount = amount * 100000;
    } else if (unit === 'cr' || unit === 'crore' || unit === 'crores') {
      amount = amount * 10000000;
    }

    if (isNaN(amount) || amount <= 0) continue;

    // Detect Income vs Expense
    const isIncome =
      segLower.includes('income') ||
      segLower.includes('salary') ||
      segLower.includes('credited') ||
      segLower.includes('received') ||
      segLower.includes('aaye') ||
      segLower.includes('kamai') ||
      segLower.includes('freelance') ||
      segLower.includes('cashback') ||
      segLower.includes('dividend') ||
      segLower.includes('refund') ||
      segLower.includes('bonus') ||
      segLower.startsWith('+');

    const type: TransactionType = isIncome ? 'income' : 'expense';

    // Clean description: remove the amount and unit while preserving the item description (e.g. "Kamla pasand")
    let cleanDesc = seg
      .replace(/(?:rs\.?|inr|₹)\s*\d+(?:,\d+)*(?:\.\d+)?/gi, '')
      .replace(/\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:k|thousand|hazar|lakh|lakhs|lac|lacs|cr|crore|crores)?\b/gi, '')
      .replace(/(?:on\s+)?(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(?:\d{2,4})?)/gi, '')
      .replace(/(?:on\s+)?(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi, '')
      .replace(/\b(income|expense|spent|paid|kharcha|diya|credited|received|on|at|for|yesterday|today|kal|aaj|rupees|rs|inr|₹|cash|upi|gpay|paytm|phonepe|card|bank|transfer|rokda|nagad)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanDesc || cleanDesc.length < 2) {
      cleanDesc = isIncome ? 'Income' : 'Expense';
    }

    // Match against user's categories
    let matchedCategory = 'Uncategorized';
    const targetType = type;

    // Exact or keyword match
    for (const cat of userCategories) {
      if (cat.type !== targetType && cat.type !== 'both') continue;
      if (cat.name.toLowerCase() === cleanDesc.toLowerCase()) {
        matchedCategory = cat.name;
        break;
      }
      if (cat.keywords && cat.keywords.some(k => segLower.includes(k.toLowerCase()) || cleanDesc.toLowerCase().includes(k.toLowerCase()))) {
        matchedCategory = cat.name;
        break;
      }
    }

    results.push({
      type,
      amount,
      category: matchedCategory,
      description: cleanDesc.charAt(0).toUpperCase() + cleanDesc.slice(1),
      date: extractedDate || new Date().toISOString().split('T')[0],
      paymentMethod,
    });
  }

  return results;
}

// ---------------- AI Message Parser with Dynamic Categories & Payment Methods ----------------

async function parseMessageWithGemini(
  rawText: string,
  userCategories: CategoryDef[]
): Promise<Array<{
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  date: string;
  paymentMethod: PaymentMethod;
  tags?: string[];
}>> {
  const fallback = parseFallback(rawText, userCategories);
  const ai = getGeminiClient();
  const currentDate = new Date().toISOString().split('T')[0];

  if (!ai) {
    return fallback.map(f => ({
      ...f,
      date: f.date || currentDate,
      paymentMethod: f.paymentMethod || 'UPI',
    }));
  }

  const categoryNames = userCategories.map(c => c.name);
  // Ensure Uncategorized is in prompt options
  if (!categoryNames.includes('Uncategorized')) {
    categoryNames.push('Uncategorized');
  }

  const prompt = `You are an expert financial transaction parser for an Indian personal ledger.
Analyze the user's message (which can be in English, Hindi, or Hinglish, e.g. "300 dahi cash", "500 petrol upi", "income 15000 bank transfer", "bought t-shirt 800 card", "sabzi 120").

Current date: ${currentDate}

CRITICAL RULES:
1. Extract every transaction.
2. Payment Method Detection:
   - If user wrote "cash", "nagad", "rokda" -> paymentMethod: "Cash"
   - If user wrote "upi", "gpay", "phonepe", "paytm", "bhim", "scan" -> paymentMethod: "UPI"
   - If user wrote "card", "visa", "mastercard", "credit", "debit" -> paymentMethod: "Card"
   - If user wrote "bank transfer", "net banking", "neft", "imps", "bank" -> paymentMethod: "Bank Transfer"
   - If not specified, default to "UPI" (or "Cash" if implied by grocery/chai).
3. Category Assignment:
   - You MUST pick the best category from ONLY this exact list of the user's active categories:
   ${JSON.stringify(categoryNames)}
   - CRITICAL REQUIREMENT: If the product/service does not clearly belong to any existing category, or if you are uncertain, you MUST set category to "Uncategorized".
4. Clean description:
   - "300 dahi cash" -> description: "Dahi", amount: 300, paymentMethod: "Cash"
   - "500 petrol upi" -> description: "Petrol", amount: 500, paymentMethod: "UPI"
   - "salary 50000 bank transfer" -> description: "Salary", amount: 50000, paymentMethod: "Bank Transfer"

User message:
"""
${rawText}
"""`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['income', 'expense'] },
              amount: { type: Type.NUMBER },
              category: { type: Type.STRING },
              description: { type: Type.STRING },
              date: { type: Type.STRING },
              paymentMethod: { type: Type.STRING, enum: ['UPI', 'Cash', 'Card', 'Net Banking', 'Bank Transfer', 'Other'] },
              tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['type', 'amount', 'category', 'description', 'date', 'paymentMethod'],
          },
        },
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: any) => {
          let cat = item.category || 'Uncategorized';
          if (!categoryNames.includes(cat)) {
            cat = 'Uncategorized';
          }
          return {
            type: item.type === 'income' ? 'income' : 'expense',
            amount: Math.abs(Number(item.amount)),
            category: cat,
            description: item.description || 'Transaction',
            date: item.date || currentDate,
            paymentMethod: (item.paymentMethod as PaymentMethod) || detectPaymentMethod(rawText),
            tags: Array.isArray(item.tags) ? item.tags : [],
          };
        });
      }
    }
  } catch (err: any) {
    console.error('Gemini parsing error, falling back:', err.message);
  }

  return fallback.map(f => ({
    ...f,
    date: f.date || currentDate,
    paymentMethod: f.paymentMethod || 'UPI',
  }));
}

// ---------------- Helper to send Telegram message ----------------

async function sendTelegramReply(botToken: string, chatId: string | number, text: string): Promise<boolean> {
  if (!botToken || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      // Retry in plain text without HTML tags in case of unescaped chars
      const plainText = text.replace(/<[^>]*>/g, '');
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: plainText,
        }),
      });
    }
    return true;
  } catch (err) {
    console.error('Failed to send Telegram reply:', err);
    return false;
  }
}

// ---------------- Telegram Message Ingestion Logic ----------------

async function handleTelegramMessage(messageObj: any) {
  const chatId = String(messageObj.chat.id);
  const userName = messageObj.from?.first_name || messageObj.from?.username || 'User';
  const rawText = (messageObj.text || '').trim();
  const botToken = botConfig.botToken;

  if (!rawText || !botToken) return;

  const lowerText = rawText.toLowerCase().trim();
  const command = rawText.split(' ')[0].toLowerCase();
  const commandArg = rawText.split(' ').slice(1).join(' ').trim();

  // 1. Check for Linking Command (/link <code> or /start <code>)
  if (command === '/link' || (command === '/start' && commandArg && /^\d{6}$/.test(commandArg))) {
    const linkCode = commandArg.replace(/[^0-9]/g, '');
    // Refresh users from file to ensure fresh state
    users = loadJson<UserProfile[]>(USERS_FILE, users);
    const userToLink = users.find(u => u.linkCode === linkCode);

    if (userToLink) {
      // Clean up this chatId from all other users so there's no conflict
      for (const u of users) {
        if (u.id !== userToLink.id) {
          if (u.telegramChatId === chatId) {
            delete u.telegramChatId;
            delete u.telegramUsername;
          }
          if (u.linkedMembers) {
            u.linkedMembers = u.linkedMembers.filter(m => m.telegramChatId !== chatId);
          }
        }
      }

      if (!userToLink.linkedMembers) {
        userToLink.linkedMembers = [];
      }

      const isFirst = userToLink.linkedMembers.length === 0 && !userToLink.telegramChatId;
      const memberName = messageObj.from?.first_name || userName || (isFirst ? userToLink.name : 'Family Member');
      const existingMemberIdx = userToLink.linkedMembers.findIndex(m => m.telegramChatId === chatId);

      if (existingMemberIdx >= 0) {
        userToLink.linkedMembers[existingMemberIdx].name = memberName;
        userToLink.linkedMembers[existingMemberIdx].telegramUsername = messageObj.from?.username || userName;
      } else {
        userToLink.linkedMembers.push({
          id: `mem_${chatId}`,
          name: memberName,
          customAlias: isFirst ? `${userToLink.name} (Owner)` : memberName,
          role: isFirst ? 'owner' : 'family',
          telegramChatId: chatId,
          telegramUsername: messageObj.from?.username || userName,
          linkedAt: new Date().toISOString(),
        });
      }

      if (!userToLink.telegramChatId) {
        userToLink.telegramChatId = chatId;
        userToLink.telegramUsername = messageObj.from?.username || userName;
      }

      saveJson(USERS_FILE, users);

      const totalMembers = userToLink.linkedMembers.length;
      await sendTelegramReply(
        botToken,
        chatId,
        `🎉 <b>Connected to ${userToLink.name}'s Shared Account!</b>\n\nHello <b>${memberName}</b>! You are now connected to <b>${userToLink.name}'s</b> ledger (<b>${userToLink.email}</b>).\n👥 <b>Total Connected Members:</b> ${totalMembers}\n\n💡 <b>Now you can log expenses together:</b>\n• <code>500 sabzi cash</code>\n• <code>300 petrol upi</code>\n• <code>1200 groceries card</code>\n\nAll entries will automatically reflect in the shared dashboard!`
      );
      return;
    } else {
      await sendTelegramReply(
        botToken,
        chatId,
        `❌ <b>Invalid Link Code.</b>\n\nPlease check your 6-digit code on the TeleExpense Dashboard (top right profile) and try again:\n<code>/link 123456</code>`
      );
      return;
    }
  }

  // 2. Resolve User from Chat ID (Search in linkedMembers first, then primary ID)
  let targetUser = users.find(
    u => u.linkedMembers && u.linkedMembers.some(m => m.telegramChatId === chatId)
  );
  if (!targetUser) {
    targetUser = users.find(u => u.telegramChatId === chatId);
  }

  // If unlinked user
  if (!targetUser) {
    // If only one user exists in system, offer quick auto-link
    if (users.length === 1 && (!users[0].telegramChatId || users[0].telegramChatId === chatId)) {
      targetUser = users[0];
      if (!targetUser.linkedMembers) targetUser.linkedMembers = [];
      targetUser.telegramChatId = chatId;
      targetUser.telegramUsername = messageObj.from?.username || userName;
      if (!targetUser.linkedMembers.some(m => m.telegramChatId === chatId)) {
        targetUser.linkedMembers.push({
          id: `mem_${chatId}`,
          name: userName || targetUser.name,
          customAlias: `${targetUser.name} (Owner)`,
          role: 'owner',
          telegramChatId: chatId,
          telegramUsername: messageObj.from?.username || userName,
          linkedAt: new Date().toISOString(),
        });
      }
      saveJson(USERS_FILE, users);
    } else {
      await sendTelegramReply(
        botToken,
        chatId,
        `👋 <b>Welcome to TeleExpense AI Shared Ledger!</b>\n\nYour Telegram is not yet linked to an account.\n\n🔑 <b>Your Telegram Chat ID:</b> <code>${chatId}</code>\n\n<b>How to connect:</b>\n1. Open your TeleExpense Dashboard or ask the account owner for their 6-digit <b>Link Code</b>\n2. Reply here:\n<code>/link &lt;YOUR_CODE&gt;</code>\n\n<i>Example:</i> <code>/link 838107</code>\n\n💡 <i>Multiple family members or partners can link to the SAME account!</i>`
      );
      return;
    }
  }

  const userId = targetUser.id;
  const userStore = getUserData(userId);
  const userTransactions = userStore.transactions;
  const userCategories = userStore.categories;

  // Resolve sender member identity
  const senderMember = targetUser.linkedMembers?.find(m => m.telegramChatId === chatId);
  const senderDisplayName = senderMember?.customAlias || senderMember?.name || userName || 'Telegram User';

  // 3. Help & Commands
  if (command === '/start' || command === '/help') {
    const welcomeMsg = `👋 <b>Namaste ${targetUser.name}! Welcome to TeleExpense AI</b> 💰

Logged in as: <b>${targetUser.email}</b>

📌 <b>Examples to try:</b>
• <code>300 dahi cash</code>
• <code>500 petrol upi</code>
• <code>100 vegetable</code>
• <code>salary 50000 bank transfer</code>
• <code>bought jeans 1200 card</code>

🗑️ <b>Delete Commands:</b>
• <code>/undo</code> or <code>/delete</code> - Delete last transaction
• <code>/delete 1</code> - Delete item #1 from /recent
• <code>delete dahi</code> - Delete matching item
• <code>/clearall</code> - Delete all transactions

📊 <b>Commands:</b>
/balance - Check current total balance
/summary - View monthly summary
/recent - Last 5 transactions
/categories - View your active categories
/help - Show this guide`;
    await sendTelegramReply(botToken, chatId, welcomeMsg);
    return;
  }

  // 4. View user categories command
  if (command === '/categories' || command === '/cats') {
    const expenseCats = userCategories.filter(c => c.type === 'expense' || c.type === 'both').map(c => `• ${c.name}`).join('\n');
    const incomeCats = userCategories.filter(c => c.type === 'income' || c.type === 'both').map(c => `• ${c.name}`).join('\n');
    await sendTelegramReply(
      botToken,
      chatId,
      `📂 <b>Your Active Categories:</b>\n\n🔴 <b>Expense Categories:</b>\n${expenseCats}\n\n🟢 <b>Income Categories:</b>\n${incomeCats}\n\n💡 <i>You can add custom categories from your Web Dashboard anytime!</i>`
    );
    return;
  }

  // 5. Clear all command
  if (command === '/clearall' || command === '/deleteall' || lowerText === 'clear all' || lowerText === 'sab delete karo') {
    const count = userTransactions.length;
    if (count === 0) {
      await sendTelegramReply(botToken, chatId, 'ℹ️ No transactions to delete.');
      return;
    }
    userTransactions.length = 0;
    saveUserData(userId, userStore);
    await sendTelegramReply(botToken, chatId, `🗑️ <b>All ${count} transactions cleared successfully!</b>\n\n📊 <b>Total Balance:</b> ₹0`);
    return;
  }

  // 6. Balance / Summary command
  if (command === '/balance' || command === '/summary') {
    const summary = calculateUserSummary(userId);
    const summaryMsg = `📊 <b>${targetUser.name}'s Financial Summary</b>\n\n💰 <b>Net Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}\n🟢 <b>Total Income:</b> ₹${summary.totalIncome.toLocaleString('en-IN')}\n🔴 <b>Total Expense:</b> ₹${summary.totalExpense.toLocaleString('en-IN')}\n📈 <b>Savings Rate:</b> ${summary.savingsRate}%\n📝 <b>Total Transactions:</b> ${summary.transactionCount}`;
    await sendTelegramReply(botToken, chatId, summaryMsg);
    return;
  }

  // 7. Recent command
  if (command === '/recent') {
    const recent = userTransactions.slice(0, 5);
    if (recent.length === 0) {
      await sendTelegramReply(botToken, chatId, 'ℹ️ No transactions recorded yet. Send something like <code>300 dahi cash</code>!');
      return;
    }
    const list = recent.map((t, idx) => {
      const sign = t.type === 'income' ? '🟢 +' : '🔴 -';
      const pm = t.paymentMethod ? `[${t.paymentMethod}]` : '';
      return `<b>[#${idx + 1}]</b> ${sign}₹${t.amount.toLocaleString('en-IN')} • <b>${t.description}</b> (${t.category}) ${pm} <i>${t.date}</i>`;
    }).join('\n');
    await sendTelegramReply(botToken, chatId, `📝 <b>Recent Transactions:</b>\n\n${list}\n\n💡 <i>Tip: Send <code>/delete 1</code> to delete item #1</i>`);
    return;
  }

  // 8. Delete / Undo commands
  if (command === '/undo' || command === '/delete' || lowerText === 'undo' || lowerText === 'delete' || lowerText === 'delete last' || lowerText === 'hatao') {
    const parts = rawText.split(/\s+/);
    if (parts.length > 1 && /^\d+$/.test(parts[1])) {
      const targetIndex = parseInt(parts[1], 10) - 1;
      if (targetIndex >= 0 && targetIndex < userTransactions.length) {
        const [deleted] = userTransactions.splice(targetIndex, 1);
        saveUserData(userId, userStore);
        const summary = calculateUserSummary(userId);
        await sendTelegramReply(
          botToken,
          chatId,
          `🗑️ <b>Deleted Transaction #${targetIndex + 1}:</b>\n₹${deleted.amount} • ${deleted.description} (${deleted.category})\n\n📊 <b>Updated Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}`
        );
        return;
      } else {
        await sendTelegramReply(botToken, chatId, `⚠️ Invalid index. Send <code>/recent</code> to view transaction numbers.`);
        return;
      }
    }

    if (userTransactions.length === 0) {
      await sendTelegramReply(botToken, chatId, 'ℹ️ No transactions found to delete.');
      return;
    }
    const deleted = userTransactions.shift();
    saveUserData(userId, userStore);
    const summary = calculateUserSummary(userId);
    await sendTelegramReply(
      botToken,
      chatId,
      `🗑️ <b>Deleted Last Transaction:</b>\n₹${deleted?.amount} • ${deleted?.description} (${deleted?.category})\n\n📊 <b>Updated Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}`
    );
    return;
  }

  // Delete by keyword or amount
  const deleteMatch = lowerText.match(/^(?:delete|remove|hatao|cancel)\s+(.+)$/i) || lowerText.match(/^(.+)\s+(?:delete|hatao|remove)$/i);
  if (deleteMatch && userTransactions.length > 0) {
    const query = deleteMatch[1].trim().toLowerCase();
    const queryNum = parseFloat(query.replace(/[^0-9.]/g, ''));
    let foundIdx = -1;

    if (!isNaN(queryNum) && queryNum > 0) {
      foundIdx = userTransactions.findIndex(t => Math.abs(t.amount - queryNum) < 0.01);
    }
    if (foundIdx === -1) {
      foundIdx = userTransactions.findIndex(t =>
        t.description.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query)
      );
    }

    if (foundIdx !== -1) {
      const [deleted] = userTransactions.splice(foundIdx, 1);
      saveUserData(userId, userStore);
      const summary = calculateUserSummary(userId);
      await sendTelegramReply(
        botToken,
        chatId,
        `🗑️ <b>Deleted Matching Transaction:</b>\n₹${deleted.amount} • ${deleted.description} (${deleted.category}) [${deleted.date}]\n\n📊 <b>Updated Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}`
      );
      return;
    }
  }

  // 9. AI & Fallback Transaction Parser
  try {
    const parsedList = await parseMessageWithGemini(rawText, userCategories);

    if (parsedList.length === 0) {
      const errorReply = `❓ Could not detect an expense or income from: <i>"${rawText}"</i>\n\n💡 <b>Try formats like:</b>\n• <code>300 dahi cash</code>\n• <code>500 petrol upi</code>\n• <code>income 15000 bank transfer</code>`;
      await sendTelegramReply(botToken, chatId, errorReply);
      return;
    }

    const nowIso = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

    for (const parsed of parsedList) {
      const newTx: Transaction = {
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        userId,
        type: parsed.type,
        amount: parsed.amount,
        category: parsed.category,
        description: parsed.description,
        date: parsed.date,
        time: timeStr,
        paymentMethod: parsed.paymentMethod,
        source: 'telegram',
        telegramChatId: chatId,
        telegramMessageId: messageObj.message_id,
        telegramUser: senderDisplayName,
        rawMessage: rawText,
        createdAt: nowIso,
        tags: parsed.tags || [],
      };
      userTransactions.unshift(newTx);
    }

    saveUserData(userId, userStore);
    const summary = calculateUserSummary(userId);

    let replyText = '';
    const hasMultipleMembers = (targetUser.linkedMembers?.length || 0) > 1;
    const memberTag = hasMultipleMembers ? `\n👤 <b>Logged by:</b> ${senderDisplayName}` : '';

    if (parsedList.length === 1) {
      const item = parsedList[0];
      const isInc = item.type === 'income';
      const isUncat = item.category === 'Uncategorized';
      replyText = `${isInc ? '🟢 <b>INCOME RECORDED</b>' : '🔴 <b>EXPENSE RECORDED</b>'}
💰 <b>₹${item.amount.toLocaleString('en-IN')}</b>
📁 <b>Category:</b> ${item.category}${isUncat ? ' <i>(Needs Review on Web)</i>' : ''}
📝 <b>Note:</b> ${item.description}${memberTag}
💳 <b>Payment:</b> ${item.paymentMethod || 'UPI'}
📅 <b>Date:</b> ${item.date}

━━━━━━━━━━━━━━━━━━━━
📊 <b>Shared Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}
${isInc ? `📈 <b>Total Income:</b> ₹${summary.totalIncome.toLocaleString('en-IN')}` : `📉 <b>Total Spent:</b> ₹${summary.totalExpense.toLocaleString('en-IN')}`}`;
    } else {
      const itemsList = parsedList
        .map(p => `• ${p.type === 'income' ? '🟢 +' : '🔴 -'}₹${p.amount.toLocaleString('en-IN')} ${p.description} (${p.category}) [${p.paymentMethod}]`)
        .join('\n');
      replyText = `✅ <b>${parsedList.length} TRANSACTIONS ADDED</b>${memberTag}\n\n${itemsList}\n\n━━━━━━━━━━━━━━━━━━━━\n📊 <b>Shared Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}`;
    }

    await sendTelegramReply(botToken, chatId, replyText);

    // Save log
    const logEntry: TelegramLog = {
      id: 'log_' + Date.now(),
      userId,
      timestamp: nowIso,
      type: 'incoming_message',
      chatId,
      user: userName,
      rawText,
      parsedTransactions: parsedList,
      botReply: replyText,
      status: 'success',
    };
    telegramLogs.unshift(logEntry);
    if (telegramLogs.length > 100) telegramLogs.pop();
    saveJson(LOGS_FILE, telegramLogs);
  } catch (err: any) {
    console.error('Error handling Telegram message:', err);
    await sendTelegramReply(botToken, chatId, `⚠️ Error processing: ${err.message}`);
  }
}

// ---------------- Background Telegram Polling Worker ----------------

let isPollingActive = false;
let lastUpdateId = 0;

async function startTelegramPollingWorker() {
  if (isPollingActive) return;
  isPollingActive = true;

  console.log('🤖 Starting Telegram Direct Long Polling Engine...');

  while (isPollingActive) {
    const token = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }

    try {
      const pollUrl = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=20&allowed_updates=["message","edited_message"]`;
      const response = await fetch(pollUrl);

      if (response.status === 409) {
        // Clear conflicting webhook
        await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      if (!response.ok) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      const data = await response.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          if (update.update_id > lastUpdateId) {
            lastUpdateId = update.update_id;
          }
          if (update.message) {
            await handleTelegramMessage(update.message);
          }
        }
      }
    } catch (err) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Start worker immediately
startTelegramPollingWorker();

// ---------------- REST API Endpoints ----------------

// 1. Auth & Multi-User APIs
app.get(['/api/users/me', '/api/auth/me'], (req, res) => {
  const user = getRequestUser(req);
  res.json({ 
    user: toSafeUser(user), 
    authenticated: Boolean(user)
  });
});

app.get(['/api/users', '/api/auth/users'], (req, res) => {
  const safeUsers = users.map(u => toSafeUser(u));
  res.json({ users: safeUsers });
});

// Telegram Webhook receiver
app.post('/api/telegram/webhook', async (req, res) => {
  res.status(200).send('OK');
  try {
    const update = req.body;
    if (update && update.message) {
      await handleTelegramMessage(update.message);
    }
  } catch (err: any) {
    console.error('Webhook error:', err);
  }
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const sPassword = String(password || '').trim();
  if (!sPassword || sPassword.length < 4) {
    return res.status(400).json({ error: 'Password or PIN must be at least 4 characters or digits long' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const existing = users.find(u => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists. Please log in with your password.' });
  }

  const newUser: UserProfile = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: name.trim(),
    email: cleanEmail,
    password: sPassword,
    linkCode: generateLinkCode(),
    createdAt: new Date().toISOString(),
    linkedMembers: [],
  };

  users.push(newUser);
  saveJson(USERS_FILE, users);
  getUserData(newUser.id);

  const token = Buffer.from(JSON.stringify({ userId: newUser.id, email: newUser.email, t: Date.now() })).toString('base64');
  res.json({ success: true, user: toSafeUser(newUser), token });
});

app.post('/api/auth/login', (req, res) => {
  const { email, userId, password } = req.body;
  let user: UserProfile | undefined;

  const sPassword = String(password || '').trim();

  if (userId) {
    user = users.find(u => u.id === userId);
  } else if (email) {
    user = users.find(u => u.email.toLowerCase() === String(email).toLowerCase().trim());
  }

  if (!user) {
    return res.status(404).json({ error: 'No account registered with this email address. Please create a new account.' });
  }

  // If user has a password, verify strictly
  if (user.password) {
    if (!sPassword) {
      return res.status(400).json({ error: 'Password or Security PIN is required to unlock this vault.' });
    }
    if (user.password !== sPassword) {
      return res.status(401).json({ error: 'Incorrect password or Security PIN. Access denied.' });
    }
  } else {
    // Legacy profile without password: if password supplied, set it to secure the account
    if (sPassword && sPassword.length >= 4) {
      user.password = sPassword;
      saveJson(USERS_FILE, users);
    } else if (!sPassword) {
      return res.status(400).json({
        error: 'Password required. Please enter a 4+ digit PIN or password to secure your account.',
        requiresPasswordSetup: true
      });
    }
  }

  const token = Buffer.from(JSON.stringify({ userId: user.id, email: user.email, t: Date.now() })).toString('base64');
  res.json({ success: true, user: toSafeUser(user), token });
});

app.post('/api/auth/change-password', (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in first.' });
  }

  const { currentPassword, newPassword } = req.body;
  const sNewPassword = String(newPassword || '').trim();
  const sCurrentPassword = String(currentPassword || '').trim();

  if (!sNewPassword || sNewPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters or digits long.' });
  }

  if (user.password && user.password !== sCurrentPassword) {
    return res.status(401).json({ error: 'Current password does not match.' });
  }

  user.password = sNewPassword;
  saveJson(USERS_FILE, users);

  res.json({ success: true, message: 'Security password updated successfully!', user: toSafeUser(user) });
});

app.post('/api/auth/link-telegram', (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
  }
  const { telegramChatId, telegramUsername, name } = req.body;

  if (!user.linkedMembers) user.linkedMembers = [];

  if (telegramChatId) {
    const sChatId = String(telegramChatId).trim();
    user.telegramChatId = sChatId;

    const existingIdx = user.linkedMembers.findIndex(m => m.telegramChatId === sChatId);
    if (existingIdx >= 0) {
      if (telegramUsername) user.linkedMembers[existingIdx].telegramUsername = String(telegramUsername).replace('@', '').trim();
      if (name) user.linkedMembers[existingIdx].name = name;
    } else {
      user.linkedMembers.push({
        id: `mem_${sChatId}`,
        name: name || telegramUsername || user.name,
        customAlias: `${user.name} (Owner)`,
        role: 'owner',
        telegramChatId: sChatId,
        telegramUsername: telegramUsername ? String(telegramUsername).replace('@', '').trim() : undefined,
        linkedAt: new Date().toISOString(),
      });
    }
  }

  if (telegramUsername) {
    user.telegramUsername = String(telegramUsername).replace('@', '').trim();
  }

  saveJson(USERS_FILE, users);
  res.json({ success: true, user: toSafeUser(user), members: user.linkedMembers });
});

// Member Management Endpoints
app.get('/api/auth/members', (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!user.linkedMembers) user.linkedMembers = [];
  res.json({
    linkCode: user.linkCode,
    members: user.linkedMembers,
    user: toSafeUser(user),
  });
});

app.post('/api/auth/members/alias', (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { memberId, customAlias, role } = req.body;

  if (!user.linkedMembers) user.linkedMembers = [];
  const member = user.linkedMembers.find(m => m.id === memberId || m.telegramChatId === memberId);

  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  if (customAlias !== undefined) {
    member.customAlias = customAlias.trim();
  }
  if (role) {
    member.role = role;
  }

  saveJson(USERS_FILE, users);
  res.json({ success: true, member, members: user.linkedMembers });
});

app.delete('/api/auth/members/:memberId', (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { memberId } = req.params;

  if (!user.linkedMembers) user.linkedMembers = [];
  user.linkedMembers = user.linkedMembers.filter(m => m.id !== memberId && m.telegramChatId !== memberId);

  if (user.telegramChatId === memberId || user.linkedMembers.length === 0) {
    user.telegramChatId = user.linkedMembers[0]?.telegramChatId;
    user.telegramUsername = user.linkedMembers[0]?.telegramUsername;
  }

  saveJson(USERS_FILE, users);
  res.json({ success: true, members: user.linkedMembers, user: toSafeUser(user) });
});

app.post('/api/auth/regenerate-linkcode', (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  user.linkCode = generateLinkCode();
  saveJson(USERS_FILE, users);
  res.json({ success: true, linkCode: user.linkCode, user: toSafeUser(user) });
});

// 2. Custom Categories Management APIs
app.get('/api/categories', (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.json({ categories: DEFAULT_CATEGORIES });
  }
  const store = getUserData(user.id);
  res.json({ categories: store.categories });
});

app.post('/api/categories', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  const { name, type, icon, color, keywords, description } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const categoryName = name.trim();
  const existing = store.categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'A category with this name already exists' });
  }

  const newCat: CategoryDef = {
    id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: categoryName,
    type: type === 'income' ? 'income' : (type === 'both' ? 'both' : 'expense'),
    icon: icon || 'Tag',
    color: color || '#6366F1',
    keywords: Array.isArray(keywords) ? keywords : (keywords ? keywords.split(',').map((k: string) => k.trim()).filter(Boolean) : [categoryName.toLowerCase()]),
    isCustom: true,
    description: description || '',
  };

  store.categories.push(newCat);
  saveUserData(user.id, store);

  res.json({ success: true, category: newCat, categories: store.categories });
});

app.put('/api/categories/:id', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  const { id } = req.params;
  const { name, type, icon, color, keywords, description } = req.body;

  const catIdx = store.categories.findIndex(c => c.id === id || c.name === id);
  if (catIdx === -1) {
    return res.status(404).json({ error: 'Category not found' });
  }

  const oldName = store.categories[catIdx].name;
  const newName = name ? name.trim() : oldName;

  store.categories[catIdx] = {
    ...store.categories[catIdx],
    name: newName,
    type: type || store.categories[catIdx].type,
    icon: icon || store.categories[catIdx].icon,
    color: color || store.categories[catIdx].color,
    keywords: Array.isArray(keywords) ? keywords : store.categories[catIdx].keywords,
    description: description !== undefined ? description : store.categories[catIdx].description,
  };

  // If category name changed, update all transactions under it
  if (oldName !== newName) {
    for (const t of store.transactions) {
      if (t.category === oldName) {
        t.category = newName;
      }
    }
  }

  saveUserData(user.id, store);
  res.json({ success: true, category: store.categories[catIdx], categories: store.categories });
});

app.delete('/api/categories/:id', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  const { id } = req.params;

  const targetCat = store.categories.find(c => c.id === id || c.name === id);
  if (!targetCat) {
    return res.status(404).json({ error: 'Category not found' });
  }

  if (targetCat.id === 'uncategorized' || targetCat.name.toLowerCase() === 'uncategorized') {
    return res.status(400).json({ error: 'Cannot delete the fallback Uncategorized category' });
  }

  // Move existing transactions to Uncategorized
  for (const t of store.transactions) {
    if (t.category === targetCat.name) {
      t.category = 'Uncategorized';
    }
  }

  store.categories = store.categories.filter(c => c.id !== targetCat.id);
  saveUserData(user.id, store);

  res.json({ success: true, categories: store.categories });
});

// 3. Transactions CRUD APIs (Scoped to User)
app.get('/api/transactions', (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.json({
      transactions: [],
      summary: {
        totalIncome: 0,
        totalExpense: 0,
        netSavings: 0,
        savingsRate: 0,
        transactionCount: 0,
        incomeCount: 0,
        expenseCount: 0,
        monthlySpent: 0,
        monthlyBudget: 0,
        dailyAverageExpense: 0,
        topCategory: '',
        topPaymentMethod: '',
      },
      user: null,
    });
  }
  const store = getUserData(user.id);
  const summary = calculateUserSummary(user.id);
  res.json({
    transactions: store.transactions,
    summary,
    user,
  });
});

app.post('/api/transactions', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  const { type, amount, category, description, date, paymentMethod, tags } = req.body;

  if (!amount || isNaN(Number(amount))) {
    return res.status(400).json({ error: 'Valid amount is required' });
  }

  const nowIso = new Date().toISOString();
  const newTx: Transaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    userId: user.id,
    type: type === 'income' ? 'income' : 'expense',
    amount: Math.abs(Number(amount)),
    category: category || (type === 'income' ? 'Salary & Employment' : 'Uncategorized'),
    description: (description || 'Manual Entry').trim(),
    date: date || nowIso.split('T')[0],
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    paymentMethod: paymentMethod || 'UPI',
    source: 'manual',
    createdAt: nowIso,
    tags: Array.isArray(tags) ? tags : [],
  };

  store.transactions.unshift(newTx);
  saveUserData(user.id, store);

  const summary = calculateUserSummary(user.id);
  res.json({ success: true, transaction: newTx, summary });
});

// Update transaction category
app.patch('/api/transactions/:id/category', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  const { id } = req.params;
  const { category } = req.body;

  if (!category) {
    return res.status(400).json({ error: 'Category is required' });
  }

  const tx = store.transactions.find(t => t.id === id);
  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  tx.category = category.trim();
  saveUserData(user.id, store);

  res.json({ success: true, transaction: tx, summary: calculateUserSummary(user.id) });
});

// Full update transaction
app.put('/api/transactions/:id', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  const { id } = req.params;
  const { type, amount, category, description, date, paymentMethod, tags } = req.body;

  const tx = store.transactions.find(t => t.id === id);
  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  if (type) tx.type = type;
  if (amount !== undefined) tx.amount = Math.abs(Number(amount));
  if (category) tx.category = category.trim();
  if (description) tx.description = description.trim();
  if (date) tx.date = date;
  if (paymentMethod) tx.paymentMethod = paymentMethod;
  if (tags) tx.tags = tags;

  saveUserData(user.id, store);
  res.json({ success: true, transaction: tx, summary: calculateUserSummary(user.id) });
});

app.delete('/api/transactions/:id', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  const { id } = req.params;

  const idx = store.transactions.findIndex(t => t.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const [deleted] = store.transactions.splice(idx, 1);
  saveUserData(user.id, store);

  res.json({ success: true, deleted, summary: calculateUserSummary(user.id) });
});

app.delete('/api/transactions', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  store.transactions = [];
  saveUserData(user.id, store);

  res.json({ success: true, summary: calculateUserSummary(user.id) });
});

// 4. Budgets Management
app.get('/api/budgets', (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.json({ budgets: [] });
  }
  const store = getUserData(user.id);
  res.json({ budgets: store.budgets });
});

app.put('/api/budgets', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  const { newBudgets } = req.body;

  if (!Array.isArray(newBudgets)) {
    return res.status(400).json({ error: 'newBudgets must be an array' });
  }
  store.budgets = newBudgets;
  saveUserData(user.id, store);

  res.json({ success: true, budgets: store.budgets });
});

// 5. Telegram Bot Config & Status
app.get('/api/telegram/config', async (req, res) => {
  const currentToken = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
  const appUrl = 'https://ais-dev-tqtvhllm5ccjbvvdxz44bm-657007980218.asia-east1.run.app';
  const webhookUrl = `${appUrl}/api/telegram/webhook`;

  let botInfo: any = null;
  let webhookInfo: any = null;

  if (currentToken) {
    try {
      const meRes = await fetch(`https://api.telegram.org/bot${currentToken}/getMe`);
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.ok) {
          botInfo = meData.result;
          botConfig.botUsername = botInfo.username;
          botConfig.botName = botInfo.first_name;
        }
      }

      const hookRes = await fetch(`https://api.telegram.org/bot${currentToken}/getWebhookInfo`);
      if (hookRes.ok) {
        const hookData = await hookRes.json();
        if (hookData.ok) {
          webhookInfo = hookData.result;
        }
      }
    } catch (err: any) {
      console.error('Error checking Telegram Bot status:', err);
    }
  }

  botConfig.isConnected = !!(botConfig.botToken && botConfig.botUsername);
  botConfig.isWebhookSet = !!(botConfig.botToken && botConfig.botUsername);
  saveJson(BOT_CONFIG_FILE, botConfig);

  res.json({
    config: botConfig,
    appUrl,
    webhookUrl,
    botInfo,
    webhookInfo,
  });
});

app.post('/api/telegram/config', async (req, res) => {
  const { botToken } = req.body;
  botConfig.botToken = (botToken || '').trim();

  if (botConfig.botToken) {
    try {
      const meRes = await fetch(`https://api.telegram.org/bot${botConfig.botToken}/getMe`);
      const meData = await meRes.json();
      if (meData.ok) {
        botConfig.botUsername = meData.result.username;
        botConfig.botName = meData.result.first_name;
        botConfig.isConnected = true;
        botConfig.isWebhookSet = true;
      }
    } catch (err: any) {
      botConfig.lastError = err.message;
    }
  }

  saveJson(BOT_CONFIG_FILE, botConfig);
  res.json({ success: true, config: botConfig });
});

// 6. Telegram Logs
app.get('/api/telegram/logs', (req, res) => {
  res.json({ logs: telegramLogs });
});

app.delete('/api/telegram/logs', (req, res) => {
  telegramLogs = [];
  saveJson(LOGS_FILE, telegramLogs);
  res.json({ success: true, count: 0 });
});

// 7. AI Financial Insights Generator (User-Scoped)
app.post('/api/ai/insights', async (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  const ai = getGeminiClient();
  const summary = calculateUserSummary(user.id);

  const categoryTotals: Record<string, number> = {};
  for (const t of store.transactions) {
    if (t.type === 'expense') {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    }
  }

  const prompt = `You are a friendly, witty, and smart personal financial advisor analyzing ${user.name}'s Indian income and expenses.
Data:
- User: ${user.name}
- Total Income: ₹${summary.totalIncome}
- Total Expenses: ₹${summary.totalExpense}
- Net Balance: ₹${summary.netSavings}
- Savings Rate: ${summary.savingsRate}%
- Expenses by category: ${JSON.stringify(categoryTotals)}
- Recent transactions: ${JSON.stringify(store.transactions.slice(0, 10).map(t => ({ desc: t.description, cat: t.category, amt: t.amount, type: t.type, pm: t.paymentMethod })))}

Provide an actionable, encouraging financial breakdown in clean JSON format:
1. "overview": A concise 2-sentence summary.
2. "keyInsights": Array of 3-4 specific observations.
3. "savingTips": Array of 2-3 practical tips.
4. "healthScore": A number from 0 to 100.
5. "verdict": "Excellent" | "Good" | "Needs Attention" | "Critical"`;

  if (!ai) {
    return res.json({
      insights: {
        overview: `${user.name}, you have saved ₹${summary.netSavings.toLocaleString('en-IN')} with an overall savings rate of ${summary.savingsRate}%.`,
        keyInsights: [
          `Total Income recorded: ₹${summary.totalIncome.toLocaleString('en-IN')}`,
          `Total Expenses: ₹${summary.totalExpense.toLocaleString('en-IN')}`,
          `Top spending category: ${Object.keys(categoryTotals)[0] || 'Food & Dining'}`,
        ],
        savingTips: [
          'Track every small expense like chai, dahi, and auto via Telegram to catch hidden leaks.',
          'Set category budget limits for delivery and dining out.',
        ],
        healthScore: Math.min(100, Math.max(20, summary.savingsRate + 40)),
        verdict: summary.savingsRate > 30 ? 'Good' : 'Needs Attention',
      }
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    if (response.text) {
      return res.json({ insights: JSON.parse(response.text.trim()) });
    }
  } catch (err: any) {
    console.error('AI insights generation failed:', err);
  }

  res.json({
    insights: {
      overview: `You currently have ₹${summary.netSavings.toLocaleString('en-IN')} in net savings across ${summary.transactionCount} transactions.`,
      keyInsights: [`Recorded ₹${summary.totalIncome.toLocaleString('en-IN')} in total earnings.`],
      savingTips: ['Keep logging expenses on Telegram right when they happen!'],
      healthScore: 75,
      verdict: 'Good',
    }
  });
});

// Vite & Static server setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 TeleExpense AI server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
