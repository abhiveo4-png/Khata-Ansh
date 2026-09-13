import express from 'express';
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Persistence directory (Supports custom persistent disk mount e.g. /var/data or /opt/render/project/src/.data)
const DATA_DIR = process.env.DATA_DIR || process.env.PERSISTENT_DATA_DIR || path.join(process.cwd(), '.data');
const USERS_DIR = path.join(DATA_DIR, 'users');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const BOT_CONFIG_FILE = path.join(DATA_DIR, 'bot_config.json');
const LOGS_FILE = path.join(DATA_DIR, 'telegram_logs.json');
const ACTIVE_ACCOUNTS_FILE = path.join(DATA_DIR, 'active_accounts.json');

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
  fuelLogs?: FuelLog[];
}

let users: UserProfile[] = loadJson<UserProfile[]>(USERS_FILE, []);
let telegramLogs: TelegramLog[] = loadJson<TelegramLog[]>(LOGS_FILE, []);
let chatActiveAccounts: Record<string, string> = loadJson<Record<string, string>>(ACTIVE_ACCOUNTS_FILE, {});
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
    }

    if (synced || timeAdjusted) {
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

  userDataCache.set(userId, store);
  return store;
}

function saveUserData(userId: string, store: UserDataStore): void {
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

// ---------------- Fallback Rule-based parser ----------------

function parseFallback(rawText: string, userCategories: CategoryDef[]): Array<{
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  date?: string;
  time?: string;
  paymentMethod?: PaymentMethod;
}> {
  const results: Array<{
    type: TransactionType;
    amount: number;
    category: string;
    description: string;
    date?: string;
    time?: string;
    paymentMethod?: PaymentMethod;
  }> = [];

  const text = rawText.trim();
  const segments = text.split(/,|\n|\band\b|\baur\b/i).map(s => s.trim()).filter(Boolean);

  for (const seg of segments) {
    const segLower = seg.toLowerCase();

    // Detect Payment Method for this segment
    const paymentMethod = detectPaymentMethod(seg);

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
      date: extractedDate || getAppDateTime().date,
      time: extractedTime,
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
  time?: string;
  paymentMethod: PaymentMethod;
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
      paymentMethod: f.paymentMethod || 'UPI',
    }));
  }

  const categoryNames = userCategories.map(c => c.name);
  if (!categoryNames.includes('Uncategorized')) {
    categoryNames.push('Uncategorized');
  }

  const prompt = `You are an expert financial transaction parser for an Indian personal ledger with full Hinglish, Hindi, and English support.
Analyze the user's message (which can be in English, Hindi, or Hinglish, e.g. "30 dahi on 2 sep 26", "300 dahi cash 12:00", "500 petrol upi 4 pm", "15000 salary bank me aayi 1st sept", "1200 ki jeans kharidi card se kal", "sabzi 120 nagad 12 baje", "dost ko 500 diye shaam 6 baje", "kamla pasand 250 on 02/09/2026").

Current date (Indian Standard Time): ${currentDate} (Year: ${new Date().getFullYear()})
Current time (Indian Standard Time): ${nowInfo.time} (${nowInfo.time12})

CRITICAL RULES:
1. Extract every transaction (income or expense).
2. Date Extraction:
   - If the user specifies a date (e.g. "on 2 sep 26", "2 sep", "2nd september 2026", "15 aug", "02/09/2026", "2-9-2026", "2/9/26"), parse it into exact ISO format "YYYY-MM-DD" (e.g. "2026-09-02", "2026-08-15").
   - If relative terms are used:
     * "yesterday" or "kal" / "beeta kal" -> Calculate date for yesterday relative to ${currentDate}.
     * "parso" / "2 days ago" -> Calculate date for 2 days before ${currentDate}.
     * "today" or "aaj" or no date specified -> Use "${currentDate}".
3. Time Extraction (Optional):
   - If the user explicitly mentions a time in the text (e.g. "12:00", "12 baje", "12:30 pm", "4 pm", "shaam 6 baje", "raat 10:30 baje"):
     convert it to 24-hour format "HH:mm" (e.g. "12:00", "12:30", "16:00", "18:00", "22:30").
   - If no specific time is stated by the user, leave time as empty string.
4. Payment Method Detection:
   - If user wrote "cash", "nagad", "rokda", "haath me", "cash diya" -> paymentMethod: "Cash"
   - If user wrote "upi", "gpay", "google pay", "phonepe", "paytm", "bhim", "scan", "qr" -> paymentMethod: "UPI"
   - If user wrote "card", "visa", "mastercard", "credit", "debit", "swipe" -> paymentMethod: "Card"
   - If user wrote "bank transfer", "net banking", "neft", "imps", "bank", "account me", "khate me" -> paymentMethod: "Bank Transfer"
   - If not specified, default to "UPI" (or "Cash" if implied by small items).
5. Category Assignment:
   - Pick the best category from ONLY this exact list of the user's active categories:
   ${JSON.stringify(categoryNames)}
   - If the item does not clearly belong to any existing category, or if uncertain, set category to "Uncategorized".
6. Clean description (in clean Title Case, DO NOT include the date, time, or amount in description):
   - "30 dahi on 2 sep 26 12:00" -> description: "Dahi", amount: 30, date: "2026-09-02", time: "12:00", paymentMethod: "UPI", type: "expense"
   - "500 petrol upi on 15 aug" -> description: "Petrol", amount: 500, date: "2026-08-15", paymentMethod: "UPI", type: "expense"
   - "salary 50000 bank transfer 1st sep" -> description: "Salary", amount: 50000, date: "2026-09-01", paymentMethod: "Bank Transfer", type: "income"
   - "200 chai yesterday cash 4 pm" -> description: "Chai", amount: 200, time: "16:00", paymentMethod: "Cash", type: "expense"

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
            time: { type: Type.STRING, description: 'Optional 24-hour time HH:mm if mentioned, e.g. 12:00, 16:30' },
            paymentMethod: { type: Type.STRING, enum: ['UPI', 'Cash', 'Card', 'Net Banking', 'Bank Transfer', 'Other'] },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['type', 'amount', 'category', 'description', 'date', 'paymentMethod'],
        },
      },
    });

    if (result && result.text) {
      const parsed = JSON.parse(result.text.trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: any) => {
          let cat = item.category || 'Uncategorized';
          if (!categoryNames.includes(cat)) {
            cat = 'Uncategorized';
          }
          // Validate date format
          let finalDate = item.date || currentDate;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(finalDate)) {
            finalDate = parseCustomDateString(finalDate) || currentDate;
          }
          let parsedTime = typeof item.time === 'string' && /^\d{2}:\d{2}$/.test(item.time.trim()) ? item.time.trim() : undefined;
          if (!parsedTime) {
            parsedTime = extractCustomTimeString(rawText);
          }
          return {
            type: item.type === 'income' ? 'income' : 'expense',
            amount: Math.abs(Number(item.amount)),
            category: cat,
            description: item.description || 'Transaction',
            date: finalDate,
            time: parsedTime,
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

    // Sort category savings descending by savedAmount
    categorySavings.sort((a, b) => b.savedAmount - a.savedAmount);

    monthlyHistory.push({
      month: ym,
      monthName,
      totalBudget: monthTotalBudget,
      totalSpent: monthTotalSpent,
      totalSaved: monthTotalSaved,
      categories: categorySavings,
    });

    totalGullakSavings += monthTotalSaved;
    if (ym === currentMonth) {
      currentMonthSaved += monthTotalSaved;
    } else {
      pastMonthsSaved += monthTotalSaved;
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

export function isPureDateQuery(rawText: string): string | null {
  if (!rawText) return null;
  const text = rawText.trim();
  const lower = text.toLowerCase();

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

export function buildDateReportTelegramMessage(userId: string, targetDate: string, userName: string): string {
  const store = getUserData(userId);
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
👤 <b>Khata:</b> ${userName}

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
    const sign = t.type === 'income' ? '🟢 +' : '🔴 -';
    const pm = t.paymentMethod ? `[${t.paymentMethod}]` : '';
    const timeStr = t.time ? ` • 🕒 ${t.time}` : '';
    const emoji = getCategoryEmoji(t.category);
    return `<b>[#${idx + 1}]</b> ${sign}₹${t.amount.toLocaleString('en-IN')} • <b>${t.description}</b> (${emoji} ${t.category}) ${pm}${timeStr}`;
  }).join('\n\n');

  return `📅 <b>TAREEQ KA HISAAB-KITAAB REPORT</b>
<b>${formattedDate}</b> (<code>${targetDate}</code>)
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khata:</b> ${userName}
🟢 <b>Kul Income (Kamai):</b> ₹${totalIncome.toLocaleString('en-IN')}
🔴 <b>Kul Kharcha:</b> ₹${totalExpense.toLocaleString('en-IN')}
💰 <b>Net Day Savings:</b> ${net >= 0 ? '+' : ''}₹${net.toLocaleString('en-IN')}
📝 <b>Total Transactions:</b> ${matching.length}

━━━━━━━━━━━━━━━━━━━━
📋 <b>IS DIN KE SAARE TRANSACTIONS:</b>

${txListText}

━━━━━━━━━━━━━━━━━━━━
💡 <i>Tip: Kisi transaction ko delete karne ke liye <code>/delete &lt;number&gt;</code> ya <code>/undo</code> bhejein!</i>`;
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

