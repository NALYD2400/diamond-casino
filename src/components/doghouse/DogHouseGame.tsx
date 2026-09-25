import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Info,
  Minus,
  Plus,
  RefreshCw,
  Settings,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { useCasinoUser } from '../../context/CasinoUserContext';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import { SlotsAudio } from '../slots/slotsAudio';
import { DogSymbol } from './DogSymbols';
import {
  BONUS_BUY_X_BET,
  DOG_PAYLINES,
  DOG_SYMBOLS,
  MAX_WIN_X_BET,
  PAYING_SYMBOLS,
  SCATTER_PAY_X_BET,
  evaluateDogHouseSpin,
  getWinTier,
  randomStripSymbol,
  rollFreeSpinsGrid,
  type DogLineWin,
  type DogSpinResult,
  type DogSymbolId,
  type StickyWild,
} from './dogHouseEngine';

const BET_LEVELS = [
  20, 40, 60, 100, 200, 400, 600, 1000, 2000, 4000, 6000, 10000, 20000, 40000, 60000, 100000, 200000,
  500000,
];
const LINE_COLORS = [
  '#ffe14a', '#4ad9ff', '#7dff5a', '#ff5ab4', '#ff9a3c', '#b67dff', '#5affd6', '#ff5a5a', '#fff', '#5a9dff',
  '#ffd35a', '#c6ff5a', '#ff7de0', '#5affa0', '#ffb35a', '#9d9dff', '#ff5a8a', '#5ae1ff', '#e1ff5a', '#ffa0a0',
];
const STRIP_LEN = 12;
const DEMO_KEY = 'diamond_doghouse_demo_chips';
const DEMO_START = 50000;

const INITIAL_GRID: DogSymbolId[][] = [
  ['Q', 'A', 'bone'],
  ['Q', 'J', 'shihtzu'],
  ['collar', 'K', 'A'],
  ['wild', 'J', '10'],
  ['scatter', 'J', 'Q'],
];

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

type Phase = 'idle' | 'spinning' | 'overlay';

interface WinPresentation {
  wins: DogLineWin[];
  total: number;
}

interface FreeSpinsState {
  total: number;
  played: number;
  win: number;
}

