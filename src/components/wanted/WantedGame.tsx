import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Info, Menu, Minus, Play, Plus, RotateCw, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { useCasinoUser } from '../../context/CasinoUserContext';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import { MachineClosedBanner, useMachineClosed } from '../MachineClosedBanner';
import { apiPlaySlotRound, CasinoApiError } from '../../lib/supabase';
import { clampBetLevels } from '../../lib/gamesConfig';
import { useSlotTimeline } from '../slots/useSlotTimeline';
import { useSlotWarmup } from '../slots/useSlotWarmup';
import { WantedAudio } from './wantedAudio';
import { GameVolumeButton, GameVolumeModalRow } from '../VolumeControl';
import { WantedLogo, WantedSymbol } from './WantedSymbols';
import {
  BONUS_INFO,
  MAX_WIN_X,
  PAYING,
  PAYLINES,
  PAYTABLE,
  REELS,
  ROWS,
  getWantedTier,
  playWantedRound,
  randomStripSymbol,
  type Cell,
  type DmhLanding,
  type VsReel,
  type WantedBonus,
  type WantedBonusRound,
  type WantedLineWin,
  type WantedRound,
  type WantedSpinResult,
  type WantedSymbolId,
} from './wantedEngine';

const BET_LEVELS = [20, 40, 60, 100, 200, 400, 600, 1000, 2000, 4000, 6000, 10000, 20000, 40000, 100000];
const LINE_COLORS = [
  '#ffd35a', '#5ae1ff', '#ff6a4a', '#7dff8a', '#ff7de0', '#ffa04a', '#b0a0ff', '#5affc8',
  '#ffe0a0', '#ff5a8a', '#a0ff5a', '#5a9dff', '#ffc85a', '#e05aff', '#5affff',
];
const STRIP_LEN = 14;
const DEMO_KEY = 'diamond_wanted_demo_chips';
const DEMO_START = 50000;

const INITIAL_GRID: WantedSymbolId[][] = [
  ['vs', 'whiskey', 'revolver', '10', 'A'],
  ['revolver', 'J', 'J', 'J', 'vs'],
  ['wild', 'skull', 'vs', 'bag', 'bag'],
  ['vs', 'bag', 'K', 'whiskey', 'whiskey'],
  ['bag', 'whiskey', 'revolver', 'skull', 'vs'],
];

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const randomStrip = (r: number) => Array.from({ length: STRIP_LEN }, () => randomStripSymbol(r));

type Phase = 'idle' | 'spinning' | 'overlay';

interface BonusState {
  bonus: WantedBonus;
  spin: number;
  total: number;
  win: number;
  multiplier: number;
}

interface DuelAnim {
  reel: number;
  top: number;
  bottom: number;
  winner: number;
  stage: 'face' | 'shot';
}

interface DmhBoardState {
  landings: DmhLanding[];
  respins: number;
  multiplier: number;
  fresh: Set<string>;
}