export function buildItemSpendingReportTelegramMessage(userId: string, itemQuery: string, userName: string): string {
  const store = getUserData(userId);
  const cleanQ = itemQuery.toLowerCase().trim();

  // Search matching transactions ONLY in item description & tags (never entire batch rawMessage)
  const matchingExpenses = store.transactions.filter(t => {
    if (t.type !== 'expense') return false;
    return isTransactionItemMatch(t, cleanQ);
  });

  const matchingIncomes = store.transactions.filter(t => {
    if (t.type !== 'income') return false;
    return isTransactionItemMatch(t, cleanQ);
  });

  const displayKeyword = itemQuery.charAt(0).toUpperCase() + itemQuery.slice(1);

  if (matchingExpenses.length === 0 && matchingIncomes.length === 0) {
    return `🔍 <b>ITEM EXPENSE REPORT: "${displayKeyword.toUpperCase()}"</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khata:</b> ${userName}

ℹ️ <b>"${itemQuery}" ke naam se koi bhi kharcha ya transaction nahi mila.</b>

💡 <b>Aise try karein:</b>
• Naya kharcha add karein: <code>250 ${itemQuery} upi</code>
• Kisi doosre item/merchant ko search karein: <code>/spent petrol</code> ya <code>zomato ka kharcha</code>
• Saare recent transactions dekhne ke liye <code>/recent</code> bhejein.`;
  }

  const totalSpent = matchingExpenses.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const totalPurchases = matchingExpenses.length;
  const avgPerPurchase = totalPurchases > 0 ? Math.round(totalSpent / totalPurchases) : 0;
  const highestSinglePurchase = matchingExpenses.length > 0 ? Math.max(...matchingExpenses.map(t => Number(t.amount) || 0)) : 0;

  // Recent 5-6 purchases list
  const recentPurchases = matchingExpenses.slice(0, 6);
  const purchasesList = recentPurchases.map((t, idx) => {
    const pm = t.paymentMethod ? `[${t.paymentMethod}]` : '[UPI]';
    const timeStr = t.time ? ` (${t.time})` : '';
    const emoji = getCategoryEmoji(t.category);
    return `<b>[#${idx + 1}]</b> 🔴 <b>₹${Number(t.amount).toLocaleString('en-IN')}</b> • <b>${t.description}</b> (${emoji} ${t.category}) ${pm}\n   📅 <i>${t.date}${timeStr}</i>`;
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

// ---------------- Helper to send Telegram message & Handy Buttons ----------------

export const TELEGRAM_BOT_COMMANDS = [
  { command: 'balance', description: '💰 Net balance aur kul bachat dekhein' },
  { command: 'summary', description: '📊 Mahine ki income, kharcha & bachat report' },
  { command: 'udhaar', description: '🤝 Udhaar Khata (Lena / Dena Hisab)' },
  { command: 'fuel', description: '⛽ Vehicle Mileage & Fuel Log Tracker' },
  { command: 'spent', description: '🔍 Kisi item/merchant ka kharcha (e.g. /spent petrol)' },
  { command: 'gullak', description: '🐷 Monthly budget se bachi hui Gullak bachat' },
  { command: 'accounts', description: '👥 Linked accounts dekhein & unlink buttons' },
  { command: 'budget', description: '🎯 Category-wise kharcha aur bacha budget' },
  { command: 'date', description: '📅 Kisi bhi tareeq ka kharcha & income dekhein' },
  { command: 'tips', description: '🤖 AI Faltu Kharcha & Bachat Tips' },
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
    [{ text: '🤝 Udhaar Khata' }, { text: '⛽ Fuel Tracker' }],
    [{ text: '🐷 Gullak' }, { text: '🎯 Category Budget' }],
    [{ text: '👥 My Accounts' }, { text: '📅 Aaj Ka Hisab' }],
    [{ text: '🤖 AI Tips & Bachat' }, { text: '🕒 Recent 5 Tx' }],
    [{ text: '↩️ Undo Last' }, { text: '❓ Help & Guide' }],
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
      { text: '🤖 AI Faltu Kharcha', callback_data: 'cmd_tips' },
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

  const totalLent = lent.reduce((sum, u) => sum + u.amount, 0);
  const totalBorrowed = borrowed.reduce((sum, u) => sum + u.amount, 0);
  const netDue = totalLent - totalBorrowed;

  let text = `🤝 <b>UDHAAR & KHATA HISAB</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💸 <b>Maine Diya (Lena hai):</b> <b>₹${totalLent.toLocaleString('en-IN')}</b> (${lent.length} log)\n`;
  text += `📥 <b>Maine Liya (Dena hai):</b> <b>₹${totalBorrowed.toLocaleString('en-IN')}</b> (${borrowed.length} log)\n`;
  text += `📊 <b>Net Udhaar Balance:</b> <b>${netDue >= 0 ? `🟢 +₹${netDue.toLocaleString('en-IN')} (Aana hai)` : `🔴 -₹${Math.abs(netDue).toLocaleString('en-IN')} (Dena hai)`}</b>\n\n`;

  if (pending.length === 0) {
    text += `✨ <i>Saara hisab barabar hai! Koi pending udhaar nahi hai.</i>\n\n`;
  } else {
    if (lent.length > 0) {
      text += `<b>🔹 Lena Baaki Hai (Lent):</b>\n`;
      lent.slice(0, 5).forEach((u) => {
        text += `• <b>${u.personName}:</b> ₹${u.amount.toLocaleString('en-IN')} <i>(${u.date})</i>\n`;
      });
      text += `\n`;
    }
    if (borrowed.length > 0) {
      text += `<b>🔸 Dena Baaki Hai (Borrowed):</b>\n`;
      borrowed.slice(0, 5).forEach((u) => {
        text += `• <b>${u.personName}:</b> ₹${u.amount.toLocaleString('en-IN')} <i>(${u.date})</i>\n`;
      });
      text += `\n`;
    }
  }

  text += `💡 <b>Naya Udhaar add karne ke tareeqe:</b>\n`;
  text += `• <code>Diya 500 Rohan ko</code> (Lena hai)\n`;
  text += `• <code>Liya 2000 Papa se</code> (Dena hai)\n`;
  text += `• <code>Rohan settle</code> (Wapas mil gaya)`;

  return {
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: '💰 Balance', callback_data: 'cmd_balance' }, { text: '📊 Summary', callback_data: 'cmd_summary' }],
        [{ text: '🎯 Category Budget', callback_data: 'cmd_budget' }, { text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' }],
      ],
    },
  };
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

async function syncTelegramBotCommandsAndMenu(botToken: string): Promise<boolean> {
  if (!botToken) return false;
  try {
    const cmdRes = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: TELEGRAM_BOT_COMMANDS }),
    });
    const cmdData = await cmdRes.json();

    await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: { type: 'commands' },
      }),
    });

    console.log('🤖 Telegram setMyCommands synced:', cmdData.ok);
    return Boolean(cmdData.ok);
  } catch (err: any) {
    console.error('Failed to sync Telegram bot commands and menu:', err);
    return false;
  }
}