export const DogHouseGame: React.FC = () => {
  const { user, isAuthenticated, playSlotsRound } = useCasinoUser();
  const { slotMachines } = useCasinoAdmin();
  const machine = slotMachines.find((m) => m.id === 'the-dog-house');
  const minBet = machine?.minBet ?? 20;
  const maxBet = machine?.maxBet ?? 500000;

  const betLevels = useMemo(() => {
    const list = BET_LEVELS.filter((b) => b >= minBet && b <= maxBet);
    return list.length > 0 ? list : [Math.max(20, Math.ceil(minBet / 20) * 20)];
  }, [minBet, maxBet]);

  // ---------------------------------------------------------------------------
  // Solde (réel / démo)
  // ---------------------------------------------------------------------------
  const [mode, setMode] = useState<'real' | 'demo'>(() =>
    isAuthenticated && user && user.chips > 0 ? 'real' : 'demo',
  );
  const [demoChips, setDemoChips] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(DEMO_KEY));
      return saved > 0 ? saved : DEMO_START;
    } catch {
      return DEMO_START;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(DEMO_KEY, String(demoChips));
    } catch {}
  }, [demoChips]);
  useEffect(() => {
    if (!isAuthenticated && mode === 'real') setMode('demo');
  }, [isAuthenticated, mode]);

  const balance = mode === 'real' ? (user?.chips ?? 0) : demoChips;
  /** Gain déjà crédité mais pas encore « révélé » à l'écran */
  const [hiddenWin, setHiddenWin] = useState(0);
  const displayCredit = Math.max(0, balance - hiddenWin);

  // ---------------------------------------------------------------------------
  // État de jeu
  // ---------------------------------------------------------------------------
  const [betIdx, setBetIdx] = useState(() => {
    const def = machine?.defaultBet ?? 200;
    const idx = betLevels.findIndex((b) => b >= def);
    return idx >= 0 ? idx : 0;
  });
  const bet = betLevels[Math.min(betIdx, betLevels.length - 1)];

  const [grid, setGrid] = useState<DogSymbolId[][]>(INITIAL_GRID);
  const [mults, setMults] = useState<number[][]>(() => INITIAL_GRID.map((c) => c.map((s) => (s === 'wild' ? 3 : 1))));
  const [spinning, setSpinning] = useState<boolean[]>([false, false, false, false, false]);
  const [landKeys, setLandKeys] = useState<number[]>([0, 0, 0, 0, 0]);
  const [anticip, setAnticip] = useState<boolean[]>([false, false, false, false, false]);
  const [strips, setStrips] = useState<DogSymbolId[][]>(() =>
    [0, 1, 2, 3, 4].map((r) => Array.from({ length: STRIP_LEN }, () => randomStripSymbol(r))),
  );
  const [sticky, setSticky] = useState<StickyWild[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [presentation, setPresentation] = useState<WinPresentation | null>(null);
  const [activeLine, setActiveLine] = useState(-1);
  const [scatterHit, setScatterHit] = useState(false);
  const [counter, setCounter] = useState(0);
  const [message, setMessage] = useState('TOURNEZ POUR GAGNER !');
  const [bigWin, setBigWin] = useState<{ amount: number; shown: number; bet: number } | null>(null);
  const [freeSpins, setFreeSpins] = useState<FreeSpinsState | null>(null);
  const [fsIntro, setFsIntro] = useState<{ values: number[]; revealed: number } | null>(null);
  const [fsEnd, setFsEnd] = useState<{ win: number; spins: number } | null>(null);

  const [turbo, setTurbo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoOpen, setAutoOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem('diamond_sound_muted') === 'true';
    } catch {
      return false;
    }
  });
  const audio = useRef(new SlotsAudio());
  audio.current.muted = muted;
  useEffect(() => () => audio.current.close(), []);

  // Refs lues par la boucle asynchrone (évite les closures périmées)
  const turboRef = useRef(turbo);
  turboRef.current = turbo;
  const skipResolvers = useRef<Set<() => void>>(new Set());
  const clickResolver = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);

  const wait = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(t);
          skipResolvers.current.delete(done);
          resolve();
        };
        const t = setTimeout(done, ms);
        skipResolvers.current.add(done);
      }),
    [],
  );
  const skipAll = useCallback(() => {
    [...skipResolvers.current].forEach((fn) => fn());
  }, []);
  const waitClick = useCallback(
    () =>
      new Promise<void>((resolve) => {
        clickResolver.current = () => {
          clickResolver.current = null;
          resolve();
        };
      }),
    [],
  );

  const countUp = useCallback(
    (from: number, to: number, ms: number, onTick: (v: number) => void) =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        let finished = false;
        // rAF est suspendu dans un onglet en arrière-plan : le timer garantit la fin
        const fallback = setTimeout(() => finish(), ms + 100);
        const finish = () => {
          if (finished) return;
          finished = true;
          clearTimeout(fallback);
          skipResolvers.current.delete(finish);
          onTick(to);
          resolve();
        };
        skipResolvers.current.add(finish);
        const step = (now: number) => {
          if (finished) return;
          const p = Math.min(1, (now - start) / ms);
          onTick(from + (to - from) * (1 - Math.pow(1 - p, 2)));
          if (p < 1) requestAnimationFrame(step);
          else finish();
        };
        requestAnimationFrame(step);
      }),
    [],
  );

  // ---------------------------------------------------------------------------
  // Règlement du solde
  // ---------------------------------------------------------------------------
  const settle = useCallback(
    async (cost: number, win: number, isFreeSpin: boolean): Promise<boolean> => {
      if (mode === 'real') {
        try {
          await playSlotsRound({
            machineName: 'The Dog House',
            bet: cost,
            win,
            multiplier: cost > 0 ? Number((win / cost).toFixed(2)) : 0,
            isFreeSpin,
          });
          return true;
        } catch {
          return false;
        }
      }
      setDemoChips((prev) => Math.max(0, Math.round((prev - (isFreeSpin ? 0 : cost) + win) * 100) / 100));
      return true;
    },
    [mode, playSlotsRound],
  );

  // ---------------------------------------------------------------------------
  // Animation d'un tour de rouleaux
  // ---------------------------------------------------------------------------
  const animateReels = useCallback(
    async (res: DogSpinResult, allowAnticipation: boolean) => {
      const fast = turboRef.current;
      setStrips([0, 1, 2, 3, 4].map((r) => Array.from({ length: STRIP_LEN }, () => randomStripSymbol(r))));
      setSpinning([true, true, true, true, true]);
      setAnticip([false, false, false, false, false]);
      audio.current.spinStart();

      const scatterOn = (r: number) => res.grid[r].includes('scatter');
      const anticipateLast = allowAnticipation && scatterOn(0) && scatterOn(2);

      await wait(fast ? 260 : 520);
      for (let r = 0; r < 5; r++) {
        if (r > 0) {
          if (r === 4 && anticipateLast) {
            setAnticip([false, false, false, false, true]);
            audio.current.anticipation();
            await wait(fast ? 900 : 1700);
          } else {
            await wait(fast ? 90 : 200);
          }
        }
        setGrid((prev) => prev.map((col, i) => (i === r ? res.grid[r] : col)));
        setMults((prev) => prev.map((col, i) => (i === r ? res.multipliers[r] : col)));
        setSpinning((prev) => prev.map((s, i) => (i === r ? false : s)));
        setLandKeys((prev) => prev.map((k, i) => (i === r ? k + 1 : k)));
        audio.current.reelStop(r, scatterOn(r));
      }
      setAnticip([false, false, false, false, false]);
      if (res.grid.some((col) => col.includes('wild'))) audio.current.dogBark();
    },
    [wait],
  );

  /** Présente les gains d'un tour (lignes, compteur, big win) */
  const presentWins = useCallback(
    async (res: DogSpinResult, stakeBet: number, counterBase: number) => {
      if (res.totalWin <= 0) return;
      const fast = turboRef.current;
      setPresentation({ wins: res.wins, total: res.totalWin });
      setActiveLine(-1);
      const tier = getWinTier(res.totalWin, stakeBet);

      if (tier.id === 'win') {
        audio.current.winLine(res.totalWin / stakeBet >= 3 ? 'medium' : 'small');
        await countUp(counterBase, counterBase + res.totalWin, fast ? 350 : 800, setCounter);
        await wait(fast ? 350 : 900);
      } else {
        audio.current.winLine('big');
        await wait(fast ? 300 : 700);
        setBigWin({ amount: res.totalWin, shown: 0, bet: stakeBet });
        audio.current.jackpotFanfare();
        const durations: Record<string, number> = { big: 3200, mega: 4800, superb: 6200, sensational: 8000 };
        const duration = durations[tier.id] ?? 3200;
        await countUp(0, res.totalWin, fast ? duration / 2 : duration, (v) =>
          setBigWin((b) => (b ? { ...b, shown: v } : b)),
        );
        setCounter(counterBase + res.totalWin);
        await wait(2500);
        setBigWin(null);
      }
    },
    [countUp, wait],
  );

  // ---------------------------------------------------------------------------
  // Tours gratuits
  // ---------------------------------------------------------------------------
  const runFreeSpins = useCallback(
    async (stakeBet: number, alreadyWon: number) => {
      const values = rollFreeSpinsGrid();
      const total = values.reduce((a, b) => a + b, 0);
      setPhase('overlay');
      setFsIntro({ values, revealed: 0 });
      audio.current.jackpotFanfare();
      for (let i = 1; i <= 9; i++) {
        await wait(260);
        setFsIntro({ values, revealed: i });
        audio.current.reelStop(i % 5, false);
      }
      await waitClick();
      setFsIntro(null);

      let fsWin = 0;
      let stickies: StickyWild[] = [];
      setSticky([]);
      setFreeSpins({ total, played: 0, win: 0 });
      setCounter(0);
      setPresentation(null);
      setScatterHit(false);
      setPhase('spinning');

      const cap = stakeBet * MAX_WIN_X_BET;
      for (let i = 1; i <= total; i++) {
        await wait(turboRef.current ? 250 : 550);
        setPresentation(null);
        setMessage('TOURS GRATUITS');
        setFreeSpins({ total, played: i, win: fsWin });

        const res = evaluateDogHouseSpin({ bet: stakeBet, isFreeSpin: true, stickyWilds: stickies });
        const room = Math.max(0, cap - alreadyWon - fsWin);
        if (res.totalWin > room) res.totalWin = room;

        setHiddenWin((h) => h + res.totalWin);
        await settle(0, res.totalWin, true);
        await animateReels(res, false);
        stickies = res.stickyWilds;
        setSticky(stickies);

        await presentWins(res, stakeBet, fsWin);
        fsWin += res.totalWin;
        setHiddenWin((h) => Math.max(0, h - res.totalWin));
        setFreeSpins({ total, played: i, win: fsWin });
        if (alreadyWon + fsWin >= cap) break;
      }

      await wait(600);
      setPhase('overlay');
      setFsEnd({ win: fsWin, spins: total });
      audio.current.jackpotFanfare();
      await waitClick();
      setFsEnd(null);
      setFreeSpins(null);
      setSticky([]);
      setPresentation(null);
      setCounter(alreadyWon + fsWin);
      setMessage(alreadyWon + fsWin > 0 ? `GAIN TOTAL ${fmt(alreadyWon + fsWin)}` : 'TOURNEZ POUR GAGNER !');
    },
    [animateReels, presentWins, settle, wait, waitClick],
  );

  // ---------------------------------------------------------------------------
  // Tour principal (normal ou achat de bonus)
  // ---------------------------------------------------------------------------
  const playRound = useCallback(
    async (buyBonus: boolean) => {
      if (busyRef.current) return;
      const cost = buyBonus ? bet * BONUS_BUY_X_BET : bet;
      if (displayCredit < cost) {
        setMessage('CRÉDIT INSUFFISANT');
        setAutoLeft(0);
        return;
      }
      busyRef.current = true;
      audio.current.unlock();
      setPhase('spinning');
      setPresentation(null);
      setScatterHit(false);
      setActiveLine(-1);
      setCounter(0);
      setMessage('BONNE CHANCE !');

      const res = evaluateDogHouseSpin({ bet, forceScatters: buyBonus });
      setHiddenWin((h) => h + res.totalWin);
      const ok = await settle(cost, res.totalWin, false);
      if (!ok) {
        setHiddenWin((h) => Math.max(0, h - res.totalWin));
        setMessage('CRÉDIT INSUFFISANT');
        setAutoLeft(0);
        setPhase('idle');
        busyRef.current = false;
        return;
      }

      await animateReels(res, !buyBonus);

      if (res.triggersBonus) {
        setScatterHit(true);
        setAutoLeft(0);
        setMessage('BONUS !');
      }
      await presentWins(res, bet, 0);
      setHiddenWin((h) => Math.max(0, h - res.totalWin));

      if (res.triggersBonus) {
        await wait(1200);
        await runFreeSpins(bet, res.totalWin);
      } else if (res.totalWin > 0) {
        setMessage(`GAIN ${fmt(res.totalWin)}`);
      } else {
        setMessage('TOURNEZ POUR GAGNER !');
      }

      setPhase('idle');
      busyRef.current = false;
    },
    [animateReels, bet, displayCredit, presentWins, runFreeSpins, settle, wait],
  );

  const onSpinPress = useCallback(() => {
    if (clickResolver.current) {
      clickResolver.current();
      return;
    }
    if (busyRef.current) {
      skipAll();
      return;
    }
    audio.current.click();
    void playRound(false);
  }, [playRound, skipAll]);

  // Autoplay
  useEffect(() => {
    if (phase !== 'idle' || autoLeft <= 0) return;
    const t = setTimeout(() => {
      setAutoLeft((n) => n - 1);
      void playRound(false);
    }, turbo ? 150 : 450);
    return () => clearTimeout(t);
  }, [phase, autoLeft, turbo, playRound]);

  // Défilement des lignes gagnantes au repos
  useEffect(() => {
    if (phase === 'spinning' || !presentation || presentation.wins.length === 0) return;
    let i = -1;
    const t = setInterval(() => {
      i = i + 1 >= presentation.wins.length ? -1 : i + 1;
      setActiveLine(i);
    }, 1500);
    return () => clearInterval(t);
  }, [phase, presentation]);

  // Barre d'espace
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      onSpinPress();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSpinPress]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try {
      localStorage.setItem('diamond_sound_muted', String(next));
    } catch {}
  };

  // ---------------------------------------------------------------------------
  // Dérivés d'affichage
  // ---------------------------------------------------------------------------
  const winningCells = useMemo(() => {
    const set = new Set<string>();
    if (!presentation) return set;
    const list = activeLine >= 0 ? [presentation.wins[activeLine]] : presentation.wins;
    list.forEach((w) => w?.positions.forEach(([r, row]) => set.add(`${r}-${row}`)));
    return set;
  }, [presentation, activeLine]);

  const shownLines = useMemo(() => {
    if (!presentation) return [];
    const lines = presentation.wins.filter((w) => w.lineIndex >= 0);
    if (activeLine >= 0) {
      const w = presentation.wins[activeLine];
      return w && w.lineIndex >= 0 ? [w] : [];
    }
    return lines;
  }, [presentation, activeLine]);

  const barText = (() => {
    if (presentation && activeLine >= 0) {
      const w = presentation.wins[activeLine];
      if (w) {
        return w.lineIndex >= 0
          ? `LIGNE ${w.lineIndex + 1} PAIE ${fmt(w.win)}${w.wildMultiplier > 1 ? ` (x${w.wildMultiplier})` : ''}`
          : `${w.count} BONUS PAIENT ${fmt(w.win)}`;
      }
    }
    if (presentation && counter > 0) return `GAIN ${fmt(counter)}`;
    return message;
  })();

  const isNight = freeSpins !== null || fsIntro !== null;
  const locked = phase !== 'idle' || autoLeft > 0;

  return (
    <div className="relative bg-[#0f1923] pt-[80px] sm:pt-[90px]">
      <div
        className="relative w-full overflow-hidden select-none"
        style={{ height: 'max(640px, calc(100svh - 90px))' }}
      >
        <Scenery night={isNight} />

        {/* Barre supérieure : retour / mode */}
        <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between gap-2">
          <Link
            to="/jeux"
            className="flex items-center gap-1.5 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur px-3 py-1.5 text-xs font-semibold text-white transition-colors"
          >
            <ArrowLeft size={14} /> Lobby
          </Link>
          <div className="flex items-center rounded-full bg-black/45 backdrop-blur p-1 text-[11px] font-bold">
            <button
              onClick={() => !locked && isAuthenticated && setMode('real')}
              disabled={locked || !isAuthenticated}
              title={isAuthenticated ? 'Jouer avec vos jetons' : 'Connectez-vous pour jouer avec vos jetons'}
              className={`px-3 py-1 rounded-full transition-colors ${
                mode === 'real' ? 'bg-[#ffcf3f] text-[#3b1d0e]' : 'text-white/70 hover:text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              JETONS
            </button>
            <button
              onClick={() => !locked && setMode('demo')}
              disabled={locked}
              className={`px-3 py-1 rounded-full transition-colors ${
                mode === 'demo' ? 'bg-white text-[#3b1d0e]' : 'text-white/70 hover:text-white'
              }`}
            >
              DÉMO
            </button>
          </div>
        </div>

        {/* Zone de jeu */}
        <div className="absolute inset-x-0 top-12 bottom-[200px] sm:bottom-[112px] flex items-center justify-center px-2 sm:px-6">
          <div className="relative flex items-center gap-4 h-full w-full max-w-[1100px] justify-center">
            {/* Achat bonus (desktop) */}
            <BuyBonusButton
              bet={bet}
              disabled={locked || freeSpins !== null}
              onClick={() => setBuyOpen(true)}
              className="hidden lg:flex"
            />

            <div className="relative flex-1 h-full min-w-0 flex items-center justify-center" style={{ containerType: 'size' }}>
            <MachineFrame freeSpins={freeSpins}>
              <div className="relative grid grid-cols-5 gap-[3px] sm:gap-1 p-[3px] sm:p-1">
                {[0, 1, 2, 3, 4].map((r) => (
                  <Reel
                    key={r}
                    reel={r}
                    symbols={grid[r]}
                    multipliers={mults[r]}
                    strip={strips[r]}
                    spinning={spinning[r]}
                    fast={turbo}
                    landKey={landKeys[r]}
                    anticipating={anticip[r]}
                    sticky={sticky.filter((s) => s.reel === r)}
                    winningCells={winningCells}
                    dimLosers={!!presentation}
                    scatterHit={scatterHit}
                  />
                ))}
                <PaylineOverlay lines={shownLines} />
              </div>
            </MachineFrame>
            </div>

            {/* Colonne droite desktop : infos rapides */}
            <div className="hidden lg:flex w-[150px] flex-col gap-2 shrink-0">
              <div className="rounded-2xl bg-black/45 backdrop-blur p-3 text-center border border-white/10">
                <div className="dh-font text-[#ffcf3f] text-sm">GAIN MAX</div>
                <div className="dh-font text-white text-2xl">{fmt(MAX_WIN_X_BET)}x</div>
              </div>
              <div className="rounded-2xl bg-black/45 backdrop-blur p-3 text-center border border-white/10">
                <div className="dh-font text-[#ffcf3f] text-sm">WILDS</div>
                <div className="text-white text-xs font-semibold leading-snug mt-1">
                  x2 ou x3, additionnés sur la ligne, collants en bonus
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Barre de contrôle façon Pragmatic */}
        <ControlBar
          credit={displayCredit}
          bet={bet}
          mode={mode}
          text={barText}
          highlight={!!presentation || phase === 'overlay'}
          spinning={phase !== 'idle'}
          locked={locked}
          autoLeft={autoLeft}
          turbo={turbo}
          muted={muted}
          canDec={betIdx > 0}
          canInc={betIdx < betLevels.length - 1}
          onDec={() => setBetIdx((i) => Math.max(0, i - 1))}
          onInc={() => setBetIdx((i) => Math.min(betLevels.length - 1, i + 1))}
          onSpin={onSpinPress}
          onAuto={() => (autoLeft > 0 ? setAutoLeft(0) : setAutoOpen(true))}
          onTurbo={() => setTurbo((t) => !t)}
          onMute={toggleMute}
          onInfo={() => setInfoOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onBuy={() => setBuyOpen(true)}
          buyDisabled={locked || freeSpins !== null}
        />

        {/* Overlays */}
        {bigWin && <BigWinOverlay amount={bigWin.shown} bet={bigWin.bet} onClick={skipAll} />}
        {fsIntro && (
          <FreeSpinsIntro values={fsIntro.values} revealed={fsIntro.revealed} onStart={() => clickResolver.current?.()} />
        )}
        {fsEnd && <FreeSpinsEnd win={fsEnd.win} spins={fsEnd.spins} onClose={() => clickResolver.current?.()} />}
        {autoOpen && (
          <Modal title="JEU AUTOMATIQUE" onClose={() => setAutoOpen(false)}>
            <p className="text-sm text-white/70 mb-4 text-center">
              S'arrête automatiquement au déclenchement des tours gratuits.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[10, 25, 50, 75, 100, 500].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setAutoOpen(false);
                    setAutoLeft(n);
                  }}
                  className="dh-font text-xl py-3 rounded-xl bg-[#6b3a1a] hover:bg-[#8a4d22] border-2 border-[#3b1d0e] text-[#ffe9b0] transition-colors"
                >
                  {n}
                </button>
              ))}
            </div>
          </Modal>
        )}
        {buyOpen && (
          <Modal title="ACHETER LES TOURS GRATUITS" onClose={() => setBuyOpen(false)}>
            <div className="flex justify-center gap-2 mb-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-16 h-16">
                  <DogSymbol id="scatter" />
                </div>
              ))}
            </div>
            <p className="text-center text-white/80 text-sm mb-1">Déclenchez directement le bonus pour</p>
            <p className="text-center dh-font text-4xl text-[#ffcf3f] mb-1">{fmt(bet * BONUS_BUY_X_BET)}</p>
            <p className="text-center text-white/50 text-xs mb-5">
              {BONUS_BUY_X_BET}x la mise actuelle ({fmt(bet)}) · 9 à 27 tours avec wilds collants
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setBuyOpen(false)}
                className="dh-font text-lg py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white"
              >
                ANNULER
              </button>
              <button
                disabled={displayCredit < bet * BONUS_BUY_X_BET}
                onClick={() => {
                  setBuyOpen(false);
                  void playRound(true);
                }}
                className="dh-font text-lg py-3 rounded-xl bg-gradient-to-b from-[#7dff5a] to-[#1fa33a] border-2 border-[#0a4515] text-[#0a2d0a] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ACHETER
              </button>
            </div>
          </Modal>
        )}
        {settingsOpen && (
          <Modal title="PARAMÈTRES" onClose={() => setSettingsOpen(false)}>
            <div className="space-y-3 text-white">
              <SettingRow label="Son" value={!muted} onToggle={toggleMute} />
              <SettingRow label="Tours rapides (Turbo)" value={turbo} onToggle={() => setTurbo((t) => !t)} />
              <div className="flex items-center justify-between rounded-xl bg-black/30 px-4 py-3">
                <span className="text-sm font-semibold">Solde démo</span>
                <button
                  disabled={locked || mode !== 'demo'}
                  onClick={() => setDemoChips(DEMO_START)}
                  className="text-xs font-bold rounded-lg bg-[#ffcf3f] text-[#3b1d0e] px-3 py-1.5 disabled:opacity-40"
                >
                  Recharger {fmt(DEMO_START)}
                </button>
              </div>
              <p className="text-xs text-white/50">Raccourci : ESPACE pour tourner, ESPACE pendant la rotation pour arrêter.</p>
            </div>
          </Modal>
        )}
        {infoOpen && <PaytableModal bet={bet} onClose={() => setInfoOpen(false)} />}
      </div>

      <GameInfoStrip />
    </div>
  );
};

// =============================================================================
// Décor
// =============================================================================

const Scenery: React.FC<{ night: boolean }> = ({ night }) => (
  <div className="absolute inset-0" aria-hidden="true">
    <div
      className="absolute inset-0 transition-opacity duration-1000"
      style={{ background: 'linear-gradient(180deg, #3fa9f5 0%, #8fd3ff 45%, #d8f3ff 70%)', opacity: night ? 0 : 1 }}
    />
    <div
      className="absolute inset-0 transition-opacity duration-1000"
      style={{ background: 'linear-gradient(180deg, #2a1558 0%, #8a2f7a 40%, #ff8a4a 72%)', opacity: night ? 1 : 0 }}
    />
    {/* soleil / lune */}
    <div
      className="absolute rounded-full transition-all duration-1000"
      style={{
        width: 120,
        height: 120,
        right: '12%',
        top: night ? '52%' : '8%',
        background: night ? 'radial-gradient(circle, #ffe7a0, #ff9a3c)' : 'radial-gradient(circle, #fffbe0, #ffe14a)',
        boxShadow: night ? '0 0 80px 30px rgba(255,140,60,0.5)' : '0 0 80px 30px rgba(255,240,150,0.6)',
      }}
    />
    {/* nuages */}
    {[
      { top: '6%', scale: 1, dur: 90, delay: -10 },
      { top: '16%', scale: 0.7, dur: 120, delay: -60 },
      { top: '28%', scale: 0.85, dur: 105, delay: -35 },
      { top: '10%', scale: 0.55, dur: 140, delay: -100 },
    ].map((c, i) => (
      <div
        key={i}
        className="dh-cloud absolute left-0"
        style={{ top: c.top, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s`, opacity: night ? 0.35 : 0.95 }}
      >
        <div style={{ transform: `scale(${c.scale})` }} className="relative w-[220px] h-[70px]">
          <div className="absolute bottom-0 left-0 w-[220px] h-[44px] rounded-full bg-white" />
          <div className="absolute bottom-4 left-8 w-[90px] h-[70px] rounded-full bg-white" />
          <div className="absolute bottom-3 left-24 w-[80px] h-[60px] rounded-full bg-white" />
        </div>
      </div>
    ))}
    {/* maisons latérales */}
    <House className="absolute bottom-[18%] -left-6 w-[260px] hidden md:block" color="#f2c18a" roof="#c2552c" night={night} />
    <House className="absolute bottom-[18%] -right-10 w-[240px] hidden md:block" color="#b8d8f2" roof="#7a4ab8" night={night} flip />
    {/* haie + clôture */}
    <div
      className="absolute inset-x-0 bottom-[16%] h-[70px]"
      style={{
        background:
          'repeating-linear-gradient(90deg, transparent 0 14px, #fff 14px 34px, transparent 34px 48px), linear-gradient(transparent 28px, #fff 28px 36px, transparent 36px 52px, #fff 52px 60px, transparent 60px)',
        opacity: night ? 0.55 : 0.95,
        maskImage: 'linear-gradient(transparent 0, #000 8px)',
      }}
    />
    <div
      className="absolute inset-x-0 bottom-0 h-[18%]"
      style={{
        background: night
          ? 'linear-gradient(180deg, #2f6b2a 0%, #1b3f18 100%)'
          : 'linear-gradient(180deg, #7ed957 0%, #3fa535 55%, #2d7d27 100%)',
      }}
    />
    <div
      className="absolute inset-x-0 bottom-[16%] h-6"
      style={{
        background: night ? '#2f6b2a' : '#5cc443',
        borderRadius: '50% 50% 0 0 / 100% 100% 0 0',
      }}
    />
  </div>
);

