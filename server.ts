import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import * as XLSX from 'xlsx';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable Gzip/Brotli compression for all responses (reduces bandwidth by 75-85%)
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ultra-fast Health / Ping endpoint for 14-minute Keep-Alive Cron jobs (less than 25 bytes payload)
app.get(['/api/health', '/api/ping', '/healthz'], (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: Math.floor(process.uptime()) });
});

// Persistence directory (Supports custom persistent disk mount e.g. /var/data or /opt/render/project/src/.data)
const DATA_DIR = process.env.DATA_DIR || process.env.PERSISTENT_DATA_DIR || path.join(process.cwd(), '.data');
const USERS_DIR = path.join(DATA_DIR, 'users');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const BOT_CONFIG_FILE = path.join(DATA_DIR, 'bot_config.json');
const LOGS_FILE = path.join(DATA_DIR, 'telegram_logs.json');
const ACTIVE_ACCOUNTS_FILE = path.join(DATA_DIR, 'active_accounts.json');
const AI_ADVISOR_MODE_FILE = path.join(DATA_DIR, 'ai_advisor_mode.json');

// Global Legacy files (for auto-migration)
const LEGACY_TX_FILE = path.join(DATA_DIR, 'transactions.json');
const LEGACY_BUDGETS_FILE = path.join(DATA_DIR, 'budgets.json');

// Optional PostgreSQL Database Pool (for Render PostgreSQL or Neon / Supabase)
let pgPool: pg.Pool | null = null;
let isPgConnected = false;
const rawDbUrl = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || process.env.POSTGRES_URL || '';

if (rawDbUrl && rawDbUrl.trim()) {
  try {
    const isLocal = rawDbUrl.includes('localhost') || rawDbUrl.includes('127.0.0.1');
    pgPool = new Pool({
      connectionString: rawDbUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
    console.log('[Storage] PostgreSQL Database URL detected. Ready to connect to PostgreSQL.');
  } catch (err) {
    console.error('[Storage] Error initializing Postgres pool:', err);
    pgPool = null;
  }
}

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

export type UserRole = 'owner' | 'family';

export interface PendingMemberRequest {
  id: string; // e.g. "req_123456789"
  chatId: string;
  name: string;
  telegramUsername?: string;
  linkCode: string;
  requestedAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  password?: string;
  telegramChatId?: string;
  telegramUsername?: string;
  linkedMembers?: LinkedMember[]; // Multiple connected family / team members
  pendingRequests?: PendingMemberRequest[]; // New member link requests awaiting owner approval
  linkCode: string; // 6-digit linking code
  createdAt: string;
  trackingStartMonth?: string; // Format: "YYYY-MM" (e.g. "2026-09")
}

export type TransactionType = 'income' | 'expense';
export type PaymentMethod = 'UPI' | 'Cash' | 'Card' | 'Net Banking' | 'Bank Transfer' | 'UPI/Cash' | 'Other';

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
  account?: string;
  source: 'telegram' | 'manual' | 'simulator' | 'import';
  telegramChatId?: string;
  telegramMessageId?: number;
  telegramUser?: string;
  rawMessage?: string;
  createdAt: string;
  tags?: string[];
  isReimbursement?: boolean;
  reimbursementStatus?: 'pending' | 'settled' | 'partial';
  reimbursementSettledAmount?: number;
  isSavingsTransfer?: boolean;
  isInvestment?: boolean;
}

export interface CardEmi {
  id: string;
  userId: string;
  cardId: string;
  title: string;
  monthlyAmount: number;
  totalMonths: number;
  paidMonths: number;
  dueDay: number;
  startDate: string;
  notes?: string;
  createdAt: string;
}

export interface SavingsTransfer {
  id: string;
  userId: string;
  amount: number;
  date: string;
  recipient: string;
  fromAccount: string;
  notes?: string;
  createdAt: string;
}

export interface InvestmentRecord {
  id: string;
  userId: string;
  type: 'RD' | 'FD' | 'Mutual Fund' | 'Gold' | 'PPF' | 'Other';
  name: string;
  amount: number;
  monthlyAmount?: number;
  paidInstallments?: number;
  totalInstallments?: number;
  account: string;
  date: string;
  maturityDate?: string;
  interestRate?: number;
  currentValue?: number;
  maturityAmount?: number;
  notes?: string;
  createdAt: string;
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
  personalExpense?: number;
  pendingReimbursements?: number;
  savingsTransfers?: number;
  investmentsTotal?: number;
  netSavings: number;
  savingsRate: number;
  transactionCount: number;
  incomeCount: number;
  expenseCount: number;
  monthlyBudget: number;
  monthlySpent: number;
  dailyAverageExpense: number;
  currentMonthIncome?: number;
  currentMonthTotalExpense?: number;
  currentMonthPersonalExpense?: number;
  currentMonthNetSavings?: number;
  currentMonthCount?: number;
  openingCarryforward?: number;
  totalNetSavings?: number;
}

export interface UdhaarRecord {
  id: string;
  userId: string;
  type: 'lent' | 'borrowed'; // 'lent' (Maine Diya / Lena hai) | 'borrowed' (Maine Liya / Dena hai)
  personName: string; // e.g. "Rohan", "Papa"
  amount: number;
  description?: string;
  date: string; // YYYY-MM-DD
  time?: string;
  status: 'pending' | 'settled';
  account?: string;
  settledAt?: string;
  createdAt: string;
}

export interface FuelLog {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  time?: string;
  vehicleName?: string; // e.g. "Bike", "Car", "Activa"
  fuelAmount: number; // ₹ paid
  fuelLiters?: number;
  odometer: number; // km reading e.g. 45200
  previousOdometer?: number;
  distanceCovered?: number; // km
  calculatedMileage?: number; // km/l
  costPerKm?: number; // ₹/km
  notes?: string;
  createdAt: string;
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
    keywords: ['movie', 'cinema', 'pvr', 'inox', 'netflix', 'prime', 'spotify', 'hotstar', 'gaming', 'steam', 'party', 'concert', 'club', 'outing', 'trip', 'vacation', 'resort', 'daru', 'daaru', 'sharab', 'beer', 'wine', 'alcohol', 'whiskey', 'rum', 'vodka', 'theka', 'liquor', 'sutta', 'cigarette', 'hookah', 'pan', 'gutkha'],
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
    id: 'family_trip_pooja',
    name: 'Family Trip & Pooja',
    type: 'expense',
    icon: 'Sparkles',
    color: '#F59E0B',
    bgLight: 'bg-amber-50 text-amber-700 border-amber-200',
    keywords: ['pooja', 'puja', 'trip', 'family trip', 'mandir', 'prasad', 'pandit', 'samagri', 'havan', 'yatra', 'darshan', 'holiday', 'vacation', 'temple', 'religious', 'ganga', 'kedarnath', 'tirupati'],
    isDefault: true,
  },
  {
    id: 'reimbursement',
    name: 'Reimbursement',
    type: 'expense',
    icon: 'Briefcase',
    color: '#06B6D4',
    bgLight: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    keywords: ['rim', 'reimburse', 'reimbursement', 'office claim', 'client trip', 'claim'],
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
  { category: 'Rent & Housing', limit: 12000, period: 'monthly' },
  { category: 'Entertainment & Fun', limit: 2500, period: 'monthly' },
  { category: 'Healthcare & Fitness', limit: 2000, period: 'monthly' },
  { category: 'Investments & Savings', limit: 15000, period: 'monthly' },
  { category: 'Education & Learning', limit: 3000, period: 'monthly' },
  { category: 'Other Expense', limit: 2000, period: 'monthly' },
];

// Helper to keep categories and budgets 100% synchronized
function syncBudgetsWithCategories(store: UserDataStore): boolean {
  let changed = false;
  if (!store.categories || store.categories.length === 0) {
    store.categories = [...DEFAULT_CATEGORIES];
    changed = true;
  }
  if (!store.budgets) {
    store.budgets = [];
    changed = true;
  }

  // Categories that can have budgets (expense, both, or uncategorized)
  const budgetableCategories = store.categories.filter(c => c.type === 'expense' || c.type === 'both' || !c.type);

  // 1. For each budgetable category, ensure a budget entry exists
  for (const cat of budgetableCategories) {
    const existingBudget = store.budgets.find(b => b.category.toLowerCase() === cat.name.toLowerCase());
    if (!existingBudget) {
      const defLimit = DEFAULT_BUDGETS.find(db => db.category.toLowerCase() === cat.name.toLowerCase())?.limit || 0;
      store.budgets.push({
        category: cat.name,
        limit: defLimit,
        spent: 0,
        period: 'monthly',
      });
      changed = true;
    } else if (existingBudget.category !== cat.name) {
      existingBudget.category = cat.name;
      changed = true;
    }
  }

  // 2. Remove any budget entries for categories that no longer exist
  const validCatNames = new Set(store.categories.map(c => c.name.toLowerCase()));
  const initialCount = store.budgets.length;
  store.budgets = store.budgets.filter(b => validCatNames.has(b.category.toLowerCase()));
  if (store.budgets.length !== initialCount) {
    changed = true;
  }

  return changed;
}

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
  udhaars?: UdhaarRecord[];
  cardEmis?: CardEmi[];
  savingsTransfers?: SavingsTransfer[];
  investments?: InvestmentRecord[];
  fuelLogs?: FuelLog[];
  dataVersion?: number;
  accountBaseBalances?: Record<string, number>;
  accountBalanceSetTimestamps?: Record<string, string>;
  wifeBaseBalance?: number;
  wifeBalanceSetTimestamp?: string;
  cardCreditLimits?: Record<string, number>;
}

let users: UserProfile[] = loadJson<UserProfile[]>(USERS_FILE, []);
let telegramLogs: TelegramLog[] = loadJson<TelegramLog[]>(LOGS_FILE, []);
let chatActiveAccounts: Record<string, string> = loadJson<Record<string, string>>(ACTIVE_ACCOUNTS_FILE, {});
let chatAiAdvisorMode: Record<string, boolean> = loadJson<Record<string, boolean>>(AI_ADVISOR_MODE_FILE, {});
let botConfig: BotConfig = loadJson<BotConfig>(BOT_CONFIG_FILE, {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '8805911705:AAFqlnYNiguHCdar15R3XX8JJkuI0nXNanc',
  isWebhookSet: true,
  isConnected: true,
  botUsername: 'khata_ansh_bot',
  botName: 'khatabot',
});

// Cache of loaded user data
const userDataCache = new Map<string, UserDataStore>();

// ---------------- PostgreSQL Write-Through & Hydration ----------------

async function persistToPg(key: string, data: any): Promise<void> {
  if (!pgPool) return;
  try {
    await pgPool.query(
      `INSERT INTO teleexpense_store (key, data, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(data)]
    );
  } catch (err: any) {
    console.error(`[Storage] Postgres async write failed for ${key}:`, err.message);
  }
}

async function initPgDatabase(): Promise<boolean> {
  if (!pgPool) {
    console.log(`[Storage] Using Local/Persistent Disk storage: ${DATA_DIR}`);
    return false;
  }
  try {
    const client = await pgPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS teleexpense_store (
          key VARCHAR(255) PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('✅ [Storage] PostgreSQL teleexpense_store connected & verified successfully!');
      isPgConnected = true;

      // Hydrate memory and disk from PostgreSQL
      const res = await client.query('SELECT key, data FROM teleexpense_store');
      let pgHasData = false;
      for (const row of res.rows) {
        pgHasData = true;
        if (row.key === 'users') {
          if (Array.isArray(row.data) && row.data.length > 0) {
            users = row.data;
            saveJson(USERS_FILE, users);
          }
        } else if (row.key === 'bot_config') {
          if (row.data) {
            botConfig = { ...botConfig, ...row.data };
            if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim()) {
              botConfig.botToken = process.env.TELEGRAM_BOT_TOKEN.trim();
            }
            saveJson(BOT_CONFIG_FILE, botConfig);
          }
        } else if (row.key === 'telegram_logs') {
          if (Array.isArray(row.data)) {
            telegramLogs = row.data;
            saveJson(LOGS_FILE, telegramLogs);
          }
        } else if (row.key === 'active_accounts') {
          if (row.data && typeof row.data === 'object') {
            chatActiveAccounts = row.data;
            saveJson(ACTIVE_ACCOUNTS_FILE, chatActiveAccounts);
          }
        } else if (row.key === 'ai_advisor_mode') {
          if (row.data && typeof row.data === 'object') {
            chatAiAdvisorMode = row.data;
            saveJson(AI_ADVISOR_MODE_FILE, chatAiAdvisorMode);
          }
        } else if (row.key.startsWith('user_data:')) {
          const uid = row.key.replace('user_data:', '');
          if (row.data) {
            userDataCache.set(uid, row.data);
            saveJson(getUserDataFilePath(uid), row.data);
          }
        }
      }

      // If Postgres was fresh and empty, seed current disk data into Postgres
      if (!pgHasData) {
        console.log('[Storage] Empty PostgreSQL database detected. Seeding data from local disk to Postgres...');
        await persistToPg('users', users);
        await persistToPg('bot_config', botConfig);
        await persistToPg('telegram_logs', telegramLogs);
        await persistToPg('active_accounts', chatActiveAccounts);
        for (const [uid, store] of userDataCache.entries()) {
          await persistToPg(`user_data:${uid}`, store);
        }
        const anshStore = getUserData('user_ansh');
        await persistToPg('user_data:user_ansh', anshStore);
      }
      return true;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('❌ [Storage] PostgreSQL connection/migration failed:', err.message);
    isPgConnected = false;
    return false;
  }
}

function saveUsers(updatedUsers: UserProfile[]): void {
  users = updatedUsers;
  saveJson(USERS_FILE, users);
  persistToPg('users', users).catch(() => {});
}

function saveBotConfig(updatedConfig: BotConfig): void {
  botConfig = updatedConfig;
  saveJson(BOT_CONFIG_FILE, botConfig);
  persistToPg('bot_config', botConfig).catch(() => {});
}

function saveTelegramLogs(updatedLogs: TelegramLog[]): void {
  telegramLogs = updatedLogs;
  saveJson(LOGS_FILE, telegramLogs);
  persistToPg('telegram_logs', telegramLogs).catch(() => {});
}

function saveActiveAccounts(updated: Record<string, string>): void {
  chatActiveAccounts = updated;
  saveJson(ACTIVE_ACCOUNTS_FILE, chatActiveAccounts);
  persistToPg('active_accounts', chatActiveAccounts).catch(() => {});
}

function setActiveAccountForChat(chatId: string | number, userId: string): void {
  const cId = String(chatId).trim();
  if (!cId) return;
  chatActiveAccounts[cId] = userId;
  saveActiveAccounts(chatActiveAccounts);
}

function saveAiAdvisorMode(updated: Record<string, boolean>): void {
  chatAiAdvisorMode = updated;
  saveJson(AI_ADVISOR_MODE_FILE, chatAiAdvisorMode);
  persistToPg('ai_advisor_mode', chatAiAdvisorMode).catch(() => {});
}

function setChatAiAdvisorMode(chatId: string | number, enabled: boolean): void {
  const cId = String(chatId).trim();
  if (!cId) return;
  chatAiAdvisorMode = loadJson<Record<string, boolean>>(AI_ADVISOR_MODE_FILE, chatAiAdvisorMode);
  if (enabled) {
    chatAiAdvisorMode[cId] = true;
  } else {
    delete chatAiAdvisorMode[cId];
  }
  saveAiAdvisorMode(chatAiAdvisorMode);
}

function isChatInAiAdvisorMode(chatId: string | number): boolean {
  const cId = String(chatId).trim();
  if (!cId) return false;
  chatAiAdvisorMode = loadJson<Record<string, boolean>>(AI_ADVISOR_MODE_FILE, chatAiAdvisorMode);
  return Boolean(chatAiAdvisorMode[cId]);
}

export function getLinkedUsersForChat(
  chatId: string | number,
  fromUserId?: string | number,
  username?: string
): UserProfile[] {
  // Always load fresh users & active accounts from disk
  users = loadJson<UserProfile[]>(USERS_FILE, users);
  chatActiveAccounts = loadJson<Record<string, string>>(ACTIVE_ACCOUNTS_FILE, chatActiveAccounts);

  const cId = String(chatId || '').trim();
  const fId = String(fromUserId || '').trim();
  const rawUser = String(username || '').replace('@', '').toLowerCase().trim();

  const matchingUsers: UserProfile[] = [];
  let modified = false;

  for (const u of users) {
    const uChatId = String(u.telegramChatId || '').trim();
    const uUsername = String(u.telegramUsername || '').replace('@', '').toLowerCase().trim();

    const matchOwnerChatId = (cId && uChatId === cId) || (fId && uChatId === fId);
    const matchOwnerUsername = Boolean(rawUser && uUsername && uUsername === rawUser);

    const matchMember = u.linkedMembers && u.linkedMembers.some(m => {
      const mChatId = String(m.telegramChatId || '').trim();
      const mUsername = String(m.telegramUsername || '').replace('@', '').toLowerCase().trim();
      return (cId && mChatId === cId) || (fId && mChatId === fId) || Boolean(rawUser && mUsername && mUsername === rawUser);
    });

    if (matchOwnerChatId || matchOwnerUsername || matchMember) {
      // Self-heal: If user was matched by username or member but telegramChatId was missing or different, sync it
      if (cId && !u.telegramChatId) {
        u.telegramChatId = cId;
        if (rawUser && !u.telegramUsername) u.telegramUsername = rawUser;
        modified = true;
      }
      matchingUsers.push(u);
    }
  }

  // Fallback 1: Check active accounts map in case chat was mapped
  if (matchingUsers.length === 0) {
    const activeId = (cId && chatActiveAccounts[cId]) || (fId && chatActiveAccounts[fId]);
    if (activeId) {
      const found = users.find(u => u.id === activeId);
      if (found) {
        if (cId && !found.telegramChatId) {
          found.telegramChatId = cId;
          modified = true;
        }
        matchingUsers.push(found);
      }
    }
  }

  // Fallback 2: If only 1 user exists in system (single-tenant / sole ledger owner)
  if (matchingUsers.length === 0 && users.length === 1) {
    const singleUser = users[0];
    if (cId && !singleUser.telegramChatId) {
      singleUser.telegramChatId = cId;
      if (rawUser) singleUser.telegramUsername = rawUser;
      modified = true;
    }
    if (cId) {
      chatActiveAccounts[cId] = singleUser.id;
      saveActiveAccounts(chatActiveAccounts);
    }
    matchingUsers.push(singleUser);
  }

  if (modified) {
    saveUsers(users);
  }

  return matchingUsers;
}

export function getActiveAccountForChat(
  chatId: string | number,
  linkedUsers: UserProfile[],
  fromUserId?: string | number
): UserProfile | null {
  if (!linkedUsers || linkedUsers.length === 0) return null;

  chatActiveAccounts = loadJson<Record<string, string>>(ACTIVE_ACCOUNTS_FILE, chatActiveAccounts);
  const cId = String(chatId || '').trim();
  const fId = String(fromUserId || '').trim();

  const activeId = (cId && chatActiveAccounts[cId]) || (fId && chatActiveAccounts[fId]);
  if (activeId) {
    const found = linkedUsers.find(u => u.id === activeId);
    if (found) return found;
  }
  return linkedUsers[0];
}

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
    const synced = syncBudgetsWithCategories(store);

    // Auto-migrate any transactions that had the UTC server time offset bug to Indian Standard Time (IST)
    let timeAdjusted = false;
    let descAdjusted = false;
    for (const tx of store.transactions) {
      if (tx.createdAt && tx.time) {
        try {
          const utcHourMin = new Date(tx.createdAt).toISOString().substring(11, 16);
          if (tx.time === utcHourMin) {
            const istHourMin = getAppDateTime(tx.createdAt).time;
            if (tx.time !== istHourMin) {
              tx.time = istHourMin;
              timeAdjusted = true;
            }
          }
        } catch {
          // ignore
        }
      }

      // Auto-clean description if it accidentally had account names attached (e.g. "LPG Ax", "School Fee Ax")
      if (tx.description && /\b(?:ax|axis|sbi|icici|ic|rupay)\s*(?:cc|card|bank)?$/i.test(tx.description.trim())) {
        const cleaned = cleanTransactionDescription(tx.description, tx.category);
        if (cleaned && cleaned !== tx.description) {
          tx.description = cleaned;
          descAdjusted = true;
        }
      }
    }

    if (synced || timeAdjusted || descAdjusted) {
      saveJson(filePath, store);
      persistToPg(`user_data:${userId}`, store).catch(() => {});
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
      udhaars: [],
      fuelLogs: [],
    };
    syncBudgetsWithCategories(store);
    saveJson(filePath, store);
    persistToPg(`user_data:${userId}`, store).catch(() => {});
  }

  if (!store.udhaars) store.udhaars = [];
  if (!store.fuelLogs) store.fuelLogs = [];
  if (!store.dataVersion) store.dataVersion = 1;

  userDataCache.set(userId, store);
  return store;
}

function saveUserData(userId: string, store: UserDataStore): void {
  store.dataVersion = (store.dataVersion || 1) + 1;
  userDataCache.set(userId, store);
  const filePath = getUserDataFilePath(userId);
  saveJson(filePath, store);
  persistToPg(`user_data:${userId}`, store).catch(() => {});
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
    pendingRequests: u.pendingRequests || [],
    linkCode: u.linkCode,
    createdAt: u.createdAt,
    trackingStartMonth: u.trackingStartMonth || (u.createdAt ? u.createdAt.substring(0, 7) : undefined),
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

  // Fallback to primary default user so sessions without explicit headers don't crash
  return users[0] || null;
}

// Calculate Financial Summary for a user
function calculateUserSummary(userId: string): FinancialSummary {
  const store = getUserData(userId);
  syncBudgetsWithCategories(store);
  const txList = store.transactions || [];

  let totalIncome = 0;
  let totalExpense = 0;
  let personalExpense = 0;
  let pendingReimbursements = 0;
  let savingsTransfers = 0;
  let investmentsTotal = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let monthlySpent = 0;

  let currentMonthIncome = 0;
  let currentMonthTotalExpense = 0;
  let currentMonthPersonalExpense = 0;
  let currentMonthCount = 0;
  let prevIncome = 0;
  let prevPersonalExpense = 0;

  const istInfo = getAppDateTime();
  const currentMonthPrefix = istInfo.date.substring(0, 7);
  const currentDay = parseInt(istInfo.date.substring(8, 10), 10) || 1;

  for (const t of txList) {
    const amt = Number(t.amount) || 0;
    const isCurrentMonth = Boolean(t.date && t.date.startsWith(currentMonthPrefix));
    const isPrevMonth = Boolean(t.date && t.date < `${currentMonthPrefix}-01`);

    if (isCurrentMonth) {
      currentMonthCount++;
    }

    if (t.type === 'income') {
      totalIncome += amt;
      incomeCount++;
      if (isCurrentMonth) currentMonthIncome += amt;
      if (isPrevMonth) prevIncome += amt;
    } else {
      totalExpense += amt;
      expenseCount++;

      if (isCurrentMonth) currentMonthTotalExpense += amt;

      // Check if reimbursement (exempt from budget and personal expense)
      const isRim = Boolean(t.isReimbursement || t.category === 'Reimbursement');
      if (isRim) {
        const settledAmt = t.reimbursementStatus === 'settled'
          ? amt
          : Math.min(amt, Math.max(0, Number(t.reimbursementSettledAmount) || 0));
        const remaining = Math.max(0, amt - settledAmt);
        if (t.reimbursementStatus !== 'settled' && remaining > 0) {
          pendingReimbursements += remaining;
        }
      } else if (t.isSavingsTransfer) {
        savingsTransfers += amt;
      } else {
        // True personal expense that consumes budget
        personalExpense += amt;
        if (t.isInvestment) {
          investmentsTotal += amt;
        }
        if (isCurrentMonth) {
          monthlySpent += amt;
          currentMonthPersonalExpense += amt;
        }
        if (isPrevMonth) {
          prevPersonalExpense += amt;
        }
      }
    }
  }

  const openingCarryforward = prevIncome - prevPersonalExpense;
  const currentMonthNetSavings = currentMonthIncome - currentMonthPersonalExpense;
  const totalNetSavings = openingCarryforward + currentMonthNetSavings;

  // True Net Savings = Income - Personal Expense
  const cashBalance = totalIncome - totalExpense;
  const savingsRate = currentMonthIncome > 0 ? Math.max(0, Math.round((currentMonthNetSavings / currentMonthIncome) * 100)) : 0;
  const expenseCats = new Set((store.categories || []).filter(c => c.type !== 'income').map(c => c.name.toLowerCase()));
  const monthlyBudget = (store.budgets || [])
    .filter(b => expenseCats.has(b.category.toLowerCase()))
    .reduce((acc, b) => acc + (Number(b.limit) || 0), 0);

  const daysInMonthSoFar = Math.max(1, currentDay);
  const dailyAverageExpense = Math.round(monthlySpent / daysInMonthSoFar);

  // Compute accumulated investment portfolio (RD / FD / SIP with interest)
  let computedInvestmentsAccumulated = 0;
  if (Array.isArray(store.investments) && store.investments.length > 0) {
    const today = new Date();
    for (const inv of store.investments) {
      const rawAmt = Number(inv.monthlyAmount) || Number(inv.amount) || 0;
      const rate = Number(inv.interestRate) || 0;
      const startDate = inv.date ? new Date(inv.date) : new Date();

      if (inv.type === 'RD' || inv.type === 'Mutual Fund') {
        let totalMonths = Number(inv.totalInstallments) || 0;
        if (!totalMonths && inv.maturityDate && inv.date) {
          const matDate = new Date(inv.maturityDate);
          totalMonths = Math.max(1, (matDate.getFullYear() - startDate.getFullYear()) * 12 + (matDate.getMonth() - startDate.getMonth()));
        }
        if (!totalMonths) totalMonths = 12;

        let paidCount = Number(inv.paidInstallments);
        if (paidCount === undefined || isNaN(paidCount) || paidCount <= 0) {
          let monthsElapsed = (today.getFullYear() - startDate.getFullYear()) * 12 + (today.getMonth() - startDate.getMonth());
          if (today.getDate() >= startDate.getDate()) {
            monthsElapsed += 1;
          }
          paidCount = Math.max(1, Math.min(totalMonths, monthsElapsed));
        }

        const deposited = paidCount * rawAmt;
        let interest = 0;
        if (rate > 0) {
          const qRate = (rate / 100) / 4;
          for (let i = 1; i <= paidCount; i++) {
            const mHeld = paidCount - i + 1;
            interest += rawAmt * (Math.pow(1 + qRate, mHeld / 3) - 1);
          }
        }
        computedInvestmentsAccumulated += deposited + Math.round(interest);
      } else {
        const principal = rawAmt;
        let interest = 0;
        if (rate > 0 && inv.date) {
          const diffTime = Math.max(0, today.getTime() - startDate.getTime());
          const years = diffTime / (1000 * 60 * 60 * 24 * 365.25);
          interest = Math.round(principal * (Math.pow(1 + (rate / 400), 4 * years) - 1));
        }
        computedInvestmentsAccumulated += principal + interest;
      }
    }
  }

  const finalInvestmentsTotal = computedInvestmentsAccumulated > 0 ? computedInvestmentsAccumulated : investmentsTotal;

  return {
    totalIncome,
    totalExpense,
    personalExpense,
    pendingReimbursements,
    savingsTransfers,
    investmentsTotal: finalInvestmentsTotal,
    netSavings: totalNetSavings,
    savingsRate,
    transactionCount: txList.length,
    incomeCount,
    expenseCount,
    monthlyBudget,
    monthlySpent,
    dailyAverageExpense,
    currentMonthIncome,
    currentMonthTotalExpense,
    currentMonthPersonalExpense,
    currentMonthNetSavings,
    currentMonthCount,
    openingCarryforward,
    totalNetSavings,
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

// Resilient Gemini Generator with automatic model fallback for high-demand 503 spikes
async function callGeminiCandidateModels(
  ai: GoogleGenAI,
  prompt: string,
  options?: { jsonMode?: boolean; responseSchema?: any }
): Promise<{ text: string; model: string } | null> {
  const candidateModels = ['gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          ...(options?.jsonMode ? { responseMimeType: 'application/json' } : {}),
          ...(options?.responseSchema ? { responseSchema: options.responseSchema } : {}),
        },
      });
      if (response && response.text) {
        return { text: response.text, model };
      }
    } catch (err: any) {
      // Quiet fallback without logging warnings that trigger error alerts
      if (process.env.DEBUG_AI) {
        console.log(`[Gemini Fallback] Model ${model} unavailable, trying next candidate...`);
      }
    }
  }
  return null;
}

// ---------------- Payment Method Detection ----------------

export function hasExplicitPaymentMethod(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(cash|nagad|rokda|in cash|by cash|card|credit card|debit card|visa|mastercard|amex|rupay|pos|bank|net banking|netbanking|bank transfer|neft|rtgs|imps|cheque|upi|gpay|google pay|phonepe|phone pe|paytm|bhim|cred|scan|qr|amazon pay|0000|5733|6526|8210|5376|cc)\b/i.test(lower) ||
    /\b(?:00|33|26|76)\b/.test(lower) ||
    lower.endsWith(' cash') ||
    lower.startsWith('cash ') ||
    lower.endsWith(' upi') ||
    lower.startsWith('upi ')
  );
}

export function detectPaymentMethod(text: string, isIncome: boolean = false): PaymentMethod {
  const lower = text.toLowerCase();

  // Cash detection
  if (
    /\b(cash|nagad|rokda|in cash|by cash|cash me|cash diya|cash mila)\b/i.test(lower) ||
    lower.endsWith(' cash') ||
    lower.startsWith('cash ')
  ) {
    return 'Cash';
  }

  // Card detection by keywords, card digits, or 2-digit abbreviations (0000, 5733, 6526, 8210, 5376, 00, 33, 26, 76, cc, card)
  if (
    /\b(card|credit card|debit card|visa|mastercard|amex|rupay|pos|cc|0000|5733|6526|8210|5376)\b/i.test(lower) ||
    /\b(?:00|33|26|76)\b/.test(lower)
  ) {
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

  // If no payment mode was specified in spend/expense message, default to 'UPI/Cash'
  // (so user can reassign it later in edit modal or ledger)
  if (!isIncome) {
    return 'UPI/Cash';
  }

  return 'Bank Transfer';
}

// ---------------- Application Timezone (Default: Indian Standard Time - Asia/Kolkata) ----------------

export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

export function getIstDateOffset(daysOffset = 0): string {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const istDateStr = formatter.format(d);
  const [y, m, day] = istDateStr.split('-').map(Number);
  const istMidnight = new Date(Date.UTC(y, m - 1, day + daysOffset, 12, 0, 0));
  return formatter.format(istMidnight);
}

export function getAppDateTime(dateInput?: Date | number | string) {
  let dateObj: Date;
  if (!dateInput) {
    dateObj = new Date();
  } else if (typeof dateInput === 'number') {
    // If it's in seconds (like Telegram message.date), convert to ms
    dateObj = dateInput < 10000000000 ? new Date(dateInput * 1000) : new Date(dateInput);
  } else if (typeof dateInput === 'string') {
    dateObj = new Date(dateInput);
    if (isNaN(dateObj.getTime())) dateObj = new Date();
  } else {
    dateObj = dateInput;
  }

  // Format date YYYY-MM-DD in APP_TIMEZONE
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Format 24-hour time HH:mm in APP_TIMEZONE
  const time24 = new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Format 12-hour time h:mm a in APP_TIMEZONE
  const time12 = new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return {
    date: dateStr.format(dateObj),
    time: time24.format(dateObj),
    time12: time12.format(dateObj),
    iso: dateObj.toISOString(),
  };
}

// ---------------- Multi-Format Date Parser (English & Hinglish) ----------------

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export function parseCustomDateString(rawStr: string): string | null {
  if (!rawStr) return null;
  const str = rawStr.trim().toLowerCase();
  const currentYear = parseInt(getIstDateOffset(0).split('-')[0], 10);

  // Relative dates calculated via IST
  if (/\b(yesterday|kal|beeta kal)\b/i.test(str)) {
    return getIstDateOffset(-1);
  }
  if (/\b(parso|parson|2 days ago|2 din pehle)\b/i.test(str)) {
    return getIstDateOffset(-2);
  }
  if (/\b(today|aaj)\b/i.test(str)) {
    return getIstDateOffset(0);
  }

  // 1. Day Month Year: "2 sep 26", "2nd september 2026", "02 sep", "2-sep-26", "15 aug"
  const dmyMatch = str.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s\-_]+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)(?:[\s\-_]+(\d{2,4}))?\b/i);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const monthName = dmyMatch[2].toLowerCase();
    const month = MONTH_MAP[monthName];
    let year = dmyMatch[3] ? parseInt(dmyMatch[3], 10) : currentYear;
    if (year < 100) year = 2000 + year;

    if (day >= 1 && day <= 31 && month) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 2. Month Day Year: "sep 2 2026", "september 2nd, 26"
  const mdyMatch = str.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[\s\-_]+(\d{1,2})(?:st|nd|rd|th)?(?:[\s\-_,]+(\d{2,4}))?\b/i);
  if (mdyMatch) {
    const monthName = mdyMatch[1].toLowerCase();
    const month = MONTH_MAP[monthName];
    const day = parseInt(mdyMatch[2], 10);
    let year = mdyMatch[3] ? parseInt(mdyMatch[3], 10) : currentYear;
    if (year < 100) year = 2000 + year;

    if (day >= 1 && day <= 31 && month) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 3. Numeric Date DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY or DD/MM/YY
  const numMatch = str.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
  if (numMatch) {
    const part1 = parseInt(numMatch[1], 10);
    const part2 = parseInt(numMatch[2], 10);
    let year = parseInt(numMatch[3], 10);
    if (year < 100) year = 2000 + year;

    let day = part1;
    let month = part2;
    if (part2 > 12 && part1 <= 12) {
      month = part1;
      day = part2;
    }

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 4. ISO Date YYYY-MM-DD
  const isoMatch = str.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

export function parseUdhaarIntentAndData(rawText: string): {
  type: 'lent' | 'borrowed';
  amount: number;
  personName: string;
  date: string;
  description?: string;
} | null {
  const cleanText = rawText.trim();
  const lower = cleanText.toLowerCase();

  // Udhaar keywords check
  const isLent = /\b(diya|diye|de\s+diya|lent|give|gave|bheja|send\s+kiya|transfer\s+kiya)\b/i.test(lower);
  const isBorrowed = /\b(liya|liye|le\s+liya|mila|mile|wapas\s+mila|borrowed|borrow|received|take|took)\b/i.test(lower);

  if (!isLent && !isBorrowed) {
    if (!/\b(udhaar|udhar|khata)\b/i.test(lower)) {
      return null;
    }
  }

  // 1. Extract date substring
  const MONTH_NAMES = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
  let extractedDate = getIstDateOffset(0);
  let textWithoutDate = cleanText;

  const dmyRegex = new RegExp(`\\b(\\d{1,2}(?:st|nd|rd|th)?[\\s\\-_]+(?:${MONTH_NAMES})(?:[\\s\\-_]+\\d{2,4})?)\\b`, 'i');
  const dmyMatch = cleanText.match(dmyRegex);

  const mdyRegex = new RegExp(`\\b((?:${MONTH_NAMES})[\\s\\-_]+\\d{1,2}(?:st|nd|rd|th)?(?:[\\s\\-_,]+\\d{2,4})?)\\b`, 'i');
  const mdyMatch = cleanText.match(mdyRegex);

  const numMatch = cleanText.match(/\b\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?\b/);
  const relMatch = cleanText.match(/\b(yesterday|kal|beeta kal|parso|parson|today|aaj)\b/i);

  const matchedDateStr = dmyMatch?.[0] || mdyMatch?.[0] || numMatch?.[0] || relMatch?.[0];
  if (matchedDateStr) {
    const parsed = parseCustomDateString(matchedDateStr);
    if (parsed) {
      extractedDate = parsed;
      textWithoutDate = cleanText.replace(matchedDateStr, ' ');
    }
  }

  // 2. Extract Amount
  const amtMatch = textWithoutDate.match(/(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(?:rs\.?|rupaye|rupees|₹)?/i);
  if (!amtMatch) return null;
  const amount = parseFloat(amtMatch[1]);
  if (isNaN(amount) || amount <= 0) return null;

  // 3. Remove amount from remnant
  let remnant = textWithoutDate.replace(amtMatch[0], ' ');

  // 4. Remove Udhaar & Action stopwords
  remnant = remnant
    .replace(/\b(diya|diye|de\s+diya|lent|give|gave|bheja|send\s+kiya|transfer\s+kiya|liya|liye|le\s+liya|mila|mile|wapas\s+mila|borrowed|borrow|received|take|took)\b/gi, ' ')
    .replace(/\b(udhaar|udhar|khata|advance|ko|se|from|to|ne|ka|ki|ke|pe|par|paid|got)\b/gi, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If remnant is empty, or only contains generic non-person words, abort
  const nonPersonWords = ['cash', 'upi', 'card', 'petrol', 'sabzi', 'dahi', 'kharcha', 'income', 'bank', 'odo', 'km', 'fuel', 'diesel', 'cng', 'bill'];
  if (!remnant || nonPersonWords.includes(remnant.toLowerCase())) {
    return null;
  }

  // Person name formatting: Capitalize first letters
  const personName = remnant
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  if (!personName) return null;

  return {
    type: isLent ? 'lent' : 'borrowed',
    amount,
    personName,
    date: extractedDate,
    description: rawText,
  };
}

export function parseUdhaarDateChangeCommand(text: string): {
  isDateChangeCommand: boolean;
  target?: string;
  dateStr?: string;
  parsedDate?: string | null;
} {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  const isDateChange = 
    lower.startsWith('/udhardate') ||
    lower.startsWith('/changedate') ||
    lower.startsWith('/editdate') ||
    lower.includes('date change') ||
    lower.includes('change date') ||
    lower.includes('date badlo') ||
    lower.includes('tareeq badlo') ||
    /\bki\s+date\b.*\b(karo|kardo|rakho|badlo)\b/i.test(lower);

  if (!isDateChange) return { isDateChangeCommand: false };

  const MONTH_NAMES = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
  const dmyRegex = new RegExp(`\\b(\\d{1,2}(?:st|nd|rd|th)?[\\s\\-_]+(?:${MONTH_NAMES})(?:[\\s\\-_]+\\d{2,4})?)\\b`, 'i');
  const mdyRegex = new RegExp(`\\b((?:${MONTH_NAMES})[\\s\\-_]+\\d{1,2}(?:st|nd|rd|th)?(?:[\\s\\-_,]+\\d{2,4})?)\\b`, 'i');
  const numMatch = clean.match(/\b\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?\b/);
  const relMatch = clean.match(/\b(yesterday|kal|beeta kal|parso|parson|today|aaj)\b/i);

  const matchedDateStr = clean.match(dmyRegex)?.[0] || clean.match(mdyRegex)?.[0] || numMatch?.[0] || relMatch?.[0];
  let parsedDate: string | null = null;
  if (matchedDateStr) {
    parsedDate = parseCustomDateString(matchedDateStr);
  }

  let remnant = clean;
  if (matchedDateStr) {
    remnant = remnant.replace(matchedDateStr, ' ');
  }
  remnant = remnant
    .replace(/^\/(?:udhardate|changedate|editdate)\s*/i, ' ')
    .replace(/\b(date\s+change|change\s+date|date\s+badlo|tareeq\s+badlo|date|tareeq)\b/gi, ' ')
    .replace(/\b(ko|se|ki|ka|ke|to|for|karo|kardo|rakho|badlo)\b/gi, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    isDateChangeCommand: true,
    target: remnant,
    dateStr: matchedDateStr,
    parsedDate,
  };
}

export function parseUdhaarEditCommand(text: string): {
  isEditCommand: boolean;
  target?: string;
  newAmount?: number;
  newDate?: string | null;
} {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  const isEdit =
    lower.startsWith('/editudhaar') ||
    lower.startsWith('/changeudhaar') ||
    lower.startsWith('/updateudhaar') ||
    /\b(change|edit|update|badlo|badal\s+do|badal\s+kardo)\b.*\b(udhaar|udhar|khata|amount|rupaye)\b/i.test(lower) ||
    /\b(udhaar|udhar|khata)\b.*\b(change|edit|update|badlo|badal)\b/i.test(lower) ||
    /\b(amount\s+change|change\s+amount|raqam\s+badlo)\b/i.test(lower);

  if (!isEdit) return { isEditCommand: false };

  // 1. Check for date
  const MONTH_NAMES = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
  const dmyRegex = new RegExp(`\\b(\\d{1,2}(?:st|nd|rd|th)?[\\s\\-_]+(?:${MONTH_NAMES})(?:[\\s\\-_]+\\d{2,4})?)\\b`, 'i');
  const dmyMatch = clean.match(dmyRegex);
  const numMatch = clean.match(/\b\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?\b/);
  const relMatch = clean.match(/\b(yesterday|kal|beeta kal|parso|parson|today|aaj)\b/i);

  const matchedDateStr = dmyMatch?.[0] || numMatch?.[0] || relMatch?.[0];
  let parsedDate: string | null = null;
  if (matchedDateStr) {
    parsedDate = parseCustomDateString(matchedDateStr);
  }

  let remnant = clean;
  if (matchedDateStr) {
    remnant = remnant.replace(matchedDateStr, ' ');
  }

  // 2. Extract new amount
  const amtMatch = remnant.match(/(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(?:rs\.?|rupaye|rupees|₹)?/i);
  let newAmount: number | undefined;
  if (amtMatch) {
    newAmount = parseFloat(amtMatch[1]);
    remnant = remnant.replace(amtMatch[0], ' ');
  }

  // 3. Clean remnant for target person name
  remnant = remnant
    .replace(/^\/(?:editudhaar|changeudhaar|updateudhaar)\s*/i, ' ')
    .replace(/\b(change|edit|update|badlo|badal\s+do|badal\s+kardo|badal|udhaar|udhar|khata|amount|raqam|rupaye|rupees)\b/gi, ' ')
    .replace(/\b(ko|se|ki|ka|ke|to|for|karo|kardo|rakho)\b/gi, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    isEditCommand: true,
    target: remnant || undefined,
    newAmount,
    newDate: parsedDate,
  };
}

export function extractCustomTimeString(text: string): string | undefined {
  const periodMatch = text.match(/\b(subah|dopahar|shaam|raat)\b/i);
  const period = periodMatch ? periodMatch[1].toLowerCase() : null;

  // 1. Standard 12h/24h time e.g. "12:30 pm", "4:15pm", "14:20", "12:00", "2:30 baje"
  const match1 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*(am|pm))?\b/i);
  if (match1) {
    let hours = parseInt(match1[1], 10);
    const minutes = match1[2];
    const meridiem = match1[3]?.toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    else if (meridiem === 'am' && hours === 12) hours = 0;
    else if (!meridiem && hours < 12) {
      if (period === 'shaam' || period === 'raat') hours += 12;
      else if (period === 'dopahar' && hours >= 1 && hours <= 6) hours += 12;
    }
    return String(hours).padStart(2, '0') + ':' + minutes;
  }

  // 2. "4 pm" or "9 am" or "12 pm"
  const match2 = text.match(/\b([1-9]|1[0-2])\s*(am|pm)\b/i);
  if (match2) {
    let hours = parseInt(match2[1], 10);
    const meridiem = match2[2].toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    return String(hours).padStart(2, '0') + ':00';
  }

  // 3. Hindi/Hinglish "4 baje", "12 baje", "shaam 6 baje", "raat 10 baje"
  const match3 = text.match(/(?:(?:subah|dopahar|shaam|raat)\s*)?([1-9]|1[0-2])\s*baje/i);
  if (match3) {
    let hours = parseInt(match3[1], 10);
    if ((period === 'shaam' || period === 'raat') && hours < 12) hours += 12;
    else if (period === 'dopahar' && hours >= 1 && hours <= 6) hours += 12;
    return String(hours).padStart(2, '0') + ':00';
  }

  return undefined;
}

function detectAccountFromText(text: string): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  if (lower.includes('0000') || /\b00\b/.test(lower) || lower.includes('rupay') || (lower.includes('icic') && lower.includes('cc')) || lower.includes('icici cc') || lower.includes('icici card')) return 'ICICI CC 0000';
  if (lower.includes('5733') || /\b33\b/.test(lower) || (lower.includes('sbi') && lower.includes('5733'))) return 'SBI CC 5733';
  if (lower.includes('6526') || /\b26\b/.test(lower) || (lower.includes('sbi') && lower.includes('6526'))) return 'SBI CC 6526';
  if (lower.includes('8210') || ((lower.includes('ax') || lower.includes('axis')) && lower.includes('8210'))) return 'AX CC 8210';
  if (lower.includes('5376') || /\b76\b/.test(lower) || ((lower.includes('ax') || lower.includes('axis')) && lower.includes('5376'))) return 'AX CC 5376';
  if (lower.includes('sbi cc') || lower.includes('sbi card')) return 'SBI CC 5733';
  if (lower.includes('axis cc') || lower.includes('ax cc') || lower.includes('axis card')) return 'AX CC 8210';
  if ((lower.includes('icici') && !lower.includes('cc') && !lower.includes('card')) || lower.includes('ic bank') || lower.includes('icici bank')) return 'IC Bank';
  if ((lower.includes('axis') && !lower.includes('cc') && !lower.includes('card')) || lower.includes('ax bank') || lower.includes('axis bank')) return 'AX Bank';
  if (lower.includes('cash') || lower.includes('nagad') || lower.includes('rokda') || lower.includes('haath me')) return 'Cash';
  if (lower.includes('upi') || lower.includes('gpay') || lower.includes('paytm') || lower.includes('phonepe')) return 'AX Bank';
  return undefined;
}

function detectReimbursement(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const rimPattern = /\b(rim|reimburse|reimbursement|office claim|client trip|reimbursable|claim)\b/i;
  return rimPattern.test(lower);
}

function detectSavingsTransfer(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('wife') ||
    lower.includes('patni') ||
    lower.includes('savings transfer') ||
    lower.includes('transfer to wife') ||
    lower.includes('bachat wife')
  );
}

function detectInvestment(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const invPattern = /\b(rd|fd|fixed deposit|recurring deposit|mutual fund|sip|gold|ppf|nps|investment|invest)\b/i;
  return invPattern.test(lower);
}

function detectFamilyTripPooja(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (detectReimbursement(text)) return false;
  const poojaPattern = /\b(pooja|puja|prasad|pandit|mandir|samagri|havan|yatra|darshan|family trip|holiday|tour|vacation)\b/i;
  const endsWithTripOrPooja = /(?:pooja|puja|trip)$/i.test(text.trim());
  return poojaPattern.test(lower) || endsWithTripOrPooja;
}

function cleanTransactionDescription(rawDesc: string, detectedCategory?: string): string {
  if (!rawDesc) return detectedCategory || 'Expense';
  let cleaned = rawDesc
    // Remove account keywords and common bank words
    .replace(/\b(?:ax\s*bank|axis\s*bank|ic\s*bank|icici\s*bank|sbi\s*bank|hdfc\s*bank|kotak\s*bank)\b/gi, '')
    .replace(/\b(?:icici\s*cc\s*0000|icici\s*cc|rupay\s*cc|sbi\s*cc\s*5733|sbi\s*cc\s*6526|sbi\s*5733|sbi\s*6526|ax\s*cc\s*8210|ax\s*cc\s*5376|ax\s*8210|ax\s*5376|axis\s*8210|axis\s*5376)\b/gi, '')
    .replace(/\b(?:axis\s*cc|axis\s*card|ax\s*cc|ax\s*card|icici\s*card|sbi\s*card)\b/gi, '')
    .replace(/\b(?:axis|ax|icici|sbi|hdfc|kotak)\s*(?:cc|card|bank)?\b/gi, '')
    .replace(/\b(?:0000|5733|6526|8210|5376)\b/g, '')
    .replace(/\b(?:00|33|26|76)\b/g, '')
    .replace(/\b(?:cash|nagad|rokda|upi|gpay|paytm|phonepe|net\s*banking|credit\s*card|debit\s*card|card|cc)\b/gi, '')
    .replace(/\b(?:rim|reimburse|reimbursement|office\s*claim|client\s*trip|claim)\b/gi, '')
    .replace(/\b(?:yesterday|kal|beeta kal|parso|today|aaj)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If "10" is left at end of text as a card code e.g. "chai 10", and not the main amount
  cleaned = cleaned.replace(/\s+\b10\b$/g, '').trim();

  // Clean trailing prepositions/symbols like 'se', 'me', 'mai', 'via', 'from', 'through', '-', '/'
  cleaned = cleaned.replace(/\s+(?:se|me|mai|via|from|through|by|ki|ka|ke|for|wala|wali)$/i, '').trim();
  cleaned = cleaned.replace(/^[-–—:,.\s]+|[-–—:,.\s]+$/g, '').trim();

  if (!cleaned || cleaned.length < 2) {
    return detectedCategory && detectedCategory !== 'Uncategorized' ? detectedCategory : (rawDesc || 'Expense');
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// ---------------- Fallback Rule-based parser ----------------

function parseFallback(rawText: string, userCategories: CategoryDef[]): Array<{
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  date?: string;
  time?: string;
  paymentMethod?: PaymentMethod;
  account?: string;
  isReimbursement?: boolean;
  reimbursementStatus?: 'pending' | 'settled';
  isSavingsTransfer?: boolean;
  isInvestment?: boolean;
}> {
  const results: Array<{
    type: TransactionType;
    amount: number;
    category: string;
    description: string;
    date?: string;
    time?: string;
    paymentMethod?: PaymentMethod;
    account?: string;
    isReimbursement?: boolean;
    reimbursementStatus?: 'pending' | 'settled';
    isSavingsTransfer?: boolean;
    isInvestment?: boolean;
  }> = [];

  const text = rawText.trim();
  const segments = text.split(/,|\n|\band\b|\baur\b/i).map(s => s.trim()).filter(Boolean);

  for (const seg of segments) {
    const segLower = seg.toLowerCase();

    // Extract custom or relative date
    const extractedDate = parseCustomDateString(seg);

    // Extract custom time if mentioned in text e.g. "12:00", "12 baje", "4 pm"
    const extractedTime = extractCustomTimeString(seg);

    // Extract amount with strict unit boundary detection
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

    // Detect Account / Card / Cash
    const detectedAccount = detectAccountFromText(seg) || 'ICICI CC 0000';

    // Detect Reimbursement (Point 1: Rim, reimburse, claim)
    const isReimbursement = /\b(rim|reimburse|reimbursement|office claim|client trip|reimbursable|claim)\b/i.test(seg);

    // Detect Savings Transfer to Wife (Point 5)
    const isSavingsTransfer = /\b(wife|patni|savings transfer|transfer to wife|bachat wife)\b/i.test(seg);

    // Detect Investment (RD, FD, Mutual Fund)
    const isInvestment = /\b(rd|fd|recurring deposit|fixed deposit|mutual fund|sip|gold|ppf|investment|invest)\b/i.test(seg);

    // Detect Family Trip & Pooja (Point 4: ends with or contains pooja/trip)
    const isFamilyTripPooja = !isReimbursement && (
      /\b(pooja|puja|prasad|pandit|mandir|samagri|havan|yatra|darshan|family trip|holiday|tour)\b/i.test(seg) ||
      /(?:pooja|puja|trip)$/i.test(seg.trim())
    );

    // Detect Income vs Expense
    const isIncome =
      !isSavingsTransfer && (
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
        segLower.startsWith('+')
      );

    const type: TransactionType = isIncome ? 'income' : 'expense';
    const paymentMethod = detectPaymentMethod(seg, isIncome);

    // Clean description: remove amount, date tokens, time tokens, and common filler words
    let cleanDesc = seg
      .replace(/(?:rs\.?|inr|₹)\s*\d+(?:,\d+)*(?:\.\d+)?/gi, '')
      .replace(/\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:k|thousand|hazar|lakh|lakhs|lac|lacs|cr|crore|crores)?\b/gi, '')
      .replace(/(?:on\s+)?\b\d{1,2}(?:st|nd|rd|th)?[\s\-_]+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)(?:[\s\-_]+\d{2,4})?\b/gi, '')
      .replace(/(?:on\s+)?\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[\s\-_]+\d{1,2}(?:st|nd|rd|th)?(?:[\s\-_,]+\d{2,4})?\b/gi, '')
      .replace(/(?:on\s+)?\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/gi, '')
      .replace(/(?:on\s+)?\b\d{4}-\d{1,2}-\d{1,2}\b/gi, '')
      .replace(/\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*(am|pm))?\b/gi, '')
      .replace(/\b([1-9]|1[0-2])\s*(am|pm)\b/gi, '')
      .replace(/(?:subah|dopahar|shaam|raat)?\s*([1-9]|1[0-2])(?::([0-5]\d))?\s*baje/gi, '')
      .replace(/\b(yesterday|kal|beeta kal|parso|parson|today|aaj|on|ko|ki tareeq|date|time|samay|waqt)\b/gi, '')
      .replace(/\b(income|expense|spent|paid|kharcha|diya|credited|received|at|for|rupees|rs|inr|₹|cash|upi|gpay|paytm|phonepe|card|bank|transfer|rokda|nagad)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanDesc || cleanDesc.length < 2) {
      cleanDesc = isIncome ? 'Income' : (isReimbursement ? 'Office Reimbursement' : 'Expense');
    }

    // Match against user's categories
    let matchedCategory = 'Uncategorized';
    if (isReimbursement) {
      matchedCategory = 'Reimbursement';
    } else if (isFamilyTripPooja) {
      matchedCategory = 'Family Trip & Pooja';
    } else if (isInvestment) {
      matchedCategory = 'Investments & Savings';
    } else {
      const targetType = type;
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
    }

    const finalDescription = cleanTransactionDescription(cleanDesc, matchedCategory);

    results.push({
      type,
      amount,
      category: matchedCategory,
      description: finalDescription,
      date: extractedDate || getAppDateTime().date,
      time: extractedTime,
      paymentMethod,
      account: detectedAccount,
      isReimbursement,
      reimbursementStatus: isReimbursement ? 'pending' : undefined,
      isSavingsTransfer,
      isInvestment,
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
  time?: string;
  paymentMethod: PaymentMethod;
  account?: string;
  isReimbursement?: boolean;
  reimbursementStatus?: 'pending' | 'settled';
  isSavingsTransfer?: boolean;
  isInvestment?: boolean;
  tags?: string[];
}>> {
  const fallback = parseFallback(rawText, userCategories);
  const ai = getGeminiClient();
  const nowInfo = getAppDateTime();
  const currentDate = nowInfo.date;

  if (!ai) {
    return fallback.map(f => ({
      ...f,
      date: f.date || currentDate,
      paymentMethod: f.paymentMethod || (f.type === 'expense' ? 'UPI/Cash' : 'Bank Transfer'),
    }));
  }

  const categoryNames = userCategories.map(c => c.name);
  if (!categoryNames.includes('Uncategorized')) {
    categoryNames.push('Uncategorized');
  }
  if (!categoryNames.includes('Family Trip & Pooja')) {
    categoryNames.push('Family Trip & Pooja');
  }
  if (!categoryNames.includes('Reimbursement')) {
    categoryNames.push('Reimbursement');
  }

  const prompt = `You are an expert financial transaction parser for an Indian personal ledger with full Hinglish, Hindi, and English support.
Analyze the user's message (which can be in English, Hindi, or Hinglish, e.g. "Rim 100 Cab (ggn trip)", "300 dahi cash 12:00", "500 petrol upi 4 pm", "15000 salary bank me aayi 1st sept", "1200 ki jeans kharidi SBI 5733 se kal", "500 fal phool pooja", "1200 hotel stay trip", "5000 RD debit IC bank").

Current date (Indian Standard Time): ${currentDate} (Year: ${new Date().getFullYear()})
Current time (Indian Standard Time): ${nowInfo.time} (${nowInfo.time12})

CRITICAL RULES:
1. Extract every transaction (income or expense).
2. Reimbursement detection:
   - If user wrote "Rim", "reimburse", "claim", or "office claim", set isReimbursement: true, category: "Reimbursement" (or relevant transport/dining), reimbursementStatus: "pending".
3. Family Trip & Pooja detection:
   - If user ends description or mentions "pooja", "puja", "trip", "mandir", "yatra" (and NOT an office rim), category MUST BE "Family Trip & Pooja".
4. Account detection:
   - Pick account from: ["ICICI CC 0000", "SBI CC 5733", "SBI CC 6526", "AX CC 8210", "AX CC 5376", "IC Bank", "AX Bank", "Cash"]. Default: "ICICI CC 0000".
   - Card digit matching:
     * "0000" or "00" or "rupay" or "icici cc" -> "ICICI CC 0000" (Card)
     * "5733" or "33" or "sbi cc" -> "SBI CC 5733" (Card)
     * "6526" or "26" -> "SBI CC 6526" (Card)
     * "8210" or "10" or "axis cc" -> "AX CC 8210" (Card)
     * "5376" or "76" -> "AX CC 5376" (Card)
     * "upi" -> "AX Bank" (UPI)
     * "cash" -> "Cash" (Cash)
5. Savings transfer detection:
   - If user transfers money to wife ("transferred to wife", "savings to wife"), set isSavingsTransfer: true.
6. Date & Time:
   - Parse exact ISO date "YYYY-MM-DD" and 24-hr time "HH:mm".
7. Payment method detection:
   - If user mentions or enters card digits ("0000", "5733", "6526", "8210", "5376", "00", "33", "26", "76", "cc", "card") -> "Card".
   - If user mentions cash/nagad/rokda -> "Cash".
   - If user mentions upi/gpay/phonepe/paytm -> "UPI".
   - If user mentions bank transfer/net banking -> "Bank Transfer".
   - CRITICAL: For expense/spend transactions, if the user DID NOT specify any payment method or card digits (e.g. "100 dahi", "50 chai", "500 petrol", "200 auto"), paymentMethod MUST BE "UPI/Cash".

8. Clean Description & Account separation:
   - The "description" field MUST ONLY contain the clean item / purpose / merchant name (e.g. "Chai", "Petrol", "Dahi", "Groceries", "LPG").
   - NEVER keep account names, bank names, or card digits inside the "description" field.
   - Example 1: User says "10 chai 0000" -> amount: 10, description: "Chai", account: "ICICI CC 0000", paymentMethod: "Card".
   - Example 2: User says "10 chai 00" -> amount: 10, description: "Chai", account: "ICICI CC 0000", paymentMethod: "Card".
   - Example 3: User says "500 petrol 5733" -> amount: 500, description: "Petrol", account: "SBI CC 5733", paymentMethod: "Card".
   - Example 4: User says "50 chai upi" -> amount: 50, description: "Chai", account: "AX Bank", paymentMethod: "UPI".
   - Example 5: User says "100 auto cash" -> amount: 100, description: "Auto", account: "Cash", paymentMethod: "Cash".
   - Example 6: User says "10 chai" -> amount: 10, description: "Chai", account: "ICICI CC 0000", paymentMethod: "UPI/Cash".

User message:
"""
${rawText}
"""`;

  try {
    const result = await callGeminiCandidateModels(ai, prompt, {
      jsonMode: true,
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
            time: { type: Type.STRING },
            paymentMethod: { type: Type.STRING, enum: ['UPI', 'Cash', 'Card', 'Net Banking', 'Bank Transfer', 'UPI/Cash', 'Other'] },
            account: { type: Type.STRING },
            isReimbursement: { type: Type.BOOLEAN },
            isSavingsTransfer: { type: Type.BOOLEAN },
            isInvestment: { type: Type.BOOLEAN },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['type', 'amount', 'category', 'description', 'date', 'paymentMethod'],
        },
      },
    });

    const parsedData = JSON.parse(result?.text || '[]');
    if (Array.isArray(parsedData) && parsedData.length > 0) {
      return parsedData.map((item: any) => {
        let finalPm: PaymentMethod = item.paymentMethod || (item.type === 'expense' ? 'UPI/Cash' : 'Bank Transfer');
        if (item.type === 'expense' && !hasExplicitPaymentMethod(rawText)) {
          finalPm = 'UPI/Cash';
        }
        const cleanedDesc = cleanTransactionDescription(item.description, item.category);
        return {
          ...item,
          description: cleanedDesc,
          paymentMethod: finalPm,
          account: item.account || detectAccountFromText(rawText) || 'ICICI CC 0000',
          isReimbursement: Boolean(item.isReimbursement || detectReimbursement(rawText)),
          reimbursementStatus: (item.isReimbursement || detectReimbursement(rawText)) ? 'pending' : undefined,
          isSavingsTransfer: Boolean(item.isSavingsTransfer || detectSavingsTransfer(rawText)),
          isInvestment: Boolean(item.isInvestment || detectInvestment(rawText)),
        };
      });
    }
  } catch (err) {
    console.error('Gemini parsing error, falling back:', err);
  }

  return fallback.map(f => ({
    ...f,
    date: f.date || currentDate,
    paymentMethod: f.paymentMethod || (f.type === 'expense' ? 'UPI/Cash' : 'Bank Transfer'),
  }));
}

// ---------------- Category Budget & Date Report Calculation Helpers ----------------

export interface CategoryBudgetAnalysis {
  category: string;
  emoji: string;
  limit: number;
  spent: number;
  remaining: number;
  percentage: number;
  isOverBudget: boolean;
  type: string;
}

export function getCategoryEmoji(catName: string): string {
  const lower = (catName || '').toLowerCase();
  if (lower.includes('food') || lower.includes('dining') || lower.includes('restaurant') || lower.includes('khana') || lower.includes('cafe') || lower.includes('zomato') || lower.includes('swiggy')) return '🍔';
  if (lower.includes('grocer') || lower.includes('sabzi') || lower.includes('ration') || lower.includes('kirana') || lower.includes('vegetable') || lower.includes('doodh') || lower.includes('dahi')) return '🥦';
  if (lower.includes('transport') || lower.includes('fuel') || lower.includes('petrol') || lower.includes('diesel') || lower.includes('auto') || lower.includes('cab') || lower.includes('uber') || lower.includes('ola')) return '🚗';
  if (lower.includes('bill') || lower.includes('utility') || lower.includes('electricity') || lower.includes('wifi') || lower.includes('recharge') || lower.includes('bijli') || lower.includes('water')) return '💡';
  if (lower.includes('shop') || lower.includes('apparel') || lower.includes('clothes') || lower.includes('kapde') || lower.includes('amazon') || lower.includes('flipkart') || lower.includes('myntra')) return '🛍️';
  if (lower.includes('rent') || lower.includes('house') || lower.includes('housing') || lower.includes('kiraya') || lower.includes('flat') || lower.includes('pg')) return '🏠';
  if (lower.includes('entertain') || lower.includes('movie') || lower.includes('ott') || lower.includes('cinema') || lower.includes('game') || lower.includes('fun') || lower.includes('netflix')) return '🎬';
  if (lower.includes('health') || lower.includes('fit') || lower.includes('medic') || lower.includes('doctor') || lower.includes('hospital') || lower.includes('gym') || lower.includes('dawa')) return '💊';
  if (lower.includes('invest') || lower.includes('sip') || lower.includes('mutual') || lower.includes('stock') || lower.includes('gold') || lower.includes('savings')) return '📈';
  if (lower.includes('travel') || lower.includes('trip') || lower.includes('hotel') || lower.includes('flight') || lower.includes('train') || lower.includes('irctc')) return '✈️';
  if (lower.includes('edu') || lower.includes('school') || lower.includes('college') || lower.includes('fee') || lower.includes('book') || lower.includes('course')) return '📚';
  if (lower.includes('personal') || lower.includes('care') || lower.includes('salon') || lower.includes('beauty') || lower.includes('groom')) return '💇';
  if (lower.includes('gift') || lower.includes('allowance') || lower.includes('shagun')) return '🎁';
  if (lower.includes('salary') || lower.includes('wage') || lower.includes('employ')) return '💼';
  if (lower.includes('freelance') || lower.includes('consult')) return '💻';
  if (lower.includes('uncategorized') || lower.includes('unknown') || lower.includes('other')) return '📁';
  return '🏷️';
}

export function renderProgressBar(percentage: number): string {
  const clamped = Math.min(100, Math.max(0, percentage));
  const filledCount = Math.round((clamped / 100) * 10);
  const emptyCount = 10 - filledCount;
  return '█'.repeat(filledCount) + '░'.repeat(emptyCount);
}

export function getCategoryBudgetStatus(userId: string) {
  const store = getUserData(userId);
  syncBudgetsWithCategories(store);

  const nowInfo = getAppDateTime();
  const currentMonthPrefix = nowInfo.date.substring(0, 7); // e.g. "2026-09"
  const monthName = new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TIMEZONE,
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const expenseCategories = store.categories.filter(c => c.type === 'expense' || c.type === 'both' || !c.type);
  const items: CategoryBudgetAnalysis[] = [];

  let totalAllocatedBudget = 0;
  let totalSpentThisMonth = 0;

  for (const cat of expenseCategories) {
    const budget = store.budgets.find(b => b.category.toLowerCase() === cat.name.toLowerCase());
    const limit = budget ? (budget.limit || 0) : 0;
    
    // Sum expenses this month in this category
    const spent = store.transactions
      .filter(t => t.type === 'expense' && t.date && t.date.startsWith(currentMonthPrefix) && t.category.toLowerCase() === cat.name.toLowerCase())
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    totalAllocatedBudget += limit;
    totalSpentThisMonth += spent;

    const remaining = limit > 0 ? (limit - spent) : 0;
    const percentage = limit > 0 ? Math.round((spent / limit) * 100) : (spent > 0 ? 100 : 0);
    const isOverBudget = limit > 0 && spent > limit;

    items.push({
      category: cat.name,
      emoji: getCategoryEmoji(cat.name),
      limit,
      spent,
      remaining,
      percentage,
      isOverBudget,
      type: cat.type || 'expense',
    });
  }

  // Also include any other transactions with custom categories not in expenseCategories
  const otherExpenses = store.transactions.filter(t =>
    t.type === 'expense' &&
    t.date &&
    t.date.startsWith(currentMonthPrefix) &&
    !expenseCategories.some(c => c.name.toLowerCase() === t.category.toLowerCase())
  );

  if (otherExpenses.length > 0) {
    const groupedOther: Record<string, number> = {};
    for (const t of otherExpenses) {
      groupedOther[t.category] = (groupedOther[t.category] || 0) + (Number(t.amount) || 0);
    }
    for (const [catName, spent] of Object.entries(groupedOther)) {
      totalSpentThisMonth += spent;
      items.push({
        category: catName,
        emoji: getCategoryEmoji(catName),
        limit: 0,
        spent,
        remaining: 0,
        percentage: 100,
        isOverBudget: false,
        type: 'expense',
      });
    }
  }

  // Sort items: over budget first, then by spent descending, then by limit descending
  items.sort((a, b) => {
    if (a.isOverBudget && !b.isOverBudget) return -1;
    if (!a.isOverBudget && b.isOverBudget) return 1;
    if (b.spent !== a.spent) return b.spent - a.spent;
    return b.limit - a.limit;
  });

  const totalRemainingBudget = totalAllocatedBudget - totalSpentThisMonth;
  const overallPercentage = totalAllocatedBudget > 0 ? Math.round((totalSpentThisMonth / totalAllocatedBudget) * 100) : 0;

  return {
    monthName,
    currentMonthPrefix,
    totalAllocatedBudget,
    totalSpentThisMonth,
    totalRemainingBudget,
    overallPercentage,
    items,
  };
}

export function buildCategoryBudgetTelegramMessage(userId: string, userName: string): string {
  const data = getCategoryBudgetStatus(userId);
  const progressBar = renderProgressBar(data.overallPercentage);
  const remainingStatus = data.totalRemainingBudget >= 0
    ? `🟢 <b>Kul Bacha Budget:</b> ₹${data.totalRemainingBudget.toLocaleString('en-IN')} (${Math.max(0, 100 - data.overallPercentage)}% bacha)`
    : `⚠️ <b>Kul Over-Budget:</b> ₹${Math.abs(data.totalRemainingBudget).toLocaleString('en-IN')} (Budget se zyada kharcha!)`;

  const categoryLines = data.items.map(item => {
    const bar = renderProgressBar(item.percentage);
    if (item.limit > 0) {
      if (item.isOverBudget) {
        const overAmt = item.spent - item.limit;
        return `${item.emoji} <b>${item.category}</b>\n• Allotted: ₹${item.limit.toLocaleString('en-IN')} | Kharcha: <b>₹${item.spent.toLocaleString('en-IN')}</b>\n• Status: 🚨 <b>₹${overAmt.toLocaleString('en-IN')} OVER BUDGET!</b> (${item.percentage}% used)\n• Progress: [${bar}]`;
      } else {
        return `${item.emoji} <b>${item.category}</b>\n• Allotted: ₹${item.limit.toLocaleString('en-IN')} | Kharcha: ₹${item.spent.toLocaleString('en-IN')}\n• Bacha Balance: 🟢 <b>₹${item.remaining.toLocaleString('en-IN')}</b> (${100 - item.percentage}% bacha)\n• Progress: [${bar}] ${item.percentage}%`;
      }
    } else {
      return `${item.emoji} <b>${item.category}</b>\n• Kharcha: ₹${item.spent.toLocaleString('en-IN')} <i>(Koi limit set nahi hai)</i>`;
    }
  }).join('\n\n');

  return `🎯 <b>CATEGORY-WISE BUDGET & KHARCHA</b> (${data.monthName})
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khata:</b> ${userName}
💰 <b>Kul Monthly Allotted Budget:</b> ₹${data.totalAllocatedBudget.toLocaleString('en-IN')}
🔴 <b>Kul Spent This Month:</b> ₹${data.totalSpentThisMonth.toLocaleString('en-IN')}
${remainingStatus}
📊 <b>Overall Budget Used:</b> [${progressBar}] ${data.overallPercentage}%

━━━━━━━━━━━━━━━━━━━━
📂 <b>HAR CATEGORY KA DETAIL HISAAB:</b>

${categoryLines || 'ℹ️ Koi category budget nahi mila.'}

━━━━━━━━━━━━━━━━━━━━
💡 <i>Tip: Excel sheet bhej kar ya Web Dashboard se budget limit change kar sakte hain!</i>`;
}

// ---------------- Gullak (Unspent Monthly Budget Piggy Bank) Calculation Helpers ----------------

export function calculateGullakSummary(userId: string) {
  const store = getUserData(userId);
  syncBudgetsWithCategories(store);

  const nowInfo = getAppDateTime();
  const currentMonth = nowInfo.date.substring(0, 7); // e.g. "2026-09"

  const user = users.find(u => u.id === userId);
  // Default start month to user's configured trackingStartMonth, or user's createdAt month, or current month
  let userStartMonth = user?.trackingStartMonth;
  if (!userStartMonth) {
    if (user?.createdAt && user.createdAt.length >= 7) {
      userStartMonth = user.createdAt.substring(0, 7);
    } else {
      userStartMonth = currentMonth;
    }
  }

  // Gather all unique months from transactions plus current month, STRICTLY >= userStartMonth and <= currentMonth
  const monthsSet = new Set<string>();
  if (currentMonth >= userStartMonth) {
    monthsSet.add(currentMonth);
  }

  for (const t of store.transactions) {
    if (t.date && t.date.length >= 7) {
      const ym = t.date.substring(0, 7);
      if (ym >= userStartMonth && ym <= currentMonth) {
        monthsSet.add(ym);
      }
    }
  }

  // If no months match, fallback to currentMonth
  if (monthsSet.size === 0) {
    monthsSet.add(currentMonth);
  }

  const sortedMonths = Array.from(monthsSet)
    .filter(m => m >= userStartMonth && m <= currentMonth)
    .sort()
    .reverse(); // newest first
  const monthlyHistory: any[] = [];
  const categoryTotalsMap: Record<string, { totalSaved: number; currentMonthSaved: number }> = {};

  let totalGullakSavings = 0;
  let currentMonthSaved = 0;
  let pastMonthsSaved = 0;

  for (const ym of sortedMonths) {
    const [yearStr, monthStr] = ym.split('-');
    const yearNum = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const d = new Date(Date.UTC(yearNum, monthNum - 1, 1, 12, 0, 0));
    const monthName = new Intl.DateTimeFormat('en-IN', {
      timeZone: APP_TIMEZONE,
      month: 'long',
      year: 'numeric',
    }).format(d);

    const monthExpenses = store.transactions.filter(
      t => t.type === 'expense' && t.date && t.date.startsWith(ym)
    );

    const categorySavings: any[] = [];
    let monthTotalBudget = 0;
    let monthTotalSpent = 0;
    let monthTotalSaved = 0;

    for (const budget of store.budgets) {
      const limit = Number(budget.limit) || 0;
      if (limit <= 0) continue;

      const spent = monthExpenses
        .filter(t => t.category.toLowerCase() === budget.category.toLowerCase())
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      monthTotalBudget += limit;
      monthTotalSpent += spent;

      const savedAmount = Math.max(0, limit - spent);
      monthTotalSaved += savedAmount;

      categorySavings.push({
        category: budget.category,
        month: ym,
        budgetLimit: limit,
        spent,
        savedAmount,
      });

      if (!categoryTotalsMap[budget.category]) {
        categoryTotalsMap[budget.category] = { totalSaved: 0, currentMonthSaved: 0 };
      }
      categoryTotalsMap[budget.category].totalSaved += savedAmount;
      if (ym === currentMonth) {
        categoryTotalsMap[budget.category].currentMonthSaved += savedAmount;
      }
    }

    // Uncategorized or unbudgeted personal expenses in this month (excluding reimbursements & savings transfers)
    const uncategorizedSpent = monthExpenses
      .filter(t => {
        const isRim = Boolean(t.isReimbursement || t.category === 'Reimbursement');
        if (isRim || t.isSavingsTransfer) return false;
        const catLower = (t.category || '').toLowerCase().trim();
        const hasBudget = store.budgets.some(b => b.category.toLowerCase().trim() === catLower && (Number(b.limit) || 0) > 0);
        return !hasBudget || catLower === 'uncategorized' || catLower === 'undefined' || catLower === '';
      })
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    if (uncategorizedSpent > 0) {
      categorySavings.push({
        category: 'Uncategorized',
        month: ym,
        budgetLimit: 0,
        spent: uncategorizedSpent,
        savedAmount: 0,
      });
    }

    // Uncategorized spend reduces net monthly Gullak savings
    const netMonthSaved = Math.max(0, monthTotalSaved - uncategorizedSpent);

    // Sort category savings descending by savedAmount
    categorySavings.sort((a, b) => b.savedAmount - a.savedAmount);

    monthlyHistory.push({
      month: ym,
      monthName,
      totalBudget: monthTotalBudget,
      totalSpent: monthTotalSpent + uncategorizedSpent,
      uncategorizedSpent,
      totalSaved: netMonthSaved,
      categories: categorySavings,
    });

    totalGullakSavings += netMonthSaved;
    if (ym === currentMonth) {
      currentMonthSaved += netMonthSaved;
    } else {
      pastMonthsSaved += netMonthSaved;
    }
  }

  const categoryBreakdown = Object.entries(categoryTotalsMap).map(([catName, stats]) => {
    const catDef = store.categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
    return {
      category: catName,
      totalSaved: stats.totalSaved,
      currentMonthSaved: stats.currentMonthSaved,
      icon: catDef?.icon || 'Tag',
      color: catDef?.color || '#6366F1',
    };
  }).sort((a, b) => b.totalSaved - a.totalSaved);

  return {
    totalGullakSavings,
    currentMonthSaved,
    pastMonthsSaved,
    activeMonthsCount: sortedMonths.length,
    trackingStartMonth: userStartMonth,
    categoryBreakdown,
    monthlyHistory,
  };
}

export function buildGullakReportTelegramMessage(userId: string, userName: string): string {
  const gullak = calculateGullakSummary(userId);
  const nowInfo = getAppDateTime();
  const currentMonthName = new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TIMEZONE,
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const currentMonthRecord = gullak.monthlyHistory.find(m => m.month === nowInfo.date.substring(0, 7));
  const currentSavedCats = currentMonthRecord?.categories.filter(c => c.budgetLimit > 0) || [];

  let catDetails = '';
  if (currentSavedCats.length > 0) {
    catDetails = currentSavedCats.map(c => {
      const emoji = getCategoryEmoji(c.category);
      if (c.savedAmount > 0) {
        return `${emoji} <b>${c.category}:</b> Bacha 🟢 <b>₹${c.savedAmount.toLocaleString('en-IN')}</b>\n   • Budget: ₹${c.budgetLimit.toLocaleString('en-IN')} | Kharcha: ₹${c.spent.toLocaleString('en-IN')}`;
      } else {
        const over = c.spent - c.budgetLimit;
        return `${emoji} <b>${c.category}:</b> 🔴 Budget pura use hua (${over > 0 ? `₹${over.toLocaleString('en-IN')} over` : 'Limit reached'})`;
      }
    }).join('\n\n');
  } else {
    catDetails = 'ℹ️ Abhi tak koi category budget set nahi hai. Web Dashboard par budget set karein!';
  }

  // Top saved all-time categories
  const topSavedLifetime = gullak.categoryBreakdown.filter(c => c.totalSaved > 0).slice(0, 3).map(c => {
    const emoji = getCategoryEmoji(c.category);
    return `• ${emoji} <b>${c.category}:</b> ₹${c.totalSaved.toLocaleString('en-IN')} Gullak me jama`;
  }).join('\n');

  return `🐷 <b>GULLAK (DIGITAL PIGGY BANK) REPORT</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khata:</b> ${userName}
💰 <b>Kul Gullak Bachat (Total Saved):</b> <b>₹${gullak.totalGullakSavings.toLocaleString('en-IN')}</b>
📅 <b>Is Mahine (${currentMonthName}) Ki Bachat:</b> ₹${gullak.currentMonthSaved.toLocaleString('en-IN')}
⏳ <b>Pichle Mahino Ka Bacha Hua Fund:</b> ₹${gullak.pastMonthsSaved.toLocaleString('en-IN')}

━━━━━━━━━━━━━━━━━━━━
📂 <b>IS MAHINE KA BUDGET SE BACHA HISAAB:</b>

${catDetails}

${topSavedLifetime ? `\n━━━━━━━━━━━━━━━━━━━━\n🏆 <b>TOP ALL-TIME SAVINGS CATEGORIES:</b>\n${topSavedLifetime}` : ''}

━━━━━━━━━━━━━━━━━━━━
💡 <i>Tip: Har mahine category budget se jitna paisa bachta hai, wo automatically aapke Gullak me jama hota rehta hai!</i>`;
}

// ---------------- Accounts & Cards Balance Tracker ----------------

const ACCOUNTS_META: Record<string, {
  id: string;
  name: string;
  shortName: string;
  type: 'rupay_card' | 'credit_card' | 'bank_account' | 'cash';
  badge: string;
  color: string;
  creditLimit?: number;
}> = {
  'ICICI CC 0000': {
    id: 'ICICI CC 0000',
    name: 'ICICI RuPay UPI CC (0000)',
    shortName: 'ICICI CC 0000',
    type: 'rupay_card',
    badge: 'RuPay CC',
    color: '#f97316',
    creditLimit: 120000,
  },
  'SBI CC 5733': {
    id: 'SBI CC 5733',
    name: 'SBI SimplyCLICK CC (5733)',
    shortName: 'SBI CC 5733',
    type: 'credit_card',
    badge: 'SBI CC',
    color: '#0284c7',
    creditLimit: 150000,
  },
  'SBI CC 6526': {
    id: 'SBI CC 6526',
    name: 'SBI Pulse / Prime CC (6526)',
    shortName: 'SBI CC 6526',
    type: 'credit_card',
    badge: 'SBI CC',
    color: '#2563eb',
    creditLimit: 100000,
  },
  'AX CC 8210': {
    id: 'AX CC 8210',
    name: 'Axis Flipkart / Ace CC (8210)',
    shortName: 'AX CC 8210',
    type: 'credit_card',
    badge: 'Axis CC',
    color: '#9333ea',
    creditLimit: 180000,
  },
  'AX CC 5376': {
    id: 'AX CC 5376',
    name: 'Axis Neo / Privilege CC (5376)',
    shortName: 'AX CC 5376',
    type: 'credit_card',
    badge: 'Axis CC',
    color: '#a855f7',
    creditLimit: 90000,
  },
  'IC Bank': {
    id: 'IC Bank',
    name: 'ICICI Bank Savings Account',
    shortName: 'IC Bank',
    type: 'bank_account',
    badge: 'ICICI Bank',
    color: '#ea580c',
  },
  'AX Bank': {
    id: 'AX Bank',
    name: 'Axis Bank Salary Account',
    shortName: 'AX Bank',
    type: 'bank_account',
    badge: 'Axis Bank',
    color: '#be185d',
  },
  'Cash': {
    id: 'Cash',
    name: 'Cash in Hand / Pocket',
    shortName: 'Cash',
    type: 'cash',
    badge: 'Cash',
    color: '#10b981',
  },
};

export function calculateAccountsBalances(userId: string) {
  const store = getUserData(userId);
  const baseBalances = store.accountBaseBalances || {};
  const baseTimestamps = store.accountBalanceSetTimestamps || {};
  const cardLimits = store.cardCreditLimits || {};
  const wifeBase = Number(store.wifeBaseBalance) || 0;
  const wifeBaseTimestamp = store.wifeBalanceSetTimestamp;
  const txs = store.transactions || [];
  const savingsTransfers = store.savingsTransfers || [];

  const accounts: Record<string, any> = {};
  let totalBankCashBalance = 0;
  let totalCardAvailableLimit = 0;
  let totalCardOutstanding = 0;

  let needsSave = false;

  for (const [accId, meta] of Object.entries(ACCOUNTS_META)) {
    const isCard = meta.type === 'credit_card' || meta.type === 'rupay_card';
    const base = Number(baseBalances[accId]) || 0;
    let setTimeStr = baseTimestamps[accId];

    // If an account has a base balance set but no timestamp recorded yet,
    // initialize timestamp to now so historical transactions are not double-counted on top of today's balance!
    if (!setTimeStr && baseBalances[accId] !== undefined) {
      setTimeStr = new Date().toISOString();
      if (!store.accountBalanceSetTimestamps) store.accountBalanceSetTimestamps = {};
      store.accountBalanceSetTimestamps[accId] = setTimeStr;
      needsSave = true;
    }

    const setTimeMs = setTimeStr ? new Date(setTimeStr).getTime() : 0;

    let credits = 0;
    let debits = 0;

    for (const t of txs) {
      const tAcc = t.account || 'ICICI CC 0000';
      if (tAcc === accId) {
        // Skip transactions that existed on or before this baseline was set as of today
        if (setTimeMs > 0) {
          const tTimeMs = t.createdAt ? new Date(t.createdAt).getTime() : 0;
          if (tTimeMs > 0 && tTimeMs <= setTimeMs) {
            continue;
          }
        }

        const amt = Number(t.amount) || 0;
        if (t.type === 'income') {
          credits += amt;
        } else {
          debits += amt;
        }
      }
    }

    // For bank/cash accounts, also subtract any dedicated savings transfers sent from this account
    if (!isCard) {
      for (const s of savingsTransfers) {
        if (s.fromAccount === accId) {
          if (setTimeMs > 0) {
            const sTimeMs = s.createdAt ? new Date(s.createdAt).getTime() : 0;
            if (sTimeMs > 0 && sTimeMs <= setTimeMs) {
              continue;
            }
          }

          const sAmt = Number(s.amount) || 0;
          const isDupe = txs.some(
            t => t.account === accId &&
                 t.isSavingsTransfer &&
                 Number(t.amount) === sAmt &&
                 t.date === s.date
          );
          if (!isDupe) {
            debits += sAmt;
          }
        }
      }
    }

    if (isCard) {
      const customLimit = Number(cardLimits[accId]);
      const creditLimit = (customLimit && customLimit > 0) ? customLimit : (meta.creditLimit || 100000);
      const currentOutstanding = Math.max(0, base + debits - credits);
      const availableLimit = Math.max(0, creditLimit - currentOutstanding);

      accounts[accId] = {
        accountId: accId,
        name: meta.name,
        shortName: meta.shortName,
        type: meta.type,
        badge: meta.badge,
        color: meta.color,
        baseBalance: base,
        credits,
        debits,
        currentBalance: availableLimit,
        creditLimit,
        availableLimit,
        currentOutstanding,
      };

      totalCardAvailableLimit += availableLimit;
      totalCardOutstanding += currentOutstanding;
    } else {
      const currentBalance = base + credits - debits;

      accounts[accId] = {
        accountId: accId,
        name: meta.name,
        shortName: meta.shortName,
        type: meta.type,
        badge: meta.badge,
        color: meta.color,
        baseBalance: base,
        credits,
        debits,
        currentBalance,
      };

      totalBankCashBalance += currentBalance;
    }
  }

  // Calculate Wife Savings Balance:
  let wifeSetTimeStr = wifeBaseTimestamp;
  if (!wifeSetTimeStr && store.wifeBaseBalance !== undefined && store.wifeBaseBalance > 0) {
    wifeSetTimeStr = new Date().toISOString();
    store.wifeBalanceSetTimestamp = wifeSetTimeStr;
    needsSave = true;
  }
  const wifeSetTimeMs = wifeSetTimeStr ? new Date(wifeSetTimeStr).getTime() : 0;

  let totalTransferred = 0;
  for (const s of savingsTransfers) {
    if (wifeSetTimeMs > 0) {
      const sTimeMs = s.createdAt ? new Date(s.createdAt).getTime() : 0;
      if (sTimeMs > 0 && sTimeMs <= wifeSetTimeMs) {
        continue;
      }
    }
    totalTransferred += (Number(s.amount) || 0);
  }
  for (const t of txs) {
    if (t.isSavingsTransfer) {
      if (wifeSetTimeMs > 0) {
        const tTimeMs = t.createdAt ? new Date(t.createdAt).getTime() : 0;
        if (tTimeMs > 0 && tTimeMs <= wifeSetTimeMs) {
          continue;
        }
      }
      const tAmt = Number(t.amount) || 0;
      const isDupe = savingsTransfers.some(
        s => Number(s.amount) === tAmt && s.date === t.date
      );
      if (!isDupe) {
        totalTransferred += tAmt;
      }
    }
  }

  const wifeCurrentBalance = wifeBase + totalTransferred;

  if (needsSave) {
    saveUserData(userId, store);
  }

  return {
    accountBaseBalances: baseBalances,
    accountBalanceSetTimestamps: store.accountBalanceSetTimestamps || {},
    wifeBaseBalance: wifeBase,
    wifeBalanceSetTimestamp: store.wifeBalanceSetTimestamp,
    cardCreditLimits: cardLimits,
    accounts,
    totalBankCashBalance,
    totalCardAvailableLimit,
    totalCardOutstanding,
    wifeSavings: {
      baseBalance: wifeBase,
      totalTransferred,
      currentBalance: wifeCurrentBalance,
    },
  };
}

export function buildBalancesTelegramMessage(userId: string, userName: string, isOwner = true): string {
  if (!isOwner) {
    return `💰 <b>Account Balances:</b> 🔒 Masked for Family Privacy (Sirf Owner dekh sakte hain).`;
  }

  const data = calculateAccountsBalances(userId);
  const { accounts, totalBankCashBalance, totalCardAvailableLimit, totalCardOutstanding, wifeSavings } = data;

  const icBank = accounts['IC Bank'] || {};
  const axBank = accounts['AX Bank'] || {};
  const cash = accounts['Cash'] || {};

  const iciciCC = accounts['ICICI CC 0000'] || {};
  const sbi5733 = accounts['SBI CC 5733'] || {};
  const sbi6526 = accounts['SBI CC 6526'] || {};
  const ax8210 = accounts['AX CC 8210'] || {};
  const ax5376 = accounts['AX CC 5376'] || {};

  return `🏦 <b>ACCOUNTS & CARDS LIVE BALANCE</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khata:</b> ${userName}

🏛️ <b>BANK ACCOUNTS & CASH:</b>
• 🏦 <b>ICICI Bank:</b> <b>₹${(icBank.currentBalance || 0).toLocaleString('en-IN')}</b>
  <i>(Base: ₹${(icBank.baseBalance || 0).toLocaleString('en-IN')} | +In: ₹${(icBank.credits || 0).toLocaleString('en-IN')} | -Out: ₹${(icBank.debits || 0).toLocaleString('en-IN')})</i>
• 🏦 <b>Axis Bank (Salary):</b> <b>₹${(axBank.currentBalance || 0).toLocaleString('en-IN')}</b>
  <i>(Base: ₹${(axBank.baseBalance || 0).toLocaleString('en-IN')} | +In: ₹${(axBank.credits || 0).toLocaleString('en-IN')} | -Out: ₹${(axBank.debits || 0).toLocaleString('en-IN')})</i>
• 💵 <b>Cash in Pocket:</b> <b>₹${(cash.currentBalance || 0).toLocaleString('en-IN')}</b>
  <i>(Base: ₹${(cash.baseBalance || 0).toLocaleString('en-IN')} | -Spent: ₹${(cash.debits || 0).toLocaleString('en-IN')})</i>
────────────────────
👉 <b>Kul Bank & Cash Balance:</b> <b>₹${totalBankCashBalance.toLocaleString('en-IN')}</b>

💳 <b>CREDIT CARDS (AVAILABLE / SPENT):</b>
• 🟠 <b>ICICI RuPay (0000):</b>
  Limit: ₹${(iciciCC.creditLimit || 120000).toLocaleString('en-IN')} | Bacha: 🟢 <b>₹${(iciciCC.availableLimit || 0).toLocaleString('en-IN')}</b>
  Spends/Due: 🔴 ₹${(iciciCC.currentOutstanding || 0).toLocaleString('en-IN')}
• 🔵 <b>SBI SimplyCLICK (5733):</b>
  Limit: ₹${(sbi5733.creditLimit || 150000).toLocaleString('en-IN')} | Bacha: 🟢 <b>₹${(sbi5733.availableLimit || 0).toLocaleString('en-IN')}</b>
  Spends/Due: 🔴 ₹${(sbi5733.currentOutstanding || 0).toLocaleString('en-IN')}
• 🔷 <b>SBI Pulse (6526):</b>
  Limit: ₹${(sbi6526.creditLimit || 100000).toLocaleString('en-IN')} | Bacha: 🟢 <b>₹${(sbi6526.availableLimit || 0).toLocaleString('en-IN')}</b>
  Spends/Due: 🔴 ₹${(sbi6526.currentOutstanding || 0).toLocaleString('en-IN')}
• 🟣 <b>Axis Flipkart (8210):</b>
  Limit: ₹${(ax8210.creditLimit || 180000).toLocaleString('en-IN')} | Bacha: 🟢 <b>₹${(ax8210.availableLimit || 0).toLocaleString('en-IN')}</b>
  Spends/Due: 🔴 ₹${(ax8210.currentOutstanding || 0).toLocaleString('en-IN')}
• 🟪 <b>Axis Neo (5376):</b>
  Limit: ₹${(ax5376.creditLimit || 90000).toLocaleString('en-IN')} | Bacha: 🟢 <b>₹${(ax5376.availableLimit || 0).toLocaleString('en-IN')}</b>
  Spends/Due: 🔴 ₹${(ax5376.currentOutstanding || 0).toLocaleString('en-IN')}
────────────────────
💳 <b>Kul Available Card Limit:</b> <b>₹${totalCardAvailableLimit.toLocaleString('en-IN')}</b>
🔴 <b>Kul Card Spends/Outstanding:</b> <b>₹${totalCardOutstanding.toLocaleString('en-IN')}</b>

🌸 <b>WIFE'S SAVINGS ACCOUNT:</b>
• 🌸 <b>Kul Live Balance:</b> <b>₹${wifeSavings.currentBalance.toLocaleString('en-IN')}</b>
  <i>(Base Balance: ₹${wifeSavings.baseBalance.toLocaleString('en-IN')} | Bheja Hua: ₹${wifeSavings.totalTransferred.toLocaleString('en-IN')})</i>

━━━━━━━━━━━━━━━━━━━━
💡 <i>Opening balance set karne ke liye bot me bhejein:</i>
<code>/setbalance icici 50000</code>
<code>/setbalance axis 80000</code>
<code>/setbalance cash 5000</code>
<code>/setbalance wife 20000</code>
<i>Ya Web Dashboard par "Balances Set Karein" click karein!</i>`;
}

export function isPureDateQuery(rawText: string): string | null {
  if (!rawText) return null;
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // Exclude date change / modification commands, udhaar/khata actions, and fuel commands
  if (
    /\b(change|badal|badlo|karo|update|edit|set|udhar|udhaar|khata|diya|diye|liya|liye|settle|fuel|mileage)\b/i.test(lower)
  ) {
    return null;
  }

  // 1. Direct command syntax: /date <date>, /day <date>, /tareeq <date>, /history <date>
  if (
    lower.startsWith('/date') ||
    lower.startsWith('/day') ||
    lower.startsWith('/history') ||
    lower.startsWith('/tareeq') ||
    lower.startsWith('/tarikh')
  ) {
    const arg = lower.replace(/^\/(?:date|day|history|tareeq|tarikh)\s*/, '').trim();
    return parseCustomDateString(arg || 'today');
  }

  // 2. Query phrases containing date words or keywords
  const isQueryPattern = /\b(ka kharcha|kitna kharcha|ka hisaab|ka hisab|ki kamai|ki income|expense|transactions|report|batao|hua|tha|dekho|dikhaye)\b/i.test(lower);
  const parsedDate = parseCustomDateString(lower);
  if (!parsedDate) return null;

  // Check if text contains non-date numbers (which would indicate a new transaction amount like "300 dahi 2 sep")
  const textWithoutDate = lower
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, '')
    .replace(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g, '')
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?[\s\-_]+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)(?:[\s\-_]+\d{2,4})?\b/gi, '')
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[\s\-_]+\d{1,2}(?:st|nd|rd|th)?(?:[\s\-_,]+\d{2,4})?\b/gi, '')
    .replace(/\b(yesterday|kal|beeta kal|parso|today|aaj)\b/gi, '');

  const hasRemainingNumber = /\b\d+(\.\d+)?\b/.test(textWithoutDate);

  if (isQueryPattern && !hasRemainingNumber) {
    return parsedDate;
  }

  // If there are no other numbers, and the text is primarily a date inquiry
  if (!hasRemainingNumber) {
    return parsedDate;
  }

  return null;
}

export interface SenderTelegramContext {
  isSenderOwner: boolean;
  senderDisplayName?: string;
  chatId?: string;
  fromId?: string;
}

export function buildDateReportTelegramMessage(
  userId: string, 
  targetDate: string, 
  userName: string,
  senderContext?: SenderTelegramContext
): string {
  const store = getUserData(userId);
  const isOwner = senderContext ? senderContext.isSenderOwner : true;
  const senderDisplayName = senderContext?.senderDisplayName || '';
  const chatId = senderContext?.chatId || '';
  const fromId = senderContext?.fromId || '';

  const matching = store.transactions.filter(t => t.date === targetDate);

  // Format date display
  const [y, m, d] = targetDate.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const formattedDate = new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TIMEZONE,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(dateObj);

  let totalIncome = 0;
  let totalExpense = 0;

  for (const t of matching) {
    if (t.type === 'income') {
      totalIncome += (Number(t.amount) || 0);
    } else {
      totalExpense += (Number(t.amount) || 0);
    }
  }

  const net = totalIncome - totalExpense;

  if (matching.length === 0) {
    return `📅 <b>TAREEQ KA HISAAB-KITAAB REPORT</b>
<b>${formattedDate}</b> (<code>${targetDate}</code>)
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khata:</b> ${userName}${!isOwner ? ` (👤 <b>${senderDisplayName}</b>)` : ''}

ℹ️ <b>Is tareeq ko koi bhi kharcha ya income record nahi hua tha.</b>

🟢 <b>Income:</b> ₹0
🔴 <b>Kharcha:</b> ₹0
💰 <b>Net Day Savings:</b> ₹0

━━━━━━━━━━━━━━━━━━━━
💡 <b>Is tareeq par kharcha ya income add karne ke liye aise likhein:</b>
• <code>300 dahi cash on ${targetDate}</code>
• <code>500 petrol upi on ${targetDate}</code>
• <code>salary 25000 bank on ${targetDate}</code>`;
  }

  const txListText = matching.map((t, idx) => {
    const isOwnTx = isOwner || 
      (t.telegramChatId && (t.telegramChatId === chatId || (fromId && t.telegramChatId === fromId))) ||
      (t.telegramUser && senderDisplayName && (
        t.telegramUser.toLowerCase() === senderDisplayName.toLowerCase() ||
        t.telegramUser.toLowerCase().includes(senderDisplayName.toLowerCase()) ||
        senderDisplayName.toLowerCase().includes(t.telegramUser.toLowerCase())
      ));

    const sign = t.type === 'income' ? '🟢 +' : '🔴 -';
    const amtStr = isOwnTx ? `₹${t.amount.toLocaleString('en-IN')}` : `🔒 Masked`;
    const pm = t.paymentMethod ? `[${t.paymentMethod}]` : '';
    const timeStr = t.time ? ` • 🕒 ${t.time}` : '';
    const emoji = getCategoryEmoji(t.category);
    const byTag = t.telegramUser ? ` <i>(by ${t.telegramUser})</i>` : '';
    return `<b>[#${idx + 1}]</b> ${sign}${amtStr} • <b>${t.description}</b> (${emoji} ${t.category}) ${pm}${byTag}${timeStr}`;
  }).join('\n\n');

  if (!isOwner) {
    const memberMatching = matching.filter(t => 
      (t.telegramChatId && (t.telegramChatId === chatId || (fromId && t.telegramChatId === fromId))) ||
      (t.telegramUser && senderDisplayName && (
        t.telegramUser.toLowerCase() === senderDisplayName.toLowerCase() ||
        t.telegramUser.toLowerCase().includes(senderDisplayName.toLowerCase()) ||
        senderDisplayName.toLowerCase().includes(t.telegramUser.toLowerCase())
      ))
    );
    const memberDaySpent = memberMatching
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    return `📅 <b>TAREEQ KA HISAAB-KITAAB REPORT</b>
<b>${formattedDate}</b> (<code>${targetDate}</code>)
━━━━━━━━━━━━━━━━━━━━
👤 <b>Viewer:</b> <b>${senderDisplayName}</b> <i>(Family Privacy Mode)</i>
👤 <b>Aapka Is Din Ka Kharcha:</b> <b>₹${memberDaySpent.toLocaleString('en-IN')}</b> (${memberMatching.length} transactions)
━━━━━━━━━━━━━━━━━━━━
🟢 <b>Kul Family Income:</b> 🔒 Masked (Owner Protected)
🔴 <b>Kul Family Kharcha:</b> 🔒 Masked (Owner Protected)
💰 <b>Net Day Savings:</b> 🔒 Masked (Owner Protected)
📝 <b>Total Transactions:</b> ${matching.length}

━━━━━━━━━━━━━━━━━━━━
📋 <b>TRANSACTIONS LIST (Is Tareeq Ke):</b>

${txListText}

━━━━━━━━━━━━━━━━━━━━
🔒 <i>(Owner Privacy: Aapko sirf aapke transactions ka amount dikhta hai)</i>`;
  }

  return `📅 <b>TAREEQ KA HISAAB-KITAAB REPORT</b>
<b>${formattedDate}</b> (<code>${targetDate}</code>)
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khata:</b> ${userName}
🟢 <b>Kul Income (Kamai):</b> ₹${totalIncome.toLocaleString('en-IN')}
🔴 <b>Kul Kharcha:</b> ₹${totalExpense.toLocaleString('en-IN')}
💰 <b>Net Day Savings:</b> ${net >= 0 ? '+' : ''}₹${net.toLocaleString('en-IN')}
📝 <b>Total Transactions:</b> ${matching.length}

━━━━━━━━━━━━━━━━━━━━
📋 <b>TRANSACTIONS LIST (Is Tareeq Ke):</b>

${txListText}

━━━━━━━━━━━━━━━━━━━━
💡 <i>Kisi transaction ko delete karne ke liye: <code>delete ${matching[0]?.description || 'item'}</code></i>`;
}

// ---------------- Helper for Item-Specific Spending Queries (/spent <item>, "signature pe kitna kharch huwa") ----------------

export function cleanItemKeyword(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/^(mera|meri|mere|apna|apne|the|my|all|total|kul)\s+/i, '')
    .replace(/\s+(pe|par|me|mein|mai|ka|ki|ke|ko|par bhi|pe bhi)$/i, '')
    .trim();
}

export function extractItemSpendingQuery(rawText: string): string | null {
  if (!rawText) return null;
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // 1. Direct slash commands: /spent <item>, /item <item>, /merchant <item>, /search <item>, /kitna <item>
  if (
    lower.startsWith('/spent') ||
    lower.startsWith('/item') ||
    lower.startsWith('/merchant') ||
    lower.startsWith('/search') ||
    lower.startsWith('/kitna') ||
    lower.startsWith('/itemkharcha')
  ) {
    const keyword = lower.replace(/^\/(?:spent|item|merchant|search|kitna|itemkharcha)\s*/i, '').trim();
    const cleaned = cleanItemKeyword(keyword);
    return cleaned.length > 0 ? cleaned : null;
  }

  // If text contains price amounts like "500 petrol" or "petrol 500 upi", it's an expense transaction entry, not a query.
  const hasStandaloneNumber = /\b\d+(\.\d+)?\b/.test(lower);
  if (hasStandaloneNumber) {
    return null;
  }

  // Check for common command words that shouldn't be parsed as item queries
  const excludedExactPhrases = [
    'balance', 'summary', 'budget', 'budgets', 'gullak', 'tips', 'recent', 'undo', 'help', 'accounts', 'categories',
    'aaj ka hisab', 'kal ka hisab', 'aaj', 'kal', 'parso', 'mahine ka hisaab', 'mahina', 'hisab',
    'kitna bacha', 'bachat', 'faltu kharcha', 'menu', 'buttons', 'unlink', 'clearall'
  ];
  if (excludedExactPhrases.includes(lower)) {
    return null;
  }

  // 2. English Query Patterns
  // "how much spent on <item>", "how much did i spend on <item>", "total spent on <item>", "spending on <item>"
  const enMatch1 = lower.match(/^(?:how much (?:did i )?(?:spend|spent) on|total spent on|total spending on|spending on|expense on|expenses on)\s+(.+)$/i);
  if (enMatch1 && enMatch1[1]) {
    const kw = cleanItemKeyword(enMatch1[1].replace(/[?.,!]+$/, ''));
    if (kw.length >= 2) return kw;
  }

  const enMatch2 = lower.match(/^(.+?)\s+(?:total spent|total expense|total expenses|spending|total cost)$/i);
  if (enMatch2 && enMatch2[1]) {
    const kw = cleanItemKeyword(enMatch2[1].replace(/[?.,!]+$/, ''));
    if (kw.length >= 2) return kw;
  }

  // 3. Hinglish & Hindi Query Patterns
  // "<item> pe / par / me / mein kitna kharch huwa / hua / laga / gaya / tha"
  // e.g. "signature pe kitna kharch huwa", "petrol me kitna gaya", "chai pe kitna laga"
  const hinglishMatch1 = lower.match(/^(.+?)\s+(?:pe|par|me|mein|mai)\s+(?:kul\s+)?(?:kitna|kitne|total)\s+(?:paisa\s+)?(?:kharch|kharcha|kharche|gaya|gaye|laga|lage|spent)(?:\s+(?:hua|huwa|tha|huye|hai))?\s*[?.,!]*$/i);
  if (hinglishMatch1 && hinglishMatch1[1]) {
    const kw = cleanItemKeyword(hinglishMatch1[1]);
    if (kw.length >= 2 && !['aaj', 'kal', 'parso', 'mahina', 'mahine'].includes(kw)) return kw;
  }

  // "<item> me/pe kitna gaya / laga"
  // e.g. "petrol me kitna gaya", "uber me kitna gaya", "chai pe kitna laga"
  const hinglishMatch4 = lower.match(/^(.+?)\s+(?:me|mein|mai|pe|par)\s+(?:kitna|kitne)\s+(?:gaya|gaye|laga|lage|kharcha)(?:\s+(?:hua|huwa|tha|huye|hai))?\s*[?.,!]*$/i);
  if (hinglishMatch4 && hinglishMatch4[1]) {
    const kw = cleanItemKeyword(hinglishMatch4[1]);
    if (kw.length >= 2 && !['aaj', 'kal', 'parso', 'mahina', 'mahine'].includes(kw)) return kw;
  }

  // "<item> ka hisaab / hisab / total / total kharcha / kul kharcha"
  // e.g. "signature ka hisaab", "zomato ka total kharcha", "swiggy ka kharcha", "petrol ka hisab"
  const hinglishMatch2 = lower.match(/^(.+?)\s+(?:ka|ki|ke)\s+(?:kul\s+)?(?:hisaab|hisab|total kharcha|total kharche|total|kul kharcha|kharcha|spending|report|details)\s*[?.,!]*$/i);
  if (hinglishMatch2 && hinglishMatch2[1]) {
    const kw = cleanItemKeyword(hinglishMatch2[1]);
    if (kw.length >= 2 && !['aaj', 'kal', 'parso', 'mahina', 'mahine', 'is mahine', 'budget', 'gullak', 'paisa', 'sab', 'aaj ka', 'kal ka'].includes(kw)) {
      return kw;
    }
  }

  // "kitna kharch hua / gaya <item> pe / par / me" or "kitna kharcha hua <item> ka"
  // e.g. "kitna kharch hua signature pe", "kitna gaya petrol me"
  const hinglishMatch3 = lower.match(/^(?:kitna|kitne|total)\s+(?:kharch|kharcha|kharche|gaya|gaye|laga|lage|paisa gaya)(?:\s+(?:hua|huwa|tha|huye|hai))?\s+(?:pe|par|me|mein|mai|ka|ki|ke|on)?\s+(.+?)\s*[?.,!]*$/i);
  if (hinglishMatch3 && hinglishMatch3[1]) {
    const kw = cleanItemKeyword(hinglishMatch3[1]);
    if (kw.length >= 2 && !['aaj', 'kal', 'parso', 'mahina', 'mahine'].includes(kw)) return kw;
  }

  return null;
}

export function isTransactionItemMatch(t: Transaction, cleanQuery: string): boolean {
  if (!t || !cleanQuery) return false;
  const cleanQ = cleanQuery.toLowerCase().trim();
  if (!cleanQ) return false;

  const desc = (t.description || '').toLowerCase().trim();
  const tags = (t.tags || []).map(tg => tg.toLowerCase().trim());
  const cat = (t.category || '').toLowerCase().trim();

  // 1. Direct or word-based match in description (e.g. "signature" matches "signature", "signature cigarettes")
  if (desc === cleanQ || desc.includes(cleanQ)) return true;
  const descWords = desc.split(/[\s,._\-/]+/);
  if (descWords.some(w => w === cleanQ || (w.length >= 3 && cleanQ.length >= 3 && (w.startsWith(cleanQ) || cleanQ.startsWith(w))))) {
    return true;
  }

  // 2. Direct match in tags
  if (tags.some(tg => tg === cleanQ || tg.includes(cleanQ) || cleanQ.includes(tg))) {
    return true;
  }

  // 3. Category match ONLY if the search query is targeting the actual category name
  if (cat === cleanQ || (cleanQ.length >= 4 && cat.includes(cleanQ))) {
    return true;
  }

  return false;
}

export function buildItemSpendingReportTelegramMessage(
  userId: string, 
  itemQuery: string, 
  userName: string,
  senderContext?: SenderTelegramContext
): string {
  const store = getUserData(userId);
  const cleanQ = itemQuery.toLowerCase().trim();
  const isOwner = senderContext ? senderContext.isSenderOwner : true;
  const senderDisplayName = senderContext?.senderDisplayName || '';
  const chatId = senderContext?.chatId || '';
  const fromId = senderContext?.fromId || '';

  // Search matching transactions ONLY in item description & tags (never entire batch rawMessage)
  let matchingExpenses = store.transactions.filter(t => {
    if (t.type !== 'expense') return false;
    return isTransactionItemMatch(t, cleanQ);
  });

  let matchingIncomes = store.transactions.filter(t => {
    if (t.type !== 'income') return false;
    return isTransactionItemMatch(t, cleanQ);
  });

  const displayKeyword = itemQuery.charAt(0).toUpperCase() + itemQuery.slice(1);

  if (matchingExpenses.length === 0 && matchingIncomes.length === 0) {
    return `🔍 <b>ITEM EXPENSE REPORT: "${displayKeyword.toUpperCase()}"</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khata:</b> ${userName}${!isOwner ? ` (👤 <b>${senderDisplayName}</b>)` : ''}

ℹ️ <b>"${itemQuery}" ke naam se koi bhi kharcha ya transaction nahi mila.</b>

💡 <b>Aise try karein:</b>
• Naya kharcha add karein: <code>250 ${itemQuery} upi</code>
• Kisi doosre item/merchant ko search karein: <code>/spent petrol</code> ya <code>zomato ka kharcha</code>
• Saare recent transactions dekhne ke liye <code>/recent</code> bhejein.`;
  }

  if (!isOwner) {
    // For Family Member: only calculate and show transactions added by this family member
    matchingExpenses = matchingExpenses.filter(t => 
      (t.telegramChatId && (t.telegramChatId === chatId || (fromId && t.telegramChatId === fromId))) ||
      (t.telegramUser && senderDisplayName && (
        t.telegramUser.toLowerCase() === senderDisplayName.toLowerCase() ||
        t.telegramUser.toLowerCase().includes(senderDisplayName.toLowerCase()) ||
        senderDisplayName.toLowerCase().includes(t.telegramUser.toLowerCase())
      ))
    );

    matchingIncomes = matchingIncomes.filter(t => 
      (t.telegramChatId && (t.telegramChatId === chatId || (fromId && t.telegramChatId === fromId))) ||
      (t.telegramUser && senderDisplayName && (
        t.telegramUser.toLowerCase() === senderDisplayName.toLowerCase() ||
        t.telegramUser.toLowerCase().includes(senderDisplayName.toLowerCase()) ||
        senderDisplayName.toLowerCase().includes(t.telegramUser.toLowerCase())
      ))
    );

    if (matchingExpenses.length === 0 && matchingIncomes.length === 0) {
      return `🔍 <b>ITEM EXPENSE REPORT: "${displayKeyword.toUpperCase()}"</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Viewer:</b> <b>${senderDisplayName}</b> <i>(Family Privacy Mode)</i>

ℹ️ <b>Aapke dwara "${itemQuery}" par abhi tak koi personal kharcha log nahi kiya gaya hai.</b>

💡 <i>Naya kharcha add karne ke liye likhein:</i> <code>300 ${itemQuery} cash</code>`;
    }

    const memberTotalSpent = matchingExpenses.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const purchasesList = matchingExpenses.slice(0, 6).map((t, idx) => {
      const pm = t.paymentMethod ? `[${t.paymentMethod}]` : '[UPI/Cash]';
      const timeStr = t.time ? ` (${t.time})` : '';
      const emoji = getCategoryEmoji(t.category);
      return `<b>[#${idx + 1}]</b> 🔴 <b>₹${Number(t.amount).toLocaleString('en-IN')}</b> • <b>${t.description}</b> (${emoji} ${t.category}) ${pm}\n   📅 <i>${t.date}${timeStr}</i>`;
    }).join('\n\n');

    return `🔍 <b>ITEM HISAB REPORT: "${displayKeyword.toUpperCase()}"</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Viewer:</b> <b>${senderDisplayName}</b> <i>(Family Privacy Mode)</i>
🔴 <b>Aapka Is Item Par Kharcha:</b> <b>₹${memberTotalSpent.toLocaleString('en-IN')}</b>
🔢 <b>Kitni Baar Liya:</b> <b>${matchingExpenses.length} baar</b>
━━━━━━━━━━━━━━━━━━━━
📋 <b>AAPKE TRANSACTIONS:</b>

${purchasesList}

━━━━━━━━━━━━━━━━━━━━
🔒 <i>(Family Privacy: Sirf aapke records calculate hue hain)</i>`;
  }

  const totalSpent = matchingExpenses.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const totalPurchases = matchingExpenses.length;
  const avgPerPurchase = totalPurchases > 0 ? Math.round(totalSpent / totalPurchases) : 0;
  const highestSinglePurchase = matchingExpenses.length > 0 ? Math.max(...matchingExpenses.map(t => Number(t.amount) || 0)) : 0;

  // Recent 5-6 purchases list
  const recentPurchases = matchingExpenses.slice(0, 6);
  const purchasesList = recentPurchases.map((t, idx) => {
    const pm = t.paymentMethod ? `[${t.paymentMethod}]` : '[UPI/Cash]';
    const timeStr = t.time ? ` (${t.time})` : '';
    const emoji = getCategoryEmoji(t.category);
    const byTag = t.telegramUser ? ` <i>(by ${t.telegramUser})</i>` : '';
    return `<b>[#${idx + 1}]</b> 🔴 <b>₹${Number(t.amount).toLocaleString('en-IN')}</b> • <b>${t.description}</b> (${emoji} ${t.category}) ${pm}${byTag}\n   📅 <i>${t.date}${timeStr}</i>`;
  }).join('\n\n');

  // Income summary if any (e.g. refund / cashback / income from same keyword)
  let incomeNote = '';
  if (matchingIncomes.length > 0) {
    const totalInc = matchingIncomes.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    incomeNote = `\n🟢 <b>Income / Cashback Received:</b> ₹${totalInc.toLocaleString('en-IN')} (${matchingIncomes.length} baar)\n`;
  }

  return `🔍 <b>ITEM HISAB REPORT: "${displayKeyword.toUpperCase()}"</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khata:</b> ${userName}
🔴 <b>Kul Kharcha (Total Spent):</b> <b>₹${totalSpent.toLocaleString('en-IN')}</b>
🔢 <b>Kitni Baar Liya (Total Purchases):</b> <b>${totalPurchases} baar</b>
📊 <b>Average Per Purchase:</b> <b>₹${avgPerPurchase.toLocaleString('en-IN')}</b>
${highestSinglePurchase > 0 ? `🔝 <b>Sabse Bada Single Kharcha:</b> ₹${highestSinglePurchase.toLocaleString('en-IN')}\n` : ''}${incomeNote}
━━━━━━━━━━━━━━━━━━━━
📋 <b>RECENT PURCHASES LIST:</b>

${purchasesList}

━━━━━━━━━━━━━━━━━━━━
💡 <i>Tip: Naya kharcha log karne ke liye likhein (jaise: <code>300 ${itemQuery} cash</code>)</i>`;
}

// ---------------- Month-on-Month (MoM) Comparison Generator ----------------

export function buildMonthComparisonReportTelegramMessage(
  userId: string, 
  userName: string,
  senderContext?: SenderTelegramContext
): { text: string; replyMarkup?: any } {
  const store = getUserData(userId);
  const isOwner = senderContext ? senderContext.isSenderOwner : true;
  const senderDisplayName = senderContext?.senderDisplayName || '';
  const chatId = senderContext?.chatId || '';
  const fromId = senderContext?.fromId || '';

  let txs = store.transactions || [];

  if (!isOwner) {
    // Filter to member's transactions
    txs = txs.filter(t => 
      (t.telegramChatId && (t.telegramChatId === chatId || (fromId && t.telegramChatId === fromId))) ||
      (t.telegramUser && senderDisplayName && (
        t.telegramUser.toLowerCase() === senderDisplayName.toLowerCase() ||
        t.telegramUser.toLowerCase().includes(senderDisplayName.toLowerCase()) ||
        senderDisplayName.toLowerCase().includes(t.telegramUser.toLowerCase())
      ))
    );
  }

  const nowInfo = getAppDateTime();
  const [currYStr, currMStr, currDStr] = nowInfo.date.split('-');
  const currYear = parseInt(currYStr, 10);
  const currMonth = parseInt(currMStr, 10);
  const currDay = parseInt(currDStr, 10);

  const currMonthKey = `${currYear}-${String(currMonth).padStart(2, '0')}`;

  let prevYear = currYear;
  let prevMonth = currMonth - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear = currYear - 1;
  }
  const prevMonthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const currMonthName = monthNames[currMonth - 1];
  const prevMonthName = monthNames[prevMonth - 1];

  const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
  const daysInCurrMonth = new Date(currYear, currMonth, 0).getDate();

  const prevCutoffDay = Math.min(currDay, daysInPrevMonth);
  const prevCutoffDate = `${prevMonthKey}-${String(prevCutoffDay).padStart(2, '0')}`;
  const currCutoffDate = nowInfo.date;

  // Current Month MTD (Day 1 to Today)
  const currMtdTxs = txs.filter(t => t.date.startsWith(currMonthKey) && t.date <= currCutoffDate);
  const currMtdExpenses = currMtdTxs.filter(t => t.type === 'expense');
  const currMtdIncomes = currMtdTxs.filter(t => t.type === 'income');
  const currMtdSpent = currMtdExpenses.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const currMtdIncome = currMtdIncomes.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // Previous Month MTD (Day 1 to Same Day)
  const prevMtdTxs = txs.filter(t => t.date.startsWith(prevMonthKey) && t.date <= prevCutoffDate);
  const prevMtdExpenses = prevMtdTxs.filter(t => t.type === 'expense');
  const prevMtdIncomes = prevMtdTxs.filter(t => t.type === 'income');
  const prevMtdSpent = prevMtdExpenses.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const prevMtdIncome = prevMtdIncomes.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // Previous Month Full Month Total
  const prevFullTxs = txs.filter(t => t.date.startsWith(prevMonthKey));
  const prevFullSpent = prevFullTxs.filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // Spend Difference MTD
  const spentDiff = currMtdSpent - prevMtdSpent;
  const absDiff = Math.abs(spentDiff);
  const pctChange = prevMtdSpent > 0 ? Math.round((absDiff / prevMtdSpent) * 100) : 0;

  // Category level breakdown MTD comparison
  const catSpentMap: Record<string, { curr: number; prev: number }> = {};
  for (const t of currMtdExpenses) {
    const c = t.category || 'Other';
    if (!catSpentMap[c]) catSpentMap[c] = { curr: 0, prev: 0 };
    catSpentMap[c].curr += Number(t.amount) || 0;
  }
  for (const t of prevMtdExpenses) {
    const c = t.category || 'Other';
    if (!catSpentMap[c]) catSpentMap[c] = { curr: 0, prev: 0 };
    catSpentMap[c].prev += Number(t.amount) || 0;
  }

  const catChanges = Object.entries(catSpentMap).map(([category, vals]) => {
    return {
      category,
      curr: vals.curr,
      prev: vals.prev,
      diff: vals.curr - vals.prev,
    };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const dailyAvg = currDay > 0 ? Math.round(currMtdSpent / currDay) : 0;
  const projectedEnd = dailyAvg * daysInCurrMonth;

  let headerStatus = '';
  if (spentDiff < 0) {
    headerStatus = `🟢 <b>GREAT SAVINGS!</b>\nPichle mahine <b>${currDay} tarikh</b> ke mukable aapne <b>₹${absDiff.toLocaleString('en-IN')} (${pctChange}%) KAM kharch</b> kiya hai! 👏🎉`;
  } else if (spentDiff > 0) {
    headerStatus = `🔴 <b>SPENDING WARNING!</b>\nPichle mahine <b>${currDay} tarikh</b> ke mukable aapne <b>₹${absDiff.toLocaleString('en-IN')} (${pctChange}%) JYADA kharch</b> kiya hai! ⚠️`;
  } else {
    headerStatus = `⚪ <b>BALANCED SPENDING:</b>\nAapka kharcha pichle mahine ke barabar (₹${currMtdSpent.toLocaleString('en-IN')}) chal raha hai.`;
  }

  let text = `📈 <b>MONTH-ON-MONTH COMPARISON (MoM)</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khata:</b> ${userName}
📅 <b>Status:</b> 1 se ${currDay} tarikh tak

${headerStatus}

📊 <b>KHARCHA TULNA (Day 1 - ${currDay}):</b>
• <b>Is Mahine (${currMonthName}):</b> <b>₹${currMtdSpent.toLocaleString('en-IN')}</b> (${currMtdExpenses.length} tx)
• <b>Pichle Mahine (${prevMonthName}):</b> <b>₹${prevMtdSpent.toLocaleString('en-IN')}</b> (${prevMtdExpenses.length} tx)
• <b>Fark (Difference):</b> ${spentDiff > 0 ? '🔺 +₹' : '🔻 -₹'}${absDiff.toLocaleString('en-IN')}

💵 <b>INCOME COMPARISON:</b>
• <b>${currMonthName}:</b> ₹${currMtdIncome.toLocaleString('en-IN')}
• <b>${prevMonthName} (MTD):</b> ₹${prevMtdIncome.toLocaleString('en-IN')}

━━━━━━━━━━━━━━━━━━━━
🔮 <b>PROJECTION & PACING:</b>
• <b>Daily Average Spend:</b> ₹${dailyAvg.toLocaleString('en-IN')} / din
• <b>Projected End (${currMonthName}):</b> ₹${projectedEnd.toLocaleString('en-IN')}
• <b>Pichla Mahina Full Total:</b> ₹${prevFullSpent.toLocaleString('en-IN')}
`;

  if (catChanges.length > 0) {
    text += `\n🏷️ <b>TOP CATEGORY MOVERS:</b>\n`;
    for (const c of catChanges.slice(0, 4)) {
      const emoji = getCategoryEmoji(c.category);
      if (c.diff > 0) {
        text += `• ${emoji} <b>${c.category}:</b> ₹${c.curr.toLocaleString('en-IN')} (🔺 +₹${c.diff.toLocaleString('en-IN')} badha)\n`;
      } else if (c.diff < 0) {
        text += `• ${emoji} <b>${c.category}:</b> ₹${c.curr.toLocaleString('en-IN')} (🟢 -₹${Math.abs(c.diff).toLocaleString('en-IN')} bachat)\n`;
      } else {
        text += `• ${emoji} <b>${c.category}:</b> ₹${c.curr.toLocaleString('en-IN')} (Same)\n`;
      }
    }
  }

  text += `\n━━━━━━━━━━━━━━━━━━━━\n💡 <i>Har roz kharcha track karein taaki budget control me rahe!</i>`;

  return {
    text,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '📊 Mahine Ki Summary', callback_data: 'cmd_summary' },
          { text: '🎯 Category Budget', callback_data: 'cmd_budget' },
        ],
        [
          { text: '🤖 AI Bachat Tips', callback_data: 'cmd_tips' },
          { text: '💰 Balance Check', callback_data: 'cmd_balance' },
        ],
      ],
    },
  };
}

// ---------------- Smart Natural Search Generator ----------------

export function isTransactionSearchMatch(t: Transaction, cleanQ: string): boolean {
  if (!t || !cleanQ) return false;
  const desc = (t.description || '').toLowerCase();
  const cat = (t.category || '').toLowerCase();
  const pm = (t.paymentMethod || '').toLowerCase();
  const user = (t.telegramUser || '').toLowerCase();
  const raw = (t.rawMessage || '').toLowerCase();
  const date = (t.date || '').toLowerCase();
  const tags = (t.tags || []).map(tg => tg.toLowerCase());

  if (desc.includes(cleanQ) || cat.includes(cleanQ) || pm.includes(cleanQ) || user.includes(cleanQ) || raw.includes(cleanQ) || date.includes(cleanQ)) {
    return true;
  }
  if (tags.some(tg => tg.includes(cleanQ))) return true;

  const words = cleanQ.split(/\s+/).filter(w => w.length >= 2);
  if (words.length > 1) {
    const allMatch = words.every(w =>
      desc.includes(w) || cat.includes(w) || pm.includes(w) || user.includes(w) || tags.some(tg => tg.includes(w))
    );
    if (allMatch) return true;
  }

  return false;
}

export function buildSearchReportTelegramMessage(
  userId: string, 
  rawQuery: string, 
  userName: string,
  senderContext?: SenderTelegramContext
): { text: string; replyMarkup?: any } {
  const store = getUserData(userId);
  const txs = store.transactions || [];
  const q = rawQuery.trim();
  const lowerQ = q.toLowerCase();
  const isOwner = senderContext ? senderContext.isSenderOwner : true;
  const senderDisplayName = senderContext?.senderDisplayName || '';
  const chatId = senderContext?.chatId || '';
  const fromId = senderContext?.fromId || '';

  const compMatch = lowerQ.match(/^([><]=?)\s*(\d+(?:\.\d+)?)$/);
  const isPureNumber = /^\d+(?:\.\d+)?$/.test(lowerQ);

  let filtered = txs;
  let searchTitle = q;

  if (compMatch) {
    const op = compMatch[1];
    const val = parseFloat(compMatch[2]);
    searchTitle = `Amount ${op} ₹${val.toLocaleString('en-IN')}`;
    filtered = txs.filter(t => {
      const amt = Number(t.amount) || 0;
      if (op === '>') return amt > val;
      if (op === '>=') return amt >= val;
      if (op === '<') return amt < val;
      if (op === '<=') return amt <= val;
      return false;
    });
  } else if (isPureNumber) {
    const val = parseFloat(lowerQ);
    searchTitle = `Amount = ₹${val.toLocaleString('en-IN')}`;
    filtered = txs.filter(t => Math.abs((Number(t.amount) || 0) - val) < 0.01);
  } else {
    if (lowerQ.includes('last month') || lowerQ.includes('pichla mahina') || lowerQ.includes('pichle mahine')) {
      const nowInfo = getAppDateTime();
      const [y, m] = nowInfo.date.split('-').map(Number);
      let py = y;
      let pm = m - 1;
      if (pm < 1) { pm = 12; py = y - 1; }
      const prevKey = `${py}-${String(pm).padStart(2, '0')}`;
      const rest = lowerQ.replace(/last month|pichla mahina|pichle mahine/gi, '').trim();
      if (rest) {
        searchTitle = `"${rest}" in Last Month (${prevKey})`;
        filtered = txs.filter(t => t.date.startsWith(prevKey) && isTransactionSearchMatch(t, rest));
      } else {
        searchTitle = `Last Month (${prevKey})`;
        filtered = txs.filter(t => t.date.startsWith(prevKey));
      }
    } else {
      filtered = txs.filter(t => isTransactionSearchMatch(t, lowerQ));
    }
  }

  if (filtered.length === 0) {
    return {
      text: `🔍 <b>SEARCH RESULTS: "${searchTitle}"</b>\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>Khata:</b> ${userName}${!isOwner ? ` (👤 <b>${senderDisplayName}</b>)` : ''}\n\nℹ️ <b>Koi matching transaction nahi mila.</b>\n\n💡 <b>Suggestions:</b>\n• Keyword search: <code>/find medicine</code>, <code>/find petrol</code>, <code>/find swiggy</code>\n• Amount comparison: <code>/find > 2000</code>, <code>/find < 500</code>\n• Payment method: <code>/find upi</code>, <code>/find cash</code>\n• Timing: <code>/find last month</code>`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' }, { text: '💰 Balance', callback_data: 'cmd_balance' }],
          [{ text: '📊 Summary', callback_data: 'cmd_summary' }, { text: '📈 MoM Compare', callback_data: 'cmd_compare' }],
        ],
      },
    };
  }

  const expenses = filtered.filter(t => t.type === 'expense');
  const incomes = filtered.filter(t => t.type === 'income');
  const totalExpense = expenses.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalIncome = incomes.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const displayList = filtered.slice(0, 8);
  const itemsText = displayList.map((t, idx) => {
    const isOwnTx = isOwner || 
      (t.telegramChatId && (t.telegramChatId === chatId || (fromId && t.telegramChatId === fromId))) ||
      (t.telegramUser && senderDisplayName && (
        t.telegramUser.toLowerCase() === senderDisplayName.toLowerCase() ||
        t.telegramUser.toLowerCase().includes(senderDisplayName.toLowerCase()) ||
        senderDisplayName.toLowerCase().includes(t.telegramUser.toLowerCase())
      ));

    const isInc = t.type === 'income';
    const sign = isInc ? '🟢 +' : '🔴 -';
    const amtStr = isOwnTx ? `₹${Number(t.amount).toLocaleString('en-IN')}` : `🔒 Masked`;
    const pm = t.paymentMethod ? `[${t.paymentMethod}]` : '';
    const emoji = getCategoryEmoji(t.category);
    const timeStr = t.time ? ` • ${t.time}` : '';
    const byTag = t.telegramUser ? ` <i>(by ${t.telegramUser})</i>` : '';
    return `<b>[#${idx + 1}]</b> ${sign}<b>${amtStr}</b> • <b>${t.description}</b>\n   ${emoji} ${t.category} ${pm}${byTag} <i>(📅 ${t.date}${timeStr})</i>`;
  }).join('\n\n');

  if (!isOwner) {
    const memberFiltered = filtered.filter(t => 
      (t.telegramChatId && (t.telegramChatId === chatId || (fromId && t.telegramChatId === fromId))) ||
      (t.telegramUser && senderDisplayName && (
        t.telegramUser.toLowerCase() === senderDisplayName.toLowerCase() ||
        t.telegramUser.toLowerCase().includes(senderDisplayName.toLowerCase()) ||
        senderDisplayName.toLowerCase().includes(t.telegramUser.toLowerCase())
      ))
    );
    const memberExpenses = memberFiltered.filter(t => t.type === 'expense');
    const memberSpent = memberExpenses.reduce((s, t) => s + (Number(t.amount) || 0), 0);

    let text = `🔍 <b>SEARCH RESULTS: "${searchTitle}"</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Viewer:</b> <b>${senderDisplayName}</b> <i>(Family Privacy Mode)</i>
📌 <b>Total Matched:</b> <b>${filtered.length} transactions</b>
👤 <b>Aapka Matching Kharcha:</b> <b>₹${memberSpent.toLocaleString('en-IN')}</b> (${memberExpenses.length} tx)
━━━━━━━━━━━━━━━━━━━━
📋 <b>MATCHING TRANSACTIONS:</b>

${itemsText}
`;

    if (filtered.length > 8) {
      text += `\n<i>...aur ${filtered.length - 8} transactions hain</i>\n`;
    }

    text += `\n━━━━━━━━━━━━━━━━━━━━\n🔒 <i>(Owner Privacy: Aapko sirf aapke transactions ka amount dikhta hai)</i>`;

    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '💰 Balance', callback_data: 'cmd_balance' }, { text: '📊 Summary', callback_data: 'cmd_summary' }],
          [{ text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' }, { text: '↩️ Undo Last', callback_data: 'cmd_undo' }],
        ],
      },
    };
  }

  let text = `🔍 <b>SEARCH RESULTS: "${searchTitle}"</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khata:</b> ${userName}
📌 <b>Total Matched:</b> <b>${filtered.length} transactions</b>
${totalExpense > 0 ? `🔴 <b>Total Kharcha:</b> ₹${totalExpense.toLocaleString('en-IN')} (${expenses.length} tx)\n` : ''}${totalIncome > 0 ? `🟢 <b>Total Income:</b> ₹${totalIncome.toLocaleString('en-IN')} (${incomes.length} tx)\n` : ''}
━━━━━━━━━━━━━━━━━━━━
📋 <b>MATCHING TRANSACTIONS:</b>

${itemsText}
`;

  if (filtered.length > 8) {
    text += `\n<i>...aur ${filtered.length - 8} transactions hain (Web Dashboard par pura filter dekhein)</i>\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━\n💡 <i>Delete karne ke liye: <code>delete ${filtered[0]?.description || 'item'}</code></i>`;

  return {
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: '💰 Balance', callback_data: 'cmd_balance' }, { text: '📊 Summary', callback_data: 'cmd_summary' }],
        [{ text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' }, { text: '↩️ Undo Last', callback_data: 'cmd_undo' }],
      ],
    },
  };
}

// ---------------- Duplicate / Double Charge Audit Generator ----------------

export function buildDuplicatesReportTelegramMessage(
  userId: string, 
  userName: string,
  senderContext?: SenderTelegramContext
): { text: string; replyMarkup?: any } {
  const store = getUserData(userId);
  const isOwner = senderContext ? senderContext.isSenderOwner : true;
  const senderDisplayName = senderContext?.senderDisplayName || '';
  const chatId = senderContext?.chatId || '';
  const fromId = senderContext?.fromId || '';

  let txs = store.transactions || [];

  if (!isOwner) {
    txs = txs.filter(t => 
      (t.telegramChatId && (t.telegramChatId === chatId || (fromId && t.telegramChatId === fromId))) ||
      (t.telegramUser && senderDisplayName && (
        t.telegramUser.toLowerCase() === senderDisplayName.toLowerCase() ||
        t.telegramUser.toLowerCase().includes(senderDisplayName.toLowerCase()) ||
        senderDisplayName.toLowerCase().includes(t.telegramUser.toLowerCase())
      ))
    );
  }

  const duplicatePairs: { original: Transaction; duplicate: Transaction; minutesApart: number }[] = [];

  for (let i = 0; i < Math.min(txs.length, 100); i++) {
    const t1 = txs[i];
    for (let j = i + 1; j < Math.min(txs.length, 100); j++) {
      const t2 = txs[j];
      if (t1.type === t2.type && Math.abs(t1.amount - t2.amount) < 0.01 && t1.date === t2.date) {
        const d1 = (t1.description || '').toLowerCase().trim();
        const d2 = (t2.description || '').toLowerCase().trim();
        const c1 = (t1.category || '').toLowerCase().trim();
        const c2 = (t2.category || '').toLowerCase().trim();

        if (d1 === d2 || (d1.length >= 3 && d2.length >= 3 && (d1.includes(d2) || d2.includes(d1))) || (c1 === c2 && c1 !== 'uncategorized')) {
          let mins = 0;
          if (t1.createdAt && t2.createdAt) {
            mins = Math.abs(Math.round((new Date(t1.createdAt).getTime() - new Date(t2.createdAt).getTime()) / (60 * 1000)));
          }
          duplicatePairs.push({ original: t2, duplicate: t1, minutesApart: mins });
          break;
        }
      }
    }
    if (duplicatePairs.length >= 5) break;
  }

  if (duplicatePairs.length === 0) {
    return {
      text: `🛡️ <b>DUPLICATE AUDIT REPORT:</b>\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>Khata:</b> ${userName}\n\n✅ <b>Super! Koi bhi suspicious duplicate ya double-charge transaction nahi mila!</b>\n\nAapke saare transactions bilkul unique aur safe hain.`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '💰 Balance', callback_data: 'cmd_balance' }, { text: '📊 Summary', callback_data: 'cmd_summary' }],
          [{ text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' }, { text: '🎯 Category Budget', callback_data: 'cmd_budget' }],
        ],
      },
    };
  }

  const list = duplicatePairs.map((p, idx) => {
    const emoji = getCategoryEmoji(p.duplicate.category);
    return `⚠️ <b>[#${idx + 1}] Duplicate Pair:</b>\n• ₹${p.duplicate.amount.toLocaleString('en-IN')} - <b>${p.duplicate.description}</b> (${emoji} ${p.duplicate.category})\n  📅 <i>${p.duplicate.date} (${p.minutesApart > 0 ? `${p.minutesApart} min gap` : 'Same day'})</i>`;
  }).join('\n\n');

  return {
    text: `🛡️ <b>POTENTIAL DUPLICATES DETECTED!</b>\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>Khata:</b> ${userName}\n⚠️ <b>${duplicatePairs.length} possible duplicate entries mili hain:</b>\n\n${list}\n\n━━━━━━━━━━━━━━━━━━━━\n💡 <b>Hataane ke liye:</b>\n• <code>/undo</code> - Aakhri transaction delete karein\n• <code>delete ${duplicatePairs[0]?.duplicate?.description}</code> - Name se delete karein`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: '🗑️ Undo Aakhri Tx', callback_data: 'cmd_undo' }, { text: '💰 Balance', callback_data: 'cmd_balance' }],
        [{ text: '📊 Summary', callback_data: 'cmd_summary' }, { text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' }],
      ],
    },
  };
}

// ---------------- Helper to send Telegram message & Handy Buttons ----------------

export const TELEGRAM_BOT_COMMANDS = [
  { command: 'ask', description: '🤖 Gemini AI Financial Advisor (Chat / Plan / Strategy)' },
  { command: 'done', description: '✅ AI Advisor mode exit karein & normal mode me aayein' },
  { command: 'balance', description: '💰 Net balance aur kul bachat dekhein' },
  { command: 'summary', description: '📊 Mahine ki income, kharcha & bachat report' },
  { command: 'compare', description: '📈 Is mahine vs Pichla mahina spending comparison' },
  { command: 'find', description: '🔍 Search transactions (e.g. /find medicine ya /find > 2000)' },
  { command: 'duplicates', description: '🛡️ Double-entry & duplicate check' },
  { command: 'udhaar', description: '🤝 Udhaar Khata (Lena / Dena Hisab)' },
  { command: 'fuel', description: '⛽ Vehicle Mileage & Fuel Log Tracker' },
  { command: 'spent', description: '🔍 Kisi item/merchant ka kharcha (e.g. /spent petrol)' },
  { command: 'gullak', description: '🐷 Monthly budget se bachi hui Gullak bachat' },
  { command: 'accounts', description: '👥 Linked accounts dekhein & unlink buttons' },
  { command: 'budget', description: '🎯 Category-wise kharcha aur bacha budget' },
  { command: 'date', description: '📅 Kisi bhi tareeq ka kharcha & income dekhein' },
  { command: 'recent', description: '🕒 Haal hi ke aakhri 5 transactions' },
  { command: 'buttons', description: '📱 Handy Quick Action Buttons on screen' },
  { command: 'categories', description: '🏷️ Active categories aur keywords dekhein' },
  { command: 'undo', description: '↩️ Aakhri transaction undo / delete karein' },
  { command: 'unlink', description: '❌ Account se Telegram unlink karein' },
  { command: 'clearall', description: '🗑️ Saare transactions clear karein' },
  { command: 'link', description: '🔗 Web account se Telegram link karein' },
  { command: 'help', description: '❓ Kaise use karein & full command list' },
];

export const TELEGRAM_HANDY_KEYBOARD = {
  keyboard: [
    [{ text: '💰 Balance' }, { text: '📊 Summary' }],
    [{ text: '📈 MoM Compare' }, { text: '🔍 Search' }],
    [{ text: '🤝 Udhaar Khata' }, { text: '⛽ Fuel Tracker' }],
    [{ text: '🐷 Gullak' }, { text: '🎯 Category Budget' }],
    [{ text: '👥 My Accounts' }, { text: '📅 Aaj Ka Hisab' }],
    [{ text: '🤖 Ask AI Advisor (/ask)' }, { text: '🕒 Recent 5 Tx' }],
    [{ text: '↩️ Undo Last' }, { text: '❓ Help & Guide' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

export const TELEGRAM_AI_ADVISOR_KEYBOARD = {
  keyboard: [
    [{ text: '✅ Exit AI Mode (/done)' }, { text: '💰 Balance' }],
    [{ text: '📊 Summary' }, { text: '🎯 Category Budget' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

export const INLINE_KB_MAIN_COMMANDS = {
  inline_keyboard: [
    [
      { text: '💰 Balance', callback_data: 'cmd_balance' },
      { text: '📊 Summary', callback_data: 'cmd_summary' },
    ],
    [
      { text: '📈 MoM Compare', callback_data: 'cmd_compare' },
      { text: '🔍 Search', callback_data: 'cmd_search' },
    ],
    [
      { text: '🤝 Udhaar Khata', callback_data: 'cmd_udhaar' },
      { text: '⛽ Fuel Tracker', callback_data: 'cmd_fuel' },
    ],
    [
      { text: '🐷 Gullak', callback_data: 'cmd_gullak' },
      { text: '🎯 Category Budget', callback_data: 'cmd_budget' },
    ],
    [
      { text: '👥 My Accounts', callback_data: 'cmd_accounts' },
      { text: '📅 Aaj Ka Hisab', callback_data: 'cmd_date_today' },
    ],
    [
      { text: '🤖 Ask AI Advisor', callback_data: 'cmd_ask' },
      { text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' },
    ],
  ],
};

export function buildUdhaarReportTelegramMessage(userId: string): { text: string; replyMarkup: any } {
  const store = getUserData(userId);
  const udhaars = store.udhaars || [];
  const pending = udhaars.filter(u => u.status === 'pending');
  const lent = pending.filter(u => u.type === 'lent');
  const borrowed = pending.filter(u => u.type === 'borrowed');

  const totalLent = lent.reduce((sum, u) => sum + (Number(u.amount) || 0), 0);
  const totalBorrowed = borrowed.reduce((sum, u) => sum + (Number(u.amount) || 0), 0);
  const netDue = totalLent - totalBorrowed;

  // Group pending entries by normalized person name
  const personMap: Record<string, {
    displayName: string;
    totalLent: number;
    totalBorrowed: number;
    netDue: number;
    entries: UdhaarRecord[];
  }> = {};

  for (const u of pending) {
    const key = (u.personName || 'Unknown').trim().toLowerCase();
    if (!personMap[key]) {
      personMap[key] = {
        displayName: u.personName.trim(),
        totalLent: 0,
        totalBorrowed: 0,
        netDue: 0,
        entries: [],
      };
    }
    const amt = Number(u.amount) || 0;
    if (u.type === 'lent') {
      personMap[key].totalLent += amt;
    } else {
      personMap[key].totalBorrowed += amt;
    }
    personMap[key].netDue = personMap[key].totalLent - personMap[key].totalBorrowed;
    personMap[key].entries.push(u);
  }

  const people = Object.values(personMap);
  // Sort by highest pending net due
  people.sort((a, b) => Math.abs(b.netDue) - Math.abs(a.netDue));

  let text = `🤝 <b>UDHAAR & KHATA (COMBINED HISAB)</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💸 <b>Maine Diya (Lena Hai):</b> <b>₹${totalLent.toLocaleString('en-IN')}</b>\n`;
  text += `📥 <b>Maine Liya (Dena Hai):</b> <b>₹${totalBorrowed.toLocaleString('en-IN')}</b>\n`;
  text += `📊 <b>Net Udhaar Balance:</b> <b>${netDue >= 0 ? `🟢 +₹${netDue.toLocaleString('en-IN')} (Lena Hai)` : `🔴 -₹${Math.abs(netDue).toLocaleString('en-IN')} (Dena Hai)`}</b>\n`;
  text += `👥 <b>Active Khate:</b> ${people.length} log (${pending.length} total entries)\n\n`;

  if (people.length === 0) {
    text += `✨ <i>Saara hisab barabar hai! Koi pending udhaar nahi hai.</i>\n\n`;
  } else {
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📋 <b>VYAKTI-ANUSAR COMBINED BREAKDOWN:</b>\n\n`;

    for (const p of people) {
      const isLena = p.netDue > 0;
      const isDena = p.netDue < 0;
      const statusIcon = isLena ? '🟢' : isDena ? '🔴' : '⚪';
      const statusText = isLena 
        ? `<b>₹${p.netDue.toLocaleString('en-IN')} LENA HAI</b>` 
        : isDena 
        ? `<b>₹${Math.abs(p.netDue).toLocaleString('en-IN')} DENA HAI</b>` 
        : `<b>Hisab Barabar (₹0)</b>`;

      text += `${statusIcon} <b>${p.displayName}:</b> ${statusText} <i>(${p.entries.length} ${p.entries.length === 1 ? 'entry' : 'entries'})</i>\n`;

      // Sort entries by date descending
      const sortedEntries = [...p.entries].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      for (const e of sortedEntries) {
        const typeLabel = e.type === 'lent' ? 'diya' : 'liya';
        text += `   • 📅 <b>${e.date || 'N/A'}:</b> ₹${Number(e.amount).toLocaleString('en-IN')} ${typeLabel} <i>[ID: <code>${e.id.slice(-6)}</code>]</i>\n`;
      }
      text += `\n`;
    }
  }

  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💡 <b>Kaam ki Commands:</b>\n`;
  text += `• Naya likhein: <code>2000 diya Jiju ko 14th Sep</code>\n`;
  text += `• Date badlein: <code>date change Jiju 14 Sep</code> ya <code>/udhardate</code>\n`;
  text += `• WhatsApp Remind: <code>remind Jiju</code> ya <code>/remind Jiju</code>\n`;
  text += `• Settle karein: <code>Jiju settle</code>`;

  const inlineKeyboard: any[][] = [];
  if (pending.length > 0) {
    inlineKeyboard.push([
      { text: '📅 Date Badlein', callback_data: 'udh_menu_date' },
      { text: '📲 WhatsApp Remind', callback_data: 'udh_menu_remind' },
    ]);
    inlineKeyboard.push([
      { text: '✅ Settle Khata', callback_data: 'udh_menu_settle' },
    ]);
  }
  inlineKeyboard.push([
    { text: '💰 Balance', callback_data: 'cmd_balance' },
    { text: '📊 Summary', callback_data: 'cmd_summary' },
  ]);

  return {
    text,
    replyMarkup: {
      inline_keyboard: inlineKeyboard,
    },
  };
}

export function buildWhatsAppReminderText(personName: string, entries: UdhaarRecord[]): { messageText: string; url: string; totalDue: number } {
  const pendingEntries = entries.filter(e => e.status === 'pending');
  // Sort by date ascending
  const sorted = [...pendingEntries].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  let totalDue = 0;
  const detailsLines = sorted.map(e => {
    const amt = Number(e.amount) || 0;
    if (e.type === 'lent') {
      totalDue += amt;
    } else {
      totalDue -= amt;
    }
    const desc = e.description ? ` (${e.description})` : '';
    const typeNote = e.type === 'borrowed' ? ' [Liya/Adjust]' : '';
    return `• ${e.date || 'N/A'}: ₹${amt.toLocaleString('en-IN')}${desc}${typeNote}`;
  });

  const absTotal = Math.abs(totalDue).toLocaleString('en-IN');
  const detailsText = detailsLines.length > 0 ? detailsLines.join('\n') : `• Kul Bakaya: ₹${absTotal}`;

  const messageText = `Hi ${personName}, Namaskar -\n\nMere TeleExpense AI ledger me aapko diya gaya udhar bakaya hai jiski details:\n\n📅 Date-wise Details:\n${detailsText}\n\n💰 Kul Bakaya Raqam (Total Due): ₹${absTotal}\n\nPlease check kare or apna udhar amount settle kare. 🙏`;

  const url = `https://wa.me/?text=${encodeURIComponent(messageText)}`;
  return { messageText, url, totalDue };
}

export function buildFuelReportTelegramMessage(userId: string): { text: string; replyMarkup: any } {
  const store = getUserData(userId);
  const logs = store.fuelLogs || [];

  if (logs.length === 0) {
    return {
      text: `⛽ <b>VEHICLE MILEAGE & FUEL TRACKER</b>\n━━━━━━━━━━━━━━━━━━━━\nℹ️ Abhi tak koi fuel entry record nahi hui hai.\n\n💡 <b>Fuel & Mileage add karne ka format:</b>\n• <code>2000 petrol odo 45200</code>\n• <code>500 petrol odo 12340 bike</code>\n\nBot odometer se pichhle fuel up ka distance, mileage (km/l) aur per-km cost auto calculate karega!`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '💰 Balance', callback_data: 'cmd_balance' }, { text: '📊 Summary', callback_data: 'cmd_summary' }],
        ],
      },
    };
  }

  const latest = logs[0];
  const totalFuelSpent = logs.reduce((sum, l) => sum + l.fuelAmount, 0);
  const validMileageLogs = logs.filter(l => l.calculatedMileage && l.calculatedMileage > 0);
  const avgMileage = validMileageLogs.length > 0 
    ? Math.round((validMileageLogs.reduce((sum, l) => sum + (l.calculatedMileage || 0), 0) / validMileageLogs.length) * 10) / 10
    : undefined;

  let text = `⛽ <b>VEHICLE MILEAGE & FUEL TRACKER</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🚗 <b>Vehicle:</b> ${latest.vehicleName || 'Vehicle'}\n`;
  text += `📍 <b>Last Odometer:</b> <b>${latest.odometer.toLocaleString('en-IN')} km</b>\n`;
  text += `💰 <b>Total Fuel Spend:</b> ₹${totalFuelSpent.toLocaleString('en-IN')} (${logs.length} entries)\n`;
  if (avgMileage) {
    text += `⚡ <b>Average Mileage:</b> <b>${avgMileage} km/l</b>\n`;
  }
  if (latest.distanceCovered) {
    text += `📈 <b>Last Trip:</b> ${latest.distanceCovered} km\n`;
    if (latest.calculatedMileage) text += `⚡ <b>Last Mileage:</b> ~${latest.calculatedMileage} km/l\n`;
    if (latest.costPerKm) text += `💸 <b>Running Cost:</b> ₹${latest.costPerKm} / km\n`;
  }
  text += `\n💡 <b>Nayi Fuel Entry Bhejein:</b>\n• <code>2000 petrol odo ${latest.odometer + 300}</code>`;

  return {
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: '💰 Balance', callback_data: 'cmd_balance' }, { text: '📊 Summary', callback_data: 'cmd_summary' }],
        [{ text: '🕒 Recent Tx', callback_data: 'cmd_recent' }, { text: '🤖 AI Tips', callback_data: 'cmd_tips' }],
      ],
    },
  };
}

export function buildAccountsReportTelegramMessage(
  chatId: string | number,
  userName: string,
  fromUserId?: string | number,
  username?: string
): { text: string; replyMarkup: any } {
  users = loadJson<UserProfile[]>(USERS_FILE, users);
  const cId = String(chatId);
  const linkedUsers = getLinkedUsersForChat(cId, fromUserId, username);

  if (linkedUsers.length === 0) {
    const text = `👥 <b>AAPKE LINKED ACCOUNTS</b>
━━━━━━━━━━━━━━━━━━━━
ℹ️ <b>Aapka Telegram account abhi kisi bhi khate se judaa nahi hai.</b>

🔑 <b>Aapka Telegram Chat ID:</b> <code>${cId}</code>

💡 <b>Khata connect kaise karein:</b>
1. TeleExpense Web Dashboard par login karein
2. Apna 6-digit Link Code dekhein (jaise: <code>838107</code>)
3. Yahan command bhejein:
<code>/link &lt;CODE&gt;</code>

<i>Udaharan:</i> <code>/link 838107</code>`;

    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '❓ Help & Guide', callback_data: 'cmd_help' },
            { text: '📱 Handy Buttons', callback_data: 'cmd_buttons' },
          ],
        ],
      },
    };
  }

  const activeUser = getActiveAccountForChat(cId, linkedUsers, fromUserId);
  let text = `👥 <b>AAPKE LINKED ACCOUNTS</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Telegram User:</b> ${userName} (ID: <code>${cId}</code>)
📊 <b>Kul Jude Hue Accounts:</b> <b>${linkedUsers.length}</b>

Aap neeche diye gaye accounts me added hain:

`;

  const inlineKeyboard: Array<Array<{ text: string; callback_data: string }>> = [];

  linkedUsers.forEach((u, idx) => {
    const isActive = activeUser?.id === u.id;
    const member = u.linkedMembers?.find(m => String(m.telegramChatId) === cId);
    let roleLabel = 'Member';
    if (member?.role === 'owner' || String(u.telegramChatId) === cId) {
      roleLabel = '👑 Owner (Khata Malik)';
    } else if (member?.role) {
      roleLabel = `👤 ${member.role}`;
    }

    const summary = calculateUserSummary(u.id);

    text += `<b>[#${idx + 1}] ${u.name}</b> ${isActive ? '🟢 <b>(ACTIVE DEFAULT)</b>' : '⚪'}\n`;
    text += `• 📧 <b>Email:</b> <code>${u.email}</code>\n`;
    text += `• 🏷️ <b>Role:</b> ${roleLabel}\n`;
    text += `• 💰 <b>Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')} (Kharcha: ₹${summary.totalExpense.toLocaleString('en-IN')})\n`;
    text += `• 🔑 <b>Link Code:</b> <code>${u.linkCode}</code>\n`;
    if (isActive) {
      text += `• ⚡ <i>(Abhi naye kharche is account me record honge)</i>\n`;
    }
    text += `\n`;

    const row: Array<{ text: string; callback_data: string }> = [];
    if (linkedUsers.length > 1) {
      if (isActive) {
        row.push({ text: `🟢 Active: ${u.name}`, callback_data: `noop_active_${u.id}` });
      } else {
        row.push({ text: `🔄 Switch to ${u.name}`, callback_data: `switch_${u.id}` });
      }
    }
    // Unlink button for this specific account
    row.push({ text: `❌ Unlink ${u.name}`, callback_data: `unlink_${u.id}` });
    inlineKeyboard.push(row);
  });

  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💡 <b>Kaise manage karein:</b>\n`;
  text += `• Kisi account se hatne ke liye uske saamne <b>❌ Unlink</b> button dabayein\n`;
  if (linkedUsers.length > 1) {
    text += `• Kharcha record karne ka account badalne ke liye <b>🔄 Switch</b> button dabayein\n`;
  }
  text += `• Kisi aur naye account se judne ke liye: <code>/link &lt;CODE&gt;</code>`;

  inlineKeyboard.push([
    { text: '💰 Balance', callback_data: 'cmd_balance' },
    { text: '📊 Summary', callback_data: 'cmd_summary' },
  ]);
  inlineKeyboard.push([
    { text: '🎯 Category Budget', callback_data: 'cmd_budget' },
    { text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' },
  ]);

  return { text, replyMarkup: { inline_keyboard: inlineKeyboard } };
}

async function safeTelegramFetch(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function syncTelegramBotCommandsAndMenu(botToken: string): Promise<boolean> {
  if (!botToken) return false;
  try {
    const cmdRes = await safeTelegramFetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: TELEGRAM_BOT_COMMANDS }),
    });
    if (!cmdRes) return false;
    const cmdData = await cmdRes.json().catch(() => null);

    await safeTelegramFetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: { type: 'commands' },
      }),
    });

    return Boolean(cmdData?.ok);
  } catch {
    return false;
  }
}

async function answerTelegramCallbackQuery(botToken: string, callbackQueryId: string, text?: string) {
  try {
    await safeTelegramFetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || 'Processing...',
        show_alert: false,
      }),
    });
  } catch {}
}

async function sendTelegramReply(
  botToken: string,
  chatId: string | number,
  text: string,
  replyMarkup?: any
): Promise<boolean> {
  if (!botToken || !chatId) return false;
  try {
    const markup = replyMarkup !== undefined ? replyMarkup : TELEGRAM_HANDY_KEYBOARD;
    const payload: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (markup) {
      payload.reply_markup = markup;
    }

    const res = await safeTelegramFetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res || !res.ok) {
      // Retry in plain text without HTML tags in case of unescaped chars or initial fail
      const plainText = text.replace(/<[^>]*>/g, '');
      payload.text = plainText;
      delete payload.parse_mode;
      await safeTelegramFetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    try {
      const logEntry: any = {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toISOString(),
        type: 'outgoing_reply',
        chatId: String(chatId),
        botReply: text,
        status: 'success',
      };
      telegramLogs.unshift(logEntry);
      if (telegramLogs.length > 100) telegramLogs.pop();
      saveJson(LOGS_FILE, telegramLogs);
    } catch {}

    return true;
  } catch {
    return false;
  }
}

async function handleTelegramCallbackQuery(callbackQuery: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN || botConfig.botToken;
  if (!token) return;

  const callbackId = callbackQuery.id;
  const data = (callbackQuery.data || '').trim();
  const chatId = String(callbackQuery.message?.chat?.id || callbackQuery.from?.id || '').trim();
  const fromUser = callbackQuery.from || {};
  const fromId = String(fromUser.id || '').trim();
  const fromUsername = fromUser.username ? String(fromUser.username).replace('@', '').trim() : '';
  const userName = fromUser.first_name || fromUser.username || 'User';

  // 1. Handle Unlink Button Callback
  if (data.startsWith('unlink_')) {
    const targetUserId = data.replace('unlink_', '').trim();
    users = loadJson<UserProfile[]>(USERS_FILE, users);
    const targetUser = users.find(u => u.id === targetUserId);

    if (!targetUser) {
      await answerTelegramCallbackQuery(token, callbackId, 'Account nahi mila ya pehle hi unlink ho gaya.');
      return;
    }

    await answerTelegramCallbackQuery(token, callbackId, `${targetUser.name} unlink ho raha hai...`);

    // Remove this chatId / fromId from targetUser's linkedMembers
    if (targetUser.linkedMembers) {
      targetUser.linkedMembers = targetUser.linkedMembers.filter(
        m => String(m.telegramChatId).trim() !== chatId && String(m.telegramChatId).trim() !== fromId
      );
    }
    if (String(targetUser.telegramChatId).trim() === chatId || String(targetUser.telegramChatId).trim() === fromId) {
      targetUser.telegramChatId = targetUser.linkedMembers?.[0]?.telegramChatId || undefined;
      targetUser.telegramUsername = targetUser.linkedMembers?.[0]?.telegramUsername || undefined;
    }
    saveUsers(users);

    // Update active accounts map if this unlinked account was active
    const remaining = getLinkedUsersForChat(chatId, fromId, fromUsername);
    if (chatActiveAccounts[chatId] === targetUser.id || (fromId && chatActiveAccounts[fromId] === targetUser.id)) {
      if (remaining.length > 0) {
        setActiveAccountForChat(chatId, remaining[0].id);
        if (fromId) setActiveAccountForChat(fromId, remaining[0].id);
      } else {
        delete chatActiveAccounts[chatId];
        if (fromId) delete chatActiveAccounts[fromId];
        saveActiveAccounts(chatActiveAccounts);
      }
    }

    await sendTelegramReply(
      token,
      chatId,
      `✅ <b>Account Safaltapoorvak Unlink Ho Gaya!</b>\n\nAap <b>${targetUser.name}</b> (<code>${targetUser.email}</code>) ke ledger se successfully disconnect ho chuke hain.\n👥 <b>Bache hue accounts:</b> ${remaining.length}`
    );

    const updatedReport = buildAccountsReportTelegramMessage(chatId, userName, fromId, fromUsername);
    await sendTelegramReply(token, chatId, updatedReport.text, updatedReport.replyMarkup);
    return;
  }

  // 2. Handle Switch Account Button Callback
  if (data.startsWith('switch_')) {
    const targetUserId = data.replace('switch_', '').trim();
    users = loadJson<UserProfile[]>(USERS_FILE, users);
    const targetUser = users.find(u => u.id === targetUserId);

    if (targetUser) {
      setActiveAccountForChat(chatId, targetUser.id);
      if (fromId) setActiveAccountForChat(fromId, targetUser.id);
      await answerTelegramCallbackQuery(token, callbackId, `Switched to ${targetUser.name}`);
      await sendTelegramReply(
        token,
        chatId,
        `🔄 <b>Active Default Khata Switch Ho Gaya!</b>\n\nAb aapka active khata <b>${targetUser.name}</b> (<code>${targetUser.email}</code>) set ho gaya hai.\n\nAb jo bhi kharcha ya income aap likhenge (jaise: <code>300 petrol upi</code>), wo <b>${targetUser.name}</b> ke khate me record hoga.`
      );
      const updatedReport = buildAccountsReportTelegramMessage(chatId, userName, fromId, fromUsername);
      await sendTelegramReply(token, chatId, updatedReport.text, updatedReport.replyMarkup);
    } else {
      await answerTelegramCallbackQuery(token, callbackId, 'Account nahi mila.');
    }
    return;
  }

  // 3. Handle No-op on currently active account button
  if (data.startsWith('noop_active_')) {
    await answerTelegramCallbackQuery(token, callbackId, 'Ye khata pehle se hi active default hai!');
    return;
  }

  // 4. Handle Approve Member Link Request Callback
  if (data.startsWith('approve_req_')) {
    const reqId = data.replace('approve_req_', '').trim();
    users = loadJson<UserProfile[]>(USERS_FILE, users);
    let targetUser: UserProfile | undefined;
    let foundReq: any;

    for (const u of users) {
      if (u.pendingRequests) {
        const r = u.pendingRequests.find(req => req.id === reqId);
        if (r) {
          targetUser = u;
          foundReq = r;
          break;
        }
      }
    }

    if (!targetUser || !foundReq) {
      await answerTelegramCallbackQuery(token, callbackId, 'Request nahi mili ya pehle hi process ho chuki hai.');
      return;
    }

    await answerTelegramCallbackQuery(token, callbackId, `Approved: ${foundReq.name}`);

    // Remove from pending
    targetUser.pendingRequests = (targetUser.pendingRequests || []).filter(r => r.id !== reqId);

    // Add to linkedMembers if not exists
    if (!targetUser.linkedMembers) targetUser.linkedMembers = [];
    if (!targetUser.linkedMembers.some(m => String(m.telegramChatId) === String(foundReq.chatId))) {
      targetUser.linkedMembers.push({
        id: `mem_${foundReq.chatId}`,
        name: foundReq.name,
        customAlias: foundReq.name,
        role: 'family',
        telegramChatId: foundReq.chatId,
        telegramUsername: foundReq.telegramUsername,
        linkedAt: new Date().toISOString(),
      });
    }

    saveUsers(users);
    setActiveAccountForChat(foundReq.chatId, targetUser.id);

    // Notify owner
    await sendTelegramReply(
      token,
      chatId,
      `✅ <b>Member Request Approved!</b>\n\n<b>${foundReq.name}</b> (@${foundReq.telegramUsername || 'N/A'}) ko aapke khate (<b>${targetUser.name}</b>) me add kar diya gaya hai.\n👥 Kul members: ${targetUser.linkedMembers.length}`
    );

    // Notify approved member
    await sendTelegramReply(
      token,
      foundReq.chatId,
      `🎉 <b>Badhaai Ho! Request Approve Ho Gayi!</b>\n\nOwner <b>${targetUser.name}</b> ne aapki link request approve kar di hai. Aap successfully jud chuke hain!\n\n💡 <b>Ab aap kharcha ya kamai sidhe log kar sakte hain:</b>\n• <code>500 sabzi cash</code>\n• <code>300 petrol upi</code>\n• <code>1200 groceries card</code>`
    );
    return;
  }

  // 5. Handle Reject Member Link Request Callback
  if (data.startsWith('reject_req_')) {
    const reqId = data.replace('reject_req_', '').trim();
    users = loadJson<UserProfile[]>(USERS_FILE, users);
    let targetUser: UserProfile | undefined;
    let foundReq: any;

    for (const u of users) {
      if (u.pendingRequests) {
        const r = u.pendingRequests.find(req => req.id === reqId);
        if (r) {
          targetUser = u;
          foundReq = r;
          break;
        }
      }
    }

    if (!targetUser || !foundReq) {
      await answerTelegramCallbackQuery(token, callbackId, 'Request pehle hi process ho chuki hai.');
      return;
    }

    await answerTelegramCallbackQuery(token, callbackId, 'Request reject kar di.');
    targetUser.pendingRequests = (targetUser.pendingRequests || []).filter(r => r.id !== reqId);
    saveUsers(users);

    await sendTelegramReply(
      token,
      chatId,
      `❌ <b>Member Request Rejected.</b>\n\n<b>${foundReq.name}</b> ki link request ko reject kar diya gaya hai.`
    );

    await sendTelegramReply(
      token,
      foundReq.chatId,
      `❌ <b>Request Rejected.</b>\n\nOwner ne <b>${targetUser.name}</b> ke ledger ke liye aapki link request reject kar di hai.`
    );
    return;
  }

  await answerTelegramCallbackQuery(token, callbackId);

  let simulatedText = '';
  if (data === 'cmd_ask') simulatedText = '/ask';
  else if (data === 'cmd_done') simulatedText = '/done';
  else if (data === 'cmd_balance') simulatedText = '/balance';
  else if (data === 'cmd_summary') simulatedText = '/summary';
  else if (data === 'cmd_compare' || data === 'cmd_mom') simulatedText = '/compare';
  else if (data === 'cmd_search' || data === 'cmd_find') simulatedText = '/find';
  else if (data === 'cmd_duplicates') simulatedText = '/duplicates';
  else if (data === 'cmd_udhaar' || data === 'cmd_khata') simulatedText = '/udhaar';
  else if (data === 'cmd_fuel' || data === 'cmd_mileage') simulatedText = '/fuel';
  else if (data === 'cmd_gullak') simulatedText = '/gullak';
  else if (data === 'cmd_accounts') simulatedText = '/accounts';
  else if (data === 'cmd_budget' || data === 'cmd_catbudget') simulatedText = '/budget';
  else if (data === 'cmd_date_today') simulatedText = '/date today';
  else if (data === 'cmd_date_yesterday') simulatedText = '/date yesterday';
  else if (data === 'cmd_tips') simulatedText = '/tips';
  else if (data === 'cmd_recent') simulatedText = '/recent';
  else if (data === 'cmd_categories') simulatedText = '/categories';
  else if (data === 'cmd_undo') simulatedText = '/undo';
  else if (data === 'cmd_help') simulatedText = '/help';
  else if (data === 'cmd_buttons') simulatedText = '/buttons';
  else if (data.startsWith('/')) simulatedText = data;
  else simulatedText = data;

  if (simulatedText) {
    await handleTelegramMessage({
      message_id: callbackQuery.message?.message_id || Date.now(),
      chat: { id: chatId },
      from: fromUser,
      text: simulatedText,
    });
  }
}

// ---------------- Telegram Message Ingestion Logic ----------------

async function handleTelegramMessage(messageObj: any) {
  const chatId = String(messageObj.chat?.id || messageObj.from?.id || '').trim();
  const fromId = String(messageObj.from?.id || '').trim();
  const fromUser = messageObj.from || {};
  const fromUsername = fromUser.username ? String(fromUser.username).replace('@', '').trim() : '';
  const userName = fromUser.first_name 
    ? `${fromUser.first_name}${fromUser.last_name ? ' ' + fromUser.last_name : ''}`.trim()
    : fromUser.username || 'User';
  const rawText = (messageObj.text || messageObj.caption || '').trim();
  const botToken = process.env.TELEGRAM_BOT_TOKEN || botConfig.botToken;

  if (!botToken || !chatId) return;

  // Always reload users from disk on every message so new registrations and links are immediately active
  users = loadJson<UserProfile[]>(USERS_FILE, users);
  chatActiveAccounts = loadJson<Record<string, string>>(ACTIVE_ACCOUNTS_FILE, chatActiveAccounts);

  const lowerText = rawText.toLowerCase().trim();
  const command = rawText.split(' ')[0].toLowerCase();
  const commandArg = rawText.split(' ').slice(1).join(' ').trim();

  // 1. Check for Linking Command (/link <code>, /link <email>, /start <code>, link <code>, or pure 6-digit code)
  const cleanCmd = command.split('@')[0].toLowerCase();
  const isLinkDirect = cleanCmd === '/link' || cleanCmd === 'link' || cleanCmd === '/connect' || cleanCmd === 'connect';
  const isStartWithCode = cleanCmd === '/start' && Boolean(commandArg);
  const isPure6DigitCode = /^\d{6}$/.test(rawText.trim());

  if (isLinkDirect || isStartWithCode || isPure6DigitCode) {
    // Reload users from disk & cache
    users = loadJson<UserProfile[]>(USERS_FILE, users);

    let extractedArg = commandArg ? commandArg.trim() : '';
    if (isPure6DigitCode) {
      extractedArg = rawText.trim();
    }
    
    // Clean potential prefixes like "link_", "code:", ":", etc.
    extractedArg = extractedArg.replace(/^link[:_\s]*/i, '').replace(/^code[:_\s]*/i, '').replace(/^[=:]\s*/, '').trim();

    // 1. Check if user typed `/link` without arguments
    if (!extractedArg && isLinkDirect) {
      await sendTelegramReply(
        botToken,
        chatId,
        `🔗 <b>TeleExpense Account Link Kaise Karein:</b>\n━━━━━━━━━━━━━━━━━━━━\n📌 <b>Aapka Telegram Chat ID:</b> <code>${chatId}</code>\n\n💡 <b>2 Aasaan Tareeqe:</b>\n1️⃣ <b>6-digit Code se:</b>\n   Apne Web Dashboard par 6-digit code dekhein aur bhejein:\n   <code>/link 838107</code>\n\n2️⃣ <b>Email se:</b>\n   Apna registered email address bhejein:\n   <code>/link ${users[0]?.email || 'aapka_email@example.com'}</code>\n\n🌐 <i>Aap Web Dashboard par "Direct Chat ID Link" me apni Chat ID <code>${chatId}</code> daal kar bhi instant connect kar sakte hain!</i>`
      );
      return;
    }

    // Extract potential 6-digit numeric code or email
    const numericCode = extractedArg.replace(/[^0-9]/g, '');
    const isEmail = extractedArg.includes('@');
    const cleanEmail = extractedArg.toLowerCase();

    // Search user
    let userToLink: UserProfile | undefined;

    // A. Match by 6-digit numeric code
    if (numericCode && numericCode.length === 6) {
      userToLink = users.find(u => String(u.linkCode || '').trim() === numericCode);
    }

    // B. Match by Email
    if (!userToLink && isEmail) {
      userToLink = users.find(u => u.email.toLowerCase() === cleanEmail);
    }

    // C. Match by User ID
    if (!userToLink && extractedArg) {
      userToLink = users.find(u => u.id === extractedArg || u.id === `user_${extractedArg}`);
    }

    // D. Match by Name (case-insensitive)
    if (!userToLink && extractedArg && extractedArg.length >= 3) {
      userToLink = users.find(u => u.name.toLowerCase() === extractedArg.toLowerCase());
    }

    // E. Fallback: If only 1 user exists in the entire database (single-user deployment on Render)
    if (!userToLink && users.length === 1) {
      userToLink = users[0];
    }

    if (userToLink) {
      if (!userToLink.linkedMembers) {
        userToLink.linkedMembers = [];
      }

      const memberName = userName || userToLink.name;
      const isAlreadyLinked = 
        String(userToLink.telegramChatId).trim() === chatId || 
        (fromId && String(userToLink.telegramChatId).trim() === fromId) ||
        userToLink.linkedMembers.some(m => String(m.telegramChatId).trim() === chatId || (fromId && String(m.telegramChatId).trim() === fromId));

      if (isAlreadyLinked) {
        setActiveAccountForChat(chatId, userToLink.id);
        if (fromId) setActiveAccountForChat(fromId, userToLink.id);
        await sendTelegramReply(
          botToken,
          chatId,
          `✅ <b>Aap Pehle Se Hi Jude Hue Hain!</b>\n\nAapka Telegram account <b>${userToLink.name}</b> (<code>${userToLink.email}</code>) ke ledger se successfully connected hai aur ye aapka active default account hai.\n\n💡 <i>Kharcha record karne ke liye sidhe bhejein:</i>\n• <code>500 sabzi cash</code>\n• <code>300 petrol upi</code>\n• <code>1200 restaurant card</code>`
        );
        return;
      }

      // If owner telegramChatId is not set, or matches this chat, or no owners yet: Direct Owner Link!
      const hasOwner = Boolean(userToLink.telegramChatId) && userToLink.linkedMembers.some(m => m.role === 'owner');

      if (!hasOwner || String(userToLink.telegramChatId).trim() === chatId || (fromId && String(userToLink.telegramChatId).trim() === fromId)) {
        userToLink.telegramChatId = chatId;
        userToLink.telegramUsername = fromUsername || userName;
        
        // Add or update owner in linkedMembers
        const existingMemIdx = userToLink.linkedMembers.findIndex(m => String(m.telegramChatId).trim() === chatId || (fromId && String(m.telegramChatId).trim() === fromId));
        if (existingMemIdx >= 0) {
          userToLink.linkedMembers[existingMemIdx].role = 'owner';
          userToLink.linkedMembers[existingMemIdx].customAlias = `${userToLink.name} (Owner)`;
        } else {
          userToLink.linkedMembers.push({
            id: `mem_${chatId}`,
            name: memberName,
            customAlias: `${userToLink.name} (Owner)`,
            role: 'owner',
            telegramChatId: chatId,
            telegramUsername: fromUsername || userName,
            linkedAt: new Date().toISOString(),
          });
        }

        saveUsers(users);
        setActiveAccountForChat(chatId, userToLink.id);
        if (fromId) setActiveAccountForChat(fromId, userToLink.id);

        await sendTelegramReply(
          botToken,
          chatId,
          `🎉 <b>Khata Owner Telegram se Connect Ho Gaya!</b>\n\nNamaste <b>${memberName}</b>! Aapka Telegram account <b>${userToLink.name}</b> (<code>${userToLink.email}</code>) se successfully link ho chuka hai.\n\n💡 <b>Ab aap kharcha aur income sidhe Telegram se record kar sakte hain:</b>\n• <code>500 sabzi cash</code>\n• <code>350 zomato upi</code>\n• <code>+25000 salary</code>\n• <code>/balance</code> ya <code>/summary</code>`
        );
        return;
      }

      // Secondary member joining an already claimed owner ledger -> Owner approval workflow
      if (!userToLink.pendingRequests) userToLink.pendingRequests = [];
      const existingPending = userToLink.pendingRequests.find(r => String(r.chatId).trim() === chatId || (fromId && String(r.chatId).trim() === fromId));

      if (existingPending) {
        await sendTelegramReply(
          botToken,
          chatId,
          `⏳ <b>Aapki Link Request Pehle Se Pending Hai!</b>\n\nAapne <b>${userToLink.name}</b> (${userToLink.email}) ke ledger se judne ki request bheji hui hai.\n\nJaise hi Owner (<b>${userToLink.name}</b>) Telegram ya Web Dashboard se isko <b>Approve</b> karenge, aapka account connect ho jayega!`
        );
        return;
      }

      const reqId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const newReq: any = {
        id: reqId,
        chatId: String(chatId),
        name: memberName,
        telegramUsername: fromUsername || userName,
        linkCode: userToLink.linkCode,
        requestedAt: new Date().toISOString(),
      };
      userToLink.pendingRequests.push(newReq);
      saveUsers(users);

      await sendTelegramReply(
        botToken,
        chatId,
        `⏳ <b>Link Request Bhej Di Gayi Hai!</b>\n\nNamaste <b>${memberName}</b>! Aapne <b>${userToLink.name}</b> (${userToLink.email}) ke ledger se judne ki request bhej di hai.\n\n🔒 <b>Owner Approval Zaroori Hai:</b>\nJaise hi Owner (<b>${userToLink.name}</b>) Telegram ya Web Dashboard se <b>Approve</b> karenge, aapka account connect ho jayega!`
      );

      // Notify Owner
      if (userToLink.telegramChatId && String(userToLink.telegramChatId).trim() !== chatId) {
        await sendTelegramReply(
          botToken,
          userToLink.telegramChatId,
          `🔔 <b>NAYI MEMBER LINK REQUEST AAYI HAI!</b>\n\n👤 <b>Member:</b> <b>${memberName}</b> (@${fromUsername || 'N/A'})\n🔑 <b>Chat ID:</b> <code>${chatId}</code>\n📂 <b>Ledger:</b> ${userToLink.name} (${userToLink.email})\n\nKya aap is member ko apne khate me kharcha & kamai add karne ki permission dena chahte hain?`,
          {
            inline_keyboard: [
              [
                { text: `✅ Approve ${memberName}`, callback_data: `approve_req_${reqId}` },
                { text: `❌ Reject`, callback_data: `reject_req_${reqId}` },
              ],
            ],
          }
        );
      }
      return;
    } else {
      // Code mismatch or user not found
      await sendTelegramReply(
        botToken,
        chatId,
        `❌ <b>Link Code Match Nahi Hua.</b>\n\n📌 <b>Aapka Telegram Chat ID:</b> <code>${chatId}</code>\n\n💡 <b>Connect karne ke aasaan tareeqe:</b>\n1️⃣ Web Dashboard par apna 6-digit code dekhein aur dobara bhejein:\n   <code>/link 838107</code>\n2️⃣ Ya apna registered Email address bhej kar link karein:\n   <code>/link ${users[0]?.email || 'aapka_email@example.com'}</code>\n3️⃣ Ya Web Dashboard par <b>"Direct Chat ID Link"</b> me apni Chat ID <code>${chatId}</code> paste karein!`
      );
      return;
    }
  }

  // 2. Resolve User from Chat ID, fromId, or Username
  const linkedUsersForChat = getLinkedUsersForChat(chatId, fromId, fromUsername);
  let targetUser = getActiveAccountForChat(chatId, linkedUsersForChat, fromId);

  // If unlinked user
  if (!targetUser) {
    // If only one user exists in system, offer quick auto-link
    if (users.length === 1) {
      targetUser = users[0];
      if (!targetUser.linkedMembers) targetUser.linkedMembers = [];
      targetUser.telegramChatId = chatId;
      targetUser.telegramUsername = fromUsername || userName;
      if (!targetUser.linkedMembers.some(m => String(m.telegramChatId).trim() === chatId)) {
        targetUser.linkedMembers.push({
          id: `mem_${chatId}`,
          name: userName || targetUser.name,
          customAlias: `${targetUser.name} (Owner)`,
          role: 'owner',
          telegramChatId: chatId,
          telegramUsername: fromUsername || userName,
          linkedAt: new Date().toISOString(),
        });
      }
      saveUsers(users);
      setActiveAccountForChat(chatId, targetUser.id);
      if (fromId) setActiveAccountForChat(fromId, targetUser.id);
    } else {
      await sendTelegramReply(
        botToken,
        chatId,
        `👋 <b>TeleExpense AI Khate me Aapka Swagat Hai!</b>\n\nAapka Telegram account abhi kisi khate se link nahi hai.\n\n🔑 <b>Aapka Telegram Chat ID:</b> <code>${chatId}</code>\n\n<b>Connect kaise karein:</b>\n1. Apna TeleExpense Web Dashboard kholein aur 6-digit ka <b>Link Code</b> dekhein\n2. Yahan reply karein:\n<code>/link &lt;AAPKA_CODE&gt;</code>\n\n<i>Udaharan:</i> <code>/link 513919</code>\n\n💡 <i>Ek Telegram user multiple accounts se connect ho sakta hai!</i>`
      );
      return;
    }
  }

  // 3. Accounts & Unlink Commands (/accounts, /myaccounts, /linked, /unlink)
  const isAccountsQuery =
    command === '/accounts' ||
    command === '/myaccounts' ||
    command === '/linked' ||
    command === '/account' ||
    lowerText === 'accounts' ||
    lowerText === 'my accounts' ||
    lowerText === 'mere accounts' ||
    lowerText.includes('👥 my accounts') ||
    lowerText.includes('👥 accounts') ||
    lowerText.includes('kitne account') ||
    lowerText.includes('mere account');

  if (isAccountsQuery) {
    const report = buildAccountsReportTelegramMessage(chatId, userName, fromId, fromUsername);
    await sendTelegramReply(botToken, chatId, report.text, report.replyMarkup);
    return;
  }

  // 4. Unlink Command (/unlink [account_name_or_id])
  if (command === '/unlink' || command === '/disconnect') {
    const linked = getLinkedUsersForChat(chatId, fromId, fromUsername);
    if (linked.length === 0) {
      await sendTelegramReply(botToken, chatId, 'ℹ️ Aap kisi bhi khate se judaa nahi hain.');
      return;
    }

    if (commandArg) {
      const q = commandArg.toLowerCase().trim();
      const toUnlink = linked.find(u =>
        u.id.toLowerCase() === q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.linkCode === q
      );

      if (toUnlink) {
        if (toUnlink.linkedMembers) {
          toUnlink.linkedMembers = toUnlink.linkedMembers.filter(m => String(m.telegramChatId).trim() !== chatId && String(m.telegramChatId).trim() !== fromId);
        }
        if (String(toUnlink.telegramChatId).trim() === chatId || String(toUnlink.telegramChatId).trim() === fromId) {
          toUnlink.telegramChatId = toUnlink.linkedMembers?.[0]?.telegramChatId || undefined;
          toUnlink.telegramUsername = toUnlink.linkedMembers?.[0]?.telegramUsername || undefined;
        }
        saveUsers(users);

        const remaining = getLinkedUsersForChat(chatId, fromId, fromUsername);
        if (chatActiveAccounts[chatId] === toUnlink.id || (fromId && chatActiveAccounts[fromId] === toUnlink.id)) {
          if (remaining.length > 0) {
            setActiveAccountForChat(chatId, remaining[0].id);
            if (fromId) setActiveAccountForChat(fromId, remaining[0].id);
          } else {
            delete chatActiveAccounts[chatId];
            if (fromId) delete chatActiveAccounts[fromId];
            saveActiveAccounts(chatActiveAccounts);
          }
        }

        await sendTelegramReply(
          botToken,
          chatId,
          `✅ <b>Account Safaltapoorvak Unlink Ho Gaya!</b>\n\nAap <b>${toUnlink.name}</b> (<code>${toUnlink.email}</code>) ke khate se disconnect ho chuke hain.\n👥 <b>Bache hue accounts:</b> ${remaining.length}`
        );
        const updatedReport = buildAccountsReportTelegramMessage(chatId, userName, fromId, fromUsername);
        await sendTelegramReply(botToken, chatId, updatedReport.text, updatedReport.replyMarkup);
        return;
      } else {
        await sendTelegramReply(botToken, chatId, `⚠️ "${commandArg}" se milta julta koi linked account nahi mila. Saare accounts dekhne ke liye <code>/accounts</code> bhejein.`);
        return;
      }
    }

    // If no argument passed, show the accounts report with Unlink buttons
    const report = buildAccountsReportTelegramMessage(chatId, userName, fromId, fromUsername);
    await sendTelegramReply(botToken, chatId, `❌ <b>Kripya wo account chunein jise aap unlink karna chahte hain:</b>\n\n` + report.text, report.replyMarkup);
    return;
  }

  // 5. Switch Active Account Command (/switch [name_or_code])
  if (command === '/switch') {
    const linked = getLinkedUsersForChat(chatId, fromId, fromUsername);
    if (linked.length <= 1 && !commandArg) {
      const report = buildAccountsReportTelegramMessage(chatId, userName, fromId, fromUsername);
      await sendTelegramReply(botToken, chatId, report.text, report.replyMarkup);
      return;
    }

    if (commandArg) {
      const q = commandArg.toLowerCase().trim();
      const targetSwitch = linked.find(u =>
        u.id.toLowerCase() === q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.linkCode === q
      );

      if (targetSwitch) {
        setActiveAccountForChat(chatId, targetSwitch.id);
        if (fromId) setActiveAccountForChat(fromId, targetSwitch.id);
        await sendTelegramReply(
          botToken,
          chatId,
          `🔄 <b>Active Default Khata Switch Ho Gaya!</b>\n\nAb aapka active khata <b>${targetSwitch.name}</b> (<code>${targetSwitch.email}</code>) set ho gaya hai.\n\nAb jo bhi kharcha ya income aap likhenge, wo <b>${targetSwitch.name}</b> ke khate me record hoga.`
        );
        const updatedReport = buildAccountsReportTelegramMessage(chatId, userName, fromId, fromUsername);
        await sendTelegramReply(botToken, chatId, updatedReport.text, updatedReport.replyMarkup);
        return;
      }
    }

    const report = buildAccountsReportTelegramMessage(chatId, userName, fromId, fromUsername);
    await sendTelegramReply(botToken, chatId, `🔄 <b>Switch karne ke liye account chunein:</b>\n\n` + report.text, report.replyMarkup);
    return;
  }

  const userId = targetUser.id;
  const userStore = getUserData(userId);
  const userTransactions = userStore.transactions;
  const userCategories = userStore.categories;

  // Resolve sender member identity
  const senderMember = targetUser.linkedMembers?.find(
    m => String(m.telegramChatId).trim() === chatId || (fromId && String(m.telegramChatId).trim() === fromId)
  );
  const senderDisplayName = senderMember?.customAlias || senderMember?.name || userName || 'Telegram User';

  // Check if sender is Owner vs Family Member strictly
  const isMasterChat = 
    (targetUser.telegramChatId && String(targetUser.telegramChatId).trim() === chatId) ||
    (fromId && targetUser.telegramChatId && String(targetUser.telegramChatId).trim() === fromId) ||
    (targetUser.email?.toLowerCase() === 'abhiveo4@gmail.com' && (chatId === '838107368' || fromId === '838107368'));

  const isSenderOwner = Boolean(
    isMasterChat || (senderMember && senderMember.role === 'owner')
  );

  const isFamilyMemberSender = !isSenderOwner;

  // Bundle sender context for helper reports
  const senderCtx: SenderTelegramContext = {
    isSenderOwner,
    senderDisplayName,
    chatId,
    fromId,
  };

  // Helper to calculate family member's personal spend & transaction metrics
  const memberTransactions = userTransactions.filter(t => 
    (t.telegramChatId && (t.telegramChatId === chatId || (fromId && t.telegramChatId === fromId))) ||
    (t.telegramUser && senderDisplayName && (
      t.telegramUser.toLowerCase() === senderDisplayName.toLowerCase() ||
      t.telegramUser.toLowerCase().includes(senderDisplayName.toLowerCase()) ||
      senderDisplayName.toLowerCase().includes(t.telegramUser.toLowerCase())
    ))
  );

  const currentMonthStr = getAppDateTime().date.substring(0, 7);
  const memberMonthSpent = memberTransactions
    .filter(t => t.type === 'expense' && t.date && t.date.startsWith(currentMonthStr))
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const memberTotalSpent = memberTransactions
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // Helper for masking global amounts in Telegram
  const maskSensitiveAmount = (amt: number, isOwn: boolean = false): string => {
    if (isSenderOwner || isOwn) {
      return `₹${amt.toLocaleString('en-IN')}`;
    }
    return `🔒 Masked`;
  };

  // Check for Excel / CSV Document Attachment in Telegram message
  if (messageObj.document && botToken) {
    const doc = messageObj.document;
    const fileName = (doc.file_name || '').toLowerCase();
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
      try {
        const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${doc.file_id}`);
        const fileData = await fileRes.json();
        if (fileData.ok && fileData.result?.file_path) {
          const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
          const downloadRes = await fetch(downloadUrl);
          const arrayBuffer = await downloadRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet);

          if (rows.length > 0) {
            const result = importBudgetRows(userId, rows);
            const replyMsg = `📊 <b>Excel Budget List Import Ho Gayi!</b> 🚀\n\n📁 <b>File:</b> <code>${doc.file_name}</code>\n✅ <b>${result.createdCount}</b> nayi categories auto-create ho gayi\n🔄 <b>${result.updatedCount}</b> categories ke budget allocate ho gaye\n💰 <b>Total Monthly Budget:</b> ₹${result.totalBudget.toLocaleString('en-IN')}\n\n💡 <i>Aapka budget allocation Web Dashboard par live sync ho gaya hai!</i>`;
            await sendTelegramReply(botToken, chatId, replyMsg);
            return;
          } else {
            await sendTelegramReply(botToken, chatId, '⚠️ Excel file khali hai ya koi row nahi mili. Kripya Category aur Budget columns check karein.');
            return;
          }
        }
      } catch (docErr: any) {
        console.error('Error importing Excel from Telegram document:', docErr);
        await sendTelegramReply(botToken, chatId, `❌ <b>Excel parse karne me error:</b> ${docErr.message}`);
        return;
      }
    }
  }

  // 2.8 AI Financial Advisor Exit Command (/done, /exit, /stop, /cancel, 'exit ai')
  const isDoneCmd =
    cleanCmd === '/done' ||
    cleanCmd === '/exit' ||
    cleanCmd === '/stop' ||
    cleanCmd === '/cancel' ||
    cleanCmd === '/finish' ||
    lowerText === 'done' ||
    lowerText === 'exit' ||
    lowerText === 'stop' ||
    lowerText === 'cancel' ||
    lowerText === 'finish' ||
    lowerText.includes('exit ai mode') ||
    lowerText.includes('finish ai mode');

  if (isDoneCmd) {
    setChatAiAdvisorMode(chatId, false);
    if (fromId) setChatAiAdvisorMode(fromId, false);
    await sendTelegramReply(
      botToken,
      chatId,
      `✅ <b>AI Financial Advisor Mode Finished!</b>\n━━━━━━━━━━━━━━━━━━━━\nBot wapas normal transaction tracking mode me aa gaya hai.\n\n💡 <b>Ab aap apne daily kharche ya kamai bhej sakte hain:</b>\n• <code>500 grocery cash</code>\n• <code>300 petrol upi</code>\n• <code>1200 restaurant card</code>\n\n🤖 <i>(Jab dobara AI Advisor se financial planning, goals ya investment strategy par salah chahiye ho, bas <code>/ask</code> likhein ya <b>🤖 Ask AI Advisor</b> button dabayein!)</i>`,
      TELEGRAM_HANDY_KEYBOARD
    );
    return;
  }

  // 2.9 AI Financial Advisor Start / Ask Command (/ask, /advisor, /askai, '🤖 Ask AI Advisor')
  const isAskCmd =
    cleanCmd === '/ask' ||
    cleanCmd === '/advisor' ||
    cleanCmd === '/askai' ||
    lowerText.startsWith('/ask') ||
    lowerText.startsWith('/advisor') ||
    lowerText === 'ask ai' ||
    lowerText === 'ai advisor' ||
    lowerText.includes('ask ai advisor') ||
    lowerText.includes('ask advisor');

  if (isAskCmd) {
    setChatAiAdvisorMode(chatId, true);
    if (fromId) setChatAiAdvisorMode(fromId, true);

    let questionArg = '';
    if (lowerText.startsWith('/ask')) {
      questionArg = rawText.replace(/^\/ask(@\w+)?/i, '').trim();
    } else if (lowerText.startsWith('/advisor')) {
      questionArg = rawText.replace(/^\/advisor(@\w+)?/i, '').trim();
    } else if (lowerText.startsWith('/askai')) {
      questionArg = rawText.replace(/^\/askai(@\w+)?/i, '').trim();
    }

    if (questionArg) {
      await sendTelegramReply(
        botToken,
        chatId,
        `🤖 <i>Gemini AI aapka khata aur ledger analyze karke answer taiyar kar raha hai...</i> ⏳`,
        TELEGRAM_AI_ADVISOR_KEYBOARD
      );
      const aiAnswer = await answerAiFinancialQuestion(userId, questionArg);
      const formattedHtml = formatMarkdownToTelegramHtml(aiAnswer.text);
      await sendTelegramReply(
        botToken,
        chatId,
        formattedHtml,
        {
          inline_keyboard: [
            [
              { text: '💬 Aur Sawaal Poochein', callback_data: 'cmd_ask' },
              { text: '✅ Exit AI Mode (/done)', callback_data: 'cmd_done' },
            ]
          ]
        }
      );
      return;
    }

    const welcomeAiMsg = `🤖 <b>GEMINI AI FINANCIAL ADVISOR ACTIVATED!</b> 📊
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khata:</b> ${targetUser.name}

Aapka complete live ledger (Bank balances, Credit cards, Expenses, Investments, Udhaar, Piggy Bank Goals & Wife savings) AI ke paas connect ho gaya hai!

💬 <b>Ab aap normal chats / questions bhej sakte hain:</b>
• 🎯 <i>"Meri monthly bachat badhane ke liye kya planning karein?"</i>
• 🚗 <i>"Mujhe 1 saal me goal reach karna hai, roadmap batao"</i>
• 📈 <i>"Mere surplus ke hisaab se best investment (MF / FD / Gold) strategy kya hogi?"</i>
• 💳 <i>"Mere credit card dues aur limits ko kaise optimize karein?"</i>
• ⚠️ <i>"Mere kharchon me sabse zyada faltu kharcha kaha ho raha hai?"</i>

━━━━━━━━━━━━━━━━━━━━
🔙 <b>Exit Karne Ke Liye:</b>
Jab bhi normal expense entry mode me wapas aana ho, bas <code>/done</code> ya <code>/exit</code> likhein ya neeche <b>✅ Exit AI Mode</b> button dabayein!`;

    await sendTelegramReply(
      botToken,
      chatId,
      welcomeAiMsg,
      TELEGRAM_AI_ADVISOR_KEYBOARD
    );
    return;
  }

  // 2.95 Check if user is actively in AI Advisor Conversational Mode
  const isChatActiveInAiMode = isChatInAiAdvisorMode(chatId) || (fromId ? isChatInAiAdvisorMode(fromId) : false);
  const isSystemOrUtilityCommand =
    command === '/start' ||
    command === '/help' ||
    command === '/menu' ||
    command === '/buttons' ||
    command === '/accounts' ||
    command === '/link' ||
    command === '/unlink' ||
    command === '/clearall' ||
    command === '/balance' ||
    command === '/balances' ||
    command === '/summary' ||
    command === '/budget' ||
    command === '/recent' ||
    command === '/undo' ||
    cleanCmd === '/setlimit' ||
    cleanCmd === '/setbalance';

  if (isChatActiveInAiMode && !isSystemOrUtilityCommand) {
    // Treat the incoming natural text as an AI Financial advisory question
    await sendTelegramReply(
      botToken,
      chatId,
      `🤖 <i>Gemini AI aapka question aur khata analyze kar raha hai...</i> ⏳`,
      TELEGRAM_AI_ADVISOR_KEYBOARD
    );
    const aiAnswer = await answerAiFinancialQuestion(userId, rawText);
    const formattedHtml = formatMarkdownToTelegramHtml(aiAnswer.text);
    await sendTelegramReply(
      botToken,
      chatId,
      formattedHtml,
      {
        inline_keyboard: [
          [
            { text: '💬 Aur Sawaal Poochein', callback_data: 'cmd_ask' },
            { text: '✅ Exit AI Mode (/done)', callback_data: 'cmd_done' },
          ]
        ]
      }
    );
    return;
  }

  // 3. Help, Buttons & Commands
  if (
    command === '/start' ||
    command === '/help' ||
    command === '/menu' ||
    command === '/buttons' ||
    lowerText === 'help' ||
    lowerText === 'guide' ||
    lowerText === 'menu' ||
    lowerText === 'buttons' ||
    lowerText.includes('help & guide') ||
    lowerText.includes('handy buttons') ||
    lowerText.includes('show buttons')
  ) {
    const welcomeMsg = `👋 <b>Namaste ${targetUser.name}! TeleExpense AI me aapka swagat hai</b> 💰

Khata: <b>${targetUser.email}</b>

📱 <b>Handy Quick Command Buttons:</b>
Aap neeche diye gaye inline buttons par tap karein, keyboard buttons use karein ya Telegram <b>Menu</b> button se direct commands chala sakte hain!

📌 <b>Kharcha ya Kamai add karne ke tareeqe:</b>
• <code>300 dahi cash</code>
• <code>500 petrol upi 2 sep</code>
• <code>100 sabzi nagad kal</code>
• <code>salary 50000 bank transfer</code>
• <code>1200 ki jeans card se</code>

🎯 <b>Budget, Date & Item Reports:</b>
• <code>/find medicine</code> ya <code>/find > 2000</code> - Smart search: koi bhi item, amount ya payment mode khojein
• <code>/compare</code> - Is mahine vs pichle mahine ka live MoM spending comparison
• <code>/duplicates</code> - Galti se hue double charge / duplicate transactions check karein
• <code>/spent signature</code> ya <code>signature pe kitna kharch huwa</code> - Kisi bhi item/merchant ka kul kharcha, total purchases aur average
• <code>petrol me kitna gaya</code> ya <code>zomato ka total kharcha</code> - Natural language spending query
• <code>/gullak</code> - Unspent category budget se bachi hui Gullak bachat
• <code>/budget</code> - Kon si category me kitna kharcha hua aur kitna balance bacha
• <code>/setbudget Food 5000</code> - Kisi bhi category ka naya monthly budget set karein
• <code>/date 2 sep</code> ya <code>kal ka kharcha</code> - Kisi specific date ka hisaab-kitaab

🗑️ <b>Delete karne ke commands:</b>
• <code>/undo</code> ya <code>/delete</code> - Aakhri transaction delete karein
• <code>/delete 1</code> - Recent list se #1 item delete karein
• <code>delete dahi</code> ya <code>hatao petrol</code> - Name se delete karein
• <code>/clearall</code> ya <code>sab delete karo</code> - Saare transactions clear karein

📊 <b>Handy Commands:</b>
/ask - 🤖 Gemini AI Financial Advisor (Chat/Planning/Strategy mode)
/done - ✅ AI mode exit karein & normal mode me aayein
/balance - Kul bacha hua balance check karein
/summary - Mahine ki summary report
/compare - Is mahine vs pichla mahina MoM spending comparison
/find - Smart natural search (e.g. <code>/find medicine</code>, <code>/find > 2000</code>)
/duplicates - Double-entry & duplicate check audit
/accounts - Jude hue accounts dekhein, switch karein & unlink buttons
/budget - Category-wise kharcha aur bacha budget
/setbudget - Naya monthly budget set karein (jaise: <code>/setbudget Food 5000</code>)
/date - Tareeq ka hisaab (jaise: <code>/date 2 sep</code> ya <code>kal</code>)
/recent - Aakhri 5 transactions dekhein
/unlink - Account se Telegram unlink karein
/buttons - Handy quick buttons screen par layein
/categories - Active categories ki list dekhein
/help - Ye guide dobara dekhne ke liye`;
    await sendTelegramReply(botToken, chatId, welcomeMsg, INLINE_KB_MAIN_COMMANDS);
    return;
  }

  // 4. View user categories command
  const isCategoriesQuery =
    command === '/categories' ||
    command === '/cats' ||
    lowerText === 'categories' ||
    lowerText === 'category' ||
    lowerText.includes('categories') ||
    lowerText.includes('category');

  if (isCategoriesQuery) {
    const expenseCats = userCategories.filter(c => c.type === 'expense' || c.type === 'both').map(c => `• ${c.name}`).join('\n');
    const incomeCats = userCategories.filter(c => c.type === 'income' || c.type === 'both').map(c => `• ${c.name}`).join('\n');
    const catMsg = `📂 <b>Aapki Active Categories:</b>\n\n🔴 <b>Kharche (Expense Categories):</b>\n${expenseCats}\n\n🟢 <b>Kamai (Income Categories):</b>\n${incomeCats}\n\n💡 <i>Aap Web Dashboard se kabhi bhi nayi categories add ya edit kar sakte hain!</i>`;
    await sendTelegramReply(botToken, chatId, catMsg, {
      inline_keyboard: [
        [
          { text: '💰 Balance', callback_data: 'cmd_balance' },
          { text: '📊 Summary', callback_data: 'cmd_summary' },
        ],
        [
          { text: '🤖 AI Tips & Bachat', callback_data: 'cmd_tips' },
          { text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' },
        ],
      ],
    });
    return;
  }

  // 5. Clear all command
  if (command === '/clearall' || command === '/deleteall' || lowerText === 'clear all' || lowerText === 'sab delete karo' || lowerText === 'sab hatao') {
    const count = userTransactions.length;
    if (count === 0) {
      await sendTelegramReply(botToken, chatId, 'ℹ️ Delete karne ke liye koi transaction nahi hai.');
      return;
    }
    userTransactions.length = 0;
    saveUserData(userId, userStore);
    await sendTelegramReply(botToken, chatId, `🗑️ <b>Saare ${count} transactions successfully delete ho gaye!</b>\n\n📊 <b>Total Balance:</b> ₹0`, {
      inline_keyboard: [
        [
          { text: '💰 Check Balance', callback_data: 'cmd_balance' },
          { text: '📊 Summary', callback_data: 'cmd_summary' },
        ],
      ],
    });
    return;
  }

  // 6. Balance & Summary commands
  const isBalanceQuery =
    command === '/balance' ||
    command === '/balances' ||
    command === '/bank' ||
    command === '/banks' ||
    command === '/cards' ||
    command === '/card' ||
    command === '/khata' ||
    command === '/accounts' ||
    command === '/account' ||
    command === '/ledger' ||
    lowerText === 'balance' ||
    lowerText === 'balances' ||
    lowerText === 'bank balance' ||
    lowerText === 'accounts' ||
    lowerText === 'account' ||
    lowerText === 'bank accounts' ||
    lowerText === 'cards' ||
    lowerText === 'accounts balance' ||
    lowerText === 'card balance' ||
    lowerText.includes('💰 balance') ||
    lowerText === '💰' ||
    lowerText === 'balance check' ||
    lowerText === 'kitna balance hai' ||
    lowerText === 'kitna balance bacha' ||
    lowerText === 'kitna balance bacha hai' ||
    lowerText === 'kitna bacha' ||
    lowerText === 'kitna bacha hai' ||
    lowerText === 'kitna balance' ||
    lowerText === 'account balance' ||
    lowerText === 'sab account ka balance' ||
    lowerText === 'wife balance' ||
    lowerText === 'wife ka balance';

  const isSummaryQuery =
    command === '/summary' ||
    lowerText === 'summary' ||
    lowerText.includes('📊 summary') ||
    lowerText === '📊' ||
    lowerText === 'mahine ka hisaab' ||
    lowerText === 'mahina' ||
    lowerText === 'hisab';

  if (isBalanceQuery) {
    const balanceMsg = buildBalancesTelegramMessage(userId, targetUser.name, isSenderOwner);

    await sendTelegramReply(botToken, chatId, balanceMsg, {
      inline_keyboard: [
        [
          { text: '📊 Mahine Ki Summary', callback_data: 'cmd_summary' },
          { text: '🎯 Category Budget', callback_data: 'cmd_budget' },
        ],
        [
          { text: '🔄 Refresh Balance', callback_data: 'cmd_balance' },
          { text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' },
        ],
      ],
    });
    return;
  }

  if (isSummaryQuery) {
    const summary = calculateUserSummary(userId);
    let summaryMsg = '';
    const istInfo = getAppDateTime();
    const [y, m] = istInfo.date.split('-').map(Number);
    const monthName = new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    if (isSenderOwner) {
      summaryMsg = `📊 <b>${targetUser.name} ka Current Month Hisaab (${monthName})</b>

🟢 <b>Is Mahine Ki Income:</b> ₹${(summary.currentMonthIncome || 0).toLocaleString('en-IN')}
🔴 <b>Is Mahine Ka Kharcha:</b> ₹${(summary.currentMonthPersonalExpense || 0).toLocaleString('en-IN')}
📈 <b>Is Mahine Ki Bachat Rate:</b> ${summary.savingsRate}%
📦 <b>Pichla Balance Carryforward:</b> ₹${(summary.openingCarryforward || 0).toLocaleString('en-IN')}
━━━━━━━━━━━━━━━━━━━━
💵 <b>Net Bacha Hua Balance:</b> <b>₹${(summary.totalNetSavings || summary.netSavings).toLocaleString('en-IN')}</b>
🎯 <b>Monthly Budget Limit:</b> ₹${summary.monthlyBudget.toLocaleString('en-IN')} (₹${Math.max(0, summary.monthlyBudget - summary.monthlySpent).toLocaleString('en-IN')} bacha)
📝 <b>Is Mahine Ke Records:</b> ${summary.currentMonthCount || 0} transactions

💡 <i>Faltu kharcha aur bachat tips ke liye <code>/tips</code> bhejein!</i>`;
    } else {
      summaryMsg = `📊 <b>Financial Summary Report</b> (👤 <b>${senderDisplayName}</b>)\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>Aapka Is Mahine Ka Kharcha:</b> <b>₹${memberMonthSpent.toLocaleString('en-IN')}</b>\n📝 <b>Aapke Records:</b> ${memberTransactions.length} transactions\n━━━━━━━━━━━━━━━━━━━━\n🟢 <b>Kul Family Income:</b> 🔒 Masked (Owner Protected)\n🔴 <b>Kul Family Kharcha:</b> 🔒 Masked (Owner Protected)\n💰 <b>Net Family Savings:</b> 🔒 Masked (Owner Protected)\n\n🔒 <i>(Owner Privacy: Aapko sirf aapke transactions ka amount dikhayi dega)</i>`;
    }

    await sendTelegramReply(botToken, chatId, summaryMsg, {
      inline_keyboard: [
        [
          { text: '💰 Net Balance', callback_data: 'cmd_balance' },
          { text: '🎯 Category Budget', callback_data: 'cmd_budget' },
        ],
        [
          { text: '🤖 AI Faltu Kharcha', callback_data: 'cmd_tips' },
          { text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' },
        ],
        [
          { text: '📅 Aaj Ka Hisab', callback_data: 'cmd_date_today' },
          { text: '🏷️ Categories', callback_data: 'cmd_categories' },
        ],
      ],
    });
    return;
  }

  // 6.25. Gullak (Piggy Bank) Savings from Unspent Monthly Budget Command
  const isGullakQuery =
    command === '/gullak' ||
    command === '/piggybank' ||
    command === '/gullakbatao' ||
    command === '/bachatkhata' ||
    lowerText === 'gullak' ||
    lowerText === 'piggy bank' ||
    lowerText.includes('🐷 gullak') ||
    lowerText.includes('gullak hisab') ||
    lowerText.includes('gullak me kitna') ||
    lowerText.includes('gullak dekh') ||
    lowerText.includes('kitna bacha budget') ||
    lowerText.includes('bacha hua budget') ||
    lowerText.includes('budget bachat');

  if (isGullakQuery) {
    if (isFamilyMemberSender) {
      await sendTelegramReply(
        botToken,
        chatId,
        `🐷 <b>Gullak Savings & Bachat Khata</b> (👤 <b>${senderDisplayName}</b>)\n━━━━━━━━━━━━━━━━━━━━\n💰 <b>Total Gullak Bachat:</b> 🔒 Masked (Owner Protected)\n📈 <b>Is Mahine Ki Unspent Bachat:</b> 🔒 Masked (Owner Protected)\n\n🔒 <i>Family Privacy Active: Master savings balance is protected.</i>`
      );
      return;
    }
    const gullakMsg = buildGullakReportTelegramMessage(userId, targetUser.name);
    await sendTelegramReply(botToken, chatId, gullakMsg, {
      inline_keyboard: [
        [
          { text: '💰 Check Balance', callback_data: 'cmd_balance' },
          { text: '🎯 Category Budget', callback_data: 'cmd_budget' },
        ],
        [
          { text: '📊 Monthly Summary', callback_data: 'cmd_summary' },
          { text: '🤖 AI Tips & Bachat', callback_data: 'cmd_tips' },
        ],
      ],
    });
    return;
  }

  // 6.3. Category-Wise Budget & Expense Report Command
  const isBudgetQuery =
    command === '/budget' ||
    command === '/budgets' ||
    command === '/catbudget' ||
    command === '/categorybudget' ||
    lowerText === 'budget' ||
    lowerText === 'budgets' ||
    lowerText.includes('🎯 category budget') ||
    lowerText.includes('category budget') ||
    lowerText.includes('category wise kharcha') ||
    lowerText.includes('category wise budget') ||
    lowerText.includes('kon si category me kitna') ||
    lowerText.includes('kisme kitna kharcha') ||
    lowerText.includes('budget status') ||
    lowerText.includes('budget check');

  if (isBudgetQuery) {
    if (isFamilyMemberSender) {
      await sendTelegramReply(
        botToken,
        chatId,
        `🎯 <b>Category Budget & Spending</b> (👤 <b>${senderDisplayName}</b>)\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>Aapka Is Mahine Ka Kharcha:</b> <b>₹${memberMonthSpent.toLocaleString('en-IN')}</b>\n💰 <b>Monthly Allocated Budget:</b> 🔒 Masked (Owner Protected)\n🟢 <b>Bacha Budget:</b> 🔒 Masked (Owner Protected)\n\n🔒 <i>Family Privacy: Budget limits and global balances are protected.</i>`
      );
      return;
    }
    const budgetMsg = buildCategoryBudgetTelegramMessage(userId, targetUser.name);
    await sendTelegramReply(botToken, chatId, budgetMsg, {
      inline_keyboard: [
        [
          { text: '💰 Balance', callback_data: 'cmd_balance' },
          { text: '📊 Summary', callback_data: 'cmd_summary' },
        ],
        [
          { text: '📅 Aaj Ka Hisab', callback_data: 'cmd_date_today' },
          { text: '🤖 AI Faltu Kharcha', callback_data: 'cmd_tips' },
        ],
      ],
    });
    return;
  }

  // 6.35. Set Category Budget Command (/setbudget <category> <amount> or /setbudget)
  const isSetBudget =
    cleanCmd === '/setbudget' ||
    cleanCmd === '/budgetset' ||
    lowerText.startsWith('/setbudget') ||
    lowerText.startsWith('set budget') ||
    lowerText.startsWith('budget set');

  if (isSetBudget) {
    if (isFamilyMemberSender) {
      await sendTelegramReply(
        botToken,
        chatId,
        `🔒 <b>Permission Denied:</b> Sirf Khata Owner budget set ya modify kar sakte hain.`
      );
      return;
    }

    let rawArg = '';
    if (lowerText.startsWith('/setbudget')) {
      rawArg = rawText.replace(/^\/setbudget(@\w+)?/i, '').trim();
    } else if (lowerText.startsWith('set budget')) {
      rawArg = rawText.replace(/^set budget/i, '').trim();
    } else if (lowerText.startsWith('budget set')) {
      rawArg = rawText.replace(/^budget set/i, '').trim();
    } else {
      rawArg = commandArg;
    }

    const userStore = getUserData(userId);
    syncBudgetsWithCategories(userStore);

    if (!rawArg) {
      const budgetLines = (userStore.budgets || []).map(b => {
        const emoji = getCategoryEmoji(b.category);
        return `• ${emoji} <b>${b.category}:</b> ₹${(Number(b.limit) || 0).toLocaleString('en-IN')}`;
      }).join('\n');

      const helpMsg = `🎯 <b>CATEGORY BUDGET KAISE SET KAREIN:</b>
━━━━━━━━━━━━━━━━━━━━
Aap kisi bhi category ka monthly budget set ya change kar sakte hain:

📝 <b>Examples:</b>
• <code>/setbudget Food 6000</code>
• <code>/setbudget Groceries 8000</code>
• <code>/setbudget Petrol 3000</code>
• <code>/setbudget Bills 4000</code>

📂 <b>Current Budget Limits:</b>
${budgetLines || 'ℹ️ Koi budget set nahi hai.'}

━━━━━━━━━━━━━━━━━━━━
💡 <i>Yeh limits har mahine (jaise kal se naye month me) automatically apply rehti hain. Web Dashboard par jakar "🎯 Budgets & Limits" tab se bhi edit kar sakte hain!</i>`;

      await sendTelegramReply(botToken, chatId, helpMsg, {
        inline_keyboard: [
          [{ text: '🎯 View Budgets', callback_data: 'cmd_budget' }, { text: '💰 Balance', callback_data: 'cmd_balance' }],
        ],
      });
      return;
    }

    let amount = 0;
    let categoryQuery = '';

    const numMatch = rawArg.match(/\b\d+(?:\.\d+)?\b/);
    if (numMatch) {
      amount = Math.round(Number(numMatch[0]));
      categoryQuery = rawArg.replace(numMatch[0], '').replace(/₹/g, '').trim();
    }

    if (amount <= 0 || !categoryQuery) {
      await sendTelegramReply(
        botToken,
        chatId,
        `⚠️ <b>Format Samajh Nahi Aaya:</b>\nKripya category aur amount dono likhein, jaise:\n<code>/setbudget Food 5000</code>\n<code>/setbudget Groceries 8000</code>`
      );
      return;
    }

    const cleanQ = categoryQuery.toLowerCase().trim();
    let targetCat = userStore.categories.find(c => c.name.toLowerCase() === cleanQ);
    if (!targetCat) {
      targetCat = userStore.categories.find(c => 
        c.name.toLowerCase().includes(cleanQ) || 
        cleanQ.includes(c.name.toLowerCase())
      );
    }

    if (!targetCat) {
      if (cleanQ.includes('food') || cleanQ.includes('khana') || cleanQ.includes('dining')) {
        targetCat = userStore.categories.find(c => c.name.toLowerCase().includes('food'));
      } else if (cleanQ.includes('groc') || cleanQ.includes('sabzi') || cleanQ.includes('kirana')) {
        targetCat = userStore.categories.find(c => c.name.toLowerCase().includes('grocer'));
      } else if (cleanQ.includes('petrol') || cleanQ.includes('fuel') || cleanQ.includes('diesel') || cleanQ.includes('travel') || cleanQ.includes('transport')) {
        targetCat = userStore.categories.find(c => c.name.toLowerCase().includes('transport') || c.name.toLowerCase().includes('fuel'));
      } else if (cleanQ.includes('bill') || cleanQ.includes('bijli') || cleanQ.includes('wifi') || cleanQ.includes('utility')) {
        targetCat = userStore.categories.find(c => c.name.toLowerCase().includes('bill'));
      }
    }

    const catName = targetCat ? targetCat.name : (categoryQuery.charAt(0).toUpperCase() + categoryQuery.slice(1));
    if (!targetCat) {
      userStore.categories.push({
        id: `cat_${Date.now()}`,
        name: catName,
        type: 'expense',
        icon: 'Tag',
        color: '#6366f1',
        keywords: [catName.toLowerCase()],
      });
    }

    if (!userStore.budgets) userStore.budgets = [];
    const bEntry = userStore.budgets.find(b => b.category.toLowerCase() === catName.toLowerCase());
    if (bEntry) {
      bEntry.limit = amount;
    } else {
      userStore.budgets.push({
        category: catName,
        limit: amount,
        spent: 0,
        period: 'monthly',
      });
    }

    syncBudgetsWithCategories(userStore);
    saveUserData(userId, userStore);

    const summary = calculateUserSummary(userId);
    const emoji = getCategoryEmoji(catName);

    const confirmMsg = `✅ <b>CATEGORY BUDGET UPDATE HO GAYA!</b> 🎯
━━━━━━━━━━━━━━━━━━━━
📂 <b>Category:</b> ${emoji} <b>${catName}</b>
💰 <b>Nayi Monthly Limit:</b> <b>₹${amount.toLocaleString('en-IN')}</b>
📊 <b>Kul Monthly Budget:</b> <b>₹${summary.monthlyBudget.toLocaleString('en-IN')}</b>

💡 <i>Yeh budget agle mahine (kal se) aur aage ke sabhi months ke liye automatic apply ho gaya hai!</i>`;

    await sendTelegramReply(botToken, chatId, confirmMsg, {
      inline_keyboard: [
        [{ text: '🎯 Sabhi Budgets Dekhein', callback_data: 'cmd_budget' }, { text: '💰 Balance', callback_data: 'cmd_balance' }],
      ],
    });
    return;
  }

  // 6.36. Set Account / Card / Wife Base Balance (/setbalance <account> <amount>)
  const isSetBalance =
    cleanCmd === '/setbalance' ||
    cleanCmd === '/balanceset' ||
    lowerText.startsWith('/setbalance') ||
    lowerText.startsWith('set balance') ||
    lowerText.startsWith('balance set');

  if (isSetBalance) {
    if (isFamilyMemberSender) {
      await sendTelegramReply(botToken, chatId, `🔒 <b>Permission Denied:</b> Sirf Khata Owner opening balance set kar sakte hain.`);
      return;
    }

    let rawArg = '';
    if (lowerText.startsWith('/setbalance')) {
      rawArg = rawText.replace(/^\/setbalance(@\w+)?/i, '').trim();
    } else if (lowerText.startsWith('set balance')) {
      rawArg = rawText.replace(/^set balance/i, '').trim();
    } else if (lowerText.startsWith('balance set')) {
      rawArg = rawText.replace(/^balance set/i, '').trim();
    } else {
      rawArg = commandArg;
    }

    const userStore = getUserData(userId);
    if (!userStore.accountBaseBalances) userStore.accountBaseBalances = {};

    if (!rawArg) {
      const helpMsg = `⚙️ <b>ACCOUNT BASE / OPENING BALANCES KAISE SET KAREIN:</b>
━━━━━━━━━━━━━━━━━━━━
Aap apne bank accounts, cash, credit cards ya wife ke account ka one-time opening balance set kar sakte hain. Uske baad transactions se automatically real-time minus/plus hota rahega!

📝 <b>Examples:</b>
• <code>/setbalance icici 50000</code> <i>(ICICI Bank)</i>
• <code>/setbalance axis 80000</code> <i>(Axis Bank)</i>
• <code>/setbalance cash 5000</code> <i>(Cash in hand)</i>
• <code>/setbalance wife 20000</code> <i>(Wife's savings account)</i>
• <code>/setbalance rupay 0</code> <i>(ICICI RuPay Card opening spends)</i>
• <code>/setbalance sbi 0</code> <i>(SBI CC opening spends)</i>

📊 <b>Current Base Balances:</b>
• 🏦 ICICI Bank: ₹${(userStore.accountBaseBalances['IC Bank'] || 0).toLocaleString('en-IN')}
• 🏦 Axis Bank: ₹${(userStore.accountBaseBalances['AX Bank'] || 0).toLocaleString('en-IN')}
• 💵 Cash in Hand: ₹${(userStore.accountBaseBalances['Cash'] || 0).toLocaleString('en-IN')}
• 🌸 Wife's Account Base: ₹${(userStore.wifeBaseBalance || 0).toLocaleString('en-IN')}

━━━━━━━━━━━━━━━━━━━━
💡 <i>Web Dashboard par "Accounts & Cards Ledger" me "Balances Set Karein" button se bhi set kar sakte hain!</i>`;

      await sendTelegramReply(botToken, chatId, helpMsg, {
        inline_keyboard: [
          [{ text: '🏦 Live Balances Dekhein', callback_data: 'cmd_balance' }]
        ]
      });
      return;
    }

    const parts = rawArg.split(/\s+/);
    const lastPart = parts[parts.length - 1];
    const amountNum = parseFloat(lastPart.replace(/[^0-9.]/g, ''));

    if (isNaN(amountNum)) {
      await sendTelegramReply(botToken, chatId, `⚠️ Kripya sahi amount dalein.\n<i>Udaharan:</i> <code>/setbalance icici 50000</code> ya <code>/setbalance wife 20000</code>`);
      return;
    }

    const targetPart = parts.slice(0, parts.length - 1).join(' ').toLowerCase();

    // Check if target is wife's account
    if (targetPart.includes('wife') || targetPart.includes('patni') || targetPart.includes('saving')) {
      userStore.wifeBaseBalance = Math.max(0, amountNum);
      userStore.wifeBalanceSetTimestamp = new Date().toISOString();
      saveUserData(userId, userStore);
      const updatedBal = calculateAccountsBalances(userId);
      await sendTelegramReply(
        botToken,
        chatId,
        `✅ <b>Wife's Account Live Balance Updated!</b>\n\n🌸 <b>Aaj Ka Live Balance:</b> <b>₹${updatedBal.wifeSavings.currentBalance.toLocaleString('en-IN')}</b>\n<i>(Iske baad aane wale naye transfers hi add honge, purane transactions add nahi honge.)</i>`,
        {
          inline_keyboard: [[{ text: '🏦 Sabhi Balances Dekhein', callback_data: 'cmd_balance' }]]
        }
      );
      return;
    }

    // Match account
    let matchedAccId: string | undefined;
    if (targetPart.includes('icici') && (targetPart.includes('cc') || targetPart.includes('card') || targetPart.includes('rupay') || targetPart.includes('0000'))) {
      matchedAccId = 'ICICI CC 0000';
    } else if (targetPart.includes('icici') || targetPart.includes('ic bank')) {
      matchedAccId = 'IC Bank';
    } else if (targetPart.includes('axis') && (targetPart.includes('cc') || targetPart.includes('card') || targetPart.includes('8210'))) {
      matchedAccId = 'AX CC 8210';
    } else if (targetPart.includes('axis') && (targetPart.includes('5376') || targetPart.includes('neo'))) {
      matchedAccId = 'AX CC 5376';
    } else if (targetPart.includes('axis') || targetPart.includes('salary') || targetPart.includes('ax bank')) {
      matchedAccId = 'AX Bank';
    } else if (targetPart.includes('cash') || targetPart.includes('nagad') || targetPart.includes('pocket')) {
      matchedAccId = 'Cash';
    } else if (targetPart.includes('5733') || targetPart.includes('simplyclick')) {
      matchedAccId = 'SBI CC 5733';
    } else if (targetPart.includes('6526') || targetPart.includes('pulse')) {
      matchedAccId = 'SBI CC 6526';
    } else if (targetPart.includes('sbi')) {
      matchedAccId = 'SBI CC 5733';
    } else if (targetPart.includes('rupay')) {
      matchedAccId = 'ICICI CC 0000';
    } else {
      matchedAccId = detectAccountFromText(targetPart);
    }

    if (!matchedAccId) {
      await sendTelegramReply(botToken, chatId, `⚠️ Account samajh nahi aaya. Kripya inme se chunien:\n• <code>/setbalance icici ${amountNum}</code>\n• <code>/setbalance axis ${amountNum}</code>\n• <code>/setbalance cash ${amountNum}</code>\n• <code>/setbalance wife ${amountNum}</code>\n• <code>/setbalance rupay ${amountNum}</code>`);
      return;
    }

    userStore.accountBaseBalances[matchedAccId] = Math.max(0, amountNum);
    if (!userStore.accountBalanceSetTimestamps) userStore.accountBalanceSetTimestamps = {};
    userStore.accountBalanceSetTimestamps[matchedAccId] = new Date().toISOString();
    saveUserData(userId, userStore);
    const updatedBal = calculateAccountsBalances(userId);
    const accInfo = updatedBal.accounts[matchedAccId];

    await sendTelegramReply(
      botToken,
      chatId,
      `✅ <b>${accInfo.name} Live Balance / Due Set Ho Gaya!</b>\n\n📌 <b>Aaj Ka Balance/Due:</b> ₹${amountNum.toLocaleString('en-IN')}\n💳 <b>Live Available Limit / Remaining:</b> <b>₹${(accInfo.currentBalance || 0).toLocaleString('en-IN')}</b>\n\n💡 <i>Ab se aane wale naye transactions hi isme minus/plus honge, purane transactions dobara add nahi honge.</i>`,
      {
        inline_keyboard: [[{ text: '🏦 Sabhi Balances Dekhein', callback_data: 'cmd_balance' }]]
      }
    );
    return;
  }

  // 6.37. Set Card Limit (/setlimit <card> <limit>)
  const isSetLimit =
    cleanCmd === '/setlimit' ||
    cleanCmd === '/cardlimit' ||
    cleanCmd === '/limit' ||
    lowerText.startsWith('/setlimit') ||
    lowerText.startsWith('/cardlimit') ||
    lowerText.startsWith('set limit') ||
    lowerText.startsWith('card limit');

  if (isSetLimit) {
    if (isFamilyMemberSender) {
      await sendTelegramReply(botToken, chatId, `🔒 <b>Permission Denied:</b> Sirf Khata Owner card limit change kar sakte hain.`);
      return;
    }

    let rawArg = '';
    if (lowerText.startsWith('/setlimit')) {
      rawArg = rawText.replace(/^\/setlimit(@\w+)?/i, '').trim();
    } else if (lowerText.startsWith('/cardlimit')) {
      rawArg = rawText.replace(/^\/cardlimit(@\w+)?/i, '').trim();
    } else if (lowerText.startsWith('set limit')) {
      rawArg = rawText.replace(/^set limit/i, '').trim();
    } else if (lowerText.startsWith('card limit')) {
      rawArg = rawText.replace(/^card limit/i, '').trim();
    } else {
      rawArg = commandArg;
    }

    const userStore = getUserData(userId);
    if (!userStore.cardCreditLimits) userStore.cardCreditLimits = {};

    if (!rawArg) {
      const helpMsg = `💳 <b>CREDIT CARD KI LIMIT KAISE CHANGE KAREIN:</b>
━━━━━━━━━━━━━━━━━━━━
Aap apne kisi bhi credit card ki total credit limit change kar sakte hain:

📝 <b>Examples:</b>
• <code>/setlimit rupay 150000</code> <i>(ICICI RuPay UPI CC 0000)</i>
• <code>/setlimit sbi 200000</code> <i>(SBI CC 5733)</i>
• <code>/setlimit 6526 120000</code> <i>(SBI CC 6526)</i>
• <code>/setlimit axis 200000</code> <i>(Axis CC 8210)</i>
• <code>/setlimit 5376 100000</code> <i>(Axis CC 5376)</i>

💡 <i>Web Dashboard par "Accounts & Cards Ledger" me "Balances Set Karein" se bhi limits set kar sakte hain!</i>`;

      await sendTelegramReply(botToken, chatId, helpMsg, {
        inline_keyboard: [[{ text: '🏦 Live Balances Dekhein', callback_data: 'cmd_balance' }]]
      });
      return;
    }

    const parts = rawArg.split(/\s+/);
    const lastPart = parts[parts.length - 1];
    const amountNum = parseFloat(lastPart.replace(/[^0-9.]/g, ''));

    if (isNaN(amountNum) || amountNum <= 0) {
      await sendTelegramReply(botToken, chatId, `⚠️ Kripya sahi credit limit dalein.\n<i>Udaharan:</i> <code>/setlimit rupay 150000</code>`);
      return;
    }

    const targetPart = parts.slice(0, parts.length - 1).join(' ').toLowerCase();
    let matchedCardId: string | undefined;

    if (targetPart.includes('0000') || targetPart.includes('rupay') || (targetPart.includes('icici') && (targetPart.includes('cc') || targetPart.includes('card')))) {
      matchedCardId = 'ICICI CC 0000';
    } else if (targetPart.includes('5733') || targetPart.includes('simplyclick')) {
      matchedCardId = 'SBI CC 5733';
    } else if (targetPart.includes('6526') || targetPart.includes('pulse')) {
      matchedCardId = 'SBI CC 6526';
    } else if (targetPart.includes('sbi')) {
      matchedCardId = 'SBI CC 5733';
    } else if (targetPart.includes('8210') || targetPart.includes('flipkart') || targetPart.includes('ace')) {
      matchedCardId = 'AX CC 8210';
    } else if (targetPart.includes('5376') || targetPart.includes('neo') || targetPart.includes('privilege')) {
      matchedCardId = 'AX CC 5376';
    } else if (targetPart.includes('axis') && (targetPart.includes('cc') || targetPart.includes('card'))) {
      matchedCardId = 'AX CC 8210';
    }

    if (!matchedCardId) {
      await sendTelegramReply(botToken, chatId, `⚠️ Card samajh nahi aaya. Kripya card specify karein:\n• <code>/setlimit rupay ${amountNum}</code>\n• <code>/setlimit 5733 ${amountNum}</code>\n• <code>/setlimit 6526 ${amountNum}</code>\n• <code>/setlimit 8210 ${amountNum}</code>\n• <code>/setlimit 5376 ${amountNum}</code>`);
      return;
    }

    userStore.cardCreditLimits[matchedCardId] = amountNum;
    saveUserData(userId, userStore);
    const updatedBal = calculateAccountsBalances(userId);
    const cardInfo = updatedBal.accounts[matchedCardId];

    await sendTelegramReply(
      botToken,
      chatId,
      `✅ <b>${cardInfo.name} Ki Limit Update Ho Gayi!</b>\n\n💳 <b>Nayi Total Limit:</b> <b>₹${amountNum.toLocaleString('en-IN')}</b>\n🔴 <b>Current Spends/Due:</b> ₹${(cardInfo.currentOutstanding || 0).toLocaleString('en-IN')}\n🟢 <b>Ab Available Limit Bacha:</b> <b>₹${(cardInfo.availableLimit || 0).toLocaleString('en-IN')}</b>`,
      {
        inline_keyboard: [[{ text: '🏦 Sabhi Balances Dekhein', callback_data: 'cmd_balance' }]]
      }
    );
    return;
  }

  // 6.5. Gemini AI Financial Tips & Faltu Kharcha Analysis
  const isTipQuery =
    command === '/tips' ||
    command === '/advice' ||
    command === '/bachat' ||
    command === '/faltu' ||
    command === '/faltukharcha' ||
    command === '/saving' ||
    command === '/savings' ||
    lowerText.includes('tips & bachat') ||
    lowerText.includes('ai tips') ||
    lowerText === 'tips' ||
    lowerText === 'advice' ||
    lowerText === 'bachat' ||
    lowerText === 'faltu kharcha' ||
    lowerText.includes('faltu kharcha') ||
    lowerText.includes('kaha kharch') ||
    lowerText.includes('saving tips') ||
    lowerText.includes('bachat kaise') ||
    lowerText.includes('kharcha kam kaise');

  if (isTipQuery) {
    if (userTransactions.length === 0) {
      await sendTelegramReply(
        botToken,
        chatId,
        `ℹ️ <b>Abhi tak koi kharcha record nahi hua hai.</b>\n\nPehle kuch transactions add karein (jaise: <code>350 zomato cash</code> ya <code>500 petrol upi</code>) taaki Gemini AI aapke kharchon ka analysis karke faltu kharche aur bachat ki tips de sake!`,
        INLINE_KB_MAIN_COMMANDS
      );
      return;
    }

    await sendTelegramReply(botToken, chatId, `🤖 <b>Gemini AI aapka kharcha analyze kar raha hai...</b> ⏳`);

    try {
      const insights = await generateAiFinancialInsights(userId);
      const avoidable = insights.avoidableExpenses;
      const summary = calculateUserSummary(userId);

      let itemsText = '';
      if (avoidable.items && avoidable.items.length > 0) {
        itemsText = avoidable.items.slice(0, 4).map((it: any) => {
          return `• <b>${it.title}:</b> ₹${it.amount.toLocaleString('en-IN')} <i>(${it.reason || it.category})</i>`;
        }).join('\n');
      } else {
        itemsText = '• Koi bada faltu kharcha nahi mila, aapka kharcha kaafi controlled hai!';
      }

      let tipsText = '';
      if (insights.savingTips && insights.savingTips.length > 0) {
        tipsText = insights.savingTips.slice(0, 3).map((tip: string, i: number) => `${i + 1}. ${tip}`).join('\n');
      }

      const replyMsg = `🤖 <b>GEMINI AI FINANCIAL & BACHAT REPORT</b> 📊
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khata:</b> ${targetUser.name}
📈 <b>Health Score:</b> ${insights.healthScore}/100 [${insights.verdict}]

🔴 <b>Kul Kharcha:</b> ₹${summary.totalExpense.toLocaleString('en-IN')}
⚠️ <b>Faltu / Avoidable Kharcha:</b> ₹${avoidable.totalAvoidableAmount.toLocaleString('en-IN')} (Kul kharche ka <b>${avoidable.percentageOfExpenses}%</b>)

🔍 <b>Yeh Paisa Kaha Faltu Kharch Hua:</b>
${itemsText}

━━━━━━━━━━━━━━━━━━━━
💰 <b>CONTROL KARNE PAR POTENTIAL BACHAT:</b>
• <b>Har Mahine Bachat:</b> ₹${avoidable.potentialMonthlySavings.toLocaleString('en-IN')}
• <b>1 Saal me Bachat:</b> ₹${avoidable.potentialYearlySavings.toLocaleString('en-IN')}
🚀 <i>${avoidable.investmentAdvice}</i>

━━━━━━━━━━━━━━━━━━━━
🎯 <b>GEMINI ACTION TIPS:</b>
${tipsText}

💡 <i>Web Dashboard par poora visual breakdown dekhne ke liye AI Insights button click karein!</i>`;

      await sendTelegramReply(botToken, chatId, replyMsg, {
        inline_keyboard: [
          [
            { text: '💰 Check Balance', callback_data: 'cmd_balance' },
            { text: '📊 Monthly Summary', callback_data: 'cmd_summary' },
          ],
          [
            { text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' },
            { text: '🏷️ Categories', callback_data: 'cmd_categories' },
          ],
        ],
      });
      return;
    } catch (err: any) {
      console.error('Error generating AI tips for Telegram:', err);
      await sendTelegramReply(botToken, chatId, `⚠️ Tips generate karne me dikkat aayi: ${err.message}`);
      return;
    }
  }

  // 7. Recent command
  const isRecentQuery =
    command === '/recent' ||
    lowerText === 'recent' ||
    lowerText.includes('recent 5') ||
    lowerText.includes('recent tx') ||
    lowerText.includes('aakhri tx') ||
    lowerText === 'aakhri';

  if (isRecentQuery) {
    const recent = userTransactions.slice(0, 5);
    if (recent.length === 0) {
      await sendTelegramReply(botToken, chatId, 'ℹ️ Abhi tak koi transaction record nahi hua hai. Kuch add karne ke liye message bhejein jaise: <code>300 dahi cash</code>!', INLINE_KB_MAIN_COMMANDS);
      return;
    }
    const list = recent.map((t, idx) => {
      const sign = t.type === 'income' ? '🟢 +' : '🔴 -';
      const pm = t.paymentMethod ? `[${t.paymentMethod}]` : '';
      const isOwnTx = 
        isSenderOwner ||
        (t.telegramChatId && (t.telegramChatId === chatId || (fromId && t.telegramChatId === fromId))) ||
        (t.telegramUser && senderDisplayName && (
          t.telegramUser.toLowerCase() === senderDisplayName.toLowerCase() ||
          t.telegramUser.toLowerCase().includes(senderDisplayName.toLowerCase()) ||
          senderDisplayName.toLowerCase().includes(t.telegramUser.toLowerCase())
        ));

      const amtDisplay = isOwnTx ? `₹${t.amount.toLocaleString('en-IN')}` : `🔒 Masked`;
      const userTag = t.telegramUser ? ` • <i>by ${t.telegramUser}</i>` : '';
      return `<b>[#${idx + 1}]</b> ${sign}${amtDisplay} • <b>${t.description}</b> (${t.category}) ${pm}${userTag} <i>${t.date}${t.time ? ` • ${t.time}` : ''}</i>`;
    }).join('\n');
    await sendTelegramReply(botToken, chatId, `📝 <b>Haal hi ke Transactions:</b>\n\n${list}\n\n💡 <i>Tip: Item #1 ko delete karne ke liye neeche Undo button dabayein</i>`, {
      inline_keyboard: [
        [
          { text: '↩️ Undo #1 Item', callback_data: 'cmd_undo' },
          { text: '💰 Balance', callback_data: 'cmd_balance' },
        ],
        [
          { text: '📊 Summary', callback_data: 'cmd_summary' },
          { text: '🤖 AI Tips', callback_data: 'cmd_tips' },
        ],
      ],
    });
    return;
  }

  // 8. Delete / Undo commands
  const isUndoQuery =
    command === '/undo' ||
    command === '/delete' ||
    lowerText === 'undo' ||
    lowerText.includes('undo last') ||
    lowerText === 'delete' ||
    lowerText === 'delete last' ||
    lowerText === 'hatao' ||
    lowerText === 'aakhri hatao';

  if (isUndoQuery) {
    const parts = rawText.split(/\s+/);
    if (parts.length > 1 && /^\d+$/.test(parts[1])) {
      const targetIndex = parseInt(parts[1], 10) - 1;
      if (targetIndex >= 0 && targetIndex < userTransactions.length) {
        const targetTx = userTransactions[targetIndex];
        const isOwnTx = isSenderOwner || 
          (targetTx.telegramChatId && (targetTx.telegramChatId === chatId || (fromId && targetTx.telegramChatId === fromId))) ||
          (targetTx.telegramUser && senderDisplayName && (
            targetTx.telegramUser.toLowerCase() === senderDisplayName.toLowerCase() ||
            targetTx.telegramUser.toLowerCase().includes(senderDisplayName.toLowerCase()) ||
            senderDisplayName.toLowerCase().includes(targetTx.telegramUser.toLowerCase())
          ));

        if (!isOwnTx) {
          await sendTelegramReply(botToken, chatId, `⚠️ <b>Permission Denied:</b> Aap sirf apne dwara add kiye gaye transactions delete kar sakte hain.`);
          return;
        }

        const [deleted] = userTransactions.splice(targetIndex, 1);
        saveUserData(userId, userStore);
        const summary = calculateUserSummary(userId);
        const balanceDisplay = isSenderOwner ? `₹${summary.netSavings.toLocaleString('en-IN')}` : `🔒 Masked (Owner Protected)`;
        await sendTelegramReply(
          botToken,
          chatId,
          `🗑️ <b>Transaction #${targetIndex + 1} Delete Ho Gaya:</b>\n₹${deleted.amount} • ${deleted.description} (${deleted.category})\n\n📊 <b>Updated Balance:</b> ${balanceDisplay}`,
          {
            inline_keyboard: [
              [
                { text: '💰 Check Balance', callback_data: 'cmd_balance' },
                { text: '📊 Summary', callback_data: 'cmd_summary' },
              ],
              [
                { text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' },
                { text: '🤖 AI Tips', callback_data: 'cmd_tips' },
              ],
            ],
          }
        );
        return;
      } else {
        await sendTelegramReply(botToken, chatId, `⚠️ Galat number. Transaction list dekhne ke liye <code>/recent</code> bhejein.`);
        return;
      }
    }

    if (userTransactions.length === 0) {
      await sendTelegramReply(botToken, chatId, 'ℹ️ Delete karne ke liye koi transaction nahi mila.');
      return;
    }

    // Check if top transaction belongs to this sender
    const topTx = userTransactions[0];
    const isOwnTopTx = isSenderOwner || 
      (topTx.telegramChatId && (topTx.telegramChatId === chatId || (fromId && topTx.telegramChatId === fromId))) ||
      (topTx.telegramUser && senderDisplayName && (
        topTx.telegramUser.toLowerCase() === senderDisplayName.toLowerCase() ||
        topTx.telegramUser.toLowerCase().includes(senderDisplayName.toLowerCase()) ||
        senderDisplayName.toLowerCase().includes(topTx.telegramUser.toLowerCase())
      ));

    if (!isOwnTopTx) {
      await sendTelegramReply(botToken, chatId, `⚠️ <b>Permission Denied:</b> Aakhri transaction kisi aur member dwara add kiya gaya tha. Aap sirf apne transactions delete kar sakte hain.`);
      return;
    }

    const deleted = userTransactions.shift();
    saveUserData(userId, userStore);
    const summary = calculateUserSummary(userId);
    const balanceDisplay = isSenderOwner ? `₹${summary.netSavings.toLocaleString('en-IN')}` : `🔒 Masked (Owner Protected)`;
    await sendTelegramReply(
      botToken,
      chatId,
      `🗑️ <b>Aakhri Transaction Delete Ho Gaya:</b>\n₹${deleted?.amount} • ${deleted?.description} (${deleted?.category})\n\n📊 <b>Updated Balance:</b> ${balanceDisplay}`,
      {
        inline_keyboard: [
          [
            { text: '💰 Check Balance', callback_data: 'cmd_balance' },
            { text: '📊 Summary', callback_data: 'cmd_summary' },
          ],
          [
            { text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' },
            { text: '🤖 AI Tips', callback_data: 'cmd_tips' },
          ],
        ],
      }
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
      foundIdx = userTransactions.findIndex(t => {
        const isOwn = isSenderOwner || 
          (t.telegramChatId && (t.telegramChatId === chatId || (fromId && t.telegramChatId === fromId))) ||
          (t.telegramUser && senderDisplayName && (
            t.telegramUser.toLowerCase() === senderDisplayName.toLowerCase() ||
            t.telegramUser.toLowerCase().includes(senderDisplayName.toLowerCase()) ||
            senderDisplayName.toLowerCase().includes(t.telegramUser.toLowerCase())
          ));
        return isOwn && Math.abs(t.amount - queryNum) < 0.01;
      });
    }
    if (foundIdx === -1) {
      foundIdx = userTransactions.findIndex(t => {
        const isOwn = isSenderOwner || 
          (t.telegramChatId && (t.telegramChatId === chatId || (fromId && t.telegramChatId === fromId))) ||
          (t.telegramUser && senderDisplayName && (
            t.telegramUser.toLowerCase() === senderDisplayName.toLowerCase() ||
            t.telegramUser.toLowerCase().includes(senderDisplayName.toLowerCase()) ||
            senderDisplayName.toLowerCase().includes(t.telegramUser.toLowerCase())
          ));
        return isOwn && (
          t.description.toLowerCase().includes(query) ||
          t.category.toLowerCase().includes(query)
        );
      });
    }

    if (foundIdx !== -1) {
      const [deleted] = userTransactions.splice(foundIdx, 1);
      saveUserData(userId, userStore);
      const summary = calculateUserSummary(userId);
      const balanceDisplay = isSenderOwner ? `₹${summary.netSavings.toLocaleString('en-IN')}` : `🔒 Masked (Owner Protected)`;
      await sendTelegramReply(
        botToken,
        chatId,
        `🗑️ <b>Matching Transaction Delete Ho Gaya:</b>\n₹${deleted.amount} • ${deleted.description} (${deleted.category}) [${deleted.date}]\n\n📊 <b>Updated Balance:</b> ${balanceDisplay}`,
        {
          inline_keyboard: [
            [
              { text: '💰 Check Balance', callback_data: 'cmd_balance' },
              { text: '📊 Summary', callback_data: 'cmd_summary' },
            ],
            [
              { text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' },
              { text: '🤖 AI Tips', callback_data: 'cmd_tips' },
            ],
          ],
        }
      );
      return;
    }
  }

  // 8.5. Date-Specific Expense & Income Inquiry (/date <date> or pure date queries like "2 sep", "kal", "parso", "2 sep ka kharcha", "aaj ka hisab")
  const queriedDate = isPureDateQuery(rawText);
  if (queriedDate) {
    const dateReportMsg = buildDateReportTelegramMessage(userId, queriedDate, targetUser.name, senderCtx);
    await sendTelegramReply(botToken, chatId, dateReportMsg, {
      inline_keyboard: [
        [
          { text: '💰 Balance', callback_data: 'cmd_balance' },
          { text: '🎯 Category Budget', callback_data: 'cmd_budget' },
        ],
        [
          { text: '📊 Summary', callback_data: 'cmd_summary' },
          { text: '🤖 AI Tips', callback_data: 'cmd_tips' },
        ],
      ],
    });
    return;
  }

  // 8.75. Item-Specific Natural Language Spending Query (e.g. /spent signature, signature pe kitna kharch huwa, petrol me kitna gaya, zomato ka total kharcha)
  const itemQuery = extractItemSpendingQuery(rawText);
  if (itemQuery) {
    const itemReportMsg = buildItemSpendingReportTelegramMessage(userId, itemQuery, targetUser.name, senderCtx);
    await sendTelegramReply(botToken, chatId, itemReportMsg, {
      inline_keyboard: [
        [
          { text: '💰 Check Balance', callback_data: 'cmd_balance' },
          { text: '📊 Monthly Summary', callback_data: 'cmd_summary' },
        ],
        [
          { text: '🎯 Category Budget', callback_data: 'cmd_budget' },
          { text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' },
        ],
      ],
    });
    return;
  }

  // 8.6. Month-on-Month Comparison (/compare)
  const isCompareQuery =
    command === '/compare' ||
    command === '/comparison' ||
    command === '/mom' ||
    command === '/vs' ||
    lowerText === 'compare' ||
    lowerText === 'comparison' ||
    lowerText === '📈 compare' ||
    lowerText === '📈 mom compare' ||
    lowerText.includes('is mahine vs pichla mahina') ||
    lowerText.includes('pichle mahine se compare') ||
    lowerText.includes('pichle mahine ka comparison') ||
    lowerText.includes('mahine ki tulna') ||
    lowerText.includes('compare months');

  if (isCompareQuery) {
    const report = buildMonthComparisonReportTelegramMessage(userId, targetUser.name, senderCtx);
    await sendTelegramReply(botToken, chatId, report.text, report.replyMarkup);
    return;
  }

  // 8.7. Smart Natural Search (/find, /search, khojo, dhundo)
  const isFindCmd =
    command === '/find' ||
    command === '/search' ||
    command === '/khojo' ||
    command === '/dhundo' ||
    command === '/filter';

  const naturalFindMatch =
    lowerText.match(/^(?:find|search|khojo|dhundo)\s+(.+)$/i) ||
    lowerText.match(/^(.+?)\s+(?:khojo|dhundo|search\s+karo)$/i);

  if (isFindCmd || naturalFindMatch) {
    let queryToSearch = '';
    if (isFindCmd) {
      queryToSearch = commandArg.trim();
    } else if (naturalFindMatch) {
      queryToSearch = naturalFindMatch[1].trim();
    }

    if (!queryToSearch) {
      const guide = `🔍 <b>Smart Natural Search Guide:</b>
━━━━━━━━━━━━━━━━━━━━
📌 <i>Kharchon ya kamai ko aasaani se dhoondein:</i>

• <code>/find medicine</code> - Kisi bhi item ya medicine ka hisab
• <code>/find petrol</code> - Petrol ke saare transactions
• <code>/find > 2000</code> - ₹2,000 se bade saare transactions
• <code>/find < 500</code> - ₹500 se chhote transactions
• <code>/find upi</code> ya <code>/find cash</code> - Payment method se search
• <code>/find last month</code> - Pichle mahine ke transactions
• <code>/find zomato last month</code> - Pichle mahine ke Zomato orders`;
      await sendTelegramReply(botToken, chatId, guide, {
        inline_keyboard: [
          [{ text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' }, { text: '💰 Balance', callback_data: 'cmd_balance' }],
          [{ text: '📊 Summary', callback_data: 'cmd_summary' }, { text: '📈 MoM Compare', callback_data: 'cmd_compare' }],
        ],
      });
      return;
    }

    const report = buildSearchReportTelegramMessage(userId, queryToSearch, targetUser.name, senderCtx);
    await sendTelegramReply(botToken, chatId, report.text, report.replyMarkup);
    return;
  }

  // 8.72. Duplicate / Double Charge Audit (/duplicates)
  const isDuplicatesQuery =
    command === '/duplicates' ||
    command === '/duplicate' ||
    command === '/doublecharge' ||
    lowerText === 'duplicates' ||
    lowerText === 'duplicate' ||
    lowerText.includes('duplicate check') ||
    lowerText.includes('double entry') ||
    lowerText.includes('duplicate kharcha');

  if (isDuplicatesQuery) {
    const report = buildDuplicatesReportTelegramMessage(userId, targetUser.name, senderCtx);
    await sendTelegramReply(botToken, chatId, report.text, report.replyMarkup);
    return;
  }

  // 8.8 Udhaar / Khata Book Matching & Commands
  const isUdhaarQuery =
    command === '/udhaar' ||
    command === '/khata' ||
    command === '/lena' ||
    command === '/dena' ||
    lowerText === 'udhaar' ||
    lowerText === 'khata' ||
    lowerText === 'udhaar hisab' ||
    lowerText === 'khata hisab' ||
    lowerText === 'lena dena' ||
    lowerText.includes('🤝 udhaar khata');

  if (isUdhaarQuery) {
    const report = buildUdhaarReportTelegramMessage(userId);
    await sendTelegramReply(botToken, chatId, report.text, report.replyMarkup);
    return;
  }

  // Udhaar Interactive Callback Handlers (udh_*)
  const udhCmd = command.replace(/^\//, '');

  if (udhCmd === 'udh_menu_date') {
    if (!userStore.udhaars) userStore.udhaars = [];
    const pending = userStore.udhaars.filter(u => u.status === 'pending');
    if (pending.length === 0) {
      await sendTelegramReply(botToken, chatId, '✨ <i>Koi pending udhaar entry nahi hai jiski date badli ja sake.</i>');
      return;
    }
    const buttons = pending.slice(0, 8).map(u => ([
      { text: `📅 ${u.personName}: ₹${u.amount.toLocaleString('en-IN')} (${u.date})`, callback_data: `udh_pick_${u.id}` }
    ]));
    buttons.push([{ text: '🔙 Back to Khata', callback_data: 'cmd_udhaar' }]);

    await sendTelegramReply(
      botToken,
      chatId,
      `📅 <b>TAREEQ (DATE) BADALNE KE LIYE ENTRY CHUNEIN:</b>\n━━━━━━━━━━━━━━━━━━━━\nNeeche di gayi entries me se select karein jiski date change karni hai:`,
      { inline_keyboard: buttons }
    );
    return;
  }

  if (udhCmd.startsWith('udh_pick_')) {
    const udhId = udhCmd.replace('udh_pick_', '').trim();
    if (!userStore.udhaars) userStore.udhaars = [];
    const entry = userStore.udhaars.find(u => u.id === udhId);
    if (!entry) {
      await sendTelegramReply(botToken, chatId, '❌ Entry nahi mili ya pehle hi delete/settle ho chuki hai.');
      return;
    }

    const todayStr = getIstDateOffset(0);
    const yesterdayStr = getIstDateOffset(-1);
    const parsoStr = getIstDateOffset(-2);

    const buttons = [
      [
        { text: `🟢 Aaj (${todayStr.slice(5)})`, callback_data: `udh_setd_${udhId}_today` },
        { text: `🟡 Kal (${yesterdayStr.slice(5)})`, callback_data: `udh_setd_${udhId}_yesterday` },
      ],
      [
        { text: `🟠 Parso (${parsoStr.slice(5)})`, callback_data: `udh_setd_${udhId}_parso` },
        { text: `🔙 Back`, callback_data: 'udh_menu_date' },
      ],
    ];

    await sendTelegramReply(
      botToken,
      chatId,
      `📅 <b>TAREEQ (DATE) CHANGE KAREIN:</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Person:</b> <b>${entry.personName}</b>
💰 <b>Raqam:</b> ₹${entry.amount.toLocaleString('en-IN')} (${entry.type === 'lent' ? 'diya' : 'liya'})
📅 <b>Current Date:</b> <b>${entry.date}</b>

👉 <i>Quick date select karein ya chat me likhein:</i>
• <code>date change ${entry.personName} 14 sep</code>
• <code>/udhardate ${entry.personName} 14 sep</code>`,
      { inline_keyboard: buttons }
    );
    return;
  }

  if (udhCmd.startsWith('udh_setd_')) {
    const parts = udhCmd.replace('udh_setd_', '').split('_');
    const udhId = parts[0];
    const choice = parts.slice(1).join('_');
    if (!userStore.udhaars) userStore.udhaars = [];
    const entry = userStore.udhaars.find(u => u.id === udhId);
    if (!entry) {
      await sendTelegramReply(botToken, chatId, '❌ Entry nahi mili.');
      return;
    }

    const oldDate = entry.date;
    let newDate = getIstDateOffset(0);
    if (choice === 'yesterday') newDate = getIstDateOffset(-1);
    else if (choice === 'parso') newDate = getIstDateOffset(-2);
    else if (/^\d{4}-\d{2}-\d{2}$/.test(choice)) newDate = choice;

    entry.date = newDate;
    saveUserData(userId, userStore);

    await sendTelegramReply(
      botToken,
      chatId,
      `✅ <b>Date Successfully Change Ho Gayi!</b> 🎉
━━━━━━━━━━━━━━━━━━━━
👤 <b>Person:</b> <b>${entry.personName}</b>
💰 <b>Raqam:</b> ₹${entry.amount.toLocaleString('en-IN')}
📅 <b>Puraani Date:</b> ${oldDate} ➡️ <b>Nayi Date:</b> <b>${newDate}</b>

📊 <i>Khata updated!</i>`,
      buildUdhaarReportTelegramMessage(userId).replyMarkup
    );
    return;
  }

  if (udhCmd.startsWith('udh_del_')) {
    const udhId = udhCmd.replace('udh_del_', '').trim();
    if (!userStore.udhaars) userStore.udhaars = [];
    const idx = userStore.udhaars.findIndex(u => u.id === udhId);
    if (idx !== -1) {
      const deleted = userStore.udhaars[idx];
      userStore.udhaars.splice(idx, 1);
      saveUserData(userId, userStore);
      await sendTelegramReply(
        botToken,
        chatId,
        `🗑️ <b>Udhaar Entry Delete Ho Gayi:</b>\n\n👤 <b>${deleted.personName}</b>: ₹${deleted.amount.toLocaleString('en-IN')} (${deleted.date})`,
        buildUdhaarReportTelegramMessage(userId).replyMarkup
      );
      return;
    }
  }

  if (udhCmd === 'udh_menu_settle') {
    if (!userStore.udhaars) userStore.udhaars = [];
    const pending = userStore.udhaars.filter(u => u.status === 'pending');
    const uniqueNames = Array.from(new Set(pending.map(u => u.personName)));
    if (uniqueNames.length === 0) {
      await sendTelegramReply(botToken, chatId, '✨ Koi pending khata nahi hai settle karne ke liye.');
      return;
    }
    const buttons = uniqueNames.slice(0, 8).map(name => ([
      { text: `✅ Settle ${name}`, callback_data: `udh_setl_name_${encodeURIComponent(name)}` }
    ]));
    buttons.push([{ text: '🔙 Back to Khata', callback_data: 'cmd_udhaar' }]);
    await sendTelegramReply(
      botToken,
      chatId,
      `✅ <b>KISKA HISAB CLEAR / SETTLE KARNA HAI?</b>\n━━━━━━━━━━━━━━━━━━━━\nSelect karein:`,
      { inline_keyboard: buttons }
    );
    return;
  }

  if (udhCmd.startsWith('udh_setl_name_')) {
    const personName = decodeURIComponent(udhCmd.replace('udh_setl_name_', '').trim());
    if (!userStore.udhaars) userStore.udhaars = [];
    let count = 0;
    let settledAmt = 0;
    userStore.udhaars.forEach(u => {
      if (u.status === 'pending' && u.personName.toLowerCase() === personName.toLowerCase()) {
        u.status = 'settled';
        u.settledAt = new Date().toISOString();
        count++;
        settledAmt += u.amount;
      }
    });
    saveUserData(userId, userStore);
    await sendTelegramReply(
      botToken,
      chatId,
      `✅ <b>${personName} Ka Saara Hisab Settle Ho Gaya!</b> 🎉\n━━━━━━━━━━━━━━━━━━━━\n💰 <b>Total Settle:</b> ₹${settledAmt.toLocaleString('en-IN')} (${count} entries)\n\n📊 <i>Ab ${personName} ka pending balance ₹0 hai.</i>`,
      buildUdhaarReportTelegramMessage(userId).replyMarkup
    );
    return;
  }

  // Udhaar WhatsApp Reminder Menu & Generator
  if (udhCmd === 'udh_menu_remind') {
    if (!userStore.udhaars) userStore.udhaars = [];
    const pending = userStore.udhaars.filter(u => u.status === 'pending');

    const personMap: Record<string, { displayName: string; netDue: number; entries: any[] }> = {};
    for (const u of pending) {
      const key = (u.personName || 'Unknown').trim().toLowerCase();
      if (!personMap[key]) {
        personMap[key] = { displayName: u.personName.trim(), netDue: 0, entries: [] };
      }
      personMap[key].netDue += u.type === 'lent' ? u.amount : -u.amount;
      personMap[key].entries.push(u);
    }

    const lenaPeople = Object.values(personMap).filter(p => p.netDue > 0);
    if (lenaPeople.length === 0) {
      await sendTelegramReply(botToken, chatId, '✨ <i>Koi pending udhaar nahi hai jiska reminder bhejna ho (Aapko kisi se lena baaki nahi hai).</i>');
      return;
    }

    const buttons = lenaPeople.slice(0, 8).map(p => ([
      { text: `📲 ${p.displayName} (₹${p.netDue.toLocaleString('en-IN')})`, callback_data: `udh_remind_name_${encodeURIComponent(p.displayName)}` }
    ]));
    buttons.push([{ text: '🔙 Back to Khata', callback_data: 'cmd_udhaar' }]);

    await sendTelegramReply(
      botToken,
      chatId,
      `📲 <b>WHATSAPP REMINDER BHEJEIN:</b>\n━━━━━━━━━━━━━━━━━━━━\nKisko reminder bhejna hai, unka naam chunein:\n\n<i>Ye WhatsApp par direct date-wise hisab ke sath formatted reminder message banayega.</i>`,
      { inline_keyboard: buttons }
    );
    return;
  }

  if (udhCmd.startsWith('udh_remind_name_')) {
    const personName = decodeURIComponent(udhCmd.replace('udh_remind_name_', '').trim());
    if (!userStore.udhaars) userStore.udhaars = [];
    const entries = userStore.udhaars.filter(
      u => u.status === 'pending' && u.personName.toLowerCase() === personName.toLowerCase()
    );

    if (entries.length === 0) {
      await sendTelegramReply(botToken, chatId, `❌ <b>${personName}</b> ka koi pending udhaar nahi mila.`);
      return;
    }

    const { messageText, url, totalDue } = buildWhatsAppReminderText(personName, entries);

    const replyMsg = `📲 <b>WHATSAPP REMINDER TAIYAAR HAI:</b>\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>Naam:</b> <b>${personName}</b>\n💰 <b>Kul Bakaya:</b> <b>₹${Math.abs(totalDue).toLocaleString('en-IN')}</b>\n\n📝 <b>Message Preview:</b>\n<i>${messageText}</i>\n\n👇 Neeche diye gaye button par click karke direct WhatsApp par send karein:`;

    await sendTelegramReply(
      botToken,
      chatId,
      replyMsg,
      {
        inline_keyboard: [
          [{ text: '💬 WhatsApp Par Bhejein', url }],
          [{ text: '🔙 Back to Khata', callback_data: 'cmd_udhaar' }],
        ],
      }
    );
    return;
  }

  // Natural reminder command: "remind Jiju", "/remind Jiju", "whatsapp Jiju", "jiju ko remind karo"
  const remindMatch = lowerText.match(/^(?:\/remind|remind|whatsapp)\s+([a-zA-Z0-9_\u0900-\u097F\s]+)$/i) ||
                      lowerText.match(/^([a-zA-Z0-9_\u0900-\u097F\s]+)\s+ko\s+remind(?:\s+karo)?$/i);
  if (remindMatch && !lowerText.includes('budget') && !lowerText.includes('category')) {
    const targetName = remindMatch[1].trim();
    if (!userStore.udhaars) userStore.udhaars = [];
    const entries = userStore.udhaars.filter(
      u => u.status === 'pending' && u.personName.toLowerCase().includes(targetName.toLowerCase())
    );

    if (entries.length > 0) {
      const actualName = entries[0].personName;
      const { messageText, url, totalDue } = buildWhatsAppReminderText(actualName, entries);
      const replyMsg = `📲 <b>WHATSAPP REMINDER TAIYAAR HAI:</b>\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>Naam:</b> <b>${actualName}</b>\n💰 <b>Kul Bakaya:</b> <b>₹${Math.abs(totalDue).toLocaleString('en-IN')}</b>\n\n📝 <b>Message Preview:</b>\n<i>${messageText}</i>\n\n👇 Neeche button par click karke direct WhatsApp par bhejein:`;

      await sendTelegramReply(
        botToken,
        chatId,
        replyMsg,
        {
          inline_keyboard: [
            [{ text: '💬 WhatsApp Par Bhejein', url }],
            [{ text: '🔙 Back to Khata', callback_data: 'cmd_udhaar' }],
          ],
        }
      );
      return;
    }
  }

  // Udhaar Date Change Command Parser (e.g. "date change Jiju 14th Sep", "/udhardate Jiju 14 Sep", "jiju ki date 14 sep karo")
  const dateChangeParsed = parseUdhaarDateChangeCommand(rawText);
  if (dateChangeParsed.isDateChangeCommand) {
    if (!userStore.udhaars) userStore.udhaars = [];
    const target = (dateChangeParsed.target || '').toLowerCase().trim();
    const newDate = dateChangeParsed.parsedDate;

    if (!target && !newDate) {
      // Guide & show recent entries
      const pending = userStore.udhaars.filter(u => u.status === 'pending');
      const buttons = pending.slice(0, 6).map(u => ([
        { text: `📅 ${u.personName}: ₹${u.amount} (${u.date})`, callback_data: `udh_pick_${u.id}` }
      ]));
      buttons.push([{ text: '🔙 Back to Khata', callback_data: 'cmd_udhaar' }]);
      await sendTelegramReply(
        botToken,
        chatId,
        `📅 <b>UDHAAR ENTRY KI DATE BADLEIN:</b>\n━━━━━━━━━━━━━━━━━━━━\n💡 <i>Aap chat me aise likh sakte hain:</i>\n• <code>date change Jiju 14th Sep</code>\n• <code>date change Jiju kal</code>\n• <code>/udhardate Jiju 14 Sep</code>\n\n👇 Ya neeche se entry select karein:`,
        { inline_keyboard: buttons }
      );
      return;
    }

    if (!newDate) {
      await sendTelegramReply(
        botToken,
        chatId,
        `⚠️ <b>Date samajh nahi aayi.</b> Kripya sahi tareeq likhein, jaise:\n• <code>date change ${target || 'Jiju'} 14th Sep</code>\n• <code>date change ${target || 'Jiju'} kal</code>\n• <code>date change ${target || 'Jiju'} 14/09/2026</code>`
      );
      return;
    }

    // Find entry matching person name or ID suffix
    let matchingEntry: UdhaarRecord | undefined;
    if (target) {
      matchingEntry = userStore.udhaars.find(u => 
        u.status === 'pending' && 
        (u.personName.toLowerCase().includes(target) || u.id.toLowerCase().endsWith(target))
      );
      if (!matchingEntry) {
        // Also check any settled entry if no pending matches
        matchingEntry = userStore.udhaars.find(u => 
          u.personName.toLowerCase().includes(target) || u.id.toLowerCase().endsWith(target)
        );
      }
    } else {
      // If no target provided, pick most recent pending entry
      matchingEntry = userStore.udhaars.find(u => u.status === 'pending') || userStore.udhaars[0];
    }

    if (!matchingEntry) {
      await sendTelegramReply(
        botToken,
        chatId,
        `❌ <b>${target ? `"${target}" ke naam se koi entry` : 'Koi udhaar entry'} nahi mili.</b>\n\nApna khata check karne ke liye <code>/udhaar</code> bhejein.`
      );
      return;
    }

    const oldDate = matchingEntry.date;
    matchingEntry.date = newDate;
    saveUserData(userId, userStore);

    // Calculate person's updated combined balance
    const personPending = userStore.udhaars.filter(u => u.status === 'pending' && u.personName.toLowerCase() === matchingEntry!.personName.toLowerCase());
    const personLent = personPending.filter(u => u.type === 'lent').reduce((s, u) => s + (Number(u.amount) || 0), 0);
    const personBorrowed = personPending.filter(u => u.type === 'borrowed').reduce((s, u) => s + (Number(u.amount) || 0), 0);
    const personNet = personLent - personBorrowed;

    await sendTelegramReply(
      botToken,
      chatId,
      `✅ <b>Date Successfully Change Ho Gayi!</b> 🎉
━━━━━━━━━━━━━━━━━━━━
👤 <b>Person:</b> <b>${matchingEntry.personName}</b>
💰 <b>Raqam:</b> ₹${matchingEntry.amount.toLocaleString('en-IN')}
📅 <b>Puraani Date:</b> ${oldDate} ➡️ <b>Nayi Date:</b> <b>${newDate}</b>
━━━━━━━━━━━━━━━━━━━━
👥 <b>${matchingEntry.personName} Ka Combined Hisab:</b>
${personNet > 0 
  ? `🟢 Ab ${matchingEntry.personName} se kul <b>₹${personNet.toLocaleString('en-IN')} LENA HAI</b> (${personPending.length} entries)`
  : personNet < 0
  ? `🔴 Ab ${matchingEntry.personName} ko kul <b>₹${Math.abs(personNet).toLocaleString('en-IN')} DENA HAI</b> (${personPending.length} entries)`
  : `✅ Ab ${matchingEntry.personName} ka hisab barabar hai (₹0)`}`,
      buildUdhaarReportTelegramMessage(userId).replyMarkup
    );
    return;
  }

  // Udhaar Edit / Amount Change Command Parser (e.g. "change udhaar jiju 2500", "edit udhaar jiju 2500", "jiju ka udhaar 2500 badlo")
  const editUdhaarParsed = parseUdhaarEditCommand(rawText);
  if (editUdhaarParsed.isEditCommand) {
    if (!userStore.udhaars) userStore.udhaars = [];
    const target = (editUdhaarParsed.target || '').toLowerCase().trim();
    const newAmount = editUdhaarParsed.newAmount;
    const newDate = editUdhaarParsed.newDate;

    // Find entry matching target or fallback to recent pending entry
    let matchingEntry: UdhaarRecord | undefined;
    if (target) {
      matchingEntry = userStore.udhaars.find(u => 
        u.status === 'pending' && 
        (u.personName.toLowerCase().includes(target) || u.id.toLowerCase().endsWith(target))
      );
      if (!matchingEntry) {
        matchingEntry = userStore.udhaars.find(u => 
          u.personName.toLowerCase().includes(target) || u.id.toLowerCase().endsWith(target)
        );
      }
    } else {
      matchingEntry = userStore.udhaars.find(u => u.status === 'pending') || userStore.udhaars[0];
    }

    if (!matchingEntry) {
      await sendTelegramReply(
        botToken,
        chatId,
        `❌ <b>${target ? `"${target}" ke naam se koi entry` : 'Koi udhaar entry'} nahi mili.</b>\n\n💡 <i>Khata check karne ke liye <code>/udhaar</code> bhejein.</i>`
      );
      return;
    }

    if (!newAmount && !newDate) {
      await sendTelegramReply(
        botToken,
        chatId,
        `💡 <b>Udhaar Kaise Change Karein:</b>\n━━━━━━━━━━━━━━━━━━━━\nChat me aise likhein:\n• <code>change udhaar ${matchingEntry.personName} 2500</code>\n• <code>date change ${matchingEntry.personName} 14 Sep</code>\n• <code>edit udhaar ${matchingEntry.personName} 3000</code>\n\n📌 <b>Current Entry:</b> ${matchingEntry.personName} - ₹${matchingEntry.amount.toLocaleString('en-IN')} (${matchingEntry.date})`
      );
      return;
    }

    const oldAmount = matchingEntry.amount;
    const oldDate = matchingEntry.date;
    if (newAmount && newAmount > 0) {
      matchingEntry.amount = newAmount;
    }
    if (newDate) {
      matchingEntry.date = newDate;
    }
    saveUserData(userId, userStore);

    // Calculate person's updated combined balance
    const personPending = userStore.udhaars.filter(u => u.status === 'pending' && u.personName.toLowerCase() === matchingEntry!.personName.toLowerCase());
    const personLent = personPending.filter(u => u.type === 'lent').reduce((s, u) => s + (Number(u.amount) || 0), 0);
    const personBorrowed = personPending.filter(u => u.type === 'borrowed').reduce((s, u) => s + (Number(u.amount) || 0), 0);
    const personNet = personLent - personBorrowed;

    await sendTelegramReply(
      botToken,
      chatId,
      `✅ <b>Udhaar Entry Successfully Update Ho Gayi!</b> 🎉
━━━━━━━━━━━━━━━━━━━━
👤 <b>Person:</b> <b>${matchingEntry.personName}</b>
💰 <b>Raqam:</b> ${newAmount ? `₹${oldAmount.toLocaleString('en-IN')} ➡️ <b>₹${matchingEntry.amount.toLocaleString('en-IN')}</b>` : `₹${matchingEntry.amount.toLocaleString('en-IN')}`}
📅 <b>Date:</b> ${newDate ? `${oldDate} ➡️ <b>${matchingEntry.date}</b>` : matchingEntry.date}
━━━━━━━━━━━━━━━━━━━━
👥 <b>${matchingEntry.personName} Ka Naya Combined Hisab:</b>
${personNet > 0 
  ? `🟢 Ab ${matchingEntry.personName} se kul <b>₹${personNet.toLocaleString('en-IN')} LENA HAI</b> (${personPending.length} entries)`
  : personNet < 0
  ? `🔴 Ab ${matchingEntry.personName} ko kul <b>₹${Math.abs(personNet).toLocaleString('en-IN')} DENA HAI</b> (${personPending.length} entries)`
  : `✅ Ab ${matchingEntry.personName} ka hisab barabar hai (₹0)`}`,
      buildUdhaarReportTelegramMessage(userId).replyMarkup
    );
    return;
  }

  // Udhaar settlement match (e.g. "rohan settle", "settle rohan", "rohan ne wapas diye", "/settle rohan")
  const settleMatch = lowerText.match(/^(?:\/settle|settle)\s+([a-zA-Z0-9\s]+)$/i) ||
    lowerText.match(/^([a-zA-Z0-9]+)\s+(?:ne\s+)?(?:wapas\s+diya|wapas\s+diye|settle|chuka\s+diya|clear)$/i);

  if (settleMatch) {
    const person = settleMatch[1].trim().toLowerCase();
    if (!userStore.udhaars) userStore.udhaars = [];
    const foundIdx = userStore.udhaars.findIndex(u => u.status === 'pending' && u.personName.toLowerCase().includes(person));
    if (foundIdx !== -1) {
      const item = userStore.udhaars[foundIdx];
      item.status = 'settled';
      item.settledAt = new Date().toISOString();
      saveUserData(userId, userStore);

      await sendTelegramReply(
        botToken,
        chatId,
        `✅ <b>Udhaar Settle Ho Gaya!</b> 🎉\n\n👤 <b>Person:</b> <b>${item.personName}</b>\n💰 <b>Raqam:</b> ₹${item.amount.toLocaleString('en-IN')}\n🏷️ <b>Type:</b> ${item.type === 'lent' ? 'Maine Diya Tha (Wapas Mil Gaya)' : 'Maine Liya Tha (Chuka Diya)'}\n\n📊 <i>Khata updated!</i>`,
        buildUdhaarReportTelegramMessage(userId).replyMarkup
      );
      return;
    }
  }

  // Udhaar Add Natural Pattern (e.g. "2000 diya Jiju ko 14th Sep", "diya 500 rohan ko", "liya 2000 papa se", "jiju ko 2000 diya 14 sep")
  const parsedUdhaar = parseUdhaarIntentAndData(rawText);
  if (parsedUdhaar) {
    const { type, amount, personName, date, description } = parsedUdhaar;
    const isLent = type === 'lent';

    const newUdhaar: UdhaarRecord = {
      id: `udh_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      userId,
      type,
      personName,
      amount,
      description: description || rawText,
      date,
      time: getAppDateTime().time,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    if (!userStore.udhaars) userStore.udhaars = [];
    userStore.udhaars.unshift(newUdhaar);
    saveUserData(userId, userStore);

    // Calculate person's total combined net balance in the ledger
    const pendingForPerson = userStore.udhaars.filter(u => u.status === 'pending' && u.personName.toLowerCase() === personName.toLowerCase());
    const personLent = pendingForPerson.filter(u => u.type === 'lent').reduce((s, u) => s + (Number(u.amount) || 0), 0);
    const personBorrowed = pendingForPerson.filter(u => u.type === 'borrowed').reduce((s, u) => s + (Number(u.amount) || 0), 0);
    const personNet = personLent - personBorrowed;

    const reply = `🤝 <b>UDHAAR RECORD HO GAYA!</b>
━━━━━━━━━━━━━━━━━━━━
🏷️ <b>Type:</b> ${isLent ? '💸 Maine Diya (Lena Hai)' : '📥 Maine Liya (Dena Hai)'}
👤 <b>Person:</b> <b>${personName}</b>
💰 <b>Raqam:</b> <b>₹${amount.toLocaleString('en-IN')}</b>
📅 <b>Tareeq:</b> <b>${date}</b> • ${newUdhaar.time} (IST)
━━━━━━━━━━━━━━━━━━━━
👥 <b>${personName} Ka Combined Hisab:</b>
${personNet > 0 
  ? `🟢 Ab ${personName} se kul <b>₹${personNet.toLocaleString('en-IN')} LENA HAI</b> (${pendingForPerson.length} ${pendingForPerson.length === 1 ? 'entry' : 'entries'})`
  : personNet < 0
  ? `🔴 Ab ${personName} ko kul <b>₹${Math.abs(personNet).toLocaleString('en-IN')} DENA HAI</b> (${pendingForPerson.length} ${pendingForPerson.length === 1 ? 'entry' : 'entries'})`
  : `✅ Ab ${personName} ka hisab barabar hai (₹0)`}

💡 <i>Tareeq badalni ho to neeche button dabayein ya likhein:</i>
• <code>date change ${personName} 14 sep</code>`;

    await sendTelegramReply(botToken, chatId, reply, {
      inline_keyboard: [
        [
          { text: '📅 Date Badlein', callback_data: `udh_pick_${newUdhaar.id}` },
          { text: '🤝 Udhaar Summary', callback_data: 'cmd_udhaar' },
        ],
        [
          { text: '✅ Settle', callback_data: `udh_setl_name_${encodeURIComponent(personName)}` },
          { text: '🗑️ Delete', callback_data: `udh_del_${newUdhaar.id}` },
        ],
      ],
    });
    return;
  }

  // 8.9 Fuel & Mileage Tracker Matching & Commands
  const isFuelQuery =
    command === '/fuel' ||
    command === '/mileage' ||
    lowerText === 'fuel' ||
    lowerText === 'mileage' ||
    lowerText === 'fuel log' ||
    lowerText === 'mileage hisab' ||
    lowerText.includes('⛽ fuel tracker');

  if (isFuelQuery) {
    const report = buildFuelReportTelegramMessage(userId);
    await sendTelegramReply(botToken, chatId, report.text, report.replyMarkup);
    return;
  }

  // Fuel + Odometer log (e.g. "2000 petrol odo 45200" or "petrol 500 odo 12340 bike" or "odo 45200 petrol 2000")
  const hasOdo = lowerText.includes('odo') || lowerText.includes('odometer') || lowerText.includes('km reading');
  const hasFuelKeyword = lowerText.includes('petrol') || lowerText.includes('diesel') || lowerText.includes('cng') || lowerText.includes('fuel');

  if (hasOdo && hasFuelKeyword) {
    const odoMatch = lowerText.match(/(?:odo|odometer|reading)\s*[:=]?\s*(\d{3,7})/i) ||
      lowerText.match(/(\d{3,7})\s*(?:odo|odometer|km)/i);
    
    const fuelAmtMatch = lowerText.match(/(?:petrol|diesel|cng|fuel)\s*[:=]?\s*(?:rs|rupaye|₹)?\s*(\d+(?:\.\d+)?)/i) ||
      lowerText.match(/(\d+(?:\.\d+)?)\s*(?:rs|rupaye|₹)?\s*(?:ka\s+)?(?:petrol|diesel|cng|fuel)/i);

    if (odoMatch && fuelAmtMatch) {
      const odo = parseInt(odoMatch[1], 10);
      const fuelAmount = parseFloat(fuelAmtMatch[1]);
      let vehicleName = 'Bike';
      if (lowerText.includes('car') || lowerText.includes('swift') || lowerText.includes('creta') || lowerText.includes('i20')) vehicleName = 'Car';
      else if (lowerText.includes('activa') || lowerText.includes('scooty') || lowerText.includes('jupiter')) vehicleName = 'Activa';
      else if (lowerText.includes('bike') || lowerText.includes('bullet') || lowerText.includes('splendor') || lowerText.includes('pulsar')) vehicleName = 'Bike';

      if (odo > 0 && fuelAmount > 0) {
        if (!userStore.fuelLogs) userStore.fuelLogs = [];
        const sortedPast = [...userStore.fuelLogs].sort((a, b) => b.odometer - a.odometer);
        const prevLog = sortedPast.find(l => l.odometer < odo && (!vehicleName || l.vehicleName?.toLowerCase() === vehicleName.toLowerCase())) || sortedPast[0];

        let distanceCovered: number | undefined;
        let calculatedMileage: number | undefined;
        let costPerKm: number | undefined;

        if (prevLog && odo > prevLog.odometer) {
          distanceCovered = odo - prevLog.odometer;
          const approxLiters = fuelAmount / 100; // ~₹100/L average in India
          if (approxLiters > 0) {
            calculatedMileage = Math.round((distanceCovered / approxLiters) * 10) / 10;
          }
          costPerKm = Math.round((fuelAmount / distanceCovered) * 100) / 100;
        }

        const newLog: FuelLog = {
          id: `fuel_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          userId,
          date: getAppDateTime().date,
          time: getAppDateTime().time,
          vehicleName,
          fuelAmount,
          odometer: odo,
          previousOdometer: prevLog ? prevLog.odometer : undefined,
          distanceCovered,
          calculatedMileage,
          costPerKm,
          notes: rawText,
          createdAt: new Date().toISOString(),
        };

        userStore.fuelLogs.unshift(newLog);

        // Record as expense transaction
        const fuelTx: Transaction = {
          id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          userId,
          type: 'expense',
          amount: fuelAmount,
          category: 'Transportation & Fuel',
          description: `${vehicleName} Fuel (Odo: ${odo} km)`,
          date: newLog.date,
          time: newLog.time,
          paymentMethod: 'UPI',
          source: 'telegram',
          telegramChatId: chatId,
          telegramMessageId: messageObj.message_id,
          telegramUser: senderDisplayName,
          createdAt: newLog.createdAt,
          tags: ['fuel', vehicleName.toLowerCase()],
        };
        userTransactions.unshift(fuelTx);

        saveUserData(userId, userStore);
        const summary = calculateUserSummary(userId);

        let fuelReply = `⛽ <b>FUEL & MILEAGE LOG RECORDED!</b>
━━━━━━━━━━━━━━━━━━━━
🚗 <b>Vehicle:</b> <b>${vehicleName}</b>
💰 <b>Fuel Amount:</b> <b>₹${fuelAmount.toLocaleString('en-IN')}</b>
📍 <b>Current Odometer:</b> <b>${odo.toLocaleString('en-IN')} km</b>
`;

        if (distanceCovered) {
          fuelReply += `\n📈 <b>Pichhle fuel up se chali:</b> <b>${distanceCovered} km</b>\n`;
          if (calculatedMileage) fuelReply += `⚡ <b>Estimated Mileage:</b> <b>~${calculatedMileage} km/l</b>\n`;
          if (costPerKm) fuelReply += `💸 <b>Running Cost:</b> <b>₹${costPerKm} / km</b>\n`;
        } else {
          fuelReply += `\n💡 <i>Pehli fuel entry! Agli baar fuel bharne par bot exact mileage aur per-km cost nikalega.</i>\n`;
        }

        fuelReply += `━━━━━━━━━━━━━━━━━━━━\n📊 <b>Net Balance:</b> ${isSenderOwner ? `₹${summary.netSavings.toLocaleString('en-IN')}` : `🔒 Masked (Owner Protected)`}`;

        await sendTelegramReply(botToken, chatId, fuelReply, {
          inline_keyboard: [
            [{ text: '⛽ Mileage Summary', callback_data: 'cmd_fuel' }, { text: '💰 Balance', callback_data: 'cmd_balance' }],
            [{ text: '📊 Summary', callback_data: 'cmd_summary' }, { text: '🤖 AI Tips', callback_data: 'cmd_tips' }],
          ],
        });
        return;
      }
    }
  }

  // 9. AI & Fallback Transaction Parser
  try {
    const parsedList = await parseMessageWithGemini(rawText, userCategories);

    if (parsedList.length === 0) {
      const errorReply = `❓ <i>"${rawText}"</i> me se koi kharcha ya income samajh nahi aayi.\n\n💡 <b>Aise try karein:</b>\n• <code>300 dahi cash</code>\n• <code>500 petrol upi</code>\n• <code>salary 25000 bank transfer</code>\n• <code>100 sabzi nagad</code>\n\nNeeche handy buttons se direct commands try karein:`;
      await sendTelegramReply(botToken, chatId, errorReply, INLINE_KB_MAIN_COMMANDS);
      return;
    }

    const msgTimeInfo = getAppDateTime(messageObj.date ? messageObj.date * 1000 : Date.now());

    // 🛡️ Duplicate Transaction Blocker / Double Charge Alert Check
    let detectedDuplicateTx: { existing: Transaction; minutesAgo: number } | null = null;
    if (parsedList.length === 1) {
      const p = parsedList[0];
      const nowMs = Date.now();
      for (const ex of userTransactions.slice(0, 25)) {
        if (ex.type === p.type && Math.abs(ex.amount - p.amount) < 0.01) {
          const pDesc = (p.description || '').toLowerCase().trim();
          const exDesc = (ex.description || '').toLowerCase().trim();
          const isDescMatch =
            pDesc === exDesc ||
            (pDesc.length >= 3 && exDesc.length >= 3 && (pDesc.includes(exDesc) || exDesc.includes(pDesc)));
          const isCatMatch =
            p.category && ex.category && p.category.toLowerCase() === ex.category.toLowerCase() && p.category !== 'Uncategorized';

          let minutesAgo = 0;
          if (ex.createdAt) {
            minutesAgo = Math.round((nowMs - new Date(ex.createdAt).getTime()) / (60 * 1000));
          }

          if (
            (minutesAgo >= 0 && minutesAgo <= 30 && (isDescMatch || isCatMatch)) ||
            (ex.date === (p.date || msgTimeInfo.date) && isDescMatch && minutesAgo <= 90)
          ) {
            detectedDuplicateTx = { existing: ex, minutesAgo: Math.max(1, minutesAgo) };
            break;
          }
        }
      }
    }

    for (const parsed of parsedList) {
      const finalTime = (parsed.time && /^\d{2}:\d{2}$/.test(parsed.time)) ? parsed.time : msgTimeInfo.time;
      const finalDate = (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) ? parsed.date : msgTimeInfo.date;
      const itemRaw = parsedList.length > 1 ? `${parsed.amount} ${parsed.description}` : rawText;

      const cleanedDesc = cleanTransactionDescription(parsed.description, parsed.category);

      const newTx: Transaction = {
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        userId,
        type: parsed.type,
        amount: parsed.amount,
        category: parsed.category,
        description: cleanedDesc,
        date: finalDate,
        time: finalTime,
        paymentMethod: parsed.paymentMethod,
        account: parsed.account || detectAccountFromText(itemRaw) || 'ICICI CC 0000',
        isReimbursement: Boolean(parsed.isReimbursement),
        reimbursementStatus: parsed.isReimbursement ? 'pending' : undefined,
        isSavingsTransfer: Boolean(parsed.isSavingsTransfer),
        isInvestment: Boolean(parsed.isInvestment),
        source: 'telegram',
        telegramChatId: chatId,
        telegramMessageId: messageObj.message_id,
        telegramUser: senderDisplayName,
        rawMessage: itemRaw,
        createdAt: msgTimeInfo.iso,
        tags: parsed.tags || [],
      };
      userTransactions.unshift(newTx);
    }

    saveUserData(userId, userStore);
    const summary = calculateUserSummary(userId);

    let replyText = '';
    const hasMultipleMembers = (targetUser.linkedMembers?.length || 0) > 1;
    const memberTag = hasMultipleMembers ? `\n👤 <b>Dala gaya:</b> ${senderDisplayName}` : '';

    if (parsedList.length === 1) {
      const item = parsedList[0];
      const isInc = item.type === 'income';
      const isUncat = item.category === 'Uncategorized';
      const itemTime = (item.time && /^\d{2}:\d{2}$/.test(item.time)) ? item.time : msgTimeInfo.time;
      const itemDate = (item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date)) ? item.date : msgTimeInfo.date;

      const paymentLabel = item.paymentMethod === 'UPI/Cash'
        ? '<b>UPI/Cash</b> <i>(Mode baad me assign kar sakte hain)</i>'
        : (item.paymentMethod || 'UPI/Cash');

      if (isSenderOwner) {
        replyText = `${isInc ? '🟢 <b>INCOME ADD HO GAYI</b>' : '🔴 <b>KHARCHA RECORD HO GAYA</b>'}
💰 <b>₹${item.amount.toLocaleString('en-IN')}</b>
📁 <b>Category:</b> ${item.category}${isUncat ? ' <i>(Web par Category assign karein)</i>' : ''}
📝 <b>Vivaran:</b> ${item.description}${memberTag}
💳 <b>Payment:</b> ${paymentLabel}
📅 <b>Tareeq va Samay:</b> ${itemDate} • ${itemTime} (IST)

━━━━━━━━━━━━━━━━━━━━
💵 <b>Net Wallet/Bank Balance:</b> ₹${(summary.totalNetSavings || summary.netSavings).toLocaleString('en-IN')}
📦 <i>(Pichla Carry: ₹${(summary.openingCarryforward || 0).toLocaleString('en-IN')} + Is Mahine: ₹${(summary.currentMonthNetSavings || 0).toLocaleString('en-IN')})</i>
🎯 <b>Monthly Budget Bacha:</b> ₹${Math.max(0, summary.monthlyBudget - summary.monthlySpent).toLocaleString('en-IN')}
${isInc ? `🟢 <b>Is Mahine Ki Income:</b> ₹${(summary.currentMonthIncome || 0).toLocaleString('en-IN')}` : `🔴 <b>Is Mahine Ka Kharcha:</b> ₹${(summary.currentMonthPersonalExpense || 0).toLocaleString('en-IN')}`}`;
      } else {
        const newMemberSpent = memberMonthSpent + (item.type === 'expense' ? item.amount : 0);
        replyText = `${isInc ? '🟢 <b>INCOME ADD HO GAYI</b>' : '🔴 <b>KHARCHA RECORD HO GAYA</b>'}
💰 <b>₹${item.amount.toLocaleString('en-IN')}</b>
📁 <b>Category:</b> ${item.category}${isUncat ? ' <i>(Web par Category assign karein)</i>' : ''}
📝 <b>Vivaran:</b> ${item.description}${memberTag}
💳 <b>Payment:</b> ${paymentLabel}
📅 <b>Tareeq va Samay:</b> ${itemDate} • ${itemTime} (IST)

━━━━━━━━━━━━━━━━━━━━
👤 <b>Aapka Is Mahine Ka Kharcha:</b> <b>₹${newMemberSpent.toLocaleString('en-IN')}</b>
💵 <b>Net Family Balance:</b> 🔒 Masked (Owner Protected)
🎯 <b>Monthly Budget Bacha:</b> 🔒 Masked (Owner Protected)
🔒 <i>(Family Privacy Mode: Account balance & overall savings protected)</i>`;
      }
    } else {
      const itemsList = parsedList
        .map(p => {
          const tTime = (p.time && /^\d{2}:\d{2}$/.test(p.time)) ? p.time : msgTimeInfo.time;
          return `• ${p.type === 'income' ? '🟢 +' : '🔴 -'}₹${p.amount.toLocaleString('en-IN')} ${p.description} (${p.category}) [${p.paymentMethod || 'UPI/Cash'}] <i>(${tTime})</i>`;
        })
        .join('\n');

      if (isSenderOwner) {
        replyText = `✅ <b>${parsedList.length} TRANSACTIONS ADD HO GAYE</b>${memberTag}\n\n${itemsList}\n\n━━━━━━━━━━━━━━━━━━━━\n💵 <b>Net Wallet/Bank Balance:</b> ₹${(summary.totalNetSavings || summary.netSavings).toLocaleString('en-IN')}\n📦 <i>(Pichla Carry: ₹${(summary.openingCarryforward || 0).toLocaleString('en-IN')} + Is Mahine: ₹${(summary.currentMonthNetSavings || 0).toLocaleString('en-IN')})</i>\n🎯 <b>Monthly Budget Bacha:</b> ₹${Math.max(0, summary.monthlyBudget - summary.monthlySpent).toLocaleString('en-IN')}`;
      } else {
        replyText = `✅ <b>${parsedList.length} TRANSACTIONS ADD HO GAYE</b>${memberTag}\n\n${itemsList}\n\n━━━━━━━━━━━━━━━━━━━━\n💵 <b>Net Family Balance:</b> 🔒 Masked (Owner Protected)\n🎯 <b>Monthly Budget Bacha:</b> 🔒 Masked (Owner Protected)\n🔒 <i>(Family Privacy: Master balance protected)</i>`;
      }
    }

    if (detectedDuplicateTx) {
      replyText += `\n\n🛡️ <b>DOUBLE CHARGE / DUPLICATE WARNING!</b> ⚠️
Aapne <b>${detectedDuplicateTx.minutesAgo} min pehle</b> bhi same <b>₹${detectedDuplicateTx.existing.amount.toLocaleString('en-IN')} (${detectedDuplicateTx.existing.description})</b> record kiya tha!
❓ <i>Agar ye galti se double entry ho gayi hai, to neeche "Undo Duplicate" button se turant delete karein:</i>`;
    }

    // Smart Budget Alert Check
    const affectedCategories = new Set(parsedList.filter(p => p.type === 'expense').map(p => p.category));
    let budgetAlertText = '';
    for (const catName of affectedCategories) {
      const budgetObj = userStore.budgets.find(b => b.category.toLowerCase() === catName.toLowerCase());
      if (budgetObj && budgetObj.limit > 0) {
        const currentMonth = getAppDateTime().date.substring(0, 7);
        const totalCatSpent = userTransactions
          .filter(t => t.type === 'expense' && t.category.toLowerCase() === catName.toLowerCase() && t.date.startsWith(currentMonth))
          .reduce((s, t) => s + t.amount, 0);
        const pct = Math.round((totalCatSpent / budgetObj.limit) * 100);

        if (pct >= 100) {
          budgetAlertText += `\n\n🚨 <b>BUDGET EXCEEDED ALERT!</b>\n<b>${catName}</b> ka budget <b>${pct}%</b> cross ho gaya hai (₹${totalCatSpent.toLocaleString('en-IN')} / ₹${budgetObj.limit.toLocaleString('en-IN')})!`;
        } else if (pct >= 80) {
          budgetAlertText += `\n\n⚠️ <b>SMART BUDGET WARNING!</b>\n<b>${catName}</b> ka <b>${pct}%</b> budget khatam ho chuka hai (₹${totalCatSpent.toLocaleString('en-IN')} / ₹${budgetObj.limit.toLocaleString('en-IN')}). Dhyan se kharch karein!`;
        }
      }
    }
    if (budgetAlertText) {
      replyText += budgetAlertText;
    }

    const inlineButtons = detectedDuplicateTx
      ? [
          [
            { text: '🗑️ Undo Duplicate (#1)', callback_data: 'cmd_undo' },
            { text: '✅ Keep Both', callback_data: 'cmd_balance' },
          ],
          [
            { text: '💰 Balance', callback_data: 'cmd_balance' },
            { text: '📊 Summary', callback_data: 'cmd_summary' },
          ],
          [
            { text: '📈 MoM Compare', callback_data: 'cmd_compare' },
            { text: '🔍 Search', callback_data: 'cmd_search' },
          ],
        ]
      : [
          [
            { text: '💰 Check Balance', callback_data: 'cmd_balance' },
            { text: '📊 Summary', callback_data: 'cmd_summary' },
          ],
          [
            { text: '🤖 AI Faltu Kharcha', callback_data: 'cmd_tips' },
            { text: '↩️ Undo / Delete', callback_data: 'cmd_undo' },
          ],
        ];

    await sendTelegramReply(botToken, chatId, replyText, {
      inline_keyboard: inlineButtons,
    });

    // Save log
    const logEntry: TelegramLog = {
      id: 'log_' + Date.now(),
      userId,
      timestamp: msgTimeInfo.iso,
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
let hasRegisteredBotCommands = false;

async function startTelegramPollingWorker() {
  if (isPollingActive) return;
  isPollingActive = true;

  console.log('🤖 Starting Telegram Direct Long Polling Engine with Handy Buttons & Commands...');

  while (isPollingActive) {
    const token = process.env.TELEGRAM_BOT_TOKEN || botConfig.botToken;
    if (!token) {
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }

    if (!hasRegisteredBotCommands) {
      hasRegisteredBotCommands = true;
      syncTelegramBotCommandsAndMenu(token).catch(e => console.error('Auto sync commands error:', e));
    }

    try {
      const pollUrl = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=20&allowed_updates=["message","edited_message","callback_query"]`;
      const response = await safeTelegramFetch(pollUrl, {}, 25000);

      if (!response) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      if (response.status === 409) {
        // Webhook is active and receiving updates directly - stop polling loop permanently to save 100% bandwidth!
        console.log('✅ Webhook is active on Telegram. Stopping background polling loop permanently.');
        isPollingActive = false;
        break;
      }

      if (!response.ok) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      const data = await response.json().catch(() => null);
      if (data && data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          if (update.update_id > lastUpdateId) {
            lastUpdateId = update.update_id;
          }
          if (update.message) {
            await handleTelegramMessage(update.message);
          } else if (update.callback_query) {
            await handleTelegramCallbackQuery(update.callback_query);
          }
        }
      }
    } catch {
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
  if (isPollingActive) {
    isPollingActive = false;
    console.log('⚡ Webhook update received! Polling permanently disabled.');
  }
  try {
    const update = req.body;
    if (update && update.message) {
      await handleTelegramMessage(update.message);
    } else if (update && update.callback_query) {
      await handleTelegramCallbackQuery(update.callback_query);
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
  saveUsers(users);
  getUserData(newUser.id);

  const token = Buffer.from(JSON.stringify({ userId: newUser.id, email: newUser.email, t: Date.now() })).toString('base64');
  res.json({ success: true, user: toSafeUser(newUser), token });
});

app.post('/api/auth/login', (req, res) => {
  users = loadJson<UserProfile[]>(USERS_FILE, users);
  const { email, userId, identifier, password, memberId } = req.body;
  const sInput = String(identifier || email || userId || '').trim();
  const sPassword = String(password || '').trim();

  if (!sInput) {
    return res.status(400).json({ error: 'Email, Telegram ID, or Member Name is required.' });
  }

  const cleanInput = sInput.toLowerCase().replace(/^@/, '');

  // 1. First check if it matches an Owner account directly
  let ownerUser = users.find(u => 
    (u.email && u.email.toLowerCase() === cleanInput) ||
    (u.id && u.id.toLowerCase() === cleanInput) ||
    (u.telegramChatId && String(u.telegramChatId).trim() === sInput) ||
    (u.telegramUsername && u.telegramUsername.toLowerCase().replace(/^@/, '') === cleanInput) ||
    (u.linkCode && u.linkCode.toLowerCase() === cleanInput)
  );

  if (ownerUser) {
    // Verify master password if set
    if (ownerUser.password) {
      if (!sPassword) {
        return res.status(400).json({ error: 'Owner Security Password or PIN is required to unlock master view.' });
      }
      if (ownerUser.password !== sPassword) {
        return res.status(401).json({ error: 'Incorrect Master password or PIN. Access denied.' });
      }
    } else if (sPassword && sPassword.length >= 4) {
      ownerUser.password = sPassword;
      saveUsers(users);
    }

    const token = Buffer.from(JSON.stringify({ userId: ownerUser.id, email: ownerUser.email, role: 'owner', t: Date.now() })).toString('base64');
    return res.json({ 
      success: true, 
      user: toSafeUser(ownerUser), 
      token,
      role: 'owner',
      isOwner: true,
      memberName: ownerUser.name
    });
  }

  // 2. Check if it matches a Linked Family Member in any ledger
  let matchedMasterUser: UserProfile | undefined;
  let matchedMember: LinkedMember | undefined;

  for (const u of users) {
    if (u.linkedMembers && u.linkedMembers.length > 0) {
      const found = u.linkedMembers.find(m => 
        (memberId && m.id === memberId) ||
        (m.id && m.id.toLowerCase() === cleanInput) ||
        (m.telegramChatId && String(m.telegramChatId).trim() === sInput) ||
        (m.telegramUsername && m.telegramUsername.toLowerCase().replace(/^@/, '') === cleanInput) ||
        (m.name && m.name.toLowerCase() === cleanInput) ||
        (m.customAlias && m.customAlias.toLowerCase() === cleanInput)
      );
      if (found) {
        matchedMasterUser = u;
        matchedMember = found;
        break;
      }
    }
  }

  if (matchedMasterUser && matchedMember) {
    const isOwnerRole = matchedMember.role === 'owner';
    const role: UserRole = isOwnerRole ? 'owner' : 'family';
    const memberDisplayName = matchedMember.customAlias || matchedMember.name;

    const token = Buffer.from(JSON.stringify({ 
      userId: matchedMasterUser.id, 
      email: matchedMasterUser.email, 
      memberId: matchedMember.id,
      memberName: memberDisplayName,
      role, 
      t: Date.now() 
    })).toString('base64');

    return res.json({
      success: true,
      user: toSafeUser(matchedMasterUser),
      token,
      role,
      isOwner: isOwnerRole,
      memberName: memberDisplayName,
      memberId: matchedMember.id,
      telegramChatId: matchedMember.telegramChatId
    });
  }

  return res.status(404).json({ 
    error: `Koi khata ya member nahi mila "${sInput}" ke saath. Kripya apna sahi Email ya Telegram ID/Username enter karein.` 
  });
});

app.post('/api/auth/family-login', (req, res) => {
  users = loadJson<UserProfile[]>(USERS_FILE, users);
  const { memberId, masterUserId, telegramChatId, memberName } = req.body;

  let targetMaster = masterUserId ? users.find(u => u.id === masterUserId) : users[0];
  if (!targetMaster && users.length > 0) targetMaster = users[0];

  if (!targetMaster) {
    return res.status(404).json({ error: 'No ledger found' });
  }

  let foundMember: LinkedMember | undefined;
  if (targetMaster.linkedMembers) {
    foundMember = targetMaster.linkedMembers.find(m => 
      (memberId && m.id === memberId) ||
      (telegramChatId && String(m.telegramChatId).trim() === String(telegramChatId).trim()) ||
      (memberName && (m.name.toLowerCase() === String(memberName).toLowerCase() || (m.customAlias && m.customAlias.toLowerCase() === String(memberName).toLowerCase())))
    );
  }

  const memberDisplayName = foundMember ? (foundMember.customAlias || foundMember.name) : (memberName || 'Family Member');
  const isOwnerRole = foundMember?.role === 'owner';
  const role: UserRole = isOwnerRole ? 'owner' : 'family';

  const token = Buffer.from(JSON.stringify({ 
    userId: targetMaster.id, 
    email: targetMaster.email, 
    memberId: foundMember?.id || 'family_guest',
    memberName: memberDisplayName,
    role, 
    t: Date.now() 
  })).toString('base64');

  res.json({
    success: true,
    user: toSafeUser(targetMaster),
    token,
    role,
    isOwner: isOwnerRole,
    memberName: memberDisplayName,
    memberId: foundMember?.id,
    telegramChatId: foundMember?.telegramChatId
  });
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
  saveUsers(users);

  res.json({ success: true, message: 'Security password updated successfully!', user: toSafeUser(user) });
});

// Permanent Account Deletion Endpoint
app.post(['/api/auth/delete-account', '/api/users/delete'], async (req, res) => {
  users = loadJson<UserProfile[]>(USERS_FILE, users);
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in first.' });
  }

  const { password, confirmText } = req.body || {};
  const targetId = user.id;

  // Verify password if user has one configured
  if (user.password) {
    const sPassword = String(password || '').trim();
    if (!sPassword) {
      return res.status(400).json({ error: 'Account password is required to confirm deletion.' });
    }
    if (user.password !== sPassword) {
      return res.status(401).json({ error: 'Incorrect password. Account deletion failed.' });
    }
  } else {
    // If no password set, verify confirmation keyword
    if (confirmText !== 'DELETE' && confirmText !== 'delete') {
      return res.status(400).json({ error: 'Please type DELETE to confirm.' });
    }
  }

  // 1. Remove user from users array
  users = users.filter(u => u.id !== targetId);

  // If no users left, create a clean initial user
  if (users.length === 0) {
    users.push({
      id: `user_${Date.now()}`,
      name: 'Default User',
      email: 'user@teleexpense.ai',
      linkedMembers: [],
      linkCode: generateLinkCode(),
      createdAt: new Date().toISOString(),
    });
  }
  saveJson(USERS_FILE, users);

  // 2. Remove user data file
  try {
    const filePath = getUserDataFilePath(targetId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Error deleting user file:', err);
  }
  userDataCache.delete(targetId);

  // 3. Remove chat mappings in chatActiveAccounts
  try {
    for (const [chatId, mappedUserId] of Object.entries(chatActiveAccounts)) {
      if (mappedUserId === targetId) {
        delete chatActiveAccounts[chatId];
      }
    }
    saveActiveAccounts(chatActiveAccounts);
  } catch (err) {
    console.error('Error cleaning chat mappings:', err);
  }

  // 4. Optionally notify telegram chat if linked
  if (user.telegramChatId) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || botConfig.botToken;
    if (botToken) {
      sendTelegramReply(
        botToken,
        user.telegramChatId,
        `⚠️ <b>Khata Delete Ho Gaya Hai</b>\n\nAapka TeleExpense Web khata <b>${user.name}</b> aur iske sabhi transactions permanently delete kar diye gaye hain.`
      ).catch(() => {});
    }
  }

  res.json({
    success: true,
    message: `Account "${user.name}" permanently deleted successfully.`,
    remainingUsers: users.map(u => toSafeUser(u)),
  });
});

app.delete('/api/auth/account', async (req, res) => {
  users = loadJson<UserProfile[]>(USERS_FILE, users);
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const targetId = user.id;
  users = users.filter(u => u.id !== targetId);
  if (users.length === 0) {
    users.push({
      id: `user_${Date.now()}`,
      name: 'Default User',
      email: 'user@teleexpense.ai',
      linkedMembers: [],
      linkCode: generateLinkCode(),
      createdAt: new Date().toISOString(),
    });
  }
  saveJson(USERS_FILE, users);

  try {
    const filePath = getUserDataFilePath(targetId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Error deleting user file:', err);
  }
  userDataCache.delete(targetId);

  res.json({
    success: true,
    message: `Account permanently deleted.`,
    remainingUsers: users.map(u => toSafeUser(u)),
  });
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
    setActiveAccountForChat(sChatId, user.id);
  }

  if (telegramUsername) {
    user.telegramUsername = String(telegramUsername).replace('@', '').trim();
  }

  saveUsers(users);
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

  saveUsers(users);
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

  saveUsers(users);
  res.json({ success: true, members: user.linkedMembers, user: toSafeUser(user) });
});

app.post('/api/auth/regenerate-linkcode', (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  user.linkCode = generateLinkCode();
  saveUsers(users);
  res.json({ success: true, linkCode: user.linkCode, user: toSafeUser(user) });
});

// Member Request Approval / Rejection Endpoints for Web Dashboard
app.get(['/api/members/pending-requests', '/api/auth/members/pending-requests'], (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ pendingRequests: user.pendingRequests || [] });
});

app.post(['/api/members/approve-request', '/api/auth/members/approve-request'], async (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { requestId } = req.body;
  if (!requestId) {
    return res.status(400).json({ error: 'requestId is required' });
  }

  if (!user.pendingRequests) user.pendingRequests = [];
  const foundReq = user.pendingRequests.find(r => r.id === requestId);
  if (!foundReq) {
    return res.status(404).json({ error: 'Pending request not found' });
  }

  user.pendingRequests = user.pendingRequests.filter(r => r.id !== requestId);
  if (!user.linkedMembers) user.linkedMembers = [];
  if (!user.linkedMembers.some(m => String(m.telegramChatId) === String(foundReq.chatId))) {
    user.linkedMembers.push({
      id: `mem_${foundReq.chatId}`,
      name: foundReq.name,
      customAlias: foundReq.name,
      role: 'family',
      telegramChatId: foundReq.chatId,
      telegramUsername: foundReq.telegramUsername,
      linkedAt: new Date().toISOString(),
    });
  }

  saveUsers(users);
  setActiveAccountForChat(foundReq.chatId, user.id);

  // Notify member on Telegram
  const botToken = process.env.TELEGRAM_BOT_TOKEN || botConfig.botToken;
  if (botToken) {
    sendTelegramReply(
      botToken,
      foundReq.chatId,
      `🎉 <b>Badhaai Ho! Request Approve Ho Gayi!</b>\n\nOwner <b>${user.name}</b> ne Web Dashboard se aapki link request approve kar di hai.\n\n💡 <b>Ab aap is shared ledger me kharcha ya kamai sidhe log kar sakte hain:</b>\n• <code>500 sabzi cash</code>\n• <code>300 petrol upi</code>`
    ).catch(() => {});
  }

  res.json({
    success: true,
    message: `Member ${foundReq.name} approved successfully!`,
    members: user.linkedMembers,
    pendingRequests: user.pendingRequests,
    user: toSafeUser(user),
  });
});

app.post(['/api/members/reject-request', '/api/auth/members/reject-request'], async (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { requestId } = req.body;
  if (!requestId) {
    return res.status(400).json({ error: 'requestId is required' });
  }

  if (!user.pendingRequests) user.pendingRequests = [];
  const foundReq = user.pendingRequests.find(r => r.id === requestId);
  if (!foundReq) {
    return res.status(404).json({ error: 'Pending request not found' });
  }

  user.pendingRequests = user.pendingRequests.filter(r => r.id !== requestId);
  saveUsers(users);

  const botToken = process.env.TELEGRAM_BOT_TOKEN || botConfig.botToken;
  if (botToken) {
    sendTelegramReply(
      botToken,
      foundReq.chatId,
      `❌ <b>Request Rejected.</b>\n\nOwner ne <b>${user.name}</b> ke ledger ke liye aapki link request reject kar di hai.`
    ).catch(() => {});
  }

  res.json({
    success: true,
    message: 'Request rejected',
    pendingRequests: user.pendingRequests,
    user: toSafeUser(user),
  });
});

// Gullak (Unspent Monthly Budget Piggy Bank) API
app.get('/api/gullak', (req, res) => {
  const user = getRequestUser(req);
  const targetUserId = user ? user.id : (users[0]?.id || 'default_user');
  const summary = calculateGullakSummary(targetUserId);
  res.json(summary);
});

// 2. Custom Categories Management APIs
app.get('/api/categories', (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.json({ categories: DEFAULT_CATEGORIES });
  }
  const store = getUserData(user.id);
  syncBudgetsWithCategories(store);
  saveUserData(user.id, store);
  res.json({ categories: store.categories });
});

app.post('/api/categories', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  const { name, type, icon, color, keywords, description, budgetLimit } = req.body;

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

  // If budget limit was provided or category is budgetable, set limit
  if (newCat.type === 'expense' || newCat.type === 'both') {
    const lim = typeof budgetLimit === 'number' ? Math.max(0, budgetLimit) : 0;
    store.budgets.push({
      category: newCat.name,
      limit: lim,
      spent: 0,
      period: 'monthly',
    });
  }

  syncBudgetsWithCategories(store);
  saveUserData(user.id, store);

  res.json({ success: true, category: newCat, categories: store.categories, budgets: store.budgets });
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

  // If category name changed, update all transactions and budgets under it
  if (oldName !== newName) {
    for (const t of store.transactions) {
      if (t.category === oldName) {
        t.category = newName;
      }
    }
    for (const b of store.budgets) {
      if (b.category.toLowerCase() === oldName.toLowerCase()) {
        b.category = newName;
      }
    }
  }

  syncBudgetsWithCategories(store);
  saveUserData(user.id, store);
  res.json({ success: true, category: store.categories[catIdx], categories: store.categories, budgets: store.budgets });
});

app.delete('/api/categories/:id', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  const { id } = req.params;

  const targetCat = store.categories.find(
    c => c.id === id || c.name === id || c.name.toLowerCase() === id.toLowerCase()
  );
  if (!targetCat) {
    return res.status(404).json({ error: 'Category not found' });
  }

  if (targetCat.id === 'uncategorized' || targetCat.name.toLowerCase() === 'uncategorized') {
    return res.status(400).json({ error: 'Cannot delete the fallback Uncategorized category' });
  }

  // Move existing transactions to Uncategorized
  for (const t of store.transactions) {
    if (t.category.toLowerCase() === targetCat.name.toLowerCase() || t.category === targetCat.id) {
      t.category = 'Uncategorized';
    }
  }

  store.categories = store.categories.filter(c => c.id !== targetCat.id && c.name.toLowerCase() !== targetCat.name.toLowerCase());
  store.budgets = store.budgets.filter(b => b.category.toLowerCase() !== targetCat.name.toLowerCase());
  syncBudgetsWithCategories(store);
  saveUserData(user.id, store);

  res.json({ success: true, categories: store.categories, budgets: store.budgets, deletedCategory: targetCat.name });
});

// 2.5 Ultra-Lightweight Sync Engine (saves 99% bandwidth compared to full transactions polling)
// Returns tiny JSON (~35 bytes): { v: 42, txCount: 15, udhaarCount: 2, fuelCount: 3 }
app.get('/api/sync/version', (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.json({ v: 0, txCount: 0, udhaarCount: 0, fuelCount: 0 });
  }
  const store = getUserData(user.id);
  res.json({
    v: store.dataVersion || 1,
    txCount: store.transactions.length,
    udhaarCount: (store.udhaars || []).length,
    fuelCount: (store.fuelLogs || []).length,
  });
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
  const { type, amount, category, description, date, paymentMethod, account, tags, isReimbursement, reimbursementStatus, reimbursementSettledAmount, isSavingsTransfer, isInvestment } = req.body;

  if (!amount || isNaN(Number(amount))) {
    return res.status(400).json({ error: 'Valid amount is required' });
  }

  const isRim = Boolean(isReimbursement || category === 'Reimbursement');
  const nowInfo = getAppDateTime();
  const txAmount = Math.abs(Number(amount));
  const initSettledAmt = Number(reimbursementSettledAmount) || (reimbursementStatus === 'settled' ? txAmount : 0);
  const finalRimStatus = isRim
    ? (reimbursementStatus || (initSettledAmt >= txAmount ? 'settled' : (initSettledAmt > 0 ? 'partial' : 'pending')))
    : undefined;

  const newTx: Transaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    userId: user.id,
    type: type === 'income' ? 'income' : 'expense',
    amount: txAmount,
    category: isRim ? 'Reimbursement' : (category || (type === 'income' ? 'Salary & Employment' : 'Uncategorized')),
    description: (description || 'Manual Entry').trim(),
    date: date || nowInfo.date,
    time: req.body.time || nowInfo.time,
    paymentMethod: paymentMethod || 'UPI',
    account: account || 'ICICI CC 0000',
    source: 'manual',
    createdAt: nowInfo.iso,
    tags: Array.isArray(tags) ? tags : [],
    isReimbursement: isRim,
    reimbursementStatus: finalRimStatus,
    reimbursementSettledAmount: isRim ? initSettledAmt : undefined,
    isSavingsTransfer: Boolean(isSavingsTransfer),
    isInvestment: Boolean(isInvestment),
  };

  store.transactions.unshift(newTx);
  saveUserData(user.id, store);

  const summary = calculateUserSummary(user.id);
  res.json({ success: true, transaction: newTx, summary });
});

// Bulk assign account to transactions
app.post('/api/transactions/bulk-account', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  const { transactionIds, account } = req.body;

  if (!Array.isArray(transactionIds) || !account) {
    return res.status(400).json({ error: 'transactionIds array and account are required' });
  }

  let count = 0;
  for (const t of store.transactions) {
    if (transactionIds.includes(t.id)) {
      t.account = account;
      count++;
    }
  }

  saveUserData(user.id, store);
  res.json({ success: true, count, summary: calculateUserSummary(user.id) });
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
  const { type, amount, category, description, date, paymentMethod, account, tags, isReimbursement, reimbursementStatus, reimbursementSettledAmount, isSavingsTransfer, isInvestment } = req.body;

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
  if (account !== undefined) tx.account = account;
  if (tags) tx.tags = tags;
  if (isReimbursement !== undefined) tx.isReimbursement = Boolean(isReimbursement);
  if (reimbursementStatus !== undefined) tx.reimbursementStatus = reimbursementStatus;
  if (reimbursementSettledAmount !== undefined) tx.reimbursementSettledAmount = Number(reimbursementSettledAmount) || 0;
  if (isSavingsTransfer !== undefined) tx.isSavingsTransfer = Boolean(isSavingsTransfer);
  if (isInvestment !== undefined) tx.isInvestment = Boolean(isInvestment);

  // Auto-sync status if settled amount matches or exceeds
  if (tx.isReimbursement || tx.category === 'Reimbursement') {
    const totalAmt = Number(tx.amount) || 0;
    const settled = Number(tx.reimbursementSettledAmount) || 0;
    if (settled >= totalAmt && totalAmt > 0) {
      tx.reimbursementStatus = 'settled';
      tx.reimbursementSettledAmount = totalAmt;
    } else if (settled > 0 && settled < totalAmt) {
      tx.reimbursementStatus = 'partial';
    }
  }

  saveUserData(user.id, store);
  res.json({ success: true, transaction: tx, summary: calculateUserSummary(user.id) });
});

// Dedicated Reimbursement Settlement Endpoint (supports full or partial settle)
app.post('/api/transactions/:id/settle-reimbursement', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  const { id } = req.params;
  const { settledAmount, isFullSettle, notes } = req.body;

  const tx = store.transactions.find(t => t.id === id);
  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const totalAmt = Number(tx.amount) || 0;
  tx.isReimbursement = true;
  if (!tx.category || tx.category === 'Uncategorized') {
    tx.category = 'Reimbursement';
  }

  if (isFullSettle || Number(settledAmount) >= totalAmt) {
    tx.reimbursementStatus = 'settled';
    tx.reimbursementSettledAmount = totalAmt;
  } else {
    const sAmt = Math.max(0, Number(settledAmount) || 0);
    tx.reimbursementSettledAmount = sAmt;
    if (sAmt === 0) {
      tx.reimbursementStatus = 'pending';
    } else if (sAmt >= totalAmt) {
      tx.reimbursementStatus = 'settled';
      tx.reimbursementSettledAmount = totalAmt;
    } else {
      tx.reimbursementStatus = 'partial';
    }
  }

  if (notes && typeof notes === 'string' && notes.trim()) {
    tx.tags = Array.isArray(tx.tags) ? tx.tags : [];
    if (!tx.tags.includes(notes.trim())) {
      tx.tags.push(notes.trim());
    }
  }

  saveUserData(user.id, store);
  res.json({
    success: true,
    transaction: tx,
    remainingAmount: Math.max(0, totalAmt - (tx.reimbursementSettledAmount || 0)),
    summary: calculateUserSummary(user.id),
  });
});

// Settle All Pending / Partial Reimbursements in 1-Click
app.post('/api/transactions/settle-all-reimbursements', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);

  let settledCount = 0;
  let totalSettledAmount = 0;

  for (const tx of store.transactions) {
    if (tx.isReimbursement || tx.category === 'Reimbursement') {
      if (tx.reimbursementStatus !== 'settled') {
        const amt = Number(tx.amount) || 0;
        const currentSettled = Number(tx.reimbursementSettledAmount) || 0;
        totalSettledAmount += Math.max(0, amt - currentSettled);
        tx.reimbursementStatus = 'settled';
        tx.reimbursementSettledAmount = amt;
        tx.isReimbursement = true;
        settledCount++;
      }
    }
  }

  saveUserData(user.id, store);
  res.json({
    success: true,
    settledCount,
    totalSettledAmount,
    summary: calculateUserSummary(user.id),
    transactions: store.transactions,
  });
});

// ---------------- EMIs, Savings Transfers & Investments Endpoints ----------------
app.get('/api/emis', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  res.json({ emis: store.cardEmis || [] });
});

app.post('/api/emis', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  if (!store.cardEmis) store.cardEmis = [];
  const { cardId, title, monthlyAmount, totalMonths, paidMonths, dueDay, startDate, notes } = req.body;
  const newEmi: CardEmi = {
    id: `emi_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    userId: user.id,
    cardId: cardId || 'SBI CC 5733',
    title: (title || 'Card EMI').trim(),
    monthlyAmount: Math.abs(Number(monthlyAmount)) || 0,
    totalMonths: Number(totalMonths) || 12,
    paidMonths: Number(paidMonths) || 0,
    dueDay: Number(dueDay) || 15,
    startDate: startDate || getAppDateTime().date,
    notes: notes || '',
    createdAt: new Date().toISOString(),
  };
  store.cardEmis.unshift(newEmi);
  saveUserData(user.id, store);
  res.json({ success: true, emi: newEmi, emis: store.cardEmis });
});

app.put('/api/emis/:id', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  if (!store.cardEmis) store.cardEmis = [];
  const emi = store.cardEmis.find(e => e.id === req.params.id);
  if (!emi) return res.status(404).json({ error: 'EMI not found' });
  Object.assign(emi, req.body);
  saveUserData(user.id, store);
  res.json({ success: true, emi, emis: store.cardEmis });
});

app.delete('/api/emis/:id', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  if (!store.cardEmis) store.cardEmis = [];
  store.cardEmis = store.cardEmis.filter(e => e.id !== req.params.id);
  saveUserData(user.id, store);
  res.json({ success: true, emis: store.cardEmis });
});

// ---------------- Account & Wife Balances Endpoints ----------------
app.get('/api/accounts/balances', (req, res) => {
  const user = getRequestUser(req);
  const data = calculateAccountsBalances(user.id);
  res.json(data);
});

app.post('/api/accounts/balances', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  const { accountBaseBalances, wifeBaseBalance, cardCreditLimits } = req.body;
  const nowIso = new Date().toISOString();

  if (accountBaseBalances && typeof accountBaseBalances === 'object') {
    if (!store.accountBaseBalances) store.accountBaseBalances = {};
    if (!store.accountBalanceSetTimestamps) store.accountBalanceSetTimestamps = {};
    for (const [acc, val] of Object.entries(accountBaseBalances)) {
      const num = Number(val);
      if (!isNaN(num)) {
        store.accountBaseBalances[acc] = Math.max(0, num);
        store.accountBalanceSetTimestamps[acc] = nowIso;
      }
    }
  }

  if (cardCreditLimits && typeof cardCreditLimits === 'object') {
    if (!store.cardCreditLimits) store.cardCreditLimits = {};
    for (const [cardId, lim] of Object.entries(cardCreditLimits)) {
      const num = Number(lim);
      if (!isNaN(num) && num > 0) {
        store.cardCreditLimits[cardId] = num;
      }
    }
  }

  if (wifeBaseBalance !== undefined) {
    const num = Number(wifeBaseBalance);
    if (!isNaN(num)) {
      store.wifeBaseBalance = Math.max(0, num);
      store.wifeBalanceSetTimestamp = nowIso;
    }
  }

  saveUserData(user.id, store);
  const updatedData = calculateAccountsBalances(user.id);
  res.json({ success: true, ...updatedData });
});

app.get('/api/savings-transfers', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  res.json({ savingsTransfers: store.savingsTransfers || [] });
});

app.post('/api/savings-transfers', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  if (!store.savingsTransfers) store.savingsTransfers = [];
  const { amount, date, recipient, fromAccount, notes } = req.body;
  const newTransfer: SavingsTransfer = {
    id: `sav_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    userId: user.id,
    amount: Math.abs(Number(amount)) || 0,
    date: date || getAppDateTime().date,
    recipient: (recipient || "Wife's Account").trim(),
    fromAccount: fromAccount || 'AX Bank',
    notes: notes || '',
    createdAt: new Date().toISOString(),
  };
  store.savingsTransfers.unshift(newTransfer);
  saveUserData(user.id, store);
  res.json({ success: true, savingsTransfer: newTransfer, savingsTransfers: store.savingsTransfers, summary: calculateUserSummary(user.id) });
});

app.delete('/api/savings-transfers/:id', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  if (!store.savingsTransfers) store.savingsTransfers = [];
  store.savingsTransfers = store.savingsTransfers.filter(s => s.id !== req.params.id);
  saveUserData(user.id, store);
  res.json({ success: true, savingsTransfers: store.savingsTransfers, summary: calculateUserSummary(user.id) });
});

app.get('/api/investments', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  res.json({ investments: store.investments || [] });
});

app.post('/api/investments', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  if (!store.investments) store.investments = [];
  const { type, name, amount, account, date, maturityDate, interestRate, notes, monthlyAmount, paidInstallments, totalInstallments, currentValue, maturityAmount } = req.body;
  const numAmt = Math.abs(Number(amount)) || Math.abs(Number(monthlyAmount)) || 0;
  const newInv: InvestmentRecord = {
    id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    userId: user.id,
    type: type || 'RD',
    name: (name || 'Investment Plan').trim(),
    amount: numAmt,
    monthlyAmount: monthlyAmount !== undefined ? Number(monthlyAmount) : (type === 'RD' ? numAmt : undefined),
    paidInstallments: paidInstallments !== undefined ? Number(paidInstallments) : undefined,
    totalInstallments: totalInstallments !== undefined ? Number(totalInstallments) : undefined,
    account: account || 'IC Bank',
    date: date || getAppDateTime().date,
    maturityDate: maturityDate || undefined,
    interestRate: Number(interestRate) || undefined,
    currentValue: currentValue !== undefined ? Number(currentValue) : undefined,
    maturityAmount: maturityAmount !== undefined ? Number(maturityAmount) : undefined,
    notes: notes || '',
    createdAt: new Date().toISOString(),
  };
  store.investments.unshift(newInv);
  saveUserData(user.id, store);
  res.json({ success: true, investment: newInv, investments: store.investments, summary: calculateUserSummary(user.id) });
});

app.put('/api/investments/:id', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  if (!store.investments) store.investments = [];
  const idx = store.investments.findIndex(i => i.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Investment not found' });
  }
  const current = store.investments[idx];
  const { type, name, amount, account, date, maturityDate, interestRate, notes, monthlyAmount, paidInstallments, totalInstallments, currentValue, maturityAmount } = req.body;
  const numAmt = amount !== undefined ? Math.abs(Number(amount)) : current.amount;
  store.investments[idx] = {
    ...current,
    type: type || current.type,
    name: name !== undefined ? name.trim() : current.name,
    amount: numAmt,
    monthlyAmount: monthlyAmount !== undefined ? Number(monthlyAmount) : current.monthlyAmount,
    paidInstallments: paidInstallments !== undefined ? Number(paidInstallments) : current.paidInstallments,
    totalInstallments: totalInstallments !== undefined ? Number(totalInstallments) : current.totalInstallments,
    account: account || current.account,
    date: date || current.date,
    maturityDate: maturityDate !== undefined ? maturityDate : current.maturityDate,
    interestRate: interestRate !== undefined ? (interestRate === '' ? undefined : Number(interestRate)) : current.interestRate,
    currentValue: currentValue !== undefined ? Number(currentValue) : current.currentValue,
    maturityAmount: maturityAmount !== undefined ? Number(maturityAmount) : current.maturityAmount,
    notes: notes !== undefined ? notes : current.notes,
  };
  saveUserData(user.id, store);
  res.json({ success: true, investment: store.investments[idx], investments: store.investments, summary: calculateUserSummary(user.id) });
});

app.delete('/api/investments/:id', (req, res) => {
  const user = getRequestUser(req);
  const store = getUserData(user.id);
  if (!store.investments) store.investments = [];
  store.investments = store.investments.filter(i => i.id !== req.params.id);
  saveUserData(user.id, store);
  res.json({ success: true, investments: store.investments });
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

// Auto-category meta helper for Excel imports
export function getAutoCategoryMeta(name: string): { icon: string; color: string; keywords: string[] } {
  const lower = name.toLowerCase();
  const kw = [lower];

  if (/\b(food|dining|dahi|milk|doodh|chai|tea|cafe|restaurant|dinner|lunch|breakfast|swiggy|zomato|khana|sweets|snack|mcdonalds|kfc|pizza|burger)\b/i.test(lower)) {
    return { icon: 'Utensils', color: '#F59E0B', keywords: [...kw, 'dahi', 'swiggy', 'zomato', 'restaurant', 'chai', 'khana', 'food'] };
  }
  if (/\b(grocery|groceries|kirana|sabzi|vegetable|fruit|rashan|supermarket|blinkit|zepto|instamart|dmart|ration)\b/i.test(lower)) {
    return { icon: 'ShoppingCart', color: '#10B981', keywords: [...kw, 'sabzi', 'kirana', 'rashan', 'blinkit', 'zepto', 'vegetables', 'fruits', 'groceries'] };
  }
  if (/\b(petrol|diesel|fuel|cng|travel|transport|commute|auto|cab|uber|ola|rapido|metro|bus|train|flight|parking|toll)\b/i.test(lower)) {
    return { icon: 'Car', color: '#06B6D4', keywords: [...kw, 'petrol', 'diesel', 'fuel', 'auto', 'uber', 'ola', 'metro', 'commute'] };
  }
  if (/\b(bill|electricity|bijli|power|wifi|broadband|recharge|mobile|phone|dth|cylinder|gas|water|utility|utilities)\b/i.test(lower)) {
    return { icon: 'Zap', color: '#8B5CF6', keywords: [...kw, 'bijli', 'recharge', 'wifi', 'bill', 'electricity', 'gas', 'utilities'] };
  }
  if (/\b(shopping|cloth|clothes|dress|jeans|shirt|shoes|amazon|flipkart|myntra|meesho|zara|mall)\b/i.test(lower)) {
    return { icon: 'ShoppingBag', color: '#EC4899', keywords: [...kw, 'amazon', 'flipkart', 'myntra', 'clothes', 'jeans', 'shopping'] };
  }
  if (/\b(rent|kiraya|makan|housing|flat|room|society|maintenance|maid|cook)\b/i.test(lower)) {
    return { icon: 'Home', color: '#6366F1', keywords: [...kw, 'rent', 'kiraya', 'room', 'maintenance', 'maid'] };
  }
  if (/\b(movie|cinema|netflix|hotstar|prime|spotify|youtube|entertainment|fun|game|party|club|outing)\b/i.test(lower)) {
    return { icon: 'Film', color: '#A855F7', keywords: [...kw, 'movie', 'netflix', 'party', 'cinema', 'fun', 'entertainment'] };
  }
  if (/\b(health|doctor|hospital|medical|medicine|dawa|pharmacy|test|clinic|gym|fitness|yoga)\b/i.test(lower)) {
    return { icon: 'HeartPulse', color: '#F43F5E', keywords: [...kw, 'medicine', 'dawa', 'doctor', 'hospital', 'medical', 'gym', 'health'] };
  }
  if (/\b(invest|investment|sip|mutual fund|stock|share|crypto|gold|ppf|epf|savings|fd|rd)\b/i.test(lower)) {
    return { icon: 'TrendingUp', color: '#10B981', keywords: [...kw, 'sip', 'mutual fund', 'stocks', 'gold', 'crypto', 'savings'] };
  }
  if (/\b(education|course|school|college|fees|tuition|book|books|exam|study|training)\b/i.test(lower)) {
    return { icon: 'GraduationCap', color: '#3B82F6', keywords: [...kw, 'fees', 'course', 'books', 'school', 'tuition', 'education'] };
  }
  if (/\b(salary|job|stipend|bonus|office|payout|payroll)\b/i.test(lower)) {
    return { icon: 'Briefcase', color: '#10B981', keywords: [...kw, 'salary', 'bonus', 'stipend', 'payout'] };
  }
  if (/\b(freelance|client|project|upwork|fiverr|consulting|gig)\b/i.test(lower)) {
    return { icon: 'Laptop', color: '#0EA5E9', keywords: [...kw, 'freelance', 'client', 'project', 'consulting'] };
  }

  return { icon: 'Tag', color: '#06B6D4', keywords: kw };
}

export function importBudgetRows(
  userId: string,
  rawRows: any[],
  replaceExisting: boolean = true
): {
  createdCount: number;
  updatedCount: number;
  budgets: CategoryBudget[];
  categories: CategoryDef[];
  totalBudget: number;
  importedItems: Array<{ category: string; limit: number; type: string; isNew: boolean }>;
} {
  const store = getUserData(userId);
  let createdCount = 0;
  let updatedCount = 0;
  const importedItems: Array<{ category: string; limit: number; type: string; isNew: boolean }> = [];

  // When replaceExisting is true, clear out old categories and budgets so only Excel list is kept
  if (replaceExisting) {
    store.categories = [];
    store.budgets = [];
  }

  for (const rawRow of rawRows) {
    // Normalize row keys (ignore casing, spaces, underscores, hyphens)
    const rowObj: Record<string, any> = {};
    for (const k of Object.keys(rawRow)) {
      rowObj[k.trim().toLowerCase().replace(/[\s_\-]+/g, '')] = rawRow[k];
    }

    let categoryName = 
      rowObj['category'] || 
      rowObj['categoryname'] || 
      rowObj['name'] || 
      rowObj['naam'] || 
      rowObj['item'] || 
      rowObj['kharcha'] || 
      rowObj['kharchatype'] || 
      rowObj['title'] || '';

    categoryName = String(categoryName).trim();
    if (!categoryName) continue;

    const rawAmt = 
      rowObj['budget'] ?? 
      rowObj['budgetlimit'] ?? 
      rowObj['monthlybudget'] ?? 
      rowObj['limit'] ?? 
      rowObj['monthlylimit'] ?? 
      rowObj['amount'] ?? 
      rowObj['rashi'] ?? 
      rowObj['allocation'] ?? 
      rowObj['allocated'] ?? 0;

    const budgetLimit = Math.max(0, Number(String(rawAmt).replace(/[^0-9.]/g, '')) || 0);

    const rawType = String(rowObj['type'] || rowObj['kind'] || rowObj['categorytype'] || 'expense').toLowerCase().trim();
    let categoryType: TransactionType | 'both' = 'expense';
    if (rawType.includes('inc') || rawType === 'income' || rawType === 'kamai') {
      categoryType = 'income';
    } else if (rawType === 'both' || rawType.includes('dono')) {
      categoryType = 'both';
    }

    let rawKeywords: string[] = [];
    const rawKw = rowObj['keywords'] || rowObj['keyword'] || rowObj['searchwords'] || rowObj['tags'] || '';
    if (typeof rawKw === 'string' && rawKw.trim()) {
      rawKeywords = rawKw.split(/[,;|]/).map(s => s.trim().toLowerCase()).filter(Boolean);
    } else if (Array.isArray(rawKw)) {
      rawKeywords = rawKw.map(s => String(s).trim().toLowerCase()).filter(Boolean);
    }

    // 1. Check or create category
    let existingCat = store.categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
    let isNew = false;
    if (!existingCat) {
      isNew = true;
      const meta = getAutoCategoryMeta(categoryName);
      const combinedKeywords = Array.from(new Set([...meta.keywords, ...rawKeywords, categoryName.toLowerCase()]));
      const newCatDef: CategoryDef = {
        id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
        type: categoryType,
        icon: meta.icon,
        color: meta.color,
        keywords: combinedKeywords,
        isCustom: true,
      };
      store.categories.push(newCatDef);
      existingCat = newCatDef;
      createdCount++;
    } else {
      if (rawKeywords.length > 0) {
        const set = new Set(existingCat.keywords || []);
        rawKeywords.forEach(k => set.add(k));
        existingCat.keywords = Array.from(set);
      }
    }

    // 2. Update or insert in budgets list
    const existingBudget = store.budgets.find(b => b.category.toLowerCase() === existingCat!.name.toLowerCase());
    if (existingBudget) {
      existingBudget.limit = budgetLimit;
      updatedCount++;
    } else {
      store.budgets.push({
        category: existingCat!.name,
        limit: budgetLimit,
        spent: 0,
        period: 'monthly',
      });
      updatedCount++;
    }

    importedItems.push({
      category: existingCat!.name,
      limit: budgetLimit,
      type: categoryType,
      isNew,
    });
  }

  // Ensure Uncategorized category is preserved if not in list
  if (!store.categories.some(c => c.name.toLowerCase() === 'uncategorized' || c.id === 'uncategorized')) {
    store.categories.push({
      id: 'uncategorized',
      name: 'Uncategorized',
      type: 'both',
      icon: 'Tag',
      color: '#64748B',
      keywords: ['other', 'misc', 'uncategorized'],
      isCustom: false,
    });
  }

  syncBudgetsWithCategories(store);
  saveUserData(userId, store);

  const totalBudget = store.budgets.reduce((acc, b) => acc + (b.limit || 0), 0);

  return {
    createdCount,
    updatedCount,
    budgets: store.budgets,
    categories: store.categories,
    totalBudget,
    importedItems,
  };
}

// 4. Budgets Management
app.get('/api/budgets', (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.json({ budgets: [] });
  }
  const store = getUserData(user.id);
  syncBudgetsWithCategories(store);
  saveUserData(user.id, store);
  const summary = calculateUserSummary(user.id);
  res.json({ budgets: store.budgets, summary });
});

app.put(['/api/budgets', '/api/budgets/set'], (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'User session not found' });
  }
  const store = getUserData(user.id);
  const body = req.body || {};
  const listToProcess: Array<{ category: string; limit: number }> = [];

  if (Array.isArray(body)) {
    listToProcess.push(...body);
  } else if (Array.isArray(body.newBudgets)) {
    listToProcess.push(...body.newBudgets);
  } else if (Array.isArray(body.budgets)) {
    listToProcess.push(...body.budgets);
  } else if (body.category) {
    listToProcess.push({ category: String(body.category), limit: Number(body.limit) || 0 });
  }

  if (listToProcess.length === 0) {
    return res.status(400).json({ error: 'Invalid budget data provided. Expected array of budgets or { category, limit }.' });
  }

  // Update existing or add new
  for (const nb of listToProcess) {
    if (!nb.category) continue;
    const existing = store.budgets.find(b => b.category.toLowerCase() === String(nb.category).toLowerCase());
    const cleanLimit = Math.max(0, Number(nb.limit) || 0);
    if (existing) {
      existing.limit = cleanLimit;
    } else {
      store.budgets.push({
        category: nb.category,
        limit: cleanLimit,
        spent: 0,
        period: 'monthly',
      });
    }
  }

  syncBudgetsWithCategories(store);
  saveUserData(user.id, store);
  const summary = calculateUserSummary(user.id);

  res.json({ success: true, budgets: store.budgets, summary });
});

app.post(['/api/budgets', '/api/budgets/set'], (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'User session not found' });
  }
  const store = getUserData(user.id);
  const body = req.body || {};
  const listToProcess: Array<{ category: string; limit: number }> = [];

  if (Array.isArray(body)) {
    listToProcess.push(...body);
  } else if (Array.isArray(body.newBudgets)) {
    listToProcess.push(...body.newBudgets);
  } else if (Array.isArray(body.budgets)) {
    listToProcess.push(...body.budgets);
  } else if (body.category) {
    listToProcess.push({ category: String(body.category), limit: Number(body.limit) || 0 });
  }

  if (listToProcess.length === 0) {
    return res.status(400).json({ error: 'Invalid budget data. Expected category & limit or list of budgets.' });
  }

  for (const nb of listToProcess) {
    if (!nb.category) continue;
    const existing = store.budgets.find(b => b.category.toLowerCase() === String(nb.category).toLowerCase());
    const cleanLimit = Math.max(0, Number(nb.limit) || 0);
    if (existing) {
      existing.limit = cleanLimit;
    } else {
      store.budgets.push({
        category: nb.category,
        limit: cleanLimit,
        spent: 0,
        period: 'monthly',
      });
    }
  }

  syncBudgetsWithCategories(store);
  saveUserData(user.id, store);
  const summary = calculateUserSummary(user.id);

  res.json({ success: true, budgets: store.budgets, summary });
});

// Import Budget from Excel / CSV endpoint
app.post('/api/budgets/import-excel', (req, res) => {
  try {
    const user = getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: 'User session not found. Please log in.' });
    }

    const { rows, fileBase64, replaceExisting = true } = req.body;
    let parsedRows: any[] = [];

    if (Array.isArray(rows) && rows.length > 0) {
      parsedRows = rows;
    } else if (fileBase64) {
      try {
        const buffer = Buffer.from(fileBase64, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        parsedRows = XLSX.utils.sheet_to_json(sheet);
      } catch (e: any) {
        return res.status(400).json({ error: `Excel file parsing error: ${e.message}` });
      }
    } else {
      return res.status(400).json({ error: 'No budget rows or fileBase64 provided' });
    }

    if (parsedRows.length === 0) {
      return res.status(400).json({ error: 'Excel sheet khali hai ya columns match nahi huye' });
    }

    const result = importBudgetRows(user.id, parsedRows, replaceExisting);
    return res.json({
      success: true,
      message: replaceExisting 
        ? `Purani categories hata di gayi hain aur ${result.categories.length} Excel categories successfully setup ho gayi hain!`
        : `${result.createdCount} nayi categories banayi gayi aur ${result.updatedCount} budgets update huye!`,
      ...result,
    });
  } catch (err: any) {
    console.error('Error importing budgets from Excel:', err);
    return res.status(500).json({ error: err?.message || 'Failed to import Excel budgets' });
  }
});

// Download sample budget template endpoint (Excel .xlsx or CSV)
app.get('/api/budgets/template', (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';

  const sampleData = [
    { 'Category': 'Food & Dining', 'Monthly Budget': 12000, 'Type': 'expense', 'Keywords': 'dahi, swiggy, zomato, chai, restaurant, milk, snacks' },
    { 'Category': 'Groceries & Kirana', 'Monthly Budget': 8000, 'Type': 'expense', 'Keywords': 'sabzi, blinkit, zepto, rashan, supermarket, fruits' },
    { 'Category': 'Petrol & Fuel', 'Monthly Budget': 5000, 'Type': 'expense', 'Keywords': 'petrol, diesel, cng, fuel, bike, car' },
    { 'Category': 'Bills & Utilities', 'Monthly Budget': 4000, 'Type': 'expense', 'Keywords': 'electricity, bijli, wifi, mobile recharge, gas cylinder' },
    { 'Category': 'Shopping', 'Monthly Budget': 6000, 'Type': 'expense', 'Keywords': 'amazon, flipkart, myntra, clothes, shoes, jeans' },
    { 'Category': 'Rent & Housing', 'Monthly Budget': 15000, 'Type': 'expense', 'Keywords': 'rent, kiraya, flat, maintenance, maid' },
    { 'Category': 'Health & Medical', 'Monthly Budget': 3000, 'Type': 'expense', 'Keywords': 'medicine, doctor, hospital, pharmacy, gym' },
    { 'Category': 'Entertainment', 'Monthly Budget': 2500, 'Type': 'expense', 'Keywords': 'movie, netflix, cinema, party, outing' },
    { 'Category': 'Investments & Savings', 'Monthly Budget': 20000, 'Type': 'expense', 'Keywords': 'sip, mutual fund, stocks, gold, crypto, savings' },
    { 'Category': 'Salary', 'Monthly Budget': 75000, 'Type': 'income', 'Keywords': 'salary, office, payout, payroll' },
    { 'Category': 'Freelance & Side Income', 'Monthly Budget': 15000, 'Type': 'income', 'Keywords': 'freelance, client, upwork, project' },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Budgets');

  if (format === 'csv') {
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="TeleExpense_Budget_Template.csv"');
    return res.send(csvContent);
  } else {
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="TeleExpense_Budget_Template.xlsx"');
    return res.send(buffer);
  }
});

// Full Ledger & Account Multi-Sheet Backup Restore Function
export function restoreTransactionsBackup(
  userId: string,
  rawRows: any[],
  replaceExisting: boolean = false,
  rawCategoriesRows: any[] = [],
  rawBudgetsRows: any[] = [],
  rawUdhaarRows: any[] = [],
  rawFuelRows: any[] = [],
  rawInvestmentRows: any[] = [],
  rawSavingsRows: any[] = [],
  rawEmiRows: any[] = []
): {
  restoredCount: number;
  categoriesCreated: number;
  udhaarsCount: number;
  fuelLogsCount: number;
  investmentsCount: number;
  savingsTransfersCount: number;
  emisCount: number;
  transactions: Transaction[];
  categories: CategoryDef[];
  budgets: CategoryBudget[];
  udhaars: UdhaarRecord[];
  fuelLogs: FuelLog[];
  investments: InvestmentRecord[];
  savingsTransfers: SavingsTransfer[];
  cardEmis: CardEmi[];
  summary: any;
} {
  const store = getUserData(userId);
  let restoredCount = 0;
  let categoriesCreated = 0;
  let udhaarsCount = 0;
  let fuelLogsCount = 0;
  let investmentsCount = 0;
  let savingsTransfersCount = 0;
  let emisCount = 0;

  // 1. Restore/Merge Categories if provided
  if (Array.isArray(rawCategoriesRows) && rawCategoriesRows.length > 0) {
    for (const cRow of rawCategoriesRows) {
      if (!cRow || typeof cRow !== 'object') continue;
      const cObj: Record<string, any> = {};
      for (const k of Object.keys(cRow)) {
        cObj[k.trim().toLowerCase().replace(/[\s_\-\(\)]+/g, '')] = cRow[k];
      }

      const catName = String(cObj['categoryname'] ?? cObj['category'] ?? cObj['name'] ?? '').trim();
      if (!catName) continue;

      const catType = String(cObj['type'] ?? 'expense').toLowerCase().includes('income') ? 'income' : 'expense';
      const catIcon = String(cObj['icon'] ?? 'Folder').trim();
      const catColor = String(cObj['color'] ?? 'indigo').trim();
      const rawKeywords = cObj['keywords'] ?? cObj['keyword'] ?? '';
      const keywords = typeof rawKeywords === 'string'
        ? rawKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
        : Array.isArray(rawKeywords) ? rawKeywords.map(String) : [];
      const isCustom = String(cObj['customcategory'] ?? cObj['iscustom'] ?? 'yes').toLowerCase().includes('y');

      const existingCatIndex = store.categories.findIndex(c => c.name.toLowerCase() === catName.toLowerCase());
      if (existingCatIndex >= 0) {
        store.categories[existingCatIndex] = {
          ...store.categories[existingCatIndex],
          icon: catIcon || store.categories[existingCatIndex].icon,
          color: catColor || store.categories[existingCatIndex].color,
          keywords: keywords.length > 0 ? keywords : store.categories[existingCatIndex].keywords,
          type: catType as 'income' | 'expense',
        };
      } else {
        store.categories.push({
          id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: catName.charAt(0).toUpperCase() + catName.slice(1),
          type: catType as 'income' | 'expense',
          icon: catIcon || 'Folder',
          color: catColor || 'indigo',
          keywords,
          isCustom,
        });
        categoriesCreated++;
      }

      // Budget Limit
      const rawLimit = cObj['monthlybudgetlimitinr'] ?? cObj['monthlybudget'] ?? cObj['budget'] ?? cObj['limit'];
      if (rawLimit !== undefined && rawLimit !== null && !isNaN(Number(rawLimit))) {
        const limitNum = Math.max(0, parseFloat(String(rawLimit)));
        const budgetIndex = store.budgets.findIndex(b => b.category.toLowerCase() === catName.toLowerCase());
        if (budgetIndex >= 0) {
          store.budgets[budgetIndex].limit = limitNum;
        } else {
          store.budgets.push({
            category: catName,
            limit: limitNum,
            spent: 0,
            period: 'monthly',
          });
        }
      }
    }
  }

  // 2. Clear transactions if replaceExisting
  if (replaceExisting) {
    store.transactions = [];
  }

  const existingTxIds = new Set(store.transactions.map(t => t.id));

  // 3. Restore Transactions
  for (const rawRow of rawRows) {
    if (!rawRow || typeof rawRow !== 'object') continue;

    // Normalize keys
    const rowObj: Record<string, any> = {};
    for (const k of Object.keys(rawRow)) {
      rowObj[k.trim().toLowerCase().replace(/[\s_\-\(\)]+/g, '')] = rawRow[k];
    }

    // 1. Amount
    let rawAmount = rowObj['amountinr'] ?? rowObj['amount'] ?? rowObj['rupaye'] ?? rowObj['amt'] ?? rowObj['paisa'] ?? rowObj['price'] ?? 0;
    if (typeof rawAmount === 'string') {
      rawAmount = rawAmount.replace(/[₹$,\s]/g, '');
    }
    const amount = Math.abs(parseFloat(rawAmount) || 0);
    if (amount <= 0) continue; // Skip invalid rows

    // 2. Type (income vs expense)
    let rawType = String(rowObj['type'] ?? rowObj['kism'] ?? rowObj['transactiontype'] ?? rowObj['crdr'] ?? '').trim().toLowerCase();
    let type: 'income' | 'expense' = 'expense';
    if (
      rawType.includes('income') || 
      rawType.includes('kamai') || 
      rawType.includes('credit') || 
      rawType === 'cr' || 
      rawType.includes('received') ||
      rawType.includes('salary')
    ) {
      type = 'income';
    }

    // 3. Category
    let category = String(rowObj['category'] ?? rowObj['kategori'] ?? rowObj['categoryname'] ?? '').trim();
    if (!category) {
      category = type === 'income' ? 'Salary & Employment' : 'Uncategorized';
    }

    // Auto-create category if missing
    const catLower = category.toLowerCase();
    let existingCat = store.categories.find(c => c.name.toLowerCase() === catLower || c.id === catLower);
    if (!existingCat) {
      const defaultMeta = getAutoCategoryMeta(category);
      existingCat = {
        id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: category.charAt(0).toUpperCase() + category.slice(1),
        type: type === 'income' ? 'income' : 'expense',
        icon: defaultMeta.icon,
        color: defaultMeta.color,
        keywords: defaultMeta.keywords,
        isCustom: true,
      };
      store.categories.push(existingCat);
      categoriesCreated++;
    }

    // 4. Date & Time
    let dateStr = String(rowObj['date'] ?? rowObj['tareeq'] ?? rowObj['transactiondate'] ?? rowObj['createdat'] ?? '').trim();
    let timeStr = String(rowObj['time'] ?? rowObj['waqt'] ?? '').trim();

    // If date is an Excel serial number like 45536
    if (!isNaN(Number(dateStr)) && Number(dateStr) > 20000 && Number(dateStr) < 70000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const parsedDate = new Date(excelEpoch.getTime() + Number(dateStr) * 86400000);
      dateStr = parsedDate.toISOString().split('T')[0];
    } else if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        const parsedInfo = getAppDateTime(parsed);
        dateStr = parsedInfo.date;
        if (!timeStr) {
          timeStr = parsedInfo.time;
        }
      } else if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          } else {
            dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
      }
    }

    const nowInfo = getAppDateTime();
    if (!dateStr || dateStr.length < 8) {
      dateStr = nowInfo.date;
    }
    if (!timeStr) {
      timeStr = nowInfo.time;
    }

    // 5. Description, Raw Message, Payment Method, Source, Account
    const description = String(rowObj['description'] ?? rowObj['details'] ?? rowObj['note'] ?? rowObj['particulars'] ?? category).trim();
    const rawMessage = String(rowObj['rawmessage'] ?? rowObj['originalmessage'] ?? rowObj['telegrammessage'] ?? rowObj['message'] ?? '').trim();
    const rawPayment = String(rowObj['paymentmethod'] ?? rowObj['mode'] ?? rowObj['paymode'] ?? 'UPI').trim().toLowerCase();
    let paymentMethod: PaymentMethod = 'UPI';
    if (rawPayment.includes('cash')) paymentMethod = 'Cash';
    else if (rawPayment.includes('card') || rawPayment.includes('credit') || rawPayment.includes('debit')) paymentMethod = 'Card';
    else if (rawPayment.includes('net banking')) paymentMethod = 'Net Banking';
    else if (rawPayment.includes('bank') || rawPayment.includes('transfer') || rawPayment.includes('neft') || rawPayment.includes('rtgs') || rawPayment.includes('imps')) paymentMethod = 'Bank Transfer';
    else if (rawPayment.includes('other')) paymentMethod = 'Other';

    const account = String(rowObj['account'] ?? rowObj['accountname'] ?? rowObj['cardid'] ?? '').trim() || undefined;
    const source = String(rowObj['source'] ?? (rawMessage ? 'telegram' : 'manual')).trim() as 'telegram' | 'manual';
    const telegramUser = String(rowObj['telegramuser'] ?? rowObj['user'] ?? rowObj['member'] ?? '').trim() || undefined;

    // Tags
    let tags: string[] = [];
    const rawTags = rowObj['tags'] ?? rowObj['tag'];
    if (Array.isArray(rawTags)) {
      tags = rawTags.map(String);
    } else if (typeof rawTags === 'string' && rawTags.trim()) {
      tags = rawTags.split(',').map(t => t.trim()).filter(Boolean);
    }

    const txId = (rowObj['transactionid'] || rowObj['id']) && !existingTxIds.has(String(rowObj['transactionid'] || rowObj['id']))
      ? String(rowObj['transactionid'] || rowObj['id'])
      : `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const newTx: Transaction = {
      id: txId,
      userId,
      type,
      amount,
      category: existingCat.name,
      description: description || existingCat.name,
      date: dateStr,
      time: timeStr,
      paymentMethod,
      account,
      source: source === 'telegram' ? 'telegram' : 'manual',
      rawMessage: rawMessage || undefined,
      createdAt: `${dateStr}T${timeStr}:00.000Z`,
      tags,
      telegramUser,
    };

    store.transactions.unshift(newTx);
    existingTxIds.add(newTx.id);
    restoredCount++;
  }

  // Sort transactions chronologically
  store.transactions.sort((a, b) => {
    const timeA = new Date(`${a.date}T${a.time || '00:00'}`).getTime();
    const timeB = new Date(`${b.date}T${b.time || '00:00'}`).getTime();
    return timeB - timeA;
  });

  // 4. Restore Udhaar Records (Lent & Borrowed)
  if (!store.udhaars) store.udhaars = [];
  if (replaceExisting && Array.isArray(rawUdhaarRows) && rawUdhaarRows.length > 0) {
    store.udhaars = [];
  }
  const existingUdhaarIds = new Set((store.udhaars || []).map(u => u.id));
  if (Array.isArray(rawUdhaarRows) && rawUdhaarRows.length > 0) {
    for (const uRow of rawUdhaarRows) {
      if (!uRow || typeof uRow !== 'object') continue;
      const uObj: Record<string, any> = {};
      for (const k of Object.keys(uRow)) {
        uObj[k.trim().toLowerCase().replace(/[\s_\-\(\)]+/g, '')] = uRow[k];
      }

      const personName = String(uObj['personname'] ?? uObj['person'] ?? uObj['name'] ?? '').trim();
      let rawAmt = uObj['amountinr'] ?? uObj['amount'] ?? uObj['rupaye'] ?? 0;
      if (typeof rawAmt === 'string') rawAmt = rawAmt.replace(/[₹$,\s]/g, '');
      const amount = Math.abs(parseFloat(String(rawAmt)) || 0);
      if (!personName || amount <= 0) continue;

      const rawType = String(uObj['type'] ?? '').toLowerCase();
      const type: 'lent' | 'borrowed' = (rawType.includes('diya') || rawType.includes('lent') || rawType.includes('lena')) ? 'lent' : 'borrowed';
      const status: 'pending' | 'settled' = String(uObj['status'] ?? '').toLowerCase().includes('settle') ? 'settled' : 'pending';
      const description = String(uObj['description'] ?? uObj['notes'] ?? uObj['note'] ?? '').trim();
      const account = String(uObj['account'] ?? uObj['bank'] ?? '').trim() || undefined;

      let dateStr = String(uObj['date'] ?? uObj['tareeq'] ?? '').trim();
      if (!isNaN(Number(dateStr)) && Number(dateStr) > 20000 && Number(dateStr) < 70000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const parsedDate = new Date(excelEpoch.getTime() + Number(dateStr) * 86400000);
        dateStr = parsedDate.toISOString().split('T')[0];
      } else if (!dateStr || dateStr.length < 8) {
        dateStr = getAppDateTime().date;
      }
      const timeStr = String(uObj['time'] ?? '12:00').trim();
      const settledAt = uObj['settleddate'] || uObj['settledat'] ? String(uObj['settleddate'] || uObj['settledat']).trim() : undefined;
      const uId = (uObj['recordid'] || uObj['id']) && !existingUdhaarIds.has(String(uObj['recordid'] || uObj['id']))
        ? String(uObj['recordid'] || uObj['id'])
        : `udh_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      const newUdhaar: UdhaarRecord = {
        id: uId,
        userId,
        type,
        personName,
        amount,
        description: description || undefined,
        account,
        date: dateStr,
        time: timeStr,
        status,
        settledAt: status === 'settled' ? (settledAt || `${dateStr}T${timeStr}:00.000Z`) : undefined,
        createdAt: `${dateStr}T${timeStr}:00.000Z`,
      };

      store.udhaars.push(newUdhaar);
      existingUdhaarIds.add(uId);
      udhaarsCount++;
    }
  }

  // 5. Restore Fuel & Mileage Logs
  if (!store.fuelLogs) store.fuelLogs = [];
  if (replaceExisting && Array.isArray(rawFuelRows) && rawFuelRows.length > 0) {
    store.fuelLogs = [];
  }
  const existingFuelIds = new Set((store.fuelLogs || []).map(f => f.id));
  if (Array.isArray(rawFuelRows) && rawFuelRows.length > 0) {
    for (const fRow of rawFuelRows) {
      if (!fRow || typeof fRow !== 'object') continue;
      const fObj: Record<string, any> = {};
      for (const k of Object.keys(fRow)) {
        fObj[k.trim().toLowerCase().replace(/[\s_\-\(\)]+/g, '')] = fRow[k];
      }

      let rawFuelAmt = fObj['fuelamountinr'] ?? fObj['fuelamount'] ?? fObj['amountinr'] ?? fObj['amount'] ?? 0;
      if (typeof rawFuelAmt === 'string') rawFuelAmt = rawFuelAmt.replace(/[₹$,\s]/g, '');
      const fuelAmount = Math.abs(parseFloat(String(rawFuelAmt)) || 0);

      const rawOdo = fObj['odometerreadingkm'] ?? fObj['odometer'] ?? fObj['reading'] ?? 0;
      const odometer = Math.abs(parseFloat(String(rawOdo)) || 0);
      if (fuelAmount <= 0 && odometer <= 0) continue;

      const vehicleName = String(fObj['vehiclename'] ?? fObj['vehicle'] ?? 'Vehicle').trim() || 'Vehicle';
      const fuelLiters = fObj['fuelliters'] !== undefined && fObj['fuelliters'] !== '' ? parseFloat(String(fObj['fuelliters'])) : undefined;
      const previousOdometer = fObj['previousodometerkm'] !== undefined && fObj['previousodometerkm'] !== '' ? parseFloat(String(fObj['previousodometerkm'])) : undefined;
      const distanceCovered = fObj['distancecoveredkm'] !== undefined && fObj['distancecoveredkm'] !== '' ? parseFloat(String(fObj['distancecoveredkm'])) : undefined;
      const calculatedMileage = fObj['calculatedmileagekml'] !== undefined && fObj['calculatedmileagekml'] !== '' ? parseFloat(String(fObj['calculatedmileagekml'])) : undefined;
      const costPerKm = fObj['costperkminr'] !== undefined && fObj['costperkminr'] !== '' ? parseFloat(String(fObj['costperkminr'])) : undefined;
      const notes = String(fObj['notes'] ?? fObj['note'] ?? '').trim();

      let dateStr = String(fObj['date'] ?? fObj['tareeq'] ?? '').trim();
      if (!isNaN(Number(dateStr)) && Number(dateStr) > 20000 && Number(dateStr) < 70000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const parsedDate = new Date(excelEpoch.getTime() + Number(dateStr) * 86400000);
        dateStr = parsedDate.toISOString().split('T')[0];
      } else if (!dateStr || dateStr.length < 8) {
        dateStr = getAppDateTime().date;
      }
      const timeStr = String(fObj['time'] ?? '12:00').trim();

      const fId = (fObj['logid'] || fObj['id']) && !existingFuelIds.has(String(fObj['logid'] || fObj['id']))
        ? String(fObj['logid'] || fObj['id'])
        : `fuel_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      const newFuelLog: FuelLog = {
        id: fId,
        userId,
        date: dateStr,
        time: timeStr,
        vehicleName,
        fuelAmount,
        fuelLiters,
        odometer,
        previousOdometer,
        distanceCovered,
        calculatedMileage,
        costPerKm,
        notes: notes || undefined,
        createdAt: `${dateStr}T${timeStr}:00.000Z`,
      };

      store.fuelLogs.push(newFuelLog);
      existingFuelIds.add(fId);
      fuelLogsCount++;
    }
  }

  // 6. Restore Investments (RD, FD, MF, Gold, PPF, etc.)
  if (!store.investments) store.investments = [];
  if (replaceExisting && Array.isArray(rawInvestmentRows) && rawInvestmentRows.length > 0) {
    store.investments = [];
  }
  const existingInvIds = new Set((store.investments || []).map(i => i.id));
  if (Array.isArray(rawInvestmentRows) && rawInvestmentRows.length > 0) {
    for (const iRow of rawInvestmentRows) {
      if (!iRow || typeof iRow !== 'object') continue;
      const iObj: Record<string, any> = {};
      for (const k of Object.keys(iRow)) {
        iObj[k.trim().toLowerCase().replace(/[\s_\-\(\)]+/g, '')] = iRow[k];
      }

      const name = String(iObj['investmentname'] ?? iObj['name'] ?? iObj['plan'] ?? iObj['title'] ?? '').trim();
      let rawAmt = iObj['amountinr'] ?? iObj['amount'] ?? iObj['rupaye'] ?? 0;
      if (typeof rawAmt === 'string') rawAmt = rawAmt.replace(/[₹$,\s]/g, '');
      const amount = Math.abs(parseFloat(String(rawAmt)) || 0);
      if (!name || amount <= 0) continue;

      const rawType = String(iObj['type'] ?? 'RD').trim().toUpperCase();
      let type: 'RD' | 'FD' | 'Mutual Fund' | 'Gold' | 'PPF' | 'Other' = 'RD';
      if (rawType.includes('FD')) type = 'FD';
      else if (rawType.includes('MUTUAL') || rawType.includes('MF')) type = 'Mutual Fund';
      else if (rawType.includes('GOLD')) type = 'Gold';
      else if (rawType.includes('PPF')) type = 'PPF';
      else if (rawType.includes('OTHER')) type = 'Other';

      const account = (String(iObj['account'] ?? iObj['bank'] ?? 'IC Bank').trim() || 'IC Bank') as any;
      let dateStr = String(iObj['date'] ?? iObj['startdate'] ?? '').trim();
      if (!isNaN(Number(dateStr)) && Number(dateStr) > 20000 && Number(dateStr) < 70000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        dateStr = new Date(excelEpoch.getTime() + Number(dateStr) * 86400000).toISOString().split('T')[0];
      } else if (!dateStr || dateStr.length < 8) {
        dateStr = getAppDateTime().date;
      }

      let maturityDate = String(iObj['maturitydate'] ?? iObj['maturity'] ?? '').trim() || undefined;
      if (maturityDate && !isNaN(Number(maturityDate)) && Number(maturityDate) > 20000 && Number(maturityDate) < 70000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        maturityDate = new Date(excelEpoch.getTime() + Number(maturityDate) * 86400000).toISOString().split('T')[0];
      }

      const interestRate = iObj['interestrate'] !== undefined && iObj['interestrate'] !== '' ? parseFloat(String(iObj['interestrate'])) : undefined;
      const notes = String(iObj['notes'] ?? iObj['note'] ?? '').trim();

      const invId = (iObj['investmentid'] || iObj['id']) && !existingInvIds.has(String(iObj['investmentid'] || iObj['id']))
        ? String(iObj['investmentid'] || iObj['id'])
        : `inv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      const newInv: InvestmentRecord = {
        id: invId,
        userId,
        type,
        name,
        amount,
        account,
        date: dateStr,
        maturityDate,
        interestRate,
        notes: notes || undefined,
        createdAt: `${dateStr}T12:00:00.000Z`,
      };

      store.investments.push(newInv);
      existingInvIds.add(invId);
      investmentsCount++;
    }
  }

  // 7. Restore Savings Transfers (Wife's A/c Transfers)
  if (!store.savingsTransfers) store.savingsTransfers = [];
  if (replaceExisting && Array.isArray(rawSavingsRows) && rawSavingsRows.length > 0) {
    store.savingsTransfers = [];
  }
  const existingSavIds = new Set((store.savingsTransfers || []).map(s => s.id));
  if (Array.isArray(rawSavingsRows) && rawSavingsRows.length > 0) {
    for (const sRow of rawSavingsRows) {
      if (!sRow || typeof sRow !== 'object') continue;
      const sObj: Record<string, any> = {};
      for (const k of Object.keys(sRow)) {
        sObj[k.trim().toLowerCase().replace(/[\s_\-\(\)]+/g, '')] = sRow[k];
      }

      let rawAmt = sObj['amountinr'] ?? sObj['amount'] ?? sObj['rupaye'] ?? 0;
      if (typeof rawAmt === 'string') rawAmt = rawAmt.replace(/[₹$,\s]/g, '');
      const amount = Math.abs(parseFloat(String(rawAmt)) || 0);
      if (amount <= 0) continue;

      const recipient = String(sObj['recipient'] ?? sObj['transferto'] ?? sObj['to'] ?? "Wife's Account").trim() || "Wife's Account";
      const fromAccount = (String(sObj['fromaccount'] ?? sObj['account'] ?? 'AX Bank').trim() || 'AX Bank') as any;

      let dateStr = String(sObj['date'] ?? sObj['tareeq'] ?? '').trim();
      if (!isNaN(Number(dateStr)) && Number(dateStr) > 20000 && Number(dateStr) < 70000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        dateStr = new Date(excelEpoch.getTime() + Number(dateStr) * 86400000).toISOString().split('T')[0];
      } else if (!dateStr || dateStr.length < 8) {
        dateStr = getAppDateTime().date;
      }

      const notes = String(sObj['notes'] ?? sObj['note'] ?? '').trim();
      const savId = (sObj['transferid'] || sObj['id']) && !existingSavIds.has(String(sObj['transferid'] || sObj['id']))
        ? String(sObj['transferid'] || sObj['id'])
        : `sav_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      const newSav: SavingsTransfer = {
        id: savId,
        userId,
        amount,
        recipient,
        fromAccount,
        date: dateStr,
        notes: notes || undefined,
        createdAt: `${dateStr}T12:00:00.000Z`,
      };

      store.savingsTransfers.push(newSav);
      existingSavIds.add(savId);
      savingsTransfersCount++;
    }
  }

  // 8. Restore Credit Card EMIs
  if (!store.cardEmis) store.cardEmis = [];
  if (replaceExisting && Array.isArray(rawEmiRows) && rawEmiRows.length > 0) {
    store.cardEmis = [];
  }
  const existingEmiIds = new Set((store.cardEmis || []).map(e => e.id));
  if (Array.isArray(rawEmiRows) && rawEmiRows.length > 0) {
    for (const eRow of rawEmiRows) {
      if (!eRow || typeof eRow !== 'object') continue;
      const eObj: Record<string, any> = {};
      for (const k of Object.keys(eRow)) {
        eObj[k.trim().toLowerCase().replace(/[\s_\-\(\)]+/g, '')] = eRow[k];
      }

      const title = String(eObj['emititle'] ?? eObj['title'] ?? eObj['item'] ?? eObj['name'] ?? '').trim();
      let rawAmt = eObj['monthlyamountinr'] ?? eObj['monthlyamount'] ?? eObj['amount'] ?? 0;
      if (typeof rawAmt === 'string') rawAmt = rawAmt.replace(/[₹$,\s]/g, '');
      const monthlyAmount = Math.abs(parseFloat(String(rawAmt)) || 0);
      if (!title || monthlyAmount <= 0) continue;

      const cardId = (String(eObj['cardid'] ?? eObj['card'] ?? eObj['account'] ?? 'SBI CC 5733').trim() || 'SBI CC 5733') as any;
      const totalMonths = Math.max(1, parseInt(String(eObj['totalmonths'] ?? eObj['tenure'] ?? 12), 10) || 12);
      const paidMonths = Math.max(0, parseInt(String(eObj['paidmonths'] ?? eObj['completed'] ?? 0), 10) || 0);
      const dueDay = Math.max(1, Math.min(31, parseInt(String(eObj['dueday'] ?? eObj['due'] ?? 15), 10) || 15));
      const startDate = String(eObj['startdate'] ?? eObj['date'] ?? getAppDateTime().date).trim();
      const notes = String(eObj['notes'] ?? eObj['note'] ?? '').trim();

      const emiId = (eObj['emiid'] || eObj['id']) && !existingEmiIds.has(String(eObj['emiid'] || eObj['id']))
        ? String(eObj['emiid'] || eObj['id'])
        : `emi_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      const newEmi: CardEmi = {
        id: emiId,
        userId,
        cardId,
        title,
        monthlyAmount,
        totalMonths,
        paidMonths,
        dueDay,
        startDate,
        notes: notes || undefined,
        createdAt: `${startDate}T12:00:00.000Z`,
      };

      store.cardEmis.push(newEmi);
      existingEmiIds.add(emiId);
      emisCount++;
    }
  }

  syncBudgetsWithCategories(store);
  saveUserData(userId, store);

  const summary = calculateUserSummary(userId);

  return {
    restoredCount,
    categoriesCreated,
    udhaarsCount,
    fuelLogsCount,
    investmentsCount,
    savingsTransfersCount,
    emisCount,
    transactions: store.transactions,
    categories: store.categories,
    budgets: store.budgets,
    udhaars: store.udhaars,
    fuelLogs: store.fuelLogs,
    investments: store.investments,
    savingsTransfers: store.savingsTransfers,
    cardEmis: store.cardEmis,
    summary,
  };
}

// RESTORE TRANSACTIONS & FULL ACCOUNT BACKUP ENDPOINT
app.post('/api/transactions/restore-backup', (req, res) => {
  try {
    const user = getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: 'User session not found. Please log in.' });
    }

    const { 
      rows, 
      fileBase64, 
      categoriesRows, 
      budgetsRows, 
      udhaarRows, 
      fuelRows,
      investmentsRows,
      savingsRows,
      emisRows,
      replaceExisting = false 
    } = req.body;

    let parsedTxRows: any[] = [];
    let parsedCatRows: any[] = Array.isArray(categoriesRows) ? categoriesRows : [];
    let parsedBudRows: any[] = Array.isArray(budgetsRows) ? budgetsRows : [];
    let parsedUdhaarRows: any[] = Array.isArray(udhaarRows) ? udhaarRows : [];
    let parsedFuelRows: any[] = Array.isArray(fuelRows) ? fuelRows : [];
    let parsedInvRows: any[] = Array.isArray(investmentsRows) ? investmentsRows : [];
    let parsedSavRows: any[] = Array.isArray(savingsRows) ? savingsRows : [];
    let parsedEmiRows: any[] = Array.isArray(emisRows) ? emisRows : [];

    if (fileBase64) {
      try {
        const buffer = Buffer.from(fileBase64, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        // 1. Check for High-Fidelity JSON snapshot sheet (supports single-row or chunked multi-rows)
        const metaSheet = workbook.Sheets['_TeleExpense_Backup_Data_'];
        if (metaSheet) {
          const metaRows = XLSX.utils.sheet_to_json<any>(metaSheet);
          if (metaRows.length > 0) {
            // Concatenate all chunks
            const fullJsonStr = metaRows.map(r => r.DataJSON || r.ChunkText || '').join('');
            if (fullJsonStr.trim().startsWith('{')) {
              try {
                const fullData = JSON.parse(fullJsonStr);
                const store = getUserData(user.id);
                let restoredCount = 0;
                let categoriesCreated = 0;
                let udhaarsCount = 0;
                let fuelLogsCount = 0;
                let investmentsCount = 0;
                let savingsTransfersCount = 0;
                let emisCount = 0;

                // Restore categories
                if (Array.isArray(fullData.categories)) {
                  for (const cat of fullData.categories) {
                    if (!cat || !cat.name) continue;
                    const existingIdx = store.categories.findIndex(c => c.name.toLowerCase() === cat.name.toLowerCase());
                    if (existingIdx >= 0) {
                      store.categories[existingIdx] = { ...store.categories[existingIdx], ...cat };
                    } else {
                      store.categories.push(cat);
                      categoriesCreated++;
                    }
                  }
                }

                // Restore budgets
                if (Array.isArray(fullData.budgets)) {
                  for (const b of fullData.budgets) {
                    if (!b || !b.category) continue;
                    const existingBIdx = store.budgets.findIndex(item => item.category.toLowerCase() === b.category.toLowerCase());
                    if (existingBIdx >= 0) {
                      store.budgets[existingBIdx].limit = Number(b.limit) || 0;
                    } else {
                      store.budgets.push({ ...b, limit: Number(b.limit) || 0 });
                    }
                  }
                }

                // Restore transactions
                if (replaceExisting) {
                  store.transactions = [];
                }
                const existingTxIds = new Set(store.transactions.map(t => t.id));
                if (Array.isArray(fullData.transactions)) {
                  for (const t of fullData.transactions) {
                    if (t && t.id && !existingTxIds.has(t.id)) {
                      store.transactions.push({ ...t, userId: user.id });
                      existingTxIds.add(t.id);
                      restoredCount++;
                    }
                  }
                }

                store.transactions.sort((a, b) => {
                  const timeA = new Date(`${a.date}T${a.time || '00:00'}`).getTime();
                  const timeB = new Date(`${b.date}T${b.time || '00:00'}`).getTime();
                  return timeB - timeA;
                });

                // Restore udhaars
                if (!store.udhaars) store.udhaars = [];
                if (replaceExisting) {
                  store.udhaars = [];
                }
                const existingUdhaarIds = new Set(store.udhaars.map(u => u.id));
                if (Array.isArray(fullData.udhaars)) {
                  for (const u of fullData.udhaars) {
                    if (u && (!u.id || !existingUdhaarIds.has(u.id))) {
                      const uId = u.id || `udh_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                      store.udhaars.push({ ...u, id: uId, userId: user.id });
                      existingUdhaarIds.add(uId);
                      udhaarsCount++;
                    }
                  }
                }

                // Restore fuelLogs
                if (!store.fuelLogs) store.fuelLogs = [];
                if (replaceExisting) {
                  store.fuelLogs = [];
                }
                const existingFuelIds = new Set(store.fuelLogs.map(f => f.id));
                if (Array.isArray(fullData.fuelLogs)) {
                  for (const f of fullData.fuelLogs) {
                    if (f && (!f.id || !existingFuelIds.has(f.id))) {
                      const fId = f.id || `fuel_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                      store.fuelLogs.push({ ...f, id: fId, userId: user.id });
                      existingFuelIds.add(fId);
                      fuelLogsCount++;
                    }
                  }
                }

                // Restore investments
                if (!store.investments) store.investments = [];
                if (replaceExisting) {
                  store.investments = [];
                }
                const existingInvIds = new Set(store.investments.map(i => i.id));
                if (Array.isArray(fullData.investments)) {
                  for (const inv of fullData.investments) {
                    if (inv && (!inv.id || !existingInvIds.has(inv.id))) {
                      const invId = inv.id || `inv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                      store.investments.push({ ...inv, id: invId, userId: user.id });
                      existingInvIds.add(invId);
                      investmentsCount++;
                    }
                  }
                }

                // Restore savings transfers
                if (!store.savingsTransfers) store.savingsTransfers = [];
                if (replaceExisting) {
                  store.savingsTransfers = [];
                }
                const existingSavIds = new Set(store.savingsTransfers.map(s => s.id));
                if (Array.isArray(fullData.savingsTransfers)) {
                  for (const sav of fullData.savingsTransfers) {
                    if (sav && (!sav.id || !existingSavIds.has(sav.id))) {
                      const savId = sav.id || `sav_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                      store.savingsTransfers.push({ ...sav, id: savId, userId: user.id });
                      existingSavIds.add(savId);
                      savingsTransfersCount++;
                    }
                  }
                }

                // Restore card EMIs
                if (!store.cardEmis) store.cardEmis = [];
                if (replaceExisting) {
                  store.cardEmis = [];
                }
                const existingEmiIds = new Set(store.cardEmis.map(e => e.id));
                if (Array.isArray(fullData.cardEmis)) {
                  for (const emi of fullData.cardEmis) {
                    if (emi && (!emi.id || !existingEmiIds.has(emi.id))) {
                      const emiId = emi.id || `emi_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                      store.cardEmis.push({ ...emi, id: emiId, userId: user.id });
                      existingEmiIds.add(emiId);
                      emisCount++;
                    }
                  }
                }

                // Restore User Profile attributes (trackingStartMonth, etc.)
                if (fullData.user?.trackingStartMonth) {
                  user.trackingStartMonth = fullData.user.trackingStartMonth;
                  saveJson(USERS_FILE, users);
                  persistToPg('users', users).catch(() => {});
                }

                syncBudgetsWithCategories(store);
                saveUserData(user.id, store);

                return res.json({
                  success: true,
                  message: `Pure account ka backup successfully restore ho gaya! (${restoredCount} transactions, ${categoriesCreated} nayi categories, ${udhaarsCount} udhaar, ${fuelLogsCount} fuel logs, ${investmentsCount} investments, ${savingsTransfersCount} transfers, ${emisCount} card EMIs)`,
                  restoredCount,
                  categoriesCreated,
                  udhaarsCount,
                  fuelLogsCount,
                  investmentsCount,
                  savingsTransfersCount,
                  emisCount,
                  transactions: store.transactions,
                  categories: store.categories,
                  budgets: store.budgets,
                  udhaars: store.udhaars,
                  fuelLogs: store.fuelLogs,
                  investments: store.investments,
                  savingsTransfers: store.savingsTransfers,
                  cardEmis: store.cardEmis,
                  summary: calculateUserSummary(user.id),
                });
              } catch (jsonErr) {
                console.warn('JSON sheet parse fallback to normal sheets', jsonErr);
              }
            }
          }
        }

        // 2. Parse Multi-Sheets
        for (const sName of workbook.SheetNames) {
          const lowerName = sName.toLowerCase();
          const s = workbook.Sheets[sName];
          const sRows = XLSX.utils.sheet_to_json(s);
          if (lowerName.includes('transaction') || lowerName.includes('ledger')) {
            parsedTxRows = sRows;
          } else if (lowerName.includes('categor') || lowerName.includes('budget')) {
            parsedCatRows = sRows;
          } else if (lowerName.includes('udhaar') || lowerName.includes('khata') || lowerName.includes('debt') || lowerName.includes('borrow') || lowerName.includes('lent')) {
            parsedUdhaarRows = sRows;
          } else if (lowerName.includes('fuel') || lowerName.includes('mileage') || lowerName.includes('vehicle') || lowerName.includes('petrol')) {
            parsedFuelRows = sRows;
          } else if (lowerName.includes('investment') || lowerName.includes('portfolio') || lowerName.includes('rd') || lowerName.includes('fd') || lowerName.includes('mutual')) {
            parsedInvRows = sRows;
          } else if (lowerName.includes('saving') || lowerName.includes('transfer') || lowerName.includes('wife')) {
            parsedSavRows = sRows;
          } else if (lowerName.includes('emi') || lowerName.includes('card emi') || lowerName.includes('loan')) {
            parsedEmiRows = sRows;
          }
        }

        // Fallback: If no sheet matched transaction, take the first sheet
        if (parsedTxRows.length === 0 && workbook.SheetNames.length > 0) {
          parsedTxRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        }
      } catch (e: any) {
        return res.status(400).json({ error: `Excel file parse error: ${e.message}` });
      }
    } else if (Array.isArray(rows) && rows.length > 0) {
      parsedTxRows = rows;
    }

    if (
      parsedTxRows.length === 0 && 
      parsedCatRows.length === 0 && 
      parsedUdhaarRows.length === 0 && 
      parsedFuelRows.length === 0 &&
      parsedInvRows.length === 0 &&
      parsedSavRows.length === 0 &&
      parsedEmiRows.length === 0
    ) {
      return res.status(400).json({ error: 'Backup file me koi valid transaction, category, udhaar, fuel, investment ya EMI data nahi mila' });
    }

    const result = restoreTransactionsBackup(
      user.id,
      parsedTxRows,
      replaceExisting,
      parsedCatRows,
      parsedBudRows,
      parsedUdhaarRows,
      parsedFuelRows,
      parsedInvRows,
      parsedSavRows,
      parsedEmiRows
    );
    return res.json({
      success: true,
      message: `${result.restoredCount} transactions, ${result.categories.length} categories, ${result.udhaarsCount} udhaars, ${result.fuelLogsCount} fuel logs, ${result.investmentsCount} investments, ${result.savingsTransfersCount} transfers aur ${result.emisCount} EMIs restore ho gaye hain!`,
      ...result,
    });
  } catch (err: any) {
    console.error('Error restoring transactions backup:', err);
    return res.status(500).json({ error: err?.message || 'Failed to restore transaction backup' });
  }
});

// ITEM-SPECIFIC SPENDING REPORT API
app.get('/api/transactions/item-spending', (req, res) => {
  try {
    const user = getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: 'User session not found' });
    }
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const store = getUserData(user.id);
    const cleanQ = query.toLowerCase();

    const matchingExpenses = store.transactions.filter(t => {
      if (t.type !== 'expense') return false;
      return isTransactionItemMatch(t, cleanQ);
    });

    const totalSpent = matchingExpenses.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const totalPurchases = matchingExpenses.length;
    const avgPerPurchase = totalPurchases > 0 ? Math.round(totalSpent / totalPurchases) : 0;
    const highestSinglePurchase = matchingExpenses.length > 0 ? Math.max(...matchingExpenses.map(t => Number(t.amount) || 0)) : 0;

    return res.json({
      success: true,
      query,
      totalSpent,
      totalPurchases,
      avgPerPurchase,
      highestSinglePurchase,
      recentPurchases: matchingExpenses.slice(0, 10),
    });
  } catch (err: any) {
    console.error('Error fetching item spending:', err);
    return res.status(500).json({ error: err?.message || 'Failed to calculate item spending' });
  }
});

// MONTH-ON-MONTH (MoM) COMPARISON API
app.get('/api/analytics/compare', (req, res) => {
  try {
    const user = getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: 'User session not found' });
    }
    const report = buildMonthComparisonReportTelegramMessage(user.id, user.name);
    const store = getUserData(user.id);
    const txs = store.transactions || [];
    const nowInfo = getAppDateTime();
    const [currYStr, currMStr, currDStr] = nowInfo.date.split('-');
    const currYear = parseInt(currYStr, 10);
    const currMonth = parseInt(currMStr, 10);
    const currDay = parseInt(currDStr, 10);
    const currMonthKey = `${currYear}-${String(currMonth).padStart(2, '0')}`;

    let prevYear = currYear;
    let prevMonth = currMonth - 1;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = currYear - 1;
    }
    const prevMonthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
    const prevCutoffDay = Math.min(currDay, daysInPrevMonth);
    const prevCutoffDate = `${prevMonthKey}-${String(prevCutoffDay).padStart(2, '0')}`;

    const currMtdSpent = txs.filter(t => t.date.startsWith(currMonthKey) && t.date <= nowInfo.date && t.type === 'expense')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const prevMtdSpent = txs.filter(t => t.date.startsWith(prevMonthKey) && t.date <= prevCutoffDate && t.type === 'expense')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    return res.json({
      success: true,
      currMonth: currMonthKey,
      prevMonth: prevMonthKey,
      currDay,
      currMtdSpent,
      prevMtdSpent,
      spentDiff: currMtdSpent - prevMtdSpent,
      formattedReport: report.text,
    });
  } catch (err: any) {
    console.error('Error calculating MoM comparison:', err);
    return res.status(500).json({ error: err?.message || 'Failed to compare months' });
  }
});

// SMART SEARCH TRANSACTIONS API
app.get('/api/transactions/search', (req, res) => {
  try {
    const user = getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: 'User session not found' });
    }
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const store = getUserData(user.id);
    const txs = store.transactions || [];
    const cleanQ = q.toLowerCase();

    let filtered = txs;
    const compMatch = cleanQ.match(/^([><]=?)\s*(\d+(?:\.\d+)?)$/);
    const isPureNumber = /^\d+(?:\.\d+)?$/.test(cleanQ);

    if (compMatch) {
      const op = compMatch[1];
      const val = parseFloat(compMatch[2]);
      filtered = txs.filter(t => {
        const amt = Number(t.amount) || 0;
        if (op === '>') return amt > val;
        if (op === '>=') return amt >= val;
        if (op === '<') return amt < val;
        if (op === '<=') return amt <= val;
        return false;
      });
    } else if (isPureNumber) {
      const val = parseFloat(cleanQ);
      filtered = txs.filter(t => Math.abs((Number(t.amount) || 0) - val) < 0.01);
    } else {
      filtered = txs.filter(t => isTransactionSearchMatch(t, cleanQ));
    }

    return res.json({
      success: true,
      query: q,
      totalMatches: filtered.length,
      transactions: filtered,
    });
  } catch (err: any) {
    console.error('Error searching transactions:', err);
    return res.status(500).json({ error: err?.message || 'Failed to search transactions' });
  }
});

// DUPLICATE TRANSACTION AUDIT API
app.get('/api/transactions/duplicates', (req, res) => {
  try {
    const user = getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: 'User session not found' });
    }
    const report = buildDuplicatesReportTelegramMessage(user.id, user.name);
    return res.json({
      success: true,
      reportText: report.text,
    });
  } catch (err: any) {
    console.error('Error auditing duplicates:', err);
    return res.status(500).json({ error: err?.message || 'Failed to audit duplicates' });
  }
});

// EXPORT COMPREHENSIVE BACKUP FILE (EXCEL / CSV)
app.get('/api/transactions/export-backup', (req, res) => {
  try {
    const targetUserId = (req.query.userId as string) || (req.headers['x-user-id'] as string);
    let user = targetUserId ? users.find(u => u.id === targetUserId || u.email.toLowerCase() === targetUserId.toLowerCase()) : null;
    if (!user) {
      user = getRequestUser(req);
    }
    const userId = user ? user.id : (users[0]?.id || 'default');
    const store = getUserData(userId);
    const summary = calculateUserSummary(userId) || { totalIncome: 0, totalExpense: 0, netSavings: 0, savingsRate: 0 };
    const gullakSummary = calculateGullakSummary(userId);
    const format = req.query.format === 'csv' ? 'csv' : 'xlsx';

    // 1. Transactions Sheet Data
    const txList = Array.isArray(store.transactions) ? store.transactions : [];
    const transactionsData = txList.map((t) => ({
      'Date': t.date || '',
      'Time': t.time || '12:00',
      'Type': String(t.type || 'expense').toUpperCase(),
      'Amount (INR)': Number(t.amount) || 0,
      'Category': t.category || 'Uncategorized',
      'Description': t.description || '',
      'Payment Method': t.paymentMethod || 'UPI',
      'Account / Card': t.account || '',
      'Source': t.source || 'manual',
      'Raw Message': t.rawMessage || '',
      'Telegram User': t.telegramUser || (user?.name || ''),
      'Tags': Array.isArray(t.tags) ? t.tags.join(', ') : '',
      'Reimbursement Status': t.reimbursementStatus || (t.isReimbursement ? 'pending' : ''),
      'Transaction ID': t.id || '',
    }));

    // 2. Categories & Budgets Sheet Data
    const categoriesList = Array.isArray(store.categories) ? store.categories : DEFAULT_CATEGORIES;
    const budgetsList = Array.isArray(store.budgets) ? store.budgets : DEFAULT_BUDGETS;
    const categoriesData = categoriesList.map((c) => {
      const budgetObj = budgetsList.find(b => b.category.toLowerCase() === c.name.toLowerCase());
      return {
        'Category Name': c.name,
        'Type': c.type || 'expense',
        'Monthly Budget Limit (INR)': budgetObj ? (Number(budgetObj.limit) || 0) : 0,
        'Icon': c.icon || 'Folder',
        'Color': c.color || 'indigo',
        'Keywords': Array.isArray(c.keywords) ? c.keywords.join(', ') : '',
        'Custom Category': c.isCustom ? 'YES' : 'NO',
      };
    });

    // 3. Udhaar Khata (Lent & Borrow) Sheet Data
    const udhaarsList = Array.isArray(store.udhaars) ? store.udhaars : [];
    const udhaarsData = udhaarsList.map((u) => ({
      'Date': u.date || '',
      'Time': u.time || '12:00',
      'Type': u.type === 'lent' ? 'LENT (Diya - Lena Hai)' : 'BORROWED (Liya - Dena Hai)',
      'Person Name': u.personName || '',
      'Amount (INR)': Number(u.amount) || 0,
      'Status': (u.status || 'pending').toUpperCase(),
      'Description': u.description || '',
      'Account': u.account || '',
      'Settled Date': u.settledAt || '',
      'Record ID': u.id || '',
    }));

    // 4. Fuel & Mileage Tracker Sheet Data
    const fuelLogsList = Array.isArray(store.fuelLogs) ? store.fuelLogs : [];
    const fuelLogsData = fuelLogsList.map((f) => ({
      'Date': f.date || '',
      'Time': f.time || '12:00',
      'Vehicle Name': f.vehicleName || 'Vehicle',
      'Fuel Amount (INR)': Number(f.fuelAmount) || 0,
      'Fuel Liters': f.fuelLiters !== undefined ? Number(f.fuelLiters) : '',
      'Odometer Reading (km)': Number(f.odometer) || 0,
      'Previous Odometer (km)': f.previousOdometer !== undefined ? Number(f.previousOdometer) : '',
      'Distance Covered (km)': f.distanceCovered !== undefined ? Number(f.distanceCovered) : '',
      'Calculated Mileage (km/L)': f.calculatedMileage !== undefined ? Number(f.calculatedMileage) : '',
      'Cost Per Km (INR)': f.costPerKm !== undefined ? Number(f.costPerKm) : '',
      'Notes': f.notes || '',
      'Log ID': f.id || '',
    }));

    // 5. Investments Portfolio Sheet Data
    const investmentsList = Array.isArray(store.investments) ? store.investments : [];
    const investmentsData = investmentsList.map((i) => ({
      'Date': i.date || '',
      'Type': i.type || 'RD',
      'Investment Name': i.name || '',
      'Amount (INR)': Number(i.amount) || 0,
      'Account': i.account || 'IC Bank',
      'Maturity Date': i.maturityDate || '',
      'Interest Rate (%)': i.interestRate !== undefined ? Number(i.interestRate) : '',
      'Notes': i.notes || '',
      'Investment ID': i.id || '',
    }));

    // 6. Savings & Pot Transfers Sheet Data
    const savingsList = Array.isArray(store.savingsTransfers) ? store.savingsTransfers : [];
    const savingsData = savingsList.map((s) => ({
      'Date': s.date || '',
      'Recipient': s.recipient || "Wife's Account",
      'Amount (INR)': Number(s.amount) || 0,
      'From Account': s.fromAccount || 'AX Bank',
      'Notes': s.notes || '',
      'Transfer ID': s.id || '',
    }));

    // 7. Credit Card EMIs Sheet Data
    const emisList = Array.isArray(store.cardEmis) ? store.cardEmis : [];
    const emisData = emisList.map((e) => ({
      'Card ID': e.cardId || 'SBI CC 5733',
      'EMI Title': e.title || '',
      'Monthly Amount (INR)': Number(e.monthlyAmount) || 0,
      'Total Months': Number(e.totalMonths) || 12,
      'Paid Months': Number(e.paidMonths) || 0,
      'Due Day': Number(e.dueDay) || 15,
      'Start Date': e.startDate || '',
      'Notes': e.notes || '',
      'EMI ID': e.id || '',
    }));

    // 8. Gullak & Savings Summary Sheet Data
    const gullakData = [
      { 'Metric / Field': 'Gullak Total Lifetime Savings (INR)', 'Value': gullakSummary.totalGullakSavings || 0 },
      { 'Metric / Field': 'Current Month Savings (INR)', 'Value': gullakSummary.currentMonthSaved || 0 },
      { 'Metric / Field': 'Previous Months Piggy Bank (INR)', 'Value': gullakSummary.pastMonthsSaved || 0 },
      { 'Metric / Field': 'Tracking Start Month', 'Value': user?.trackingStartMonth || gullakSummary.trackingStartMonth || 'Beginning of time' },
      { 'Metric / Field': 'Active History Months Count', 'Value': (gullakSummary.monthlyHistory || []).length },
    ];
    if (Array.isArray(gullakSummary.monthlyHistory)) {
      for (const m of gullakSummary.monthlyHistory) {
        gullakData.push({
          'Metric / Field': `Month ${m.month} Savings`,
          'Value': `${(m.savings || 0) >= 0 ? '+' : '-'}₹${Math.abs(m.savings || 0)} (Budget: ₹${m.budgetTotal || 0}, Spent: ₹${m.spentTotal || 0})`,
        });
      }
    }

    // 9. Account & Linked Members Sheet Data
    const accountData = [
      { 'Setting / Property': 'Account Name', 'Value': user?.name || 'Main Ledger' },
      { 'Setting / Property': 'Account Email', 'Value': user?.email || 'N/A' },
      { 'Setting / Property': 'Account ID', 'Value': userId },
      { 'Setting / Property': 'Telegram Chat ID', 'Value': user?.telegramChatId || 'Not Linked' },
      { 'Setting / Property': 'Telegram Username', 'Value': user?.telegramUsername ? `@${user.telegramUsername}` : 'Not Set' },
      { 'Setting / Property': 'Link Code', 'Value': user?.linkCode ? `/link ${user.linkCode}` : 'N/A' },
      { 'Setting / Property': 'Gullak Tracking Start Month', 'Value': user?.trackingStartMonth || 'Not set' },
      { 'Setting / Property': 'Backup Created At', 'Value': new Date().toLocaleString('en-IN') },
      { 'Setting / Property': 'Total Transactions Count', 'Value': txList.length },
      { 'Setting / Property': 'Total Categories Count', 'Value': categoriesList.length },
      { 'Setting / Property': 'Total Udhaar Records Count', 'Value': udhaarsList.length },
      { 'Setting / Property': 'Total Fuel Logs Count', 'Value': fuelLogsList.length },
      { 'Setting / Property': 'Total Investments Count', 'Value': investmentsList.length },
      { 'Setting / Property': 'Total Savings Transfers Count', 'Value': savingsList.length },
      { 'Setting / Property': 'Total Card EMIs Count', 'Value': emisList.length },
      { 'Setting / Property': 'Total Income (INR)', 'Value': summary.totalIncome || 0 },
      { 'Setting / Property': 'Total Expense (INR)', 'Value': summary.totalExpense || 0 },
      { 'Setting / Property': 'Net Balance (INR)', 'Value': summary.netSavings || 0 },
      { 'Setting / Property': 'Savings Rate', 'Value': `${summary.savingsRate || 0}%` },
    ];

    // Linked Family Members Sheet Data
    const linkedMembersData = (user?.linkedMembers && Array.isArray(user.linkedMembers) && user.linkedMembers.length > 0)
      ? user.linkedMembers.map(m => ({
          'Member Name': m.name || 'Member',
          'Custom Alias': m.customAlias || '',
          'Telegram Chat ID': m.telegramChatId || '',
          'Telegram Username': m.telegramUsername ? `@${m.telegramUsername}` : 'N/A',
          'Role': m.role || 'member',
          'Linked At': m.linkedAt || '',
        }))
      : [{ 'Member Name': user?.name || 'Owner', 'Custom Alias': '', 'Telegram Chat ID': user?.telegramChatId || '', 'Telegram Username': user?.telegramUsername || '', 'Role': 'owner', 'Linked At': '' }];

    // 10. Raw Full State JSON chunked safely (Never exceed Excel 32,767 cell limit)
    const fullJsonString = JSON.stringify({
      version: '4.0',
      exportedAt: new Date().toISOString(),
      user: user ? {
        id: user.id,
        name: user.name,
        email: user.email,
        telegramChatId: user.telegramChatId,
        telegramUsername: user.telegramUsername,
        linkCode: user.linkCode,
        trackingStartMonth: user.trackingStartMonth,
        linkedMembers: user.linkedMembers,
      } : null,
      categories: categoriesList,
      budgets: budgetsList,
      transactions: txList,
      udhaars: udhaarsList,
      fuelLogs: fuelLogsList,
      investments: investmentsList,
      savingsTransfers: savingsList,
      cardEmis: emisList,
    });

    const CHUNK_SIZE = 15000;
    const rawBackupPayload: any[] = [];
    const totalChunks = Math.ceil(fullJsonString.length / CHUNK_SIZE) || 1;

    for (let i = 0; i < totalChunks; i++) {
      const slice = fullJsonString.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      rawBackupPayload.push({
        'BackupVersion': '4.0',
        'ChunkIndex': i + 1,
        'TotalChunks': totalChunks,
        'DataJSON': slice,
      });
    }

    const workbook = XLSX.utils.book_new();

    // Add Sheet 1: Transactions Ledger
    const wsTx = XLSX.utils.json_to_sheet(transactionsData.length > 0 ? transactionsData : [{ 'Date': '', 'Type': '', 'Amount (INR)': '', 'Category': '', 'Description': '' }]);
    XLSX.utils.book_append_sheet(workbook, wsTx, 'Transactions Ledger');

    // Add Sheet 2: Categories & Budgets
    const wsCats = XLSX.utils.json_to_sheet(categoriesData.length > 0 ? categoriesData : [{ 'Category Name': 'Default', 'Type': 'expense', 'Monthly Budget Limit (INR)': 0 }]);
    XLSX.utils.book_append_sheet(workbook, wsCats, 'Categories & Budgets');

    // Add Sheet 3: Udhaar Khata
    const wsUdhaars = XLSX.utils.json_to_sheet(udhaarsData.length > 0 ? udhaarsData : [{ 'Date': '', 'Type': '', 'Person Name': '', 'Amount (INR)': 0, 'Status': '' }]);
    XLSX.utils.book_append_sheet(workbook, wsUdhaars, 'Udhaar Khata');

    // Add Sheet 4: Fuel & Mileage Tracker
    const wsFuel = XLSX.utils.json_to_sheet(fuelLogsData.length > 0 ? fuelLogsData : [{ 'Date': '', 'Vehicle Name': '', 'Fuel Amount (INR)': 0, 'Odometer Reading (km)': 0 }]);
    XLSX.utils.book_append_sheet(workbook, wsFuel, 'Fuel & Mileage Tracker');

    // Add Sheet 5: Investments Portfolio
    const wsInvestments = XLSX.utils.json_to_sheet(investmentsData.length > 0 ? investmentsData : [{ 'Date': '', 'Type': 'RD', 'Investment Name': '', 'Amount (INR)': 0 }]);
    XLSX.utils.book_append_sheet(workbook, wsInvestments, 'Investments Portfolio');

    // Add Sheet 6: Savings & Pot Transfers
    const wsSavings = XLSX.utils.json_to_sheet(savingsData.length > 0 ? savingsData : [{ 'Date': '', 'Recipient': "Wife's Account", 'Amount (INR)': 0 }]);
    XLSX.utils.book_append_sheet(workbook, wsSavings, 'Savings Transfers');

    // Add Sheet 7: Credit Card EMIs
    const wsEmis = XLSX.utils.json_to_sheet(emisData.length > 0 ? emisData : [{ 'Card ID': 'SBI CC 5733', 'EMI Title': '', 'Monthly Amount (INR)': 0 }]);
    XLSX.utils.book_append_sheet(workbook, wsEmis, 'Credit Card EMIs');

    // Add Sheet 8: Gullak & Savings Summary
    const wsGullak = XLSX.utils.json_to_sheet(gullakData);
    XLSX.utils.book_append_sheet(workbook, wsGullak, 'Gullak & Savings');

    // Add Sheet 9: Account & Linked Members
    const wsAcc = XLSX.utils.json_to_sheet(accountData);
    XLSX.utils.book_append_sheet(workbook, wsAcc, 'Account Details');

    const wsMembers = XLSX.utils.json_to_sheet(linkedMembersData);
    XLSX.utils.book_append_sheet(workbook, wsMembers, 'Linked Members');

    // Add Sheet 10: Internal High-Fidelity JSON Backup Data
    const wsMeta = XLSX.utils.json_to_sheet(rawBackupPayload);
    XLSX.utils.book_append_sheet(workbook, wsMeta, '_TeleExpense_Backup_Data_');

    const sanitizedName = (user?.name || 'Ledger').replace(/[^a-zA-Z0-9_]/g, '_');
    const fileName = `TeleExpense_Full_Backup_${sanitizedName}_${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      const csvContent = XLSX.utils.sheet_to_csv(wsTx);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`);
      return res.send(csvContent);
    } else {
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
      const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.xlsx"`);
      res.setHeader('Content-Length', nodeBuffer.length);
      return res.end(nodeBuffer);
    }
  } catch (err: any) {
    console.error('Error exporting backup:', err);
    return res.status(500).json({ error: err?.message || 'Failed to export backup' });
  }
});

// GULLAK PIGGY BANK API ENDPOINTS
app.get('/api/gullak', (req, res) => {
  try {
    const user = getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: 'User session not found' });
    }
    const gullak = calculateGullakSummary(user.id);
    return res.json({
      ...gullak,
      trackingStartMonth: user.trackingStartMonth || (user.createdAt ? user.createdAt.substring(0, 7) : undefined),
    });
  } catch (err: any) {
    console.error('Error in /api/gullak:', err);
    return res.status(500).json({ error: err?.message || 'Failed to fetch Gullak data' });
  }
});

app.post(['/api/gullak/start-month', '/api/users/tracking-start-month'], (req, res) => {
  try {
    const user = getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: 'User session not found' });
    }
    const { startMonth } = req.body;
    if (!startMonth || !/^\d{4}-\d{2}$/.test(startMonth)) {
      return res.status(400).json({ error: 'Valid start month in format YYYY-MM is required (e.g. 2026-09)' });
    }

    user.trackingStartMonth = startMonth;
    saveJson(USERS_FILE, users);
    persistToPg('users', users).catch(() => {});

    const gullak = calculateGullakSummary(user.id);
    return res.json({
      success: true,
      message: `Gullak tracking start month set to ${startMonth}`,
      trackingStartMonth: startMonth,
      gullak,
      user: toSafeUser(user),
    });
  } catch (err: any) {
    console.error('Error updating Gullak start month:', err);
    return res.status(500).json({ error: err?.message || 'Failed to update start month' });
  }
});

// 5. Telegram Bot Config & Status (with 5-minute memory cache to prevent outbound bandwidth drain)
let cachedBotInfo: any = null;
let cachedWebhookInfo: any = null;
let lastTelegramApiCheck = 0;

app.get('/api/telegram/config', async (req, res) => {
  const currentToken = process.env.TELEGRAM_BOT_TOKEN || botConfig.botToken || '';
  const appUrl = 'https://ais-dev-tqtvhllm5ccjbvvdxz44bm-657007980218.asia-east1.run.app';
  const webhookUrl = `${appUrl}/api/telegram/webhook`;

  const forceRefresh = req.query.refresh === 'true';
  const now = Date.now();

  let botInfo: any = cachedBotInfo;
  let webhookInfo: any = cachedWebhookInfo;

  if (currentToken && (forceRefresh || !cachedBotInfo || now - lastTelegramApiCheck > 5 * 60 * 1000)) {
    try {
      lastTelegramApiCheck = now;
      const meRes = await safeTelegramFetch(`https://api.telegram.org/bot${currentToken}/getMe`);
      if (meRes && meRes.ok) {
        const meData = await meRes.json().catch(() => null);
        if (meData && meData.ok) {
          botInfo = meData.result;
          cachedBotInfo = botInfo;
          botConfig.botUsername = botInfo.username;
          botConfig.botName = botInfo.first_name;
        }
      }

      const hookRes = await safeTelegramFetch(`https://api.telegram.org/bot${currentToken}/getWebhookInfo`);
      if (hookRes && hookRes.ok) {
        const hookData = await hookRes.json().catch(() => null);
        if (hookData && hookData.ok) {
          webhookInfo = hookData.result;
          cachedWebhookInfo = webhookInfo;
        }
      }
    } catch {
      // Safe fallback on transient network drop
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
      const meRes = await safeTelegramFetch(`https://api.telegram.org/bot${botConfig.botToken}/getMe`);
      if (meRes && meRes.ok) {
        const meData = await meRes.json().catch(() => null);
        if (meData && meData.ok) {
          botConfig.botUsername = meData.result.username;
          botConfig.botName = meData.result.first_name;
          botConfig.isConnected = true;
          botConfig.isWebhookSet = true;
        }
      }
      // Auto sync handy commands and menu button
      await syncTelegramBotCommandsAndMenu(botConfig.botToken);
    } catch (err: any) {
      botConfig.lastError = err.message;
    }
  }

  saveJson(BOT_CONFIG_FILE, botConfig);
  res.json({ success: true, config: botConfig });
});

// Endpoint to manually or automatically trigger menu & commands synchronization
app.all('/api/telegram/sync-commands', async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN || botConfig.botToken || '';
  if (!token) {
    return res.status(400).json({ success: false, error: 'Telegram bot token is not configured.' });
  }
  const success = await syncTelegramBotCommandsAndMenu(token);
  res.json({
    success,
    message: success ? 'Telegram handy commands and menu list synced successfully!' : 'Failed to sync commands with Telegram.',
    commands: TELEGRAM_BOT_COMMANDS,
  });
});

// 6. Telegram Logs & Simulator
app.get('/api/telegram/logs', (req, res) => {
  res.json({ logs: telegramLogs });
});

app.delete('/api/telegram/logs', (req, res) => {
  telegramLogs = [];
  saveJson(LOGS_FILE, telegramLogs);
  res.json({ success: true, count: 0 });
});

app.post('/api/telegram/simulate-message', async (req, res) => {
  users = loadJson<UserProfile[]>(USERS_FILE, users);
  const activeUser = getRequestUser(req) || users.find(u => u.telegramChatId) || users[0];
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message text is required' });
  }

  const simulatedChatId = activeUser?.telegramChatId || activeUser?.linkedMembers?.[0]?.telegramChatId || '838107368';
  await handleTelegramMessage({
    chat: { id: simulatedChatId },
    from: { first_name: activeUser?.name || 'User', username: activeUser?.telegramUsername || 'webuser' },
    text: message.trim(),
  });

  const targetId = activeUser ? activeUser.id : 'user_ansh';
  const store = getUserData(targetId);
  res.json({ success: true, transactions: store.transactions, summary: calculateUserSummary(targetId) });
});

// ---------------- AI Financial Advisor & Faltu Kharcha Engine ----------------

export function calculateAvoidableSpending(transactions: Transaction[]) {
  const expenses = transactions.filter(t => t.type === 'expense');
  const totalExpenseAmount = expenses.reduce((acc, t) => acc + t.amount, 0);

  if (totalExpenseAmount === 0 || expenses.length === 0) {
    return {
      totalAvoidableAmount: 0,
      percentageOfExpenses: 0,
      potentialMonthlySavings: 0,
      potentialYearlySavings: 0,
      items: [],
    };
  }

  // Distinct Indian Discretionary Expense Categories & Keywords
  const alcoholKeywords = [
    'daru', 'daaru', 'sharab', 'sharabi', 'alcohol', 'beer', 'wine', 'whiskey', 'whisky', 'rum',
    'vodka', 'gin', 'brandy', 'theka', 'liquor', 'bira', 'tuborg', 'kingfisher', 'corona',
    'chakhna', 'chakna', 'bar', 'pub', 'club', 'cocktail', 'scotch', 'champagne'
  ];

  const tobaccoKeywords = [
    'sutta', 'cigarette', 'cigarettes', 'bidi', 'beedi', 'cigar', 'hookah', 'vape',
    'tobacco', 'tambaku', 'gutkha', 'paan', 'pan', 'kamla pasand', 'rajshree', 'vimal', 'chaini'
  ];

  const diningDeliveryKeywords = [
    'zomato', 'swiggy', 'pizza', 'burger', 'cafe', 'starbucks', 'mcdonalds', 'kfc',
    'dominos', 'subway', 'burger king', 'fast food', 'ice cream', 'dessert', 'chocolates',
    'pastry', 'cake', 'late night', 'junk', 'eating out', 'restaurant', 'dhaba', 'barbeque'
  ];

  const entertainmentKeywords = [
    'netflix', 'hotstar', 'prime video', 'gaming', 'steam', 'game', 'pvr', 'cinema', 'movie',
    'party', 'outing', 'club', 'concert'
  ];

  const shoppingKeywords = [
    'shopping', 'clothes', 'jeans', 'shoes', 'dress', 'zara', 'h&m', 'myntra',
    'unnecessary', 'impulse', 'gadget', 'headphones'
  ];

  let totalAvoidable = 0;
  const itemMap = new Map<string, { title: string; category: string; amount: number; reason: string; count: number }>();

  for (const t of expenses) {
    const descLower = (t.description || '').toLowerCase().trim();
    const catLower = (t.category || '').toLowerCase().trim();
    const rawLower = (t.rawMessage || '').toLowerCase().trim();
    const textToMatch = `${descLower} ${rawLower}`;

    let isDiscretionary = false;
    let reason = '';
    let itemCategory = t.category;

    if (alcoholKeywords.some(k => textToMatch.includes(k))) {
      isDiscretionary = true;
      reason = 'Daru / Sharab / Alcohol kharcha (100% avoidable)';
      itemCategory = 'Entertainment & Fun';
    } else if (tobaccoKeywords.some(k => textToMatch.includes(k))) {
      isDiscretionary = true;
      reason = 'Sutta / Tobacco / Pan Masala (100% avoidable)';
      itemCategory = 'Entertainment & Fun';
    } else if (diningDeliveryKeywords.some(k => textToMatch.includes(k))) {
      isDiscretionary = true;
      reason = 'Bahar ka khana ya food delivery order';
      itemCategory = 'Food & Dining';
    } else if (catLower.includes('entertainment') || entertainmentKeywords.some(k => textToMatch.includes(k))) {
      isDiscretionary = true;
      reason = 'Movies, streaming ya party/entertainment';
      itemCategory = 'Entertainment & Fun';
    } else if (catLower.includes('shopping') || shoppingKeywords.some(k => textToMatch.includes(k))) {
      isDiscretionary = true;
      reason = 'Shopping ya non-essential purchase';
      itemCategory = 'Shopping & Apparel';
    }

    if (isDiscretionary) {
      totalAvoidable += t.amount;
      const key = `${itemCategory}_${descLower || 'faltu'}`;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          title: t.description || 'Avoidable Expense',
          category: itemCategory,
          amount: t.amount,
          reason,
          count: 1,
        });
      } else {
        const item = itemMap.get(key)!;
        item.amount += t.amount;
        item.count += 1;
      }
    }
  }

  const items = Array.from(itemMap.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8)
    .map(i => ({
      title: i.title,
      category: i.category,
      amount: i.amount,
      reason: i.reason,
    }));

  const percentage = totalExpenseAmount > 0 ? Math.min(100, Math.round((totalAvoidable / totalExpenseAmount) * 100)) : 0;
  
  // Potential monthly savings:
  // If user only has pure avoidable expenses (like daru/sutta/party), potential savings is 100% of that spend!
  // If mixed or large, realistic 80% can be saved.
  const monthlySavings = totalAvoidable <= 1000 ? totalAvoidable : Math.round(totalAvoidable * 0.8);
  const yearlySavings = monthlySavings * 12;

  return {
    totalAvoidableAmount: totalAvoidable,
    percentageOfExpenses: percentage,
    potentialMonthlySavings: monthlySavings,
    potentialYearlySavings: yearlySavings,
    items,
  };
}

export async function generateAiFinancialInsights(userId: string) {
  const store = getUserData(userId);
  const user = users.find(u => u.id === userId) || { name: 'User', id: userId };
  const summary = calculateUserSummary(userId);
  const ruleBased = calculateAvoidableSpending(store.transactions);
  const ai = getGeminiClient();

  const categoryTotals: Record<string, number> = {};
  for (const t of store.transactions) {
    if (t.type === 'expense') {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    }
  }

  // Dynamic smart tips based on specific user transactions
  const defaultTips: string[] = [];
  const hasAlcohol = ruleBased.items.some(i => i.reason.includes('Alcohol') || i.title.toLowerCase().includes('daru'));
  const hasTobacco = ruleBased.items.some(i => i.reason.includes('Tobacco') || i.title.toLowerCase().includes('sutta') || i.title.toLowerCase().includes('kamla'));
  const hasDining = ruleBased.items.some(i => i.category.includes('Food') || i.reason.includes('delivery'));

  if (hasAlcohol) {
    const alcoholSpend = ruleBased.items.filter(i => i.reason.includes('Alcohol') || i.title.toLowerCase().includes('daru')).reduce((a, b) => a + b.amount, 0);
    defaultTips.push(`🍻 Daru / Alcohol Cut: ₹${alcoholSpend} ki daru 100% avoidable kharcha hai. Ise rokne se seedhe mahine ke ₹${alcoholSpend} (saal ke ₹${alcoholSpend * 12}) bachenge!`);
  }
  if (hasTobacco) {
    defaultTips.push(`🚭 Sutta / Pan Masala Cut: Daily pocket leak ko rokein, health aur pocket dono fit rahenge (Bachat: ~₹1,000-₹2,000/mo).`);
  }
  if (hasDining) {
    defaultTips.push(`🍔 50% Food Delivery Cut: Swiggy/Zomato ya bahar se khane ko hafte me sirf 1 baar limit karein (Bachat: ~₹2,000/mo).`);
  }
  if (defaultTips.length < 3) {
    defaultTips.push('⏳ 24-Hour Cart Rule: Koi bhi non-essential cheez online khareedne se pehle 24 ghante cart me chhod dein (Bachat: ~₹1,500/mo).');
  }
  if (defaultTips.length < 3) {
    defaultTips.push('📈 SIP Auto-Debit: Salary aate hi kam se kam 20% paisa pehle Mutual Fund SIP ya RD me transfer karein.');
  }

  let overviewText = '';
  if (ruleBased.totalAvoidableAmount > 0) {
    if (ruleBased.percentageOfExpenses === 100) {
      overviewText = `Aapne kul ₹${summary.totalExpense.toLocaleString('en-IN')} kharch kiye hain, aur ye poora ₹${ruleBased.totalAvoidableAmount.toLocaleString('en-IN')} (100%) avoidable / faltu kharcha hai jise control karke poori bachat ki ja sakti hai.`;
    } else {
      overviewText = `Aapne kul ₹${summary.totalExpense.toLocaleString('en-IN')} kharch kiye hain, jisme se ₹${ruleBased.totalAvoidableAmount.toLocaleString('en-IN')} (${ruleBased.percentageOfExpenses}%) avoidable / faltu kharcha hai.`;
    }
  } else {
    overviewText = `Aapne kul ₹${summary.totalExpense.toLocaleString('en-IN')} kharch kiye hain. Bahut badhiya! Aapka koi bhi faltu kharcha detect nahi hua hai.`;
  }

  const fallbackInsights = {
    overview: overviewText,
    healthScore: Math.min(100, Math.max(10, Math.round(summary.savingsRate * 0.7 + (100 - ruleBased.percentageOfExpenses) * 0.3))),
    verdict: (ruleBased.percentageOfExpenses >= 75 ? 'Critical' : ruleBased.percentageOfExpenses >= 35 ? 'Needs Attention' : 'Good') as 'Excellent' | 'Good' | 'Needs Attention' | 'Critical',
    keyInsights: [
      `Kul Kamai: ₹${summary.totalIncome.toLocaleString('en-IN')} | Kul Kharcha: ₹${summary.totalExpense.toLocaleString('en-IN')}`,
      `Bachat Dar (Savings Rate): ${summary.savingsRate}%`,
      ruleBased.totalAvoidableAmount > 0
        ? `Aapke kharcho me se ₹${ruleBased.totalAvoidableAmount.toLocaleString('en-IN')} (${ruleBased.percentageOfExpenses}%) poori tarah avoidable / faltu cheezon par hua hai.`
        : 'Aapne apne kharcho ko bohot acche se control me rakha hua hai!',
    ],
    savingTips: defaultTips.slice(0, 3),
    avoidableExpenses: {
      totalAvoidableAmount: ruleBased.totalAvoidableAmount,
      percentageOfExpenses: ruleBased.percentageOfExpenses,
      potentialMonthlySavings: ruleBased.potentialMonthlySavings,
      potentialYearlySavings: ruleBased.potentialYearlySavings,
      investmentAdvice: `Agar aap har mahine ₹${ruleBased.potentialMonthlySavings.toLocaleString('en-IN')} ki ye bachat Nifty 50 Index SIP me lagayein, to 12% returns ke hisaab se 3 saal me lagbhag ₹${Math.round(ruleBased.potentialMonthlySavings * 42.5).toLocaleString('en-IN')} aur 5 saal me ₹${Math.round(ruleBased.potentialMonthlySavings * 82.5).toLocaleString('en-IN')} ban sakte hain!`,
      items: ruleBased.items,
    }
  };

  if (!ai || store.transactions.length === 0) {
    return fallbackInsights;
  }

  const prompt = `You are an expert Indian personal finance advisor and expense coach analyzing ${user.name}'s transactions with a razor-sharp focus on identifying "Faltu Kharcha" (avoidable, unnecessary, impulsive, or discretionary spending) and calculating exact potential savings.

Financial Overview:
- User Name: ${user.name}
- Total Income: ₹${summary.totalIncome}
- Total Expenses: ₹${summary.totalExpense}
- Net Balance: ₹${summary.netSavings}
- Savings Rate: ${summary.savingsRate}%
- Category-wise Expense Totals: ${JSON.stringify(categoryTotals)}
- Recent Expenses List: ${JSON.stringify(store.transactions.filter(t => t.type === 'expense').slice(0, 30).map(t => ({ desc: t.description, cat: t.category, amt: t.amount, date: t.date, method: t.paymentMethod })))}
- Pre-analyzed Rule-based Discretionary Items: ${JSON.stringify(ruleBased)}

CRITICAL CALCULATION ACCURACY RULES (DO NOT VIOLATE):
1. Notice every avoidable expense accurately: "daru", "alcohol", "beer", "sutta", "cigarettes", "party", "club", "zomato", "swiggy", etc.
2. If the user only has ₹500 expense on "daru", then the avoidable expense is EXACTLY ₹500 (100% of the expense). NEVER return ₹200 or any partial arbitrary fraction for 100% avoidable spending!
3. If user controls or stops buying daru/alcohol, the potential monthly savings is ₹500, and yearly savings is ₹6,000 (500 * 12).
4. Explain clearly in friendly, witty Hinglish:
   - Exactly where the user is spending money on avoidable things ("daru pe kharch ho raha hai").
   - Exactly how much was spent on them ("itna kharch aapne faltu ki chizo pe kiya hai").
   - Exactly how much can be saved if controlled ("agar ise control karein to mahine me ₹500 aur saal me ₹6,000 ki bachat ho sakti hai").
   - Wealth projection: investing this saved amount in Nifty 50 Index SIP.
5. Provide 3 practical Hinglish action tips specifically addressing their spending.

Return ONLY a valid JSON object with this exact schema:
{
  "overview": string (2-3 sentences in natural Hinglish explaining the verdict and total avoidable spending),
  "healthScore": number (0 to 100),
  "verdict": "Excellent" | "Good" | "Needs Attention" | "Critical",
  "keyInsights": string[] (3-4 bullet points highlighting specific observations),
  "savingTips": string[] (3 specific practical tips with estimated savings),
  "avoidableExpenses": {
    "totalAvoidableAmount": number (total amount of avoidable expenses identified),
    "percentageOfExpenses": number (percentage of total expenses, e.g. 100),
    "potentialMonthlySavings": number (monthly savings if controlled),
    "potentialYearlySavings": number (yearly savings if controlled),
    "investmentAdvice": string (friendly Hinglish advice on investing this saved amount in SIP/RD),
    "items": [
      {
        "title": string (e.g. "Daru / Alcohol"),
        "category": string,
        "amount": number,
        "reason": string (brief reason why it's avoidable)
      }
    ]
  }
}`;

  try {
    const result = await callGeminiCandidateModels(ai, prompt, { jsonMode: true });

    if (result && result.text) {
      const parsed = JSON.parse(result.text.trim());
      if (parsed && typeof parsed.healthScore === 'number' && parsed.avoidableExpenses) {
        parsed.avoidableExpenses.totalAvoidableAmount = Number(parsed.avoidableExpenses.totalAvoidableAmount) || ruleBased.totalAvoidableAmount;
        // Ensure that if rule-based detected higher avoidable items (e.g. ₹500 daru), AI doesn't under-report it
        if (ruleBased.totalAvoidableAmount > 0 && parsed.avoidableExpenses.totalAvoidableAmount < ruleBased.totalAvoidableAmount) {
          parsed.avoidableExpenses.totalAvoidableAmount = ruleBased.totalAvoidableAmount;
        }
        parsed.avoidableExpenses.percentageOfExpenses = summary.totalExpense > 0 
          ? Math.min(100, Math.round((parsed.avoidableExpenses.totalAvoidableAmount / summary.totalExpense) * 100))
          : 0;
        parsed.avoidableExpenses.potentialMonthlySavings = Number(parsed.avoidableExpenses.potentialMonthlySavings) || ruleBased.potentialMonthlySavings;
        parsed.avoidableExpenses.potentialYearlySavings = Number(parsed.avoidableExpenses.potentialYearlySavings) || (parsed.avoidableExpenses.potentialMonthlySavings * 12);
        if (!Array.isArray(parsed.avoidableExpenses.items) || parsed.avoidableExpenses.items.length === 0) {
          parsed.avoidableExpenses.items = ruleBased.items;
        }
        return parsed;
      }
    }
  } catch (err: any) {
    console.error('Gemini insights generator error:', err.message);
  }

  return fallbackInsights;
}

// ---------------- Helper to format AI Markdown for Telegram HTML ----------------
export function formatMarkdownToTelegramHtml(text: string): string {
  if (!text) return '';
  let formatted = text
    // Replace ```blocks``` with <pre>
    .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
    // Replace `inline code` with <code>
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Replace **bold** with <b>bold</b>
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    // Replace *italic* or _italic_ with <i>italic</i>
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<i>$1</i>')
    // Replace markdown headers ### Header with <b>Header</b>
    .replace(/^###?\s+(.+)$/gm, '<b>$1</b>')
    // Replace markdown list item - or * with bullet •
    .replace(/^[-*]\s+/gm, '• ');
  return formatted;
}

// ---------------- Gemini Conversational AI Financial Advisor ----------------
export async function answerAiFinancialQuestion(
  userId: string,
  userQuestion: string,
  conversationHistory?: Array<{ role: 'user' | 'model'; text: string }>
): Promise<{ text: string; model: string; source: 'gemini' | 'rule_fallback' }> {
  const store = getUserData(userId);
  const user = users.find(u => u.id === userId) || { name: 'User', id: userId, email: 'user@example.com' };
  const summary = calculateUserSummary(userId);
  const accountBalances = calculateAccountsBalances(userId);
  const ruleBasedAvoidable = calculateAvoidableSpending(store.transactions || []);

  const istInfo = getAppDateTime();
  const currentMonthPrefix = istInfo.date.substring(0, 7); // e.g. "2026-10"

  // Month-by-month aggregation map
  interface MonthSummaryData {
    monthKey: string; // "2026-10"
    monthName: string; // "October 2026"
    isCurrentMonth: boolean;
    income: number;
    totalExpense: number;
    personalExpense: number;
    savingsTransfers: number;
    reimbursements: number;
    netSavings: number;
    savingsRate: number;
    transactionCount: number;
    categories: Record<string, number>;
    topTransactions: Array<{ date: string; amount: number; type: string; description: string; category: string; paymentMethod: string }>;
  }

  const monthsMap = new Map<string, MonthSummaryData>();
  const txList = store.transactions || [];

  for (const t of txList) {
    const rawDate = t.date || istInfo.date;
    const mKey = rawDate.substring(0, 7);
    if (!monthsMap.has(mKey)) {
      const [yStr, mStr] = mKey.split('-');
      const mIdx = parseInt(mStr, 10) - 1;
      const mNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const mName = mIdx >= 0 && mIdx < 12 ? `${mNames[mIdx]} ${yStr}` : mKey;
      monthsMap.set(mKey, {
        monthKey: mKey,
        monthName: mName,
        isCurrentMonth: mKey === currentMonthPrefix,
        income: 0,
        totalExpense: 0,
        personalExpense: 0,
        savingsTransfers: 0,
        reimbursements: 0,
        netSavings: 0,
        savingsRate: 0,
        transactionCount: 0,
        categories: {},
        topTransactions: []
      });
    }

    const mData = monthsMap.get(mKey)!;
    const amt = Number(t.amount) || 0;
    mData.transactionCount++;

    if (t.type === 'income') {
      mData.income += amt;
    } else {
      mData.totalExpense += amt;
      const isRim = Boolean(t.isReimbursement || t.category === 'Reimbursement');
      if (isRim) {
        mData.reimbursements += amt;
      } else if (t.isSavingsTransfer) {
        mData.savingsTransfers += amt;
      } else {
        mData.personalExpense += amt;
        mData.categories[t.category] = (mData.categories[t.category] || 0) + amt;
      }
    }

    if (mData.topTransactions.length < 8) {
      mData.topTransactions.push({
        date: t.date,
        amount: amt,
        type: t.type,
        description: t.description,
        category: t.category,
        paymentMethod: t.account || t.paymentMethod
      });
    }
  }

  // Calculate net savings and savings rates for each month
  for (const mData of monthsMap.values()) {
    mData.netSavings = mData.income - mData.personalExpense;
    mData.savingsRate = mData.income > 0 ? Math.max(0, Math.round((mData.netSavings / mData.income) * 100)) : 0;
  }

  // Sorted months descending (latest month first)
  const sortedMonths = Array.from(monthsMap.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  
  // Ensure current month exists in the list even if no transactions yet
  let currentMonthData = sortedMonths.find(m => m.monthKey === currentMonthPrefix);
  if (!currentMonthData) {
    const [yStr, mStr] = currentMonthPrefix.split('-');
    const mIdx = parseInt(mStr, 10) - 1;
    const mNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const mName = mIdx >= 0 && mIdx < 12 ? `${mNames[mIdx]} ${yStr}` : currentMonthPrefix;
    currentMonthData = {
      monthKey: currentMonthPrefix,
      monthName: mName,
      isCurrentMonth: true,
      income: 0,
      totalExpense: 0,
      personalExpense: 0,
      savingsTransfers: 0,
      reimbursements: 0,
      netSavings: 0,
      savingsRate: 0,
      transactionCount: 0,
      categories: {},
      topTransactions: []
    };
  }

  const accountsMap = accountBalances?.accounts || {};
  const bankAccounts = Object.entries(accountsMap).filter(([_, a]) => a && (a.type === 'bank_account' || a.type === 'cash'));
  const creditCards = Object.entries(accountsMap).filter(([_, a]) => a && (a.type === 'credit_card' || a.type === 'rupay_card'));
  const wifeSavings = accountBalances?.wifeSavings || { baseBalance: 0, totalTransferred: 0, currentBalance: 0 };

  const goals: any[] = (store as any).goals || (store as any).piggyBankFunds || [];
  const investments = store.investments || [];
  const totalInvestmentValue = investments.reduce((sum, inv) => sum + (Number(inv.currentValue || inv.amount) || 0), 0);
  const totalInvestedPrincipal = investments.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

  const udhaars = store.udhaars || [];
  const pendingLent = udhaars.filter(u => u.status === 'pending' && u.type === 'lent').reduce((sum, u) => sum + (Number(u.amount) || 0), 0);
  const pendingBorrowed = udhaars.filter(u => u.status === 'pending' && u.type === 'borrowed').reduce((sum, u) => sum + (Number(u.amount) || 0), 0);

  const allCategoryTotals: Record<string, number> = {};
  for (const t of txList) {
    if (t.type === 'expense' && !t.isReimbursement && !t.isSavingsTransfer) {
      allCategoryTotals[t.category] = (allCategoryTotals[t.category] || 0) + (Number(t.amount) || 0);
    }
  }

  const ai = getGeminiClient();

  const systemContextPrompt = `You are an elite, certified Indian Personal Wealth Coach and Financial Planner exclusively dedicated to ${user.name}.
You have direct, real-time access to ${user.name}'s complete live personal financial ledger:

=== 📅 LIVE MONTH-BY-MONTH FINANCIAL BREAKDOWN (SEPARATE DATA FOR EACH MONTH) ===
${sortedMonths.map(m => `
🗓️ MONTH: ${m.monthName} (${m.monthKey}) ${m.isCurrentMonth ? '[CURRENT ACTIVE MONTH]' : ''}
• Total Income: ₹${m.income.toLocaleString('en-IN')}
• Personal Expenses: ₹${m.personalExpense.toLocaleString('en-IN')} (Total Outflows: ₹${m.totalExpense.toLocaleString('en-IN')})
• Net Monthly Savings: ₹${m.netSavings.toLocaleString('en-IN')}
• Monthly Savings Rate: ${m.savingsRate}%
• Category Spends in this month: ${Object.entries(m.categories).map(([c, a]) => `${c}: ₹${a.toLocaleString('en-IN')}`).join(', ') || 'None'}
• Key Transactions in this month: ${m.topTransactions.map(t => `${t.date}: ${t.type === 'income' ? '+' : '-'}₹${t.amount.toLocaleString('en-IN')} (${t.description})`).join('; ') || 'None'}
`).join('\n') || 'No monthly transactions logged yet.'}

=== 📊 ALL-TIME CUMULATIVE STATS (LIFETIME TOTAL OF ALL MONTHS COMBINED) ===
• All-Time Total Income (All months): ₹${(Number(summary?.totalIncome) || 0).toLocaleString('en-IN')}
• All-Time Total Expenses (All months): ₹${(Number(summary?.totalExpense) || 0).toLocaleString('en-IN')}
• All-Time Net Balance / Bank Holdings: ₹${(Number(summary?.totalNetSavings || summary?.netSavings) || 0).toLocaleString('en-IN')}
• Current Month (${currentMonthData.monthName}) Income: ₹${currentMonthData.income.toLocaleString('en-IN')}
• Current Month (${currentMonthData.monthName}) Personal Expenses: ₹${currentMonthData.personalExpense.toLocaleString('en-IN')}
• Current Month (${currentMonthData.monthName}) Net Savings: ₹${currentMonthData.netSavings.toLocaleString('en-IN')}

=== 🏦 BANK ACCOUNTS & CASH BALANCES ===
${bankAccounts.map(([id, a]) => `• ${a.name} (${id}): Live Balance ₹${(Number(a.balance) || 0).toLocaleString('en-IN')} (Base: ₹${(Number(a.baseBalance) || 0).toLocaleString('en-IN')}, Credits: ₹${(Number(a.totalCredits) || 0).toLocaleString('en-IN')}, Debits: ₹${(Number(a.totalDebits) || 0).toLocaleString('en-IN')})`).join('\n') || 'None'}

=== 💳 CREDIT CARDS (LIMITS, SPENDS & DUES) ===
${creditCards.map(([id, a]) => `• ${a.name} (${id}): Credit Limit ₹${(Number(a.creditLimit) || 0).toLocaleString('en-IN')}, Current Spends/Due ₹${(Number(a.currentOutstanding) || 0).toLocaleString('en-IN')}, Available Limit ₹${(Number(a.availableLimit) || 0).toLocaleString('en-IN')}`).join('\n') || 'None'}

=== 👩‍💼 WIFE SAVINGS & KHATA ===
• Starting Base: ₹${(Number(wifeSavings.baseBalance) || 0).toLocaleString('en-IN')}
• Total Transferred: ₹${(Number(wifeSavings.totalTransferred) || 0).toLocaleString('en-IN')}
• Live Current Balance: ₹${(Number(wifeSavings.currentBalance || ((Number(wifeSavings.baseBalance) || 0) + (Number(wifeSavings.totalTransferred) || 0))) || 0).toLocaleString('en-IN')}

=== 📈 INVESTMENTS & PORTFOLIO ===
• Total Portfolio Value: ₹${(Number(totalInvestmentValue) || 0).toLocaleString('en-IN')}
• Total Principal Invested: ₹${(Number(totalInvestedPrincipal) || 0).toLocaleString('en-IN')}
• Portfolio Items: ${investments.length > 0 ? investments.map(inv => `${inv.name || inv.type || 'Investment'} (Invested: ₹${(Number(inv.amount) || 0).toLocaleString('en-IN')}, Value: ₹${(Number(inv.currentValue || inv.amount) || 0).toLocaleString('en-IN')}, Type: ${inv.type || 'MF'})`).join('; ') : 'No investments logged yet'}

=== 🤝 UDHAAR KHATA (DEBTS & RECEIVABLES) ===
• Money you will receive (Lent pending): ₹${(Number(pendingLent) || 0).toLocaleString('en-IN')}
• Money you have to give (Borrowed pending): ₹${(Number(pendingBorrowed) || 0).toLocaleString('en-IN')}

=== 🎯 DEDICATED GOALS & PIGGY BANK FUNDS ===
${goals.length > 0 ? goals.map((g: any) => `• ${g.name || 'Goal'}: Saved ₹${(Number(g.currentBalance || g.currentAmount) || 0).toLocaleString('en-IN')} / Target ₹${(Number(g.targetAmount) || 0).toLocaleString('en-IN')}`).join('\n') : 'No dedicated goal funds created yet'}

=== 🚫 DETECTED FALTU / AVOIDABLE SPENDS ===
• Total Avoidable: ₹${(Number(ruleBasedAvoidable?.totalAvoidableAmount) || 0).toLocaleString('en-IN')} (${Number(ruleBasedAvoidable?.percentageOfExpenses) || 0}% of expenses)
• Items: ${ruleBasedAvoidable?.items?.map(i => `${i.title} (₹${(Number(i.amount) || 0).toLocaleString('en-IN')} - ${i.reason})`).join(', ') || 'None'}
=====================================================

USER'S QUESTION:
"${userQuestion}"

CRITICAL INSTRUCTIONS (MUST FOLLOW STRICTLY):
1. 🗣️ STRICT HINDI / HINGLISH LANGUAGE REQUIREMENT:
   - Aapko hamesha aur 100% STRICTLY aam bolchal ki Hindi / Hinglish me hi jawab dena hai (jaise Telegram chats me baat karte hain).
   - Pure English me jawab bilkul na dein! Technical financial terms (jaise SIP, Index Fund, Emergency Fund, Credit Card limit, Dues) English me likh sakte hain, par pura vakya aur explanation natural Hindi me hona chahiye.

2. 📆 MONTH-WISE ACCURACY & SEPARATION (KABHI BHI SABHI MAHINO KA TOTAL EK SAATH NA JODEIN):
   - KABHI BHI sabhi mahino ke expenses ya income ko ek saath jod kar kisi ek mahine ka kharcha mat batayein!
   - Agar user "is mahine", "this month", "current month", ya simple "kharcha / income" pooche, to SIRF aur SIRF Current Month (${currentMonthData.monthName}) ka hi data batao!
   - Agar user kisi specific month (jaise "October", "September", "August", "pichle mahine", "last month", "Jan", etc.) ke baare me pooche, to upar diye gaye live ledger me se SIRF us specific mahine ka Income, Expense aur Savings batao.
   - Agar user mahino ka comparison ya "month-wise" record maange, to har mahine ka alag-alag bullet point bana kar month-by-month breakdown batao.
   - All-Time cumulative total ko tabhi mention karo jab user explicitly "poora kul kharcha / all-time total / lifetime total" pooche, aur tab bhi saaf batao ki "Ye sabhi mahino ka mila kar kul All-Time Total hai".

3. 💰 CITE ACTUAL NUMBERS:
   - Ground your answers in their real financial data from above (Bank balances, Card dues, Wife savings, Month-wise expenses, Goals).

4. 🎯 ACTIONABLE & STRUCTURED:
   - Financial Planning: 50/30/20 monthly plan with exact ₹ numbers based on monthly income.
   - Investment Strategy: Nifty 50 Index SIP, Gold, Emergency Liquid Fund.
   - Credit Cards: Card dues vs limit advice.
   - Keep response crisp, well-structured, with clear bullet points (•), bold figures, and emojis.
`;

  if (ai) {
    try {
      const result = await callGeminiCandidateModels(ai, systemContextPrompt);
      if (result && result.text) {
        return {
          text: result.text.trim(),
          model: result.model,
          source: 'gemini',
        };
      }
    } catch (err: any) {
      console.error('Error answering AI financial question:', err.message);
    }
  }

  // Smart Rule-Based Financial Advisor Fallback (Strict Hindi / Hinglish with Month-wise details)
  const qLower = userQuestion.toLowerCase();
  
  // Check if a specific month is requested
  const matchedMonth = sortedMonths.find(m => {
    const mNameLow = m.monthName.toLowerCase();
    const mKeyLow = m.monthKey.toLowerCase();
    return qLower.includes(mNameLow.split(' ')[0]) || qLower.includes(mKeyLow);
  });

  const isPrevMonthQuery = qLower.includes('pichle') || qLower.includes('pichla') || qLower.includes('last month') || qLower.includes('previous');
  const targetMonth = matchedMonth || (isPrevMonthQuery && sortedMonths.length > 1 ? sortedMonths[1] : currentMonthData);

  let fallbackAnswer = `🤖 <b>FINANCIAL ADVISOR REPORT (${user.name.toUpperCase()})</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
  
  if (matchedMonth || isPrevMonthQuery || qLower.includes('month') || qLower.includes('mahine') || qLower.includes('mahina')) {
    fallbackAnswer += `📅 <b>Mahina:</b> ${targetMonth.monthName} ${targetMonth.isCurrentMonth ? '(Current Month)' : ''}\n`;
    fallbackAnswer += `💰 <b>Is Mahine Ki Income:</b> ₹${targetMonth.income.toLocaleString('en-IN')}\n`;
    fallbackAnswer += `🔴 <b>Is Mahine Ka Kharcha:</b> ₹${targetMonth.personalExpense.toLocaleString('en-IN')}\n`;
    fallbackAnswer += `🟢 <b>Is Mahine Ki Bachat:</b> ₹${targetMonth.netSavings.toLocaleString('en-IN')} (Bachat Dar: <b>${targetMonth.savingsRate}%</b>)\n\n`;

    if (sortedMonths.length > 1 && !matchedMonth) {
      fallbackAnswer += `📊 <b>Mahine-Vaar (Month-Wise) Record:</b>\n`;
      for (const m of sortedMonths.slice(0, 4)) {
        fallbackAnswer += `• <b>${m.monthName}:</b> Income: ₹${m.income.toLocaleString('en-IN')} | Kharcha: ₹${m.personalExpense.toLocaleString('en-IN')} | Bachat: ₹${m.netSavings.toLocaleString('en-IN')} (${m.savingsRate}%)\n`;
      }
      fallbackAnswer += `\n`;
    }
  } else {
    fallbackAnswer += `🗓️ <b>Current Month (${currentMonthData.monthName}):</b>\n`;
    fallbackAnswer += `• Income: ₹${currentMonthData.income.toLocaleString('en-IN')}\n`;
    fallbackAnswer += `• Kharcha: ₹${currentMonthData.personalExpense.toLocaleString('en-IN')}\n`;
    fallbackAnswer += `• Bachat: ₹${currentMonthData.netSavings.toLocaleString('en-IN')} (Bachat Dar: <b>${currentMonthData.savingsRate}%</b>)\n\n`;
    
    fallbackAnswer += `📈 <b>All-Time Kul Khata (All Months):</b>\n`;
    fallbackAnswer += `• Kul Kamai: ₹${(Number(summary?.totalIncome) || 0).toLocaleString('en-IN')}\n`;
    fallbackAnswer += `• Kul Kharcha: ₹${(Number(summary?.totalExpense) || 0).toLocaleString('en-IN')}\n`;
    fallbackAnswer += `• Bank & Net Holdings: ₹${(Number(summary?.totalNetSavings || summary?.netSavings) || 0).toLocaleString('en-IN')}\n\n`;
  }

  fallbackAnswer += `📊 <b>SMART ACTION PLAN (Hindi):</b>\n`;
  const sRate = targetMonth.savingsRate || Number(summary?.savingsRate) || 0;
  if (sRate < 20) {
    fallbackAnswer += `• <b>Bachat Badhayein:</b> Aapki bachat rate ${sRate}% hai. Target kam se kam 20%-30% hona chahiye (₹${Math.round((targetMonth.income || (Number(summary?.totalIncome) || 0)) * 0.25).toLocaleString('en-IN')}/mahina).\n`;
  } else {
    fallbackAnswer += `• <b>Bachat Rate Shandar Hai:</b> Aapki bachat dar ${sRate}% hai jo kaafi majboot hai! Ise smart SIP aur gold me invest karein.\n`;
  }

  const avoidableAmt = Number(ruleBasedAvoidable?.totalAvoidableAmount) || 0;
  if (avoidableAmt > 0) {
    fallbackAnswer += `• <b>Faltu Kharcha Control:</b> Lagbhag ₹${avoidableAmt.toLocaleString('en-IN')} ka avoidable kharcha detect hua hai. Ise rokne se saal me <b>₹${(avoidableAmt * 12).toLocaleString('en-IN')}</b> ki extra bachat hogi!\n`;
  }

  if (creditCards.length > 0) {
    const totalCcDue = creditCards.reduce((sum, [_, c]) => sum + (Number(c?.currentOutstanding) || 0), 0);
    if (totalCcDue > 0) {
      fallbackAnswer += `• <b>Credit Card Priority:</b> Aapka kul CC due ₹${totalCcDue.toLocaleString('en-IN')} hai. Due date se pehle full payment karein taaki interest na lage.\n`;
    }
  }

  fallbackAnswer += `• <b>Best Investment Strategy:</b>\n`;
  fallbackAnswer += `  - 50% Nifty 50 Index Mutual Fund SIP\n`;
  fallbackAnswer += `  - 25% Flexi-Cap Equity SIP\n`;
  fallbackAnswer += `  - 15% Gold ETF / Sovereign Gold Bond\n`;
  fallbackAnswer += `  - 10% Emergency Fund (Liquid FD)\n`;

  return {
    text: fallbackAnswer,
    model: 'RuleEngine-CFP',
    source: 'rule_fallback',
  };
}

// 7. AI Financial Insights Generator (User-Scoped)
app.post('/api/ai/insights', async (req, res) => {
  const user = getRequestUser(req);
  try {
    const insights = await generateAiFinancialInsights(user.id);
    res.json({ insights });
  } catch (err: any) {
    console.error('Error generating AI insights:', err);
    res.status(500).json({ error: 'Failed to generate AI insights' });
  }
});

// 7.05 Conversational AI Financial Advisor Chat API (User-Scoped)
app.post('/api/ai/ask', async (req, res) => {
  const user = getRequestUser(req);
  const { question, history } = req.body;
  if (!question || !String(question).trim()) {
    return res.status(400).json({ error: 'Question is required' });
  }
  try {
    const response = await answerAiFinancialQuestion(user.id, String(question).trim(), history);
    res.json(response);
  } catch (err: any) {
    console.error('Error in /api/ai/ask:', err);
    res.status(500).json({ error: 'Failed to process AI question: ' + err.message });
  }
});

// 7.1 Udhaar / Khata Book APIs
app.get('/api/udhaar', (req, res) => {
  const user = getRequestUser(req);
  if (!user) return res.json({ udhaars: [] });
  const store = getUserData(user.id);
  res.json({ udhaars: store.udhaars || [] });
});

app.post('/api/udhaar', (req, res) => {
  const user = getRequestUser(req);
  if (!user) return res.status(401).json({ error: 'User session required' });
  const store = getUserData(user.id);
  const { type, personName, amount, description, date, dueDate, account } = req.body;

  if (!personName || !amount) {
    return res.status(400).json({ error: 'Person name and amount are required' });
  }

  const newRecord: UdhaarRecord = {
    id: `udh_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    userId: user.id,
    type: type === 'borrowed' ? 'borrowed' : 'lent',
    personName: String(personName).trim(),
    amount: Math.abs(Number(amount)),
    description: description ? String(description).trim() : undefined,
    account: account || 'IC Bank',
    date: date || getAppDateTime().date,
    time: getAppDateTime().time,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  if (!store.udhaars) store.udhaars = [];
  store.udhaars.unshift(newRecord);
  saveUserData(user.id, store);

  res.json({ success: true, udhaar: newRecord, udhaars: store.udhaars });
});

app.put('/api/udhaar/:id', (req, res) => {
  const user = getRequestUser(req);
  if (!user) return res.status(401).json({ error: 'User session required' });
  const store = getUserData(user.id);
  const { id } = req.params;
  const updates = req.body || {};

  if (!store.udhaars) store.udhaars = [];
  const itemIndex = store.udhaars.findIndex(u => u.id === id);
  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Udhaar record not found' });
  }

  const existing = store.udhaars[itemIndex];
  if (updates.status === 'settled' && existing.status !== 'settled') {
    existing.status = 'settled';
    existing.settledAt = new Date().toISOString();
  } else if (updates.status === 'pending') {
    existing.status = 'pending';
    existing.settledAt = undefined;
  }

  if (updates.personName) existing.personName = String(updates.personName).trim();
  if (updates.amount) existing.amount = Math.abs(Number(updates.amount));
  if (updates.description !== undefined) existing.description = updates.description;
  if (updates.date) existing.date = updates.date;
  if (updates.account !== undefined) existing.account = updates.account;

  saveUserData(user.id, store);
  res.json({ success: true, udhaar: existing, udhaars: store.udhaars });
});

app.delete('/api/udhaar/:id', (req, res) => {
  const user = getRequestUser(req);
  if (!user) return res.status(401).json({ error: 'User session required' });
  const store = getUserData(user.id);
  const { id } = req.params;

  if (!store.udhaars) store.udhaars = [];
  store.udhaars = store.udhaars.filter(u => u.id !== id);
  saveUserData(user.id, store);

  res.json({ success: true, udhaars: store.udhaars });
});

// 7.2 Vehicle Fuel & Mileage Tracker APIs
app.get('/api/fuel', (req, res) => {
  const user = getRequestUser(req);
  if (!user) return res.json({ logs: [], fuelLogs: [] });
  const store = getUserData(user.id);
  const logs = store.fuelLogs || [];
  res.json({ logs, fuelLogs: logs });
});

app.post('/api/fuel', (req, res) => {
  const user = getRequestUser(req);
  if (!user) return res.status(401).json({ error: 'User session required' });
  const store = getUserData(user.id);
  const { vehicleName, fuelAmount, fuelLiters, odometer, notes, date, recordAsExpense = true } = req.body;

  const cleanOdo = Number(odometer);
  const cleanAmount = Number(fuelAmount);

  if (isNaN(cleanOdo) || isNaN(cleanAmount) || cleanAmount <= 0) {
    return res.status(400).json({ error: 'Valid Odometer reading and Fuel amount are required' });
  }

  if (!store.fuelLogs) store.fuelLogs = [];

  // Sort existing logs by odometer to calculate distance
  const sortedPastLogs = [...store.fuelLogs].sort((a, b) => b.odometer - a.odometer);
  const prevLog = sortedPastLogs.find(l => l.odometer < cleanOdo && (!vehicleName || l.vehicleName?.toLowerCase() === vehicleName.toLowerCase())) || sortedPastLogs[0];

  let distanceCovered: number | undefined;
  let calculatedMileage: number | undefined;
  let costPerKm: number | undefined;

  if (prevLog && cleanOdo > prevLog.odometer) {
    distanceCovered = cleanOdo - prevLog.odometer;
    const approxLiters = Number(fuelLiters) || (cleanAmount / 100); // approx ₹100/L if not specified
    if (approxLiters > 0) {
      calculatedMileage = Math.round((distanceCovered / approxLiters) * 10) / 10;
    }
    costPerKm = Math.round((cleanAmount / distanceCovered) * 100) / 100;
  }

  const newLog: FuelLog = {
    id: `fuel_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    userId: user.id,
    date: date || getAppDateTime().date,
    time: getAppDateTime().time,
    vehicleName: vehicleName ? String(vehicleName).trim() : 'Vehicle',
    fuelAmount: cleanAmount,
    fuelLiters: fuelLiters ? Number(fuelLiters) : undefined,
    odometer: cleanOdo,
    previousOdometer: prevLog ? prevLog.odometer : undefined,
    distanceCovered,
    calculatedMileage,
    costPerKm,
    notes: notes ? String(notes).trim() : undefined,
    createdAt: new Date().toISOString(),
  };

  store.fuelLogs.unshift(newLog);

  // Also create a linked transaction in Transportation & Fuel if requested
  if (recordAsExpense) {
    const fuelTx: Transaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      userId: user.id,
      type: 'expense',
      amount: cleanAmount,
      category: 'Transportation & Fuel',
      description: `${vehicleName || 'Vehicle'} Fuel (Odo: ${cleanOdo} km)`,
      date: newLog.date,
      time: newLog.time,
      paymentMethod: 'UPI',
      source: 'manual',
      createdAt: newLog.createdAt,
      tags: ['fuel', vehicleName || 'vehicle'],
    };
    store.transactions.unshift(fuelTx);
  }

  saveUserData(user.id, store);
  const summary = calculateUserSummary(user.id);

  res.json({
    success: true,
    log: newLog,
    logs: store.fuelLogs,
    fuelLogs: store.fuelLogs,
    summary,
  });
});

app.delete('/api/fuel/:id', (req, res) => {
  const user = getRequestUser(req);
  if (!user) return res.status(401).json({ error: 'User session required' });
  const store = getUserData(user.id);
  const { id } = req.params;

  if (!store.fuelLogs) store.fuelLogs = [];
  store.fuelLogs = store.fuelLogs.filter(f => f.id !== id);
  saveUserData(user.id, store);

  res.json({ success: true, logs: store.fuelLogs, fuelLogs: store.fuelLogs });
});

// 7.3 Daily Digest & Smart Alerts Service
async function sendDailyTelegramDigest(type: 'morning' | 'evening') {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || botConfig.botToken;
  if (!botToken) return;

  const activeChats = Object.keys(chatActiveAccounts);
  for (const chatId of activeChats) {
    const userId = chatActiveAccounts[chatId];
    if (!userId) continue;
    const user = users.find(u => u.id === userId);
    if (!user) continue;

    const store = getUserData(userId);
    const summary = calculateUserSummary(userId);
    const gullak = calculateGullakSummary(userId);
    const istInfo = getAppDateTime();
    const todayDate = istInfo.date;
    const [currY, currM, currD] = todayDate.split('-').map(Number);

    const todayTxs = (store.transactions || []).filter(t => t.date === todayDate);
    const todayExpense = todayTxs.filter(t => t.type === 'expense').reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const todayIncome = todayTxs.filter(t => t.type === 'income').reduce((a, b) => a + (Number(b.amount) || 0), 0);

    // Days remaining in current month
    const totalDaysInMonth = new Date(currY, currM, 0).getDate();
    const daysRemaining = Math.max(1, totalDaysInMonth - currD + 1);
    const monthlyRemainingBudget = Math.max(0, summary.monthlyBudget - summary.monthlySpent);
    const safeDailyLimit = Math.round(monthlyRemainingBudget / daysRemaining);

    const cId = String(chatId).trim();
    const isMasterChat = 
      (user.telegramChatId && String(user.telegramChatId).trim() === cId) ||
      (user.email?.toLowerCase() === 'abhiveo4@gmail.com' && cId === '838107368');

    const linkedMember = user.linkedMembers?.find(m => String(m.telegramChatId).trim() === cId);
    const isOwner = Boolean(isMasterChat || (linkedMember && linkedMember.role === 'owner'));

    // Family Member Privacy Mode: Mask master balances and show only member's own activity
    if (!isOwner) {
      const memberName = linkedMember?.name || 'Member';
      const memberTxs = (store.transactions || []).filter(t => 
        String(t.telegramChatId).trim() === cId || 
        (linkedMember && t.telegramUser && t.telegramUser.toLowerCase().includes(linkedMember.name.toLowerCase()))
      );
      const memberTodayTxs = memberTxs.filter(t => t.date === todayDate);
      const memberTodayExpense = memberTodayTxs.filter(t => t.type === 'expense').reduce((a, b) => a + (Number(b.amount) || 0), 0);
      const memberTodayIncome = memberTodayTxs.filter(t => t.type === 'income').reduce((a, b) => a + (Number(b.amount) || 0), 0);
      const currentMonthPrefix = todayDate.substring(0, 7);
      const memberMonthSpent = memberTxs.filter(t => t.type === 'expense' && t.date && t.date.startsWith(currentMonthPrefix)).reduce((a, b) => a + (Number(b.amount) || 0), 0);

      if (type === 'morning') {
        const memberMorningMsg = `🌅 <b>SHUBH PRABHAT, ${memberName.toUpperCase()}!</b>
━━━━━━━━━━━━━━━━━━━━
📊 <b>Aapka Aaj Ka Status & Reminder:</b>

👤 <b>Aapka Is Mahine Ka Kharcha:</b> <b>₹${memberMonthSpent.toLocaleString('en-IN')}</b>
📝 <b>Aapke Transactions:</b> ${memberTxs.length} records
━━━━━━━━━━━━━━━━━━━━
💵 <b>Net Family Balance:</b> 🔒 Masked (Owner Protected)
🎯 <b>Monthly Family Budget:</b> 🔒 Masked (Owner Protected)

💡 <i>Kharcha hote hi bot par message bhejein:</i>
• <code>100 nashta cash</code>
• <code>200 auto upi</code>
🔒 <i>(Family Privacy Active: Master account vault is protected)</i>`;

        await sendTelegramReply(botToken, chatId, memberMorningMsg, {
          inline_keyboard: [
            [{ text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' }, { text: '💡 Help', callback_data: 'cmd_help' }],
          ],
        });
      } else {
        const memberEveningMsg = `🌙 <b>SHUBH RATRI, ${memberName.toUpperCase()}! (AAJ KA HISAB)</b>
━━━━━━━━━━━━━━━━━━━━
📊 <b>Aapka Aaj Ka Kharcha:</b> <b>₹${memberTodayExpense.toLocaleString('en-IN')}</b> (${memberTodayTxs.filter(t => t.type === 'expense').length} items)
${memberTodayIncome > 0 ? `🟢 <b>Aapki Income:</b> ₹${memberTodayIncome.toLocaleString('en-IN')}\n` : ''}
👤 <b>Aapka Is Mahine Ka Kharcha:</b> <b>₹${memberMonthSpent.toLocaleString('en-IN')}</b>
📝 <b>Aapke Kul Records:</b> ${memberTxs.length} entries
━━━━━━━━━━━━━━━━━━━━
💵 <b>Net Family Balance:</b> 🔒 Masked (Owner Protected)
🟢 <b>Family Income:</b> 🔒 Masked (Owner Protected)
🎯 <b>Family Budget:</b> 🔒 Masked (Owner Protected)

🔒 <i>(Family Privacy Mode: Master vault numbers remain private)</i>`;

        await sendTelegramReply(botToken, chatId, memberEveningMsg, {
          inline_keyboard: [
            [{ text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' }, { text: '↩️ Undo Last', callback_data: 'cmd_undo' }],
          ],
        });
      }
      continue;
    }

    if (type === 'morning') {
      const morningMsg = `🌅 <b>SHUBH PRABHAT, ${user.name.toUpperCase()}!</b>
━━━━━━━━━━━━━━━━━━━━
📊 <b>Aapka Aaj Ka Financial Plan:</b>

💵 <b>Pocket / Bank Net Balance:</b> <b>₹${(summary.totalNetSavings || summary.netSavings).toLocaleString('en-IN')}</b>
<i>(Pichla Carryforward ₹${(summary.openingCarryforward || 0).toLocaleString('en-IN')} + Is Mahine Ki Net Bachat ₹${(summary.currentMonthNetSavings || 0).toLocaleString('en-IN')})</i>

🟢 <b>Is Mahine Ki Income:</b> ₹${(summary.currentMonthIncome || 0).toLocaleString('en-IN')}
🔴 <b>Is Mahine Ka Kharcha:</b> ₹${(summary.currentMonthPersonalExpense || 0).toLocaleString('en-IN')}
🎯 <b>Monthly Budget Limit Bacha:</b> <b>₹${monthlyRemainingBudget.toLocaleString('en-IN')}</b> (${daysRemaining} din baaki)
<i>(Target Budget: ₹${summary.monthlyBudget.toLocaleString('en-IN')} | Kharch: ₹${summary.monthlySpent.toLocaleString('en-IN')})</i>
${gullak.currentMonthSaved > 0 && Math.abs(gullak.currentMonthSaved - monthlyRemainingBudget) > 1 ? `🐷 <b>Gullak Bachat:</b> ₹${gullak.currentMonthSaved.toLocaleString('en-IN')} <i>(Unspent Category Funds)</i>\n` : ''}
💰 <b>Safe Daily Spend Limit:</b> <b>₹${safeDailyLimit.toLocaleString('en-IN')}/din</b>

💡 <i>Kharcha hote hi bot par message bhejein:</i>
• <code>200 nashta cash</code>
• <code>500 petrol upi</code>`;

      await sendTelegramReply(botToken, chatId, morningMsg, {
        inline_keyboard: [
          [{ text: '💰 Balance', callback_data: 'cmd_balance' }, { text: '🎯 Category Budget', callback_data: 'cmd_budget' }],
          [{ text: '📊 Summary', callback_data: 'cmd_summary' }, { text: '🤖 AI Tips', callback_data: 'cmd_tips' }],
        ],
      });
    } else {
      const eveningMsg = `🌙 <b>SHUBH RATRI, ${user.name.toUpperCase()}! (AAJ KA HISAB)</b>
━━━━━━━━━━━━━━━━━━━━
📊 <b>Aaj Ka Total Kharcha:</b> <b>₹${todayExpense.toLocaleString('en-IN')}</b> (${todayTxs.filter(t => t.type === 'expense').length} items)
${todayIncome > 0 ? `🟢 <b>Aaj Ki Income:</b> ₹${todayIncome.toLocaleString('en-IN')}\n` : ''}
💵 <b>Pocket / Bank Net Balance:</b> <b>₹${(summary.totalNetSavings || summary.netSavings).toLocaleString('en-IN')}</b>
<i>(Pichla Carryforward ₹${(summary.openingCarryforward || 0).toLocaleString('en-IN')} + Is Mahine Ki Net Bachat ₹${(summary.currentMonthNetSavings || 0).toLocaleString('en-IN')})</i>

🎯 <b>Monthly Budget Limit Bacha:</b> <b>₹${monthlyRemainingBudget.toLocaleString('en-IN')}</b>
<i>(Target Budget me se bacha quota)</i>
${gullak.currentMonthSaved > 0 && Math.abs(gullak.currentMonthSaved - monthlyRemainingBudget) > 1 ? `🐷 <b>Gullak Bachat:</b> ₹${gullak.currentMonthSaved.toLocaleString('en-IN')} <i>(Unspent Category Funds)</i>\n` : ''}
${todayExpense > safeDailyLimit ? `⚠️ <i>Aaj ka kharcha safe limit (₹${safeDailyLimit}) se thoda jyada raha.</i>` : `✅ <i>Shabash! Aaj ka kharcha budget ke andar raha!</i>`}`;

      await sendTelegramReply(botToken, chatId, eveningMsg, {
        inline_keyboard: [
          [{ text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' }, { text: '📊 Monthly Summary', callback_data: 'cmd_summary' }],
          [{ text: '↩️ Undo / Delete', callback_data: 'cmd_undo' }, { text: '🤖 AI Tips', callback_data: 'cmd_tips' }],
        ],
      });
    }
  }
}

// Manual trigger for testing Daily Digest
app.post('/api/digest/trigger', async (req, res) => {
  const { type = 'morning' } = req.body;
  try {
    await sendDailyTelegramDigest(type === 'evening' ? 'evening' : 'morning');
    res.json({ success: true, message: `${type} digest successfully dispatched to active Telegram chats!` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Scheduled Background Cron for 9:00 AM & 10:00 PM IST
let lastDigestSentDate = '';
let lastDigestSentType = '';

setInterval(() => {
  try {
    const istInfo = getAppDateTime();
    const currentTime = istInfo.time; // "09:00", "22:00"
    const currentDate = istInfo.date; // "YYYY-MM-DD"

    if (currentTime === '09:00' && (lastDigestSentDate !== currentDate || lastDigestSentType !== 'morning')) {
      lastDigestSentDate = currentDate;
      lastDigestSentType = 'morning';
      console.log(`[Digest] Dispatching Morning Daily Digest for ${currentDate} 09:00 IST...`);
      sendDailyTelegramDigest('morning').catch(e => console.error('[Digest] Error in morning cron:', e));
    } else if (currentTime === '22:00' && (lastDigestSentDate !== currentDate || lastDigestSentType !== 'evening')) {
      lastDigestSentDate = currentDate;
      lastDigestSentType = 'evening';
      console.log(`[Digest] Dispatching Evening Daily Digest for ${currentDate} 22:00 IST...`);
      sendDailyTelegramDigest('evening').catch(e => console.error('[Digest] Error in evening cron:', e));
    }
  } catch (e) {
    // ignore
  }
}, 30000); // Check every 30 seconds

// 8. Storage Engine Status & Postgres Synchronization
app.get('/api/storage/status', (req, res) => {
  let totalTx = 0;
  for (const store of userDataCache.values()) {
    totalTx += store.transactions.length;
  }

  res.json({
    engine: isPgConnected ? 'postgres' : 'disk',
    isPostgresConnected: isPgConnected,
    isPostgresConfigured: Boolean(rawDbUrl),
    dataDir: DATA_DIR,
    isCustomDataDir: Boolean(process.env.DATA_DIR || process.env.PERSISTENT_DATA_DIR),
    usersCount: users.length,
    cachedStoresCount: userDataCache.size,
    totalTransactions: totalTx,
    uptime: process.uptime(),
  });
});

app.post('/api/storage/sync-now', async (req, res) => {
  if (!pgPool) {
    return res.status(400).json({
      error: 'PostgreSQL database is not configured. Set DATABASE_URL in Render environment variables.'
    });
  }

  try {
    await persistToPg('users', users);
    await persistToPg('bot_config', botConfig);
    await persistToPg('telegram_logs', telegramLogs);
    for (const [uid, store] of userDataCache.entries()) {
      await persistToPg(`user_data:${uid}`, store);
    }
    return res.json({ success: true, message: 'Data successfully synchronized to PostgreSQL!' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Vite & Static server setup
async function startServer() {
  // Initialize and connect PostgreSQL if DATABASE_URL is configured
  if (pgPool) {
    await initPgDatabase();
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    
    if (fs.existsSync(distPath)) {
      // Static assets with hash can be cached for 1 year
      app.use('/assets', express.static(path.join(distPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      }));

      // Service worker and manifest should NEVER be aggressively cached
      app.use(express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest') || filePath.endsWith('registerSW.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }
        },
      }));
    }

    app.get('*', (req, res) => {
      if (fs.existsSync(indexHtmlPath)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        return res.sendFile(indexHtmlPath);
      }

      const botUser = botConfig.botUsername || 'Khata Bot';
      const dbStatus = isPgConnected ? '🟢 Neon PostgreSQL (Connected)' : '🟡 Local Storage (Active)';

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TeleExpense AI - Bot Server Live</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      max-width: 520px;
      width: 100%;
      padding: 32px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      background: #064e3b;
      color: #34d399;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; color: #ffffff; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
    .status-box {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
      padding: 8px 0;
      border-bottom: 1px solid #1e293b;
    }
    .status-row:last-child { border-bottom: none; }
    .label { color: #94a3b8; }
    .val { font-weight: 600; color: #f1f5f9; }
    .btn {
      display: block;
      width: 100%;
      text-align: center;
      background: #2563eb;
      color: #ffffff;
      padding: 14px;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      transition: background 0.2s;
    }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">● Server Online & Running</div>
    <h1>🤖 TeleExpense Bot Backend</h1>
    <p>Aapka Telegram expense manager backend server successfully deploy ho chuka hai aur 24/7 active hai.</p>
    
    <div class="status-box">
      <div class="status-row">
        <span class="label">Telegram Bot</span>
        <span class="val">@${botUser}</span>
      </div>
      <div class="status-row">
        <span class="label">Database</span>
        <span class="val">${dbStatus}</span>
      </div>
      <div class="status-row">
        <span class="label">Webhook Path</span>
        <span class="val"><code>/api/telegram/webhook</code></span>
      </div>
    </div>

    <a href="https://t.me/${botUser.replace('@', '')}" target="_blank" class="btn">🚀 Open Telegram Bot</a>
  </div>
</body>
</html>`);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 TeleExpense AI server running at http://0.0.0.0:${PORT}`);
    if (isPgConnected) {
      console.log('📦 Storage Engine: PostgreSQL Database (Persistent)');
    } else {
      console.log(`📁 Storage Engine: Persistent Disk / Local (${DATA_DIR})`);
    }

    const startupToken = process.env.TELEGRAM_BOT_TOKEN || botConfig.botToken;
    if (startupToken) {
      syncTelegramBotCommandsAndMenu(startupToken)
        .then(ok => {
          if (ok) console.log('✅ Telegram bot commands & menu button synced successfully with Telegram!');
          else console.log('⚠️ Could not sync Telegram bot commands (check token or network).');
        })
        .catch(e => console.error('Error auto-syncing Telegram bot commands:', e));
    }
  });
}

startServer();
