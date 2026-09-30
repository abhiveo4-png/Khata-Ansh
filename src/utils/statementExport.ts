import * as XLSX from 'xlsx';
import { Transaction, AccountId, CardEmi } from '../types';
import { ACCOUNTS_CONFIG, ALL_ACCOUNTS } from './accounts';

export interface StatementExportOptions {
  accountId: AccountId | 'all';
  transactions: Transaction[];
  emis: CardEmi[];
  dateRange: 'all' | 'this_month' | 'last_month' | 'last_90_days' | 'fy' | 'custom';
  startDate?: string;
  endDate?: string;
  includeEmis?: boolean;
  includeOverview?: boolean;
}

export function filterTransactionsForStatement(
  transactions: Transaction[],
  accountId: AccountId | 'all',
  dateRange: 'all' | 'this_month' | 'last_month' | 'last_90_days' | 'fy' | 'custom',
  customStart?: string,
  customEnd?: string
): Transaction[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  return transactions.filter((t) => {
    // 1. Account filter
    if (accountId !== 'all' && t.account !== accountId) {
      return false;
    }

    // 2. Date filter
    const tDateStr = t.date || '';
    if (!tDateStr) return true;

    if (dateRange === 'all') return true;

    if (dateRange === 'this_month') {
      const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
      return tDateStr.startsWith(monthStr);
    }

    if (dateRange === 'last_month') {
      const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
      const prevYear = prevMonthDate.getFullYear();
      const prevMonth = prevMonthDate.getMonth();
      const prevMonthStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
      return tDateStr.startsWith(prevMonthStr);
    }

    if (dateRange === 'last_90_days') {
      const past90Days = new Date();
      past90Days.setDate(past90Days.getDate() - 90);
      const past90Str = past90Days.toISOString().slice(0, 10);
      return tDateStr >= past90Str;
    }

    if (dateRange === 'fy') {
      // Indian Financial Year: April 1 to March 31
      let fyStartYear = currentYear;
      if (currentMonth < 3) {
        fyStartYear = currentYear - 1; // Jan-Mar belongs to previous FY start
      }
      const fyStartStr = `${fyStartYear}-04-01`;
      const fyEndStr = `${fyStartYear + 1}-03-31`;
      return tDateStr >= fyStartStr && tDateStr <= fyEndStr;
    }

    if (dateRange === 'custom') {
      if (customStart && tDateStr < customStart) return false;
      if (customEnd && tDateStr > customEnd) return false;
      return true;
    }

    return true;
  }).sort((a, b) => {
    const dateComp = (b.date || '').localeCompare(a.date || '');
    if (dateComp !== 0) return dateComp;
    return (b.time || '').localeCompare(a.time || '');
  });
}