const House: React.FC<{ className: string; color: string; roof: string; night: boolean; flip?: boolean }> = ({
  className,
  color,
  roof,
  night,
  flip,
}) => (
  <svg viewBox="0 0 260 200" className={className} style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
    <rect x="30" y="80" width="200" height="120" fill={color} stroke="#3b1d0e" strokeWidth="4" />
    <path d="M10 90 L130 10 L250 90 Z" fill={roof} stroke="#3b1d0e" strokeWidth="4" strokeLinejoin="round" />
    <rect x="60" y="110" width="50" height="45" fill={night ? '#ffd86b' : '#9fd8ff'} stroke="#3b1d0e" strokeWidth="4" />
    <path d="M85 110 V155 M60 132 H110" stroke="#3b1d0e" strokeWidth="3" />
    <rect x="150" y="120" width="44" height="80" rx="4" fill="#7a3f1a" stroke="#3b1d0e" strokeWidth="4" />
    <circle cx="184" cy="162" r="4" fill="#ffcf3f" />
  </svg>
);

// =============================================================================
// Cadre de la machine
// =============================================================================

const MachineFrame: React.FC<{ freeSpins: FreeSpinsState | null; children: React.ReactNode }> = ({
  freeSpins,
  children,
}) => (
  <div className="relative flex flex-col" style={{ width: 'min(100cqw, calc(100cqh * 1.18), 860px)' }}>
    {/* Toit + logo */}
    <div className="relative w-full aspect-[500/78]">
      <svg viewBox="0 0 500 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id="dh-roof-main" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d9793a" />
            <stop offset="100%" stopColor="#8a3a14" />
          </linearGradient>
        </defs>
        <path d="M-6 100 L250 4 L506 100 Z" fill="url(#dh-roof-main)" stroke="#3b1d0e" strokeWidth="5" strokeLinejoin="round" />
        <path d="M40 100 L250 22 L460 100" fill="none" stroke="#f0a060" strokeWidth="3" opacity="0.6" />
      </svg>
      <div className="absolute inset-x-0 bottom-[6%] flex justify-center">
        <Logo />
      </div>
    </div>

    {/* Corps */}
    <div
      className="relative rounded-b-xl border-[5px] border-t-0 border-[#3b1d0e] p-[2.2%] shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
      style={{ background: 'linear-gradient(180deg, #b0642c, #7a3f1a)' }}
    >
      {/* montants de bois */}
      <div className="absolute inset-y-0 -left-[3%] w-[4%] rounded-l bg-gradient-to-r from-[#5a2c10] to-[#9a5424] border-2 border-[#3b1d0e] hidden sm:block" />
      <div className="absolute inset-y-0 -right-[3%] w-[4%] rounded-r bg-gradient-to-l from-[#5a2c10] to-[#9a5424] border-2 border-[#3b1d0e] hidden sm:block" />

      {freeSpins && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 dh-pop whitespace-nowrap rounded-full border-[3px] border-[#3b1d0e] bg-gradient-to-b from-[#ff5ab4] to-[#b01d74] px-4 py-1 dh-font text-white text-sm sm:text-lg shadow-lg">
          TOURS GRATUITS {freeSpins.played}/{freeSpins.total}
          <span className="ml-3 text-[#ffe14a]">GAIN {fmt(freeSpins.win)}</span>
        </div>
      )}

      <div className="relative rounded-md bg-[#3b1d0e] overflow-hidden">{children}</div>
    </div>
  </div>
);

