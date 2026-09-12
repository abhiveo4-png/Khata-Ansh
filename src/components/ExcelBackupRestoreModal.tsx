import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  FileText,
  Layers,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Info,
  Trash2,
  Plus,
  Database,
  Server,
  HardDrive,
  Copy,
  Check,
  ExternalLink,
  Tag,
  User,
  Wallet
} from 'lucide-react';
import { safeFetchJson } from '../utils/api';
import { Transaction, CategoryDef, CategoryBudget, FinancialSummary } from '../types';
import * as XLSX from 'xlsx';

interface StorageStatus {
  engine: 'postgres' | 'disk';
  isPostgresConnected: boolean;
  isPostgresConfigured: boolean;
  dataDir: string;
  isCustomDataDir: boolean;
  usersCount: number;
  cachedStoresCount: number;
  totalTransactions: number;
  uptime: number;
}

interface ExcelBackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  categories: CategoryDef[];
  currentUser: { name: string; id: string; telegramUsername?: string; telegramChatId?: string; linkCode?: string } | null;
  onRestoreSuccess: (result: {
    transactions: Transaction[];
    categories: CategoryDef[];
    budgets: CategoryBudget[];
    summary: FinancialSummary;
    restoredCount: number;
    categoriesCreated: number;
  }) => void;
}

