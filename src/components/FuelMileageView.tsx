import React, { useState } from 'react';
import { 
  Fuel, 
  Gauge, 
  TrendingUp, 
  Plus, 
  Calendar, 
  Trash2, 
  Car, 
  Bike, 
  Sparkles,
  Zap
} from 'lucide-react';
import { FuelLog } from '../types';

interface FuelMileageViewProps {
  logs?: FuelLog[];
  isPrivacyMode?: boolean;
  onAddLog?: (log: Omit<FuelLog, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteLog?: (id: string) => Promise<void>;
}

export const FuelMileageView: React.FC<FuelMileageViewProps> = ({
  logs = [],
  isPrivacyMode = false,
  onAddLog,
  onDeleteLog,
}) => {
  const safeLogs = Array.isArray(logs) ? logs : [];
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [vehicleName, setVehicleName] = useState('Bike');
  const [fuelAmount, setFuelAmount] = useState('');
  const [odometer, setOdometer] = useState('');
  const [fuelPricePerLiter, setFuelPricePerLiter] = useState('105');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Statistics Calculation
  const totalFuelSpent = safeLogs.reduce((sum, l) => sum + (l?.fuelAmount || 0), 0);
  
  // Calculate average mileage across logs that have calculated mileage
  const logsWithMileage = safeLogs.filter((l) => l && (l.calculatedMileage || 0) > 0);
  const avgMileage = logsWithMileage.length > 0
    ? (logsWithMileage.reduce((sum, l) => sum + (l.calculatedMileage || 0), 0) / logsWithMileage.length).toFixed(1)
    : null;

  // Total distance covered across logs
  const totalDistance = safeLogs.reduce((sum, l) => sum + (l?.distanceCovered || 0), 0);

  // Average cost per km
  const avgCostPerKm = totalDistance > 0 && totalFuelSpent > 0
    ? (totalFuelSpent / totalDistance).toFixed(2)
    : null;

  const latestOdometer = safeLogs.length > 0
    ? Math.max(...safeLogs.map(l => l?.odometer || 0))
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fuelAmount || !odometer) return;

    const amountNum = parseFloat(fuelAmount);
    const odoNum = parseFloat(odometer);
    const priceNum = parseFloat(fuelPricePerLiter) || 105;
    const liters = amountNum / priceNum;

    // Find previous log for this vehicle
    const vehicleLogs = safeLogs.filter(l => l && (l.vehicleName || 'Bike').toLowerCase() === vehicleName.toLowerCase());
    const prevLog = vehicleLogs.length > 0 ? vehicleLogs[0] : null;

    let distanceCovered: number | undefined;
    let calculatedMileage: number | undefined;
    let costPerKm: number | undefined;

    if (prevLog && odoNum > prevLog.odometer) {
      distanceCovered = odoNum - prevLog.odometer;
      if (liters > 0) {
        calculatedMileage = parseFloat((distanceCovered / liters).toFixed(1));
        costPerKm = parseFloat((amountNum / distanceCovered).toFixed(2));
      }
    }