export const WantedGame: React.FC = () => {
  const { user, isAuthenticated, applyServerProfile } = useCasinoUser();
  const { gamesConfig } = useCasinoAdmin();
  const cfg = gamesConfig.wanted;
  const closed = useMachineClosed('wanted');
  const buyPrices = cfg.buyPrices;
  const betLevels = useMemo(() => clampBetLevels(BET_LEVELS, cfg.minBet, cfg.maxBet), [cfg.minBet, cfg.maxBet]);

  // ---------------------------------------------------------------------------
  // Solde
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
    const handleStorage = (e: StorageEvent) => {
      if (e.key === DEMO_KEY && e.newValue) {
        const val = Number(e.newValue);
        if (!isNaN(val) && val >= 0) setDemoChips(val);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);
  useEffect(() => {
    if (!isAuthenticated && mode === 'real') setMode('demo');
  }, [isAuthenticated, mode]);

  const balance = mode === 'real' ? (user?.chips ?? 0) : demoChips;
  const [hiddenWin, setHiddenWin] = useState(0);
  const displayCredit = Math.max(0, balance - hiddenWin);
  // Machine fermée par la direction : plus de mise en jetons (le serveur refuse aussi)
  const blockedRef = useRef(false);
  blockedRef.current = !!closed && mode === 'real';

  // ---------------------------------------------------------------------------
  // État de jeu
  // ---------------------------------------------------------------------------
  const [betIdx, setBetIdx] = useState(4);
  const bet = betLevels[Math.min(betIdx, betLevels.length - 1)];

  const [grid, setGrid] = useState<WantedSymbolId[][]>(INITIAL_GRID);
  const [vsShown, setVsShown] = useState<VsReel[]>([]);
  const [stickyWilds, setStickyWilds] = useState<Cell[]>([]);
  const [duel, setDuel] = useState<DuelAnim | null>(null);
  const [spinning, setSpinning] = useState<boolean[]>([false, false, false, false, false]);
  const [landKeys, setLandKeys] = useState<number[]>([0, 0, 0, 0, 0]);
  const [anticip, setAnticip] = useState(-1);
  const [strips, setStrips] = useState<WantedSymbolId[][]>(() => [0, 1, 2, 3, 4].map(randomStrip));
  const [phase, setPhase] = useState<Phase>('idle');
  const [presentation, setPresentation] = useState<{ wins: WantedLineWin[]; total: number } | null>(null);
  const [activeLine, setActiveLine] = useState(-1);
  const [scatterHit, setScatterHit] = useState(false);
  const [counter, setCounter] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [message, setMessage] = useState('');
  const [bigWin, setBigWin] = useState<{ amount: number; shown: number; bet: number } | null>(null);
  const [bonusState, setBonusState] = useState<BonusState | null>(null);
  const [intro, setIntro] = useState<{ bonus: WantedBonus } | null>(null);
  const [end, setEnd] = useState<{ bonus: WantedBonus; win: number } | null>(null);
  const [dmhBoard, setDmhBoard] = useState<DmhBoardState | null>(null);

  const [turbo, setTurbo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);

  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem('diamond_sound_muted') === 'true';
    } catch {
      return false;
    }
  });
  const [volume, setVolume] = useState(() => {
    try {
      const v = localStorage.getItem('diamond_sound_volume');
      if (v !== null) {
        const parsed = parseFloat(v);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
      }
      return 0.8;
    } catch {
      return 0.8;
    }
  });

  const audio = useRef(new WantedAudio());
  audio.current.volume = volume;
  audio.current.muted = muted;
  useEffect(() => () => audio.current.close(), []);

  const handleVolumeChange = useCallback((newVol: number) => {
    const clamped = Math.max(0, Math.min(1, Math.round(newVol * 100) / 100));
    setVolume(clamped);
    if (clamped > 0 && muted) {
      setMuted(false);
      try { localStorage.setItem('diamond_sound_muted', 'false'); } catch {}
    }
    try { localStorage.setItem('diamond_sound_volume', String(clamped)); } catch {}
  }, [muted]);

  const turboRef = useRef(turbo);
  turboRef.current = turbo;
  const busyRef = useRef(false);
  const { wait, skipAll, waitClick, resolveClick, countUp } = useSlotTimeline();
  useSlotWarmup(mode === 'real');

  // Manche tirée par le SERVEUR en mode jetons (mise et gain réglés en base
  // avant l'animation), localement en mode démo.
  const obtainRound = useCallback(
    async (buy: WantedBonus | null): Promise<WantedRound | null> => {
      if (mode === 'real') {
        try {
          const res = await apiPlaySlotRound<WantedRound>({ game: 'wanted', bet, buy });
          setHiddenWin(res.paid);
          applyServerProfile(res.profile);
          return res.round;
        } catch (err) {
          setMessage(err instanceof CasinoApiError ? err.message.toUpperCase() : 'ERREUR SERVEUR');
          return null;
        }
      }
      const round = playWantedRound({ bet, buy, buyPrices });
      setHiddenWin(round.totalWin);
      setDemoChips((prev) => Math.max(0, Math.round((prev - round.cost + round.totalWin) * 100) / 100));
      return round;
    },
    [mode, bet, buyPrices, applyServerProfile],
  );

  // ---------------------------------------------------------------------------
  // Rouleaux + duels VS
  // ---------------------------------------------------------------------------
  /** Lance les rouleaux (visuel + son) ; renvoie l'instant de départ */
  const startReels = useCallback((keepVs: VsReel[]) => {
    setVsShown(keepVs);
    setStrips([0, 1, 2, 3, 4].map(randomStrip));
    setSpinning([0, 1, 2, 3, 4].map((r) => !keepVs.some((v) => v.reel === r)));
    setAnticip(-1);
    audio.current.spinStart();
    return performance.now();
  }, []);

  const animateReels = useCallback(
    async (res: WantedSpinResult, opts: { anticipation: boolean; keepVs: VsReel[]; startedAt?: number }) => {
      const fast = turboRef.current;
      // Les rouleaux ont pu être lancés avant la réponse du serveur : on ne
      // compte que le temps de rotation minimal restant.
      const t0 = opts.startedAt ?? startReels(opts.keepVs);

      const scatterOn = (r: number) => res.scatterCells.some((s) => s.reel === r);
      const anticipateLast = opts.anticipation && scatterOn(0) && scatterOn(2);

      await wait(Math.max(0, (fast ? 240 : 480) - (performance.now() - t0)));
      let scatterCount = 0;
      for (let r = 0; r < REELS; r++) {
        if (r > 0) {
          if (r === 4 && anticipateLast) {
            setAnticip(4);
            audio.current.startAnticipation();
            await wait(fast ? 900 : 1700);
          } else {
            await wait(fast ? 80 : 170);
          }
        }
        setGrid((prev) => prev.map((col, i) => (i === r ? res.landed[r] : col)));
        setSpinning((prev) => prev.map((s, i) => (i === r ? false : s)));
        setLandKeys((prev) => prev.map((k, i) => (i === r ? k + 1 : k)));
        if (scatterOn(r)) {
          scatterCount++;
          audio.current.scatterDrop(scatterCount);
        } else {
          audio.current.reelStop(r, false);
        }
      }
      setAnticip(-1);
      audio.current.stopAnticipation();

      // Duels : chaque VS gagnant s'étend et révèle son multiplicateur
      const shown = [...opts.keepVs];
      for (const v of res.newVsReels) {
        await wait(fast ? 150 : 320);
        const flip = Math.random() < 0.5;
        setDuel({ reel: v.reel, top: flip ? v.multiplier : v.loser, bottom: flip ? v.loser : v.multiplier, winner: v.multiplier, stage: 'face' });
        audio.current.anticipation();
        await wait(fast ? 450 : 900);
        audio.current.vsClash(v.multiplier);
        setDuel((d) => (d ? { ...d, stage: 'shot' } : d));
        await wait(fast ? 350 : 700);
        shown.push(v);
        setVsShown([...shown]);
        setDuel(null);
      }
      setGrid(res.grid);
    },
    [wait, startReels],
  );

  const presentWins = useCallback(
    async (res: WantedSpinResult, stakeBet: number, counterBase: number) => {
      if (res.totalWin <= 0) return;
      const fast = turboRef.current;
      setPresentation({ wins: res.wins, total: res.totalWin });
      setActiveLine(-1);
      const tier = getWantedTier(res.totalWin, stakeBet);
      if (tier.id === 'win') {
        audio.current.win(res.totalWin / stakeBet >= 3 ? 'medium' : 'small');
        await countUp(counterBase, counterBase + res.totalWin, fast ? 350 : 800, (v) => {
          setCounter(v);
          audio.current.coinTick();
        });
        await wait(fast ? 350 : 900);
      } else {
        audio.current.win('medium');
        await wait(fast ? 300 : 700);
        setBigWin({ amount: res.totalWin, shown: 0, bet: stakeBet });
        audio.current.bigWinStart();
        const durations: Record<string, number> = { big: 3200, mega: 4800, epic: 6500, max: 8000 };
        const duration = durations[tier.id] ?? 3200;
        await countUp(0, res.totalWin, fast ? duration / 2 : duration, (v) => {
          setBigWin((b) => (b ? { ...b, shown: v } : b));
          audio.current.coinTick();
        });
        setCounter(counterBase + res.totalWin);
        audio.current.win('big');
        await wait(2500);
        setBigWin(null);
      }
    },
    [countUp, wait],
  );

  // ---------------------------------------------------------------------------
  // Bonus
  // ---------------------------------------------------------------------------
  const runBonus = useCallback(
    async (round: WantedBonusRound, stakeBet: number, alreadyWon: number) => {
      const bonus = round.bonus;
      setPhase('overlay');
      setIntro({ bonus });
      audio.current.bonusTrigger(bonus);
      await waitClick();
      setIntro(null);
      setPresentation(null);
      setScatterHit(false);
      setCounter(0);
      setVsShown([]);
      setStickyWilds([]);

      let bonusWin = 0;
      const multiplier = round.multiplier;
      let sticky: Cell[] = [];
      let stickyVs: VsReel[] = [];
      const total = BONUS_INFO[bonus].spins;

      if (round.collect) {
        // Phase 1 : collecte (déjà tirée, on la rejoue)
        setPhase('spinning');
        const landings: DmhLanding[] = [];
        let respins = 3;
        let mult = 0;
        setDmhBoard({ landings: [], respins, multiplier: 1, fresh: new Set() });
        setMessage('COLLECTE');
        await wait(700);
        for (const step of round.collect.steps) {
          audio.current.spinStart();
          await wait(turboRef.current ? 350 : 700);
          step.forEach((l) => {
            landings.push(l);
            if (l.kind === 'mult') mult += l.value;
          });
          respins = step.length > 0 ? 3 : respins - 1;
          if (step.length > 0) audio.current.collect();
          else audio.current.reelStop(2, false);
          setDmhBoard({
            landings: [...landings],
            respins,
            multiplier: Math.max(1, mult),
            fresh: new Set(step.map((l) => `${l.reel}-${l.row}`)),
          });
          await wait(turboRef.current ? 250 : 500);
        }
        await wait(900);
        sticky = round.collect.wilds;
        setDmhBoard(null);
        setMessage('SHOWDOWN');
      }

      setBonusState({ bonus, spin: 0, total, win: 0, multiplier });
      setStickyWilds(sticky);
      setPhase('spinning');

      for (let i = 1; i <= round.spins.length; i++) {
        await wait(turboRef.current ? 250 : 550);
        setPresentation(null);
        setBonusState({ bonus, spin: i, total, win: bonusWin, multiplier });

        const res = round.spins[i - 1];
        await animateReels(res, { anticipation: false, keepVs: stickyVs });
        if (bonus === 'gtr') {
          sticky = res.stickyWilds;
          setStickyWilds(sticky);
        }
        if (bonus === 'duel') stickyVs = res.vsReels.map((v) => ({ ...v, sticky: true }));

        await presentWins(res, stakeBet, bonusWin);
        bonusWin += res.totalWin;
        setHiddenWin((h) => Math.max(0, h - res.totalWin));
        setBonusState({ bonus, spin: i, total, win: bonusWin, multiplier });
      }

      await wait(600);
      setPhase('overlay');
      setEnd({ bonus, win: bonusWin });
      audio.current.bonusEnd();
      await waitClick();
      setEnd(null);
      setBonusState(null);
      setStickyWilds([]);
      setVsShown([]);
      setPresentation(null);
      setCounter(0);
      setLastWin(alreadyWon + bonusWin);
      setMessage('');
    },
    [animateReels, presentWins, wait, waitClick],
  );

  const playRound = useCallback(
    async (buy: WantedBonus | null) => {
      if (busyRef.current) return;
      if (blockedRef.current) {
        setMessage('MACHINE FERMÉE');
        setAutoLeft(0);
        return;
      }
      const cost = buy ? bet * buyPrices[buy] : bet;
      if (displayCredit < cost) {
        setMessage('SOLDE INSUFFISANT');
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
      setLastWin(0);
      setMessage('');

      // Les rouleaux tournent pendant que le serveur tire la manche : le
      // résultat n'est connu qu'à la réponse, l'aléa reste entièrement serveur.
      const startedAt = startReels([]);
      const round = await obtainRound(buy);
      if (!round) {
        setSpinning([false, false, false, false, false]);
        setAutoLeft(0);
        setPhase('idle');
        busyRef.current = false;
        return;
      }
      const res = round.base;

      await animateReels(res, { anticipation: !buy, keepVs: [], startedAt });
      if (res.bonus) {
        setScatterHit(true);
        setAutoLeft(0);
      }
      await presentWins(res, bet, 0);
      setHiddenWin((h) => Math.max(0, h - res.totalWin));
      setLastWin(res.totalWin);

      if (round.bonus) {
        await wait(1100);
        await runBonus(round.bonus, bet, res.totalWin);
      }
      setHiddenWin(0);
      setPhase('idle');
      busyRef.current = false;
    },
    [animateReels, startReels, bet, buyPrices, displayCredit, obtainRound, presentWins, runBonus, wait],
  );

  const onSpinPress = useCallback(() => {
    if (resolveClick()) return;
    if (busyRef.current) {
      skipAll();
      return;
    }
    audio.current.click();
    void playRound(null);
  }, [playRound, resolveClick, skipAll]);

  useEffect(() => {
    if (phase !== 'idle' || autoLeft <= 0) return;
    const t = setTimeout(() => {
      setAutoLeft((n) => n - 1);
      void playRound(null);
    }, turbo ? 150 : 450);
    return () => clearTimeout(t);
  }, [phase, autoLeft, turbo, playRound]);

  useEffect(() => {
    if (phase === 'spinning' || !presentation || presentation.wins.length === 0) return;
    let i = -1;
    const t = setInterval(() => {
      i = i + 1 >= presentation.wins.length ? -1 : i + 1;
      setActiveLine(i);
    }, 1500);
    return () => clearInterval(t);
  }, [phase, presentation]);

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
    if (activeLine >= 0) return presentation.wins[activeLine] ? [presentation.wins[activeLine]] : [];
    return presentation.wins;
  }, [presentation, activeLine]);

  const statusText = (() => {
    if (presentation && activeLine >= 0) {
      const w = presentation.wins[activeLine];
      if (w) return `LIGNE ${w.lineIndex + 1} · ${fmt(w.win)}${w.multiplier > 1 ? ` (x${w.multiplier})` : ''}`;
    }
    return message;
  })();

  const locked = phase !== 'idle' || autoLeft > 0;
  const winShown = presentation ? counter : lastWin;
  const theme: WantedBonus | null = bonusState?.bonus ?? (dmhBoard ? 'dmh' : null);

  return (
    <div className="relative bg-[#120a07] pt-[80px] sm:pt-[90px]">
      <MachineClosedBanner state={closed} />
      <div className="relative w-full overflow-hidden select-none" style={{ height: 'max(680px, calc(100svh - 90px))' }}>
        <Backdrop theme={theme} />

        {/* Haut */}
        <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between gap-2">
          <Link
            to="/jeux"
            className="flex items-center gap-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur px-3 py-1.5 text-xs font-semibold text-white transition-colors"
          >
            <ArrowLeft size={14} /> Lobby
          </Link>
          <div className="flex items-center rounded-full bg-black/50 backdrop-blur p-1 text-[11px] font-bold">
            <button
              onClick={() => !locked && isAuthenticated && setMode('real')}
              disabled={locked || !isAuthenticated}
              title={isAuthenticated ? 'Jouer avec vos jetons' : 'Connectez-vous pour jouer avec vos jetons'}
              className={`px-3 py-1 rounded-full transition-colors ${
                mode === 'real' ? 'bg-[#e0b040] text-[#1c120c]' : 'text-white/70 hover:text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              JETONS
            </button>
            <button
              onClick={() => !locked && setMode('demo')}
              disabled={locked}
              className={`px-3 py-1 rounded-full transition-colors ${
                mode === 'demo' ? 'bg-white text-[#1c120c]' : 'text-white/70 hover:text-white'
              }`}
            >
              DÉMO
            </button>
          </div>
        </div>

        {/* Plateau */}
        <div className="absolute inset-x-0 top-12 bottom-[150px] flex items-center justify-center gap-5 px-2 sm:px-6">
          {cfg.buyEnabled && (
            <SidePanel
              className="hidden lg:flex"
              onBuy={() => setBuyOpen(true)}
              disabled={locked || !!bonusState}
              fromPrice={bet * Math.min(buyPrices.gtr, buyPrices.duel, buyPrices.dmh)}
            />
          )}
          <div className="relative flex-1 h-full min-w-0 max-w-[720px] flex items-center justify-center" style={{ containerType: 'size' }}>
            <div className="relative flex flex-col items-center" style={{ width: 'min(100cqw, calc(100cqh * 0.84))' }}>
              <WantedLogo className="relative z-20 -mb-[3%]" />
              <div className="relative w-full rounded-lg border-[5px] border-[#1c120c] p-[2%] shadow-[0_20px_50px_rgba(0,0,0,0.6)] bg-[linear-gradient(180deg,#4a3322,#2a1a10)]">
                <div className="absolute inset-0 rounded-md opacity-40 bg-[repeating-linear-gradient(90deg,transparent_0_46px,rgba(0,0,0,0.35)_46px_49px)] pointer-events-none" />
                {bonusState && <BonusBanner state={bonusState} />}
                <div className="relative rounded bg-[#1a100a] overflow-hidden">
                  {dmhBoard ? (
                    <DmhBoard board={dmhBoard} />
                  ) : (
                    <div className="relative grid grid-cols-5 gap-[2px] p-[2px]">
                      {[0, 1, 2, 3, 4].map((r) => (
                        <Reel
                          key={r}
                          reel={r}
                          symbols={grid[r]}
                          strip={strips[r]}
                          spinning={spinning[r]}
                          fast={turbo}
                          landKey={landKeys[r]}
                          anticipating={anticip === r}
                          sticky={stickyWilds.filter((c) => c.reel === r)}
                          vs={vsShown.find((v) => v.reel === r) ?? null}
                          duel={duel?.reel === r ? duel : null}
                          winningCells={winningCells}
                          dim={!!presentation && winningCells.size > 0}
                          scatterHit={scatterHit}
                        />
                      ))}
                      <Paylines lines={shownLines} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="hidden lg:flex w-[170px] shrink-0 flex-col gap-2">
            <InfoCard title="GAIN MAX" value={`${fmt(MAX_WIN_X)}x`} />
            <InfoCard title="VS" value="x2 → x100" sub="Multiplicateurs additionnés sur la ligne" />
            <InfoCard title="RTP" value="96,4 %" />
          </div>
        </div>

        <ControlBar
          credit={displayCredit}
          bet={bet}
          win={winShown}
          demo={mode === 'demo'}
          status={statusText}
          spinning={phase !== 'idle'}
          locked={locked}
          autoLeft={autoLeft}
          turbo={turbo}
          muted={muted}
          volume={volume}
          canDec={betIdx > 0}
          canInc={betIdx < betLevels.length - 1}
          onDec={() => setBetIdx((i) => Math.max(0, i - 1))}
          onInc={() => setBetIdx((i) => Math.min(betLevels.length - 1, i + 1))}
          onSpin={onSpinPress}
          onAuto={() => (autoLeft > 0 ? setAutoLeft(0) : setAutoOpen(true))}
          onTurbo={() => setTurbo((t) => !t)}
          onMenu={() => setMenuOpen(true)}
          onInfo={() => setInfoOpen(true)}
          onMute={toggleMute}
          onVolumeChange={handleVolumeChange}
          onBuy={cfg.buyEnabled ? () => setBuyOpen(true) : undefined}
          buyDisabled={locked || !!bonusState}
        />

        {bigWin && <BigWinOverlay amount={bigWin.shown} bet={bigWin.bet} onClick={skipAll} />}
        {intro && <BonusIntro bonus={intro.bonus} onStart={resolveClick} />}
        {end && <BonusEnd bonus={end.bonus} win={end.win} onClose={resolveClick} />}

        {buyOpen && (
          <Modal title="ACHETER UN BONUS" onClose={() => setBuyOpen(false)} wide>
            <div className="grid sm:grid-cols-3 gap-3">
              {(Object.keys(BONUS_INFO) as WantedBonus[]).map((b) => {
                const price = bet * buyPrices[b];
                return (
                  <button
                    key={b}
                    disabled={displayCredit < price}
                    onClick={() => {
                      setBuyOpen(false);
                      void playRound(b);
                    }}
                    className="group rounded-xl border-[3px] border-[#1c120c] bg-[linear-gradient(180deg,#efe4cc,#c9b48a)] p-4 text-left text-[#1c120c] shadow-[0_5px_0_#1c120c] hover:-translate-y-0.5 transition-transform disabled:opacity-40 disabled:hover:translate-y-0"
                  >
                    <div className="w-14 h-14 mx-auto mb-2">
                      <WantedSymbol id={b === 'gtr' ? 'fs' : b === 'duel' ? 'duel' : 'dead'} />
                    </div>
                    <div className="font-['Rye'] text-lg leading-tight text-center">{BONUS_INFO[b].name}</div>
                    <div className="text-xs text-center mt-1 opacity-80">{BONUS_INFO[b].tagline}</div>
                    <div className="mt-3 text-center font-['Oswald'] font-bold text-2xl">{fmt(price)}</div>
                    <div className="text-center text-[11px] opacity-70">{buyPrices[b]}x la mise</div>
                  </button>
                );
              })}
            </div>
          </Modal>
        )}
        {autoOpen && (
          <Modal title="JEU AUTOMATIQUE" onClose={() => setAutoOpen(false)}>
            <p className="text-sm text-white/70 mb-4 text-center">S'arrête dès qu'un bonus est déclenché.</p>
            <div className="grid grid-cols-3 gap-2">
              {[10, 25, 50, 75, 100, 500].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setAutoOpen(false);
                    setAutoLeft(n);
                  }}
                  className="font-['Oswald'] font-bold text-xl py-3 rounded-lg bg-[#4a3322] hover:bg-[#6a4a32] border-2 border-[#1c120c] text-[#efe4cc] transition-colors"
                >
                  {n}
                </button>
              ))}
            </div>
          </Modal>
        )}
        {menuOpen && (
          <Modal title="MENU" onClose={() => setMenuOpen(false)}>
            <div className="space-y-2">
              <GameVolumeModalRow
                muted={muted}
                volume={volume}
                onMute={toggleMute}
                onVolumeChange={handleVolumeChange}
                accentClass="accent-[#e0b040]"
              />
              <MenuRow icon={<Zap size={18} />} label={turbo ? 'Désactiver le turbo' : 'Activer le turbo'} onClick={() => setTurbo((t) => !t)} />
              <MenuRow
                icon={<Info size={18} />}
                label="Règles et table des gains"
                onClick={() => {
                  setMenuOpen(false);
                  setInfoOpen(true);
                }}
              />
              <MenuRow
                icon={<RotateCw size={18} />}
                label={`Recharger le solde démo (${fmt(DEMO_START)})`}
                disabled={locked || mode !== 'demo'}
                onClick={() => setDemoChips(DEMO_START)}
              />
              <p className="text-xs text-white/50 pt-2">ESPACE pour tourner, ESPACE pendant la rotation pour arrêter.</p>
            </div>
          </Modal>
        )}
        {infoOpen && <RulesModal bet={bet} prices={buyPrices} onClose={() => setInfoOpen(false)} />}
      </div>
    </div>
  );
};

// =============================================================================
// Décor
// =============================================================================

const THEMES: Record<string, { sky: string; sun: string }> = {
  base: { sky: 'radial-gradient(ellipse at 30% 20%, #e8482a 0%, #b8231a 45%, #5a0e0a 100%)', sun: '#f5d86a' },
  gtr: { sky: 'radial-gradient(ellipse at 30% 20%, #d8a050 0%, #8a5a2a 50%, #2a1a0a 100%)', sun: '#ffe9a8' },
  duel: { sky: 'radial-gradient(ellipse at 30% 20%, #ff9a4a 0%, #c2451a 45%, #3a0a1a 100%)', sun: '#fff0b0' },
  dmh: { sky: 'radial-gradient(ellipse at 30% 20%, #6a3a6a 0%, #2a1030 50%, #07030a 100%)', sun: '#d8d0ff' },
};

const Backdrop: React.FC<{ theme: WantedBonus | null }> = ({ theme }) => {
  const t = THEMES[theme ?? 'base'];
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <div className="absolute inset-0 transition-[background] duration-1000" style={{ background: t.sky }} />
      <div
        className="absolute inset-0 opacity-30 mix-blend-multiply"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(0,0,0,0.5) 0 1px, transparent 2px), radial-gradient(circle at 70% 60%, rgba(0,0,0,0.4) 0 1px, transparent 2px)',
          backgroundSize: '9px 9px, 13px 13px',
        }}
      />
      <div
        className="absolute rounded-full transition-colors duration-1000"
        style={{ width: 260, height: 260, left: '-60px', top: '18%', background: t.sun, boxShadow: `0 0 120px 40px ${t.sun}55` }}
      />
      {/* silhouettes : arbre mort, collines, cactus */}
      <svg viewBox="0 0 1200 300" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 w-full h-[34%]">
        <path d="M0 180 Q150 120 300 170 T620 150 T900 175 T1200 140 V300 H0 Z" fill="#2a0a06" opacity="0.8" />
        <path d="M0 230 Q200 190 420 225 T820 210 T1200 225 V300 H0 Z" fill="#140604" />
        <g fill="#140604">
          <rect x="1020" y="120" width="16" height="110" rx="8" />
          <rect x="996" y="150" width="12" height="40" rx="6" />
          <rect x="996" y="178" width="30" height="12" rx="6" />
          <rect x="1048" y="140" width="12" height="44" rx="6" />
          <rect x="1030" y="172" width="30" height="12" rx="6" />
        </g>
      </svg>
      <svg viewBox="0 0 200 300" className="absolute left-0 top-[4%] h-[46%] opacity-90">
        <path d="M60 300 L70 150 Q40 110 10 100 M70 150 Q90 90 60 40 M68 120 Q110 90 150 95 M78 200 Q120 170 140 175" stroke="#1c0a06" strokeWidth="9" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
};

// =============================================================================
// Rouleau
// =============================================================================

interface ReelProps {
  reel: number;
  symbols: WantedSymbolId[];
  strip: WantedSymbolId[];
  spinning: boolean;
  fast: boolean;
  landKey: number;
  anticipating: boolean;
  sticky: Cell[];
  vs: VsReel | null;
  duel: DuelAnim | null;
  winningCells: Set<string>;
  dim: boolean;
  scatterHit: boolean;
}

const Reel: React.FC<ReelProps> = ({
  reel,
  symbols,
  strip,
  spinning,
  fast,
  landKey,
  anticipating,
  sticky,
  vs,
  duel,
  winningCells,
  dim,
  scatterHit,
}) => {
  const reelWinning = [0, 1, 2, 3, 4].some((row) => winningCells.has(`${reel}-${row}`));
  return (
    <div className={`relative overflow-hidden bg-[#2a1a10] ${anticipating ? 'wd-anticip' : ''}`}>
      {spinning ? (
        <div className="relative aspect-[1/5]">
          <div className={`absolute inset-x-0 top-0 dh-strip ${fast ? 'dh-strip-fast' : ''}`}>
            {[...strip, ...strip].map((s, i) => (
              <div key={i} className="aspect-square p-[6%]">
                <WantedSymbol id={s} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div key={landKey} className="dh-land relative aspect-[1/5] flex flex-col">
          {symbols.map((s, row) => {
            const isWin = winningCells.has(`${reel}-${row}`);
            const isScatter = scatterHit && (s === 'fs' || s === 'duel' || s === 'dead');
            return (
              <div
                key={row}
                className={`relative flex-1 p-[6%] transition-opacity duration-300 ${
                  dim && !isWin && !isScatter && !vs ? 'opacity-35' : ''
                } ${isWin && !vs ? 'wd-win' : ''} ${isScatter ? 'dh-scatter-hit' : ''}`}
              >
                <WantedSymbol id={s} />
              </div>
            );
          })}
        </div>
      )}

      {sticky.map((c) => (
        <div
          key={c.row}
          className="absolute inset-x-0 z-10 p-[6%] wd-sticky"
          style={{ top: `${(c.row / ROWS) * 100}%`, height: `${100 / ROWS}%` }}
        >
          <div className={`w-full h-full ${winningCells.has(`${reel}-${c.row}`) ? 'wd-win' : ''}`}>
            <WantedSymbol id="wild" />
          </div>
        </div>
      ))}

      {(vs || duel) && <VsReelPanel vs={vs} duel={duel} highlight={reelWinning} dim={dim && !reelWinning} />}
    </div>
  );
};

/** Rouleau VS étendu : deux pistoleros, le vainqueur donne son multiplicateur */
const VsReelPanel: React.FC<{ vs: VsReel | null; duel: DuelAnim | null; highlight: boolean; dim: boolean }> = ({
  vs,
  duel,
  highlight,
  dim,
}) => (
  <div
    className={`absolute inset-0 z-20 flex flex-col items-center justify-center overflow-hidden border-2 border-[#e0b040] transition-opacity ${
      dim ? 'opacity-60' : ''
    } ${highlight ? 'wd-vs-glow' : ''} ${duel ? 'wd-pop' : ''}`}
    style={{ background: 'linear-gradient(180deg, #e8b890 0%, #c2582e 40%, #8a2a1a 70%, #5a140c 100%)' }}
  >
    {/* crâne stylisé */}
    <svg viewBox="0 0 60 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full opacity-35">
      <path d="M8 30 Q8 6 30 6 Q52 6 52 30 Q52 44 44 50 L44 62 L16 62 L16 50 Q8 44 8 30 Z" fill="#fff1d8" />
      <ellipse cx="21" cy="30" rx="7" ry="8" fill="#5a140c" />
      <ellipse cx="39" cy="30" rx="7" ry="8" fill="#5a140c" />
      <path d="M30 38 L26 46 L34 46 Z" fill="#5a140c" />
      <path d="M20 62 V72 M26 62 V74 M34 62 V74 M40 62 V72" stroke="#fff1d8" strokeWidth="3" />
    </svg>
    {duel ? (
      <div className="relative flex flex-col items-center gap-[18%] h-full justify-center w-full">
        {[duel.top, duel.bottom].map((v, i) => {
          const lost = duel.stage === 'shot' && v !== duel.winner;
          const won = duel.stage === 'shot' && v === duel.winner;
          return (
            <div
              key={i}
              className={`relative flex flex-col items-center transition-all duration-300 ${lost ? 'opacity-25 grayscale scale-75' : ''} ${
                won ? 'scale-125' : ''
              }`}
            >
              <Gunslinger flip={i === 1} />
              <MultPlaque value={v} small />
            </div>
          );
        })}
        {duel.stage === 'shot' && <div className="absolute inset-0 wd-flash bg-white pointer-events-none" />}
      </div>
    ) : (
      vs && <MultPlaque value={vs.multiplier} />
    )}
  </div>
);

const Gunslinger: React.FC<{ flip?: boolean }> = ({ flip }) => (
  <svg viewBox="0 0 40 40" className="w-[70%] max-w-[46px]" style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
    <path d="M6 14 Q20 4 34 14 L30 16 L10 16 Z" fill="#1c120c" />
    <rect x="12" y="6" width="16" height="9" rx="3" fill="#1c120c" />
    <circle cx="20" cy="21" r="6" fill="#1c120c" />
    <path d="M10 40 L12 28 Q20 24 28 28 L30 40 Z" fill="#1c120c" />
    <path d="M28 30 L38 26 L38 29 L30 33 Z" fill="#1c120c" />
  </svg>
);

const MultPlaque: React.FC<{ value: number; small?: boolean }> = ({ value, small }) => (
  <div
    className={`font-['Oswald'] font-bold leading-none rounded-md border-[3px] border-[#1c120c] bg-[#efe4cc] text-[#c2231a] shadow-[0_3px_0_#1c120c] ${
      small ? 'text-[clamp(11px,2.6cqw,20px)] px-1.5 py-0.5' : 'text-[clamp(18px,5cqw,40px)] px-2 py-1'
    }`}
    style={{ WebkitTextStroke: small ? undefined : '1px #1c120c' }}
  >
    {value}X
  </div>
);

const Paylines: React.FC<{ lines: WantedLineWin[] }> = ({ lines }) => (
  <svg className="absolute inset-[2px] pointer-events-none z-30" viewBox={`0 0 ${REELS} ${ROWS}`} preserveAspectRatio="none">
    {lines.map((w) => {
      const pts = w.positions.map(([r, row]) => `${r + 0.5},${row + 0.5}`);
      // prolonge le trait jusqu'au bord droit de la ligne complète
      const full = PAYLINES[w.lineIndex].map((row, r) => `${r + 0.5},${row + 0.5}`);
      return (
        <g key={w.lineIndex}>
          <polyline points={full.join(' ')} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeDasharray="4 6" />
          <polyline points={pts.join(' ')} fill="none" stroke="#1c120c" strokeWidth="8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          <polyline
            points={pts.join(' ')}
            fill="none"
            stroke={LINE_COLORS[w.lineIndex % LINE_COLORS.length]}
            strokeWidth="4"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>
      );
    })}
  </svg>
);

// =============================================================================
// Dead Man's Hand
// =============================================================================

const DmhBoard: React.FC<{ board: DmhBoardState }> = ({ board }) => {
  const byCell = new Map(board.landings.map((l) => [`${l.reel}-${l.row}`, l]));
  return (
    <div className="relative">
      <div className="grid grid-cols-5 gap-[2px] p-[2px]">
        {[0, 1, 2, 3, 4].map((row) =>
          [0, 1, 2, 3, 4].map((reel) => {
            const key = `${reel}-${row}`;
            const l = byCell.get(key);
            return (
              <div key={key} className="relative aspect-square bg-[#140a14] border border-white/5 flex items-center justify-center">
                {l && (
                  <div className={`w-full h-full p-[8%] flex items-center justify-center ${board.fresh.has(key) ? 'wd-pop' : ''}`}>
                    {l.kind === 'wild' ? (
                      <WantedSymbol id="wild" />
                    ) : (
                      <div className="w-[80%] aspect-square rounded-full border-[3px] border-[#1c120c] bg-[radial-gradient(circle_at_35%_30%,#fff1b0,#e0b040_55%,#8a5a10)] flex items-center justify-center font-['Oswald'] font-bold text-[#5a140c] text-[clamp(12px,3.4cqw,26px)] shadow-[0_0_14px_rgba(224,176,64,0.7)]">
                        x{l.value}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }),
        )}
      </div>
      <div className="absolute inset-x-0 bottom-2 flex justify-center gap-2 pointer-events-none">
        <span className="rounded-md bg-black/75 px-3 py-1 font-['Oswald'] font-bold text-white text-sm">
          RESPINS <span className="text-[#e0b040]">{board.respins}</span>
        </span>
        <span className="rounded-md bg-black/75 px-3 py-1 font-['Oswald'] font-bold text-white text-sm">
          MULTIPLICATEUR <span className="text-[#e0b040]">x{board.multiplier}</span>
        </span>
      </div>
    </div>
  );
};

const BonusBanner: React.FC<{ state: BonusState }> = ({ state }) => (
  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-40 wd-pop whitespace-nowrap rounded-md border-[3px] border-[#1c120c] bg-[#efe4cc] px-3 py-0.5 font-['Oswald'] font-bold text-[#1c120c] text-xs sm:text-sm shadow-[0_3px_0_#1c120c]">
    {state.bonus === 'dmh' ? 'SHOWDOWN' : 'TOURS GRATUITS'} {state.spin}/{state.total}
    {state.multiplier > 1 && <span className="ml-2 text-[#c2231a]">x{state.multiplier}</span>}
    <span className="ml-3 text-[#2f7a52]">GAIN {fmt(state.win)}</span>
  </div>
);

// =============================================================================
// Contrôles façon Hacksaw
// =============================================================================

interface ControlBarProps {
  credit: number;
  bet: number;
  win: number;
  demo: boolean;
  status: string;
  spinning: boolean;
  locked: boolean;
  autoLeft: number;
  turbo: boolean;
  muted: boolean;
  volume: number;
  canDec: boolean;
  canInc: boolean;
  onDec: () => void;
  onInc: () => void;
  onSpin: () => void;
  onAuto: () => void;
  onTurbo: () => void;
  onMenu: () => void;
  onInfo: () => void;
  onMute: () => void;
  onVolumeChange: (vol: number) => void;
  onBuy?: () => void;
  buyDisabled: boolean;
}

// Même disposition que The Dog House : crédit/mise à gauche, gain au centre, spin + turbo/auto à droite.
const ControlBar: React.FC<ControlBarProps> = (p) => (
  <div className="absolute inset-x-0 bottom-0 z-30">
    <div className="bg-gradient-to-t from-black/90 via-black/70 to-black/0 pt-6 pb-3 px-3 sm:px-6">
      <div className="mx-auto max-w-[1100px] grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_1fr] items-end gap-x-2 gap-y-2">
        {/* Gauche : menu / infos / son + solde/mise */}
        <div className="flex items-end gap-2 sm:gap-4 min-w-0">
          <div className="flex flex-col gap-1.5">
            <button onClick={p.onMenu} title="Menu" aria-label="Menu" className="text-white/85 hover:text-white">
              <Menu size={18} />
            </button>
            <button onClick={p.onInfo} title="Table des gains et règles" aria-label="Table des gains" className="text-white/85 hover:text-white">
              <Info size={18} />
            </button>
            <GameVolumeButton
              muted={p.muted}
              volume={p.volume}
              onMute={p.onMute}
              onVolumeChange={p.onVolumeChange}
              accentClass="accent-[#e0b040]"
            />
          </div>
          <div className="leading-tight min-w-0 font-['Oswald'] font-bold tracking-wide">
            <div className="text-[13px] sm:text-base whitespace-nowrap">
              <span className="text-[#e0b040]">SOLDE </span>
              <span className="text-white">{fmt(p.credit)}</span>
              {p.demo && <span className="ml-1 text-[10px] text-white/50 align-middle">DÉMO</span>}
            </div>
            <div className="text-[13px] sm:text-base whitespace-nowrap">
              <span className="text-[#e0b040]">MISE </span>
              <span className="text-white">{fmt(p.bet)}</span>
            </div>
          </div>
        </div>

        {/* Centre : statut + gain */}
        <div className="col-span-2 sm:col-span-1 order-first sm:order-none flex flex-col items-center pb-1 min-w-0">
          {p.onBuy && (
            <button
              onClick={p.onBuy}
              disabled={p.buyDisabled}
              className="lg:hidden mb-2 font-['Oswald'] font-bold text-xs rounded-full px-3 py-1 bg-[linear-gradient(180deg,#6fd0a0,#2f7a52)] border-2 border-[#1c120c] text-[#0f2a1a] disabled:opacity-40"
            >
              BUY BONUS
            </button>
          )}
          <div className="h-5 font-['Oswald'] font-bold tracking-wide text-[#e0b040] text-xs sm:text-sm truncate max-w-full">{p.status}</div>
          <div
            className={`font-['Oswald'] font-bold text-center whitespace-nowrap text-[15px] sm:text-2xl ${
              p.win > 0 ? 'text-[#e0b040] drop-shadow-[0_0_10px_rgba(224,176,64,0.6)]' : 'text-white'
            }`}
          >
            GAIN {fmt(p.win)}
          </div>
        </div>

        {/* Droite : − SPIN + / turbo / auto */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={p.onDec}
              disabled={p.locked || !p.canDec}
              title="Diminuer la mise"
              aria-label="Diminuer la mise"
              className="w-10 h-10 rounded-lg bg-black/40 text-white flex items-center justify-center hover:bg-black/60 disabled:opacity-30"
            >
              <Minus size={22} strokeWidth={3} />
            </button>
            <button
              onClick={p.onSpin}
              aria-label="Tourner"
              title="Tourner (ESPACE)"
              className={`dh-spin-btn relative w-[76px] h-[76px] sm:w-[88px] sm:h-[88px] rounded-full flex items-center justify-center text-white active:scale-95 transition-transform ${
                p.spinning ? 'dh-spinning' : ''
              }`}
            >
              <RotateCw className="dh-spin-arrows w-full h-full" strokeWidth={2.2} />
              {p.autoLeft > 0 && (
                <span className="absolute inset-0 flex items-center justify-center font-['Oswald'] font-bold text-xl text-[#e0b040]">
                  {p.autoLeft}
                </span>
              )}
            </button>
            <button
              onClick={p.onInc}
              disabled={p.locked || !p.canInc}
              title="Augmenter la mise"
              aria-label="Augmenter la mise"
              className="w-10 h-10 rounded-lg bg-black/40 text-white flex items-center justify-center hover:bg-black/60 disabled:opacity-30"
            >
              <Plus size={22} strokeWidth={3} />
            </button>
          </div>
          <div className="flex items-center gap-2 pr-1">
            <button
              onClick={p.onTurbo}
              aria-pressed={p.turbo}
              className={`flex items-center gap-1 font-['Oswald'] font-bold tracking-wide text-[11px] px-2 py-0.5 rounded-full border ${
                p.turbo ? 'bg-[#e0b040] text-[#1c120c] border-[#e0b040]' : 'text-white border-white/50'
              }`}
            >
              <Zap size={11} fill={p.turbo ? 'currentColor' : 'none'} /> TURBO
            </button>
            <button
              onClick={p.onAuto}
              aria-pressed={p.autoLeft > 0}
              className={`flex items-center gap-1 font-['Oswald'] font-bold tracking-wide text-[11px] px-2 py-0.5 rounded-full border ${
                p.autoLeft > 0 ? 'bg-[#c2231a] text-white border-[#c2231a]' : 'text-white border-white/50'
              }`}
            >
              {p.autoLeft > 0 ? <X size={11} /> : <Play size={10} fill="currentColor" />}
              {p.autoLeft > 0 ? 'STOP AUTO' : 'AUTOPLAY'}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const SidePanel: React.FC<{ className?: string; onBuy: () => void; disabled: boolean; fromPrice: number }> = ({
  className = '',
  onBuy,
  disabled,
  fromPrice,
}) => (
  <div className={`${className} w-[170px] shrink-0 flex-col gap-2`}>
    <button
      onClick={onBuy}
      disabled={disabled}
      className="rounded-xl border-[3px] border-[#1c120c] bg-[linear-gradient(180deg,#6fd0a0,#2f7a52)] p-3 text-center shadow-[0_5px_0_#1c120c] hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:hover:translate-y-0"
    >
      <div className="font-['Rye'] text-lg text-[#0f2a1a] leading-tight">BUY BONUS</div>
      <div className="text-[11px] font-semibold text-[#0f2a1a]/80">dès {fmt(fromPrice)}</div>
    </button>
    {(Object.keys(BONUS_INFO) as WantedBonus[]).map((b) => (
      <div key={b} className="flex items-center gap-2 rounded-lg bg-black/50 backdrop-blur p-2 border border-white/10">
        <div className="w-9 h-9 shrink-0">
          <WantedSymbol id={b === 'gtr' ? 'fs' : b === 'duel' ? 'duel' : 'dead'} />
        </div>
        <div className="min-w-0">
          <div className="font-['Oswald'] font-bold text-[12px] text-[#e0b040] leading-tight truncate">{BONUS_INFO[b].name}</div>
          <div className="text-[10px] text-white/70 leading-tight">{BONUS_INFO[b].tagline}</div>
        </div>
      </div>
    ))}
  </div>
);

const InfoCard: React.FC<{ title: string; value: string; sub?: string }> = ({ title, value, sub }) => (
  <div className="rounded-lg bg-black/50 backdrop-blur p-3 text-center border border-white/10">
    <div className="font-['Oswald'] font-bold text-[#e0b040] text-xs tracking-wider">{title}</div>
    <div className="font-['Oswald'] font-bold text-white text-xl">{value}</div>
    {sub && <div className="text-[10px] text-white/60 leading-tight mt-0.5">{sub}</div>}
  </div>
);

// =============================================================================
// Overlays
// =============================================================================

const Rays: React.FC<{ color: string }> = ({ color }) => (
  <div
    className="dh-rays absolute left-1/2 top-1/2 w-[160vmax] h-[160vmax] -ml-[80vmax] -mt-[80vmax] pointer-events-none"
    style={{ background: `repeating-conic-gradient(${color} 0deg 7deg, transparent 7deg 18deg)` }}
  />
);

const Dust: React.FC = () => {
  const bits = useMemo(
    () =>
      Array.from({ length: 30 }, () => ({
        left: Math.random() * 100,
        size: 14 + Math.random() * 20,
        dur: 1.8 + Math.random() * 2,
        delay: Math.random() * 2.5,
      })),
    [],
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {bits.map((c, i) => (
        <div
          key={i}
          className="dh-coin absolute top-0 rounded-full border-2 border-[#6a3a08]"
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: c.size,
            animationDuration: `${c.dur}s`,
            animationDelay: `${c.delay}s`,
            animationIterationCount: 'infinite',
            background: 'radial-gradient(circle at 35% 30%, #fff1b0, #e0b040 55%, #8a5a10)',
          }}
        />
      ))}
    </div>
  );
};

const BigWinOverlay: React.FC<{ amount: number; bet: number; onClick: () => void }> = ({ amount, bet, onClick }) => {
  const tier = getWantedTier(amount, bet);
  const label = tier.id === 'win' || tier.id === 'none' ? 'BIG WIN' : tier.label;
  return (
    <div
      onClick={onClick}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden cursor-pointer bg-[radial-gradient(circle,rgba(90,20,10,0.8),rgba(0,0,0,0.92))]"
    >
      <Rays color="rgba(224,176,64,0.14)" />
      <Dust />
      <div
        key={label}
        className="relative wd-pop font-['Rye'] text-[clamp(44px,10vw,120px)] leading-none text-center px-4"
        style={{
          background: 'linear-gradient(180deg, #fff1b0 0%, #e0b040 45%, #a86a10 75%, #5a3008 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextStroke: '2px #1c120c',
          filter: 'drop-shadow(0 6px 0 #1c120c)',
        }}
      >
        {label}
      </div>
      <div className="relative mt-4 font-['Oswald'] font-bold text-[clamp(36px,7vw,84px)] text-white drop-shadow-[0_5px_0_#1c120c]">
        {fmt(Math.floor(amount))}
      </div>
      <div className="relative mt-2 text-white/60 text-xs font-semibold">Cliquez pour passer</div>
    </div>
  );
};

const Poster: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative wd-pop w-full max-w-sm rotate-[-1deg] rounded-sm border-[4px] border-[#1c120c] bg-[linear-gradient(180deg,#efe4cc,#d2bf98)] p-6 text-center text-[#1c120c] shadow-[0_20px_50px_rgba(0,0,0,0.7)]">
    <div className="absolute inset-2 border-2 border-[#1c120c]/40 pointer-events-none" />
    {children}
  </div>
);

const BonusIntro: React.FC<{ bonus: WantedBonus; onStart: () => void }> = ({ bonus, onStart }) => {
  const info = BONUS_INFO[bonus];
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-black/75 p-4">
      <Rays color="rgba(224,176,64,0.12)" />
      <Poster>
        <div className="font-['Rye'] text-5xl leading-none">WANTED</div>
        <div className="w-24 h-24 mx-auto my-3">
          <WantedSymbol id={bonus === 'gtr' ? 'fs' : bonus === 'duel' ? 'duel' : 'dead'} />
        </div>
        <div className="font-['Rye'] text-2xl leading-tight">{info.name}</div>
        <p className="text-sm mt-2">
          {bonus === 'gtr' && '10 tours gratuits. Chaque WILD qui tombe reste collé jusqu’à la fin.'}
          {bonus === 'duel' && '10 tours gratuits. Chaque VS s’étend, gain ou pas, et son rouleau reste collé avec son multiplicateur.'}
          {bonus === 'dmh' &&
            'Collecte : wilds et multiplicateurs se posent, chaque nouvel atterrissage remet les respins à 3. Puis 3 tours Showdown avec vos wilds et le multiplicateur total.'}
        </p>
        <button
          onClick={onStart}
          className="mt-5 font-['Oswald'] font-bold text-xl px-10 py-2.5 rounded-md bg-[#c2231a] text-[#efe4cc] border-[3px] border-[#1c120c] shadow-[0_4px_0_#1c120c] hover:bg-[#d8342a]"
        >
          COMMENCER
        </button>
      </Poster>
    </div>
  );
};

const BonusEnd: React.FC<{ bonus: WantedBonus; win: number; onClose: () => void }> = ({ bonus, win, onClose }) => (
  <div onClick={onClose} className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-black/75 p-4 cursor-pointer">
    <Rays color="rgba(224,176,64,0.12)" />
    {win > 0 && <Dust />}
    <Poster>
      <div className="font-['Rye'] text-2xl">{BONUS_INFO[bonus].name}</div>
      <div className="font-['Oswald'] font-bold text-sm mt-3 tracking-widest">RÉCOMPENSE</div>
      <div className="font-['Rye'] text-5xl my-2 text-[#c2231a]">{fmt(win)}</div>
      <button className="mt-3 font-['Oswald'] font-bold text-xl px-10 py-2.5 rounded-md bg-[#2f7a52] text-[#efe4cc] border-[3px] border-[#1c120c] shadow-[0_4px_0_#1c120c]">
        CONTINUER
      </button>
    </Poster>
  </div>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({
  title,
  onClose,
  children,
  wide,
}) => (
  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 p-3" onClick={onClose}>
    <div
      onClick={(e) => e.stopPropagation()}
      className={`wd-pop relative w-full ${wide ? 'max-w-3xl' : 'max-w-sm'} max-h-full overflow-y-auto rounded-lg border-[3px] border-[#1c120c] bg-[linear-gradient(180deg,#3a2618,#1c120c)] p-5 shadow-2xl`}
    >
      <button onClick={onClose} aria-label="Fermer" className="absolute top-3 right-3 text-white/80 hover:text-white">
        <X size={20} />
      </button>
      <h3 className="font-['Rye'] text-2xl text-[#e0b040] text-center mb-4 pr-6">{title}</h3>
      {children}
    </div>
  </div>
);

const MenuRow: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }> = ({
  icon,
  label,
  onClick,
  disabled,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full flex items-center gap-3 rounded-lg bg-black/30 hover:bg-black/50 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
  >
    {icon}
    {label}
  </button>
);

const RulesModal: React.FC<{ bet: number; prices: Record<WantedBonus, number>; onClose: () => void }> = ({
  bet,
  prices,
  onClose,
}) => (
  <Modal title="RÈGLES DU JEU" onClose={onClose} wide>
    <p className="text-center text-white/60 text-xs mb-4">Gains pour une mise de {fmt(bet)}, de gauche à droite sur 15 lignes.</p>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {(['wild', ...PAYING] as WantedSymbolId[]).map((id) => (
        <div key={id} className="flex items-center gap-3 rounded-lg bg-black/30 p-2.5">
          <div className="w-12 h-12 shrink-0">
            <WantedSymbol id={id} />
          </div>
          <div className="font-['Oswald'] text-sm leading-snug">
            {[5, 4, 3].map((n) => (
              <div key={n}>
                <span className="text-[#e0b040]">{n} </span>
                <span className="text-white">{fmt(bet * PAYTABLE[id]![n - 3])}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>

    <div className="grid sm:grid-cols-2 gap-3 mt-4 text-xs text-white/85 leading-relaxed">
      <div className="flex gap-3 rounded-lg bg-black/30 p-3">
        <div className="w-14 h-14 shrink-0">
          <WantedSymbol id="vs" />
        </div>
        <p>
          <b className="text-[#e0b040]">VS</b> — remplace tous les symboles sauf les scatters (rouleaux 2 à 4). S'il participe à un gain, il
          s'étend sur tout le rouleau : deux pistoleros s'affrontent et le vainqueur applique son multiplicateur (x2 à x100). Plusieurs
          rouleaux VS sur une ligne : multiplicateurs additionnés.
        </p>
      </div>
      <div className="flex gap-3 rounded-lg bg-black/30 p-3">
        <div className="w-14 h-14 shrink-0">
          <WantedSymbol id="wild" />
        </div>
        <p>
          <b className="text-[#e0b040]">WILD</b> — rouleaux 2 à 4, remplace tous les symboles sauf les scatters. Il devient collant dans
          The Great Train Robbery et dans le Showdown de Dead Man's Hand.
        </p>
      </div>
    </div>

    <h4 className="font-['Rye'] text-lg text-[#e0b040] text-center mt-5 mb-2">LES 3 BONUS</h4>
    <div className="grid sm:grid-cols-3 gap-3 text-xs text-white/85">
      {(Object.keys(BONUS_INFO) as WantedBonus[]).map((b) => (
        <div key={b} className="rounded-lg bg-black/30 p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 shrink-0">
              <WantedSymbol id={b === 'gtr' ? 'fs' : b === 'duel' ? 'duel' : 'dead'} />
            </div>
            <b className="text-[#e0b040]">{BONUS_INFO[b].name}</b>
          </div>
          <p>
            {b === 'gtr' && '3 BONUS sur les rouleaux 1, 3 et 5. 10 tours, wilds collants.'}
            {b === 'duel' && '2 BONUS + 1 DUEL. 10 tours, VS fréquents sur les 5 rouleaux, rouleaux VS collants.'}
            {b === 'dmh' && '2 BONUS + 1 DEAD. Collecte de wilds et multiplicateurs, puis 3 tours Showdown.'}
          </p>
          <p className="mt-1 text-white/50">Achat : {prices[b]}x la mise</p>
        </div>
      ))}
    </div>
    <p className="text-white/50 text-[11px] text-center mt-4">
      Gain maximum : {fmt(MAX_WIN_X)}x la mise, le tour s'arrête dès qu'il est atteint. RTP théorique ≈ 96 % (tirages effectués par le serveur).
    </p>
  </Modal>
);