const Logo: React.FC = () => (
  <div className="relative px-[6%] py-[1.5%] rounded-[999px] border-[4px] border-[#3b1d0e] bg-gradient-to-b from-[#fff1d0] to-[#e7b77a] shadow-[0_4px_0_#3b1d0e] whitespace-nowrap">
    <span className="dh-font-xl text-[clamp(16px,4.2cqw,40px)] leading-none" style={{ WebkitTextStroke: '1.5px #3b1d0e' }}>
      <span className="text-[#ffb300]">THE </span>
      <span className="text-[#ff4f9a]">D</span>
      <span className="text-[#4ad9ff]">O</span>
      <span className="text-[#7dff5a]">G</span>
      <span className="text-[#ffb300]"> HOUSE</span>
    </span>
  </div>
);

// =============================================================================
// Rouleau
// =============================================================================

interface ReelProps {
  reel: number;
  symbols: DogSymbolId[];
  multipliers: number[];
  strip: DogSymbolId[];
  spinning: boolean;
  fast: boolean;
  landKey: number;
  anticipating: boolean;
  sticky: StickyWild[];
  winningCells: Set<string>;
  dimLosers: boolean;
  scatterHit: boolean;
}

const Reel: React.FC<ReelProps> = ({
  reel,
  symbols,
  multipliers,
  strip,
  spinning,
  fast,
  landKey,
  anticipating,
  sticky,
  winningCells,
  dimLosers,
  scatterHit,
}) => (
  <div
    className={`relative overflow-hidden rounded-[4px] ${anticipating ? 'dh-anticip' : ''}`}
    style={{
      background:
        'repeating-linear-gradient(180deg, #8f4c21 0 2px, transparent 2px 38px), linear-gradient(180deg, #c27438 0%, #a65a28 50%, #c27438 100%)',
    }}
  >
    {spinning ? (
      <div className="relative aspect-[1/3]">
        <div className={`absolute inset-x-0 top-0 dh-strip ${fast ? 'dh-strip-fast' : ''}`}>
          {[...strip, ...strip].map((s, i) => (
            <div key={i} className="aspect-square p-[9%]">
              <DogSymbol id={s} multiplier={2} />
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div key={landKey} className="dh-land relative aspect-[1/3] flex flex-col">
        {symbols.map((s, row) => {
          const isWin = winningCells.has(`${reel}-${row}`);
          const isScatterHit = scatterHit && s === 'scatter';
          const dim = dimLosers && winningCells.size > 0 && !isWin && !isScatterHit;
          return (
            <div
              key={row}
              className={`relative flex-1 p-[9%] transition-opacity duration-300 ${dim ? 'opacity-40' : ''} ${
                isWin ? 'dh-win' : ''
              } ${isScatterHit ? 'dh-scatter-hit' : ''}`}
            >
              <DogSymbol id={s} multiplier={multipliers[row]} />
            </div>
          );
        })}
      </div>
    )}

    {/* Wilds collants : restent fixes pendant la rotation */}
    {sticky.map((w) => {
      const isWin = winningCells.has(`${reel}-${w.row}`);
      return (
        <div
          key={w.row}
          className="absolute inset-x-0 z-10 p-[9%] dh-sticky rounded-[4px]"
          style={{
            top: `${(w.row / 3) * 100}%`,
            height: `${100 / 3}%`,
            background: 'radial-gradient(circle, rgba(255,220,120,0.55), rgba(166,90,40,0.95))',
          }}
        >
          <div className={`w-full h-full ${isWin ? 'dh-win' : ''}`}>
            <DogSymbol id="wild" multiplier={w.multiplier} />
          </div>
        </div>
      );
    })}
  </div>
);

const PaylineOverlay: React.FC<{ lines: DogLineWin[] }> = ({ lines }) => (
  <svg className="absolute inset-[3px] sm:inset-1 pointer-events-none z-20" viewBox="0 0 5 3" preserveAspectRatio="none">
    {lines.map((w) => {
      const rows = DOG_PAYLINES[w.lineIndex];
      const pts = rows.map((row, r) => `${r + 0.5},${row + 0.5}`).join(' ');
      const color = LINE_COLORS[w.lineIndex % LINE_COLORS.length];
      return (
        <g key={w.lineIndex}>
          <polyline points={pts} fill="none" stroke="#3b1d0e" strokeWidth="9" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={pts} fill="none" stroke={color} strokeWidth="5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </g>
      );
    })}
  </svg>
);

// =============================================================================
// Barre de contrôle
// =============================================================================

interface ControlBarProps {
  credit: number;
  bet: number;
  mode: 'real' | 'demo';
  text: string;
  highlight: boolean;
  spinning: boolean;
  locked: boolean;
  autoLeft: number;
  turbo: boolean;
  muted: boolean;
  canDec: boolean;
  canInc: boolean;
  onDec: () => void;
  onInc: () => void;
  onSpin: () => void;
  onAuto: () => void;
  onTurbo: () => void;
  onMute: () => void;
  onInfo: () => void;
  onSettings: () => void;
  onBuy: () => void;
  buyDisabled: boolean;
}

const RoundBtn: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  title: string;
  active?: boolean;
  children: React.ReactNode;
  size?: 'sm' | 'md';
}> = ({ onClick, disabled, title, active, children, size = 'md' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    className={`${size === 'sm' ? 'w-8 h-8' : 'w-10 h-10 sm:w-11 sm:h-11'} rounded-full flex items-center justify-center border-2 transition-all ${
      active ? 'bg-[#ffcf3f] text-[#3b1d0e] border-[#ffcf3f]' : 'bg-black/30 text-white border-white/70 hover:bg-white/15'
    } disabled:opacity-35 disabled:cursor-not-allowed`}
  >
    {children}
  </button>
);

const ControlBar: React.FC<ControlBarProps> = (p) => (
  <div className="absolute inset-x-0 bottom-0 z-30">
    <div className="bg-gradient-to-t from-black/85 via-black/70 to-black/0 pt-6 pb-3 px-3 sm:px-6">
      <div className="mx-auto max-w-[1100px] grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_1fr] items-end gap-x-2 gap-y-2">
        {/* Gauche : réglages + crédit/mise */}
        <div className="flex items-end gap-2 sm:gap-4 min-w-0">
          <div className="flex flex-col gap-1.5">
            <button onClick={p.onSettings} title="Paramètres" aria-label="Paramètres" className="text-white/85 hover:text-white">
              <Settings size={18} />
            </button>
            <button onClick={p.onInfo} title="Table des gains" aria-label="Table des gains" className="text-white/85 hover:text-white">
              <Info size={18} />
            </button>
            <button onClick={p.onMute} title={p.muted ? 'Activer le son' : 'Couper le son'} aria-label="Son" className="text-white/85 hover:text-white">
              {p.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>
          <div className="leading-tight min-w-0">
            <div className="dh-font text-[13px] sm:text-base whitespace-nowrap">
              <span className="text-[#ffcf3f]">CRÉDIT </span>
              <span className="text-white">{fmt(p.credit)}</span>
              {p.mode === 'demo' && <span className="ml-1 text-[10px] text-white/50 align-middle">DÉMO</span>}
            </div>
            <div className="dh-font text-[13px] sm:text-base whitespace-nowrap">
              <span className="text-[#ffcf3f]">MISE </span>
              <span className="text-white">{fmt(p.bet)}</span>
            </div>
          </div>
        </div>

        {/* Centre : message */}
        <div className="col-span-2 sm:col-span-1 order-first sm:order-none flex flex-col items-center pb-1 min-w-0">
          <button
            onClick={p.onBuy}
            disabled={p.buyDisabled}
            className="lg:hidden mb-2 dh-font text-xs rounded-full px-3 py-1 bg-gradient-to-b from-[#ff5ab4] to-[#b01d74] border-2 border-[#3b1d0e] text-white disabled:opacity-40"
          >
            ACHETER BONUS
          </button>
          <div
            className={`dh-font text-center whitespace-nowrap text-[15px] sm:text-2xl ${
              p.highlight ? 'text-[#ffe14a] drop-shadow-[0_0_10px_rgba(255,200,0,0.7)]' : 'text-white'
            }`}
          >
            {p.text}
          </div>
        </div>

        {/* Droite : − SPIN + / auto / turbo */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 sm:gap-3">
            <RoundBtn onClick={p.onDec} disabled={p.locked || !p.canDec} title="Diminuer la mise" size="sm">
              <Minus size={16} />
            </RoundBtn>
            <button
              onClick={p.onSpin}
              aria-label="Tourner"
              title="Tourner (ESPACE)"
              className={`dh-spin-btn relative w-[68px] h-[68px] sm:w-[84px] sm:h-[84px] rounded-full border-[3px] border-white bg-black/40 hover:bg-black/55 flex items-center justify-center shadow-[0_0_0_4px_rgba(0,0,0,0.35)] transition-transform active:scale-95 ${
                p.spinning ? 'dh-spinning' : ''
              }`}
            >
              <RefreshCw className="dh-spin-arrows text-white w-9 h-9 sm:w-11 sm:h-11" strokeWidth={2.6} />
              {p.autoLeft > 0 && (
                <span className="absolute inset-0 flex items-center justify-center dh-font text-xl text-[#ffe14a]">
                  {p.autoLeft}
                </span>
              )}
            </button>
            <RoundBtn onClick={p.onInc} disabled={p.locked || !p.canInc} title="Augmenter la mise" size="sm">
              <Plus size={16} />
            </RoundBtn>
          </div>
          <div className="flex items-center gap-2 pr-1">
            <button
              onClick={p.onTurbo}
              className={`flex items-center gap-1 dh-font text-[11px] px-2 py-0.5 rounded-full border ${
                p.turbo ? 'bg-[#ffcf3f] text-[#3b1d0e] border-[#ffcf3f]' : 'text-white border-white/50'
              }`}
            >
              <Zap size={11} /> TURBO
            </button>
            <button
              onClick={p.onAuto}
              className={`dh-font text-[11px] px-2 py-0.5 rounded-full border ${
                p.autoLeft > 0 ? 'bg-[#ff5a5a] text-white border-[#ff5a5a]' : 'text-white border-white/50'
              }`}
            >
              {p.autoLeft > 0 ? 'STOP AUTO' : 'AUTOPLAY'}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const BuyBonusButton: React.FC<{ bet: number; disabled: boolean; onClick: () => void; className?: string }> = ({
  bet,
  disabled,
  onClick,
  className = '',
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`${className} w-[150px] shrink-0 flex-col items-center rounded-2xl border-[4px] border-[#3b1d0e] bg-gradient-to-b from-[#ff5ab4] to-[#9a1566] p-3 shadow-[0_6px_0_#3b1d0e] hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:hover:translate-y-0`}
  >
    <div className="w-16 h-16 -mt-1">
      <DogSymbol id="scatter" />
    </div>
    <div className="dh-font text-white text-lg leading-tight mt-1">ACHETER</div>
    <div className="dh-font text-[#ffe14a] text-sm leading-tight">TOURS GRATUITS</div>
    <div className="dh-font text-white text-base mt-1">{fmt(bet * BONUS_BUY_X_BET)}</div>
  </button>
);

// =============================================================================
// Overlays
// =============================================================================

const Coins: React.FC<{ count?: number }> = ({ count = 36 }) => {
  const coins = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: Math.random() * 100,
        size: 18 + Math.random() * 22,
        dur: 1.8 + Math.random() * 2.2,
        delay: Math.random() * 2.5,
      })),
    [count],
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {coins.map((c, i) => (
        <div
          key={i}
          className="dh-coin absolute top-0 rounded-full border-2 border-[#8a4a00]"
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: c.size,
            animationDuration: `${c.dur}s`,
            animationDelay: `${c.delay}s`,
            animationIterationCount: 'infinite',
            background: 'radial-gradient(circle at 35% 30%, #fff7b0, #ffbf1f 55%, #b86b00)',
          }}
        />
      ))}
    </div>
  );
};