export const ExcelBackupRestoreModal: React.FC<ExcelBackupRestoreModalProps> = ({
  isOpen,
  onClose,
  transactions,
  categories,
  currentUser,
  onRestoreSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'restore' | 'storage'>('export');
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [parsedCatRows, setParsedCatRows] = useState<any[]>([]);
  const [detectedSheets, setDetectedSheets] = useState<string[]>([]);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Storage tab states
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [isLoadingStorage, setIsLoadingStorage] = useState(false);
  const [isSyncingDb, setIsSyncingDb] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Fetch storage status
  const fetchStorageStatus = async () => {
    setIsLoadingStorage(true);
    const { data } = await safeFetchJson<StorageStatus>('/api/storage/status');
    if (data) {
      setStorageStatus(data);
    }
    setIsLoadingStorage(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchStorageStatus();
    }
  }, [isOpen]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSyncToPostgres = async () => {
    setIsSyncingDb(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const { data, error: apiErr } = await safeFetchJson<{ success?: boolean; message?: string; error?: string }>(
        '/api/storage/sync-now',
        { method: 'POST' }
      );
      if (apiErr || !data?.success) {
        setError(data?.error || apiErr || 'Postgres sync failed');
      } else {
        setSuccessMessage(data.message || 'Data successfully synced to PostgreSQL!');
        fetchStorageStatus();
      }
    } catch (err: any) {
      setError(err?.message || 'Sync error');
    } finally {
      setIsSyncingDb(false);
    }
  };

  if (!isOpen) return null;

  // Handle file drop & selection
  const processFile = async (selectedFile: File) => {
    setError(null);
    setSuccessMessage(null);
    setFile(selectedFile);

    try {
      const data = await selectedFile.arrayBuffer();
      
      // Convert to Base64 for high-fidelity server restore
      const bytes = new Uint8Array(data);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      setFileBase64(base64);

      // Read with XLSX on client for instant UI inspection
      const workbook = XLSX.read(data, { type: 'array' });
      setDetectedSheets(workbook.SheetNames);

      let txRows: any[] = [];
      let catRows: any[] = [];

      for (const sName of workbook.SheetNames) {
        const lowerName = sName.toLowerCase();
        const sheet = workbook.Sheets[sName];
        const rows = XLSX.utils.sheet_to_json<any>(sheet);
        if (lowerName.includes('transaction') || lowerName.includes('ledger')) {
          txRows = rows;
        } else if (lowerName.includes('categor') || lowerName.includes('budget')) {
          catRows = rows;
        }
      }

      // If no explicit transaction sheet, use first sheet
      if (txRows.length === 0 && workbook.SheetNames.length > 0) {
        txRows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]]);
      }

      if (txRows.length === 0 && catRows.length === 0) {
        setError('Uploaded file khali hai ya koi valid records nahi mile.');
        setParsedRows([]);
        setParsedCatRows([]);
        return;
      }

      setParsedRows(txRows);
      setParsedCatRows(catRows);
    } catch (err: any) {
      console.error('File parsing error', err);
      setError(`File padhne me error: ${err.message || 'Invalid Excel/CSV format'}`);
      setParsedRows([]);
      setParsedCatRows([]);
      setFileBase64(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Trigger restore API
  const handleRestore = async () => {
    if (parsedRows.length === 0 && parsedCatRows.length === 0 && !fileBase64) {
      setError('Pehle ek valid Excel (.xlsx) ya CSV backup file chuniye.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data, error: apiErr } = await safeFetchJson<{
        success: boolean;
        message: string;
        restoredCount: number;
        categoriesCreated: number;
        transactions: Transaction[];
        categories: CategoryDef[];
        budgets: CategoryBudget[];
        summary: FinancialSummary;
      }>('/api/transactions/restore-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: parsedRows,
          categoriesRows: parsedCatRows,
          fileBase64: fileBase64,
          replaceExisting,
        }),
      });

      if (apiErr || !data?.success) {
        setError(apiErr || 'Backup restore fail ho gaya.');
        return;
      }

      setSuccessMessage(data.message || `Pure account ka backup successfully restore ho gaya!`);
      onRestoreSuccess(data);

      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err: any) {
      setError(err?.message || 'Failed to restore transactions');
    } finally {
      setIsProcessing(false);
    }
  };

  // Download export helper
  const handleDownloadBackup = (format: 'xlsx' | 'csv') => {
    window.open(`/api/transactions/export-backup?format=${format}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-[#0b1220] border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl shadow-cyan-950/40 my-auto text-slate-100 flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950/50 to-cyan-950/40">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-indigo-900/40 shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white font-display flex items-center gap-2">
                EXCEL BACKUP & RESTORE
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                  ALL-IN-ONE
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Puri transaction list, categories, monthly budgets aur khate ka backup 1-click me download ya restore karein.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-1.5 gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('export')}
            className={`flex-1 min-w-[140px] py-2.5 rounded-xl text-xs font-mono font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'export'
                ? 'bg-gradient-to-r from-indigo-950/90 to-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-md shadow-cyan-950/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>DOWNLOAD BACKUP</span>
          </button>
          <button
            onClick={() => setActiveTab('restore')}
            className={`flex-1 min-w-[140px] py-2.5 rounded-xl text-xs font-mono font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'restore'
                ? 'bg-gradient-to-r from-indigo-950/90 to-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-md shadow-cyan-950/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4 text-cyan-400" />
            <span>RESTORE / UPLOAD</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('storage');
              fetchStorageStatus();
            }}
            className={`flex-1 min-w-[150px] py-2.5 rounded-xl text-xs font-mono font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'storage'
                ? 'bg-slate-900 text-emerald-300 border border-emerald-500/50 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4 text-emerald-400" />
            <span>PERMANENT DB</span>
            {storageStatus?.isPostgresConnected && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 font-mono">
          
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center space-x-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center space-x-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* TAB 1: EXPORT BACKUP */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              
              {/* Featured Primary 1-Click Excel Backup Button Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/50 via-slate-900 to-cyan-950/40 border border-cyan-500/40 space-y-4 shadow-xl shadow-cyan-950/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-500/40">
                      RECOMMENDED FOR FULL BACKUP
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white mt-1">
                      1-Click Complete Account Excel Backup (.xlsx)
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Ek hi Excel file me aapke khate ke <b>Transactions</b>, <b>Custom Categories</b>, <b>Monthly Budgets</b>, aur <b>Telegram Account Info</b> sab download ho jayenge.
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-950/80 border border-emerald-500/60 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                </div>

                {/* Account Summary Stats in Backup */}
                <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-slate-800">
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block">TRANSACTIONS</span>
                    <span className="font-bold text-white mt-0.5 block text-sm">{transactions.length} Records</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block">CATEGORIES</span>
                    <span className="font-bold text-cyan-300 mt-0.5 block text-sm">{categories.length} Categories</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block">KHATA USER</span>
                    <span className="font-bold text-emerald-400 mt-0.5 block truncate text-xs">{currentUser?.name || 'Main User'}</span>
                  </div>
                </div>

                {/* Big Download Button */}
                <button
                  onClick={() => handleDownloadBackup('xlsx')}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center space-x-2.5 transition-all cursor-pointer shadow-lg shadow-emerald-950/60 group"
                >
                  <Download className="w-5 h-5 stroke-[2.5] group-hover:translate-y-0.5 transition-transform" />
                  <span>DOWNLOAD FULL EXCEL BACKUP (.XLSX)</span>
                </button>
              </div>

              {/* Secondary Option: Standard CSV */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Standard CSV File (.CSV)</h4>
                    <p className="text-[10px] text-slate-400">Google Sheets ya plain table ke liye single-sheet CSV export</p>
                  </div>
                </div>

                <button
                  onClick={() => handleDownloadBackup('csv')}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV Download</span>
                </button>
              </div>

            </div>
          )}

          {/* TAB 2: RESTORE BACKUP */}
          {activeTab === 'restore' && (
            <div className="space-y-4">
              
              {/* Info Note */}
              <div className="p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex items-start space-x-3 text-xs text-slate-300">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Aap TeleExpense se download kiye gaye Excel (.xlsx) ya CSV file ko yahan upload karein. Isme <b>Transactions</b>, <b>Raw Telegram Messages</b>, <b>Custom Categories</b> aur <b>Budgets</b> sab automatic restore ho jayenge.
                </p>
              </div>

              {/* Upload Drag & Drop Area */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all cursor-pointer ${
                  dragOver
                    ? 'border-cyan-400 bg-cyan-950/40 scale-[0.99]'
                    : file
                    ? 'border-emerald-500/60 bg-emerald-950/20'
                    : 'border-slate-700 hover:border-cyan-500/60 bg-slate-900/40 hover:bg-slate-900/80'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 text-cyan-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
                  {file ? <FileSpreadsheet className="w-6 h-6 text-emerald-400" /> : <Upload className="w-6 h-6 text-cyan-400" />}
                </div>

                {file ? (
                  <div>
                    <span className="text-xs font-bold text-emerald-300 block truncate max-w-sm mx-auto">
                      {file.name}
                    </span>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      {parsedRows.length} transactions {parsedCatRows.length > 0 ? `• ${parsedCatRows.length} categories` : ''} mili hain • Click karke doosri file chuniye
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs font-bold text-white block">
                      Excel (.xlsx) ya CSV Backup File Yahan Upload Karein
                    </span>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Supports TeleExpense exported full backups with all categories & raw messages
                    </span>
                  </div>
                )}
              </div>

              {/* Detected Content Badges */}
              {file && (
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    FILE ME PAYA GAYA DATA:
                  </span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <b>{parsedRows.length}</b> Transactions
                    </span>
                    {parsedCatRows.length > 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5" />
                        <b>{parsedCatRows.length}</b> Categories & Budgets
                      </span>
                    )}
                    {detectedSheets.length > 1 && (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Multi-Sheet Complete Backup
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Restore Mode Toggle */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
                  RESTORE MODE
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReplaceExisting(false)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      !replaceExisting
                        ? 'bg-cyan-950/50 border-cyan-500/60 text-white shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Plus className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold">Mojuda Data me Jodein (Append)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Purane transactions safe rahenge, naye records add ho jayenge.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReplaceExisting(true)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      replaceExisting
                        ? 'bg-rose-950/40 border-rose-500/60 text-white shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Trash2 className="w-4 h-4 text-rose-400" />
                      <span className="text-xs font-bold">Fresh Restore (Replace All)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Pehle purane records clear karke backup wala pura data load karega.
                    </p>
                  </button>
                </div>
              </div>

              {/* Parsed Preview Table */}
              {parsedRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-bold text-slate-200">
                      TRANSACTION PREVIEW ({parsedRows.length} RECORDS)
                    </span>
                    <span className="text-[10px] text-cyan-400">
                      Showing first 4 rows
                    </span>
                  </div>

                  <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/90 text-[11px]">
                    <table className="w-full text-left">
                      <thead className="bg-slate-900/90 text-slate-400 sticky top-0 border-b border-slate-800 text-[10px]">
                        <tr>
                          <th className="p-2">Tareeq</th>
                          <th className="p-2">Type</th>
                          <th className="p-2">Amount</th>
                          <th className="p-2">Category</th>
                          <th className="p-2">Raw Message / Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900 text-slate-300">
                        {parsedRows.slice(0, 4).map((row, idx) => {
                          const date = row.Date || row.date || row.Tareeq || '—';
                          const type = String(row.Type || row.type || 'expense').toLowerCase();
                          const amount = row['Amount (INR)'] || row.Amount || row.amount || row.rupaye || '0';
                          const category = row['Category Name'] || row.Category || row.category || 'Uncategorized';
                          const msg = row['Raw Message'] || row.rawMessage || row.Description || row.description || '—';

                          return (
                            <tr key={idx} className="hover:bg-slate-900/50">
                              <td className="p-2 whitespace-nowrap text-slate-400">{String(date)}</td>
                              <td className="p-2 whitespace-nowrap">
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                  type.includes('income') ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
                                }`}>
                                  {type.toUpperCase()}
                                </span>
                              </td>
                              <td className="p-2 font-bold text-white whitespace-nowrap">₹{amount}</td>
                              <td className="p-2 text-cyan-300 whitespace-nowrap">{category}</td>
                              <td className="p-2 text-slate-400 truncate max-w-xs">{String(msg)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 3: RENDER PERMANENT STORAGE & POSTGRESQL */}
          {activeTab === 'storage' && (
            <div className="space-y-4">
              
              {/* Live Status Card */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                      storageStatus?.isPostgresConnected
                        ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-400'
                        : 'bg-amber-950/80 border-amber-500/60 text-amber-400'
                    }`}>
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs flex items-center gap-2">
                        CURRENT STORAGE ENGINE:
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          storageStatus?.isPostgresConnected
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50'
                            : 'bg-amber-950 text-amber-300 border border-amber-500/50'
                        }`}>
                          {storageStatus?.isPostgresConnected ? 'POSTGRESQL (PERMANENT CLOUD DB)' : 'LOCAL / EPHEMERAL DISK'}
                        </span>
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {storageStatus?.isPostgresConnected
                          ? 'Data Render container restart hone par bhi 100% safe aur permanent rahega.'
                          : 'Render Free Tier restart par local disk wipe ho jati hai. Neeche diye steps se PostgreSQL connect karein!'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={fetchStorageStatus}
                    disabled={isLoadingStorage}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStorage ? 'animate-spin' : ''}`} />
                    <span className="text-[10px]">REFRESH</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-xs">
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">DB CONNECTED</span>
                    <span className={`font-bold mt-0.5 block ${storageStatus?.isPostgresConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {storageStatus?.isPostgresConnected ? 'YES (Active)' : 'NO (Using Disk)'}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">DATA DIRECTORY</span>
                    <span className="font-bold text-cyan-300 mt-0.5 block truncate text-[10px]">
                      {storageStatus?.dataDir || '.data'}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">TOTAL USERS</span>
                    <span className="font-bold text-white mt-0.5 block">{storageStatus?.usersCount || 1} Accounts</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">TOTAL TXS</span>
                    <span className="font-bold text-white mt-0.5 block">{storageStatus?.totalTransactions || transactions.length} Records</span>
                  </div>
                </div>
              </div>

              {/* Step by Step Guide: Method 1 - Neon.tech */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-cyan-950/40 border border-cyan-500/40 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[11px] font-bold">1</span>
                    <h4 className="font-bold text-white text-xs">
                      RECOMMENDED: NEON.TECH (LIFETIME FREE • NO 30-DAY EXPIRY)
                    </h4>
                  </div>
                  <span className="text-[10px] text-emerald-300 bg-emerald-950/80 border border-emerald-500/50 px-2 py-0.5 rounded-full font-bold">
                    PERMANENT FREE TIER
                  </span>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Render ka apna free PostgreSQL 30 days me expire ho jata hai. Isliye <b>Neon (<a href="https://neon.tech" target="_blank" rel="noreferrer" className="text-cyan-400 underline font-semibold inline-flex items-center gap-0.5">neon.tech <ExternalLink className="w-3 h-3" /></a>)</b> sabse best aur permanent solution hai (0.5GB Free Forever, No Credit Card needed).
                </p>

                <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start space-x-2">
                    <span className="text-emerald-400 font-bold shrink-0">Step 1:</span>
                    <p>
                      <a href="https://neon.tech" target="_blank" rel="noreferrer" className="text-cyan-400 font-bold underline inline-flex items-center gap-0.5">Neon.tech <ExternalLink className="w-3 h-3" /></a> par jayein aur GitHub / Google se Free Account create karein.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start space-x-2">
                    <span className="text-emerald-400 font-bold shrink-0">Step 2:</span>
                    <p>
                      Dashboard par <b>"Create Project"</b> (name: <code>teleexpense</code>) karein. Screen par <b>"Connection Details"</b> me <code>postgres://...</code> URL copy karein.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start space-x-2">
                    <span className="text-emerald-400 font-bold shrink-0">Step 3:</span>
                    <div className="flex-1">
                      <p>
                        Render me apni Web Service ke <b>Environment</b> tab me jayein aur ye Variable add karein:
                      </p>
                      <div className="mt-2 p-2 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-between gap-2">
                        <code className="text-emerald-400 text-[11px] font-mono select-all">
                          DATABASE_URL = postgres://user:password@ep-xyz.neon.tech/neondb?sslmode=require
                        </code>
                        <button
                          onClick={() => handleCopy('DATABASE_URL', 'db_url')}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          {copiedKey === 'db_url' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          {copiedKey === 'db_url' ? 'COPIED' : 'COPY KEY'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {storageStatus?.isPostgresConfigured && (
                  <div className="pt-2">
                    <button
                      onClick={handleSyncToPostgres}
                      disabled={isSyncingDb}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-lg shadow-emerald-950/50"
                    >
                      {isSyncingDb ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>DATABASE ME SYNC HO RHA HAI...</span>
                        </>
                      ) : (
                        <>
                          <Database className="w-4 h-4" />
                          <span>ABHI KA SARA DATA NEON/POSTGRESQL ME SYNC KAREIN</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-800 text-xs font-mono text-slate-400 hover:text-white hover:bg-slate-900 transition-all cursor-pointer"
          >
            BAND KAREIN
          </button>

          {activeTab === 'export' && (
            <button
              onClick={() => handleDownloadBackup('xlsx')}
              className="px-5 py-2.5 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 shadow-lg shadow-emerald-950/50 flex items-center space-x-2 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>DOWNLOAD EXCEL BACKUP</span>
            </button>
          )}

          {activeTab === 'restore' && (
            <button
              onClick={handleRestore}
              disabled={isProcessing || (parsedRows.length === 0 && parsedCatRows.length === 0 && !fileBase64)}
              className={`px-5 py-2.5 rounded-xl text-xs font-mono font-bold flex items-center space-x-2 shadow-lg transition-all cursor-pointer ${
                (parsedRows.length > 0 || parsedCatRows.length > 0 || fileBase64) && !isProcessing
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-950/50'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>RESTORING SAB KUCHH...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 stroke-[2.5]" />
                  <span>{parsedRows.length > 0 ? `RESTORE SAB KUCHH (${parsedRows.length} TXS)` : 'FILE CHUNIYE'}</span>
                </>
              )}
            </button>
          )}

          {activeTab === 'storage' && (
            <button
              onClick={() => setActiveTab('export')}
              className="px-4 py-2.5 rounded-xl bg-cyan-950 border border-cyan-500/50 text-cyan-300 text-xs font-mono font-bold hover:bg-cyan-900/60 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>BACKUP DOWNLOAD PAR JAYEIN</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