async function answerTelegramCallbackQuery(botToken: string, callbackQueryId: string, text?: string) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || 'Processing...',
        show_alert: false,
      }),
    });
  } catch (err) {
    console.error('Failed to answer Telegram callback query:', err);
  }
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

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Retry in plain text without HTML tags in case of unescaped chars
      const plainText = text.replace(/<[^>]*>/g, '');
      payload.text = plainText;
      delete payload.parse_mode;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    return true;
  } catch (err) {
    console.error('Failed to send Telegram reply:', err);
    return false;
  }
}

async function handleTelegramCallbackQuery(callbackQuery: any) {
  const token = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;
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
  if (data === 'cmd_balance') simulatedText = '/balance';
  else if (data === 'cmd_summary') simulatedText = '/summary';
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
  const botToken = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;

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
• <code>/spent signature</code> ya <code>signature pe kitna kharch huwa</code> - Kisi bhi item/merchant ka kul kharcha, total purchases aur average
• <code>petrol me kitna gaya</code> ya <code>zomato ka total kharcha</code> - Natural language spending query
• <code>/gullak</code> - Unspent category budget se bachi hui Gullak bachat
• <code>/budget</code> - Kon si category me kitna kharcha hua aur kitna balance bacha
• <code>/date 2 sep</code> ya <code>kal ka kharcha</code> - Kisi specific date ka hisaab-kitaab

🗑️ <b>Delete karne ke commands:</b>
• <code>/undo</code> ya <code>/delete</code> - Aakhri transaction delete karein
• <code>/delete 1</code> - Recent list se #1 item delete karein
• <code>delete dahi</code> ya <code>hatao petrol</code> - Name se delete karein
• <code>/clearall</code> ya <code>sab delete karo</code> - Saare transactions clear karein

📊 <b>Handy Commands:</b>
/balance - Kul bacha hua balance check karein
/summary - Mahine ki summary report
/accounts - Jude hue accounts dekhein, switch karein & unlink buttons
/budget - Category-wise kharcha aur bacha budget
/date - Tareeq ka hisaab (jaise: <code>/date 2 sep</code> ya <code>kal</code>)
/tips - Gemini AI se janein kaha faltu kharcha hua aur bachat tips
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
    lowerText === 'balance' ||
    lowerText.includes('💰 balance') ||
    lowerText === '💰' ||
    lowerText === 'balance check' ||
    lowerText === 'kitna balance hai' ||
    lowerText === 'kitna bacha';

  const isSummaryQuery =
    command === '/summary' ||
    lowerText === 'summary' ||
    lowerText.includes('📊 summary') ||
    lowerText === '📊' ||
    lowerText === 'mahine ka hisaab' ||
    lowerText === 'mahina' ||
    lowerText === 'hisab';

  if (isBalanceQuery) {
    const summary = calculateUserSummary(userId);
    const balanceMsg = `💰 <b>${targetUser.name} ka Net Bacha Hua Balance</b>\n\n💵 <b>Net Savings:</b> ₹${summary.netSavings.toLocaleString('en-IN')}\n🟢 <b>Kul Income (Kamai):</b> ₹${summary.totalIncome.toLocaleString('en-IN')}\n🔴 <b>Kul Kharcha:</b> ₹${summary.totalExpense.toLocaleString('en-IN')}\n📈 <b>Bachat Rate:</b> ${summary.savingsRate}%\n📝 <b>Total Transactions:</b> ${summary.transactionCount}\n\n💡 <i>Faltu kharcha aur bachat tips ke liye AI Faltu Kharcha button dabayein!</i>`;
    await sendTelegramReply(botToken, chatId, balanceMsg, {
      inline_keyboard: [
        [
          { text: '📊 Mahine Ki Summary', callback_data: 'cmd_summary' },
          { text: '🤖 AI Faltu Kharcha', callback_data: 'cmd_tips' },
        ],
        [
          { text: '🕒 Recent 5 Tx', callback_data: 'cmd_recent' },
          { text: '↩️ Undo Last', callback_data: 'cmd_undo' },
        ],
      ],
    });
    return;
  }

  if (isSummaryQuery) {
    const summary = calculateUserSummary(userId);
    const summaryMsg = `📊 <b>${targetUser.name} ka Financial Hisaab-Kitaab</b>\n\n🟢 <b>Kul Income (Kamai):</b> ₹${summary.totalIncome.toLocaleString('en-IN')}\n🔴 <b>Kul Kharcha:</b> ₹${summary.totalExpense.toLocaleString('en-IN')}\n💰 <b>Net Bacha Hua Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}\n📈 <b>Bachat Rate:</b> ${summary.savingsRate}%\n📝 <b>Total Transactions:</b> ${summary.transactionCount}\n\n💡 <i>Faltu kharcha aur bachat tips ke liye <code>/tips</code> bhejein!</i>`;
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
      return `<b>[#${idx + 1}]</b> ${sign}₹${t.amount.toLocaleString('en-IN')} • <b>${t.description}</b> (${t.category}) ${pm} <i>${t.date}${t.time ? ` • ${t.time}` : ''}</i>`;
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
        const [deleted] = userTransactions.splice(targetIndex, 1);
        saveUserData(userId, userStore);
        const summary = calculateUserSummary(userId);
        await sendTelegramReply(
          botToken,
          chatId,
          `🗑️ <b>Transaction #${targetIndex + 1} Delete Ho Gaya:</b>\n₹${deleted.amount} • ${deleted.description} (${deleted.category})\n\n📊 <b>Updated Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}`,
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
    const deleted = userTransactions.shift();
    saveUserData(userId, userStore);
    const summary = calculateUserSummary(userId);
    await sendTelegramReply(
      botToken,
      chatId,
      `🗑️ <b>Aakhri Transaction Delete Ho Gaya:</b>\n₹${deleted?.amount} • ${deleted?.description} (${deleted?.category})\n\n📊 <b>Updated Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}`,
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
        `🗑️ <b>Matching Transaction Delete Ho Gaya:</b>\n₹${deleted.amount} • ${deleted.description} (${deleted.category}) [${deleted.date}]\n\n📊 <b>Updated Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}`,
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
    const dateReportMsg = buildDateReportTelegramMessage(userId, queriedDate, targetUser.name);
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
    const itemReportMsg = buildItemSpendingReportTelegramMessage(userId, itemQuery, targetUser.name);
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

  // Udhaar Add Pattern (e.g. "diya 500 rohan ko", "rohan ko 500 diya", "liya 2000 papa se", "papa se 2000 liya", "lent 500 to rohan", "borrowed 2000 from papa")
  const diyaMatch = lowerText.match(/(?:diya|diye|lent|give|de\s+diya)\s+(\d+(?:\.\d+)?)\s*(?:rs|rupaye|₹)?\s*(?:to\s+|ko\s+)?([a-zA-Z0-9]+)/i) ||
    lowerText.match(/([a-zA-Z0-9]+)\s+(?:ko\s+)?(\d+(?:\.\d+)?)\s*(?:rs|rupaye|₹)?\s*(?:diya|diye|lent)/i) ||
    lowerText.match(/(\d+(?:\.\d+)?)\s*(?:rs|rupaye|₹)?\s*(?:diya|diye|lent)\s*(?:to\s+|ko\s+)?([a-zA-Z0-9]+)/i);

  const liyaMatch = lowerText.match(/(?:liya|liye|borrowed|take|le\s+liya)\s+(\d+(?:\.\d+)?)\s*(?:rs|rupaye|₹)?\s*(?:from\s+|se\s+)?([a-zA-Z0-9]+)/i) ||
    lowerText.match(/([a-zA-Z0-9]+)\s+(?:se\s+)?(\d+(?:\.\d+)?)\s*(?:rs|rupaye|₹)?\s*(?:liya|liye|borrowed)/i) ||
    lowerText.match(/(\d+(?:\.\d+)?)\s*(?:rs|rupaye|₹)?\s*(?:liya|liye|borrowed)\s*(?:from\s+|se\s+)?([a-zA-Z0-9]+)/i);

  if (diyaMatch || liyaMatch) {
    const isLent = Boolean(diyaMatch);
    const match = diyaMatch || liyaMatch;
    let amount = 0;
    let person = '';

    if (match) {
      if (!isNaN(parseFloat(match[1])) && isNaN(parseFloat(match[2]))) {
        amount = parseFloat(match[1]);
        person = match[2].trim();
      } else if (isNaN(parseFloat(match[1])) && !isNaN(parseFloat(match[2]))) {
        person = match[1].trim();
        amount = parseFloat(match[2]);
      }
    }

    const nonPersonWords = ['cash', 'upi', 'card', 'petrol', 'sabzi', 'dahi', 'kharcha', 'income', 'bank', 'odo', 'km'];
    if (amount > 0 && person && !nonPersonWords.includes(person.toLowerCase())) {
      const capitalizedPerson = person.charAt(0).toUpperCase() + person.slice(1);
      const newUdhaar: UdhaarRecord = {
        id: `udh_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        userId,
        type: isLent ? 'lent' : 'borrowed',
        personName: capitalizedPerson,
        amount,
        description: rawText,
        date: getAppDateTime().date,
        time: getAppDateTime().time,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      if (!userStore.udhaars) userStore.udhaars = [];
      userStore.udhaars.unshift(newUdhaar);
      saveUserData(userId, userStore);

      const reply = `🤝 <b>UDHAAR RECORD HO GAYA!</b>
━━━━━━━━━━━━━━━━━━━━
🏷️ <b>Type:</b> ${isLent ? '💸 Maine Diya (Lena Hai)' : '📥 Maine Liya (Dena Hai)'}
👤 <b>Person:</b> <b>${capitalizedPerson}</b>
💰 <b>Raqam:</b> <b>₹${amount.toLocaleString('en-IN')}</b>
📅 <b>Tareeq:</b> ${newUdhaar.date} • ${newUdhaar.time} (IST)

💡 <i>Jab ${capitalizedPerson} hisab clear karein, to bhejein:</i>
• <code>${capitalizedPerson} settle</code>`;

      await sendTelegramReply(botToken, chatId, reply, buildUdhaarReportTelegramMessage(userId).replyMarkup);
      return;
    }
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

        fuelReply += `━━━━━━━━━━━━━━━━━━━━\n📊 <b>Net Bacha Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}`;

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

    for (const parsed of parsedList) {
      const finalTime = (parsed.time && /^\d{2}:\d{2}$/.test(parsed.time)) ? parsed.time : msgTimeInfo.time;
      const finalDate = (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) ? parsed.date : msgTimeInfo.date;
      const itemRaw = parsedList.length > 1 ? `${parsed.amount} ${parsed.description}` : rawText;

      const newTx: Transaction = {
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        userId,
        type: parsed.type,
        amount: parsed.amount,
        category: parsed.category,
        description: parsed.description,
        date: finalDate,
        time: finalTime,
        paymentMethod: parsed.paymentMethod,
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

      replyText = `${isInc ? '🟢 <b>INCOME ADD HO GAYI</b>' : '🔴 <b>KHARCHA RECORD HO GAYA</b>'}
💰 <b>₹${item.amount.toLocaleString('en-IN')}</b>
📁 <b>Category:</b> ${item.category}${isUncat ? ' <i>(Web par Category assign karein)</i>' : ''}
📝 <b>Vivaran:</b> ${item.description}${memberTag}
💳 <b>Payment:</b> ${item.paymentMethod || 'UPI'}
📅 <b>Tareeq va Samay:</b> ${itemDate} • ${itemTime} (IST)

━━━━━━━━━━━━━━━━━━━━
📊 <b>Net Bacha Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}
${isInc ? `📈 <b>Kul Income:</b> ₹${summary.totalIncome.toLocaleString('en-IN')}` : `📉 <b>Kul Kharcha:</b> ₹${summary.totalExpense.toLocaleString('en-IN')}`}`;
    } else {
      const itemsList = parsedList
        .map(p => {
          const tTime = (p.time && /^\d{2}:\d{2}$/.test(p.time)) ? p.time : msgTimeInfo.time;
          return `• ${p.type === 'income' ? '🟢 +' : '🔴 -'}₹${p.amount.toLocaleString('en-IN')} ${p.description} (${p.category}) [${p.paymentMethod}] <i>(${tTime})</i>`;
        })
        .join('\n');
      replyText = `✅ <b>${parsedList.length} TRANSACTIONS ADD HO GAYE</b>${memberTag}\n\n${itemsList}\n\n━━━━━━━━━━━━━━━━━━━━\n📊 <b>Net Bacha Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}`;
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

    await sendTelegramReply(botToken, chatId, replyText, {
      inline_keyboard: [
        [
          { text: '💰 Check Balance', callback_data: 'cmd_balance' },
          { text: '📊 Summary', callback_data: 'cmd_summary' },
        ],
        [
          { text: '🤖 AI Faltu Kharcha', callback_data: 'cmd_tips' },
          { text: '↩️ Undo / Delete', callback_data: 'cmd_undo' },
        ],
      ],
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
    const token = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;
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
          } else if (update.callback_query) {
            await handleTelegramCallbackQuery(update.callback_query);
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
    const botToken = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;
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

  saveJson(USERS_FILE, users);
  setActiveAccountForChat(foundReq.chatId, user.id);

  // Notify member on Telegram
  const botToken = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;
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
  saveJson(USERS_FILE, users);

  const botToken = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;
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

  const nowInfo = getAppDateTime();
  const newTx: Transaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    userId: user.id,
    type: type === 'income' ? 'income' : 'expense',
    amount: Math.abs(Number(amount)),
    category: category || (type === 'income' ? 'Salary & Employment' : 'Uncategorized'),
    description: (description || 'Manual Entry').trim(),
    date: date || nowInfo.date,
    time: req.body.time || nowInfo.time,
    paymentMethod: paymentMethod || 'UPI',
    source: 'manual',
    createdAt: nowInfo.iso,
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
  rawBudgetsRows: any[] = []
): {
  restoredCount: number;
  categoriesCreated: number;
  transactions: Transaction[];
  categories: CategoryDef[];
  budgets: CategoryBudget[];
  summary: any;
} {
  const store = getUserData(userId);
  let restoredCount = 0;
  let categoriesCreated = 0;

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

    // 5. Description, Raw Message, Payment Method, Source
    const description = String(rowObj['description'] ?? rowObj['details'] ?? rowObj['note'] ?? rowObj['particulars'] ?? category).trim();
    const rawMessage = String(rowObj['rawmessage'] ?? rowObj['originalmessage'] ?? rowObj['telegrammessage'] ?? rowObj['message'] ?? '').trim();
    const rawPayment = String(rowObj['paymentmethod'] ?? rowObj['mode'] ?? rowObj['paymode'] ?? 'UPI').trim().toLowerCase();
    let paymentMethod: PaymentMethod = 'UPI';
    if (rawPayment.includes('cash')) paymentMethod = 'Cash';
    else if (rawPayment.includes('card') || rawPayment.includes('credit') || rawPayment.includes('debit')) paymentMethod = 'Card';
    else if (rawPayment.includes('net banking')) paymentMethod = 'Net Banking';
    else if (rawPayment.includes('bank') || rawPayment.includes('transfer') || rawPayment.includes('neft') || rawPayment.includes('rtgs') || rawPayment.includes('imps')) paymentMethod = 'Bank Transfer';
    else if (rawPayment.includes('other')) paymentMethod = 'Other';

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

  syncBudgetsWithCategories(store);
  saveUserData(userId, store);

  const summary = calculateUserSummary(userId);

  return {
    restoredCount,
    categoriesCreated,
    transactions: store.transactions,
    categories: store.categories,
    budgets: store.budgets,
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

    const { rows, fileBase64, categoriesRows, budgetsRows, replaceExisting = false } = req.body;
    let parsedTxRows: any[] = [];
    let parsedCatRows: any[] = Array.isArray(categoriesRows) ? categoriesRows : [];
    let parsedBudRows: any[] = Array.isArray(budgetsRows) ? budgetsRows : [];

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

                syncBudgetsWithCategories(store);
                saveUserData(user.id, store);

                return res.json({
                  success: true,
                  message: `Pure account ka backup successfully restore ho gaya! (${restoredCount} transactions, ${categoriesCreated} nayi categories)`,
                  restoredCount,
                  categoriesCreated,
                  transactions: store.transactions,
                  categories: store.categories,
                  budgets: store.budgets,
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
    } else {
      return res.status(400).json({ error: 'No transaction rows or fileBase64 provided' });
    }

    if (parsedTxRows.length === 0 && parsedCatRows.length === 0) {
      return res.status(400).json({ error: 'Backup file me koi valid transaction ya category data nahi mila' });
    }

    const result = restoreTransactionsBackup(user.id, parsedTxRows, replaceExisting, parsedCatRows, parsedBudRows);
    return res.json({
      success: true,
      message: `${result.restoredCount} transactions aur ${result.categories.length} categories successfully restore ho gaye hain!`,
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
      'Source': t.source || 'manual',
      'Raw Message': t.rawMessage || '',
      'Telegram User': t.telegramUser || (user?.name || ''),
      'Tags': Array.isArray(t.tags) ? t.tags.join(', ') : '',
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

    // 3. Account Details Sheet Data
    const accountData = [
      { 'Setting / Property': 'Account Name', 'Value': user?.name || 'Main Ledger' },
      { 'Setting / Property': 'Account ID', 'Value': userId },
      { 'Setting / Property': 'Telegram Chat ID', 'Value': user?.telegramChatId || 'Not Linked' },
      { 'Setting / Property': 'Telegram Username', 'Value': user?.telegramUsername ? `@${user.telegramUsername}` : 'Not Set' },
      { 'Setting / Property': 'Link Code', 'Value': user?.linkCode ? `/link ${user.linkCode}` : 'N/A' },
      { 'Setting / Property': 'Backup Created At', 'Value': new Date().toLocaleString('en-IN') },
      { 'Setting / Property': 'Total Transactions Count', 'Value': txList.length },
      { 'Setting / Property': 'Total Categories Count', 'Value': categoriesList.length },
      { 'Setting / Property': 'Total Income (INR)', 'Value': summary.totalIncome || 0 },
      { 'Setting / Property': 'Total Expense (INR)', 'Value': summary.totalExpense || 0 },
      { 'Setting / Property': 'Net Balance (INR)', 'Value': summary.netSavings || 0 },
      { 'Setting / Property': 'Savings Rate', 'Value': `${summary.savingsRate || 0}%` },
    ];

    // 4. Linked Family Members Sheet Data
    const linkedMembersData = (user?.linkedMembers && Array.isArray(user.linkedMembers) && user.linkedMembers.length > 0)
      ? user.linkedMembers.map(m => ({
          'Member Name': m.name || 'Member',
          'Telegram Chat ID': m.telegramChatId || '',
          'Telegram Username': m.telegramUsername ? `@${m.telegramUsername}` : 'N/A',
          'Role': m.role || 'member',
          'Linked At': m.linkedAt || '',
        }))
      : [{ 'Member Name': user?.name || 'Owner', 'Telegram Chat ID': user?.telegramChatId || '', 'Telegram Username': user?.telegramUsername || '', 'Role': 'owner', 'Linked At': '' }];

    // 5. Raw Full State JSON chunked safely (Never exceed Excel 32,767 cell limit)
    const fullJsonString = JSON.stringify({
      version: '2.0',
      exportedAt: new Date().toISOString(),
      user: user ? { id: user.id, name: user.name, telegramChatId: user.telegramChatId, telegramUsername: user.telegramUsername, linkCode: user.linkCode, linkedMembers: user.linkedMembers } : null,
      categories: categoriesList,
      budgets: budgetsList,
      transactions: txList,
    });

    const CHUNK_SIZE = 15000;
    const rawBackupPayload: any[] = [];
    const totalChunks = Math.ceil(fullJsonString.length / CHUNK_SIZE) || 1;

    for (let i = 0; i < totalChunks; i++) {
      const slice = fullJsonString.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      rawBackupPayload.push({
        'BackupVersion': '2.0',
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

    // Add Sheet 3: Account & Summary
    const wsAcc = XLSX.utils.json_to_sheet(accountData);
    XLSX.utils.book_append_sheet(workbook, wsAcc, 'Account Details');

    // Add Sheet 4: Linked Members
    const wsMembers = XLSX.utils.json_to_sheet(linkedMembersData);
    XLSX.utils.book_append_sheet(workbook, wsMembers, 'Linked Members');

    // Add Sheet 5: Internal Metadata
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
app.post('/api/telegram/sync-commands', async (req, res) => {
  const token = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
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
  const { type, personName, amount, description, date, dueDate } = req.body;

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
  const botToken = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  const activeChats = Object.keys(chatActiveAccounts);
  for (const chatId of activeChats) {
    const userId = chatActiveAccounts[chatId];
    if (!userId) continue;
    const user = users.find(u => u.id === userId);
    if (!user) continue;

    const store = getUserData(userId);
    const summary = calculateUserSummary(userId);
    const now = new Date();
    const todayDate = getAppDateTime().date;

    const todayTxs = store.transactions.filter(t => t.date === todayDate);
    const todayExpense = todayTxs.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    const todayIncome = todayTxs.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);

    // Days remaining in current month
    const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = Math.max(1, totalDaysInMonth - now.getDate() + 1);
    const monthlyRemainingBudget = Math.max(0, summary.monthlyBudget - summary.monthlySpent);
    const safeDailyLimit = Math.round(monthlyRemainingBudget / daysRemaining);

    if (type === 'morning') {
      const morningMsg = `🌅 <b>SHUBH PRABHAT, ${user.name.toUpperCase()}!</b>
━━━━━━━━━━━━━━━━━━━━
📊 <b>Aapka Aaj Ka Financial Plan:</b>

💰 <b>Safe-to-Spend Daily Limit:</b> <b>₹${safeDailyLimit.toLocaleString('en-IN')}</b>
🎯 <b>Monthly Budget Bacha:</b> ₹${monthlyRemainingBudget.toLocaleString('en-IN')} (${daysRemaining} din baaki)
💵 <b>Current Net Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}

💡 <i>Kharcha hote hi bot par message bhejein, jaise:</i>
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
💰 <b>Net Bacha Balance:</b> ₹${summary.netSavings.toLocaleString('en-IN')}
🎯 <b>Mahine Ka Bacha Budget:</b> ₹${monthlyRemainingBudget.toLocaleString('en-IN')}

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
    if (isPgConnected) {
      console.log('📦 Storage Engine: PostgreSQL Database (Persistent)');
    } else {
      console.log(`📁 Storage Engine: Persistent Disk / Local (${DATA_DIR})`);
    }
  });
}

startServer();