const Rays: React.FC<{ color?: string }> = ({ color = 'rgba(255,220,90,0.18)' }) => (
  <div
    className="dh-rays absolute left-1/2 top-1/2 w-[160vmax] h-[160vmax] -ml-[80vmax] -mt-[80vmax] pointer-events-none"
    style={{ background: `repeating-conic-gradient(${color} 0deg 8deg, transparent 8deg 20deg)` }}
  />
);

const BigWinOverlay: React.FC<{ amount: number; bet: number; onClick: () => void }> = ({ amount, bet, onClick }) => {
  const tier = getWinTier(amount, bet);
  const label = tier.id === 'win' || tier.id === 'none' ? 'BIG WIN' : tier.label;
  return (
    <div
      onClick={onClick}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden cursor-pointer bg-[radial-gradient(circle,rgba(60,20,0,0.75),rgba(0,0,0,0.9))]"
    >
      <Rays />
      <Coins />
      <div key={label} className="relative dh-pop dh-font-xl dh-bigwin-text text-[clamp(44px,10vw,120px)] leading-none text-center px-4">
        {label}
      </div>
      <div className="relative mt-4 dh-font text-[clamp(36px,7vw,84px)] text-white drop-shadow-[0_5px_0_#3b1d0e]" style={{ WebkitTextStroke: '2px #3b1d0e' }}>
        {fmt(Math.floor(amount))}
      </div>
      <div className="relative mt-2 text-white/60 text-xs font-semibold">Cliquez pour passer</div>
    </div>
  );
};

