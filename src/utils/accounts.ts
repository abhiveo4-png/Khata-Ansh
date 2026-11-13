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

export const ACCOUNTS_CONFIG: Record<string, AccountMeta> = { ...DEFAULT_ACCOUNTS_CONFIG };
export const ALL_ACCOUNTS: AccountMeta[] = Object.values(ACCOUNTS_CONFIG);
export const CREDIT_CARDS: AccountMeta[] = ALL_ACCOUNTS.filter(a => a.type === 'credit_card' || a.type === 'rupay_card');
export const BANK_ACCOUNTS: AccountMeta[] = ALL_ACCOUNTS.filter(a => a.type === 'bank_account');

function rebuildAccountExports(customList: AccountMeta[]) {
  // Clear existing keys in ACCOUNTS_CONFIG
  for (const key of Object.keys(ACCOUNTS_CONFIG)) {
    delete ACCOUNTS_CONFIG[key];
  }
  // Restore defaults
  for (const [k, v] of Object.entries(DEFAULT_ACCOUNTS_CONFIG)) {
    ACCOUNTS_CONFIG[k] = v;
  }
  // Add custom accounts
  if (Array.isArray(customList)) {
    for (const item of customList) {
      if (item && item.id) {
        ACCOUNTS_CONFIG[item.id] = { ...item, isCustom: true };
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

export function syncCustomAccounts(customList?: AccountMeta[]) {
  const safeList = Array.isArray(customList) ? customList : [];
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CUSTOM_ACCOUNTS_STORAGE_KEY, JSON.stringify(safeList));
    }
  } catch {
    // ignore storage errors
  }
  rebuildAccountExports(safeList);
}

// Initialize on module load from localStorage if available
rebuildAccountExports(loadSavedCustomAccounts());

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
