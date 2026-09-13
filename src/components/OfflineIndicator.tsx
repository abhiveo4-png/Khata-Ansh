import React, { useState, useEffect } from 'react';
import { WifiOff, CheckCircle2 } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface OfflineIndicatorProps {
  pendingSyncCount?: number;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ pendingSyncCount = 0 }) => {
  const isOnline = useOnlineStatus();
  const [showReconnectedToast, setShowReconnectedToast] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      setShowReconnectedToast(true);
      const timer = setTimeout(() => {
        setShowReconnectedToast(false);
        setWasOffline(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (!isOnline) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-sm z-50 flex items-center justify-between gap-3 rounded-xl bg-amber-950/95 border border-amber-500/50 px-4 py-2.5 text-xs text-amber-200 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <p className="font-semibold text-white">Offline Mode Active</p>
            <p className="text-[11px] text-amber-300/80">
              {pendingSyncCount > 0 
                ? `${pendingSyncCount} kharche offline save hain. Network aate hi auto-sync honge.`
                : 'Offline kharcha add kar sakte hain, network aate hi sync hoga.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (showReconnectedToast) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-sm z-50 flex items-center gap-2.5 rounded-xl bg-emerald-950/95 border border-emerald-500/50 px-4 py-2.5 text-xs text-emerald-200 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom duration-300">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <div>
          <p className="font-semibold text-white">Back Online!</p>
          <p className="text-[11px] text-emerald-300/80">Sabhi offline records server se sync ho gaye hain.</p>
        </div>
      </div>
    );
  }

  return null;
};