const FreeSpinsIntro: React.FC<{ values: number[]; revealed: number; onStart: () => void }> = ({ values, revealed, onStart }) => {
  const done = revealed >= 9;
  const total = values.slice(0, revealed).reduce((a, b) => a + b, 0);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-black/75 p-4">
      <Rays color="rgba(255,90,180,0.16)" />
      <div className="relative dh-pop w-full max-w-md rounded-3xl border-[5px] border-[#3b1d0e] bg-gradient-to-b from-[#c27438] to-[#7a3f1a] p-5 text-center shadow-2xl">
        <div className="dh-font-xl text-3xl sm:text-4xl dh-bigwin-text">FÉLICITATIONS !</div>
        <p className="dh-font text-white mt-1 mb-4">La machine tire vos tours gratuits…</p>
        <div className="grid grid-cols-3 gap-2 mx-auto w-fit rounded-xl bg-[#3b1d0e] p-2">
          {values.map((v, i) => (
            <div
              key={i}
              className={`w-16 h-16 sm:w-20 sm:h-20 rounded-lg flex items-center justify-center dh-font text-4xl border-2 border-[#3b1d0e] ${
                i < revealed ? 'dh-pop bg-gradient-to-b from-[#fff1d0] to-[#e7b77a] text-[#b83a12]' : 'bg-[#6b3a1a] text-white/30'
              }`}
            >
              {i < revealed ? v : '?'}
            </div>
          ))}
        </div>
        <div className="mt-4 dh-font text-white text-xl">
          <span className="text-[#ffe14a] text-4xl">{total}</span> TOURS GRATUITS
        </div>
        <p className="text-white/70 text-xs mt-1">Chaque WILD qui tombe reste collé jusqu'à la fin du bonus.</p>
        <button
          onClick={onStart}
          disabled={!done}
          className="mt-4 dh-font text-xl px-10 py-3 rounded-full bg-gradient-to-b from-[#7dff5a] to-[#1fa33a] border-[3px] border-[#0a4515] text-[#0a2d0a] shadow-[0_4px_0_#0a4515] disabled:opacity-40"
        >
          COMMENCER
        </button>
      </div>
    </div>
  );
};

