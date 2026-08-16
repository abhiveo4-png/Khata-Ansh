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

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  hasPassword?: boolean;
  telegramChatId?: string;
  telegramUsername?: string;
  linkedMembers?: LinkedMember[]; // Multiple Telegram members connected to this shared ledger
  linkCode: string; // 6-digit linking code e.g. "729104"
  createdAt: string;
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

