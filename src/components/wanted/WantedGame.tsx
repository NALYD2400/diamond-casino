import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FullscreenButton } from '../FullscreenButton';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Info, Menu, Minus, Play, Plus, RefreshCw, RotateCw, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { useCasinoUser } from '../../context/CasinoUserContext';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import { MachineClosedBanner, useMachineClosed } from '../MachineClosedBanner';
import { apiPlaySlotRound, CasinoApiError, type PlayerReward } from '../../lib/supabase';
import { clampBetLevels, SLOT_RTP, formatRtp } from '../../lib/gamesConfig';
import { useSlotTimeline } from '../slots/useSlotTimeline';
import { useSlotWarmup } from '../slots/useSlotWarmup';
import { useVouchers } from '../slots/useVouchers';
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
  maxBuyBet,
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
  /** Dead Man's Hand : wilds collectés, replacés à chaque tour Showdown */
  wilds: number;
}

interface DuelAnim {
  reel: number;
  top: number;
  bottom: number;
  winner: number;
  stage: 'face' | 'shot';
}

interface DmhBoardState {
  wilds: number;
  multiplier: number;
  respins: number;
  /** cartes retournées sur ce respin */
  revealed: DmhLanding[];
  /** rolling : les cartes tournent · reveal : symboles visibles · collect : ils filent vers les compteurs */
  stage: 'idle' | 'rolling' | 'reveal' | 'collect';
}

/** Compteurs de Dead Man's Hand : wilds, multiplicateur et balles du barillet */
interface DmhHud {
  wilds: number;
  multiplier: number;
  bullets: number;
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
  const [showdownIntro, setShowdownIntro] = useState(false);

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
  // Bons de bonus offerts (roue, cadeaux) : bonus gratuit, mise déduite de leur valeur
  const { vouchers, reload: reloadVouchers } = useVouchers('wanted', mode === 'real');
  const [voucherOpen, setVoucherOpen] = useState(false);
  const voucherBetRef = useRef(0);