const FreeSpinsEnd: React.FC<{ win: number; spins: number; onClose: () => void }> = ({ win, spins, onClose }) => (
  <div onClick={onClose} className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-black/75 p-4 cursor-pointer">
    <Rays />
    {win > 0 && <Coins count={24} />}
    <div className="relative dh-pop w-full max-w-md rounded-3xl border-[5px] border-[#3b1d0e] bg-gradient-to-b from-[#c27438] to-[#7a3f1a] p-6 text-center shadow-2xl">
      <div className="dh-font-xl text-3xl sm:text-4xl dh-bigwin-text">FÉLICITATIONS !</div>
      <p className="dh-font text-white mt-2">VOUS AVEZ GAGNÉ</p>
      <div className="dh-font text-6xl text-[#ffe14a] my-2 drop-shadow-[0_4px_0_#3b1d0e]">{fmt(win)}</div>
      <p className="dh-font text-white">EN {spins} TOURS GRATUITS</p>
      <button className="mt-5 dh-font text-xl px-10 py-3 rounded-full bg-gradient-to-b from-[#7dff5a] to-[#1fa33a] border-[3px] border-[#0a4515] text-[#0a2d0a] shadow-[0_4px_0_#0a4515]">
        CONTINUER
      </button>
    </div>
  </div>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({
  title,
  onClose,
  children,
  wide,
}) => (
  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
    <div
      onClick={(e) => e.stopPropagation()}
      className={`dh-pop relative w-full ${wide ? 'max-w-3xl' : 'max-w-sm'} max-h-full overflow-y-auto rounded-3xl border-[4px] border-[#3b1d0e] bg-gradient-to-b from-[#8a4d22] to-[#4a2410] p-5 shadow-2xl`}
    >
      <button onClick={onClose} aria-label="Fermer" className="absolute top-3 right-3 text-white/80 hover:text-white">
        <X size={20} />
      </button>
      <h3 className="dh-font text-2xl text-[#ffe14a] text-center mb-4 pr-6">{title}</h3>
      {children}
    </div>
  </div>
);

const SettingRow: React.FC<{ label: string; value: boolean; onToggle: () => void }> = ({ label, value, onToggle }) => (
  <button onClick={onToggle} className="w-full flex items-center justify-between rounded-xl bg-black/30 px-4 py-3">
    <span className="text-sm font-semibold">{label}</span>
    <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${value ? 'bg-[#7dff5a]' : 'bg-white/25'}`}>
      <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : ''}`} />
    </span>
  </button>
);

