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
  Flame,
  Gem,
  HelpCircle,
  History,
  Info,
  RotateCcw,
  Scale,
  Shield,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { fadeUp } from '../constants/animations';
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

export const MinesGame: React.FC = () => {
  const { user, isAuthenticated, playMinesRound } = useCasinoUser();

  // Mode: Real chips (if authenticated and has chips) or Demo chips
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

  // Active game settings
  const [bet, setBet] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>('100');
  const [minesCount, setMinesCount] = useState<number>(3);
  const [autoCashoutMult, setAutoCashoutMult] = useState<string>('');
  const [notification, setNotification] = useState<string | null>(null);

  // Game state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [boardData, setBoardData] = useState<GeneratedBoard | null>(null);
  const [pickedTiles, setPickedTiles] = useState<number[]>([]);
  const [detonatedIndex, setDetonatedIndex] = useState<number | null>(null);
  const [gameResult, setGameResult] = useState<'won' | 'lost' | null>(null);
  const [cashoutReason, setCashoutReason] = useState<'manual' | 'auto' | 'grand_slam' | null>(null);
  const [lastWin, setLastWin] = useState<{
    amount: number;
    multiplier: number;
    gemsCount: number;
    reason: 'manual' | 'auto' | 'grand_slam';
  } | null>(null);

  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'strategies' | 'history' | 'fairness' | 'rules'>('strategies');
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'verified' | 'failed'>('idle');

  // Multiplier ladder for the current mine count
  const ladder = useMemo(() => getMultiplierLadder(minesCount), [minesCount]);

  // Actual safe diamonds successfully uncovered by the player
  const gemsCount = useMemo(() => {
    if (!boardData) return 0;
    return pickedTiles.filter((idx) => !boardData.board[idx]).length;
  }, [pickedTiles, boardData]);

  // Current multiplier & payout
  const currentMultiplier = useMemo(
    () => (gemsCount > 0 ? calculateMultiplier(minesCount, gemsCount) : 1),
    [minesCount, gemsCount],
  );

  const currentWinAmount = useMemo(
    () => Math.floor(bet * currentMultiplier),
    [bet, currentMultiplier],
  );

  const nextStepProb = useMemo(
    () => getNextStepProbability(minesCount, gemsCount),
    [minesCount, gemsCount],
  );

  const nextMultiplier = useMemo(
    () => calculateMultiplier(minesCount, gemsCount + 1),
    [minesCount, gemsCount],
  );

  // Available chips based on mode (takes active bet into account while playing)
  const currentBalance = useMemo(() => {
    if (mode === 'real') {
      if (!user) return 0;
      return isPlaying ? Math.max(0, user.chips - bet) : user.chips;
    }
    return demoChips;
  }, [mode, user, isPlaying, bet, demoChips]);

  // Cleanup audio on unmount
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
      // storage unavailable
    }
  }, [demoChips]);

  // Auto-switch mode if user status changes
  useEffect(() => {
    if (isAuthenticated && user && user.chips >= 10 && mode === 'demo') {
      // Let user remain in demo or choose, but if unauthenticated enforce demo
    }
    if (!isAuthenticated && mode === 'real') {
      setMode('demo');
    }
  }, [isAuthenticated, user, mode]);

  // Notification clear timeout
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
        // storage unavailable
      }
      return next;
    });
  };

  // Adjust bet helper with typing safety
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
    const maxAllowed = mode === 'real' ? (user ? user.chips : 10) : demoChips;
    const clamped = Math.max(10, Math.min(val, maxAllowed > 0 ? maxAllowed : 10000000));
    setBet(clamped);
    setBetInput(String(clamped));
  };

  const handleAddBetChips = (delta: number) => {
    if (isPlaying) return;
    const maxAllowed = mode === 'real' ? (user ? user.chips : 10) : demoChips;
    const nextVal = Math.min(bet + delta, maxAllowed > 0 ? maxAllowed : 10000000);
    setBet(nextVal);
    setBetInput(String(nextVal));
  };

  // Switch to preset strategy with full feedback & auto-cashout setup
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
  const handleStartGame = async () => {
    if (isPlaying) return;
    audioRef.current.unlock();

    // Check balance
    if (mode === 'real') {
      if (!isAuthenticated || !user) {
        setMode('demo');
        return;
      }
      if (user.chips < bet) {
        setNotification('Solde de jetons insuffisant.');
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
    setVerifyStatus('idle');
    setIsPlaying(true);

    audioRef.current.start();
  };

  // Finish round helper
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

      if (won) {
        setLastWin({
          amount: winAmt,
          multiplier: mult,
          gemsCount: finalGemsCount,
          reason,
        });
        audioRef.current.cashout();
      } else {
        audioRef.current.explosion();
      }

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
          console.error('[Mines] Erreur lors de l’enregistrement du pari:', err);
        }
      } else if (mode === 'demo' && won) {
        setDemoChips((prev) => prev + winAmt);
      }
    },
    [mode, bet, minesCount, isAuthenticated, playMinesRound],
  );

  // Manual Cash out
  const handleCashout = useCallback(() => {
    if (!isPlaying || !boardData || gemsCount === 0) return;
    audioRef.current.unlock();
    void finalizeRound(true, currentMultiplier, currentWinAmount, gemsCount, 'manual', null);
  }, [isPlaying, boardData, gemsCount, currentMultiplier, currentWinAmount, finalizeRound]);

  // Click on a tile
  const handleTileClick = async (index: number) => {
    if (!isPlaying || !boardData || pickedTiles.includes(index) || gameResult) return;
    audioRef.current.unlock();

    const isMine = boardData.board[index];
    const newPicked = [...pickedTiles, index];
    setPickedTiles(newPicked);

    if (isMine) {
      // BOOM: Hit a mine!
      await finalizeRound(false, 0, 0, gemsCount, 'manual', index);
    } else {
      // GEM: Found a diamond!
      const newGemsCount = gemsCount + 1;
      audioRef.current.gem(newGemsCount);

      const totalDiamonds = GRID_SIZE - minesCount;
      const newMult = calculateMultiplier(minesCount, newGemsCount);
      const newWin = Math.floor(bet * newMult);

      // Check auto-cashout target
      const targetMult = parseFloat(autoCashoutMult);
      if (!isNaN(targetMult) && targetMult > 1 && newMult >= targetMult) {
        await finalizeRound(true, newMult, newWin, newGemsCount, 'auto', null);
        return;
      }

      // Check if all diamonds are uncovered (Grand Slam)
      if (newGemsCount >= totalDiamonds) {
        await finalizeRound(true, newMult, newWin, newGemsCount, 'grand_slam', null);
      }
    }
  };

  // Random pick helper
  const handleRandomPick = () => {
    if (!isPlaying || !boardData) return;
    const unrevealedIndices = Array.from({ length: GRID_SIZE }, (_, idx) => idx).filter(
      (idx) => !pickedTiles.includes(idx),
    );
    if (unrevealedIndices.length === 0) return;
    const randIdx = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
    void handleTileClick(randIdx);
  };

  // Copy hash helper
  const copyServerHash = () => {
    if (!boardData) return;
    void navigator.clipboard.writeText(boardData.hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  // Copy seed helper
  const copyServerSeed = () => {
    if (!boardData) return;
    void navigator.clipboard.writeText(boardData.serverSeed);
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  // Verify Provably Fair Hash
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
      {/* ================================================================ */}
      {/* HERO BANNER & ATMOSPHERE                                         */}
      {/* ================================================================ */}
      <section className="relative pt-32 sm:pt-40 pb-10 px-4 sm:px-6 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20 grayscale scale-105 pointer-events-none"
          style={{ backgroundImage: "url('/diamond_casino_hall.jpg')" }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/85 to-black pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
          <div>
            <motion.h1
              {...fadeUp(0.05)}
              className="text-4xl sm:text-6xl lg:text-7xl tracking-tight leading-[1.05] font-['Instrument_Serif'] font-normal"
            >
              Les Mines du <em className="italic text-amber-400">Diamond</em>
            </motion.h1>
            <motion.p
              {...fadeUp(0.1)}
              className="text-neutral-400 text-sm sm:text-base max-w-2xl mt-3 leading-relaxed"
            >
              Déjouez les pièges dissimulés sous les dalles du casino. Chaque diamant trouvé augmente votre gain :
              sécurisez votre cashout au bon moment ou visez le grand chelem.
            </motion.p>
          </div>

          {/* Quick controls: Sound & Mode Pill */}
          <div className="flex items-center gap-3 self-stretch md:self-auto justify-between md:justify-end">
            {/* Mode Switcher */}
            <div className="flex items-center p-1 rounded-full bg-neutral-900 border border-white/10 text-xs font-semibold">
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
                className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                  mode === 'real'
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Jetons Réels
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isPlaying) return;
                  setMode('demo');
                }}
                className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                  mode === 'demo'
                    ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Mode Démo
              </button>
            </div>

            {/* Sound Mute Toggle */}
            <button
              type="button"
              onClick={toggleMute}
              className="w-10 h-10 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
              title={muted ? 'Activer le son' : 'Couper le son'}
              aria-label={muted ? 'Activer le son' : 'Couper le son'}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} className="text-amber-400" />}
            </button>
          </div>
        </div>

        {/* Global Notification Banner */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-6xl mx-auto mt-4 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-['Geist_Mono'] flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-amber-400 shrink-0" />
                <span>{notification}</span>
              </div>
              <button
                type="button"
                onClick={() => setNotification(null)}
                className="text-neutral-400 hover:text-white cursor-pointer ml-3"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ================================================================ */}
      {/* MAIN GAME CONTAINER (3-COL HUD)                                  */}
      {/* ================================================================ */}
      <section className="px-4 sm:px-6 pb-20 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ------------------------------------------------------------ */}
          {/* COLUMN 1: BET & CONTROLS PANEL (4 cols)                      */}
          {/* ------------------------------------------------------------ */}
          <div className="lg:col-span-4 liquid-glass rounded-2xl p-5 sm:p-6 border border-white/15 flex flex-col gap-5">
            {/* Balance Card */}
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
              <div>
                <span className="font-['Geist_Mono'] text-[10px] tracking-[2px] uppercase text-neutral-400 block">
                  {mode === 'real' ? 'SOLDE CASINO RP' : 'SOLDE VIRTUEL DÉMO'}
                </span>
                <span className="text-xl sm:text-2xl font-bold font-['Geist_Mono'] text-amber-400 flex items-center gap-1.5 mt-0.5">
                  <Coins size={18} />
                  {currentBalance.toLocaleString('fr-FR')}
                  <span className="text-xs text-neutral-400 font-normal">jetons</span>
                </span>
                {isPlaying && mode === 'real' && (
                  <span className="text-[10px] font-['Geist_Mono'] text-amber-400/80 block mt-0.5">
                    (Mise active : {bet.toLocaleString('fr-FR')} 🪙)
                  </span>
                )}
              </div>
              {mode === 'real' ? (
                isAuthenticated ? (
                  <Link
                    to="/espace-membre"
                    className="text-[11px] font-semibold text-neutral-300 hover:text-white bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 transition-colors"
                  >
                    Gérer
                  </Link>
                ) : (
                  <Link
                    to="/espace-membre"
                    className="text-[11px] font-semibold text-amber-400 hover:underline flex items-center gap-1"
                  >
                    Connexion <ArrowUpRight size={12} />
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
                  className="text-[11px] font-semibold text-neutral-300 hover:text-white bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                  title="Réinitialiser à 10 000 jetons"
                >
                  <RotateCcw size={12} /> Reset
                </button>
              )}
            </div>

            {/* Bet Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="bet-input"
                  className="font-['Geist_Mono'] text-xs uppercase tracking-wider text-neutral-300 font-medium"
                >
                  Mise en jetons
                </label>
                <span className="text-[11px] text-neutral-500 font-['Geist_Mono']">
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
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-4 py-3 text-lg font-bold font-['Geist_Mono'] text-white focus:outline-none focus:border-amber-400/80 transition-colors disabled:opacity-50"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold font-['Geist_Mono'] text-amber-400">
                  JETONS
                </span>
              </div>

              {/* Quick Bet Buttons */}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[
                  { label: 'Min', val: 10 },
                  { label: '1/2', val: Math.max(10, Math.floor(bet / 2)) },
                  { label: '2X', val: bet * 2 },
                  { label: 'Max', val: currentBalance },
                ].map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    disabled={isPlaying}
                    onClick={() => handleSetQuickBet(b.val)}
                    className="py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 text-xs font-semibold font-['Geist_Mono'] transition-all disabled:opacity-40 cursor-pointer"
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              {/* Incremental Chip Addition Buttons */}
              <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                {[50, 100, 500, 1000].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    disabled={isPlaying}
                    onClick={() => handleAddBetChips(delta)}
                    className="py-1 rounded-lg bg-amber-500/5 border border-amber-500/15 hover:bg-amber-500/15 text-[11px] font-semibold font-['Geist_Mono'] text-amber-300 transition-all disabled:opacity-40 cursor-pointer"
                  >
                    +{delta}
                  </button>
                ))}
              </div>
            </div>

            {/* Mines Count Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-['Geist_Mono'] text-xs uppercase tracking-wider text-neutral-300 font-medium flex items-center gap-1.5">
                  <Bomb size={14} className="text-amber-400" />
                  Nombre de mines
                </label>
                <span className="font-['Geist_Mono'] text-sm font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  {minesCount} / 24
                </span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min={1}
                max={24}
                value={minesCount}
                disabled={isPlaying}
                onChange={(e) => setMinesCount(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer disabled:opacity-40"
              />

              {/* Quick Pills */}
              <div className="flex items-center gap-1.5">
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
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-['Geist_Mono'] transition-all cursor-pointer disabled:opacity-40 ${
                      minesCount === cnt
                        ? 'bg-amber-400 text-black shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                        : 'bg-white/5 border border-white/10 text-neutral-300 hover:bg-white/10'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>

              {/* Volatility Indicator */}
              <div className="pt-1 flex items-center justify-between text-[11px] font-['Geist_Mono'] text-neutral-400">
                <span>Diamants disponibles :</span>
                <span className="text-emerald-400 font-semibold">{GRID_SIZE - minesCount}</span>
              </div>
            </div>

            {/* Auto Cashout Multiplier (Optional) */}
            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-['Geist_Mono'] uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                  <Zap size={12} className="text-amber-400" /> Auto-Cashout (optionnel)
                </span>
                {autoCashoutMult && (
                  <button
                    type="button"
                    disabled={isPlaying}
                    onClick={() => setAutoCashoutMult('')}
                    className="text-[10px] text-neutral-400 hover:text-white cursor-pointer"
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
                placeholder="Ex : 1.71 (désactivé)"
                value={autoCashoutMult}
                disabled={isPlaying}
                onChange={(e) => setAutoCashoutMult(e.target.value)}
                className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-xs font-['Geist_Mono'] text-white focus:outline-none focus:border-amber-400/60 disabled:opacity-40"
              />
            </div>

            {/* PRIMARY ACTION BUTTON */}
            <div className="pt-2">
              {!isPlaying ? (
                <button
                  type="button"
                  onClick={handleStartGame}
                  disabled={currentBalance < bet || bet <= 0}
                  className="w-full py-4 rounded-xl font-bold uppercase tracking-wider text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-black shadow-[0_0_30px_rgba(245,158,11,0.35)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <Sparkles size={18} />
                  <span>Lancer la partie ({bet.toLocaleString('fr-FR')} 🪙)</span>
                </button>
              ) : gemsCount === 0 ? (
                <button
                  type="button"
                  disabled
                  className="w-full py-4 rounded-xl font-bold uppercase tracking-wider text-sm bg-neutral-900 border border-white/10 text-neutral-400 flex items-center justify-center gap-2 cursor-not-allowed"
                >
                  <Gem size={18} className="animate-pulse text-amber-400" />
                  <span>Choisissez une case</span>
                </button>
              ) : (
                <motion.button
                  type="button"
                  onClick={handleCashout}
                  initial={{ scale: 0.98 }}
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-full py-4 rounded-xl font-bold uppercase tracking-wider text-sm transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600 text-black shadow-[0_0_35px_rgba(16,185,129,0.5)] hover:brightness-110 active:scale-95"
                >
                  <span className="flex items-center gap-1.5 text-base">
                    <Coins size={20} /> ENCAISSER {currentWinAmount.toLocaleString('fr-FR')} 🪙
                  </span>
                  <span className="text-[11px] font-['Geist_Mono'] opacity-90">
                    Cote x{currentMultiplier.toFixed(2)} (+{(currentWinAmount - bet).toLocaleString('fr-FR')})
                  </span>
                </motion.button>
              )}

              {/* Helper button: Random Tile */}
              {isPlaying && (
                <button
                  type="button"
                  onClick={handleRandomPick}
                  className="w-full mt-2.5 py-2.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-neutral-300 hover:text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Shuffle size={14} className="text-amber-400" />
                  Case aléatoire
                </button>
              )}
            </div>

            {/* Active Round Odds Bar */}
            {isPlaying && (
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                <div className="flex items-center justify-between text-xs font-['Geist_Mono']">
                  <span className="text-neutral-400">Succès au prochain clic :</span>
                  <span className="font-bold text-emerald-400">{nextStepProb}%</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all duration-300"
                    style={{ width: `${nextStepProb}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-['Geist_Mono'] text-neutral-400">
                  <span>Prochaine cote : x{nextMultiplier.toFixed(2)}</span>
                  <span>Gain : {Math.floor(bet * nextMultiplier).toLocaleString('fr-FR')} 🪙</span>
                </div>
              </div>
            )}
          </div>

          {/* ------------------------------------------------------------ */}
          {/* COLUMN 2: 5x5 MINES GRID (5 cols)                            */}
          {/* ------------------------------------------------------------ */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="w-full relative deco-panel rounded-3xl p-5 sm:p-7 border border-amber-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
              {/* Corner Art-Deco Screws */}
              <span className="absolute top-3 left-3 w-2 h-2 rounded-full border border-amber-500/40 bg-amber-950/60" />
              <span className="absolute top-3 right-3 w-2 h-2 rounded-full border border-amber-500/40 bg-amber-950/60" />
              <span className="absolute bottom-3 left-3 w-2 h-2 rounded-full border border-amber-500/40 bg-amber-950/60" />
              <span className="absolute bottom-3 right-3 w-2 h-2 rounded-full border border-amber-500/40 bg-amber-950/60" />

              {/* Coordinates Header: A - E */}
              <div className="grid grid-cols-5 text-center text-[11px] font-['Geist_Mono'] text-amber-400/60 font-semibold mb-2.5 tracking-widest">
                <span>A</span>
                <span>B</span>
                <span>C</span>
                <span>D</span>
                <span>E</span>
              </div>

              {/* 5x5 Tiles Grid */}
              <div className="grid grid-cols-5 gap-2 sm:gap-3 aspect-square w-full">
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
                      whileHover={isPlaying && !isPicked ? { scale: 1.05 } : {}}
                      whileTap={isPlaying && !isPicked ? { scale: 0.95 } : {}}
                      className={`relative rounded-xl sm:rounded-2xl transition-all duration-300 flex items-center justify-center overflow-hidden select-none aspect-square focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                        !isGameOver
                          ? isPicked
                            ? 'bg-gradient-to-br from-emerald-950 via-neutral-900 to-emerald-900/70 border-2 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.4)] cursor-default'
                            : isPlaying
                              ? 'bg-gradient-to-br from-neutral-800 to-neutral-900 border border-white/15 hover:border-amber-400/70 hover:shadow-[0_0_20px_rgba(245,158,11,0.25)] cursor-pointer'
                              : 'bg-neutral-900/80 border border-white/10 opacity-75 cursor-default'
                          : isDetonated
                            ? 'bg-gradient-to-br from-red-600 via-neutral-950 to-red-950 border-2 border-red-500 shadow-[0_0_35px_rgba(239,68,68,0.7)] cursor-default'
                            : isPicked && !isMine
                              ? 'bg-gradient-to-br from-emerald-950 via-neutral-900 to-emerald-900/70 border-2 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.4)] cursor-default'
                              : isMine
                                ? 'bg-neutral-900/70 border border-red-500/30 opacity-60 cursor-default'
                                : 'bg-neutral-900/70 border border-emerald-500/20 opacity-40 cursor-default'
                      }`}
                      aria-label={`Case ${String.fromCharCode(65 + (idx % 5))}${Math.floor(idx / 5) + 1}`}
                    >
                      {/* Hidden State Tile Watermark */}
                      {!isPicked && !isGameOver && (
                        <div className="flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-white/15 text-[11px] font-['Geist_Mono'] font-bold">
                            {String.fromCharCode(65 + (idx % 5))}
                            {Math.floor(idx / 5) + 1}
                          </span>
                        </div>
                      )}

                      {/* Active Discovered Gem / Diamond */}
                      {isPicked && !isMine && (
                        <motion.div
                          initial={{ scale: 0, rotate: -45 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                          className="flex flex-col items-center justify-center text-emerald-400"
                        >
                          <Gem size={26} className="drop-shadow-[0_0_12px_rgba(16,185,129,0.8)] sm:w-8 sm:h-8" />
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
                          <Bomb size={26} className="drop-shadow-[0_0_15px_rgba(239,68,68,0.9)] animate-pulse sm:w-8 sm:h-8" />
                          <span className="text-[9px] font-bold font-['Geist_Mono'] text-red-400 mt-0.5">
                            BOOM
                          </span>
                        </motion.div>
                      )}

                      {/* Ghost Unpicked Mine revealed at game over */}
                      {isGameOver && !isPicked && isMine && (
                        <div className="flex flex-col items-center justify-center text-red-400/70">
                          <Bomb size={20} className="sm:w-6 sm:h-6" />
                          <span className="text-[8px] font-['Geist_Mono'] text-red-400/60 mt-0.5">Mine</span>
                        </div>
                      )}

                      {/* Ghost Unpicked Diamond revealed at game over */}
                      {isGameOver && !isPicked && !isMine && (
                        <div className="flex flex-col items-center justify-center text-emerald-400/50">
                          <Gem size={18} className="sm:w-5 sm:h-5" />
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* End of Game Result Toast Banner */}
              <AnimatePresence>
                {gameResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    className={`mt-4 p-4 rounded-2xl border text-center ${
                      gameResult === 'won'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-red-500/10 border-red-500/30 text-red-300'
                    }`}
                  >
                    {gameResult === 'won' && lastWin ? (
                      <div className="flex flex-col items-center justify-center">
                        <span className="font-['Geist_Mono'] text-xs uppercase tracking-[3px] text-emerald-400 font-bold flex items-center gap-1.5">
                          <Trophy size={16} />
                          {lastWin.reason === 'grand_slam'
                            ? 'GRAND CHELEM ! TOUS LES DIAMANTS RÉVÉLÉS !'
                            : lastWin.reason === 'auto'
                              ? 'AUTO-CASHOUT RÉUSSI !'
                              : 'CASHOUT RÉUSSI !'}
                        </span>
                        <span className="text-2xl sm:text-3xl font-bold font-['Geist_Mono'] text-white mt-1">
                          +{lastWin.amount.toLocaleString('fr-FR')} 🪙
                        </span>
                        <span className="text-xs text-emerald-400/90 mt-0.5 font-['Geist_Mono']">
                          Cote atteinte : x{lastWin.multiplier.toFixed(2)} · {lastWin.gemsCount} diamant(s) trouvé(s)
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center">
                        <span className="font-['Geist_Mono'] text-xs uppercase tracking-[3px] text-red-400 font-bold flex items-center gap-1.5">
                          <Flame size={16} /> DÉTONATION !
                        </span>
                        <span className="text-base sm:text-lg font-bold text-white mt-1">
                          Vous avez touché une mine
                        </span>
                        <span className="text-xs text-neutral-400 mt-0.5">
                          Mise de {bet.toLocaleString('fr-FR')} jetons perdue · {gemsCount} diamant(s) découvert(s) avant l'impact
                        </span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* COLUMN 3: MULTIPLIER ROADMAP & LIVE TELEMETRY (3 cols)       */}
          {/* ------------------------------------------------------------ */}
          <div className="lg:col-span-3 liquid-glass rounded-2xl p-5 border border-white/15 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span className="font-['Geist_Mono'] text-xs uppercase tracking-wider text-neutral-300 font-semibold flex items-center gap-1.5">
                <Trophy size={14} className="text-amber-400" />
                Échelle des cotes
              </span>
              <span className="text-[11px] font-['Geist_Mono'] text-neutral-400">
                {gemsCount} / {GRID_SIZE - minesCount}
              </span>
            </div>

            {/* Ladder list */}
            <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
              {ladder.slice(0, 10).map((item) => {
                const isCurrent = isPlaying && gemsCount === item.step;
                const isPassed = isPlaying && gemsCount > item.step;

                return (
                  <div
                    key={item.step}
                    className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-['Geist_Mono'] transition-all ${
                      isCurrent
                        ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-[0_0_20px_rgba(245,158,11,0.4)] scale-[1.02]'
                        : isPassed
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-semibold'
                          : 'bg-white/[0.02] border-white/5 text-neutral-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                          isCurrent
                            ? 'bg-black text-amber-400'
                            : isPassed
                              ? 'bg-emerald-500 text-black'
                              : 'bg-white/10 text-neutral-400'
                        }`}
                      >
                        {item.step}
                      </span>
                      <span>{item.step} diamants</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-bold">x{item.multiplier.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Provably fair seed indicator */}
            {boardData && (
              <div className="pt-3 border-t border-white/10 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-['Geist_Mono'] text-neutral-400">
                  <span className="flex items-center gap-1">
                    <ShieldCheck size={13} className="text-amber-400" /> Hash SHA-256
                  </span>
                  <button
                    type="button"
                    onClick={copyServerHash}
                    className="hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    {copiedHash ? 'Copié !' : <Copy size={11} />}
                  </button>
                </div>
                <div
                  className="font-['Geist_Mono'] text-[10px] text-neutral-400 truncate bg-black/40 p-1.5 rounded border border-white/10"
                  title={boardData.hash}
                >
                  {boardData.hash}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* TABS: STRATÉGIES VIDÉO, HISTORIQUE, ÉQUITÉ PROUVÉE, RÈGLES       */}
      {/* ================================================================ */}
      <section className="px-4 sm:px-6 pb-24 max-w-6xl mx-auto">
        <div className="liquid-glass rounded-3xl p-6 sm:p-8 border border-white/15">
          {/* Tab Headers */}
          <div className="flex flex-wrap items-center gap-2 pb-6 border-b border-white/10" role="tablist">
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
                className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === id
                    ? 'bg-amber-400 text-black shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                    : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* TAB 1: STRATÉGIES & ASTUCES VIDÉO */}
          {activeTab === 'strategies' && (
            <div className="pt-6 space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold font-['Instrument_Serif'] text-white">
                    Guide Stratégique du <em className="italic text-amber-400">Diamond Casino</em>
                  </h3>
                  <p className="text-neutral-400 text-xs sm:text-sm mt-1">
                    Inspiré des meilleures analyses de jeu : appliquez en 1 clic les réglages recommandés.
                  </p>
                </div>
                <span className="text-xs font-['Geist_Mono'] text-amber-400/90 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                  4 MÉTHODES VALIDÉES
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {STRATEGY_PRESETS.map((p) => (
                  <div
                    key={p.id}
                    className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-amber-400/40 transition-colors flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                          {p.badge}
                        </span>
                        <span className="text-[11px] font-['Geist_Mono'] text-neutral-400 uppercase">
                          Risque {p.riskLevel}
                        </span>
                      </div>
                      <h4 className="font-bold text-lg text-white mb-2">{p.name}</h4>
                      <p className="text-neutral-300 text-xs sm:text-sm leading-relaxed mb-3">
                        {p.description}
                      </p>
                      <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 text-[11px] font-['Geist_Mono'] text-amber-300/90 flex items-start gap-2">
                        <Info size={14} className="shrink-0 text-amber-400 mt-0.5" />
                        <span>{p.proTip}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isPlaying}
                      onClick={() => applyPreset(p)}
                      className="w-full py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-amber-400 hover:text-black font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      <ChevronRight size={14} />
                      Appliquer cette configuration ({p.mines} mines · Auto x{p.expectedMultiplier.toFixed(2)})
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: HISTORIQUE DES PARTIES */}
          {activeTab === 'history' && (
            <div className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold font-['Instrument_Serif'] text-white">
                  Historique de la session
                </h3>
                <span className="text-xs font-['Geist_Mono'] text-neutral-400">
                  {history.length} partie(s) enregistrée(s)
                </span>
              </div>

              {history.length === 0 ? (
                <div className="text-center py-12 text-neutral-500 text-sm">
                  Aucune partie jouée pour l’instant dans cette session.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-['Geist_Mono']">
                    <thead>
                      <tr className="border-b border-white/10 text-neutral-400 text-[10px] tracking-wider uppercase">
                        <th className="py-2.5 px-3">Heure</th>
                        <th className="py-2.5 px-3">Mode</th>
                        <th className="py-2.5 px-3">Mise</th>
                        <th className="py-2.5 px-3">Mines</th>
                        <th className="py-2.5 px-3">Diamants</th>
                        <th className="py-2.5 px-3">Multiplicateur</th>
                        <th className="py-2.5 px-3">Résultat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {history.map((h) => (
                        <tr key={h.id} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3 text-neutral-400">
                            {h.timestamp.toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                h.mode === 'real'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                  : 'bg-neutral-800 text-neutral-300'
                              }`}
                            >
                              {h.mode === 'real' ? 'RÉEL' : 'DÉMO'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">{h.bet.toLocaleString('fr-FR')} 🪙</td>
                          <td className="py-2.5 px-3 text-neutral-300">{h.mines}</td>
                          <td className="py-2.5 px-3 text-emerald-400">{h.gemsRevealed}</td>
                          <td className="py-2.5 px-3 font-bold text-white">x{h.multiplier.toFixed(2)}</td>
                          <td className="py-2.5 px-3">
                            {h.won ? (
                              <span className="text-emerald-400 font-bold flex items-center gap-1">
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
            <div className="pt-6 space-y-6">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold font-['Instrument_Serif'] text-white">
                  Équité Prouvée &amp; Cryptographie
                </h3>
                <p className="text-neutral-400 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
                  Au Diamond Casino, le tirage de chaque grille est généré et pré-engagé sous forme de hachage SHA-256
                  avant même que vous ne choisissiez votre première case. Le casino ne peut pas modifier l'emplacement
                  des bombes en cours de jeu.
                </p>
              </div>

              {boardData ? (
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-['Geist_Mono'] uppercase tracking-wider text-amber-400 font-semibold block">
                        Empreinte SHA-256 du tirage (Pré-engagée)
                      </span>
                      <button
                        type="button"
                        onClick={copyServerHash}
                        className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        {copiedHash ? 'Copié !' : <Copy size={12} />}
                      </button>
                    </div>
                    <div className="p-3 rounded-xl bg-black/60 border border-white/10 font-['Geist_Mono'] text-xs text-neutral-200 break-all select-all">
                      {boardData.hash}
                    </div>
                  </div>

                  {gameResult && (
                    <div className="space-y-1 pt-2 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-['Geist_Mono'] uppercase tracking-wider text-neutral-300 font-semibold block">
                          Graine Serveur révélée (post-partie)
                        </span>
                        <button
                          type="button"
                          onClick={copyServerSeed}
                          className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          {copiedSeed ? 'Copié !' : <Copy size={12} />}
                        </button>
                      </div>
                      <div className="p-3 rounded-xl bg-black/60 border border-white/10 font-['Geist_Mono'] text-xs text-emerald-300 break-all select-all">
                        {boardData.serverSeed}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      disabled={!gameResult}
                      onClick={handleVerifyFairness}
                      className="py-2.5 px-5 rounded-full bg-white text-black font-semibold text-xs flex items-center gap-2 hover:bg-neutral-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Shield size={14} />
                      Vérifier l’intégrité du tirage
                    </button>

                    {verifyStatus === 'verified' && (
                      <span className="text-xs font-['Geist_Mono'] text-emerald-400 flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 size={16} /> Tirage 100% conforme et vérifié (SHA-256 valide) !
                      </span>
                    )}
                    {verifyStatus === 'failed' && (
                      <span className="text-xs font-['Geist_Mono'] text-red-400 flex items-center gap-1.5 font-semibold">
                        <AlertTriangle size={16} /> Discordance détectée
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 text-center text-sm text-neutral-400">
                  Lancez une première partie pour inspecter la graine cryptographique et vérifier l’équité du tirage.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: RÈGLES DU JEU */}
          {activeTab === 'rules' && (
            <div className="pt-6 space-y-6">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold font-['Instrument_Serif'] text-white">
                  Règles &amp; Fonctionnement des Mines
                </h3>
                <p className="text-neutral-400 text-xs sm:text-sm mt-1">
                  Les règles officielles du jeu de mines au sein du Diamond Casino &amp; Resort.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
                  <span className="font-['Geist_Mono'] text-amber-400 font-bold text-xs uppercase tracking-wider block">
                    01 // La Grille 5x5
                  </span>
                  <p className="text-neutral-300 text-xs leading-relaxed">
                    25 dalles dissimulent des diamants et un nombre personnalisable de mines (de 1 à 24).
                    Plus vous configurez de mines, plus chaque diamant rapporte une cote colossale.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
                  <span className="font-['Geist_Mono'] text-amber-400 font-bold text-xs uppercase tracking-wider block">
                    02 // Le Choix du Cashout
                  </span>
                  <p className="text-neutral-300 text-xs leading-relaxed">
                    Dès le premier diamant révélé, vous pouvez cliquer sur <strong>ENCAISSER</strong> pour repartir
                    immédiatement avec votre mise multipliée. Si vous heurtez une mine, la mise est perdue.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
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
