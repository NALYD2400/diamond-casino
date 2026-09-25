import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Coins,
  Copy,
  Crown,
  Eye,
  Flame,
  HelpCircle,
  History,
  Info,
  Play,
  RotateCcw,
  Scale,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { useCasinoUser } from '../context/CasinoUserContext';
import { useCasinoAdmin } from '../context/CasinoAdminContext';
import {
  evaluateSlotSpin,
  PAYLINES_5X3,
  PAYLINES_3X3,
  PAYLINE_COLORS,
  sha256Hex,
  type SlotMachineConfig,
  type SlotPaylineWin,
  type SlotSpinResult,
  type SlotSymbolId,
} from './slots/slotsEngine';
import { SlotsAudio } from './slots/slotsAudio';
import { SlotIcon } from './slots/SlotIcons';

export interface SlotSpinHistoryEntry {
  id: string;
  timestamp: Date;
  machineId: string;
  machineName: string;
  bet: number;
  win: number;
  multiplier: number;
  isFreeSpin: boolean;
  won: boolean;
  hash: string;
}

export const SlotsGame: React.FC = () => {
  const { user, isAuthenticated, playSlotsRound } = useCasinoUser();
  const { slotMachines } = useCasinoAdmin();

  // Selected Machine from admin fleet
  const activeMachines = useMemo(() => {
    const list = slotMachines.filter((m) => m.enabled);
    return list.length > 0 ? list : slotMachines;
  }, [slotMachines]);

  const [selectedMachineId, setSelectedMachineId] = useState<string>(() => {
    return activeMachines[0]?.id || 'diamond-royale';
  });

  const machine: SlotMachineConfig = useMemo(() => {
    const found = activeMachines.find((m) => m.id === selectedMachineId);
    return found || activeMachines[0] || slotMachines[0];
  }, [activeMachines, selectedMachineId, slotMachines]);

  // Mode: Real RP chips vs Demo virtual chips
  const [mode, setMode] = useState<'real' | 'demo'>(() => {
    return isAuthenticated && user && user.chips > 0 ? 'real' : 'demo';
  });

  const [demoChips, setDemoChips] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('diamond_slots_demo_chips');
      return saved ? Number(saved) || 10000 : 10000;
    } catch {
      return 10000;
    }
  });

  // Audio Synthesizer
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('diamond_sound_muted') === 'true';
    } catch {
      return false;
    }
  });
  const audioRef = useRef<SlotsAudio>(new SlotsAudio());
  audioRef.current.muted = muted;

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    audioRef.current.muted = next;
    try {
      localStorage.setItem('diamond_sound_muted', String(next));
    } catch {}
  };

  // Wagering controls
  const [bet, setBet] = useState<number>(() => machine.defaultBet || 100);
  const [activePaylines, setActivePaylines] = useState<number>(() => machine.paylinesCount);
  const [isTurbo, setIsTurbo] = useState<boolean>(false);
  const [autoSpinsRemaining, setAutoSpinsRemaining] = useState<number>(0);
  const [autoSpinModalOpen, setAutoSpinModalOpen] = useState<boolean>(false);

  // Free Spins bonus mode state
  const [freeSpinsLeft, setFreeSpinsLeft] = useState<number>(0);
  const [freeSpinsTotalWon, setFreeSpinsTotalWon] = useState<number>(0);
  const [freeSpinsOriginalBet, setFreeSpinsOriginalBet] = useState<number>(100);

  // Active Grid Display State (reels x rows)
  const [displayGrid, setDisplayGrid] = useState<SlotSymbolId[][]>(() => {
    // Default initial grid
    const cols = machine.reelsCount;
    const initial: SlotSymbolId[][] = [];
    const pool = machine.symbols.map((s) => s.id);
    for (let r = 0; r < cols; r++) {
      initial.push([
        pool[(r * 3 + 0) % pool.length],
        pool[(r * 3 + 1) % pool.length],
        pool[(r * 3 + 2) % pool.length],
      ]);
    }
    return initial;
  });

  // Reel Animation & Physics States
  const [spinningReels, setSpinningReels] = useState<boolean[]>(() =>
    new Array(machine.reelsCount).fill(false),
  );
  const [anticipationReels, setAnticipationReels] = useState<boolean[]>(() =>
    new Array(machine.reelsCount).fill(false),
  );
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [lastSpinResult, setLastSpinResult] = useState<SlotSpinResult | null>(null);
  const [celebrationWin, setCelebrationWin] = useState<{
    tier: 'big' | 'mega' | 'jackpot';
    amount: number;
    multiplier: number;
  } | null>(null);

  // Active winning line cycle for highlighting
  const [activeWinLineIdx, setActiveWinLineIdx] = useState<number>(-1);
  const [history, setHistory] = useState<SlotSpinHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'paytable' | 'paylines' | 'history' | 'fairness'>('paytable');

  // Provably Fair verify states
  const [copiedHash, setCopiedHash] = useState(false);
  const [clientSeed, setClientSeed] = useState<string>('diamond-player-seed');

  // Keep bet within machine limits when switching machines
  useEffect(() => {
    setBet((prev) => Math.max(machine.minBet, Math.min(machine.maxBet, prev)));
    setActivePaylines(machine.paylinesCount);
  }, [machine]);

  // Balance helper
  const currentChips = mode === 'real' ? (user ? user.chips : 0) : demoChips;

  // Cycle through winning lines when spin is finished
  useEffect(() => {
    if (!lastSpinResult || isSpinning || lastSpinResult.winningLines.length <= 1) {
      setActiveWinLineIdx(-1);
      return;
    }
    let idx = 0;
    setActiveWinLineIdx(0);
    const interval = setInterval(() => {
      idx = (idx + 1) % lastSpinResult.winningLines.length;
      setActiveWinLineIdx(idx);
    }, 1800);
    return () => clearInterval(interval);
  }, [lastSpinResult, isSpinning]);

  // Main Spin Execution Routine
  const executeSpin = useCallback(async () => {
    if (isSpinning) return;
    audioRef.current.unlock();

    const isFree = freeSpinsLeft > 0;
    const effectiveBet = isFree ? freeSpinsOriginalBet : bet;

    // Check funds
    if (!isFree) {
      if (mode === 'real') {
        if (!user || user.chips < effectiveBet) {
          alert('Solde de jetons insuffisant.');
          setAutoSpinsRemaining(0);
          return;
        }
      } else {
        if (demoChips < effectiveBet) {
          alert('Solde démo insuffisant. Réinitialisez votre solde virtuel.');
          setAutoSpinsRemaining(0);
          return;
        }
      }
    }

    setIsSpinning(true);
    setCelebrationWin(null);
    setActiveWinLineIdx(-1);
    audioRef.current.spinStart();

    // Start spinning all reels
    const reelsCount = machine.reelsCount;
    setSpinningReels(new Array(reelsCount).fill(true));
    setAnticipationReels(new Array(reelsCount).fill(false));

    // Roll result mathematically using Provably Fair logic
    const nonce = Date.now();
    const result = evaluateSlotSpin({
      machine,
      bet: effectiveBet,
      activePaylinesCount: activePaylines,
      isFreeSpin: isFree,
      clientSeed,
      nonce,
    });

    // Check anticipation (if 2 scatters appear in the first reels)
    let earlyScatters = 0;
    const anticipationFlags = new Array(reelsCount).fill(false);
    for (let r = 0; r < reelsCount; r++) {
      const hasScatter = result.grid[r].some(
        (symId) => machine.symbols.find((s) => s.id === symId)?.isScatter,
      );
      if (hasScatter) earlyScatters++;
      if (earlyScatters >= 2 && r < reelsCount - 1) {
        anticipationFlags[r + 1] = true;
      }
    }

    // Schedule reel stops with physics timing
    const baseStopDelay = isTurbo ? 220 : 420;
    const reelStagger = isTurbo ? 140 : 260;

    for (let r = 0; r < reelsCount; r++) {
      const isAnticipating = anticipationFlags[r];
      const stopTime =
        baseStopDelay +
        r * reelStagger +
        (isAnticipating ? 450 : 0);

      setTimeout(() => {
        setDisplayGrid((prev) => {
          const next = [...prev];
          next[r] = result.grid[r];
          return next;
        });

        setSpinningReels((prev) => {
          const next = [...prev];
          next[r] = false;
          return next;
        });

        const hasScatterInReel = result.grid[r].some(
          (symId) => machine.symbols.find((s) => s.id === symId)?.isScatter,
        );
        audioRef.current.reelStop(r, hasScatterInReel);

        if (r < reelsCount - 1 && anticipationFlags[r + 1]) {
          setAnticipationReels((prev) => {
            const next = [...prev];
            next[r + 1] = true;
            return next;
          });
          audioRef.current.anticipation();
        }

        // Final reel stopped: evaluate results and apply balance
        if (r === reelsCount - 1) {
          setIsSpinning(false);
          setLastSpinResult(result);

          // Audio win cues
          if (result.winTier === 'jackpot') {
            audioRef.current.jackpotFanfare();
            setCelebrationWin({ tier: 'jackpot', amount: result.totalWin, multiplier: result.totalMultiplier });
          } else if (result.winTier === 'mega') {
            audioRef.current.jackpotFanfare();
            setCelebrationWin({ tier: 'mega', amount: result.totalWin, multiplier: result.totalMultiplier });
          } else if (result.winTier === 'big') {
            audioRef.current.winLine('big');
            setCelebrationWin({ tier: 'big', amount: result.totalWin, multiplier: result.totalMultiplier });
          } else if (result.winTier === 'medium') {
            audioRef.current.winLine('medium');
          } else if (result.totalWin > 0) {
            audioRef.current.winLine('small');
          }

          // Balance update
          if (mode === 'real') {
            void playSlotsRound({
              machineName: machine.name,
              bet: effectiveBet,
              win: result.totalWin,
              multiplier: result.totalMultiplier,
              isFreeSpin: isFree,
            });
          } else {
            const net = result.totalWin - (isFree ? 0 : effectiveBet);
            setDemoChips((prev) => {
              const next = Math.max(0, prev + net);
              try {
                localStorage.setItem('diamond_slots_demo_chips', String(next));
              } catch {}
              return next;
            });
          }

          // Free spins triggers & decrements
          if (result.triggeredFreeSpins > 0) {
            setFreeSpinsLeft((prev) => prev + result.triggeredFreeSpins);
            if (!isFree) setFreeSpinsOriginalBet(bet);
          } else if (isFree) {
            setFreeSpinsLeft((prev) => Math.max(0, prev - 1));
            setFreeSpinsTotalWon((prev) => prev + result.totalWin);
          }

          // History record
          const entry: SlotSpinHistoryEntry = {
            id: `spin_${Date.now()}`,
            timestamp: new Date(),
            machineId: machine.id,
            machineName: machine.name,
            bet: effectiveBet,
            win: result.totalWin,
            multiplier: result.totalMultiplier,
            isFreeSpin: isFree,
            won: result.totalWin > 0,
            hash: result.hash,
          };
          setHistory((prev) => [entry, ...prev.slice(0, 49)]);

          // Stop auto-spins on big wins
          if (result.winTier === 'big' || result.winTier === 'mega' || result.winTier === 'jackpot') {
            setAutoSpinsRemaining(0);
          }
        }
      }, stopTime);
    }
  }, [
    isSpinning,
    freeSpinsLeft,
    freeSpinsOriginalBet,
    bet,
    mode,
    user,
    demoChips,
    machine,
    activePaylines,
    clientSeed,
    isTurbo,
    playSlotsRound,
  ]);

  // Auto-Spin Trigger
  useEffect(() => {
    if (autoSpinsRemaining > 0 && !isSpinning && !celebrationWin) {
      const timer = setTimeout(() => {
        setAutoSpinsRemaining((prev) => prev - 1);
        void executeSpin();
      }, isTurbo ? 400 : 900);
      return () => clearTimeout(timer);
    }
  }, [autoSpinsRemaining, isSpinning, celebrationWin, isTurbo, executeSpin]);

  // Spacebar quick spin shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          void executeSpin();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [executeSpin]);

  // Active Payline Geometry coordinates helper for SVG drawing
  const getCellCenter = (reelIdx: number, rowIdx: number) => {
    const reelsCount = machine.reelsCount;
    const xPct = ((reelIdx + 0.5) / reelsCount) * 100;
    const yPct = ((rowIdx + 0.5) / 3) * 100;
    return { xPct, yPct };
  };

  // Winning lines to draw
  const activeLine =
    lastSpinResult && activeWinLineIdx >= 0
      ? lastSpinResult.winningLines[activeWinLineIdx]
      : null;

  return (
    <div className="relative min-h-screen bg-black text-white selection:bg-amber-400 selection:text-black font-sans pb-24">
      {/* Background Hall Atmosphere */}
      <div
        className="fixed inset-0 bg-cover bg-center opacity-10 grayscale pointer-events-none"
        style={{ backgroundImage: "url('/diamond_casino_hall.jpg')" }}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 bg-gradient-to-b from-black/80 via-black/95 to-black pointer-events-none"
        aria-hidden="true"
      />

      {/* Top Header Navigation (Spaced cleanly below fixed global Navbar) */}
      <header className="relative z-20 pt-28 sm:pt-32 pb-4 px-4 sm:px-8 max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/jeux"
          className="flex items-center gap-2 text-xs font-semibold text-neutral-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2 rounded-xl backdrop-blur-md"
        >
          <ArrowLeft size={14} />
          <span>Catalogue Jeux</span>
        </Link>

        {/* Machine Selector Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-black/60 border border-white/10 rounded-2xl backdrop-blur-xl overflow-x-auto max-w-full scrollbar-none">
          {activeMachines.map((m) => {
            const isSelected = m.id === machine.id;
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (!isSpinning) setSelectedMachineId(m.id);
                }}
                disabled={isSpinning}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? 'bg-amber-400 text-black font-bold shadow-[0_0_15px_rgba(251,191,36,0.35)]'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>{m.name}</span>
                <span className="text-[10px] font-mono px-1 rounded bg-black/20">
                  {m.reelsCount}x3
                </span>
              </button>
            );
          })}
        </div>

        {/* Audio & Settings Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-neutral-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            title={muted ? 'Activer le son' : 'Couper le son'}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          {user?.isStaff && (
            <Link
              to="/admin"
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer"
              title="Configurer les machines dans l'admin"
            >
              <Settings size={16} />
            </Link>
          )}
        </div>
      </header>

      {/* Main Game Container */}
      <main className="relative z-10 pt-2 px-4 sm:px-6 max-w-6xl mx-auto">
        {/* Machine Identity Banner */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] font-mono font-bold mb-2 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
            <Sparkles size={12} className="text-amber-400" />
            <span>{machine.tagline}</span>
            <span className="text-neutral-400">·</span>
            <span>RTP {machine.rtpTarget}%</span>
            <span className="text-neutral-400">·</span>
            <span className="text-amber-400 uppercase">{machine.volatility}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white flex items-center justify-center gap-3">
            <span>{machine.name}</span>
            {machine.jackpotEnabled && (
              <span className="text-xs sm:text-sm font-['Geist_Mono'] font-bold px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)]">
                JACKPOT {(machine.jackpotPool).toLocaleString('fr-FR')} 🪙
              </span>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">{machine.subtitle}</p>
        </div>

        {/* Currency Switcher & Balance Bar */}
        <div className="mb-6 p-3.5 rounded-2xl liquid-glass border border-white/10 bg-white/[0.02] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-black/60 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setMode('real')}
              disabled={isSpinning || !isAuthenticated}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                mode === 'real'
                  ? 'bg-amber-400 text-black shadow-[0_0_12px_rgba(251,191,36,0.4)]'
                  : 'text-neutral-400 hover:text-white'
              } ${!isAuthenticated ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Coins size={13} />
              <span>Jetons RP Casino</span>
            </button>
            <button
              onClick={() => setMode('demo')}
              disabled={isSpinning}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                mode === 'demo'
                  ? 'bg-white text-black shadow-[0_0_12px_rgba(255,255,255,0.3)]'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <span>Mode Démo Virtuel</span>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-[10px] uppercase font-['Geist_Mono'] text-neutral-400 tracking-wider">
                Solde {mode === 'real' ? 'RP' : 'Démo'}
              </span>
              <div className="text-lg sm:text-xl font-bold font-['Geist_Mono'] text-amber-400 flex items-center gap-1.5 justify-end">
                <Coins size={18} className="text-amber-400" />
                <span>{currentChips.toLocaleString('fr-FR')}</span>
                <span className="text-xs text-neutral-400 font-normal">jetons</span>
              </div>
            </div>

            {mode === 'demo' && (
              <button
                onClick={() => {
                  setDemoChips(10000);
                  try {
                    localStorage.setItem('diamond_slots_demo_chips', '10000');
                  } catch {}
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 text-[11px] font-mono transition-all cursor-pointer"
                title="Recharger 10 000 jetons démo"
              >
                Recharger
              </button>
            )}
          </div>
        </div>

        {/* Free Spins Alert Banner */}
        <AnimatePresence>
          {freeSpinsLeft > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 p-3 rounded-2xl bg-gradient-to-r from-amber-500/20 via-sky-500/20 to-amber-500/20 border border-amber-500/40 shadow-[0_0_25px_rgba(245,158,11,0.25)] flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles size={18} className="text-amber-400 animate-spin" />
                <span className="text-sm font-bold text-white tracking-wide uppercase">
                  Tours Gratuits en cours :{' '}
                  <strong className="text-amber-300">{freeSpinsLeft} restants</strong>
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-400 text-black font-bold">
                  MULTIPLICATEUR x{machine.freeSpinsMultiplier}
                </span>
              </div>
              <div className="text-xs font-mono font-semibold text-amber-300">
                Gains Bonus : +{freeSpinsTotalWon.toLocaleString('fr-FR')} 🪙
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ========================================================================= */}
        {/* REELS VIEWPORT (60 FPS Physical Machine Display)                          */}
        {/* ========================================================================= */}
        <div className="relative rounded-3xl border-2 border-white/15 bg-gradient-to-b from-[#111113] via-[#08080a] to-[#040405] p-3 sm:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.2)] overflow-hidden">
          {/* Top Marquee Lighting */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-amber-400/80 to-transparent pointer-events-none" />

          {/* Grid Container */}
          <div
            className="relative grid gap-2 sm:gap-3 rounded-2xl bg-black/80 border border-white/10 p-2 sm:p-4 overflow-hidden"
            style={{
              gridTemplateColumns: `repeat(${machine.reelsCount}, minmax(0, 1fr))`,
            }}
          >
            {displayGrid.map((reelSymbols, reelIdx) => {
              const isSpinningReel = spinningReels[reelIdx];
              const isAnticipating = anticipationReels[reelIdx];

              return (
                <div
                  key={reelIdx}
                  className={`relative flex flex-col gap-2 sm:gap-3 rounded-xl bg-gradient-to-b from-white/[0.04] to-transparent p-1 sm:p-2 border transition-colors duration-300 overflow-hidden ${
                    isAnticipating
                      ? 'border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.4)] animate-pulse'
                      : 'border-white/5'
                  }`}
                >
                  {/* Reel Spin Blur Mask Animation */}
                  {isSpinningReel && (
                    <motion.div
                      animate={{ y: ['-50%', '0%'] }}
                      transition={{ duration: 0.15, repeat: Infinity, ease: 'linear' }}
                      className="absolute inset-0 z-20 pointer-events-none bg-gradient-to-b from-transparent via-white/10 to-transparent opacity-60 backdrop-blur-[2px]"
                    />
                  )}

                  {reelSymbols.map((symId, rowIdx) => {
                    const isWinningCell = activeLine?.positions.some(
                      ([r, row]) => r === reelIdx && row === rowIdx,
                    );
                    const wildMultiplier =
                      lastSpinResult?.wildMultipliers?.[reelIdx]?.[rowIdx] || 1;

                    return (
                      <div
                        key={rowIdx}
                        className={`relative h-20 sm:h-28 rounded-xl flex items-center justify-center border transition-all duration-300 ${
                          isWinningCell
                            ? 'bg-amber-500/20 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.5)] z-10 scale-[1.03]'
                            : 'bg-white/[0.02] border-white/5'
                        }`}
                      >
                        <SlotIcon
                          id={symId}
                          className="w-12 h-12 sm:w-16 sm:h-16"
                          isWinning={isWinningCell}
                          wildMultiplier={wildMultiplier}
                        />

                        {/* Winning Tile Glow Pulsar */}
                        {isWinningCell && (
                          <div className="absolute inset-0 rounded-xl border-2 border-amber-400 animate-ping opacity-30 pointer-events-none" />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* SVG Payline Trace Overlay */}
            {activeLine && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none z-30"
                style={{ overflow: 'visible' }}
              >
                <defs>
                  <filter id="glowLaser" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <polyline
                  points={activeLine.positions
                    .map(([r, row]) => {
                      const { xPct, yPct } = getCellCenter(r, row);
                      return `${xPct}%,${yPct}%`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke={PAYLINE_COLORS[activeLine.lineIndex % PAYLINE_COLORS.length] || '#fbbf24'}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#glowLaser)"
                />
              </svg>
            )}
          </div>

          {/* Active Win Line Information Callout */}
          <div className="h-10 mt-3 flex items-center justify-center">
            {activeLine ? (
              <motion.div
                key={activeWinLineIdx}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 text-xs sm:text-sm font-['Geist_Mono'] font-bold shadow-[0_0_15px_rgba(251,191,36,0.35)] flex items-center gap-2"
              >
                <Trophy size={14} className="text-amber-400" />
                <span>
                  {activeLine.lineIndex >= 0 ? `LIGNE #${activeLine.lineIndex + 1}` : 'SCATTER BONUS'}:{' '}
                  +{activeLine.winAmount.toLocaleString('fr-FR')} JETONS (x{activeLine.multiplier})
                </span>
              </motion.div>
            ) : lastSpinResult && lastSpinResult.totalWin > 0 ? (
              <span className="text-xs sm:text-sm font-['Geist_Mono'] font-semibold text-emerald-400 flex items-center gap-2">
                <CheckCircle2 size={15} />
                <span>
                  GAIN TOTAL : +{lastSpinResult.totalWin.toLocaleString('fr-FR')} JETONS (x
                  {lastSpinResult.totalMultiplier})
                </span>
              </span>
            ) : isSpinning ? (
              <span className="text-xs font-mono text-neutral-500 animate-pulse tracking-widest uppercase">
                TIRAGE EN COURS...
              </span>
            ) : (
              <span className="text-xs font-mono text-neutral-500 tracking-wider">
                Appuyez sur ESPACE ou TOURNER pour lancer
              </span>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PLAYER CONTROLS DOCK                                                      */}
        {/* ========================================================================= */}
        <div className="mt-6 p-4 sm:p-5 rounded-3xl liquid-glass border border-white/10 bg-white/[0.02] flex flex-col md:flex-row items-center justify-between gap-5">
          {/* Bet Selector Controls */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <span className="text-[11px] font-mono text-neutral-400 uppercase font-semibold mr-1">
              Mise :
            </span>

            {/* Decrement & Increment */}
            <div className="flex items-center bg-black/60 rounded-xl border border-white/10 p-1">
              <button
                onClick={() => setBet((b) => Math.max(machine.minBet, b - 50))}
                disabled={isSpinning || bet <= machine.minBet}
                className="px-2.5 py-1 text-xs font-mono font-bold text-neutral-400 hover:text-white transition-colors cursor-pointer disabled:opacity-30"
              >
                -
              </button>
              <span className="px-3 text-sm font-bold font-['Geist_Mono'] text-amber-400 min-w-16 text-center">
                {bet.toLocaleString('fr-FR')}
              </span>
              <button
                onClick={() => setBet((b) => Math.min(machine.maxBet, b + 50))}
                disabled={isSpinning || bet >= machine.maxBet}
                className="px-2.5 py-1 text-xs font-mono font-bold text-neutral-400 hover:text-white transition-colors cursor-pointer disabled:opacity-30"
              >
                +
              </button>
            </div>

            {/* Quick multi buttons */}
            <button
              onClick={() => setBet((b) => Math.max(machine.minBet, Math.floor(b / 2)))}
              disabled={isSpinning}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-mono text-neutral-300 cursor-pointer"
            >
              1/2
            </button>
            <button
              onClick={() => setBet((b) => Math.min(machine.maxBet, b * 2))}
              disabled={isSpinning}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-mono text-neutral-300 cursor-pointer"
            >
              2X
            </button>
            <button
              onClick={() => setBet(machine.maxBet)}
              disabled={isSpinning}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-[11px] font-mono font-bold text-amber-300 cursor-pointer"
            >
              MAX
            </button>

            {/* Active Paylines Selector */}
            {machine.reelsCount === 5 && (
              <div className="flex items-center gap-1 ml-2">
                <span className="text-[10px] font-mono text-neutral-500 uppercase mr-1">Lignes:</span>
                {[5, 10, 20].map((lines) => (
                  <button
                    key={lines}
                    onClick={() => setActivePaylines(lines)}
                    disabled={isSpinning}
                    className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold transition-all cursor-pointer ${
                      activePaylines === lines
                        ? 'bg-white text-black font-bold'
                        : 'bg-white/5 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {lines}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action Spin & Auto Buttons */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            {/* Turbo Mode Switch */}
            <button
              onClick={() => setIsTurbo((t) => !t)}
              className={`px-3 py-2.5 rounded-2xl text-xs font-bold font-mono transition-all cursor-pointer flex items-center gap-1.5 border ${
                isTurbo
                  ? 'bg-amber-400/20 text-amber-300 border-amber-400/50 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                  : 'bg-white/5 text-neutral-400 border-white/10 hover:text-white'
              }`}
              title="Accélérer la rotation des rouleaux"
            >
              <Zap size={14} className={isTurbo ? 'text-amber-400 fill-amber-400' : ''} />
              <span>TURBO</span>
            </button>

            {/* Auto Spin Button */}
            {autoSpinsRemaining > 0 ? (
              <button
                onClick={() => setAutoSpinsRemaining(0)}
                className="px-4 py-2.5 rounded-2xl text-xs font-bold font-mono bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 transition-all cursor-pointer animate-pulse"
              >
                STOP AUTO ({autoSpinsRemaining})
              </button>
            ) : (
              <button
                onClick={() => setAutoSpinModalOpen(true)}
                disabled={isSpinning}
                className="px-4 py-2.5 rounded-2xl text-xs font-bold font-mono bg-white/5 text-neutral-300 border border-white/10 hover:text-white hover:bg-white/10 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw size={14} />
                <span>AUTO</span>
              </button>
            )}

            {/* Main Spin Button */}
            <button
              onClick={() => void executeSpin()}
              disabled={isSpinning}
              className={`px-8 py-3.5 rounded-2xl text-sm font-bold tracking-wide transition-all cursor-pointer flex items-center gap-2.5 shadow-[0_0_25px_rgba(251,191,36,0.4)] ${
                isSpinning
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black hover:scale-105 active:scale-95'
              }`}
            >
              <Play size={16} fill="currentColor" />
              <span>{isSpinning ? 'EN ROTATION...' : 'TOURNER'}</span>
            </button>
          </div>
        </div>

        {/* Auto-Spin Setup Modal */}
        <AnimatePresence>
          {autoSpinModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm rounded-3xl border border-white/15 bg-neutral-950 p-6 shadow-2xl text-center"
              >
                <h3 className="text-lg font-bold text-white mb-2">Lancer les Tours Automatiques</h3>
                <p className="text-xs text-neutral-400 mb-6">
                  Choisissez le nombre de lancers consécutifs. Le mode s'interrompt automatiquement en cas de Big Win ou de Tours Gratuits.
                </p>

                <div className="grid grid-cols-4 gap-2.5 mb-6">
                  {[10, 25, 50, 100].map((count) => (
                    <button
                      key={count}
                      onClick={() => {
                        setAutoSpinsRemaining(count);
                        setAutoSpinModalOpen(false);
                      }}
                      className="py-3 rounded-xl bg-white/5 hover:bg-amber-400 hover:text-black border border-white/10 font-['Geist_Mono'] font-bold text-sm text-white transition-all cursor-pointer"
                    >
                      {count}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setAutoSpinModalOpen(false)}
                  className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-300 text-xs font-semibold cursor-pointer"
                >
                  Annuler
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Big Win / Mega Win / Jackpot Celebration Overlay */}
        <AnimatePresence>
          {celebrationWin && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCelebrationWin(null)}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg cursor-pointer"
            >
              <motion.div
                initial={{ scale: 0.7, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.8, y: 30 }}
                className="relative max-w-md w-full p-8 rounded-3xl border border-amber-400/60 bg-gradient-to-b from-[#1c1917] to-black text-center shadow-[0_0_80px_rgba(251,191,36,0.4)]"
              >
                <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300 mb-4 shadow-[0_0_30px_rgba(251,191,36,0.5)] animate-bounce">
                  <Crown size={40} />
                </div>

                <span className="text-xs font-mono uppercase tracking-[4px] text-amber-400 font-bold block mb-1">
                  {celebrationWin.tier === 'jackpot'
                    ? '★ LE GRAND JACKPOT ★'
                    : celebrationWin.tier === 'mega'
                      ? '★ MEGA WIN D’OR ★'
                      : '★ BIG WIN ★'}
                </span>

                <h2 className="text-4xl sm:text-5xl font-black font-['Geist_Mono'] text-white my-3 text-amber-300">
                  +{celebrationWin.amount.toLocaleString('fr-FR')}
                </h2>

                <p className="text-sm font-mono text-neutral-400 mb-6">
                  Multiplicateur exceptionnel de{' '}
                  <strong className="text-amber-400">x{celebrationWin.multiplier}</strong>
                </p>

                <button className="px-6 py-2.5 rounded-full bg-amber-400 text-black font-bold text-xs shadow-[0_0_20px_rgba(251,191,36,0.4)] cursor-pointer">
                  ENCAISSER & CONTINUER
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ========================================================================= */}
        {/* LOWER INFORMATION & RULES TABS DOCK                                       */}
        {/* ========================================================================= */}
        <div className="mt-12 rounded-3xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl">
          {/* Tab Headers */}
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-4 mb-6">
            {[
              { id: 'paytable', label: 'Table des Gains (Paytable)', icon: Info },
              { id: 'paylines', label: 'Schéma des 20 Lignes', icon: HelpCircle },
              { id: 'history', label: 'Historique des Tours', icon: History },
              { id: 'fairness', label: 'Provably Fair SHA-256', icon: ShieldCheck },
            ].map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as typeof activeTab)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                    isActive
                      ? 'bg-white text-black font-bold shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon size={14} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: DYNAMIC PAYTABLE */}
          {activeTab === 'paytable' && (
            <div>
              <p className="text-xs text-neutral-400 mb-4">
                Paiements configurés pour <strong className="text-white">{machine.name}</strong>. Les multiplicateurs indiqués s'appliquent à la mise par ligne (ou à la mise totale pour le Scatter).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {machine.symbols.map((sym) => (
                  <div
                    key={sym.id}
                    className="p-3.5 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center p-1 shrink-0">
                        <SlotIcon id={sym.id} className="w-8 h-8" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>{sym.name}</span>
                          {sym.isWild && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                              WILD
                            </span>
                          )}
                          {sym.isScatter && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-sky-500/20 text-sky-300 font-bold">
                              SCATTER
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-neutral-500">
                          Poids {sym.weight}
                        </span>
                      </div>
                    </div>

                    <div className="text-right text-xs font-mono">
                      {machine.reelsCount === 5 ? (
                        <>
                          <div className="text-neutral-400">
                            5x : <strong className="text-amber-400">{sym.payout5}x</strong>
                          </div>
                          <div className="text-neutral-400">
                            4x : <strong className="text-white">{sym.payout4}x</strong>
                          </div>
                          <div className="text-neutral-500">
                            3x : <strong className="text-neutral-300">{sym.payout3}x</strong>
                          </div>
                        </>
                      ) : (
                        <div className="text-neutral-300">
                          3x : <strong className="text-amber-400 text-sm">{sym.payout3}x</strong>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: PAYLINES DIAGRAM */}
          {activeTab === 'paylines' && (
            <div>
              <p className="text-xs text-neutral-400 mb-4">
                Représentation schématique des {machine.reelsCount === 5 ? '20' : '5'} lignes de paiement actives de gauche à droite.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {(machine.reelsCount === 5 ? PAYLINES_5X3 : PAYLINES_3X3).map((lineRows, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-black/50 border border-white/5 flex flex-col items-center gap-2"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-neutral-300">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: PAYLINE_COLORS[idx % PAYLINE_COLORS.length] }}
                      />
                      <span>Ligne #{idx + 1}</span>
                    </div>

                    {/* Mini visual grid */}
                    <div className="grid grid-rows-3 gap-1 bg-neutral-950 p-1.5 rounded-lg border border-white/10">
                      {[0, 1, 2].map((row) => (
                        <div key={row} className="flex gap-1">
                          {lineRows.map((activeRow, reel) => (
                            <span
                              key={reel}
                              className={`w-3.5 h-3 rounded-sm ${
                                activeRow === row
                                  ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                                  : 'bg-white/10'
                              }`}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: HISTORY */}
          {activeTab === 'history' && (
            <div>
              {history.length === 0 ? (
                <p className="text-xs font-mono text-neutral-500 text-center py-8">
                  Aucun tour joué durant cette session.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-white/10 text-neutral-400 pb-2">
                        <th className="py-2">Heure</th>
                        <th className="py-2">Machine</th>
                        <th className="py-2">Mise</th>
                        <th className="py-2">Multiplicateur</th>
                        <th className="py-2">Gain</th>
                        <th className="py-2">Hash SHA-256</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {history.map((entry) => (
                        <tr key={entry.id} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 text-neutral-400">
                            {entry.timestamp.toLocaleTimeString('fr-FR')}
                          </td>
                          <td className="py-2.5 text-white">{entry.machineName}</td>
                          <td className="py-2.5 text-neutral-300">
                            {entry.bet.toLocaleString('fr-FR')} 🪙
                          </td>
                          <td className="py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded font-bold ${
                                entry.multiplier >= 15
                                  ? 'bg-amber-400 text-black'
                                  : entry.multiplier > 0
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'text-neutral-500'
                              }`}
                            >
                              x{entry.multiplier}
                            </span>
                          </td>
                          <td className="py-2.5">
                            <span
                              className={`font-bold ${
                                entry.win > 0 ? 'text-amber-400' : 'text-neutral-500'
                              }`}
                            >
                              {entry.win > 0 ? `+${entry.win.toLocaleString('fr-FR')} 🪙` : '0'}
                            </span>
                          </td>
                          <td className="py-2.5 text-[10px] text-neutral-500 truncate max-w-xs font-mono">
                            {entry.hash}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PROVABLY FAIR */}
          {activeTab === 'fairness' && (
            <div className="max-w-xl mx-auto space-y-4">
              <p className="text-xs text-neutral-300 leading-relaxed">
                Le moteur Diamond Slots utilise une cryptographie transparente <strong>Provably Fair (SHA-256)</strong>. Chaque résultat découle de la combinaison immuable de la graine serveur, de votre graine client et du nonce séquentiel.
              </p>

              <div>
                <label className="text-[11px] font-mono text-neutral-400 block mb-1">
                  Votre graine client (Client Seed personnalisable) :
                </label>
                <input
                  type="text"
                  value={clientSeed}
                  onChange={(e) => setClientSeed(e.target.value)}
                  disabled={isSpinning}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-white/15 text-xs font-mono text-amber-400 focus:outline-none focus:border-amber-400"
                />
              </div>

              {lastSpinResult && (
                <div className="p-3.5 rounded-xl bg-black/60 border border-white/10 space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Empreinte SHA-256 du dernier spin :</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(lastSpinResult.hash);
                        setCopiedHash(true);
                        setTimeout(() => setCopiedHash(false), 2000);
                      }}
                      className="text-amber-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      <Copy size={12} />
                      <span>{copiedHash ? 'Copié' : 'Copier'}</span>
                    </button>
                  </div>
                  <div className="break-all text-[11px] text-white p-2 rounded bg-white/5 border border-white/5">
                    {lastSpinResult.hash}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