const PaytableModal: React.FC<{ bet: number; onClose: () => void }> = ({ bet, onClose }) => {
  const lineBet = bet / DOG_PAYLINES.length;
  return (
    <Modal title="TABLE DES GAINS" onClose={onClose} wide>
      <p className="text-center text-white/60 text-xs mb-4">Valeurs affichées pour une mise de {fmt(bet)}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {PAYING_SYMBOLS.map((id) => (
          <div key={id} className="flex items-center gap-3 rounded-xl bg-black/30 p-2.5">
            <div className="w-14 h-14 shrink-0">
              <DogSymbol id={id} />
            </div>
            <div className="dh-font text-sm leading-snug">
              {[5, 4, 3].map((n) => (
                <div key={n}>
                  <span className="text-[#ffe14a]">{n} </span>
                  <span className="text-white">{fmt(lineBet * DOG_SYMBOLS[id].pays[n - 3])}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <div className="flex gap-3 rounded-xl bg-black/30 p-3">
          <div className="w-16 h-16 shrink-0">
            <DogSymbol id="wild" multiplier={3} />
          </div>
          <p className="text-white/85 text-xs leading-relaxed">
            <b className="text-[#ffe14a]">WILD</b> — rouleaux 2, 3 et 4 uniquement. Remplace tous les symboles sauf le BONUS.
            Chaque WILD porte un multiplicateur x2 ou x3 ; plusieurs WILD sur une même ligne voient leurs multiplicateurs
            <b> additionnés</b>.
          </p>
        </div>
        <div className="flex gap-3 rounded-xl bg-black/30 p-3">
          <div className="w-16 h-16 shrink-0">
            <DogSymbol id="scatter" />
          </div>
          <p className="text-white/85 text-xs leading-relaxed">
            <b className="text-[#ffe14a]">BONUS</b> — rouleaux 1, 3 et 5. 3 BONUS paient{' '}
            <b>{fmt(bet * SCATTER_PAY_X_BET)}</b> ({SCATTER_PAY_X_BET}x la mise) et déclenchent 9 à 27 TOURS GRATUITS :
            chaque WILD qui tombe reste collé avec son multiplicateur jusqu'à la fin.
          </p>
        </div>
      </div>

      <h4 className="dh-font text-lg text-[#ffe14a] text-center mt-5 mb-2">20 LIGNES</h4>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {DOG_PAYLINES.map((rows, i) => (
          <div key={i} className="rounded-lg bg-black/30 p-1.5">
            <div className="dh-font text-[10px] text-white/70 text-center">{i + 1}</div>
            <div className="grid grid-cols-5 gap-[2px]">
              {[0, 1, 2].map((row) =>
                rows.map((r, reel) => (
                  <span
                    key={`${row}-${reel}`}
                    className="aspect-square rounded-[2px]"
                    style={{ background: r === row ? LINE_COLORS[i] : 'rgba(255,255,255,0.12)' }}
                  />
                )),
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-white/50 text-[11px] text-center mt-4">
        Gains de gauche à droite sur lignes adjacentes. Seul le gain le plus élevé par ligne est payé. Gain maximum :{' '}
        {fmt(MAX_WIN_X_BET)}x la mise. RTP théorique ≈ 96,5 %.
      </p>
    </Modal>
  );
};

const GameInfoStrip: React.FC = () => (
  <div className="bg-[#0f1923] border-t border-white/5">
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
      <div className="col-span-2 sm:col-span-1">
        <div className="text-white font-bold text-lg">The Dog House</div>
        <div className="text-[#b1bad3] text-xs">Diamond Originals · Machine à sous</div>
      </div>
      {[
        { l: 'RTP', v: '96,5 %' },
        { l: 'Volatilité', v: 'Élevée' },
        { l: 'Gain max', v: `${fmt(MAX_WIN_X_BET)}x` },
        { l: 'Lignes', v: '20 fixes' },
      ].map((s) => (
        <div key={s.l} className="rounded-lg bg-[#1a2c38] px-3 py-2">
          <div className="text-[#b1bad3] text-[11px] font-semibold">{s.l}</div>
          <div className="text-white font-bold text-sm">{s.v}</div>
        </div>
      ))}
    </div>
  </div>
);
