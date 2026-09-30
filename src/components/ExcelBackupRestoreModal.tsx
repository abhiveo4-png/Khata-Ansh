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
  Wallet,
  ArrowLeftRight,
  Fuel,
  PiggyBank,
  Users,
  Coins,
  TrendingUp,
  HeartHandshake,
  CreditCard
} from 'lucide-react';
import { safeFetchJson } from '../utils/api';
import { 
  Transaction, 
  CategoryDef, 
  CategoryBudget, 
  FinancialSummary, 
  UdhaarRecord, 
  FuelLog, 
  InvestmentRecord, 
  SavingsTransfer, 
  CardEmi, 
  RestoreBackupResult 
} from '../types';
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
  currentUser: { name: string; id: string; telegramUsername?: string; telegramChatId?: string; linkCode?: string; linkedMembers?: any[] } | null;
  udhaars?: UdhaarRecord[];
  fuelLogs?: FuelLog[];
  investments?: InvestmentRecord[];
  savingsTransfers?: SavingsTransfer[];
  cardEmis?: CardEmi[];
  onRestoreSuccess: (result: RestoreBackupResult) => void;
}

export const ExcelBackupRestoreModal: React.FC<ExcelBackupRestoreModalProps> = ({
  isOpen,
  onClose,
  transactions,
  categories,
  currentUser,
  udhaars = [],
  fuelLogs = [],
  investments = [],
  savingsTransfers = [],
  cardEmis = [],
  onRestoreSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'restore' | 'storage'>('export');
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [parsedCatRows, setParsedCatRows] = useState<any[]>([]);
  const [parsedUdhaarRows, setParsedUdhaarRows] = useState<any[]>([]);
  const [parsedFuelRows, setParsedFuelRows] = useState<any[]>([]);
  const [parsedInvRows, setParsedInvRows] = useState<any[]>([]);
  const [parsedSavRows, setParsedSavRows] = useState<any[]>([]);
  const [parsedEmiRows, setParsedEmiRows] = useState<any[]>([]);
  const [isSnapshotDetected, setIsSnapshotDetected] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<'transactions' | 'udhaars' | 'fuel' | 'investments' | 'savings' | 'emis'>('transactions');
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
    setIsSnapshotDetected(false);

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
      let udhaarRows: any[] = [];
      let fuelRows: any[] = [];
      let invRows: any[] = [];
      let savRows: any[] = [];
      let emiRows: any[] = [];
      let foundSnapshot = false;

      // 1. Check for High-Fidelity JSON snapshot sheet
      const metaSheet = workbook.Sheets['_TeleExpense_Backup_Data_'];
      if (metaSheet) {
        const metaRows = XLSX.utils.sheet_to_json<any>(metaSheet);
        if (metaRows.length > 0) {
          const fullJsonStr = metaRows.map(r => r.DataJSON || r.ChunkText || '').join('');
          if (fullJsonStr.trim().startsWith('{')) {
            try {
              const fullData = JSON.parse(fullJsonStr);
              if (Array.isArray(fullData.transactions)) txRows = fullData.transactions;
              if (Array.isArray(fullData.categories)) catRows = fullData.categories;
              if (Array.isArray(fullData.udhaars)) udhaarRows = fullData.udhaars;
              if (Array.isArray(fullData.fuelLogs)) fuelRows = fullData.fuelLogs;
              if (Array.isArray(fullData.investments)) invRows = fullData.investments;
              if (Array.isArray(fullData.savingsTransfers)) savRows = fullData.savingsTransfers;
              if (Array.isArray(fullData.cardEmis)) emiRows = fullData.cardEmis;
              foundSnapshot = true;
              setIsSnapshotDetected(true);
            } catch (err) {
              console.warn('Client JSON snapshot parse error, falling back to sheet rows', err);
            }
          }
        }
      }

      // 2. If not from snapshot, inspect individual sheets
      if (!foundSnapshot) {
        for (const sName of workbook.SheetNames) {
          const lowerName = sName.toLowerCase();
          const sheet = workbook.Sheets[sName];
          const rows = XLSX.utils.sheet_to_json<any>(sheet);
          if (lowerName.includes('transaction') || lowerName.includes('ledger')) {
            txRows = rows;
          } else if (lowerName.includes('categor') || lowerName.includes('budget')) {
            catRows = rows;
          } else if (lowerName.includes('udhaar') || lowerName.includes('khata') || lowerName.includes('debt') || lowerName.includes('borrow') || lowerName.includes('lent')) {
            udhaarRows = rows;
          } else if (lowerName.includes('fuel') || lowerName.includes('mileage') || lowerName.includes('vehicle') || lowerName.includes('petrol')) {
            fuelRows = rows;
          } else if (lowerName.includes('investment') || lowerName.includes('portfolio') || lowerName.includes('rd') || lowerName.includes('fd') || lowerName.includes('mutual')) {
            invRows = rows;
          } else if (lowerName.includes('saving') || lowerName.includes('transfer') || lowerName.includes('wife')) {
            savRows = rows;
          } else if (lowerName.includes('emi') || lowerName.includes('card emi') || lowerName.includes('loan')) {
            emiRows = rows;
          }
        }

        // Fallback: If no explicit transaction sheet, use first sheet
        if (txRows.length === 0 && workbook.SheetNames.length > 0) {
          txRows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]]);
        }
      }

      if (
        txRows.length === 0 && 
        catRows.length === 0 && 
        udhaarRows.length === 0 && 
        fuelRows.length === 0 &&
        invRows.length === 0 &&
        savRows.length === 0 &&
        emiRows.length === 0
      ) {
        setError('Uploaded file khali hai ya koi valid records nahi mile.');
        setParsedRows([]);
        setParsedCatRows([]);
        setParsedUdhaarRows([]);
        setParsedFuelRows([]);
        setParsedInvRows([]);
        setParsedSavRows([]);
        setParsedEmiRows([]);
        return;
      }

      setParsedRows(txRows);
      setParsedCatRows(catRows);
      setParsedUdhaarRows(udhaarRows);
      setParsedFuelRows(fuelRows);
      setParsedInvRows(invRows);
      setParsedSavRows(savRows);
      setParsedEmiRows(emiRows);
    } catch (err: any) {
      console.error('File parsing error', err);
      setError(`File padhne me error: ${err.message || 'Invalid Excel/CSV format'}`);
      setParsedRows([]);
      setParsedCatRows([]);
      setParsedUdhaarRows([]);
      setParsedFuelRows([]);
      setParsedInvRows([]);
      setParsedSavRows([]);
      setParsedEmiRows([]);
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
    if (
      parsedRows.length === 0 && 
      parsedCatRows.length === 0 && 
      parsedUdhaarRows.length === 0 && 
      parsedFuelRows.length === 0 && 
      parsedInvRows.length === 0 &&
      parsedSavRows.length === 0 &&
      parsedEmiRows.length === 0 &&
      !fileBase64
    ) {
      setError('Pehle ek valid Excel (.xlsx) ya CSV backup file chuniye.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data, error: apiErr } = await safeFetchJson<RestoreBackupResult>('/api/transactions/restore-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: parsedRows,
          categoriesRows: parsedCatRows,
          udhaarRows: parsedUdhaarRows,
          fuelRows: parsedFuelRows,
          investmentsRows: parsedInvRows,
          savingsRows: parsedSavRows,
          emisRows: parsedEmiRows,
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

  // Download export helper with authenticated user context
  const handleDownloadBackup = async (format: 'xlsx' | 'csv') => {
    try {
      setIsProcessing(true);
      setError(null);
      setSuccessMessage(null);

      const userIdParam = currentUser?.id ? `&userId=${encodeURIComponent(currentUser.id)}` : '';
      const url = `/api/transactions/export-backup?format=${format}${userIdParam}`;
      
      const headers: Record<string, string> = {};
      const token = localStorage.getItem('teleexpense_auth_token') || localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (currentUser?.id) {
        headers['x-user-id'] = currentUser.id;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Backup download fail ho gaya.');
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;

      const contentDisposition = res.headers.get('Content-Disposition');
      const sanitizedName = (currentUser?.name || 'Ledger').replace(/[^a-zA-Z0-9_]/g, '_');
      let fileName = `TeleExpense_Full_Backup_${sanitizedName}_${new Date().toISOString().split('T')[0]}.${format}`;

      if (contentDisposition && contentDisposition.includes('filename=')) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          fileName = match[1];
        }
      }

      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      setSuccessMessage(`${format.toUpperCase()} Backup successfully download ho gaya (${currentUser?.name || 'Log-in User'})!`);
    } catch (err: any) {
      console.error('Download backup error:', err);
      setError(err?.message || 'Download me samasya aayi.');
    } finally {
      setIsProcessing(false);
    }
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
                  ALL-IN-ONE 10-MODULE
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Transactions, Categories, Udhaar Khata, Fuel, Investments, Transfers, EMIs aur Family Khate ka complete backup.
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
                      RECOMMENDED • COMPLETE 10-SHEET ARCHIVE
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white mt-1">
                      1-Click Complete Account Excel Backup (.xlsx)
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Ek hi multi-sheet Excel file me aapke khate ka complete data download ho jayega: <b>Transactions</b>, <b>Categories & Budgets</b>, <b>Udhaar Khata (Diya / Liya)</b>, <b>Fuel & Mileage Logs</b>, <b>Investments Portfolio (RD/FD/MF)</b>, <b>Savings Transfers</b>, <b>Credit Card EMIs</b>, <b>Gullak Savings</b>, aur <b>Linked Telegram Family Members</b>.
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-950/80 border border-emerald-500/60 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                </div>

                {/* Account Summary Stats in Backup (9 modules) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1 border-t border-slate-800">
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <FileSpreadsheet className="w-3 h-3 text-cyan-400" /> TRANSACTIONS
                    </span>
                    <span className="font-bold text-white mt-0.5 block text-sm">{transactions.length} Records</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-indigo-400" /> CATEGORIES
                    </span>
                    <span className="font-bold text-cyan-300 mt-0.5 block text-sm">{categories.length} Categories</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <ArrowLeftRight className="w-3 h-3 text-amber-400" /> UDHAAR KHATA
                    </span>
                    <span className="font-bold text-amber-300 mt-0.5 block text-sm">{udhaars.length} Records</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Fuel className="w-3 h-3 text-emerald-400" /> FUEL & MILEAGE
                    </span>
                    <span className="font-bold text-emerald-300 mt-0.5 block text-sm">{fuelLogs.length} Logs</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-blue-400" /> INVESTMENTS (RD/FD)
                    </span>
                    <span className="font-bold text-blue-300 mt-0.5 block text-sm">{investments.length} Plans</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <HeartHandshake className="w-3 h-3 text-rose-400" /> SAVINGS TRANSFERS
                    </span>
                    <span className="font-bold text-rose-300 mt-0.5 block text-sm">{savingsTransfers.length} Transfers</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-orange-400" /> CARD EMIs
                    </span>
                    <span className="font-bold text-orange-300 mt-0.5 block text-sm">{cardEmis.length} EMIs</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <PiggyBank className="w-3 h-3 text-pink-400" /> GULLAK SAVINGS
                    </span>
                    <span className="font-bold text-pink-300 mt-0.5 block text-sm">Active Pot</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Users className="w-3 h-3 text-purple-400" /> FAMILY MEMBERS
                    </span>
                    <span className="font-bold text-purple-300 mt-0.5 block truncate text-xs">{currentUser?.name || 'Main User'} ({currentUser?.linkedMembers?.length || 1})</span>
                  </div>
                </div>

                {/* Big Download Button */}
                <button
                  onClick={() => handleDownloadBackup('xlsx')}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center space-x-2.5 transition-all cursor-pointer shadow-lg shadow-emerald-950/60 group"
                >
                  <Download className="w-5 h-5 stroke-[2.5] group-hover:translate-y-0.5 transition-transform" />
                  <span>DOWNLOAD FULL 10-SHEET EXCEL BACKUP (.XLSX)</span>
                </button>
              </div>

              {/* Secondary Option: Standard CSV */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Transactions CSV File (.CSV)</h4>
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
                  Aap TeleExpense se download kiye gaye Excel (.xlsx) ya CSV file ko yahan upload karein. Isme <b>Transactions</b>, <b>Udhaar Khata</b>, <b>Fuel & Mileage</b>, <b>Investments</b>, <b>Transfers</b>, <b>Card EMIs</b>, <b>Categories</b> aur <b>Budgets</b> sab automatic detect ho kar restore ho jayenge.
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
                      {parsedRows.length} transactions • {parsedUdhaarRows.length} udhaars • {parsedFuelRows.length} fuel logs • {parsedInvRows.length} investments • {parsedSavRows.length} transfers • {parsedEmiRows.length} EMIs
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs font-bold text-white block">
                      Excel (.xlsx) ya CSV Backup File Yahan Upload Karein
                    </span>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Supports complete TeleExpense 10-Sheet backups with Transactions, Udhaar, Fuel, Investments, EMIs, Categories & Settings
                    </span>
                  </div>
                )}
              </div>

              {/* Detected Content Badges */}
              {file && (
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                      FILE ME PAYA GAYA DATA:
                    </span>
                    {isSnapshotDetected && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/50 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> All-in-One High-Fidelity Snapshot (v4.0)
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <b>{parsedRows.length}</b> Transactions
                    </span>
                    {parsedCatRows.length > 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5" />
                        <b>{parsedCatRows.length}</b> Categories
                      </span>
                    )}
                    {parsedUdhaarRows.length > 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-950/80 border border-amber-500/40 text-amber-300 flex items-center gap-1.5">
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <b>{parsedUdhaarRows.length}</b> Udhaar Records
                      </span>
                    )}
                    {parsedFuelRows.length > 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5">
                        <Fuel className="w-3.5 h-3.5" />
                        <b>{parsedFuelRows.length}</b> Fuel Logs
                      </span>
                    )}
                    {parsedInvRows.length > 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-blue-950/80 border border-blue-500/40 text-blue-300 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <b>{parsedInvRows.length}</b> Investments
                      </span>
                    )}
                    {parsedSavRows.length > 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-rose-950/80 border border-rose-500/40 text-rose-300 flex items-center gap-1.5">
                        <HeartHandshake className="w-3.5 h-3.5" />
                        <b>{parsedSavRows.length}</b> Transfers
                      </span>
                    )}
                    {parsedEmiRows.length > 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-orange-950/80 border border-orange-500/40 text-orange-300 flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5" />
                        <b>{parsedEmiRows.length}</b> EMIs
                      </span>
                    )}
                    {detectedSheets.length > 1 && (
                      <span className="px-2.5 py-1 rounded-lg bg-purple-950/80 border border-purple-500/40 text-purple-300 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" />
                        {detectedSheets.length} Sheets
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
                      Purane records safe rahenge, naye records merge ho jayenge.
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
                      Pehle purane records clear karke backup ka fresh data load karega.
                    </p>
                  </button>
                </div>
              </div>

              {/* Parsed Preview Table with Multi-Tabs */}
              {(parsedRows.length > 0 || parsedUdhaarRows.length > 0 || parsedFuelRows.length > 0 || parsedInvRows.length > 0 || parsedSavRows.length > 0 || parsedEmiRows.length > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
                    <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 max-w-full">
                      <button
                        onClick={() => setPreviewTab('transactions')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                          previewTab === 'transactions' ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Transactions ({parsedRows.length})
                      </button>
                      {parsedUdhaarRows.length > 0 && (
                        <button
                          onClick={() => setPreviewTab('udhaars')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                            previewTab === 'udhaars' ? 'bg-amber-950 text-amber-300 border border-amber-500/50' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Udhaar ({parsedUdhaarRows.length})
                        </button>
                      )}
                      {parsedFuelRows.length > 0 && (
                        <button
                          onClick={() => setPreviewTab('fuel')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                            previewTab === 'fuel' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Fuel ({parsedFuelRows.length})
                        </button>
                      )}
                      {parsedInvRows.length > 0 && (
                        <button
                          onClick={() => setPreviewTab('investments')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                            previewTab === 'investments' ? 'bg-blue-950 text-blue-300 border border-blue-500/50' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Investments ({parsedInvRows.length})
                        </button>
                      )}
                      {parsedSavRows.length > 0 && (
                        <button
                          onClick={() => setPreviewTab('savings')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                            previewTab === 'savings' ? 'bg-rose-950 text-rose-300 border border-rose-500/50' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Transfers ({parsedSavRows.length})
                        </button>
                      )}
                      {parsedEmiRows.length > 0 && (
                        <button
                          onClick={() => setPreviewTab('emis')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                            previewTab === 'emis' ? 'bg-orange-950 text-orange-300 border border-orange-500/50' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          EMIs ({parsedEmiRows.length})
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] text-cyan-400">
                      Showing first 4 rows
                    </span>
                  </div>

                  {previewTab === 'transactions' && parsedRows.length > 0 && (
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
                  )}

                  {previewTab === 'udhaars' && parsedUdhaarRows.length > 0 && (
                    <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/90 text-[11px]">
                      <table className="w-full text-left">
                        <thead className="bg-slate-900/90 text-slate-400 sticky top-0 border-b border-slate-800 text-[10px]">
                          <tr>
                            <th className="p-2">Tareeq</th>
                            <th className="p-2">Type</th>
                            <th className="p-2">Person</th>
                            <th className="p-2">Amount</th>
                            <th className="p-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900 text-slate-300">
                          {parsedUdhaarRows.slice(0, 4).map((row, idx) => {
                            const date = row.Date || row.date || '—';
                            const rawType = String(row.Type || row.type || 'lent').toLowerCase();
                            const isLent = rawType.includes('lent') || rawType.includes('diya');
                            const person = row['Person Name'] || row.personName || row.person || '—';
                            const amount = row['Amount (INR)'] || row.Amount || row.amount || '0';
                            const status = String(row.Status || row.status || 'pending').toUpperCase();

                            return (
                              <tr key={idx} className="hover:bg-slate-900/50">
                                <td className="p-2 whitespace-nowrap text-slate-400">{String(date)}</td>
                                <td className="p-2 whitespace-nowrap">
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                    isLent ? 'bg-amber-950 text-amber-300' : 'bg-cyan-950 text-cyan-300'
                                  }`}>
                                    {isLent ? 'LENT (Diya)' : 'BORROWED (Liya)'}
                                  </span>
                                </td>
                                <td className="p-2 font-bold text-white whitespace-nowrap">{String(person)}</td>
                                <td className="p-2 font-bold text-amber-400 whitespace-nowrap">₹{amount}</td>
                                <td className="p-2 whitespace-nowrap">
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                    status.includes('SETTLE') ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
                                  }`}>
                                    {status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {previewTab === 'fuel' && parsedFuelRows.length > 0 && (
                    <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/90 text-[11px]">
                      <table className="w-full text-left">
                        <thead className="bg-slate-900/90 text-slate-400 sticky top-0 border-b border-slate-800 text-[10px]">
                          <tr>
                            <th className="p-2">Tareeq</th>
                            <th className="p-2">Vehicle</th>
                            <th className="p-2">Amount</th>
                            <th className="p-2">Odometer</th>
                            <th className="p-2">Mileage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900 text-slate-300">
                          {parsedFuelRows.slice(0, 4).map((row, idx) => {
                            const date = row.Date || row.date || '—';
                            const vehicle = row['Vehicle Name'] || row.vehicleName || 'Vehicle';
                            const amount = row['Fuel Amount (INR)'] || row.fuelAmount || row.Amount || '0';
                            const odo = row['Odometer Reading (km)'] || row.odometer || '—';
                            const mileage = row['Calculated Mileage (km/L)'] || row.calculatedMileage || '—';

                            return (
                              <tr key={idx} className="hover:bg-slate-900/50">
                                <td className="p-2 whitespace-nowrap text-slate-400">{String(date)}</td>
                                <td className="p-2 font-bold text-white whitespace-nowrap">{String(vehicle)}</td>
                                <td className="p-2 font-bold text-emerald-400 whitespace-nowrap">₹{amount}</td>
                                <td className="p-2 text-slate-300 whitespace-nowrap">{String(odo)} km</td>
                                <td className="p-2 text-cyan-300 whitespace-nowrap">{mileage ? `${mileage} km/L` : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {previewTab === 'investments' && parsedInvRows.length > 0 && (
                    <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/90 text-[11px]">
                      <table className="w-full text-left">
                        <thead className="bg-slate-900/90 text-slate-400 sticky top-0 border-b border-slate-800 text-[10px]">
                          <tr>
                            <th className="p-2">Tareeq</th>
                            <th className="p-2">Type</th>
                            <th className="p-2">Plan Name</th>
                            <th className="p-2">Amount</th>
                            <th className="p-2">Account</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900 text-slate-300">
                          {parsedInvRows.slice(0, 4).map((row, idx) => {
                            const date = row.Date || row.date || '—';
                            const type = String(row.Type || row.type || 'RD').toUpperCase();
                            const name = row['Investment Name'] || row.name || row.plan || '—';
                            const amount = row['Amount (INR)'] || row.amount || '0';
                            const account = row.Account || row.account || 'IC Bank';

                            return (
                              <tr key={idx} className="hover:bg-slate-900/50">
                                <td className="p-2 whitespace-nowrap text-slate-400">{String(date)}</td>
                                <td className="p-2 whitespace-nowrap">
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-950 text-blue-300 border border-blue-500/30">
                                    {type}
                                  </span>
                                </td>
                                <td className="p-2 font-bold text-white whitespace-nowrap">{String(name)}</td>
                                <td className="p-2 font-bold text-blue-400 whitespace-nowrap">₹{amount}</td>
                                <td className="p-2 text-slate-300 whitespace-nowrap">{String(account)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {previewTab === 'savings' && parsedSavRows.length > 0 && (
                    <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/90 text-[11px]">
                      <table className="w-full text-left">
                        <thead className="bg-slate-900/90 text-slate-400 sticky top-0 border-b border-slate-800 text-[10px]">
                          <tr>
                            <th className="p-2">Tareeq</th>
                            <th className="p-2">Recipient</th>
                            <th className="p-2">Amount</th>
                            <th className="p-2">From Account</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900 text-slate-300">
                          {parsedSavRows.slice(0, 4).map((row, idx) => {
                            const date = row.Date || row.date || '—';
                            const recipient = row.Recipient || row.recipient || "Wife's Account";
                            const amount = row['Amount (INR)'] || row.amount || '0';
                            const fromAcc = row['From Account'] || row.fromAccount || 'AX Bank';

                            return (
                              <tr key={idx} className="hover:bg-slate-900/50">
                                <td className="p-2 whitespace-nowrap text-slate-400">{String(date)}</td>
                                <td className="p-2 font-bold text-white whitespace-nowrap">{String(recipient)}</td>
                                <td className="p-2 font-bold text-rose-400 whitespace-nowrap">₹{amount}</td>
                                <td className="p-2 text-slate-300 whitespace-nowrap">{String(fromAcc)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {previewTab === 'emis' && parsedEmiRows.length > 0 && (
                    <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/90 text-[11px]">
                      <table className="w-full text-left">
                        <thead className="bg-slate-900/90 text-slate-400 sticky top-0 border-b border-slate-800 text-[10px]">
                          <tr>
                            <th className="p-2">Card</th>
                            <th className="p-2">EMI Title</th>
                            <th className="p-2">Monthly Amt</th>
                            <th className="p-2">Tenure</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900 text-slate-300">
                          {parsedEmiRows.slice(0, 4).map((row, idx) => {
                            const cardId = row['Card ID'] || row.cardId || 'SBI CC 5733';
                            const title = row['EMI Title'] || row.title || 'EMI';
                            const amount = row['Monthly Amount (INR)'] || row.monthlyAmount || '0';
                            const tenure = `${row['Paid Months'] || row.paidMonths || 0}/${row['Total Months'] || row.totalMonths || 12} Mos`;

                            return (
                              <tr key={idx} className="hover:bg-slate-900/50">
                                <td className="p-2 text-cyan-300 whitespace-nowrap">{String(cardId)}</td>
                                <td className="p-2 font-bold text-white whitespace-nowrap">{String(title)}</td>
                                <td className="p-2 font-bold text-orange-400 whitespace-nowrap">₹{amount}/mo</td>
                                <td className="p-2 text-slate-300 whitespace-nowrap">{tenure}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleRestore}
                  disabled={isProcessing || (!file && parsedRows.length === 0 && parsedUdhaarRows.length === 0 && parsedFuelRows.length === 0 && parsedInvRows.length === 0 && parsedSavRows.length === 0 && parsedEmiRows.length === 0)}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-cyan-950/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>RESTORING 10-MODULE BACKUP...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>CONFIRM & RESTORE COMPLETE DATA</span>
                    </>
                  )}
                </button>
              </div>

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
                          : 'Render free tier container restart hone par disk reset ho sakti hai.'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={fetchStorageStatus}
                    disabled={isLoadingStorage}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center space-x-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStorage ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                  <div className="p-2 rounded-lg bg-slate-950/60">
                    <span className="text-[9px] text-slate-400 block">DB Connected</span>
                    <span className={`font-bold ${storageStatus?.isPostgresConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {storageStatus?.isPostgresConnected ? 'CONNECTED' : 'DISCONNECTED'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-950/60">
                    <span className="text-[9px] text-slate-400 block">Total Users</span>
                    <span className="font-bold text-white">{storageStatus?.usersCount || 1} Registered</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-950/60">
                    <span className="text-[9px] text-slate-400 block">Active Ledger</span>
                    <span className="font-bold text-cyan-300">{storageStatus?.totalTransactions || transactions.length} Txs</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-950/60">
                    <span className="text-[9px] text-slate-400 block">Storage Path</span>
                    <span className="font-bold text-slate-300 truncate block">{storageStatus?.isCustomDataDir ? 'Persistent Mount' : '.data (Local)'}</span>
                  </div>
                </div>
              </div>

              {/* PostgreSQL Sync Button if connected */}
              {storageStatus?.isPostgresConnected && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <h5 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> PostgreSQL Sync Active
                    </h5>
                    <p className="text-[10px] text-slate-400">
                      Har transaction, udhaar, fuel, category aur budget live PostgreSQL me auto-save hota hai.
                    </p>
                  </div>
                  <button
                    onClick={handleSyncToPostgres}
                    disabled={isSyncingDb}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs shrink-0 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDb ? 'animate-spin' : ''}`} />
                    <span>Sync Now</span>
                  </button>
                </div>
              )}

              {/* Setup Guide for Render PostgreSQL */}
              <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                <div className="flex items-center space-x-2 text-xs font-bold text-cyan-400">
                  <Sparkles className="w-4 h-4" />
                  <span>RENDER PAR PERMANENT POSTGRESQL KAISE JODEIN:</span>
                </div>

                <div className="space-y-2 text-[11px] text-slate-300">
                  <div className="flex items-start space-x-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                    <p>
                      Render Dashboard (<a href="https://dashboard.render.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline inline-flex items-center gap-0.5">dashboard.render.com <ExternalLink className="w-3 h-3" /></a>) par jaakar <b>New +</b> button dabayein aur <b>PostgreSQL</b> select karein (Free tier choose karein).
                    </p>
                  </div>

                  <div className="flex items-start space-x-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                    <p>
                      Database banne ke baad uski <b>Internal Database URL</b> (ya External URL) copy karein.
                    </p>
                  </div>

                  <div className="flex items-start space-x-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                    <p>
                      Apne Web Service ke <b>Environment</b> tab me <b>DATABASE_URL</b> variable add karke paste karein aur Save karein.
                    </p>
                  </div>
                </div>

                {/* Quick Copy Env Var Box */}
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-between">
                  <div className="font-mono text-xs text-indigo-300">
                    <span className="text-slate-400">Environment Variable Name:</span> <b>DATABASE_URL</b>
                  </div>
                  <button
                    onClick={() => handleCopy('DATABASE_URL', 'env_name')}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedKey === 'env_name' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'env_name' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