  // Manche tirée par le SERVEUR en mode jetons (mise et gain réglés en base
  // avant l'animation), localement en mode démo.
  const obtainRound = useCallback(
    async (buy: WantedBonus | null, voucher?: PlayerReward): Promise<WantedRound | null> => {
      if (mode === 'real') {
        try {
          const res = voucher
            ? await apiPlaySlotRound<WantedRound>({ game: 'wanted', bet: voucher.voucher?.bet ?? bet, voucher_id: voucher.id })
            : await apiPlaySlotRound<WantedRound>({ game: 'wanted', bet, buy });
          if (voucher) voucherBetRef.current = res.bet ?? voucher.voucher?.bet ?? bet;
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

      const wilds = round.collect?.wilds ?? 0;
      if (round.collect) {
        // Phase 1 : collecte (déjà tirée, on la rejoue). Les cartes se retournent,
        // wilds et multiplicateurs filent dans les compteurs, le barillet se recharge.
        setPhase('spinning');
        let w = 0;
        let mult = 0;
        let respins = 3;
        setDmhBoard({ wilds: 0, multiplier: 0, respins, revealed: [], stage: 'idle' });
        setMessage('COLLECTE');
        await wait(900);
        for (const step of round.collect.steps) {
          const fast = turboRef.current;
          audio.current.spinStart();
          setDmhBoard((b) => b && { ...b, revealed: [], stage: 'rolling' });
          await wait(fast ? 260 : 480);
          if (step.length > 0) {
            setDmhBoard((b) => b && { ...b, revealed: step, stage: 'reveal' });
            audio.current.collect();
            await wait(fast ? 300 : 600);
            setDmhBoard((b) => b && { ...b, stage: 'collect' });
            await wait(fast ? 240 : 400);
            step.forEach((l) => (l.kind === 'wild' ? w++ : (mult += l.value)));
            if (respins < 3) audio.current.revolverReload();
            respins = 3;
            setDmhBoard({ wilds: w, multiplier: mult, respins, revealed: [], stage: 'idle' });
          } else {
            respins--;
            audio.current.gunshot(0.45);
            setDmhBoard((b) => b && { ...b, respins, stage: 'idle' });
          }
          await wait(fast ? 100 : 200);
        }
        await wait(600);
        setMessage('SHOWDOWN');
        setShowdownIntro(true);
        audio.current.revolverReload();
        setDmhBoard({ wilds: w, multiplier: mult, respins: 3, revealed: [], stage: 'idle' });
        await wait(turboRef.current ? 900 : 1700);
        setShowdownIntro(false);
        setDmhBoard(null);
      }

      setBonusState({ bonus, spin: 0, total, win: 0, multiplier, wilds });
      setStickyWilds(sticky);
      setPhase('spinning');

      for (let i = 1; i <= round.spins.length; i++) {
        await wait(turboRef.current ? 250 : 550);
        setPresentation(null);
        setBonusState({ bonus, spin: i, total, win: bonusWin, multiplier, wilds });

        const res = round.spins[i - 1];
        // Showdown : les wilds collectés tombent à de nouvelles places à chaque tour
        if (bonus === 'dmh') setStickyWilds([]);
        await animateReels(res, { anticipation: false, keepVs: stickyVs });
        if (bonus === 'dmh') {
          setStickyWilds(res.stickyWilds);
          await wait(turboRef.current ? 150 : 350);
        }
        if (bonus === 'gtr') {
          sticky = res.stickyWilds;
          setStickyWilds(sticky);
        }
        if (bonus === 'duel') stickyVs = res.vsReels.map((v) => ({ ...v, sticky: true }));

        await presentWins(res, stakeBet, bonusWin);
        bonusWin += res.totalWin;
        setHiddenWin((h) => Math.max(0, h - res.totalWin));
        setBonusState({ bonus, spin: i, total, win: bonusWin, multiplier, wilds });
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
    async (buy: WantedBonus | null, voucher?: PlayerReward) => {
      if (busyRef.current) return;
      if (blockedRef.current) {
        setMessage('MACHINE FERMÉE');
        setAutoLeft(0);
        return;
      }
      const cost = buy ? bet * buyPrices[buy] : bet;
      if (!voucher && displayCredit < cost) {
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
      const round = await obtainRound(buy, voucher);
      if (!round) {
        setSpinning([false, false, false, false, false]);
        setAutoLeft(0);
        setPhase('idle');
        busyRef.current = false;
        return;
      }
      const res = round.base;
      const roundBet = voucher ? voucherBetRef.current : bet;

      await animateReels(res, { anticipation: !buy && !voucher, keepVs: [], startedAt });
      if (res.bonus) {
        setScatterHit(true);
        setAutoLeft(0);
      }
      await presentWins(res, roundBet, 0);
      setHiddenWin((h) => Math.max(0, h - res.totalWin));
      setLastWin(res.totalWin);

      if (round.bonus) {
        await wait(1100);
        await runBonus(round.bonus, roundBet, res.totalWin);
      }
      setHiddenWin(0);
      setPhase('idle');
      busyRef.current = false;
      if (voucher) void reloadVouchers();
    },
    [animateReels, startReels, bet, buyPrices, displayCredit, obtainRound, presentWins, runBonus, wait, reloadVouchers],
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
  const dmhHud: DmhHud | null = dmhBoard
    ? { wilds: dmhBoard.wilds, multiplier: Math.max(1, dmhBoard.multiplier), bullets: dmhBoard.respins }
    : bonusState?.bonus === 'dmh'
      ? { wilds: bonusState.wilds, multiplier: bonusState.multiplier, bullets: bonusState.total - bonusState.spin }
      : null;

  return (
    <div className="relative bg-[#120a07] pt-[80px] sm:pt-[90px]">
      <MachineClosedBanner state={closed} />
      <div data-fullscreen-root
        className="relative w-full overflow-hidden select-none" style={{ height: 'max(680px, calc(100svh - 90px))' }}>
        <Backdrop theme={theme} />

        {/* Haut */}
        <div className="absolute top-3 left-3 sm:left-6 right-3 sm:right-6 z-30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
          <Link
            to="/jeux"
            className="flex items-center gap-2 rounded-full bg-black/80 hover:bg-black border border-white/20 hover:border-white/40 shadow-lg backdrop-blur-md px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-white transition-all hover:scale-105 active:scale-95"
          >
            <ArrowLeft size={16} /> Lobby
          </Link>
            <FullscreenButton />
          </div>
          <div className="flex items-center rounded-full bg-black/80 border border-white/20 shadow-lg backdrop-blur-md p-1 sm:p-1.5 text-xs sm:text-sm font-extrabold tracking-wide">
            <button
              onClick={() => !locked && isAuthenticated && setMode('real')}
              disabled={locked || !isAuthenticated}
              title={isAuthenticated ? 'Jouer avec vos jetons' : 'Connectez-vous pour jouer avec vos jetons'}
              className={`px-3.5 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all ${
                mode === 'real' ? 'bg-[#e0b040] text-[#1c120c] font-black shadow-[0_0_12px_rgba(224,176,64,0.5)]' : 'text-white/80 hover:text-white hover:bg-white/10'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              JETONS
            </button>
            <button
              onClick={() => !locked && setMode('demo')}
              disabled={locked}
              className={`px-3.5 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all ${
                mode === 'demo' ? 'bg-white text-[#1c120c] font-black shadow-md' : 'text-white/80 hover:text-white hover:bg-white/10'
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
              <div className="relative z-20 w-full flex items-end justify-center gap-[2%] -mb-[3%]">
                {dmhHud && <HudPlaque label="WILDS" value={String(dmhHud.wilds)} side="left" />}
                <WantedLogo />
                {dmhHud && <HudPlaque label="MULTIPLIER" value={`${dmhHud.multiplier}x`} side="right" />}
              </div>
              <div
                className={`relative w-full rounded-lg border-[5px] border-[#1c120c] p-[2%] shadow-[0_20px_50px_rgba(0,0,0,0.6)] ${
                  dmhHud ? 'flex gap-[1.5%] bg-[linear-gradient(180deg,#3a2230,#1c0e14)]' : 'bg-[linear-gradient(180deg,#4a3322,#2a1a10)]'
                }`}
              >
                <div className="absolute inset-0 rounded-md opacity-40 bg-[repeating-linear-gradient(90deg,transparent_0_46px,rgba(0,0,0,0.35)_46px_49px)] pointer-events-none" />
                {bonusState && <BonusBanner state={bonusState} />}
                <div className="relative flex-1 min-w-0 rounded bg-[#1a100a] overflow-hidden">
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
                  {showdownIntro && <ShowdownTitle />}
                </div>
                {dmhHud && <BulletLoader bullets={dmhHud.bullets} />}
              </div>
            </div>
          </div>
          <div className="hidden lg:flex w-[170px] shrink-0 flex-col gap-2">
            <InfoCard title="GAIN MAX" value={`${fmt(Math.min(MAX_WIN_X, Math.floor(cfg.maxPayout / bet)))}x`} />
            <InfoCard title="VS" value="x2 → x100" sub="Multiplicateurs additionnés sur la ligne" />
            <InfoCard title="RTP" value={formatRtp(SLOT_RTP.wanted)} />
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

        {vouchers.length > 0 && phase === 'idle' && !bonusState && (
          <button
            onClick={() => setVoucherOpen(true)}
            className="fixed left-1/2 top-[112px] z-40 -translate-x-1/2 rounded-full border-2 border-[#1c120c] bg-[linear-gradient(180deg,#efe4cc,#c9b48a)] px-4 py-2 font-['Oswald'] text-sm font-bold text-[#1c120c] shadow-lg animate-pulse"
          >
            BONUS OFFERT ×{vouchers.length}
          </button>
        )}

        {bigWin && <BigWinOverlay amount={bigWin.shown} bet={bigWin.bet} onClick={skipAll} />}
        {intro && <BonusIntro bonus={intro.bonus} onStart={resolveClick} />}
        {end && <BonusEnd bonus={end.bonus} win={end.win} onClose={resolveClick} />}

        {voucherOpen && vouchers[0] && (
          <Modal title="BONUS OFFERT" onClose={() => setVoucherOpen(false)}>
            {(() => {
              const v = vouchers[0];
              const b = (v.voucher?.buy ?? 'gtr') as WantedBonus;
              const info = BONUS_INFO[b] ?? BONUS_INFO.gtr;
              return (
                <>
                  <div className="w-16 h-16 mx-auto mb-3">
                    <WantedSymbol id={b === 'gtr' ? 'fs' : b === 'duel' ? 'duel' : 'dead'} />
                  </div>
                  <p className="text-center text-white/80 text-sm mb-1">{info.name} : le bonus est offert</p>
                  <p className="text-center font-['Oswald'] font-bold text-4xl text-[#ffcf3f] mb-1">{fmt(v.value ?? 0)}</p>
                  <p className="text-center text-white/50 text-xs mb-5">
                    Valeur du bonus · mise {fmt(v.voucher?.bet ?? 0)}
                    {vouchers.length > 1 ? ` · ${vouchers.length} bons disponibles` : ''}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setVoucherOpen(false)}
                      className="font-['Oswald'] font-bold text-lg py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                    >
                      PLUS TARD
                    </button>
                    <button
                      onClick={() => {
                        setVoucherOpen(false);
                        void playRound(b, v);
                      }}
                      className="font-['Oswald'] font-bold text-lg py-3 rounded-lg border-2 border-[#1c120c] bg-[linear-gradient(180deg,#efe4cc,#c9b48a)] text-[#1c120c]"
                    >
                      UTILISER
                    </button>
                  </div>
                </>
              );
            })()}
          </Modal>
        )}

        {buyOpen && (
          <Modal title="ACHETER UN BONUS" onClose={() => setBuyOpen(false)} wide>
            <div className="grid sm:grid-cols-3 gap-3">
              {(Object.keys(BONUS_INFO) as WantedBonus[]).map((b) => {
                const price = bet * buyPrices[b];
                const tooHigh = bet > maxBuyBet(buyPrices[b], cfg.maxPayout);
                return (
                  <button
                    key={b}
                    disabled={tooHigh || displayCredit < price}
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
                    {tooHigh && (
                      <div className="mt-1 text-center text-[11px] font-bold text-[#8a1c10]">
                        Mise max : {fmt(maxBuyBet(buyPrices[b], cfg.maxPayout))}
                      </div>
                    )}
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

/** Carte « Dead Man's Hand » face cachée : éventail de cartes sépia et crâne */
const DeadCard: React.FC<{ rolling?: boolean; delay?: number }> = ({ rolling, delay = 0 }) => (
  <div className={`w-full h-full ${rolling ? 'wd-card-roll' : ''}`} style={rolling ? { animationDelay: `${delay}ms` } : undefined}>
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_3px_3px_rgba(0,0,0,0.6)]">
      <defs>
        <linearGradient id="dmh-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3ead2" />
          <stop offset="1" stopColor="#bfae88" />
        </linearGradient>
      </defs>
      {[-14, -5].map((a) => (
        <rect key={a} x="24" y="12" width="52" height="74" rx="5" fill="#d6c7a2" stroke="#3a2a1a" strokeWidth="2" transform={`rotate(${a} 50 86)`} />
      ))}
      <g transform="rotate(5 50 86)">
        <rect x="24" y="12" width="52" height="74" rx="5" fill="url(#dmh-paper)" stroke="#3a2a1a" strokeWidth="2.5" />
        <rect x="29" y="17" width="42" height="64" rx="3" fill="none" stroke="#8a7452" strokeWidth="1" strokeDasharray="2 2" />
        <path d="M37 44 Q37 30 50 30 Q63 30 63 44 Q63 51 58 54 L58 60 L42 60 L42 54 Q37 51 37 44 Z" fill="#4a3a2a" />
        <ellipse cx="44.5" cy="44" rx="4" ry="4.6" fill="#f3ead2" />
        <ellipse cx="55.5" cy="44" rx="4" ry="4.6" fill="#f3ead2" />
        <path d="M50 49 L47.6 53.5 L52.4 53.5 Z" fill="#f3ead2" />
        <path d="M45 60 V65 M48.3 60 V66 M51.7 60 V66 M55 60 V65" stroke="#4a3a2a" strokeWidth="2.2" />
      </g>
    </svg>
  </div>
);

const DmhBoard: React.FC<{ board: DmhBoardState }> = ({ board }) => {
  const byCell = new Map(board.revealed.map((l) => [`${l.reel}-${l.row}`, l]));
  const flying = board.stage === 'collect';
  return (
    <div className="relative bg-[radial-gradient(ellipse_at_center,#2a1420,#12080e)]">
      <div className="grid grid-cols-5 gap-[2px] p-[2px]">
        {[0, 1, 2, 3, 4].map((row) =>
          [0, 1, 2, 3, 4].map((reel) => {
            const key = `${reel}-${row}`;
            const l = byCell.get(key);
            return (
              <div key={key} className="relative aspect-square p-[5%]">
                <div
                  className={`w-full h-full transition-opacity duration-200 ${
                    l && !flying ? 'opacity-0' : board.stage === 'reveal' ? 'opacity-40' : ''
                  }`}
                >
                  <DeadCard rolling={board.stage === 'rolling'} delay={(reel * 5 + row) * 17} />
                </div>
                {l && (
                  <div
                    className={`absolute inset-0 z-10 p-[5%] ${flying ? 'wd-card-fly' : 'wd-card-flip'}`}
                    style={
                      {
                        // les wilds filent vers le compteur de gauche, les multiplicateurs vers la droite
                        '--fx': l.kind === 'wild' ? `${-(reel + 0.6) * 100}%` : `${(4.6 - reel) * 100}%`,
                        '--fy': `${-(row + 1.4) * 100}%`,
                      } as React.CSSProperties
                    }
                  >
                    <div className="w-full h-full rounded-md border-2 border-[#e0b040] bg-[radial-gradient(circle,#5a3a1a,#1c120c)] shadow-[0_0_18px_rgba(255,200,80,0.8)] flex items-center justify-center p-[6%]">
                      {l.kind === 'wild' ? (
                        <WantedSymbol id="wild" />
                      ) : (
                        <div className="w-[86%] aspect-square rounded-full border-[3px] border-[#1c120c] bg-[radial-gradient(circle_at_35%_30%,#fff1b0,#e0b040_55%,#8a5a10)] flex items-center justify-center font-['Oswald'] font-bold text-[#5a140c] text-[clamp(12px,3.6cqw,28px)]">
                          {l.value}x
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
};

/** Compteur en bois de part et d'autre du logo (WILDS / MULTIPLIER) */
const HudPlaque: React.FC<{ label: string; value: string; side: 'left' | 'right' }> = ({ label, value, side }) => (
  <div
    className={`w-[21%] shrink-0 mb-[4%] rounded-md border-[3px] border-[#1c120c] bg-[linear-gradient(180deg,#4a3322,#24160c)] shadow-[0_4px_0_#1c120c,inset_0_0_0_2px_rgba(224,176,64,0.55)] px-1 py-[1.2%] text-center ${
      side === 'left' ? '-rotate-2' : 'rotate-2'
    }`}
  >
    <div className="font-['Oswald'] font-bold tracking-[0.04em] text-[#e0b040] text-[clamp(7px,1.6cqw,13px)] leading-none">{label}</div>
    <div
      key={value}
      className="wd-pop font-['Rye'] text-[#fff1d8] text-[clamp(16px,4.6cqw,38px)] leading-none mt-[6%]"
      style={{ WebkitTextStroke: '1px #1c120c', textShadow: '0 2px 0 #1c120c' }}
    >
      {value}
    </div>
  </div>
);

/** Chargeur de balles : respins restants (collecte) puis tours Showdown restants */
const BulletLoader: React.FC<{ bullets: number }> = ({ bullets }) => (
  <div className="relative w-[9%] shrink-0 rounded-md border-2 border-[#1c120c] bg-[linear-gradient(90deg,#0c0608,#2a1a14_45%,#0c0608)] shadow-[inset_0_0_10px_rgba(0,0,0,0.9)] flex flex-col justify-evenly items-center py-[4%]">
    <div className="absolute inset-y-[3%] left-1/2 w-[2px] -translate-x-1/2 bg-[#e0b040]/20" />
    {[0, 1, 2].map((i) => {
      const loaded = 2 - i < bullets;
      return (
        <div key={i} className="relative w-[62%] aspect-[1/3.2] rounded-full bg-black/70 shadow-[inset_0_2px_4px_rgba(0,0,0,0.9)]">
          <svg
            viewBox="0 0 20 64"
            className={`absolute inset-0 w-full h-full transition-all duration-300 ease-out ${
              loaded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-[70%] scale-75'
            }`}
          >
            <defs>
              <linearGradient id="bl-brass" x1="0" x2="1">
                <stop offset="0" stopColor="#7a5410" />
                <stop offset="0.4" stopColor="#ffe08a" />
                <stop offset="1" stopColor="#8a5a10" />
              </linearGradient>
              <linearGradient id="bl-lead" x1="0" x2="1">
                <stop offset="0" stopColor="#6a3a1a" />
                <stop offset="0.4" stopColor="#e89a5a" />
                <stop offset="1" stopColor="#6a3a1a" />
              </linearGradient>
            </defs>
            <path d="M3 22 Q3 2 10 1 Q17 2 17 22 Z" fill="url(#bl-lead)" />
            <rect x="2.5" y="21" width="15" height="38" rx="1.5" fill="url(#bl-brass)" />
            <rect x="1.5" y="58" width="17" height="5" rx="1" fill="url(#bl-brass)" stroke="#5a3a08" strokeWidth="0.6" />
          </svg>
        </div>
      );
    })}
  </div>
);

const ShowdownTitle: React.FC = () => (
  <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 pointer-events-none">
    <div
      className="wd-pop font-['Rye'] text-[clamp(30px,9cqw,76px)] leading-none"
      style={{
        background: 'linear-gradient(180deg, #fff1b0 0%, #e0b040 50%, #8a5a10 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        WebkitTextStroke: '2px #1c120c',
        filter: 'drop-shadow(0 4px 0 #1c120c)',
      }}
    >
      SHOWDOWN
    </div>
  </div>
);

const BonusBanner: React.FC<{ state: BonusState }> = ({ state }) => (
  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-40 wd-pop whitespace-nowrap rounded-md border-[3px] border-[#1c120c] bg-[#efe4cc] px-3 py-0.5 font-['Oswald'] font-bold text-[#1c120c] text-xs sm:text-sm shadow-[0_3px_0_#1c120c]">
    {state.bonus === 'dmh' ? 'SHOWDOWN' : 'TOURS GRATUITS'} {state.spin}/{state.total}
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
        <div
          className="justify-self-end flex flex-col items-center gap-2"
          style={{ '--slot-accent': '#e0b040', '--slot-glow': 'rgba(224,176,64,0.55)' } as React.CSSProperties}
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={p.onDec}
              disabled={p.locked || !p.canDec}
              title="Diminuer la mise"
              aria-label="Diminuer la mise"
              className="slot-ctrl"
            >
              <Minus size={24} strokeWidth={3} />
            </button>
            <button
              onClick={p.onSpin}
              aria-label="Tourner"
              title="Tourner (ESPACE)"
              className={`slot-spin w-[80px] h-[80px] sm:w-[96px] sm:h-[96px] ${p.spinning ? 'is-spinning' : ''}`}
            >
              <RefreshCw className={`slot-spin-icon ${p.autoLeft > 0 ? 'opacity-30' : ''}`} strokeWidth={2.6} />
              {p.autoLeft > 0 && (
                <span className="absolute inset-0 flex items-center justify-center font-['Oswald'] font-bold text-2xl text-[#e0b040]">
                  {p.autoLeft}
                </span>
              )}
            </button>
            <button
              onClick={p.onInc}
              disabled={p.locked || !p.canInc}
              title="Augmenter la mise"
              aria-label="Augmenter la mise"
              className="slot-ctrl"
            >
              <Plus size={24} strokeWidth={3} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={p.onTurbo}
              aria-pressed={p.turbo}
              className={`slot-pill font-['Oswald'] font-bold tracking-wide ${
                p.turbo ? '!bg-[#e0b040] !text-[#1c120c] !border-[#e0b040]' : ''
              }`}
            >
              <Zap size={13} fill={p.turbo ? 'currentColor' : 'none'} /> TURBO
            </button>
            <button
              onClick={p.onAuto}
              aria-pressed={p.autoLeft > 0}
              className={`slot-pill font-['Oswald'] font-bold tracking-wide ${
                p.autoLeft > 0 ? '!bg-[#c2231a] !border-[#c2231a]' : ''
              }`}
            >
              {p.autoLeft > 0 ? <X size={13} /> : <Play size={12} fill="currentColor" />}
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
            'Collecte : les cartes se retournent, wilds et multiplicateurs vont dans leurs compteurs et chaque symbole recharge le barillet à 3 balles. Puis 3 tours Showdown : vos wilds sont replacés au hasard à chaque tour et tous les gains sont multipliés.'}
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
      Gain maximum : {fmt(MAX_WIN_X)}x la mise, le tour s'arrête dès qu'il est atteint. RTP théorique {formatRtp(SLOT_RTP.wanted)} (tirages effectués par le serveur).
    </p>
  </Modal>
);