    setIsSubmitting(true);
    try {
      if (onAddLog) {
        await onAddLog({
          userId: '',
          vehicleName,
          fuelAmount: amountNum,
          fuelLiters: parseFloat(liters.toFixed(2)),
          odometer: odoNum,
          previousOdometer: prevLog ? prevLog.odometer : undefined,
          distanceCovered,
          calculatedMileage,
          costPerKm,
          notes: notes.trim() || undefined,
          date: date || new Date().toISOString().split('T')[0],
        });
      }
      setFuelAmount('');
      setOdometer('');
      setNotes('');
      setIsAddModalOpen(false);
    } catch (err) {
      console.error('Error adding fuel log:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatAmount = (val: number) => {
    if (isPrivacyMode) return '₹••••';
    return `₹${val.toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-6">
      
      {/* Top Hero Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {/* Average Mileage */}
        <div className="bg-[#0e1526] border border-cyan-500/30 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-cyan-400 uppercase tracking-wider">
              Avg. Mileage
            </span>
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Gauge className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-white mt-2 font-mono">
            {avgMileage ? `${avgMileage} km/l` : 'Tracking...'}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {logsWithMileage.length} fuel logs calculated
          </p>
        </div>

        {/* Total Fuel Expense */}
        <div className="bg-[#0e1526] border border-amber-500/30 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">
              Total Fuel Expense
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Fuel className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-white mt-2 font-mono">
            {formatAmount(totalFuelSpent)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {safeLogs.length} total refuels
          </p>
        </div>

        {/* Running Cost / KM */}
        <div className="bg-[#0e1526] border border-indigo-500/30 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-indigo-400 uppercase tracking-wider">
              Running Cost
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-white mt-2 font-mono">
            {avgCostPerKm ? (isPrivacyMode ? '₹••••' : `₹${avgCostPerKm}/km`) : 'Calculating...'}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Per kilometer travel cost
          </p>
        </div>

        {/* Latest Odometer */}
        <div className="bg-[#0e1526] border border-slate-700 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Latest Odometer
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center">
              <Zap className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-white mt-2 font-mono">
            {latestOdometer > 0 ? `${latestOdometer.toLocaleString('en-IN')} km` : 'No reading'}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Current vehicle meter
          </p>
        </div>
      </div>

      {/* Telegram Log Tip */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-300">
        <div className="flex items-center space-x-2.5">
          <span className="px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-300 border border-cyan-500/30 font-semibold text-[10px]">
            TELEGRAM FUEL LOG
          </span>
          <span>
            Telegram par sidhe likhein: <code className="bg-slate-950 px-1.5 py-0.5 rounded text-cyan-300">2000 petrol odo 45200</code> ya <code className="bg-slate-950 px-1.5 py-0.5 rounded text-cyan-300">500 petrol odo 21400 bike</code>
          </span>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="w-full sm:w-auto px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer shadow-md transition-all shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Fuel & Odo Log Karein</span>
        </button>
      </div>

      {/* Logs List */}
      {safeLogs.length === 0 ? (
        <div className="bg-[#0e1526] rounded-2xl border border-slate-800 p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Fuel className="w-6 h-6 text-cyan-400" />
          </div>
          <h4 className="text-sm font-semibold text-white">Koi Fuel / Mileage Entry Nahi Hai</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Jab bhi car ya bike me petrol/diesel dalwayein, meter reading note karein. Bot auto mileage & cost calculate karega!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {safeLogs.map((log) => {
            const isCar = (log?.vehicleName || '').toLowerCase().includes('car');

            return (
              <div
                key={log.id}
                className="bg-[#0e1526] border border-slate-800 hover:border-cyan-500/40 rounded-2xl p-4 shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                    {isCar ? <Car className="w-5 h-5" /> : <Bike className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm text-white">
                        {log.vehicleName || 'Bike'} • {formatAmount(log.fuelAmount)}
                      </h4>
                      {log.fuelLiters && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                          ~{log.fuelLiters} Liters
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-1">
                      <span className="flex items-center gap-1 font-mono text-cyan-300">
                        <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                        Odo: {log.odometer?.toLocaleString('en-IN')} km
                      </span>
                      <span className="flex items-center gap-1 text-slate-500">
                        <Calendar className="w-3 h-3" />
                        {log.date}
                      </span>
                      {log.notes && (
                        <span className="text-slate-300 text-[11px]">
                          • {log.notes}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side insights */}
                <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-slate-800">
                  {log.calculatedMileage ? (
                    <div className="flex items-center gap-3">
                      <div className="text-left sm:text-right">
                        <p className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {log.calculatedMileage} km/l
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {log.distanceCovered} km run
                          {log.costPerKm && ` (₹${log.costPerKm}/km)`}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500 italic">
                      1st Baseline Entry
                    </span>
                  )}

                  <button
                    onClick={() => onDeleteLog && onDeleteLog(log.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Delete Entry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Fuel Log Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#0e1526] border border-slate-800 p-6 shadow-2xl text-slate-100">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Fuel className="w-5 h-5 text-cyan-400" />
              <span>Fuel & Odometer Entry</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Petrol/Diesel ka kharcha aur meter reading daalein taaki mileage track ho sake.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Vehicle selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Vehicle (Car / Bike)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['Bike', 'Car', 'Scooter'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVehicleName(v)}
                      className={`py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                        vehicleName === v
                          ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fuel Amount & Current Odometer */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Fuel Amount (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={fuelAmount}
                    onChange={(e) => setFuelAmount(e.target.value)}
                    placeholder="2000"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Odometer Reading (km) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    placeholder="45200"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Petrol Price / Liter & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Rate / Liter (₹/L)
                  </label>
                  <input
                    type="number"
                    value={fuelPricePerLiter}
                    onChange={(e) => setFuelPricePerLiter(e.target.value)}
                    placeholder="105"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tareeq (Date)
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Highway trip, HP petrol pump"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Fuel Log'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
