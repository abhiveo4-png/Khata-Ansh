import { AccountId, AccountMeta } from '../types';

export const DEFAULT_ACCOUNTS_CONFIG: Record<string, AccountMeta> = {
  'ICICI CC 0000': {
    id: 'ICICI CC 0000',
    name: 'ICICI RuPay UPI CC (0000)',
    shortName: 'ICICI CC 0000',
    type: 'rupay_card',
    badge: 'RuPay CC',
    color: '#f97316', // Orange
    isUpiCapable: true,
    creditLimit: 120000,
    billingDay: 18,
    paymentDueDay: 7,
  },
  'SBI CC 5733': {
    id: 'SBI CC 5733',
    name: 'SBI SimplyCLICK / Cashback CC (5733)',
    shortName: 'SBI CC 5733',
    type: 'credit_card',
    badge: 'SBI CC',
    color: '#0284c7', // Sky Blue
    creditLimit: 150000,
    billingDay: 12,
    paymentDueDay: 2,
  },
  'SBI CC 6526': {
    id: 'SBI CC 6526',
    name: 'SBI Pulse / Prime CC (6526)',
    shortName: 'SBI CC 6526',
    type: 'credit_card',
    badge: 'SBI CC',
    color: '#2563eb', // Blue
    creditLimit: 100000,
    billingDay: 24,
    paymentDueDay: 14,
  },
  'AX CC 8210': {
    id: 'AX CC 8210',
    name: 'Axis Flipkart / Ace CC (8210)',
    shortName: 'AX CC 8210',
    type: 'credit_card',
    badge: 'Axis CC',
    color: '#9333ea', // Purple
    creditLimit: 180000,
    billingDay: 15,
    paymentDueDay: 5,
  },
  'AX CC 5376': {
    id: 'AX CC 5376',
    name: 'Axis Neo / Privilege CC (5376)',
    shortName: 'AX CC 5376',
    type: 'credit_card',
    badge: 'Axis CC',
    color: '#a855f7', // Violet
    creditLimit: 90000,
    billingDay: 20,
    paymentDueDay: 10,
  },
  'IC Bank 2005': {
    id: 'IC Bank 2005',
    name: 'ICICI Bank Credit Card (2005)',
    shortName: 'IC Bank 2005',
    type: 'credit_card',
    badge: 'ICICI CC',
    color: '#e11d48', // Rose / Red
    creditLimit: 150000,
    billingDay: 20,
    paymentDueDay: 10,
  },
  'AX CC 2904': {
    id: 'AX CC 2904',
    name: "Axis Bank CC 2904 (Wife's Card)",
    shortName: 'AX CC 2904',
    type: 'credit_card',
    badge: 'Wife CC',
    color: '#ec4899', // Pink
    creditLimit: 100000,
    billingDay: 15,
    paymentDueDay: 5,
    isWifeAccount: true,
  },
  'IC Bank': {
    id: 'IC Bank',
    name: 'ICICI Bank Savings Account',
    shortName: 'IC Bank',
    type: 'bank_account',
    badge: 'ICICI Bank',
    color: '#ea580c', // Dark Orange
    isUpiCapable: true,
  },
  'AX Bank': {
    id: 'AX Bank',
    name: 'Axis Bank Salary Account',
    shortName: 'AX Bank',
    type: 'bank_account',
    badge: 'Axis Bank',
    color: '#be185d', // Rose / Maroon
    isUpiCapable: true,
  },
  'Wife Account': {
    id: 'Wife Account',
    name: "Wife's Bank / Savings Account",
    shortName: 'Wife Account',
    type: 'bank_account',
    badge: 'Wife Bank',
    color: '#db2777', // Deep Pink
    isUpiCapable: true,
    isWifeAccount: true,
  },
  'Cash': {
    id: 'Cash',
    name: 'Cash in Hand / Pocket',
    shortName: 'Cash',
    type: 'cash',
    badge: 'Cash',
    color: '#10b981', // Emerald
  },
};

const CUSTOM_ACCOUNTS_STORAGE_KEY = 'hisab_custom_accounts_v1';
const ACCOUNT_CYCLES_STORAGE_KEY = 'hisab_account_cycle_overrides_v1';

interface AccountCycleOverrides {
  billingDays: Record<string, number>;
  paymentDueDays: Record<string, number>;
}

