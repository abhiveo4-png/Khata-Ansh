import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Layers, 
  ArrowRight,
  TrendingUp,
  Tag,
  RefreshCw,
  Plus
} from 'lucide-react';
import * as XLSX from 'xlsx';
import confetti from 'canvas-confetti';
import { CategoryDef, CategoryBudget } from '../types';
import { formatCurrency } from '../utils/formatters';
import { safeFetchJson } from '../utils/api';

interface ParsedBudgetRow {
  category: string;
  limit: number;
  type: 'expense' | 'income' | 'both';
  keywords: string[];
  isNew: boolean;
}

interface ExcelBudgetImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryDef[];
  budgets: CategoryBudget[];
  onImportSuccess: (newCategories: CategoryDef[], newBudgets: CategoryBudget[]) => void;
}

export const ExcelBudgetImportModal: React.FC<ExcelBudgetImportModalProps> = ({
  isOpen,
  onClose,
  categories,
  budgets,
  onImportSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedBudgetRow[]>([]);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const existingCategoryNames = new Set(categories.map(c => c.name.toLowerCase()));

  const parseFile = async (selectedFile: File) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      if (!workbook.SheetNames.length) {
        throw new Error('Excel workbook me koi sheet nahi mili.');
      }

      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawJson = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet);

      if (!rawJson || rawJson.length === 0) {
        throw new Error('Excel sheet khali hai ya koi row nahi mili. Kripya Category aur Budget columns check karein.');
      }

      const rows: ParsedBudgetRow[] = [];

      for (const raw of rawJson) {
        // Normalize keys
        const rowObj: Record<string, any> = {};
        for (const k of Object.keys(raw)) {
          rowObj[k.trim().toLowerCase().replace(/[\s_\-]+/g, '')] = raw[k];
        }

        const categoryName = 
          rowObj['category'] || 
          rowObj['categoryname'] || 
          rowObj['name'] || 
          rowObj['naam'] || 
          rowObj['item'] || 
          rowObj['kharcha'] || 
          rowObj['kharchatype'] || 
          rowObj['title'] || '';

        const cleanName = String(categoryName).trim();
        if (!cleanName) continue;

        const rawAmt = 
          rowObj['budget'] ?? 
          rowObj['budgetlimit'] ?? 
          rowObj['monthlybudget'] ?? 
          rowObj['limit'] ?? 
          rowObj['monthlylimit'] ?? 
          rowObj['amount'] ?? 
          rowObj['rashi'] ?? 
          rowObj['allocation'] ?? 
          rowObj['allocated'] ?? 0;

        const budgetLimit = Math.max(0, Number(String(rawAmt).replace(/[^0-9.]/g, '')) || 0);

        const rawType = String(rowObj['type'] || rowObj['kind'] || rowObj['categorytype'] || 'expense').toLowerCase().trim();
        let catType: 'expense' | 'income' | 'both' = 'expense';
        if (rawType.includes('inc') || rawType === 'income' || rawType === 'kamai') {
          catType = 'income';
        } else if (rawType === 'both' || rawType.includes('dono')) {
          catType = 'both';
        }

        let rawKeywords: string[] = [];
        const rawKw = rowObj['keywords'] || rowObj['keyword'] || rowObj['searchwords'] || rowObj['tags'] || '';
        if (typeof rawKw === 'string' && rawKw.trim()) {
          rawKeywords = rawKw.split(/[,;|]/).map(s => s.trim().toLowerCase()).filter(Boolean);
        } else if (Array.isArray(rawKw)) {
          rawKeywords = rawKw.map(s => String(s).trim().toLowerCase()).filter(Boolean);
        }

        const isNew = !existingCategoryNames.has(cleanName.toLowerCase());

        rows.push({
          category: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
          limit: budgetLimit,
          type: catType,
          keywords: rawKeywords,
          isNew,
        });
      }

      if (rows.length === 0) {
        throw new Error('Valid categories nahi mili. Make sure column names include "Category" and "Monthly Budget".');
      }

      setFile(selectedFile);
      setParsedRows(rows);
    } catch (err: any) {
      console.error('Failed to parse Excel:', err);
      setErrorMessage(err.message || 'Excel file padhne me samasya aayi.');
      setParsedRows([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      parseFile(selected);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      parseFile(dropped);
    }
  };

  const handleLimitChange = (index: number, newLimit: number) => {
    setParsedRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], limit: Math.max(0, newLimit) };
      return next;
    });
  };

  const handleSaveToBackend = async () => {
    if (parsedRows.length === 0) return;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const { data, error, ok } = await safeFetchJson<{
        success?: boolean;
        message?: string;
        categories?: CategoryDef[];
        budgets?: CategoryBudget[];
        error?: string;
      }>('/api/budgets/import-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replaceExisting,
          rows: parsedRows.map(r => ({
            category: r.category,
            budget: r.limit,
            type: r.type,
            keywords: r.keywords.join(', '),
          })),
        }),
      });

      if (!ok || !data?.success) {
        throw new Error(data?.error || error || 'Server par import save karne me error aaya.');
      }

      // Success
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });

      setSuccessMessage(data.message || 'Excel categories & budgets successfully allocate ho gaye!');
      if (data.categories && data.budgets) {
        onImportSuccess(data.categories, data.budgets);
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const downloadSampleTemplate = (format: 'xlsx' | 'csv') => {
    window.open(`/api/budgets/template?format=${format}`, '_blank');
  };

  const totalCalculatedBudget = parsedRows.reduce((acc, r) => acc + (r.limit || 0), 0);
  const newCategoriesCount = parsedRows.filter(r => r.isNew).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Excel / CSV Se Monthly Budget Import Karein
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Auto-Category
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Apni monthly budget list Excel file me dekar categories auto-create aur budget allocate karein.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          
          {/* File Upload Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              file
                ? 'border-emerald-500/50 bg-emerald-950/10 hover:bg-emerald-950/20'
                : 'border-slate-700 hover:border-indigo-500/80 bg-slate-900/40 hover:bg-slate-900/80'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-sm font-semibold text-slate-200">
                {file ? (
                  <span className="text-emerald-300">Selected File: {file.name} (Click to change)</span>
                ) : (
                  <span>Apni Excel ya CSV file yahan drag & drop karein ya browse karein</span>
                )}
              </div>
              <p className="text-xs text-slate-400 max-w-md">
                Supports standard formats (<code className="text-indigo-300">.xlsx</code>, <code className="text-indigo-300">.xls</code>, <code className="text-indigo-300">.csv</code>) with columns like <b>Category</b>, <b>Monthly Budget</b>, <b>Keywords</b>.
              </p>
            </div>
          </div>

          {/* Sample Template Download Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs">
            <div className="flex items-center space-x-2 text-slate-300">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Kya aapke paas ready template nahi hai? Pre-made template download karein:</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => downloadSampleTemplate('xlsx')}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Sample Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => downloadSampleTemplate('csv')}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-medium transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Sample CSV</span>
              </button>
            </div>
          </div>

          {/* Error / Success feedback */}
          {errorMessage && (
            <div className="flex items-start space-x-2 p-3.5 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center space-x-2 p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Replace Existing Mode Banner */}
          <div className="p-3.5 bg-slate-900/90 border border-slate-700/80 rounded-xl flex items-start justify-between gap-3 text-xs">
            <div className="flex items-start space-x-2.5">
              <input
                type="checkbox"
                id="replaceExistingCheck"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded-sm border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer"
              />
              <label htmlFor="replaceExistingCheck" className="cursor-pointer text-slate-200 font-medium">
                <span className="font-bold text-indigo-300">Purani Categories Delete Karke Replace Karein</span>
                <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                  Jab yeh ON hoga, to purani saari categories hat jayengi aur <b>Categories</b> & <b>Monthly Budgets</b> tabs me sirf wahi categories aayengi jo aapki is Excel file me hain.
                </p>
              </label>
            </div>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold shrink-0 ${
              replaceExisting 
                ? 'bg-amber-950/80 border border-amber-500/40 text-amber-300' 
                : 'bg-slate-800 text-slate-400'
            }`}>
              {replaceExisting ? 'FRESH REPLACE ON' : 'MERGE MODE'}
            </span>
          </div>

          {/* Parsed Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Parsed Categories & Budget Allocation Preview ({parsedRows.length})
                </h4>
                <div className="flex items-center space-x-3 text-xs">
                  <span className="text-emerald-400 font-semibold">
                    ✨ {newCategoriesCount} Nayi Categories
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-200 font-bold">
                    Total Budget: {formatCurrency(totalCalculatedBudget)}
                  </span>
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-slate-400 font-semibold border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5">Category Naam</th>
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Monthly Limit (₹)</th>
                      <th className="px-4 py-2.5">Keywords</th>
                      <th className="px-3 py-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-2 font-semibold text-white">
                          {row.category}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            row.type === 'income' 
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-rose-950/60 text-rose-300 border border-rose-500/20'
                          }`}>
                            {row.type === 'income' ? 'Income' : 'Expense'}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center space-x-1">
                            <span className="text-slate-500 font-medium">₹</span>
                            <input
                              type="number"
                              min="0"
                              value={row.limit}
                              onChange={(e) => handleLimitChange(idx, Number(e.target.value))}
                              className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-semibold focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2 text-slate-400 truncate max-w-[150px]">
                          {row.keywords.length > 0 ? row.keywords.join(', ') : <span className="text-slate-600 italic">Auto</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.isNew ? (
                            <span className="inline-flex items-center text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded font-medium">
                              ✨ Nayi Category
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] text-cyan-300 bg-cyan-950/60 border border-cyan-500/20 px-2 py-0.5 rounded font-medium">
                              🔄 Update
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/60">
          <div className="text-xs text-slate-400">
            {parsedRows.length > 0 ? (
              <span><b>{parsedRows.length}</b> categories ready to allocate.</span>
            ) : (
              <span>Template upload karke auto-allocation start karein.</span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={parsedRows.length === 0 || isSaving}
              onClick={handleSaveToBackend}
              className="inline-flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Allocating Budgets...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Apply Categories & Budgets</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
