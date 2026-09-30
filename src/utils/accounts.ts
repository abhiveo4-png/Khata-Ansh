import { AccountId, AccountMeta } from '../types';

export const ACCOUNTS_CONFIG: Record<AccountId, AccountMeta> = {
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

export const ALL_ACCOUNTS: AccountMeta[] = Object.values(ACCOUNTS_CONFIG);

export const CREDIT_CARDS = ALL_ACCOUNTS.filter(a => a.type === 'credit_card' || a.type === 'rupay_card');
export const BANK_ACCOUNTS = ALL_ACCOUNTS.filter(a => a.type === 'bank_account');

/**
 * Smart detection of account/card from text
 */
export function detectAccount(text: string): AccountId | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();

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
