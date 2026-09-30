export type TransactionType = 'income' | 'expense';

export type PaymentMethod = 'UPI' | 'Cash' | 'Card' | 'Net Banking' | 'Bank Transfer' | 'UPI/Cash' | 'Other';

export type AccountId =
  | 'ICICI CC 0000'
  | 'SBI CC 5733'
  | 'SBI CC 6526'
  | 'AX CC 8210'
  | 'AX CC 5376'
  | 'IC Bank'
  | 'AX Bank'
  | 'Cash';

export interface AccountMeta {
  id: AccountId;
  name: string;
  shortName: string;
  type: 'rupay_card' | 'credit_card' | 'bank_account' | 'cash';
  badge: string;
  color: string;
  isUpiCapable?: boolean;
  creditLimit?: number;
  billingDay?: number;
  paymentDueDay?: number;
}

export interface LinkedMember {
  id: string; // e.g. "mem_838107368"
  name: string; // Telegram user name e.g. "Ansh", "Pooja"
  customAlias?: string; // Optional custom nickname e.g. "Wife", "Husband", "Mom", "Roommate"
  role?: 'owner' | 'member' | 'partner' | 'family';
  telegramChatId: string;
  telegramUsername?: string;
  linkedAt: string;
}

export type UserRole = 'owner' | 'family';

export interface AuthSession {
  user: UserProfile;
  token?: string;
  role: UserRole;
  isOwner: boolean;
  memberName?: string;
  memberId?: string;
  loginIdentity?: string;
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
  account?: AccountId | string;
  source: 'telegram' | 'manual' | 'simulator' | 'import';
  telegramChatId?: string;
  telegramMessageId?: number;
  telegramUser?: string;
  rawMessage?: string;
  createdAt: string; // ISO string
  tags?: string[];
  isReimbursement?: boolean;
  reimbursementStatus?: 'pending' | 'settled' | 'partial';
  reimbursementSettledAmount?: number;
  isSavingsTransfer?: boolean;
  isInvestment?: boolean;
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
}

export interface CardEmi {
  id: string;
  userId?: string;
  cardId: AccountId;
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
  userId?: string;
  amount: number;
  date: string;
  recipient: string;
  fromAccount: AccountId;
  notes?: string;
  createdAt: string;
}

export interface InvestmentRecord {
  id: string;
  userId?: string;
  type: 'RD' | 'FD' | 'Mutual Fund' | 'Gold' | 'PPF' | 'Other';
  name: string;
  amount: number;
  account: AccountId;
  date: string;
  maturityDate?: string;
  interestRate?: number;
  notes?: string;
  createdAt: string;
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
  account?: AccountId;
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

export interface RestoreBackupResult {
  success: boolean;
  message: string;
  restoredCount: number;
  categoriesCreated: number;
  udhaarsCount?: number;
  fuelLogsCount?: number;
  investmentsCount?: number;
  savingsTransfersCount?: number;
  emisCount?: number;
  transactions: Transaction[];
  categories: CategoryDef[];
  budgets: CategoryBudget[];
  udhaars?: UdhaarRecord[];
  fuelLogs?: FuelLog[];
  investments?: InvestmentRecord[];
  savingsTransfers?: SavingsTransfer[];
  cardEmis?: CardEmi[];
  summary: FinancialSummary;
}

export interface DailyItemLimit {
  id: string;
  userId?: string;
  itemName: string;
  dailyLimit: number;
  keywords: string[];
  category: string;
  notes?: string;
  isActive: boolean;
  todaySpent?: number;
  status?: 'safe' | 'warning' | 'exceeded';
  percentage?: number;
  todayCount?: number;
  createdAt?: string;
}

export interface DailyLimitsSummary {
  totalLimitsCount: number;
  activeLimitsCount: number;
  totalDailyBudget: number;
  totalTodaySpent: number;
  totalExceededCount: number;
  totalWarningCount: number;
  totalSafeCount: number;
}

export interface PiggyBankItem {
  id: string;
  userId?: string;
  name: string;
  category: 'general' | 'emergency' | 'goal' | 'travel' | 'investment' | 'vehicle' | 'home' | 'health';
  targetAmount?: number;
  currentBalance: number;
  icon?: string;
  color?: string;
  notes?: string;
  isSurplusFund?: boolean;
  targetDate?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PiggyBankTransaction {
  id: string;
  userId?: string;
  fundId: string;
  fundName?: string;
  type: 'deposit' | 'withdraw' | 'transfer_in' | 'transfer_out' | 'surplus_collect';
  amount: number;
  sourceFundId?: string;
  targetFundId?: string;
  notes?: string;
  date: string;
  createdAt: string;
}

export interface PiggyBankSummary {
  totalInAllFunds: number;
  surplusFundBalance: number;
  totalAllocatedToGoals: number;
  totalTargetGoals: number;
  currentMonthUncollectedSurplus: number;
  activeFundsCount: number;
}




