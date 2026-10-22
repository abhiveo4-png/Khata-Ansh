import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

// Ensure typing compatibility across React environments
export class ErrorBoundary extends (React.Component as any) {
  constructor(props: Props) {
    super(props);
    (this as any).state = {
      hasError: false,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: any) {
    console.error('TeleExpense ErrorBoundary caught error:', error, errorInfo);
  }

  public handleReset = () => {
    (this as any).setState({ hasError: false, error: undefined });
  };

  public render() {
    const state = (this as any).state as State;
    const props = (this as any).props as Props;

    if (state.hasError) {
      return (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-slate-200 space-y-3 my-4">
          <div className="flex items-center space-x-2 text-rose-400 font-bold">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{props.fallbackMessage || 'Kuch gadbad hui (Component Error)'}</span>
          </div>
          <p className="text-xs text-slate-300 font-mono">
            {state.error?.message || 'Unexpected render error'}
          </p>
          <div className="flex items-center space-x-2 pt-1">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer transition-all"
            >
              Dobara Try Karein
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Page Reload</span>
            </button>
          </div>
        </div>
      );
    }

    return props.children;
  }
}
