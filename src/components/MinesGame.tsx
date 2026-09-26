import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FullscreenButton } from './FullscreenButton';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  History,
  Info,
  Menu,
  Minus,
  Pickaxe,
  Plus,
  RotateCw,
  ShieldCheck,
  Shuffle,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCasinoUser } from '../context/CasinoUserContext';
import { useCasinoAdmin } from '../context/CasinoAdminContext';
import { MachineClosedBanner, useMachineClosed } from './MachineClosedBanner';
import { apiMinesCashout, apiMinesCurrent, apiMinesReveal, apiMinesStart, CasinoApiError, type MinesRoundState } from '../lib/supabase';
import { clampBetLevels } from '../lib/gamesConfig';
import { MinesAudio } from './mines/minesAudio';
import { SampleBank } from './slots/sampleBank';
import { GameVolumeButton, GameVolumeModalRow } from './VolumeControl';
import { useSlotTimeline } from './slots/useSlotTimeline';
import { BlastArt, BombArt, GemArt, MinesBackdrop, MinesLogo, RockChips, RockFace, type MinesMood } from './mines/MinesArt';
import {
  GRID_SIZE,
  calculateMultiplier,
  generateBoard,
  getMultiplierLadder,
  getNextStepProbability,
  sha256Hex,
  type GeneratedBoard,
} from './mines/minesMath';

const BET_LEVELS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000];
const MINE_PRESETS = [1, 3, 5, 10, 24];
const DEMO_KEY = 'diamond_mines_demo_chips';
const DEMO_START = 10000;

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const coord = (i: number) => `${String.fromCharCode(65 + (i % 5))}${Math.floor(i / 5) + 1}`;

type Phase = 'idle' | 'playing' | 'ending';
type Reason = 'manual' | 'grand_slam';

interface RoundResult {
  won: boolean;
  bet: number;
  mines: number;
  gems: number;
  multiplier: number;
  win: number;
  reason: Reason;
  boomIdx: number | null;
}

interface HistoryEntry extends RoundResult {
  id: string;
  mode: 'real' | 'demo';
  at: Date;
}

type SampleName = 'coin1' | 'coin2' | 'coin3' | 'winSmall' | 'winMedium' | 'winBig' | 'shower';