export const ACCOUNTS_CONFIG: Record<string, AccountMeta> = { ...DEFAULT_ACCOUNTS_CONFIG };
export const ALL_ACCOUNTS: AccountMeta[] = Object.values(ACCOUNTS_CONFIG);
export const CREDIT_CARDS: AccountMeta[] = ALL_ACCOUNTS.filter(a => a.type === 'credit_card' || a.type === 'rupay_card');
export const BANK_ACCOUNTS: AccountMeta[] = ALL_ACCOUNTS.filter(a => a.type === 'bank_account');

function loadSavedCycleOverrides(): AccountCycleOverrides {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(ACCOUNT_CYCLES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          billingDays: parsed?.billingDays && typeof parsed.billingDays === 'object' ? parsed.billingDays : {},
          paymentDueDays: parsed?.paymentDueDays && typeof parsed.paymentDueDays === 'object' ? parsed.paymentDueDays : {},
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return { billingDays: {}, paymentDueDays: {} };
}

function rebuildAccountExports(
  customList: AccountMeta[],
  cardBillingDays?: Record<string, number>,
  cardPaymentDueDays?: Record<string, number>
) {
  // Clear existing keys in ACCOUNTS_CONFIG
  for (const key of Object.keys(ACCOUNTS_CONFIG)) {
    delete ACCOUNTS_CONFIG[key];
  }
  // Restore defaults (shallow copy so DEFAULT_ACCOUNTS_CONFIG stays pristine)
  for (const [k, v] of Object.entries(DEFAULT_ACCOUNTS_CONFIG)) {
    ACCOUNTS_CONFIG[k] = { ...v };
  }
  // Add custom accounts
  if (Array.isArray(customList)) {
    for (const item of customList) {
      if (item && item.id) {
        ACCOUNTS_CONFIG[item.id] = { ...item, isCustom: true };
      }
    }
  }
  // Apply billingDay / paymentDueDay overrides
  if (cardBillingDays && typeof cardBillingDays === 'object') {
    for (const [accId, dayVal] of Object.entries(cardBillingDays)) {
      const day = Math.round(Number(dayVal));
      if (ACCOUNTS_CONFIG[accId] && !isNaN(day) && day >= 1 && day <= 31) {
        ACCOUNTS_CONFIG[accId] = { ...ACCOUNTS_CONFIG[accId], billingDay: day };
      }
    }
  }
  if (cardPaymentDueDays && typeof cardPaymentDueDays === 'object') {
    for (const [accId, dayVal] of Object.entries(cardPaymentDueDays)) {
      const day = Math.round(Number(dayVal));
      if (ACCOUNTS_CONFIG[accId] && !isNaN(day) && day >= 1 && day <= 31) {
        ACCOUNTS_CONFIG[accId] = { ...ACCOUNTS_CONFIG[accId], paymentDueDay: day };
      }
    }
  }

  const allValues = Object.values(ACCOUNTS_CONFIG);
  // Sort so Credit Cards come first, then Bank Accounts, then Cash (matching original order)
  const cards = allValues.filter(a => a.type === 'credit_card' || a.type === 'rupay_card');
  const banks = allValues.filter(a => a.type === 'bank_account');
  const cash = allValues.filter(a => a.type === 'cash');
  const ordered = [...cards, ...banks, ...cash];

  ALL_ACCOUNTS.splice(0, ALL_ACCOUNTS.length, ...ordered);
  CREDIT_CARDS.splice(0, CREDIT_CARDS.length, ...cards);
  BANK_ACCOUNTS.splice(0, BANK_ACCOUNTS.length, ...banks);
}

export function loadSavedCustomAccounts(): AccountMeta[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(CUSTOM_ACCOUNTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

export function syncCustomAccounts(
  customList?: AccountMeta[],
  cardBillingDays?: Record<string, number>,
  cardPaymentDueDays?: Record<string, number>
) {
  const safeList = Array.isArray(customList) ? customList : loadSavedCustomAccounts();
  const savedCycles = loadSavedCycleOverrides();
  const effectiveBillingDays = cardBillingDays && typeof cardBillingDays === 'object'
    ? cardBillingDays
    : savedCycles.billingDays;
  const effectiveDueDays = cardPaymentDueDays && typeof cardPaymentDueDays === 'object'
    ? cardPaymentDueDays
    : savedCycles.paymentDueDays;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (Array.isArray(customList)) {
        window.localStorage.setItem(CUSTOM_ACCOUNTS_STORAGE_KEY, JSON.stringify(safeList));
      }
      if (cardBillingDays || cardPaymentDueDays) {
        window.localStorage.setItem(
          ACCOUNT_CYCLES_STORAGE_KEY,
          JSON.stringify({ billingDays: effectiveBillingDays, paymentDueDays: effectiveDueDays })
        );
      }
    }
  } catch {
    // ignore storage errors
  }
  rebuildAccountExports(safeList, effectiveBillingDays, effectiveDueDays);
}

// Initialize on module load from localStorage if available
const initialCycles = loadSavedCycleOverrides();
rebuildAccountExports(loadSavedCustomAccounts(), initialCycles.billingDays, initialCycles.paymentDueDays);

/**
 * Helper: Check whether an account ID is a Credit / RuPay card
 */
export function isCreditCardAccount(accountId?: string): boolean {
  const acc = (accountId || '').trim();
  if (!acc) return false;
  const meta = ACCOUNTS_CONFIG[acc];
  if (meta) return meta.type === 'credit_card' || meta.type === 'rupay_card';
  return /\bcc\b|credit card|rupay|2005|0000|5733|6526|8210|5376|2904/i.test(acc);
}

/**
 * Helper: Check whether an account ID is Wife's Credit Card (e.g. AX CC 2904 or any card marked isWifeAccount)
 */
export function isWifeCardAccount(accountId?: string): boolean {
  const acc = (accountId || '').trim();
  if (!acc) return false;
  const meta = ACCOUNTS_CONFIG[acc];
  if (meta) {
    const isCard = meta.type === 'credit_card' || meta.type === 'rupay_card';
    if (!isCard) return false;
    if (meta.isWifeAccount !== undefined) return Boolean(meta.isWifeAccount);
  }
  return /\b2904\b/i.test(acc) || (/wife/i.test(acc) && /\bcc\b|card/i.test(acc));
}

/**
 * Helper: Check whether an account ID belongs to Wife (either Bank Account or Card)
 */
export function isWifeOwnedAccount(accountId?: string): boolean {
  const acc = (accountId || '').trim();
  if (!acc) return false;
  const meta = ACCOUNTS_CONFIG[acc];
  if (meta?.isWifeAccount) return true;
  return /\b2904\b/i.test(acc) || /\bwife\b/i.test(acc);
}

/**
 * Helper: Check whether a transaction is an Udhaar Given from Wife's Card (e.g. Axis Card 2904),
 * which must be excluded from the owner's monthly outflow & card reserve.
 */
export function isExcludedWifeCardUdhaar(t: {
  type?: string;
  account?: string;
  isUdhaarLent?: boolean;
  isUdhaarRepaid?: boolean;
  category?: string;
  tags?: string[];
}): boolean {
  if (!t || t.type !== 'expense') return false;
  const isUdhaarRepaid = Boolean(
    t.isUdhaarRepaid ||
    t.category === 'Udhaar Repaid' ||
    (Array.isArray(t.tags) && t.tags.includes('udhaar-repaid'))
  );
  if (isUdhaarRepaid) return false;

  const isUdhaarLent = Boolean(
    t.isUdhaarLent ||
    t.category === 'Udhaar Given' ||
    t.category === 'Loan Given' ||
    (t.category && t.category.toLowerCase().includes('udhaar')) ||
    (Array.isArray(t.tags) && t.tags.includes('udhaar-lent'))
  );
  if (!isUdhaarLent) return false;

  return isWifeCardAccount(t.account);
}

/**
 * Smart detection of account/card from text
 */
export function detectAccount(text: string): AccountId | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();

  // Check custom cards/accounts first (by 4-digit suffix or shortName)
  for (const acc of ALL_ACCOUNTS) {
    if (acc.isCustom) {
      const sLower = acc.shortName.toLowerCase();
      if (lower.includes(sLower)) return acc.id;
      const digitsMatch = acc.id.match(/\b(\d{4})\b/);
      if (digitsMatch && lower.includes(digitsMatch[1])) {
        return acc.id;
      }
    }
  }

  // Axis CC 2904 (Wife's Card)
  if (
    lower.includes('2904') ||
    lower.includes('wife cc') ||
    lower.includes('wife card') ||
    lower.includes('patni card')
  ) {
    return 'AX CC 2904';
  }

  // Wife's Bank / Savings Account (explicit direct usage, not savings transfer from AX Bank)
  if (
    (lower.includes('wife bank') || lower.includes('wife account') || lower.includes('wife a/c') || lower.includes('patni account')) &&
    !lower.includes('transfer to wife') &&
    !lower.includes('transferred to wife')
  ) {
    return 'Wife Account';
  }


  // IC Bank 2005 Credit Card
  if (
    lower.includes('2005') ||
    (lower.includes('ic') && lower.includes('2005')) ||
    lower.includes('ic bank 2005') ||
    lower.includes('icici 2005')
  ) {
    return 'IC Bank 2005';
  }

  // ICICI RuPay CC 0000
  if (
    lower.includes('0000') ||
    lower.includes('rupay') ||
    (lower.includes('icic') && lower.includes('cc')) ||
    lower.includes('icici cc') ||
    lower.includes('icici card')
  ) {
    return 'ICICI CC 0000';
  }

  // SBI CC 5733
  if (lower.includes('5733') || (lower.includes('sbi') && lower.includes('5733'))) {
    return 'SBI CC 5733';
  }

  // SBI CC 6526
  if (lower.includes('6526') || (lower.includes('sbi') && lower.includes('6526'))) {
    return 'SBI CC 6526';
  }

  // Axis CC 8210
  if (lower.includes('8210') || ((lower.includes('ax') || lower.includes('axis')) && lower.includes('8210'))) {
    return 'AX CC 8210';
  }

  // Axis CC 5376
  if (lower.includes('5376') || ((lower.includes('ax') || lower.includes('axis')) && lower.includes('5376'))) {
    return 'AX CC 5376';
  }

  // Generic SBI mention
  if (lower.includes('sbi cc') || lower.includes('sbi card')) {
    return 'SBI CC 5733';
  }

  // Generic Axis CC mention
  if (lower.includes('axis cc') || lower.includes('ax cc') || lower.includes('axis card')) {
    return 'AX CC 8210';
  }

  // ICICI Bank Account
  if (
    (lower.includes('icici') && !lower.includes('cc') && !lower.includes('card')) ||
    lower.includes('ic bank') ||
    lower.includes('icici bank') ||
    lower.includes('icici a/c') ||
    lower.includes('icici account')
  ) {
    return 'IC Bank';
  }

  // Axis Bank Account
  if (
    (lower.includes('axis') && !lower.includes('cc') && !lower.includes('card')) ||
    lower.includes('ax bank') ||
    lower.includes('axis bank') ||
    lower.includes('salary bank') ||
    lower.includes('axis a/c')
  ) {
    return 'AX Bank';
  }

  // Cash
  if (
    lower.includes('cash') ||
    lower.includes('nagad') ||
    lower.includes('rokda') ||
    lower.includes('haath me') ||
    lower.includes('cash diya')
  ) {
    return 'Cash';
  }

  // Wife Transfer / Savings Transfer (defaults to bank account)
  if (
    lower.includes('wife') ||
    lower.includes('patni') ||
    lower.includes('transfer to wife') ||
    lower.includes('savings transfer') ||
    lower.includes('bachat wife')
  ) {
    return 'AX Bank';
  }

  // CC Payment / Credit Card Bill Payment (paid from salary bank account)
  if (
    lower.includes('cc payment') ||
    lower.includes('credit card payment') ||
    lower.includes('cc bill') ||
    lower.includes('pay cc') ||
    lower.includes('card payment')
  ) {
    return 'AX Bank';
  }

  return undefined;
}