export function exportAccountStatementToExcel(options: StatementExportOptions): {
  success: boolean;
  filename: string;
  txCount: number;
  totalDebits: number;
  totalCredits: number;
} {
  const {
    accountId,
    transactions,
    emis,
    dateRange,
    startDate,
    endDate,
    includeEmis = true,
    includeOverview = true,
  } = options;

  const filteredTxs = filterTransactionsForStatement(
    transactions,
    accountId,
    dateRange,
    startDate,
    endDate
  );

  const accountMeta = accountId !== 'all' ? ACCOUNTS_CONFIG[accountId] : null;
  const accountDisplayName = accountMeta ? accountMeta.name : 'Consolidated (All Accounts & Cards)';
  const accountTypeLabel = accountMeta
    ? accountMeta.type.replace('_', ' ').toUpperCase()
    : 'ALL ACCOUNTS & CARDS';

  // Calculate Totals
  const totalDebits = filteredTxs
    .filter((t) => t.type === 'expense' && !t.isSavingsTransfer)
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const totalCredits = filteredTxs
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const totalTransfers = filteredTxs
    .filter((t) => t.isSavingsTransfer || t.category === 'Transfer' || t.category === 'Bill Payment')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const netBalance = totalCredits - totalDebits;

  // Date range display string
  let periodLabel = 'All Time';
  const now = new Date();
  if (dateRange === 'this_month') {
    periodLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  } else if (dateRange === 'last_month') {
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    periodLabel = prevMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  } else if (dateRange === 'last_90_days') {
    periodLabel = 'Last 90 Days';
  } else if (dateRange === 'fy') {
    const fyStart = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
    periodLabel = `Financial Year (FY ${fyStart}-${(fyStart + 1).toString().slice(2)})`;
  } else if (dateRange === 'custom') {
    periodLabel = `${startDate || 'Start'} to ${endDate || 'Present'}`;
  }

  const generatedDateStr = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const wb = XLSX.utils.book_new();

  // ==========================================
  // SHEET 1: Statement Transactions
  // ==========================================
  const statementRows: any[][] = [
    ['========================================================================'],
    [`ACCOUNT STATEMENT: ${accountDisplayName.toUpperCase()}`],
    ['========================================================================'],
    ['Account Name:', accountDisplayName, '', 'Statement Period:', periodLabel],
    ['Account ID / Code:', accountId === 'all' ? 'ALL_COMBINED' : accountId, '', 'Statement Date:', generatedDateStr],
    ['Account Category:', accountTypeLabel, '', 'Total Records:', filteredTxs.length],
    ['------------------------------------------------------------------------'],
    ['SUMMARY OF MOVEMENTS'],
    ['Total Credits / Inflow (+):', `INR ${totalCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
    ['Total Debits / Spends (-):', `INR ${totalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
    ['Transfers / Adjustments:', `INR ${totalTransfers.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
    ['Net Movement (Credits - Debits):', `INR ${netBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
    ['========================================================================'],
    [], // Blank separator row
    [
      'S.No',
      'Date',
      'Time',
      'Particulars / Narration',
      'Category',
      'Account / Card',
      'Tx Type',
      'Credit Inflow (₹)',
      'Debit Outflow (₹)',
      'Payment Mode',
      'Member / Sender',
      'Reimbursement Status',
      'Tags',
      'Raw Note / Message',
      'Reference Tx ID',
    ],
  ];

  filteredTxs.forEach((t, idx) => {
    const isCredit = t.type === 'income';
    const isDebit = t.type === 'expense';
    const creditVal = isCredit ? Number(t.amount || 0) : 0;
    const debitVal = isDebit ? Number(t.amount || 0) : 0;

    statementRows.push([
      idx + 1,
      t.date || '',
      t.time || '',
      t.description || t.category || '',
      t.category || '',
      t.account || accountId,
      t.type ? t.type.toUpperCase() : 'EXPENSE',
      creditVal > 0 ? creditVal : '',
      debitVal > 0 ? debitVal : '',
      t.paymentMethod || '',
      t.telegramUser || 'Self',
      t.reimbursementStatus || 'None',
      Array.isArray(t.tags) ? t.tags.join(', ') : '',
      t.rawMessage || '',
      t.id || '',
    ]);
  });

  // Add Summary Total Row at the bottom
  statementRows.push([]);
  statementRows.push([
    'TOTAL',
    '',
    '',
    `Total of ${filteredTxs.length} Transactions`,
    '',
    '',
    '',
    totalCredits,
    totalDebits,
    '',
    '',
    '',
    '',
    '',
    '',
  ]);

  const wsStatement = XLSX.utils.aoa_to_sheet(statementRows);

  // Auto-fit column widths
  wsStatement['!cols'] = [
    { wch: 6 },  // S.No
    { wch: 12 }, // Date
    { wch: 10 }, // Time
    { wch: 34 }, // Particulars
    { wch: 18 }, // Category
    { wch: 18 }, // Account / Card
    { wch: 12 }, // Tx Type
    { wch: 18 }, // Credit Inflow
    { wch: 18 }, // Debit Outflow
    { wch: 16 }, // Payment Mode
    { wch: 16 }, // Member
    { wch: 20 }, // Reimbursement
    { wch: 20 }, // Tags
    { wch: 35 }, // Raw Note
    { wch: 24 }, // Reference ID
  ];

  const mainSheetName = accountId === 'all' ? 'Consolidated Statement' : (accountMeta?.shortName || 'Account Statement');
  XLSX.utils.book_append_sheet(wb, wsStatement, mainSheetName.slice(0, 31));

  // ==========================================
  // SHEET 2: Active EMIs & Installments (if applicable)
  // ==========================================
  const relevantEmis = emis.filter((e) => {
    if (accountId === 'all') return true;
    return e.cardId === accountId;
  });

  if (includeEmis && relevantEmis.length > 0) {
    const emiRows: any[][] = [
      ['========================================================================'],
      [`UNDERLYING EMIs & LOANS SCHEDULE: ${accountDisplayName.toUpperCase()}`],
      ['========================================================================'],
      ['Generated On:', generatedDateStr],
      ['Total Active EMIs:', relevantEmis.length],
      ['Total Monthly Installment Burden:', `INR ${relevantEmis.reduce((s, e) => s + (e.monthlyAmount || 0), 0).toLocaleString('en-IN')}`],
      ['========================================================================'],
      [],
      [
        'S.No',
        'EMI Title / Item',
        'Card / Account',
        'Estimated Principal (₹)',
        'Monthly EMI (₹)',
        'Total Months',
        'Paid Months',
        'Remaining Months',
        'Balance Outstanding (₹)',
        'Start Date',
        'Monthly Due Day',
        'Notes',
      ],
    ];

    relevantEmis.forEach((e, idx) => {
      const remainingMonths = Math.max(0, (e.totalMonths || 0) - (e.paidMonths || 0));
      const balanceAmount = remainingMonths * (e.monthlyAmount || 0);
      const estPrincipal = (e.monthlyAmount || 0) * (e.totalMonths || 0);

      emiRows.push([
        idx + 1,
        e.title || '',
        e.cardId || '',
        estPrincipal,
        e.monthlyAmount || 0,
        e.totalMonths || 0,
        e.paidMonths || 0,
        remainingMonths,
        balanceAmount,
        e.startDate || '',
        `Day ${e.dueDay || 15} of month`,
        e.notes || '',
      ]);
    });

    const wsEmis = XLSX.utils.aoa_to_sheet(emiRows);
    wsEmis['!cols'] = [
      { wch: 6 },  // S.No
      { wch: 28 }, // Title
      { wch: 18 }, // Card
      { wch: 22 }, // Principal
      { wch: 18 }, // Monthly EMI
      { wch: 14 }, // Total Months
      { wch: 14 }, // Paid Months
      { wch: 18 }, // Remaining Months
      { wch: 22 }, // Balance Outstanding
      { wch: 14 }, // Start Date
      { wch: 20 }, // Due Day
      { wch: 30 }, // Notes
    ];

    XLSX.utils.book_append_sheet(wb, wsEmis, 'EMIs Schedule');
  }

  // ==========================================
  // SHEET 3: Accounts Portfolio Summary (if All Accounts or requested)
  // ==========================================
  if (includeOverview || accountId === 'all') {
    const overviewRows: any[][] = [
      ['========================================================================'],
      ['ACCOUNTS & CARDS PORTFOLIO SUMMARY'],
      ['========================================================================'],
      ['Period:', periodLabel, '', 'Report Generated:', generatedDateStr],
      ['========================================================================'],
      [],
      [
        'Account ID',
        'Account / Card Name',
        'Account Type',
        'Total Debits / Spends (₹)',
        'Total Credits / Inflows (₹)',
        'Net Outflow / Balance (₹)',
        'Total Tx Count',
        'Active EMIs Count',
        'Monthly EMI (₹)',
      ],
    ];

    ALL_ACCOUNTS.forEach((acc) => {
      const accTxs = transactions.filter((t) => t.account === acc.id);
      const accFiltered = filterTransactionsForStatement(accTxs, acc.id, dateRange, startDate, endDate);

      const accDebits = accFiltered
        .filter((t) => t.type === 'expense' && !t.isSavingsTransfer)
        .reduce((s, t) => s + (t.amount || 0), 0);

      const accCredits = accFiltered
        .filter((t) => t.type === 'income')
        .reduce((s, t) => s + (t.amount || 0), 0);

      const accEmis = emis.filter((e) => e.cardId === acc.id);
      const accMonthlyEmi = accEmis.reduce((s, e) => s + (e.monthlyAmount || 0), 0);

      overviewRows.push([
        acc.id,
        acc.name,
        acc.type.replace('_', ' ').toUpperCase(),
        accDebits,
        accCredits,
        accCredits - accDebits,
        accFiltered.length,
        accEmis.length,
        accMonthlyEmi,
      ]);
    });

    const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
    wsOverview['!cols'] = [
      { wch: 18 },
      { wch: 28 },
      { wch: 18 },
      { wch: 24 },
      { wch: 24 },
      { wch: 24 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
    ];

    XLSX.utils.book_append_sheet(wb, wsOverview, 'Accounts Overview');
  }

  // Generate Filename
  const dateSafeStr = new Date().toISOString().slice(0, 10);
  const accountSlug = accountId === 'all'
    ? 'All_Accounts_Consolidated'
    : (accountMeta?.shortName || accountId).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');

  const filename = `${accountSlug}_Statement_${dateRange}_${dateSafeStr}.xlsx`;

  // Trigger download
  XLSX.writeFile(wb, filename);

  return {
    success: true,
    filename,
    txCount: filteredTxs.length,
    totalDebits,
    totalCredits,
  };
}