export const MinesGame: React.FC = () => {
  const { user, isAuthenticated, applyServerProfile } = useCasinoUser();
  const { gamesConfig } = useCasinoAdmin();
  const cfg = gamesConfig.mines;
  const closed = useMachineClosed('mines');
  const closedRef = useRef(closed);
  closedRef.current = closed;
  const rtp = cfg.rtp / 100;
  const betLevels = useMemo(() => clampBetLevels(BET_LEVELS, cfg.minBet, cfg.maxBet), [cfg.minBet, cfg.maxBet]);

  // ---------------------------------------------------------------------------
  // Solde
  // ---------------------------------------------------------------------------
  const [mode, setMode] = useState<'real' | 'demo'>(() => (isAuthenticated && user && user.chips > 0 ? 'real' : 'demo'));
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

  // En mode jetons, la mise est débitée par le serveur dès le début de la manche
  // et le gain crédité à l'encaissement : le solde affiché vient du serveur.
  const balance = mode === 'real' ? (user?.chips ?? 0) : demoChips;

  // ---------------------------------------------------------------------------
  // État de jeu
  // ---------------------------------------------------------------------------
  const [betIdx, setBetIdx] = useState(3);
  const bet = betLevels[Math.min(betIdx, betLevels.length - 1)];
  const [minesCount, setMinesCount] = useState(3);

  const [phase, setPhase] = useState<Phase>('idle');
  const [board, setBoard] = useState<GeneratedBoard | null>(null);
  /** Manche en jetons : identifiant côté serveur (la grille reste secrète jusqu'à la fin) */
  const [roundId, setRoundId] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [roundBet, setRoundBet] = useState(bet);
  const [roundMines, setRoundMines] = useState(minesCount);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [revealAll, setRevealAll] = useState(false);
  const [plaque, setPlaque] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [bigWin, setBigWin] = useState<{ amount: number; shown: number; mult: number } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [message, setMessage] = useState('');
  const [verify, setVerify] = useState<'idle' | 'ok' | 'ko'>('idle');

  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [minesOpen, setMinesOpen] = useState(false);

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

  const audio = useRef(new MinesAudio());
  const samples = useRef(
    new SampleBank<SampleName>('/sounds/mines/', {
      coin1: 'coin-1.mp3',
      coin2: 'coin-2.mp3',
      coin3: 'coin-3.mp3',
      winSmall: 'win-small.mp3',
      winMedium: 'win-medium.mp3',
      winBig: 'win-big.mp3',
      shower: 'coins-shower.mp3',
    }),
  );
  audio.current.volume = volume;
  samples.current.volume = volume;
  audio.current.muted = muted;
  samples.current.muted = muted;
  useEffect(
    () => () => {
      audio.current.close();
      samples.current.close();
    },
    [],
  );

  const handleVolumeChange = useCallback((newVol: number) => {
    const clamped = Math.max(0, Math.min(1, Math.round(newVol * 100) / 100));
    setVolume(clamped);
    if (clamped > 0 && muted) {
      setMuted(false);
      try { localStorage.setItem('diamond_sound_muted', 'false'); } catch {}
    }
    try { localStorage.setItem('diamond_sound_volume', String(clamped)); } catch {}
  }, [muted]);
  const unlockAudio = () => {
    audio.current.unlock();
    samples.current.unlock();
  };

  const busyRef = useRef(false);
  const { wait, skipAll, countUp } = useSlotTimeline();

  // ---------------------------------------------------------------------------
  // Dérivés
  // ---------------------------------------------------------------------------
  const playing = phase === 'playing';
  const mines = phase === 'idle' ? minesCount : roundMines;
  const gems = useMemo(() => (board ? picked.filter((i) => !board.board[i]).length : 0), [board, picked]);
  const multiplier = playing && gems > 0 ? calculateMultiplier(roundMines, gems, rtp) : 1;
  const potentialWin = Math.floor(roundBet * multiplier);
  const ladder = useMemo(() => getMultiplierLadder(mines, rtp), [mines, rtp]);
  const nextMult = calculateMultiplier(mines, (playing ? gems : 0) + 1, rtp);
  const nextProb = getNextStepProbability(mines, playing ? gems : 0);
  const maxMult = ladder[ladder.length - 1]?.multiplier ?? 1;

  // ---------------------------------------------------------------------------
  // Déroulé d'une manche
  // ---------------------------------------------------------------------------
  /** Grille « inconnue » d'une manche serveur : seules les cases révélées sont connues */
  const hiddenBoard = (hash: string, revealedMines: number[] = []): GeneratedBoard => ({
    board: Array.from({ length: GRID_SIZE }, (_, i) => revealedMines.includes(i)),
    serverSeed: '',
    hash,
  });
  const serverBoard = (st: MinesRoundState): GeneratedBoard =>
    st.board ? { board: st.board, serverSeed: st.server_seed ?? '', hash: st.hash } : hiddenBoard(st.hash);

  const serverError = (err: unknown) => {
    setMessage(err instanceof CasinoApiError ? err.message.toUpperCase() : 'ERREUR SERVEUR');
  };

  // Reprise d'une manche en jetons interrompue (onglet fermé, rechargement…)
  useEffect(() => {
    if (mode !== 'real' || !isAuthenticated || phase !== 'idle') return;
    let cancelled = false;
    apiMinesCurrent()
      .then((st) => {
        if (cancelled || !st) return;
        setRoundId(st.round_id);
        setBoard(hiddenBoard(st.hash));
        setPicked(st.revealed);
        setRoundBet(st.bet);
        setRoundMines(st.mines);
        setResult(null);
        setRevealAll(false);
        setPlaque(false);
        setMessage('MANCHE EN COURS REPRISE');
        setPhase('playing');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isAuthenticated]);

  const startRound = useCallback(async () => {
    if (busyRef.current || phase !== 'idle') return;
    unlockAudio();
    if (mode === 'real') {
      // Machine fermée par la direction (le serveur refuse aussi la mise)
      if (closedRef.current) {
        setMessage('MACHINE FERMÉE');
        return;
      }
      if (!isAuthenticated || !user) {
        setMode('demo');
        setMessage('CONNECTEZ-VOUS POUR MISER VOS JETONS');
        return;
      }
      if (balance < bet) {
        setMessage('SOLDE INSUFFISANT');
        return;
      }
    } else if (demoChips < bet) {
      setMessage('SOLDE DÉMO INSUFFISANT');
      return;
    }
    busyRef.current = true;
    let nb: GeneratedBoard;
    if (mode === 'real') {
      try {
        const st = await apiMinesStart(bet, minesCount);
        if (st.profile) applyServerProfile(st.profile);
        setRoundId(st.round_id);
        nb = hiddenBoard(st.hash);
      } catch (err) {
        serverError(err);
        busyRef.current = false;
        return;
      }
    } else {
      nb = await generateBoard(minesCount);
      setDemoChips((c) => c - bet);
    }
    setBoard(nb);
    setPicked([]);
    setRoundBet(bet);
    setRoundMines(minesCount);
    setResult(null);
    setRevealAll(false);
    setPlaque(false);
    setVerify('idle');
    setMessage('');
    setPhase('playing');
    audio.current.start();
    busyRef.current = false;
  }, [phase, mode, isAuthenticated, user, balance, bet, demoChips, minesCount, applyServerProfile]);

  /** Fin de manche : animation uniquement (le règlement est déjà fait) */
  const finishRound = useCallback(
    async (r: RoundResult) => {
      busyRef.current = true;
      setPhase('ending');
      setResult(r);
      setRoundId(null);
      setHistory((h) => [{ ...r, id: `${Date.now()}`, mode, at: new Date() }, ...h].slice(0, 15));
      if (mode === 'demo' && r.win > 0) setDemoChips((c) => c + r.win);

      if (!r.won) {
        setShakeKey((k) => k + 1);
        setShaking(true);
        audio.current.explosion();
        await wait(700);
        setShaking(false);
        setRevealAll(true);
        setPlaque(true);
      } else {
        setRevealAll(true);
        if (r.multiplier >= 10) {
          if (!samples.current.play('winBig', 0.8)) audio.current.cashout();
          samples.current.play('shower', 0.6);
          setBigWin({ amount: r.win, shown: 0, mult: r.multiplier });
          const dur = r.multiplier >= 50 ? 5200 : r.multiplier >= 25 ? 4200 : 3200;
          let tick = 0;
          await countUp(0, r.win, dur, (v) => {
            setBigWin((b) => (b ? { ...b, shown: v } : b));
            tick++;
            if (tick % 4 === 0) samples.current.play((['coin1', 'coin2', 'coin3'] as const)[tick % 3], 0.35);
          });
          await wait(2200);
          setBigWin(null);
        } else {
          if (samples.current.play(r.multiplier >= 3 ? 'winMedium' : 'winSmall', 0.8)) samples.current.play('coin2', 0.5);
          else audio.current.cashout();
          setPlaque(true);
        }
      }
      setPhase('idle');
      busyRef.current = false;
    },
    [mode, wait, countUp],
  );

  /** Résultat serveur d'une fin de manche -> animation */
  const finishFromServer = useCallback(
    (st: MinesRoundState, boomIdx: number | null) => {
      if (st.profile) applyServerProfile(st.profile);
      setBoard(serverBoard(st));
      setPicked(st.revealed);
      void finishRound({
        won: st.status === 'CASHED',
        bet: st.bet,
        mines: st.mines,
        gems: st.gems,
        multiplier: Number(st.multiplier) || 0,
        win: Number(st.win) || 0,
        reason: st.status === 'CASHED' && st.gems >= GRID_SIZE - st.mines ? 'grand_slam' : 'manual',
        boomIdx,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyServerProfile, finishRound],
  );

  const pickTile = useCallback(
    async (idx: number) => {
      if (phase !== 'playing' || !board || picked.includes(idx) || busyRef.current) return;
      unlockAudio();

      if (mode === 'real') {
        if (!roundId) return;
        busyRef.current = true;
        try {
          const st = await apiMinesReveal(roundId, idx);
          busyRef.current = false;
          if (st.status !== 'ACTIVE') {
            if (!st.hit) audio.current.gem(st.gems);
            finishFromServer(st, st.hit ? idx : null);
            return;
          }
          setPicked(st.revealed);
          audio.current.gem(st.gems);
        } catch (err) {
          busyRef.current = false;
          serverError(err);
        }
        return;
      }

      setPicked([...picked, idx]);
      if (board.board[idx]) {
        void finishRound({ won: false, bet: roundBet, mines: roundMines, gems, multiplier: 0, win: 0, reason: 'manual', boomIdx: idx });
        return;
      }
      const g = gems + 1;
      audio.current.gem(g);
      if (g >= GRID_SIZE - roundMines) {
        const m = calculateMultiplier(roundMines, g, rtp);
        void finishRound({
          won: true,
          bet: roundBet,
          mines: roundMines,
          gems: g,
          multiplier: m,
          win: Math.floor(roundBet * m),
          reason: 'grand_slam',
          boomIdx: null,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, board, picked, gems, roundBet, roundMines, finishRound, finishFromServer, mode, roundId, rtp],
  );

  const cashOut = useCallback(async () => {
    if (phase !== 'playing' || gems === 0 || busyRef.current) return;
    unlockAudio();
    if (mode === 'real') {
      if (!roundId) return;
      busyRef.current = true;
      try {
        const st = await apiMinesCashout(roundId);
        busyRef.current = false;
        finishFromServer(st, null);
      } catch (err) {
        busyRef.current = false;
        serverError(err);
      }
      return;
    }
    void finishRound({ won: true, bet: roundBet, mines: roundMines, gems, multiplier, win: potentialWin, reason: 'manual', boomIdx: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, gems, roundBet, roundMines, multiplier, potentialWin, finishRound, finishFromServer, mode, roundId]);

  const randomPick = useCallback(() => {
    if (phase !== 'playing') return;
    const free = Array.from({ length: GRID_SIZE }, (_, i) => i).filter((i) => !picked.includes(i));
    if (free.length) pickTile(free[Math.floor(Math.random() * free.length)]);
  }, [phase, picked, pickTile]);

  const mainAction = useCallback(() => {
    if (bigWin) {
      skipAll();
      return;
    }
    if (phase === 'idle') void startRound();
    else if (phase === 'playing' && gems > 0) void cashOut();
  }, [bigWin, skipAll, phase, gems, startRound, cashOut]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        mainAction();
      } else if (e.code === 'KeyR') {
        randomPick();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mainAction, randomPick]);

  // La plaque de résultat s'efface d'elle-même pour laisser voir la grille
  useEffect(() => {
    if (!plaque) return;
    const t = setTimeout(() => setPlaque(false), 2600);
    return () => clearTimeout(t);
  }, [plaque]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try {
      localStorage.setItem('diamond_sound_muted', String(next));
    } catch {}
  };

  const changeMines = (n: number) => {
    if (phase !== 'idle') return;
    unlockAudio();
    audio.current.click();
    setMinesCount(Math.min(24, Math.max(1, n)));
  };
  const changeBet = (d: number) => {
    if (phase !== 'idle') return;
    unlockAudio();
    audio.current.click();
    setBetIdx((i) => Math.min(betLevels.length - 1, Math.max(0, i + d)));
  };

  const verifyBoard = async () => {
    if (!board) return;
    const s = board.board.map((m) => (m ? 'M' : 'D')).join('');
    setVerify((await sha256Hex(`${board.serverSeed}:${s}`)) === board.hash ? 'ok' : 'ko');
  };

  // ---------------------------------------------------------------------------
  // Affichage
  // ---------------------------------------------------------------------------
  const mood: MinesMood = result && !playing ? (result.won ? 'win' : 'boom') : playing ? 'play' : 'idle';
  const winShown = playing ? (gems > 0 ? potentialWin : 0) : (result?.win ?? 0);
  const status = (() => {
    if (message) return message;
    if (playing) return gems === 0 ? 'CREUSEZ UNE CASE !' : `PROCHAIN x${fmt(nextMult)} · ${fmt(nextProb)} % DE CHANCE`;
    if (result && !result.won) return `BOOM ! MINE EN ${coord(result.boomIdx ?? 0)}`;
    if (result?.won) return result.reason === 'grand_slam' ? 'GRAND CHELEM ! TOUS LES DIAMANTS' : `ENCAISSÉ À x${fmt(result.multiplier)}`;
    return `${minesCount} MINE${minesCount > 1 ? 'S' : ''} · ${GRID_SIZE - minesCount} DIAMANTS À TROUVER`;
  })();
  const ladderStart = Math.max(0, Math.min((playing ? gems : 0) - 2, ladder.length - 7));
  const ladderView = ladder.slice(ladderStart, ladderStart + 7);

  return (
    <div className="relative bg-[#07050f] pt-[80px] sm:pt-[90px]">
      <MachineClosedBanner state={closed} />
      <div data-fullscreen-root
        className="relative w-full overflow-hidden select-none" style={{ height: 'max(700px, calc(100svh - 90px))' }}>
        <MinesBackdrop mood={mood} />

        {/* Haut */}
        <div className="absolute top-8 sm:top-10 left-3 sm:left-6 right-3 sm:right-6 z-30 flex items-center justify-between gap-2">
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
              onClick={() => phase === 'idle' && isAuthenticated && setMode('real')}
              disabled={phase !== 'idle' || !isAuthenticated}
              title={isAuthenticated ? 'Jouer avec vos jetons' : 'Connectez-vous pour jouer avec vos jetons'}
              className={`px-3.5 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all ${
                mode === 'real'
                  ? 'bg-[#3fd2f2] text-black font-black shadow-[0_0_12px_rgba(63,210,242,0.5)]'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              JETONS
            </button>
            <button
              onClick={() => phase === 'idle' && setMode('demo')}
              disabled={phase !== 'idle'}
              className={`px-3.5 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all ${
                mode === 'demo'
                  ? 'bg-white text-black font-black shadow-md'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              DÉMO
            </button>
          </div>
        </div>

        {/* Plateau */}
        <div className="absolute inset-x-0 top-[72px] sm:top-[84px] bottom-[150px] flex items-center justify-center gap-5 px-2 sm:px-6">
          <MinesPanel className="hidden lg:flex" mines={minesCount} locked={phase !== 'idle'} onChange={changeMines} />

          <div className="relative flex-1 h-full min-w-0 max-w-[640px] flex items-center justify-center" style={{ containerType: 'size' }}>
            <div className="relative flex flex-col items-center" style={{ width: 'min(100cqw, calc(100cqh * 0.76))' }}>
              <MinesLogo className="relative z-20 -mt-1 sm:-mt-2 mb-2 sm:mb-3" />

              {/* Échelle des multiplicateurs */}
              <div className="relative z-10 w-full flex justify-center gap-[1.2%] mb-[2.5%] mt-[1%]">
                {ladderView.map((s) => {
                  const done = playing && s.step <= gems;
                  const now = playing && s.step === gems + 1;
                  return (
                    <div
                      key={s.step}
                      className={`flex-1 max-w-[76px] rounded-md border-2 border-[#140c22] text-center py-[0.6%] leading-tight font-['Oswald'] font-bold transition-colors ${
                        now
                          ? 'mn-step-now bg-[linear-gradient(180deg,#ffffff,#cbd5e1)] text-black shadow-[0_3px_0_#140c22,0_0_16px_rgba(255,255,255,0.6)]'
                          : done
                            ? 'bg-[linear-gradient(180deg,#5ee8ff,#1386b8)] text-[#07203a] shadow-[0_3px_0_#140c22]'
                            : 'bg-black/55 text-white/80 shadow-[0_3px_0_#140c22]'
                      }`}
                    >
                      <div className="text-[clamp(10px,2.6cqw,17px)]">
                        x{s.multiplier >= 1000 ? fmt(Math.round(s.multiplier)) : s.multiplier.toFixed(2)}
                      </div>
                      <div className={`text-[clamp(8px,1.7cqw,11px)] ${now ? 'text-black/70' : done ? 'text-[#07203a]/70' : 'text-white/45'}`}>
                        {s.step} 💎
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Cadre en bois */}
              <div
                className={`relative w-full rounded-xl border-[5px] border-[#140c22] p-[2.5%] shadow-[0_20px_50px_rgba(0,0,0,0.7)] bg-[linear-gradient(180deg,#8a5a2a,#4a2a12)] ${
                  shaking ? 'mn-shake' : ''
                }`}
              >
                <div className="absolute inset-0 rounded-lg opacity-50 bg-[repeating-linear-gradient(0deg,transparent_0_22px,rgba(0,0,0,0.3)_22px_24px)] pointer-events-none" />
                {['top-[1%] left-[1%]', 'top-[1%] right-[1%]', 'bottom-[1%] left-[1%]', 'bottom-[1%] right-[1%]'].map((pos) => (
                  <span
                    key={pos}
                    className={`absolute ${pos} w-[2.2%] aspect-square rounded-full border-2 border-[#140c22] bg-[radial-gradient(circle_at_35%_30%,#ffffff,#cbd5e1_55%,#475569)]`}
                  />
                ))}

                <div className="relative rounded-md bg-[radial-gradient(circle_at_50%_40%,#1e1438,#0b0716)] p-[2%] shadow-[inset_0_6px_20px_rgba(0,0,0,0.8)]">
                  <div className="grid grid-cols-5 gap-[clamp(5px,1.6cqw,12px)]">
                    {Array.from({ length: GRID_SIZE }, (_, idx) => (
                      <Tile
                        key={idx}
                        idx={idx}
                        board={board}
                        picked={picked.includes(idx)}
                        live={playing && !picked.includes(idx)}
                        revealAll={revealAll}
                        boom={result?.boomIdx === idx}
                        idleBreathe={phase === 'idle' && !board}
                        onPick={pickTile}
                        onHover={() => audio.current.hover()}
                      />
                    ))}
                  </div>

                  {/* Flash rouge de l'explosion */}
                  {result && !result.won && !playing && (
                    <div key={`f${shakeKey}`} className="mn-flash absolute inset-0 rounded-md bg-[#ff3a1a] pointer-events-none" />
                  )}

                  {plaque && result && <ResultPlaque result={result} />}
                </div>
              </div>
            </div>
          </div>

          <div className="hidden lg:flex w-[170px] shrink-0 flex-col gap-2">
            <InfoCard title="PROCHAIN" value={`x${fmt(nextMult)}`} sub="Multiplicateur au prochain diamant" />
            <InfoCard
              title="CHANCE"
              value={`${fmt(nextProb)} %`}
              tone={nextProb >= 70 ? 'good' : nextProb >= 40 ? 'mid' : 'bad'}
              sub="De tomber sur un diamant"
            />
            <InfoCard title="GAIN MAX" value={`x${fmt(Math.round(maxMult))}`} sub={`Les ${GRID_SIZE - mines} diamants trouvés`} />
          </div>
        </div>

        <ControlBar
          credit={balance}
          bet={phase === 'idle' ? bet : roundBet}
          mines={mines}
          win={winShown}
          demo={mode === 'demo'}
          status={status}
          phase={phase}
          gems={gems}
          potential={potentialWin}
          multiplier={multiplier}
          muted={muted}
          volume={volume}
          canDec={phase === 'idle' && betIdx > 0}
          canInc={phase === 'idle' && betIdx < betLevels.length - 1}
          onDec={() => changeBet(-1)}
          onInc={() => changeBet(1)}
          onMain={mainAction}
          onRandom={randomPick}
          onMines={() => phase === 'idle' && setMinesOpen(true)}
          onMenu={() => setMenuOpen(true)}
          onInfo={() => setInfoOpen(true)}
          onMute={toggleMute}
          onVolumeChange={handleVolumeChange}
        />

        {bigWin && <BigWinOverlay amount={bigWin.shown} mult={bigWin.mult} onClick={skipAll} />}

        {minesOpen && (
          <Modal title="NOMBRE DE MINES" onClose={() => setMinesOpen(false)}>
            <MinesPanel className="flex" mines={minesCount} locked={phase !== 'idle'} onChange={changeMines} bare />
            <button
              onClick={() => setMinesOpen(false)}
              className="mt-4 w-full font-['Oswald'] font-bold text-lg py-2.5 rounded-lg bg-[linear-gradient(180deg,#ffffff,#cbd5e1)] text-black border-[3px] border-[#140c22] shadow-[0_4px_0_#140c22]"
            >
              VALIDER
            </button>
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
                accentClass="accent-[#3fd2f2]"
              />
              <MenuRow
                icon={<Info size={18} />}
                label="Règles et équité"
                onClick={() => {
                  setMenuOpen(false);
                  setInfoOpen(true);
                }}
              />
              <MenuRow
                icon={<RotateCw size={18} />}
                label={`Recharger le solde démo (${fmt(DEMO_START)})`}
                disabled={phase !== 'idle' || mode !== 'demo'}
                onClick={() => setDemoChips(DEMO_START)}
              />
            </div>
            <div className="mt-5">
              <div className="flex items-center gap-2 font-['Oswald'] font-bold text-white text-sm tracking-wider mb-2">
                <History size={15} /> DERNIÈRES MANCHES
              </div>
              {history.length === 0 ? (
                <p className="text-xs text-white/50">Aucune manche jouée pour l'instant.</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-xs">
                      <span className="text-white/60">
                        {h.at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {h.mines} 💣 · {h.gems} 💎
                        {h.mode === 'demo' && <span className="ml-1 text-white/35">démo</span>}
                      </span>
                      <span className={`font-['Oswald'] font-bold text-sm ${h.won ? 'text-[#5ee8ff]' : 'text-[#ff5a4a]'}`}>
                        {h.won ? `x${fmt(h.multiplier)} +${fmt(h.win - h.bet)}` : `-${fmt(h.bet)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Modal>
        )}

        {infoOpen && (
          <Modal title="RÈGLES DU JEU" onClose={() => setInfoOpen(false)} wide>
            <div className="grid sm:grid-cols-3 gap-3 text-xs text-white/85 leading-relaxed">
              <RuleCard art={<Pickaxe className="w-full h-full text-white" />} title="1. Mise & mines">
                Choisissez votre mise et le nombre de mines cachées (1 à 24) parmi les 25 blocs.
              </RuleCard>
              <RuleCard art={<GemArt className="w-full h-full" />} title="2. Creusez">
                Chaque diamant trouvé fait monter le multiplicateur. Plus il y a de mines, plus il grimpe vite.
              </RuleCard>
              <RuleCard art={<BombArt className="w-full h-full" />} title="3. Encaissez">
                Encaissez quand vous voulez. Une mine et la mise est perdue. Tous les diamants = Grand Chelem.
              </RuleCard>
            </div>

            <h4 className="font-['Luckiest_Guy'] text-lg text-white text-center mt-5 mb-2 tracking-wide">
              GAINS AVEC {mines} MINE{mines > 1 ? 'S' : ''} · MISE {fmt(phase === 'idle' ? bet : roundBet)}
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {ladder.map((s) => (
                <div key={s.step} className="rounded-md bg-black/30 px-2 py-1.5 text-center font-['Oswald']">
                  <div className="text-[10px] text-white/50">
                    {s.step} 💎 · {fmt(s.probSurvive)} %
                  </div>
                  <div className="text-sm font-bold text-[#5ee8ff]">x{fmt(s.multiplier)}</div>
                  <div className="text-[11px] text-white/80">{fmt(Math.floor((phase === 'idle' ? bet : roundBet) * s.multiplier))}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-lg bg-black/30 p-3 text-xs text-white/80">
              <div className="flex items-center gap-2 font-['Oswald'] font-bold text-white text-sm tracking-wider mb-1.5">
                <ShieldCheck size={15} /> ÉQUITÉ PROUVABLE
              </div>
              <p className="text-white/60 mb-2">
                La grille est tirée avant votre premier coup de pioche. Son empreinte SHA-256 est visible pendant la manche et la graine est
                dévoilée à la fin : sha256(graine:grille) doit redonner la même empreinte.
              </p>
              {board ? (
                <div className="space-y-1.5 font-mono text-[10px] break-all">
                  <HashRow label="Empreinte" value={board.hash} />
                  {playing ? (
                    <div className="text-white/40 font-sans">Graine dévoilée à la fin de la manche.</div>
                  ) : (
                    <>
                      <HashRow label="Graine" value={board.serverSeed} />
                      <button
                        onClick={verifyBoard}
                        className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-[#2f7a52] px-3 py-1.5 font-sans text-xs font-bold text-white hover:bg-[#3a9064]"
                      >
                        <CheckCircle2 size={13} />
                        {verify === 'ok' ? 'Grille vérifiée' : verify === 'ko' ? 'Échec de la vérification' : 'Vérifier la dernière grille'}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-white/40">Lancez une manche pour obtenir une empreinte.</div>
              )}
            </div>
            <p className="text-white/50 text-[11px] text-center mt-4">RTP {fmt(cfg.rtp)} %, grille tirée et gardée secrète par le serveur. ESPACE pour jouer / encaisser, R pour une case au hasard.</p>
          </Modal>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Case
// =============================================================================

interface TileProps {
  idx: number;
  board: GeneratedBoard | null;
  picked: boolean;
  live: boolean;
  revealAll: boolean;
  boom: boolean;
  idleBreathe: boolean;
  onPick: (idx: number) => void;
  onHover: () => void;
}

const Tile: React.FC<TileProps> = ({ idx, board, picked, live, revealAll, boom, idleBreathe, onPick, onHover }) => {
  const isMine = board?.board[idx] ?? false;
  const open = picked || revealAll;
  const ghost = open && !picked;

  if (!open) {
    return (
      <button
        type="button"
        disabled={!live}
        onClick={() => onPick(idx)}
        onMouseEnter={() => live && onHover()}
        aria-label={`Case ${coord(idx)}`}
        className={`mn-tile relative aspect-square rounded-[14%] border-[3px] border-[#140c22] overflow-hidden focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5ee8ff] ${
          live ? 'mn-tile-live cursor-pointer' : 'cursor-default'
        } ${idleBreathe ? 'mn-idle-breathe' : ''} ${!live && !idleBreathe ? 'brightness-75' : ''}`}
        style={{
          background: 'radial-gradient(circle at 30% 25%, #8f7cb4 0%, #5d4d80 42%, #372b55 100%)',
          boxShadow: 'inset 0 4px 0 rgba(255,255,255,0.2), inset 0 -6px 0 rgba(0,0,0,0.45), 0 4px 0 #140c22',
          animationDelay: idleBreathe ? `${((idx % 5) + Math.floor(idx / 5)) * 0.12}s` : undefined,
        }}
      >
        <RockFace seed={idx * 7 + 3} />
      </button>
    );
  }

  return (
    <div
      className={`relative aspect-square rounded-[14%] border-[3px] flex items-center justify-center ${
        boom
          ? 'border-[#140c22] bg-[radial-gradient(circle,#ff6a3a,#8a1010_70%)] z-10'
          : isMine
            ? 'border-[#140c22]/60 bg-[#1a0c18]'
            : picked
              ? 'border-[#140c22] bg-[radial-gradient(circle,#1c5a7a,#0c1e3a_75%)] shadow-[inset_0_0_14px_rgba(94,232,255,0.45)]'
              : 'border-[#140c22]/60 bg-[#0e1024]'
      }`}
    >
      {picked && !isMine && (
        <>
          <span className="mn-burst absolute inset-[10%] rounded-full border-4 border-[#9ef3ff] pointer-events-none" />
          <RockChips />
        </>
      )}
      {boom ? (
        <>
          <BlastArt className="mn-blast absolute inset-[-12%] w-[124%] h-[124%]" />
          <BombArt className="relative w-[72%] mn-reveal" lit={false} />
          <RockChips />
        </>
      ) : isMine ? (
        <BombArt className={`w-[68%] ${ghost ? 'mn-ghost opacity-55 saturate-50' : 'mn-reveal'}`} lit={!ghost} />
      ) : (
        <GemArt className={`w-[74%] ${ghost ? 'mn-ghost opacity-40 grayscale-[40%] scale-90' : 'mn-reveal mn-gem-glow'}`} />
      )}
    </div>
  );
};

const ResultPlaque: React.FC<{ result: RoundResult }> = ({ result }) => (
  <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
    <div
      className={`wd-pop rounded-xl border-[4px] border-[#140c22] px-6 py-3 text-center shadow-[0_6px_0_#140c22,0_18px_40px_rgba(0,0,0,0.6)] ${
        result.won ? 'bg-[linear-gradient(180deg,#b8f6ff,#3fd2f2_55%,#1386b8)]' : 'bg-[linear-gradient(180deg,#ffb08a,#ff4a1a_55%,#8a1010)]'
      }`}
    >
      {result.won ? (
        <>
          <div className="font-['Luckiest_Guy'] text-[clamp(26px,7cqw,48px)] leading-none text-white [-webkit-text-stroke:2px_#140c22] drop-shadow-[0_3px_0_#140c22]">
            x{fmt(result.multiplier)}
          </div>
          <div className="font-['Oswald'] font-bold text-[clamp(16px,4cqw,26px)] text-[#07203a] mt-1">+{fmt(result.win)}</div>
        </>
      ) : (
        <>
          <div className="font-['Luckiest_Guy'] text-[clamp(30px,8cqw,56px)] leading-none text-white [-webkit-text-stroke:2px_#140c22] drop-shadow-[0_3px_0_#140c22]">
            BOOM !
          </div>
          <div className="font-['Oswald'] font-bold text-[clamp(14px,3.4cqw,22px)] text-white mt-1">-{fmt(result.bet)}</div>
        </>
      )}
    </div>
  </div>
);

// =============================================================================
// Panneaux
// =============================================================================

const MinesPanel: React.FC<{ className?: string; mines: number; locked: boolean; onChange: (n: number) => void; bare?: boolean }> = ({
  className = '',
  mines,
  locked,
  onChange,
  bare,
}) => {
  const first = Math.round(((GRID_SIZE - mines) / GRID_SIZE) * 100);
  return (
    <div className={`${className} ${bare ? '' : 'w-[170px] shrink-0 rounded-xl bg-black/50 backdrop-blur border border-white/10 p-3'} flex-col gap-3`}>
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 shrink-0">
          <BombArt className="w-full h-full" />
        </div>
        <div className="font-['Oswald'] font-bold text-white text-sm tracking-wider leading-tight">
          MINES
          <div className="text-[10px] text-white/60 tracking-normal font-semibold">{locked ? 'Verrouillé pendant la manche' : 'Plus de mines, plus de gains'}</div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => onChange(mines - 1)}
          disabled={locked || mines <= 1}
          aria-label="Moins de mines"
          className="w-9 h-9 rounded-lg bg-black/40 text-white flex items-center justify-center hover:bg-black/60 disabled:opacity-30"
        >
          <Minus size={18} strokeWidth={3} />
        </button>
        <div className="font-['Luckiest_Guy'] text-4xl text-white [-webkit-text-stroke:1.5px_#140c22] drop-shadow-[0_3px_0_#140c22]">{mines}</div>
        <button
          onClick={() => onChange(mines + 1)}
          disabled={locked || mines >= 24}
          aria-label="Plus de mines"
          className="w-9 h-9 rounded-lg bg-black/40 text-white flex items-center justify-center hover:bg-black/60 disabled:opacity-30"
        >
          <Plus size={18} strokeWidth={3} />
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {MINE_PRESETS.map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            disabled={locked}
            className={`py-1.5 rounded-md border-2 border-[#140c22] font-['Oswald'] font-bold text-xs transition-colors disabled:opacity-40 ${
              mines === n ? 'bg-white text-black font-bold' : 'bg-[#2a2044] text-white hover:bg-[#3a2c5c]'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-center font-['Oswald']">
        <div className="rounded-md bg-black/35 py-1.5">
          <div className="text-[10px] text-white/55 tracking-wider">DIAMANTS</div>
          <div className="text-lg font-bold text-[#5ee8ff] leading-none">{GRID_SIZE - mines}</div>
        </div>
        <div className="rounded-md bg-black/35 py-1.5">
          <div className="text-[10px] text-white/55 tracking-wider">1ER COUP</div>
          <div className="text-lg font-bold text-white leading-none">{first} %</div>
        </div>
      </div>
    </div>
  );
};

const InfoCard: React.FC<{ title: string; value: string; sub?: string; tone?: 'good' | 'mid' | 'bad' }> = ({ title, value, sub, tone }) => (
  <div className="rounded-lg bg-black/50 backdrop-blur p-3 text-center border border-white/10">
    <div className="font-['Oswald'] font-bold text-neutral-300 text-xs tracking-wider">{title}</div>
    <div
      className={`font-['Oswald'] font-bold text-xl ${
        tone === 'good' ? 'text-white font-bold' : tone === 'mid' ? 'text-neutral-300' : tone === 'bad' ? 'text-neutral-500' : 'text-white'
      }`}
    >
      {value}
    </div>
    {sub && <div className="text-[10px] text-white/60 leading-tight mt-0.5">{sub}</div>}
  </div>
);

// =============================================================================
// Barre de contrôle (même disposition que les machines à sous)
// =============================================================================

interface ControlBarProps {
  credit: number;
  bet: number;
  mines: number;
  win: number;
  demo: boolean;
  status: string;
  phase: Phase;
  gems: number;
  potential: number;
  multiplier: number;
  muted: boolean;
  volume: number;
  canDec: boolean;
  canInc: boolean;
  onDec: () => void;
  onInc: () => void;
  onMain: () => void;
  onRandom: () => void;
  onMines: () => void;
  onMenu: () => void;
  onInfo: () => void;
  onMute: () => void;
  onVolumeChange: (vol: number) => void;
}

const ControlBar: React.FC<ControlBarProps> = (p) => {
  const cash = p.phase === 'playing' && p.gems > 0;
  const waiting = p.phase === 'playing' && p.gems === 0;
  return (
    <div className="absolute inset-x-0 bottom-0 z-30">
      <div className="bg-gradient-to-t from-black/90 via-black/70 to-black/0 pt-6 pb-3 px-3 sm:px-6">
        <div className="mx-auto max-w-[1100px] grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_1fr] items-end gap-x-2 gap-y-2">
          {/* Gauche */}
          <div className="flex items-end gap-2 sm:gap-4 min-w-0">
            <div className="flex flex-col gap-1.5">
              <button onClick={p.onMenu} title="Menu" aria-label="Menu" className="text-white/85 hover:text-white">
                <Menu size={18} />
              </button>
              <button onClick={p.onInfo} title="Règles" aria-label="Règles" className="text-white/85 hover:text-white">
                <Info size={18} />
              </button>
              <GameVolumeButton
                muted={p.muted}
                volume={p.volume}
                onMute={p.onMute}
                onVolumeChange={p.onVolumeChange}
                accentClass="accent-[#3fd2f2]"
              />
            </div>
            <div className="leading-tight min-w-0 font-['Oswald'] font-bold tracking-wide">
              <div className="text-[13px] sm:text-base whitespace-nowrap">
                <span className="text-neutral-400">SOLDE </span>
                <span className="text-white">{fmt(p.credit)}</span>
                {p.demo && <span className="ml-1 text-[10px] text-white/50 align-middle">DÉMO</span>}
              </div>
              <div className="text-[13px] sm:text-base whitespace-nowrap">
                <span className="text-neutral-400">MISE </span>
                <span className="text-white">{fmt(p.bet)}</span>
              </div>
              <button
                onClick={p.onMines}
                disabled={p.phase !== 'idle'}
                className="lg:hidden block text-[13px] whitespace-nowrap underline decoration-dotted underline-offset-2 disabled:no-underline"
              >
                <span className="text-neutral-400">MINES </span>
                <span className="text-white">{p.mines}</span>
              </button>
            </div>
          </div>

          {/* Centre */}
          <div className="col-span-2 sm:col-span-1 order-first sm:order-none flex flex-col items-center pb-1 min-w-0">
            <div className="h-5 font-['Oswald'] font-bold tracking-wide text-white text-xs sm:text-sm truncate max-w-full">{p.status}</div>
            <div
              className={`font-['Oswald'] font-bold text-center whitespace-nowrap text-[15px] sm:text-2xl ${
                p.win > 0 ? 'text-[#5ee8ff] drop-shadow-[0_0_10px_rgba(94,232,255,0.6)]' : 'text-white'
              }`}
            >
              GAIN {fmt(p.win)}
            </div>
          </div>

          {/* Droite */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={p.onDec}
                disabled={!p.canDec}
                title="Diminuer la mise"
                aria-label="Diminuer la mise"
                className="w-10 h-10 rounded-lg bg-black/40 text-white flex items-center justify-center hover:bg-black/60 disabled:opacity-30"
              >
                <Minus size={22} strokeWidth={3} />
              </button>
              <button
                onClick={p.onMain}
                disabled={waiting || p.phase === 'ending'}
                title={cash ? 'Encaisser (ESPACE)' : 'Jouer (ESPACE)'}
                className={`relative h-[72px] sm:h-[80px] w-[128px] sm:w-[150px] rounded-full border-[4px] border-[#140c22] flex flex-col items-center justify-center font-['Oswald'] font-bold leading-none active:translate-y-[3px] transition-transform disabled:cursor-not-allowed ${
                  cash
                    ? 'mn-cash-btn bg-[linear-gradient(180deg,#b0ffd8,#2fd08a_55%,#0f7a4a)] text-[#062a18]'
                    : waiting
                      ? 'bg-[linear-gradient(180deg,#4a3e6a,#2a2044)] text-white/70 shadow-[0_5px_0_#140c22]'
                      : 'bg-[linear-gradient(180deg,#ffffff,#e2e8f0_55%,#94a3b8)] text-black shadow-[0_5px_0_#140c22] hover:brightness-110 disabled:opacity-60'
                }`}
              >
                {cash ? (
                  <>
                    <span className="text-[15px] sm:text-lg tracking-wider">ENCAISSER</span>
                    <span className="text-[13px] sm:text-sm mt-1">{fmt(p.potential)}</span>
                  </>
                ) : waiting ? (
                  <>
                    <Pickaxe size={22} />
                    <span className="text-[11px] mt-1 tracking-wider">CREUSEZ</span>
                  </>
                ) : (
                  <span className="flex items-center gap-2 text-xl sm:text-2xl tracking-wider">
                    <Pickaxe size={24} strokeWidth={2.6} /> JOUER
                  </span>
                )}
              </button>
              <button
                onClick={p.onInc}
                disabled={!p.canInc}
                title="Augmenter la mise"
                aria-label="Augmenter la mise"
                className="w-10 h-10 rounded-lg bg-black/40 text-white flex items-center justify-center hover:bg-black/60 disabled:opacity-30"
              >
                <Plus size={22} strokeWidth={3} />
              </button>
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={p.onRandom}
                disabled={p.phase !== 'playing'}
                title="Case au hasard (R)"
                className={`flex items-center gap-1.5 font-['Oswald'] font-bold tracking-wider text-xs sm:text-[13px] px-3.5 py-1 rounded-full border transition-all ${
                  p.phase === 'playing'
                    ? 'bg-white/15 border-white/40 text-white hover:bg-white/25 active:scale-95 shadow-md cursor-pointer'
                    : 'bg-black/20 border-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                <Shuffle size={13} strokeWidth={2.4} /> HASARD
              </button>
              {cash && (
                <span className="font-['Oswald'] font-bold text-xs sm:text-[13px] px-2.5 py-1 rounded-full bg-[#5ee8ff] text-[#07203a] shadow-sm">
                  x{fmt(p.multiplier)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Overlays & modales
// =============================================================================

const BigWinOverlay: React.FC<{ amount: number; mult: number; onClick: () => void }> = ({ amount, mult, onClick }) => {
  const label = mult >= 50 ? 'EPIC WIN' : mult >= 25 ? 'MEGA WIN' : 'BIG WIN';
  const rain = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: Math.random() * 100,
        size: 22 + Math.random() * 26,
        dur: 1.8 + Math.random() * 2,
        delay: Math.random() * 2.5,
        hue: (['cyan', 'pink', 'gold'] as const)[i % 3],
      })),
    [],
  );
  return (
    <div
      onClick={onClick}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden cursor-pointer bg-[radial-gradient(circle,rgba(20,60,110,0.85),rgba(0,0,0,0.93))]"
    >
      <div
        className="dh-rays absolute left-1/2 top-1/2 w-[160vmax] h-[160vmax] -ml-[80vmax] -mt-[80vmax] pointer-events-none"
        style={{ background: 'repeating-conic-gradient(rgba(94,232,255,0.13) 0deg 7deg, transparent 7deg 18deg)' }}
      />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {rain.map((g, i) => (
          <div
            key={i}
            className="dh-coin absolute top-0"
            style={{
              left: `${g.left}%`,
              width: g.size,
              height: g.size,
              animationDuration: `${g.dur}s`,
              animationDelay: `${g.delay}s`,
              animationIterationCount: 'infinite',
            }}
          >
            <GemArt className="w-full h-full" hue={g.hue} />
          </div>
        ))}
      </div>
      <div
        key={label}
        className="relative wd-pop font-['Luckiest_Guy'] text-[clamp(48px,11vw,130px)] leading-none text-center px-4"
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #b8f6ff 35%, #3fd2f2 65%, #1470a8 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextStroke: '3px #140c22',
          filter: 'drop-shadow(0 7px 0 #140c22)',
        }}
      >
        {label}
      </div>
      <div className="relative mt-3 font-['Oswald'] font-bold text-[clamp(22px,4vw,40px)] text-white drop-shadow-[0_3px_0_#140c22]">x{fmt(mult)}</div>
      <div className="relative mt-1 font-['Oswald'] font-bold text-[clamp(36px,7vw,84px)] text-white drop-shadow-[0_5px_0_#140c22]">
        {fmt(Math.floor(amount))}
      </div>
      <div className="relative mt-2 text-white/60 text-xs font-semibold">Cliquez pour passer</div>
    </div>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => (
  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 p-3" onClick={onClose}>
    <div
      onClick={(e) => e.stopPropagation()}
      className={`wd-pop relative w-full ${wide ? 'max-w-3xl' : 'max-w-sm'} max-h-full overflow-y-auto rounded-xl border-[3px] border-[#140c22] bg-[linear-gradient(180deg,#2e2250,#140c22)] p-5 shadow-2xl`}
    >
      <button onClick={onClose} aria-label="Fermer" className="absolute top-3 right-3 text-white/80 hover:text-white">
        <X size={20} />
      </button>
      <h3 className="font-['Luckiest_Guy'] text-2xl tracking-wide text-white text-center mb-4 pr-6">{title}</h3>
      {children}
    </div>
  </div>
);

const MenuRow: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }> = ({ icon, label, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full flex items-center gap-3 rounded-lg bg-black/30 hover:bg-black/50 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
  >
    {icon}
    {label}
  </button>
);

const RuleCard: React.FC<{ art: React.ReactNode; title: string; children: React.ReactNode }> = ({ art, title, children }) => (
  <div className="rounded-lg bg-black/30 p-3">
    <div className="flex items-center gap-2 mb-1.5">
      <div className="w-9 h-9 shrink-0">{art}</div>
      <b className="text-white font-['Oswald'] text-sm tracking-wide">{title}</b>
    </div>
    <p>{children}</p>
  </div>
);

const HashRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 font-sans font-semibold text-white/50 w-[70px]">{label}</span>
      <span className="flex-1 text-white/85">{value}</span>
      <button
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label={`Copier ${label}`}
        className="shrink-0 text-white/60 hover:text-white"
      >
        {copied ? <CheckCircle2 size={13} className="text-[#5effa8]" /> : <Copy size={13} />}
      </button>
    </div>
  );
};
