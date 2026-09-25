import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowUpRight,
  Bomb,
  CheckCircle2,
  ChevronRight,
  Coins,
  Copy,
  Eye,
  Flame,
  Gem,
  HelpCircle,
  History,
  Info,
  Keyboard,
  RotateCcw,
  Scale,
  Shield,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { useCasinoUser } from '../context/CasinoUserContext';
import { MinesAudio } from './mines/minesAudio';
import {
  GRID_SIZE,
  STRATEGY_PRESETS,
  calculateMultiplier,
  generateBoard,
  getMultiplierLadder,
  getNextStepProbability,
  sha256Hex,
  type GeneratedBoard,
  type StrategyPreset,
} from './mines/minesMath';

export interface GameHistoryEntry {
  id: string;
  timestamp: Date;
  mode: 'real' | 'demo';
  bet: number;
  mines: number;
  gemsRevealed: number;
  multiplier: number;
  winAmount: number;
  won: boolean;
}

interface RecentRibbonItem {
  id: string;
  mult: number;
  won: boolean;
}

export const MinesGame: React.FC = () => {
  const { user, isAuthenticated, playMinesRound } = useCasinoUser();

  // Mode: Real RP chips or Virtual Demo chips
  const [mode, setMode] = useState<'real' | 'demo'>(() => {
    return isAuthenticated && user && user.chips > 0 ? 'real' : 'demo';
  });

  const [demoChips, setDemoChips] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('diamond_mines_demo_chips');
      return saved ? Number(saved) || 10000 : 10000;
    } catch {
      return 10000;
    }
  });

  // Sound effects
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('diamond_sound_muted') === 'true';
    } catch {
      return false;
    }
  });
  const audioRef = useRef<MinesAudio>(new MinesAudio());
  audioRef.current.muted = muted;

  // Active game configuration
  const [bet, setBet] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>('100');
  const [minesCount, setMinesCount] = useState<number>(3);
  const [autoCashoutMult, setAutoCashoutMult] = useState<string>('');
  const [notification, setNotification] = useState<string | null>(null);

  // Active round state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [boardData, setBoardData] = useState<GeneratedBoard | null>(null);
  const [pickedTiles, setPickedTiles] = useState<number[]>([]);
  const [detonatedIndex, setDetonatedIndex] = useState<number | null>(null);
  const [gameResult, setGameResult] = useState<'won' | 'lost' | null>(null);
  const [cashoutReason, setCashoutReason] = useState<'manual' | 'auto' | 'grand_slam' | null>(null);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [lastWin, setLastWin] = useState<{
    amount: number;
    multiplier: number;
    gemsCount: number;
    reason: 'manual' | 'auto' | 'grand_slam';
  } | null>(null);
  const [lastRoundBet, setLastRoundBet] = useState<number>(bet);
  const [isResultDismissed, setIsResultDismissed] = useState<boolean>(false);

  // Live session telemetry & outcomes ribbon
  const [recentRibbon, setRecentRibbon] = useState<RecentRibbonItem[]>([
    { id: 'init-1', mult: 1.71, won: true },
    { id: 'init-2', mult: 2.45, won: true },
    { id: 'init-3', mult: 0, won: false },
    { id: 'init-4', mult: 1.25, won: true },
    { id: 'init-5', mult: 3.14, won: true },
  ]);

  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'strategies' | 'history' | 'fairness' | 'rules'>('strategies');
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'verified' | 'failed'>('idle');

  // Multiplier ladder for the current mine count
  const ladder = useMemo(() => getMultiplierLadder(minesCount), [minesCount]);

  // Actual safe diamonds uncovered
  const gemsCount = useMemo(() => {
    if (!boardData) return 0;
    return pickedTiles.filter((idx) => !boardData.board[idx]).length;
  }, [pickedTiles, boardData]);

  // Multipliers & payouts
  const currentMultiplier = useMemo(
    () => (gemsCount > 0 ? calculateMultiplier(minesCount, gemsCount) : 1),
    [minesCount, gemsCount],
  );

  const currentWinAmount = useMemo(
    () => Math.floor(bet * currentMultiplier),
    [bet, currentMultiplier],
  );

  const detonatedCoord = useMemo(() => {
    if (detonatedIndex === null) return null;
    return `${String.fromCharCode(65 + (detonatedIndex % 5))}${Math.floor(detonatedIndex / 5) + 1}`;
  }, [detonatedIndex]);

  const nextStepProb = useMemo(
    () => getNextStepProbability(minesCount, gemsCount),
    [minesCount, gemsCount],
  );

  const nextMultiplier = useMemo(
    () => calculateMultiplier(minesCount, gemsCount + 1),
    [minesCount, gemsCount],
  );

  // Balance calculation
  const currentBalance = useMemo(() => {
    if (mode === 'real') {
      if (!user) return 0;
      return isPlaying ? Math.max(0, user.chips - bet) : user.chips;
    }
    return demoChips;
  }, [mode, user, isPlaying, bet, demoChips]);

  // Cleanup audio
  useEffect(() => {
    return () => {
      audioRef.current.close();
    };
  }, []);

  // Save demo chips
  useEffect(() => {
    try {
      localStorage.setItem('diamond_mines_demo_chips', String(demoChips));
    } catch {
      // ignore
    }
  }, [demoChips]);

  // Auto-switch mode on auth state changes
  useEffect(() => {
    if (!isAuthenticated && mode === 'real') {
      setMode('demo');
    }
  }, [isAuthenticated, mode]);

  // Notification timeout
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(t);
  }, [notification]);

  // Toggle sound
  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      audioRef.current.muted = next;
      try {
        localStorage.setItem('diamond_sound_muted', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Bet adjustments
  const handleBetInputChange = (val: string) => {
    if (isPlaying) return;
    setBetInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setBet(parsed);
    }
  };

  const handleBetInputBlur = () => {
    if (isPlaying) return;
    const parsed = parseInt(betInput, 10);
    const maxAllowed = mode === 'real' ? (user ? user.chips : 10) : demoChips;
    if (isNaN(parsed) || parsed < 10) {
      setBet(10);
      setBetInput('10');
    } else {
      const clamped = Math.min(parsed, maxAllowed > 0 ? maxAllowed : 10);
      setBet(clamped);
      setBetInput(String(clamped));
    }
  };

  const handleSetQuickBet = (val: number) => {
    if (isPlaying) return;
    audioRef.current.unlock();
    audioRef.current.click();
    const maxAllowed = mode === 'real' ? (user ? user.chips : 10) : demoChips;
    const clamped = Math.max(10, Math.min(val, maxAllowed > 0 ? maxAllowed : 10000000));
    setBet(clamped);
    setBetInput(String(clamped));
  };

  const handleAddBetChips = (delta: number) => {
    if (isPlaying) return;
    audioRef.current.unlock();
    audioRef.current.click();
    const maxAllowed = mode === 'real' ? (user ? user.chips : 10) : demoChips;
    const nextVal = Math.min(bet + delta, maxAllowed > 0 ? maxAllowed : 10000000);
    setBet(nextVal);
    setBetInput(String(nextVal));
  };

  // Apply preset strategy
  const applyPreset = (preset: StrategyPreset) => {
    if (isPlaying) return;
    audioRef.current.unlock();
    audioRef.current.click();
    setMinesCount(preset.mines);
    setAutoCashoutMult(String(preset.expectedMultiplier));
    setNotification(
      `Stratégie « ${preset.name} » appliquée (${preset.mines} mines · Auto-cashout à x${preset.expectedMultiplier.toFixed(2)})`,
    );
  };

  // Start new round
  const handleStartGame = useCallback(async () => {
    if (isPlaying) return;
    audioRef.current.unlock();

    // Check balance
    if (mode === 'real') {
      if (!isAuthenticated || !user) {
        setMode('demo');
        setNotification('Connectez-vous pour miser vos jetons RP.');
        return;
      }
      if (user.chips < bet) {
        setNotification('Solde insuffisant pour ce montant.');
        return;
      }
    } else {
      if (demoChips < bet) {
        setDemoChips(10000);
        setNotification('Solde virtuel réapprovisionné à 10 000 jetons.');
        return;
      }
      setDemoChips((prev) => prev - bet);
    }

    const newBoard = await generateBoard(minesCount);
    setBoardData(newBoard);
    setPickedTiles([]);
    setDetonatedIndex(null);
    setGameResult(null);
    setCashoutReason(null);
    setLastWin(null);
    setIsShaking(false);
    setIsResultDismissed(false);
    setVerifyStatus('idle');
    setIsPlaying(true);

    audioRef.current.start();
  }, [isPlaying, mode, isAuthenticated, user, bet, demoChips, minesCount]);

  // Finalize round
  const finalizeRound = useCallback(
    async (
      won: boolean,
      mult: number,
      winAmt: number,
      finalGemsCount: number,
      reason: 'manual' | 'auto' | 'grand_slam',
      explodedIdx: number | null,
    ) => {
      setIsPlaying(false);
      setGameResult(won ? 'won' : 'lost');
      setCashoutReason(won ? reason : null);
      setDetonatedIndex(explodedIdx);
      setLastRoundBet(bet);
      setIsResultDismissed(false);

      if (won) {
        setLastWin({
          amount: winAmt,
          multiplier: mult,
          gemsCount: finalGemsCount,
          reason,
        });
        audioRef.current.cashout();
      } else {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
        audioRef.current.explosion();
      }

      // Prepend to recent ribbon
      setRecentRibbon((prev) => [
        { id: `ribbon_${Date.now()}`, mult: won ? mult : 0, won },
        ...prev.slice(0, 5),
      ]);

      const entry: GameHistoryEntry = {
        id: `h_${Date.now()}`,
        timestamp: new Date(),
        mode,
        bet,
        mines: minesCount,
        gemsRevealed: finalGemsCount,
        multiplier: mult,
        winAmount: won ? winAmt : 0,
        won,
      };
      setHistory((prev) => [entry, ...prev.slice(0, 19)]);

      if (mode === 'real' && isAuthenticated) {
        try {
          await playMinesRound({
            bet,
            win: won ? winAmt : 0,
            multiplier: mult,
            mines: minesCount,
            gems: finalGemsCount,
          });
        } catch (err) {
          console.error('[Mines] Erreur lors de l’enregistrement:', err);
        }
      } else if (mode === 'demo' && won) {
        setDemoChips((prev) => prev + winAmt);
      }
    },
    [mode, bet, minesCount, isAuthenticated, playMinesRound],
  );

  // Manual cashout
  const handleCashout = useCallback(() => {
    if (!isPlaying || !boardData || gemsCount === 0) return;
    audioRef.current.unlock();
    void finalizeRound(true, currentMultiplier, currentWinAmount, gemsCount, 'manual', null);
  }, [isPlaying, boardData, gemsCount, currentMultiplier, currentWinAmount, finalizeRound]);

  // Click on tile
  const handleTileClick = useCallback(
    async (index: number) => {
      if (!isPlaying || !boardData || pickedTiles.includes(index) || gameResult) return;
      audioRef.current.unlock();

      const isMine = boardData.board[index];
      const newPicked = [...pickedTiles, index];
      setPickedTiles(newPicked);

      if (isMine) {
        // Exploded on mine
        await finalizeRound(false, 0, 0, gemsCount, 'manual', index);
      } else {
        // Safe diamond
        const newGemsCount = gemsCount + 1;
        audioRef.current.gem(newGemsCount);

        const totalDiamonds = GRID_SIZE - minesCount;
        const newMult = calculateMultiplier(minesCount, newGemsCount);
        const newWin = Math.floor(bet * newMult);

        // Auto cashout condition
        const targetMult = parseFloat(autoCashoutMult);
        if (!isNaN(targetMult) && targetMult > 1 && newMult >= targetMult) {
          await finalizeRound(true, newMult, newWin, newGemsCount, 'auto', null);
          return;
        }

        // Grand Slam condition
        if (newGemsCount >= totalDiamonds) {
          await finalizeRound(true, newMult, newWin, newGemsCount, 'grand_slam', null);
        }
      }
    },
    [isPlaying, boardData, pickedTiles, gameResult, gemsCount, minesCount, bet, autoCashoutMult, finalizeRound],
  );

  // Random tile selection
  const handleRandomPick = useCallback(() => {
    if (!isPlaying || !boardData) return;
    const unrevealedIndices = Array.from({ length: GRID_SIZE }, (_, idx) => idx).filter(
      (idx) => !pickedTiles.includes(idx),
    );
    if (unrevealedIndices.length === 0) return;
    const randIdx = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
    void handleTileClick(randIdx);
  }, [isPlaying, boardData, pickedTiles, handleTileClick]);

  // Keyboard shortcut listener (Space = start / cashout, R = random pick, Escape = toggle result)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLButtonElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (!isPlaying) {
          if (currentBalance >= bet && bet > 0) {
            void handleStartGame();
          }
        } else if (gemsCount > 0) {
          handleCashout();
        }
      } else if (e.code === 'KeyR' && isPlaying) {
        e.preventDefault();
        handleRandomPick();
      } else if (e.code === 'Escape' && gameResult) {
        e.preventDefault();
        audioRef.current.click();
        setIsResultDismissed((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentBalance, bet, gemsCount, gameResult, isResultDismissed, handleCashout, handleStartGame, handleRandomPick]);

  // Provably fair helpers
  const copyServerHash = () => {
    if (!boardData) return;
    void navigator.clipboard.writeText(boardData.hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const copyServerSeed = () => {
    if (!boardData) return;
    void navigator.clipboard.writeText(boardData.serverSeed);
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  const handleVerifyFairness = async () => {
    if (!boardData) return;
    const boardStr = boardData.board.map((m) => (m ? 'M' : 'D')).join('');
    const computed = await sha256Hex(`${boardData.serverSeed}:${boardStr}`);
    if (computed === boardData.hash) {
      setVerifyStatus('verified');
    } else {
      setVerifyStatus('failed');
    }
  };

  return (
    <div className="relative min-h-screen bg-black text-white selection:bg-amber-400 selection:text-black">
      {/* Atmosphere Background Texture */}
      <div
        className="fixed inset-0 bg-cover bg-center opacity-10 grayscale pointer-events-none"
        style={{ backgroundImage: "url('/diamond_casino_hall.jpg')" }}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 bg-gradient-to-b from-black/80 via-black/95 to-black pointer-events-none"
        aria-hidden="true"
      />

      {/* ================================================================ */}
      {/* 1. COMPACT CASINO COMMAND BAR (Zero-Scroll Friendly Header)       */}
      {/* ================================================================ */}
      <header className="relative z-10 pt-24 sm:pt-28 lg:pt-32 pb-2 px-3 sm:px-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-2.5 sm:px-4 sm:py-2.5">
          {/* Casino Title & Game Brand */}
          <div className="flex items-center gap-2.5 self-start md:self-auto">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black shadow-[0_0_12px_rgba(245,158,11,0.4)]">
              <Gem size={18} className="drop-shadow-sm" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight font-['Instrument_Serif'] text-white">
                  Les Mines du <em className="italic text-amber-400">Diamond</em>
                </h1>
                <span className="text-[9px] font-['Geist_Mono'] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 uppercase">
                  5x5 Grid
                </span>
              </div>
              <p className="text-[10px] text-neutral-400 hidden sm:block">
                98.5% RTP · Provably Fair Cryptographique
              </p>
            </div>
          </div>

          {/* Live Recent Outcomes Ribbon */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-0.5 px-2 rounded-xl bg-black/40 border border-white/5 scrollbar-none">
            <span className="text-[9px] uppercase font-['Geist_Mono'] text-neutral-500 font-semibold tracking-wider shrink-0 mr-1">
              RÉCENTS :
            </span>
            {recentRibbon.map((item) => (
              <span
                key={item.id}
                className={`text-[10px] font-bold font-['Geist_Mono'] px-2 py-0.5 rounded-full shrink-0 transition-transform ${
                  item.won
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                    : 'bg-red-500/15 text-red-400 border border-red-500/30'
                }`}
              >
                {item.won ? `x${item.mult.toFixed(2)}` : '💥 BOOM'}
              </span>
            ))}
          </div>

          {/* Controls: Mode Switcher, Sound & Rules */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            {/* Mode Switcher */}
            <div className="flex items-center p-0.5 rounded-full bg-neutral-900 border border-white/10 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  if (isPlaying) return;
                  if (!isAuthenticated) {
                    setMode('demo');
                    setNotification('Connectez-vous via Discord pour miser vos jetons RP réels.');
                  } else {
                    setMode('real');
                  }
                }}
                className={`px-3 py-1 rounded-full text-[11px] transition-all cursor-pointer ${
                  mode === 'real'
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Jetons RP
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isPlaying) return;
                  setMode('demo');
                }}
                className={`px-3 py-1 rounded-full text-[11px] transition-all cursor-pointer ${
                  mode === 'demo'
                    ? 'bg-white text-black font-bold shadow-[0_0_12px_rgba(255,255,255,0.2)]'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Mode Démo
              </button>
            </div>

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={toggleMute}
              className="w-8 h-8 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
              title={muted ? 'Activer le son' : 'Couper le son'}
              aria-label={muted ? 'Activer le son' : 'Couper le son'}
            >
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} className="text-amber-400" />}
            </button>
          </div>
        </div>

        {/* Global Alert Notification */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-['Geist_Mono'] flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-amber-400 shrink-0" />
                <span>{notification}</span>
              </div>
              <button
                type="button"
                onClick={() => setNotification(null)}
                className="text-neutral-400 hover:text-white cursor-pointer ml-2 text-sm"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ================================================================ */}
      {/* 2. MAIN GAMING COCKPIT (Ergonomic 3-Panel Viewport Layout)        */}
      {/* ================================================================ */}
      <main className="relative z-10 px-3 sm:px-6 py-2 sm:py-3 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 xl:gap-4 items-stretch">
          {/* ------------------------------------------------------------ */}
          {/* PANEL 1: BET & CONTROLS STATION (3 cols)                     */}
          {/* ------------------------------------------------------------ */}
          <div className="lg:col-span-3 flex flex-col gap-2.5 liquid-glass rounded-2xl p-3.5 sm:p-4 border border-white/15">
            {/* Balance Card */}
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
              <div>
                <span className="font-['Geist_Mono'] text-[9px] tracking-wider uppercase text-neutral-400 block font-semibold">
                  {mode === 'real' ? 'SOLDE CASINO RP' : 'SOLDE VIRTUEL'}
                </span>
                <span className="text-base sm:text-lg font-bold font-['Geist_Mono'] text-amber-400 flex items-center gap-1.5 mt-0.5">
                  <Coins size={15} />
                  {currentBalance.toLocaleString('fr-FR')}
                  <span className="text-[10px] text-neutral-400 font-normal">jetons</span>
                </span>
              </div>
              {mode === 'real' ? (
                isAuthenticated ? (
                  <Link
                    to="/espace-membre"
                    className="text-[10px] font-semibold text-neutral-300 hover:text-white bg-white/5 border border-white/10 rounded-lg px-2 py-1 transition-colors"
                  >
                    Profil
                  </Link>
                ) : (
                  <Link
                    to="/espace-membre"
                    className="text-[10px] font-semibold text-amber-400 hover:underline flex items-center gap-0.5"
                  >
                    Connexion <ArrowUpRight size={10} />
                  </Link>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDemoChips(10000);
                    setNotification('Solde virtuel réinitialisé à 10 000 jetons.');
                  }}
                  disabled={isPlaying}
                  className="text-[10px] font-semibold text-neutral-300 hover:text-white bg-white/5 border border-white/10 rounded-lg px-2 py-1 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                  title="Réinitialiser à 10 000 jetons"
                >
                  <RotateCcw size={11} /> Reset
                </button>
              )}
            </div>

            {/* Bet Input */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="bet-input"
                  className="font-['Geist_Mono'] text-[11px] uppercase tracking-wider text-neutral-300 font-semibold"
                >
                  Mise
                </label>
                <span className="text-[9px] text-neutral-500 font-['Geist_Mono']">
                  Min 10 · Max {currentBalance > 0 ? currentBalance.toLocaleString('fr-FR') : '—'}
                </span>
              </div>

              <div className="relative">
                <input
                  id="bet-input"
                  type="number"
                  min={10}
                  step={10}
                  value={betInput}
                  disabled={isPlaying}
                  onChange={(e) => handleBetInputChange(e.target.value)}
                  onBlur={handleBetInputBlur}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-1.5 text-sm font-bold font-['Geist_Mono'] text-white focus:outline-none focus:border-amber-400 transition-colors disabled:opacity-50"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold font-['Geist_Mono'] text-amber-400">
                  🪙
                </span>
              </div>

              {/* Quick Math Buttons */}
              <div className="grid grid-cols-4 gap-1 pt-0.5">
                {[
                  { label: 'Min', val: 10 },
                  { label: '½', val: Math.max(10, Math.floor(bet / 2)) },
                  { label: '2×', val: bet * 2 },
                  { label: 'Max', val: currentBalance },
                ].map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    disabled={isPlaying}
                    onClick={() => handleSetQuickBet(b.val)}
                    className="py-1 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 text-[10px] font-semibold font-['Geist_Mono'] transition-all disabled:opacity-40 cursor-pointer"
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              {/* Quick Addition Chips */}
              <div className="grid grid-cols-4 gap-1 pt-0.5">
                {[50, 100, 500, 1000].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    disabled={isPlaying}
                    onClick={() => handleAddBetChips(delta)}
                    className="py-0.5 rounded-lg bg-amber-500/5 border border-amber-500/15 hover:bg-amber-500/15 text-[9px] font-semibold font-['Geist_Mono'] text-amber-300 transition-all disabled:opacity-40 cursor-pointer"
                  >
                    +{delta}
                  </button>
                ))}
              </div>
            </div>

            {/* Mines Count Configurator */}
            <div className="space-y-1 pt-1 border-t border-white/10">
              <div className="flex items-center justify-between">
                <label className="font-['Geist_Mono'] text-[11px] uppercase tracking-wider text-neutral-300 font-semibold flex items-center gap-1">
                  <Bomb size={12} className="text-amber-400" />
                  Mines
                </label>
                <span className="font-['Geist_Mono'] text-[11px] font-bold text-amber-400 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  {minesCount} / 24
                </span>
              </div>

              {/* Range Slider */}
              <input
                type="range"
                min={1}
                max={24}
                value={minesCount}
                disabled={isPlaying}
                onChange={(e) => setMinesCount(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer disabled:opacity-40 h-1.5"
              />

              {/* Quick Pills */}
              <div className="grid grid-cols-5 gap-1">
                {[1, 3, 5, 10, 24].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    disabled={isPlaying}
                    onClick={() => {
                      audioRef.current.unlock();
                      audioRef.current.click();
                      setMinesCount(cnt);
                    }}
                    className={`py-1 rounded-lg text-[10px] font-bold font-['Geist_Mono'] transition-all cursor-pointer disabled:opacity-40 ${
                      minesCount === cnt
                        ? 'bg-amber-400 text-black shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                        : 'bg-white/5 border border-white/10 text-neutral-300 hover:bg-white/10'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>

              {/* Odds summary */}
              <div className="flex items-center justify-between text-[9px] font-['Geist_Mono'] text-neutral-400 pt-0.5">
                <span>Diamants : <strong className="text-emerald-400 font-semibold">{GRID_SIZE - minesCount}</strong></span>
                <span>Succès 1er clic : <strong className="text-amber-400 font-semibold">{Math.round(((GRID_SIZE - minesCount) / GRID_SIZE) * 100)}%</strong></span>
              </div>
            </div>

            {/* Quick Strategy Presets */}
            <div className="space-y-1 pt-1 border-t border-white/10">
              <span className="text-[9px] font-['Geist_Mono'] uppercase tracking-wider text-neutral-400 flex items-center gap-1 font-semibold">
                <Zap size={10} className="text-amber-400" /> Stratégies recommandées
              </span>
              <div className="grid grid-cols-2 gap-1">
                {STRATEGY_PRESETS.slice(0, 4).map((p) => {
                  const isSelected = minesCount === p.mines && autoCashoutMult === String(p.expectedMultiplier);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={isPlaying}
                      onClick={() => applyPreset(p)}
                      className={`p-1.5 rounded-lg border text-left transition-all cursor-pointer disabled:opacity-40 ${
                        isSelected
                          ? 'bg-amber-400/15 border-amber-400 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-neutral-300'
                      }`}
                    >
                      <div className="text-[10px] font-bold truncate">{p.mines}M · x{p.expectedMultiplier.toFixed(2)}</div>
                      <div className="text-[8px] text-neutral-400 truncate">{p.badge}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Auto-Cashout Multiplier */}
            <div className="space-y-1 pt-1 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-['Geist_Mono'] uppercase tracking-wider text-neutral-400 flex items-center gap-1 font-semibold">
                  <Zap size={10} className="text-amber-400" /> Auto-Cashout
                </span>
                {autoCashoutMult && (
                  <button
                    type="button"
                    disabled={isPlaying}
                    onClick={() => setAutoCashoutMult('')}
                    className="text-[9px] text-neutral-400 hover:text-white cursor-pointer"
                  >
                    Effacer
                  </button>
                )}
              </div>
              <input
                type="number"
                step="0.05"
                min="1.05"
                max="10000"
                placeholder="Ex : 1.71 (optionnel)"
                value={autoCashoutMult}
                disabled={isPlaying}
                onChange={(e) => setAutoCashoutMult(e.target.value)}
                className="w-full bg-black/40 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-['Geist_Mono'] text-white focus:outline-none focus:border-amber-400/60 disabled:opacity-40"
              />
            </div>

            {/* Primary Action Button */}
            <div className="pt-2 mt-auto">
              {!isPlaying ? (
                <button
                  type="button"
                  onClick={handleStartGame}
                  disabled={currentBalance < bet || bet <= 0}
                  className="w-full py-2.5 sm:py-3 rounded-xl font-bold uppercase tracking-wider text-xs transition-all duration-200 flex flex-col items-center justify-center cursor-pointer bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-black shadow-[0_0_20px_rgba(245,158,11,0.35)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={14} />
                    <span>Lancer ({bet.toLocaleString('fr-FR')} 🪙)</span>
                  </div>
                  <span className="text-[9px] opacity-75 font-['Geist_Mono'] flex items-center gap-1 mt-0.5">
                    <Keyboard size={10} /> Appuyez sur [Espace]
                  </span>
                </button>
              ) : gemsCount === 0 ? (
                <button
                  type="button"
                  disabled
                  className="w-full py-2.5 sm:py-3 rounded-xl font-bold uppercase tracking-wider text-xs bg-neutral-900 border border-white/10 text-neutral-400 flex items-center justify-center gap-1.5 cursor-not-allowed"
                >
                  <Gem size={14} className="animate-pulse text-amber-400" />
                  <span>Choisissez une case</span>
                </button>
              ) : (
                <motion.button
                  type="button"
                  onClick={handleCashout}
                  initial={{ scale: 0.98 }}
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-full py-2.5 sm:py-3 rounded-xl font-bold uppercase tracking-wider text-xs transition-all flex flex-col items-center justify-center cursor-pointer bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600 text-black shadow-[0_0_25px_rgba(16,185,129,0.5)] hover:brightness-110 active:scale-95"
                >
                  <span className="flex items-center gap-1 text-xs sm:text-sm">
                    <Coins size={15} /> ENCAISSER {currentWinAmount.toLocaleString('fr-FR')} 🪙
                  </span>
                  <span className="text-[10px] font-['Geist_Mono'] opacity-90">
                    Cote x{currentMultiplier.toFixed(2)} (+{(currentWinAmount - bet).toLocaleString('fr-FR')} 🪙)
                  </span>
                </motion.button>
              )}
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* PANEL 2: THE MINES ARENA (Center - 6 cols)                   */}
          {/* ------------------------------------------------------------ */}
          <div className="lg:col-span-6 flex flex-col items-center justify-between gap-2.5">
            {/* Live HUD Multiplier & Probability Strip */}
            <div className="w-full max-w-[480px] p-2.5 sm:px-4 sm:py-2.5 rounded-2xl bg-white/[0.04] backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-between">
              {/* Current Gem Progress */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Gem size={14} />
                </div>
                <div>
                  <span className="text-[8px] uppercase tracking-wider text-neutral-400 font-['Geist_Mono'] block">
                    Diamants
                  </span>
                  <span className="text-xs font-bold font-['Geist_Mono'] text-white">
                    {gemsCount} / {GRID_SIZE - minesCount}
                  </span>
                </div>
              </div>

              {/* Current Multiplier Indicator */}
              <div className="text-center px-2">
                <span className="text-[8px] uppercase tracking-wider text-neutral-400 font-['Geist_Mono'] block">
                  Cote actuelle
                </span>
                <span className="text-base sm:text-xl font-black font-['Geist_Mono'] text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]">
                  x{currentMultiplier.toFixed(2)}
                </span>
              </div>

              {/* Next Step Odds Meter */}
              <div className="text-right">
                <span className="text-[8px] uppercase tracking-wider text-neutral-400 font-['Geist_Mono'] block">
                  Prochain : x{(isPlaying ? nextMultiplier : calculateMultiplier(minesCount, 1)).toFixed(2)}
                </span>
                <span
                  className={`text-xs font-bold font-['Geist_Mono'] ${
                    (isPlaying ? nextStepProb : Math.round(((GRID_SIZE - minesCount) / GRID_SIZE) * 100)) >= 70
                      ? 'text-emerald-400'
                      : (isPlaying ? nextStepProb : Math.round(((GRID_SIZE - minesCount) / GRID_SIZE) * 100)) >= 40
                        ? 'text-amber-400'
                        : 'text-red-400'
                  }`}
                >
                  {isPlaying ? nextStepProb : Math.round(((GRID_SIZE - minesCount) / GRID_SIZE) * 100)}% survie
                </span>
              </div>
            </div>

            {/* 5x5 Mines Grid Box */}
            <motion.div
              animate={isShaking ? { x: [-8, 8, -6, 6, -3, 3, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="w-full max-w-[480px] relative rounded-2xl sm:rounded-3xl p-3 sm:p-4 bg-gradient-to-b from-neutral-900/90 to-black/90 border border-amber-500/25 shadow-[0_15px_40px_rgba(0,0,0,0.85)] flex flex-col items-center overflow-hidden"
            >
              {/* Corner Art-Deco Screws */}
              <span className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full border border-amber-500/40 bg-amber-950/60" />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full border border-amber-500/40 bg-amber-950/60" />
              <span className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full border border-amber-500/40 bg-amber-950/60" />
              <span className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full border border-amber-500/40 bg-amber-950/60" />

              {/* Coordinates Header: A - E */}
              <div className="grid grid-cols-5 text-center text-[10px] font-['Geist_Mono'] text-amber-400/60 font-semibold mb-1 tracking-widest w-full">
                <span>A</span>
                <span>B</span>
                <span>C</span>
                <span>D</span>
                <span>E</span>
              </div>

              {/* 5x5 Grid Tiles */}
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2 aspect-square w-full">
                {Array.from({ length: GRID_SIZE }, (_, idx) => {
                  const isPicked = pickedTiles.includes(idx);
                  const isMine = boardData ? boardData.board[idx] : false;
                  const isDetonated = detonatedIndex === idx;
                  const isGameOver = gameResult !== null;

                  return (
                    <motion.button
                      key={idx}
                      type="button"
                      disabled={!isPlaying || isPicked}
                      onClick={() => handleTileClick(idx)}
                      onMouseEnter={() => {
                        if (isPlaying && !isPicked) audioRef.current.hover();
                      }}
                      whileHover={isPlaying && !isPicked ? { scale: 1.04 } : {}}
                      whileTap={isPlaying && !isPicked ? { scale: 0.95 } : {}}
                      className={`relative rounded-xl sm:rounded-2xl transition-all duration-200 flex items-center justify-center overflow-hidden select-none aspect-square focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                        !isGameOver
                          ? isPicked
                            ? 'bg-gradient-to-br from-emerald-950 via-neutral-900 to-emerald-900/70 border-2 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)] cursor-default'
                            : isPlaying
                              ? 'bg-gradient-to-br from-neutral-800 to-neutral-900 border border-white/15 hover:border-amber-400 hover:shadow-[0_0_15px_rgba(245,158,11,0.25)] cursor-pointer'
                              : 'bg-neutral-900/80 border border-white/10 opacity-75 cursor-default'
                          : isDetonated
                            ? 'bg-gradient-to-br from-red-600 via-neutral-950 to-red-950 border-2 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.7)] cursor-default'
                            : isPicked && !isMine
                              ? 'bg-gradient-to-br from-emerald-950 via-neutral-900 to-emerald-900/70 border-2 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)] cursor-default'
                              : isMine
                                ? 'bg-neutral-900/70 border border-red-500/30 opacity-60 cursor-default'
                                : 'bg-neutral-900/70 border border-emerald-500/20 opacity-40 cursor-default'
                      }`}
                      aria-label={`Case ${String.fromCharCode(65 + (idx % 5))}${Math.floor(idx / 5) + 1}`}
                    >
                      {/* Hidden State Tile Watermark */}
                      {!isPicked && !isGameOver && (
                        <div className="flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-white/15 text-[10px] sm:text-[11px] font-['Geist_Mono'] font-bold">
                            {String.fromCharCode(65 + (idx % 5))}
                            {Math.floor(idx / 5) + 1}
                          </span>
                        </div>
                      )}

                      {/* Active Uncovered Diamond */}
                      {isPicked && !isMine && (
                        <motion.div
                          initial={{ scale: 0, rotate: -30 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: 'spring', damping: 14, stiffness: 220 }}
                          className="flex flex-col items-center justify-center text-emerald-400"
                        >
                          <Gem size={24} className="drop-shadow-[0_0_10px_rgba(16,185,129,0.8)] sm:w-7 sm:h-7" />
                        </motion.div>
                      )}

                      {/* Clicked Exploded Mine (Boom) */}
                      {isDetonated && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: [0, 1.25, 1] }}
                          transition={{ duration: 0.3 }}
                          className="flex flex-col items-center justify-center text-red-500"
                        >
                          <Bomb size={24} className="drop-shadow-[0_0_15px_rgba(239,68,68,0.9)] animate-pulse sm:w-7 sm:h-7" />
                          <span className="text-[8px] font-bold font-['Geist_Mono'] text-red-400 mt-0.5">
                            BOOM
                          </span>
                        </motion.div>
                      )}

                      {/* Ghost Unpicked Mine revealed at game over */}
                      {isGameOver && !isPicked && isMine && (
                        <div className="flex flex-col items-center justify-center text-red-400/70">
                          <Bomb size={18} className="sm:w-5 sm:h-5" />
                          <span className="text-[7px] font-['Geist_Mono'] text-red-400/60">Mine</span>
                        </div>
                      )}

                      {/* Ghost Unpicked Diamond revealed at game over */}
                      {isGameOver && !isPicked && !isMine && (
                        <div className="flex flex-col items-center justify-center text-emerald-400/50">
                          <Gem size={16} className="sm:w-5 sm:h-5" />
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* End of Round Result Overlay ("Par dessus" la grille, zéro décalage de hauteur) */}
              <AnimatePresence>
                {gameResult && !isResultDismissed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { duration: 0.2, delay: 0.05 } }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    onClick={() => {
                      audioRef.current.click();
                      setIsResultDismissed(true);
                    }}
                    className="absolute inset-0 z-30 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-[2.5px] rounded-2xl sm:rounded-3xl cursor-pointer pointer-events-auto select-none"
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.92, y: 8 }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        y: 0,
                        transition: { type: 'spring', damping: 25, stiffness: 280, delay: 0.1 },
                      }}
                      exit={{ opacity: 0, scale: 0.95, y: -6, transition: { duration: 0.15 } }}
                      onClick={(e) => e.stopPropagation()}
                      className={`w-full max-w-[340px] p-4 sm:p-5 rounded-2xl border text-center shadow-2xl relative cursor-default ${
                        gameResult === 'won'
                          ? 'bg-neutral-950/95 border-emerald-500/40 shadow-[0_0_35px_rgba(16,185,129,0.35)]'
                          : 'bg-neutral-950/95 border-red-500/40 shadow-[0_0_35px_rgba(239,68,68,0.35)]'
                      }`}
                    >
                      {/* Top Bar with Badge & Close Button */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        {gameResult === 'won' ? (
                          <span className="font-['Geist_Mono'] text-[10px] sm:text-[11px] uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                            <Trophy size={13} className="text-emerald-400" />
                            {lastWin?.reason === 'grand_slam'
                              ? 'GRAND CHELEM !'
                              : lastWin?.reason === 'auto'
                                ? 'AUTO-CASHOUT RÉUSSI !'
                                : 'CASHOUT SÉCURISÉ !'}
                          </span>
                        ) : (
                          <span className="font-['Geist_Mono'] text-[10px] sm:text-[11px] uppercase tracking-wider text-red-400 font-bold flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/15 border border-red-500/30">
                            <Flame size={13} className="text-red-400" />
                            DÉTONATION !
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            audioRef.current.click();
                            setIsResultDismissed(true);
                          }}
                          className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title="Fermer / Inspecter la grille (Échap)"
                          aria-label="Fermer"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      {/* Result Body */}
                      {gameResult === 'won' && lastWin ? (
                        <div className="flex flex-col items-center gap-1.5 my-1">
                          <span className="text-2xl sm:text-3xl font-black font-['Geist_Mono'] text-white drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]">
                            +{lastWin.amount.toLocaleString('fr-FR')} 🪙
                          </span>
                          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-['Geist_Mono'] text-neutral-300">
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-bold">
                              x{lastWin.multiplier.toFixed(2)}
                            </span>
                            <span className="text-neutral-500">·</span>
                            <span>{lastWin.gemsCount} diamant{lastWin.gemsCount > 1 ? 's' : ''}</span>
                            <span className="text-neutral-500">·</span>
                            <span className="text-emerald-400 font-semibold">
                              +{(lastWin.amount - lastRoundBet).toLocaleString('fr-FR')} net
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-3 w-full">
                            <button
                              type="button"
                              onClick={() => {
                                audioRef.current.click();
                                setIsResultDismissed(true);
                              }}
                              className="flex-1 py-2 px-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-semibold text-neutral-300 transition-all cursor-pointer flex items-center justify-center gap-1"
                            >
                              <Eye size={12} />
                              <span>Voir la grille</span>
                              <span className="text-[9px] text-neutral-400 font-['Geist_Mono'] hidden sm:inline">[Échap]</span>
                            </button>
                            <button
                              type="button"
                              disabled={currentBalance < bet || bet <= 0}
                              onClick={() => {
                                audioRef.current.click();
                                void handleStartGame();
                              }}
                              className="flex-1 py-2 px-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-110 active:scale-95 text-black text-xs font-black font-['Geist_Mono'] transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.4)] flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
                            >
                              <RotateCcw size={12} className="stroke-[2.5]" />
                              <span>Rejouer</span>
                              <span className="text-[9px] text-black/60 font-['Geist_Mono'] hidden sm:inline">[Espace]</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 my-1">
                          <span className="text-2xl sm:text-3xl font-black font-['Geist_Mono'] text-red-400 drop-shadow-[0_0_12px_rgba(239,68,68,0.5)]">
                            -{lastRoundBet.toLocaleString('fr-FR')} 🪙
                          </span>
                          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-['Geist_Mono'] text-neutral-300">
                            {detonatedCoord && (
                              <span className="px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/25 text-red-300 font-bold">
                                Case {detonatedCoord}
                              </span>
                            )}
                            <span className="text-neutral-500">·</span>
                            <span>{minesCount} mine{minesCount > 1 ? 's' : ''}</span>
                            <span className="text-neutral-500">·</span>
                            <span className="text-neutral-400">
                              {gemsCount} diamant{gemsCount > 1 ? 's' : ''} découvert{gemsCount > 1 ? 's' : ''}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-3 w-full">
                            <button
                              type="button"
                              onClick={() => {
                                audioRef.current.click();
                                setIsResultDismissed(true);
                              }}
                              className="flex-1 py-2 px-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-semibold text-neutral-300 transition-all cursor-pointer flex items-center justify-center gap-1"
                            >
                              <Eye size={12} />
                              <span>Voir la grille</span>
                              <span className="text-[9px] text-neutral-400 font-['Geist_Mono'] hidden sm:inline">[Échap]</span>
                            </button>
                            <button
                              type="button"
                              disabled={currentBalance < bet || bet <= 0}
                              onClick={() => {
                                audioRef.current.click();
                                void handleStartGame();
                              }}
                              className="flex-1 py-2 px-2.5 rounded-xl bg-gradient-to-r from-red-500 to-amber-500 hover:brightness-110 active:scale-95 text-white text-xs font-black font-['Geist_Mono'] transition-all cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.4)] flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
                            >
                              <RotateCcw size={12} className="stroke-[2.5]" />
                              <span>Réessayer</span>
                              <span className="text-[9px] text-white/70 font-['Geist_Mono'] hidden sm:inline">[Espace]</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Direct-Action Sub-Bar (Fixed 2-column layout: button never shifts size when spam clicking) */}
            <div className="w-full max-w-[480px] grid grid-cols-2 gap-2 mt-2">
              {!isPlaying && gameResult && isResultDismissed ? (
                <button
                  type="button"
                  onClick={() => {
                    audioRef.current.click();
                    setIsResultDismissed(false);
                  }}
                  className={`w-full py-2.5 px-3 rounded-xl border text-[11px] font-bold font-['Geist_Mono'] flex items-center justify-center gap-1.5 shadow-md cursor-pointer select-none transition-all active:scale-95 ${
                    gameResult === 'won'
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                      : 'border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25 shadow-[0_0_12px_rgba(239,68,68,0.25)]'
                  }`}
                  title="Afficher à nouveau le bandeau de résultat (Échap)"
                >
                  <Eye size={13} className="shrink-0" />
                  <span className="truncate">
                    {gameResult === 'won'
                      ? `Gain : +${lastWin?.amount.toLocaleString('fr-FR')} 🪙`
                      : `Perte : -${lastRoundBet.toLocaleString('fr-FR')} 🪙`}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!isPlaying}
                  onClick={handleRandomPick}
                  className="w-full py-2.5 px-3 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] hover:border-amber-400/50 text-[11px] font-semibold font-['Geist_Mono'] text-neutral-200 hover:text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed select-none active:scale-95"
                  title="Touche clavier [R]"
                >
                  <Shuffle size={13} className="text-amber-400 shrink-0" />
                  <span>Case aléatoire</span>
                  <span className="text-[9px] text-neutral-500">[R]</span>
                </button>
              )}

              {/* In-Grid Instant Cashout Slot (Stable layout prevents layout jumps) */}
              {isPlaying && gemsCount > 0 ? (
                <button
                  type="button"
                  onClick={handleCashout}
                  className="w-full py-2.5 px-3 rounded-xl font-bold font-['Geist_Mono'] text-[11px] border border-transparent bg-gradient-to-r from-emerald-500 to-teal-400 text-black flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.5)] hover:brightness-110 active:scale-95 cursor-pointer select-none"
                >
                  <Coins size={13} className="shrink-0" />
                  <span className="truncate">Encaisser {currentWinAmount.toLocaleString('fr-FR')} 🪙</span>
                </button>
              ) : !isPlaying && gameResult && isResultDismissed ? (
                <button
                  type="button"
                  disabled={currentBalance < bet || bet <= 0}
                  onClick={() => {
                    audioRef.current.click();
                    void handleStartGame();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl font-bold font-['Geist_Mono'] text-[11px] border border-transparent bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 active:scale-95 text-black flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.3)] cursor-pointer select-none transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
                >
                  <RotateCcw size={13} className="shrink-0 stroke-[2.5]" />
                  <span className="truncate">Rejouer ({bet.toLocaleString('fr-FR')} 🪙)</span>
                </button>
              ) : !isPlaying && gameResult && !isResultDismissed ? (
                <div
                  className={`w-full py-2.5 px-3 rounded-xl border text-[11px] font-bold font-['Geist_Mono'] flex items-center justify-center gap-1.5 select-none ${
                    gameResult === 'won'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-red-500/30 bg-red-500/10 text-red-300'
                  }`}
                >
                  <Coins size={13} className="shrink-0" />
                  <span className="truncate">
                    {gameResult === 'won'
                      ? `Gain : +${lastWin?.amount.toLocaleString('fr-FR')} 🪙`
                      : `Perte : -${lastRoundBet.toLocaleString('fr-FR')} 🪙`}
                  </span>
                </div>
              ) : (
                <div className="w-full py-2.5 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-[11px] font-semibold font-['Geist_Mono'] text-neutral-500 flex items-center justify-center gap-1.5 select-none cursor-not-allowed">
                  <Coins size={13} className="opacity-40 shrink-0" />
                  <span>Gain : 0 🪙</span>
                </div>
              )}
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* PANEL 3: MULTIPLIER ROADMAP & PROVABLY FAIR (3 cols)        */}
          {/* ------------------------------------------------------------ */}
          <div className="lg:col-span-3 flex flex-col gap-2.5 liquid-glass rounded-2xl p-3.5 sm:p-4 border border-white/15">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="font-['Geist_Mono'] text-[11px] uppercase tracking-wider text-neutral-300 font-semibold flex items-center gap-1.5">
                <Trophy size={13} className="text-amber-400" />
                Échelle des Cotes
              </span>
              <span className="text-[10px] font-['Geist_Mono'] text-neutral-400">
                {gemsCount} / {GRID_SIZE - minesCount}
              </span>
            </div>

            {/* Scrollable Multiplier Ladder */}
            <div className="space-y-1 max-h-[310px] overflow-y-auto pr-1 scrollbar-thin">
              {ladder.slice(0, 15).map((item) => {
                const isCurrent = isPlaying && gemsCount === item.step;
                const isPassed = isPlaying && gemsCount > item.step;
                const isNext = isPlaying && gemsCount + 1 === item.step;

                return (
                  <div
                    key={item.step}
                    className={`p-1.5 rounded-lg border flex items-center justify-between text-[11px] font-['Geist_Mono'] transition-all ${
                      isCurrent
                        ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-[0_0_15px_rgba(245,158,11,0.4)] scale-[1.02]'
                        : isPassed
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-semibold'
                          : isNext
                            ? 'bg-amber-500/5 border-amber-500/30 text-amber-200'
                            : 'bg-white/[0.02] border-white/5 text-neutral-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                          isCurrent
                            ? 'bg-black text-amber-400'
                            : isPassed
                              ? 'bg-emerald-500 text-black'
                              : 'bg-white/10 text-neutral-400'
                        }`}
                      >
                        {isPassed ? '✓' : item.step}
                      </span>
                      <span>{item.step} diamants</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isNext && (
                        <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1 rounded">
                          PROCHAIN
                        </span>
                      )}
                      <span className="font-bold">x{item.multiplier.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Provably Fair Quick Info Card */}
            <div className="mt-auto pt-2 border-t border-white/10 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-['Geist_Mono'] text-neutral-400">
                <span className="flex items-center gap-1 font-semibold text-neutral-300">
                  <ShieldCheck size={12} className="text-amber-400" /> Équité Prouvée
                </span>
                {boardData && (
                  <button
                    type="button"
                    onClick={copyServerHash}
                    className="hover:text-white flex items-center gap-1 cursor-pointer text-[9px]"
                  >
                    {copiedHash ? 'Copié !' : <Copy size={10} />}
                  </button>
                )}
              </div>
              {boardData ? (
                <div
                  className="font-['Geist_Mono'] text-[9px] text-neutral-400 truncate bg-black/50 p-1.5 rounded border border-white/10 select-all cursor-pointer"
                  title={`Hash SHA-256 : ${boardData.hash}`}
                  onClick={copyServerHash}
                >
                  {boardData.hash}
                </div>
              ) : (
                <div className="text-[9px] text-neutral-500 font-['Geist_Mono']">
                  Graine engagée avant le premier clic.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ================================================================ */}
      {/* 3. EXTENDED TABS: STRATEGIES, HISTORY, PROVABLY FAIR, RULES      */}
      {/* ================================================================ */}
      <section className="relative z-10 px-3 sm:px-6 pt-6 pb-20 max-w-7xl mx-auto">
        <div className="liquid-glass rounded-3xl p-4 sm:p-6 border border-white/15">
          {/* Tab Navigation */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pb-4 border-b border-white/10" role="tablist">
            {[
              { id: 'strategies', label: 'Stratégies & Astuces Vidéo', icon: Zap },
              { id: 'history', label: 'Historique des Parties', icon: History },
              { id: 'fairness', label: 'Équité Prouvée (Provably Fair)', icon: Scale },
              { id: 'rules', label: 'Règles & Gains', icon: HelpCircle },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id as typeof activeTab)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === id
                    ? 'bg-amber-400 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                    : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* TAB 1: STRATÉGIES & ASTUCES */}
          {activeTab === 'strategies' && (
            <div className="pt-4 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold font-['Instrument_Serif'] text-white">
                    Guide Stratégique du <em className="italic text-amber-400">Diamond Casino</em>
                  </h3>
                  <p className="text-neutral-400 text-xs mt-0.5">
                    Configurations validées par les joueurs pros : appliquez en 1 clic vos réglages favoris.
                  </p>
                </div>
                <span className="text-[10px] font-['Geist_Mono'] text-amber-400/90 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                  4 MÉTHODES VALIDÉES
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {STRATEGY_PRESETS.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 rounded-xl bg-white/[0.02] border border-white/10 hover:border-amber-400/40 transition-colors flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                          {p.badge}
                        </span>
                        <span className="text-[10px] font-['Geist_Mono'] text-neutral-400 uppercase">
                          Risque {p.riskLevel}
                        </span>
                      </div>
                      <h4 className="font-bold text-base text-white mb-1">{p.name}</h4>
                      <p className="text-neutral-300 text-xs leading-relaxed mb-2">
                        {p.description}
                      </p>
                      <div className="p-2 rounded-lg bg-black/40 border border-white/5 text-[10px] font-['Geist_Mono'] text-amber-300/90 flex items-start gap-1.5">
                        <Info size={13} className="shrink-0 text-amber-400 mt-0.5" />
                        <span>{p.proTip}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isPlaying}
                      onClick={() => applyPreset(p)}
                      className="w-full py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-amber-400 hover:text-black font-semibold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      <ChevronRight size={13} />
                      Appliquer ({p.mines} mines · Auto x{p.expectedMultiplier.toFixed(2)})
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: HISTORIQUE */}
          {activeTab === 'history' && (
            <div className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold font-['Instrument_Serif'] text-white">
                  Historique de la session
                </h3>
                <span className="text-xs font-['Geist_Mono'] text-neutral-400">
                  {history.length} partie(s) enregistrée(s)
                </span>
              </div>

              {history.length === 0 ? (
                <div className="text-center py-8 text-neutral-500 text-xs">
                  Aucune partie jouée pour l’instant dans cette session.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-['Geist_Mono']">
                    <thead>
                      <tr className="border-b border-white/10 text-neutral-400 text-[9px] tracking-wider uppercase">
                        <th className="py-2 px-2.5">Heure</th>
                        <th className="py-2 px-2.5">Mode</th>
                        <th className="py-2 px-2.5">Mise</th>
                        <th className="py-2 px-2.5">Mines</th>
                        <th className="py-2 px-2.5">Diamants</th>
                        <th className="py-2 px-2.5">Cote</th>
                        <th className="py-2 px-2.5">Gain</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {history.map((h) => (
                        <tr key={h.id} className="hover:bg-white/[0.02]">
                          <td className="py-2 px-2.5 text-neutral-400">
                            {h.timestamp.toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </td>
                          <td className="py-2 px-2.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                h.mode === 'real'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                  : 'bg-neutral-800 text-neutral-300'
                              }`}
                            >
                              {h.mode === 'real' ? 'RP' : 'DÉMO'}
                            </span>
                          </td>
                          <td className="py-2 px-2.5">{h.bet.toLocaleString('fr-FR')} 🪙</td>
                          <td className="py-2 px-2.5 text-neutral-300">{h.mines}</td>
                          <td className="py-2 px-2.5 text-emerald-400">{h.gemsRevealed}</td>
                          <td className="py-2 px-2.5 font-bold text-white">x{h.multiplier.toFixed(2)}</td>
                          <td className="py-2 px-2.5">
                            {h.won ? (
                              <span className="text-emerald-400 font-bold">
                                +{h.winAmount.toLocaleString('fr-FR')} 🪙
                              </span>
                            ) : (
                              <span className="text-red-400 font-bold">-{h.bet.toLocaleString('fr-FR')} 🪙</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PROVABLY FAIR */}
          {activeTab === 'fairness' && (
            <div className="pt-4 space-y-4">
              <div>
                <h3 className="text-lg font-bold font-['Instrument_Serif'] text-white">
                  Équité Prouvée &amp; Cryptographie SHA-256
                </h3>
                <p className="text-neutral-400 text-xs mt-0.5 max-w-2xl leading-relaxed">
                  Au Diamond Casino, le tirage de chaque grille est généré et scellé sous forme d'empreinte SHA-256
                  avant même que vous ne choisissiez votre première case. Le casino ne peut pas modifier l'emplacement
                  des mines en cours de jeu.
                </p>
              </div>

              {boardData ? (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-['Geist_Mono'] uppercase tracking-wider text-amber-400 font-semibold block">
                        Empreinte SHA-256 du tirage (Pré-engagée)
                      </span>
                      <button
                        type="button"
                        onClick={copyServerHash}
                        className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        {copiedHash ? 'Copié !' : <Copy size={11} />}
                      </button>
                    </div>
                    <div className="p-2.5 rounded-lg bg-black/60 border border-white/10 font-['Geist_Mono'] text-[10px] text-neutral-200 break-all select-all">
                      {boardData.hash}
                    </div>
                  </div>

                  {gameResult && (
                    <div className="space-y-1 pt-2 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-['Geist_Mono'] uppercase tracking-wider text-neutral-300 font-semibold block">
                          Graine Serveur révélée (post-partie)
                        </span>
                        <button
                          type="button"
                          onClick={copyServerSeed}
                          className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          {copiedSeed ? 'Copié !' : <Copy size={11} />}
                        </button>
                      </div>
                      <div className="p-2.5 rounded-lg bg-black/60 border border-white/10 font-['Geist_Mono'] text-[10px] text-emerald-300 break-all select-all">
                        {boardData.serverSeed}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={!gameResult}
                      onClick={handleVerifyFairness}
                      className="py-2 px-4 rounded-full bg-white text-black font-semibold text-xs flex items-center gap-1.5 hover:bg-neutral-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Shield size={13} />
                      Vérifier l’intégrité du tirage
                    </button>

                    {verifyStatus === 'verified' && (
                      <span className="text-xs font-['Geist_Mono'] text-emerald-400 flex items-center gap-1 font-semibold">
                        <CheckCircle2 size={14} /> Tirage 100% conforme et vérifié (SHA-256 valide) !
                      </span>
                    )}
                    {verifyStatus === 'failed' && (
                      <span className="text-xs font-['Geist_Mono'] text-red-400 flex items-center gap-1 font-semibold">
                        <AlertTriangle size={14} /> Discordance détectée
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-xl bg-white/[0.02] border border-white/10 text-center text-xs text-neutral-400">
                  Lancez une première partie pour inspecter la graine cryptographique et vérifier l’équité du tirage.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: RÈGLES DU JEU */}
          {activeTab === 'rules' && (
            <div className="pt-4 space-y-4">
              <div>
                <h3 className="text-lg font-bold font-['Instrument_Serif'] text-white">
                  Règles &amp; Fonctionnement des Mines
                </h3>
                <p className="text-neutral-400 text-xs mt-0.5">
                  Règles officielles du jeu de mines au sein du Diamond Casino &amp; Resort.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-1.5">
                  <span className="font-['Geist_Mono'] text-amber-400 font-bold text-xs uppercase tracking-wider block">
                    01 // La Grille 5x5
                  </span>
                  <p className="text-neutral-300 text-xs leading-relaxed">
                    25 dalles dissimulent des diamants et un nombre personnalisable de mines (de 1 à 24).
                    Plus vous configurez de mines, plus chaque diamant rapporte une cote colossale.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-1.5">
                  <span className="font-['Geist_Mono'] text-amber-400 font-bold text-xs uppercase tracking-wider block">
                    02 // Le Choix du Cashout
                  </span>
                  <p className="text-neutral-300 text-xs leading-relaxed">
                    Dès le premier diamant révélé, vous pouvez cliquer sur <strong>ENCAISSER</strong> ou appuyer sur <strong>[Espace]</strong> pour repartir
                    immédiatement avec votre mise multipliée. Si vous heurtez une mine, la mise est perdue.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-1.5">
                  <span className="font-['Geist_Mono'] text-amber-400 font-bold text-xs uppercase tracking-wider block">
                    03 // Jetons RP Unifiés
                  </span>
                  <p className="text-neutral-300 text-xs leading-relaxed">
                    Les jetons gagnés sont directement crédités sur votre compte citoyen et synchronisés avec l'ensemble
                    des attractions du Diamond Casino &amp; Resort.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
