import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Printer, 
  Calendar, 
  X, 
  CreditCard, 
  Building2, 
  Wallet, 
  Zap, 
  ReceiptText, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  CheckCircle2, 
  SlidersHorizontal 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Transaction, AccountId, CardEmi } from '../types';
import { ACCOUNTS_CONFIG, ALL_ACCOUNTS } from '../utils/accounts';

interface AccountStatementDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  emis: CardEmi[];
  initialAccountId?: AccountId | 'all';
}

type DatePreset = 'all' | 'this-month' | 'last-month' | 'last-3-months' | 'billing-cycle' | 'custom';
type ExportFormat = 'xlsx' | 'csv' | 'print';
type TxFilterType = 'all' | 'expense' | 'income';

export const AccountStatementDownloadModal: React.FC<AccountStatementDownloadModalProps> = ({
  isOpen,
  onClose,
  transactions,
  emis,
  initialAccountId = 'all',
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<AccountId | 'all'>(initialAccountId);
  const [datePreset, setDatePreset] = useState<DatePreset>('this-month');
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [toDate, setToDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [txTypeFilter, setTxTypeFilter] = useState<TxFilterType>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);

  // Sync initial account when opened
  React.useEffect(() => {
    if (isOpen) {
      setSelectedAccountId(initialAccountId);
    }
  }, [isOpen, initialAccountId]);

  // Handle Preset change
  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'all') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'this-month') {
      const start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      setFromDate(start);
      setToDate(todayStr);
    } else if (preset === 'last-month') {
      let y = today.getFullYear();
      let m = today.getMonth(); // 0-indexed is previous month
      if (m === 0) {
        m = 12;
        y = y - 1;
      }
      const lastDay = new Date(y, m, 0).getDate();
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      setFromDate(start);
      setToDate(end);
    } else if (preset === 'last-3-months') {
      const past = new Date();
      past.setMonth(past.getMonth() - 2);
      const start = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-01`;
      setFromDate(start);
      setToDate(todayStr);
    } else if (preset === 'billing-cycle') {
      const meta = selectedAccountId !== 'all' ? ACCOUNTS_CONFIG[selectedAccountId] : null;
      const billingDay = meta?.billingDay || 15;
      const d = new Date();
      let billYear = d.getFullYear();
      let billMonth = d.getMonth() + 1;
      if (d.getDate() < billingDay) {
        billMonth -= 1;
        if (billMonth < 1) {
          billMonth = 12;
          billYear -= 1;
        }
      }
      const start = `${billYear}-${String(billMonth).padStart(2, '0')}-${String(billingDay).padStart(2, '0')}`;
      setFromDate(start);
      setToDate(todayStr);
    }
  };

  // Filtered transactions for statement
  const statementTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // 1. Account Filter
      if (selectedAccountId !== 'all') {
        const txAcc = t.account || 'ICICI CC 0000';
        if (txAcc !== selectedAccountId) return false;
      }

      // 2. Type Filter
      if (txTypeFilter !== 'all') {
        if (t.type !== txTypeFilter) return false;
      }

      // 3. Date Range Filter
      const txDate = (t.date || '').slice(0, 10);
      if (fromDate && txDate < fromDate) return false;
      if (toDate && txDate > toDate) return false;

      return true;
    }).sort((a, b) => {
      const timeA = new Date(`${a.date}T${a.time || '00:00'}`).getTime();
      const timeB = new Date(`${b.date}T${b.time || '00:00'}`).getTime();
      return timeB - timeA;
    });
  }, [transactions, selectedAccountId, txTypeFilter, fromDate, toDate]);

  // Account EMIs
  const accountEmis = useMemo(() => {
    if (selectedAccountId === 'all') return emis;
    return emis.filter((e) => e.cardId === selectedAccountId);
  }, [emis, selectedAccountId]);

  // Calculations for statement
  const totalDebits = statementTransactions
    .filter((t) => t.type === 'expense' && !t.isSavingsTransfer)
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const totalCredits = statementTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const totalEmisAmount = accountEmis.reduce((sum, e) => sum + (Number(e.monthlyAmount) || 0), 0);
  const netOutflow = totalDebits - totalCredits;

  const currentMeta = selectedAccountId !== 'all' ? ACCOUNTS_CONFIG[selectedAccountId] : null;
  const accountLabel = currentMeta ? currentMeta.name : 'All Accounts Consolidated';
  const accountShortName = currentMeta ? currentMeta.shortName : 'All_Accounts';

  // Export to Excel
  const handleExportExcel = () => {
    setIsExporting(true);
    try {
      const rangeTag = fromDate && toDate ? `${fromDate}_to_${toDate}` : 'All_Time';
      const fileName = `Statement_${accountShortName.replace(/\s+/g, '_')}_${rangeTag}.xlsx`;

      // Sheet 1: Transactions Table
      const txRows = statementTransactions.map((t, idx) => ({
        'S.No': idx + 1,
        'Date': t.date || '',
        'Time': t.time || '12:00',
        'Account / Card': t.account || 'ICICI CC 0000',
        'Transaction Type': t.type === 'income' ? 'CREDIT / KAMAI' : 'DEBIT / KHARCHA',
        'Category': t.category || 'Uncategorized',
        'Description': t.description || '',
        'Amount (INR)': Number(t.amount) || 0,
        'Payment Method': t.paymentMethod || 'UPI',
        'Reimbursement': t.isReimbursement ? `YES (${t.reimbursementStatus || 'pending'})` : 'NO',
        'Wife Savings Transfer': t.isSavingsTransfer ? 'YES' : 'NO',
        'Investment': t.isInvestment ? 'YES' : 'NO',
        'Original Message': t.rawMessage || '',
        'Tags': Array.isArray(t.tags) ? t.tags.join(', ') : '',
        'Ref ID': t.id || '',
      }));

      // Sheet 2: Statement Summary KPI
      const summaryRows = [
        { 'Metric / Detail': 'Account / Card Name', 'Value': accountLabel },
        { 'Metric / Detail': 'Account ID / Code', 'Value': selectedAccountId },
        { 'Metric / Detail': 'Statement Period', 'Value': fromDate && toDate ? `${fromDate} to ${toDate}` : 'All Recorded History' },
        { 'Metric / Detail': 'Total Transactions Count', 'Value': statementTransactions.length },
        { 'Metric / Detail': 'Total Spends / Debits (INR)', 'Value': totalDebits },
        { 'Metric / Detail': 'Total Credits / Inflow (INR)', 'Value': totalCredits },
        { 'Metric / Detail': 'Net Difference (INR)', 'Value': netOutflow },
        { 'Metric / Detail': 'Active Running EMIs Count', 'Value': accountEmis.length },
        { 'Metric / Detail': 'Monthly EMI Burden (INR)', 'Value': totalEmisAmount },
        { 'Metric / Detail': 'Generated On', 'Value': new Date().toLocaleString('en-IN') },
      ];

      // Sheet 3: Underlying EMIs (if any)
      const emiRows = accountEmis.map((e, idx) => ({
        'S.No': idx + 1,
        'Card / Account': e.cardId,
        'EMI Title': e.title,
        'Monthly Amount (INR)': Number(e.monthlyAmount) || 0,
        'Tenure (Months)': Number(e.totalMonths) || 12,
        'Paid Months': Number(e.paidMonths) || 0,
        'Remaining Months': Math.max(0, (Number(e.totalMonths) || 12) - (Number(e.paidMonths) || 0)),
        'Monthly Due Day': e.dueDay || 15,
        'Start Date': e.startDate || '',
        'Notes': e.notes || '',
      }));

      const workbook = XLSX.utils.book_new();

      // Append Statement Sheet
      const wsTx = XLSX.utils.json_to_sheet(txRows.length > 0 ? txRows : [{ 'Notice': 'No transactions found for this period' }]);
      XLSX.utils.book_append_sheet(workbook, wsTx, 'Account Statement');

      // Append Summary Sheet
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(workbook, wsSummary, 'Statement Summary');

      // Append EMIs Sheet if available
      if (emiRows.length > 0) {
        const wsEmis = XLSX.utils.json_to_sheet(emiRows);
        XLSX.utils.book_append_sheet(workbook, wsEmis, 'Active EMIs');
      }

      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error('Failed to export Excel statement:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    setIsExporting(true);
    try {
      const rangeTag = fromDate && toDate ? `${fromDate}_to_${toDate}` : 'All_Time';
      const fileName = `Statement_${accountShortName.replace(/\s+/g, '_')}_${rangeTag}.csv`;

      const txRows = statementTransactions.map((t, idx) => ({
        'S.No': idx + 1,
        'Date': t.date || '',
        'Time': t.time || '12:00',
        'Account': t.account || 'ICICI CC 0000',
        'Type': t.type === 'income' ? 'CREDIT' : 'DEBIT',
        'Category': t.category || 'Uncategorized',
        'Description': t.description || '',
        'Amount INR': Number(t.amount) || 0,
        'Payment Method': t.paymentMethod || 'UPI',
        'Reimbursement': t.isReimbursement ? 'YES' : 'NO',
        'Tags': Array.isArray(t.tags) ? t.tags.join(', ') : '',
        'ID': t.id || '',
      }));

      const ws = XLSX.utils.json_to_sheet(txRows);
      const csvContent = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV statement:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Trigger Printable Statement View
  const handlePrintStatement = () => {
    setIsPrintPreviewOpen(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      
      {/* PRINT PREVIEW / PRINTABLE STATEMENT VIEW */}
      {isPrintPreviewOpen ? (
        <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans">
          
          {/* Print Modal Top Controls */}
          <div className="p-4 bg-slate-950 border-b border-white/[0.1] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-white">
                  Statement Print & PDF Preview
                </h3>
                <p className="text-[11px] text-slate-400">
                  {accountLabel} • {fromDate && toDate ? `${fromDate} to ${toDate}` : 'All Recorded History'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-900/30 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print / Save PDF</span>
              </button>
              <button
                onClick={() => setIsPrintPreviewOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Printable Statement Sheet (Styled for Screen & Paper) */}
          <div className="p-6 sm:p-8 overflow-y-auto bg-slate-950 text-slate-100 space-y-6 print:p-0 print:bg-white print:text-black">
            
            {/* Statement Branded Header */}
            <div className="border-b-2 border-indigo-500/40 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <ReceiptText className="w-6 h-6 text-indigo-400" />
                  <h1 className="text-xl font-bold tracking-tight text-white">
                    TELEEXPENSE ACCOUNT STATEMENT
                  </h1>
                </div>
                <div className="text-sm font-semibold text-indigo-300 mt-1">
                  {accountLabel}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Account Type: {currentMeta?.badge || 'Multi-Account'} • Billing Day: ~{currentMeta?.billingDay || 15}th
                </div>
              </div>

              <div className="text-left sm:text-right text-xs text-slate-300 font-mono space-y-1">
                <div><b>Statement Period:</b> {fromDate && toDate ? `${fromDate} se ${toDate}` : 'All Time'}</div>
                <div><b>Generated On:</b> {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                <div><b>Total Entries:</b> {statementTransactions.length} Transactions</div>
              </div>
            </div>

            {/* Financial Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase">Kul Kharcha (Debits)</span>
                <span className="text-base font-bold text-rose-400 mt-1 block">
                  ₹{totalDebits.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase">Kul Kamai (Credits)</span>
                <span className="text-base font-bold text-emerald-400 mt-1 block">
                  ₹{totalCredits.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase">Net Outflow</span>
                <span className="text-base font-bold text-sky-300 mt-1 block">
                  ₹{netOutflow.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase">Active EMIs</span>
                <span className="text-base font-bold text-amber-400 mt-1 block">
                  ₹{totalEmisAmount.toLocaleString('en-IN')}/mo
                </span>
              </div>
            </div>

            {/* Active EMIs Section (if any) */}
            {accountEmis.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Active Underlying Card EMIs
                </h4>
                <div className="border border-slate-800 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-mono">
                      <tr>
                        <th className="p-2.5">EMI Item</th>
                        <th className="p-2.5">Monthly Installment</th>
                        <th className="p-2.5">Tenure</th>
                        <th className="p-2.5">Monthly Due Day</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300 font-mono">
                      {accountEmis.map((e) => (
                        <tr key={e.id}>
                          <td className="p-2.5 font-bold text-white">{e.title}</td>
                          <td className="p-2.5 text-amber-400 font-bold">₹{e.monthlyAmount.toLocaleString('en-IN')}</td>
                          <td className="p-2.5">{e.paidMonths} / {e.totalMonths} months paid</td>
                          <td className="p-2.5">{e.dueDay}th of month</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Transactions Statement Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Transaction Statement Ledger
              </h4>
              <div className="border border-slate-800 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-mono">
                    <tr>
                      <th className="p-2.5">Date & Time</th>
                      <th className="p-2.5">Description</th>
                      <th className="p-2.5">Category</th>
                      <th className="p-2.5">Account / Card</th>
                      <th className="p-2.5 text-right">Debit / Credit (INR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-300">
                    {statementTransactions.map((t) => {
                      const isInc = t.type === 'income';
                      return (
                        <tr key={t.id} className="hover:bg-slate-900/40">
                          <td className="p-2.5 font-mono text-slate-400 whitespace-nowrap">
                            {t.date} {t.time && <span className="text-[10px] text-slate-500">{t.time}</span>}
                          </td>
                          <td className="p-2.5">
                            <span className="font-semibold text-white">{t.description}</span>
                            {t.isReimbursement && (
                              <span className="ml-1.5 px-1 py-0.2 rounded bg-cyan-950 text-cyan-300 text-[9px] font-bold">
                                Rim
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-400">{t.category}</td>
                          <td className="p-2.5 font-mono text-sky-300 text-[11px]">{t.account || 'ICICI CC 0000'}</td>
                          <td className={`p-2.5 text-right font-mono font-bold whitespace-nowrap ${
                            isInc ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {isInc ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>TeleExpense Smart Ledger Automation</span>
              <span>End of Statement</span>
            </div>

          </div>
        </div>
      ) : (
        /* MAIN DOWNLOAD CONFIGURATION MODAL */
        <div className="bg-slate-900 border border-indigo-500/40 rounded-3xl max-w-xl w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150 font-mono text-xs">
          
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-950/80 border border-indigo-500/50 flex items-center justify-center text-indigo-400 shadow-md">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">
                  Download Account & Card Statement
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Excel (.xlsx), CSV ya PDF format me kisi bhi account ka statement download karein.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4 mt-5">
            
            {/* 1. Account Selection */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5">
                1. Select Account / Card (Khata Chunein)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAccountId('all')}
                  className={`p-2 rounded-xl text-left font-semibold border transition-all cursor-pointer ${
                    selectedAccountId === 'all'
                      ? 'bg-indigo-950/80 border-indigo-500 text-white shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="text-[10px] text-indigo-400 flex items-center gap-1">
                    <SlidersHorizontal className="w-3 h-3" /> Consolidated
                  </div>
                  <div className="font-bold text-xs mt-0.5 text-white truncate">All Accounts</div>
                </button>

                {ALL_ACCOUNTS.map((acc) => {
                  const isSelected = selectedAccountId === acc.id;
                  const isCC = acc.type === 'credit_card' || acc.type === 'rupay_card';
                  const isBank = acc.type === 'bank_account';

                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setSelectedAccountId(acc.id)}
                      className={`p-2 rounded-xl text-left font-semibold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-950/80 border-indigo-500 text-white shadow-md ring-1 ring-indigo-500/50'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        {isCC ? (
                          <CreditCard className="w-3 h-3 text-sky-400" />
                        ) : isBank ? (
                          <Building2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Wallet className="w-3 h-3 text-rose-400" />
                        )}
                        <span className="truncate">{acc.badge}</span>
                      </div>
                      <div className="font-bold text-xs mt-0.5 text-white truncate">{acc.shortName}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Date Range Presets */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5 flex items-center justify-between">
                <span>2. Statement Period (Tareeq Range)</span>
                {currentMeta?.billingDay && (
                  <span className="text-[10px] text-amber-400 font-mono">
                    Bill Day: {currentMeta.billingDay}th
                  </span>
                )}
              </label>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {[
                  { id: 'this-month', label: 'Is Mahine' },
                  { id: 'last-month', label: 'Pichla Mahina' },
                  { id: 'last-3-months', label: '3 Mahine' },
                  { id: 'billing-cycle', label: 'Bill Cycle' },
                  { id: 'all', label: 'All Time' },
                  { id: 'custom', label: 'Custom' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetChange(preset.id as DatePreset)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-all text-center cursor-pointer ${
                      datePreset === preset.id
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Custom From & To Inputs */}
              <div className="grid grid-cols-2 gap-3 mt-2.5">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">From Date (Shuru):</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      setDatePreset('custom');
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">To Date (Khatam):</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      setToDate(e.target.value);
                      setDatePreset('custom');
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* 3. Transaction Type Filter */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5">
                3. Entry Type (Sabhi / Sirf Kharcha / Sirf Kamai)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'all', label: 'Sabhi Spends & Inflow' },
                  { id: 'expense', label: '🔻 Sirf Kharcha (Debits)' },
                  { id: 'income', label: '🟢 Sirf Kamai (Credits)' },
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setTxTypeFilter(type.id as TxFilterType)}
                    className={`py-2 px-2.5 rounded-xl text-[11px] font-semibold border transition-all text-center cursor-pointer ${
                      txTypeFilter === type.id
                        ? 'bg-slate-800 text-white border-indigo-500 ring-1 ring-indigo-500/40'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Statement Summary Badge */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block">Statement Matching Records</span>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  {statementTransactions.length} Transactions found
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Total Outflow Amount</span>
                <span className="text-sm font-bold text-rose-400 mt-0.5 block">
                  ₹{totalDebits.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* 4. Action Buttons (Excel, CSV, Print PDF) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={isExporting || statementTransactions.length === 0}
                className="py-3 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>Download Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                disabled={isExporting || statementTransactions.length === 0}
                className="py-3 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Download CSV</span>
              </button>

              <button
                type="button"
                onClick={handlePrintStatement}
                disabled={statementTransactions.length === 0}
                className="py-3 px-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/40 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>Print / Save PDF</span>
              </button>
            </div>

          </div>

        </div>
      )}

    </div>
  );
};