/**
 * Detects if a transaction is an office/business reimbursement
 * e.g. "Rim 100 Cab (ggn trip)", "reimbursement 500 meal"
 */
export function detectReimbursement(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const rimPattern = /\b(rim|reimburse|reimbursement|office claim|client trip|reimbursable|claim)\b/i;
  return rimPattern.test(lower);
}

/**
 * Detects if an expense is a savings transfer to wife or family savings
 * e.g. "15000 transferred to wife for savings", "savings to wife"
 */
export function detectSavingsTransfer(text: string): boolean {
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

/**
 * Detects if text indicates an Investment (RD, FD, Mutual Fund)
 */
export function detectInvestment(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const invPattern = /\b(rd|fd|fixed deposit|recurring deposit|mutual fund|sip|gold|ppf|nps|investment|invest)\b/i;
  return invPattern.test(lower);
}

/**
 * Detects Family Trip & Pooja
 * e.g. "500 Fal aur phool pooja", "1200 room stay trip"
 */
export function detectFamilyTripPooja(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  // Don't treat office rim trip as family trip
  if (detectReimbursement(text)) return false;
  const poojaPattern = /\b(pooja|puja|prasad|pandit|mandir|samagri|havan|yatra|darshan|family trip|holiday|tour|vacation)\b/i;
  const endsWithTripOrPooja = /(?:pooja|puja|trip)$/i.test(text.trim());
  return poojaPattern.test(lower) || endsWithTripOrPooja;
}
