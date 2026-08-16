import React, { useMemo } from 'react';
import { 
  PieChart as PieIcon, 
  BarChart3, 
  TrendingUp, 
  Calendar,
  Layers,
  ArrowUpRight,
  Activity,
  Zap,
  Gauge
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { Transaction } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';

interface AnalyticsViewProps {
  transactions: Transaction[];
}

const CHART_COLORS = [
  '#06B6D4', '#6366F1', '#10B981', '#F59E0B', 
  '#EC4899', '#8B5CF6', '#38BDF8', '#F43F5E', 
  '#14B8A6', '#A855F7', '#64748B'
];

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ transactions }) => {
  // Category Breakdown for Expenses
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    let totalExpense = 0;

    transactions.forEach((tx) => {
      if (tx.type === 'expense') {
        map[tx.category] = (map[tx.category] || 0) + tx.amount;
        totalExpense += tx.amount;
      }
    });

    return Object.entries(map)
      .map(([name, value], idx) => ({
        name,
        value,
        percentage: totalExpense > 0 ? Math.round((value / totalExpense) * 100) : 0,
        color: CHART_COLORS[idx % CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  // Timeline / Daily Trend Data (Last 7 days)
  const timelineData = useMemo(() => {
    const map: Record<string, { date: string; income: number; expense: number }> = {};

    transactions.forEach((tx) => {
      const d = tx.date;
      if (!map[d]) {
        map[d] = { date: d, income: 0, expense: 0 };
      }
      if (tx.type === 'income') {
        map[d].income += tx.amount;
      } else {
        map[d].expense += tx.amount;
      }
    });

    return Object.values(map)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-7);
  }, [transactions]);

  const totalExpense = categoryData.reduce((acc, c) => acc + c.value, 0);

  if (transactions.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* Category Breakdown (Cyber Donut Chart) */}
      <div className="lg:col-span-5 bg-[#0c1222]/85 rounded-2xl border border-slate-800 backdrop-blur-xl p-5 shadow-2xl shadow-black/50 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 flex items-center justify-center">
                <PieIcon className="w-4 h-4" />
              </div>
              <h4 className="font-bold text-sm text-white font-display">OUTFLOW SPECTRUM</h4>
            </div>
            <span className="text-xs font-mono text-cyan-400 font-bold">
              ₹{totalExpense.toLocaleString('en-IN')} TOTAL
            </span>
          </div>

          {/* Recharts Donut */}
          <div className="h-60 w-full mt-2 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  stroke="#0c1222"
                  strokeWidth={2}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#090d18] border border-cyan-500/40 rounded-xl p-2.5 shadow-2xl text-xs font-mono">
                          <p className="font-bold text-white flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: data.color }} />
                            {data.name}
                          </p>
                          <p className="text-cyan-400 mt-1">₹{data.value.toLocaleString('en-IN')} ({data.percentage}%)</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category breakdown rows */}
        <div className="mt-4 space-y-2 max-h-48 overflow-y-auto pr-1">
          {categoryData.map((cat) => (
            <div key={cat.name} className="flex items-center justify-between text-xs font-mono p-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
              <div className="flex items-center space-x-2 truncate">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="text-slate-300 truncate">{cat.name}</span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-white font-bold">₹{cat.value.toLocaleString('en-IN')}</span>
                <span className="text-[10px] text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/20">
                  {cat.percentage}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cashflow Velocity Trend Chart */}
      <div className="lg:col-span-7 bg-[#0c1222]/85 rounded-2xl border border-slate-800 backdrop-blur-xl p-5 shadow-2xl shadow-black/50 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-400 flex items-center justify-center">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h4 className="font-bold text-sm text-white font-display">CASHFLOW VELOCITY MATRIX</h4>
            </div>
            <span className="text-xs font-mono text-indigo-300">
              ACTIVE TIMELINE
            </span>
          </div>

          <div className="h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => formatDate(val).split(',')[0]} 
                  tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono' }} 
                  axisLine={{ stroke: '#334155' }}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono' }} 
                  axisLine={{ stroke: '#334155' }}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-[#090d18] border border-indigo-500/40 rounded-xl p-3 shadow-2xl text-xs font-mono">
                          <p className="font-bold text-white mb-1.5">{label}</p>
                          <p className="text-emerald-400 flex items-center justify-between gap-4">
                            <span>INFLOW:</span>
                            <span className="font-bold">₹{(payload[0]?.value as number || 0).toLocaleString('en-IN')}</span>
                          </p>
                          <p className="text-rose-400 flex items-center justify-between gap-4 mt-1">
                            <span>OUTFLOW:</span>
                            <span className="font-bold">₹{(payload[1]?.value as number || 0).toLocaleString('en-IN')}</span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend 
                  wrapperStyle={{ paddingTop: 10, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  formatter={(value) => <span className="text-slate-300">{value === 'income' ? 'INFLOW (+)' : 'OUTFLOW (-)'}</span>}
                />
                <Bar dataKey="income" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="expense" fill="#F43F5E" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            REAL-TIME QUANTUM SAMPLING
          </span>
          <span className="text-cyan-400">DAILY ACCRUAL TRACKER</span>
        </div>
      </div>

    </div>
  );
};
