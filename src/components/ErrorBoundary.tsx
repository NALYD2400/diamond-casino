import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Diamond Casino ErrorBoundary] Uncaught crash:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      this.setState({ hasError: false, error: null });
      window.location.href = '/';
    } catch {
      window.location.reload();
    }
  };

  private handleHardReset = () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('diamond_casino_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      sessionStorage.clear();
      window.location.href = '/';
    } catch {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center font-sans relative overflow-hidden select-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-600/10 rounded-full blur-[140px] pointer-events-none" />

          <div className="relative z-10 max-w-md w-full p-8 rounded-3xl border border-white/10 bg-neutral-950/80 backdrop-blur-2xl shadow-[0_0_60px_rgba(0,0,0,0.9)] flex flex-col items-center">
            <img
              src="/diamond_casino_logo.png"
              alt="The Diamond Casino & Resort"
              className="h-14 w-auto mb-6 object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            />

            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-4">
              <AlertTriangle size={24} />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              Une interruption inattendue est survenue
            </h2>
            <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
              Le protocole de sécurité The Diamond Casino a isolé cette anomalie pour protéger vos données et votre session RP.
            </p>

            <div className="w-full flex flex-col gap-2.5">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full py-3 px-5 rounded-xl bg-white text-black font-bold text-xs uppercase tracking-wider hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-95"
              >
                <RefreshCw size={14} />
                Recharger le casino
              </button>

              <button
                type="button"
                onClick={this.handleHardReset}
                className="w-full py-2.5 px-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-neutral-400 hover:text-white text-xs font-['Geist_Mono'] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                Réinitialiser le cache local
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
