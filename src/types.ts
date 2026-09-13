export type TransactionType = 'income' | 'expense';

export type PaymentMethod = 'UPI' | 'Cash' | 'Card' | 'Net Banking' | 'Bank Transfer' | 'Other';

export interface LinkedMember {
  id: string; // e.g. "mem_838107368"
  name: string; // Telegram user name e.g. "Ansh", "Pooja"
  customAlias?: string; // Optional custom nickname e.g. "Wife", "Husband", "Mom", "Roommate"
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
  hasPassword?: boolean;
  telegramChatId?: string;
  telegramUsername?: string;
  linkedMembers?: LinkedMember[]; // Multiple Telegram members connected to this shared ledger
  pendingRequests?: PendingMemberRequest[]; // New member link requests awaiting owner approval
  linkCode: string; // 6-digit linking code e.g. "729104"
  createdAt: string;
  trackingStartMonth?: string; // Format: "YYYY-MM" (e.g. "2026-09")
}

export interface Transaction {
  id: string;
  userId?: string;
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  paymentMethod?: PaymentMethod;
  source: 'telegram' | 'manual' | 'simulator' | 'import';
  telegramChatId?: string;
  telegramMessageId?: number;
  telegramUser?: string;
  rawMessage?: string;
  createdAt: string; // ISO string
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
  spent: number;
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

export interface AvoidableExpenseItem {
  title: string;
  category: string;
  amount: number;
  reason: string;
}

export interface AiFinancialInsights {
  overview: string;
  healthScore: number;
  verdict: 'Excellent' | 'Good' | 'Needs Attention' | 'Critical';
  keyInsights: string[];
  savingTips: string[];
  avoidableExpenses: {
    totalAvoidableAmount: number;
    percentageOfExpenses: number;
    potentialMonthlySavings: number;
    potentialYearlySavings: number;
    investmentAdvice: string;
    items: AvoidableExpenseItem[];
  };
}

export interface GullakCategorySaving {
  category: string;
  month: string; // YYYY-MM
  budgetLimit: number;
  spent: number;
  savedAmount: number; // limit - spent (if > 0)
}

export interface GullakMonthRecord {
  month: string; // YYYY-MM
  monthName: string; // e.g. "September 2026"
  totalBudget: number;
  totalSpent: number;
  totalSaved: number;
  categories: GullakCategorySaving[];
}

export interface GullakSummary {
  totalGullakSavings: number; // Lifetime total unspent savings
  currentMonthSaved: number; // Current month's active unspent budget
  pastMonthsSaved: number; // Settled past months saved
  activeMonthsCount: number;
  trackingStartMonth?: string; // e.g. "2026-09"
  categoryBreakdown: Array<{
    category: string;
    totalSaved: number;
    currentMonthSaved: number;
    icon?: string;
    color?: string;
  }>;
  monthlyHistory: GullakMonthRecord[];
}

export interface UdhaarRecord {
  id: string;
  userId: string;
  type: 'lent' | 'borrowed'; // 'lent' (Diya / Lena hai / You'll Get) | 'borrowed' (Liya / Dena hai / You'll Give)
  personName: string; // e.g. "Rohan", "Papa", "Sharma Ji"
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
  vehicleName?: string; // e.g. "Bike", "Car", "Activa", "i20"
  fuelAmount: number; // ₹ paid
  fuelLiters?: number; // approx or entered
  odometer: number; // km reading e.g. 45200
  previousOdometer?: number;
  distanceCovered?: number; // km
  calculatedMileage?: number; // km/l
  costPerKm?: number; // ₹/km
  notes?: string;
  createdAt: string;
}

export interface BudgetAlert {
  category: string;
  limit: number;
  spent: number;
  percentage: number;
  status: 'warning' | 'exceeded'; // warning >= 80%, exceeded >= 100%
  message: string;
}



