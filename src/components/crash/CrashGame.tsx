import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, History, Info, Rocket, RotateCw, ShieldCheck, Target, TrendingUp, Zap } from 'lucide-react';
import { useCasinoUser } from '../../context/CasinoUserContext';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import { useCappedMaxPayout } from '../../lib/casinoLimits';
import { MachineClosedBanner, useMachineClosed } from '../MachineClosedBanner';
import { GameVolumeModalRow } from '../VolumeControl';
import {
  apiCrashCashout,
  apiCrashCurrent,
  apiCrashHistory,
  apiCrashStart,
  apiCrashStatus,
  CasinoApiError,
  type CrashRoundState,
} from '../../lib/supabase';
import {
  BalanceLine,
  BetInput,
  BigWinOverlay,
  HashRow,
  Label,
  MenuRow,
  Modal,
  Panel,
  RuleCard,
  StatBox,
  TopBar,
  fmt,
  isTyping,
  fmtMult,
  randomSeed,
  sha256Hex,
  useBet,
  useDemoBalance,
  useOriginalsSound,
  usePlayMode,
  type Theme,
} from '../originals/OriginalsShell';
import { chanceToReach, crashFromSeed, crashTone, msFor, multAt, rawMultAt } from './crashMath';

const THEME: Theme = { accent: '#ff5a3c', accentText: '#1a0500', accentClass: 'accent-[#ff5a3c]' };
const POLL_MS = 350;
const TARGET_PRESETS = [1.5, 2, 3, 5, 10, 100];
const AUTO_COUNTS = [5, 10, 25, 50, 0];

type Phase = 'idle' | 'starting' | 'running' | 'ended';

interface RoundView {
  bet: number;
  target: number;
  /** Objectif choisi par le joueur (null = encaissement manuel) */
  auto: number | null;
  hash: string;
  /** Mode démo : connu d'avance (jamais affiché avant la fin) */
  demoCrash?: number;
  demoSeed?: string;
}

interface Outcome {
  won: boolean;
  crash: number;
  cashoutAt: number | null;
  win: number;
  bet: number;
  seed: string | null;
  hash: string;
  rtp: number;
}

interface HistoryItem {
  crash: number;
  cashoutAt: number | null;
  win: number;
  bet: number;
  demo: boolean;
  at: number;
}

export const CrashGame: React.FC = () => {
  const { user, isAuthenticated, applyServerProfile } = useCasinoUser();
  const { gamesConfig } = useCasinoAdmin();
  // Gain max : réglage du jeu, plafonné par la caisse du casino
  const cappedMaxPayout = useCappedMaxPayout(gamesConfig.crash.maxPayout);
  const cfg = useMemo(() => ({ ...gamesConfig.crash, maxPayout: cappedMaxPayout }), [gamesConfig.crash, cappedMaxPayout]);
  const closed = useMachineClosed('crash');
  const { audio, muted, volume, toggleMute, setVolume } = useOriginalsSound();

  const [mode, setMode] = usePlayMode(isAuthenticated, user?.chips);
  const [demoChips, setDemoChips, demoStart] = useDemoBalance('diamond_crash_demo_chips');
  const balance = mode === 'real' ? (user?.chips ?? 0) : demoChips;

  const { bet, setBet } = useBet(cfg.minBet, cfg.maxBet, 100);
  const [autoOn, setAutoOn] = useState(true);
  const [autoText, setAutoText] = useState('2.00');
  const autoValue = useMemo(() => {
    const v = Number(autoText.replace(',', '.'));
    return Number.isFinite(v) ? Math.min(cfg.maxMultiplier, Math.max(1.01, Math.floor(v * 100) / 100)) : 2;
  }, [autoText, cfg.maxMultiplier]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState<RoundView | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [cashedAt, setCashedAt] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [bigWin, setBigWin] = useState<{ amount: number; mult: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [verify, setVerify] = useState<'idle' | 'ok' | 'ko'>('idle');

  // Autoplay
  const [autoPlay, setAutoPlay] = useState<{ left: number; infinite: boolean } | null>(null);
  const [autoCount, setAutoCount] = useState(10);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const busy = useRef(false);
  const roundId = useRef<string | null>(null);
  /** performance.now() au départ de la fusée (recalé sur l'horloge du serveur) */
  const t0 = useRef(0);
  /** Multiplicateur où l'animation s'arrête (crash connu) */
  const endAt = useRef<number | null>(null);
  const [live, setLive] = useState(1);
  const liveRef = useRef(1);
  const [stageShake, setStageShake] = useState(0);

  const unlock = () => audio.unlock();
  const serverError = (err: unknown) => setMessage(err instanceof CasinoApiError ? err.message : 'Erreur serveur, réessayez.');

  // ---------------------------------------------------------------------------
  // Historique des points de crash
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (mode !== 'real' || !isAuthenticated) return;
    let alive = true;
    apiCrashHistory(20)
      .then((h) =>
        alive &&
        setHistory((prev) => [
          ...prev.filter((x) => x.demo),
          ...h.map((e) => ({ crash: Number(e.crash_point), cashoutAt: e.cashout_at === null ? null : Number(e.cashout_at), win: Number(e.win), bet: Number(e.bet), demo: false, at: new Date(e.at).getTime() })),
        ].sort((a, b) => b.at - a.at).slice(0, 30)),
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mode, isAuthenticated]);

  // ---------------------------------------------------------------------------
  // Fin de manche
  // ---------------------------------------------------------------------------
  const playCash = (mult: number, win: number) => {
    setCashedAt(mult);
    if (!audio.play('cashout', 0.9)) audio.blip(1400, 0.15, 0.3);
    audio.play(mult >= 3 ? 'winMedium' : 'winSmall', 0.7);
    audio.playAny(['coin1', 'coin2', 'coin3'], 0.5);
    setMessage(`Encaissé à ${fmtMult(mult)} : +${fmt(win, 0)}`);
  };

  const finish = useCallback(
    async (o: Outcome, isDemo: boolean) => {
      roundId.current = null;
      endAt.current = o.crash;
      setOutcome(o);
      setHistory((h) => [{ crash: o.crash, cashoutAt: o.cashoutAt, win: o.win, bet: o.bet, demo: isDemo, at: Date.now() }, ...h].slice(0, 30));
      if (isDemo && o.win > 0) setDemoChips((c) => c + o.win);
      if (o.won && o.cashoutAt !== null) playCash(o.cashoutAt, o.win);

      // La fusée continue (en accéléré) jusqu'au point de crash, puis explose
      const now = performance.now();
      const elapsed = now - t0.current;
      const remaining = msFor(o.crash) - elapsed;
      if (remaining > 0) {
        const speed = o.won ? Math.max(1, remaining / 2200) : 1;
        await new Promise<void>((resolve) => {
          const start = performance.now();
          const from = elapsed;
          const step = () => {
            const t = from + (performance.now() - start) * speed;
            if (t >= msFor(o.crash) || phaseRef.current !== 'running') {
              resolve();
              return;
            }
            const m = rawMultAt(t);
            liveRef.current = m;
            setLive(m);
            audio.engineUpdate(m);
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
      }
      liveRef.current = o.crash;
      setLive(o.crash);
      audio.engineStop(0.08);
      if (!audio.play('explosion', o.won ? 0.35 : 0.8)) audio.blip(90, 0.4, 0.4, 'sawtooth');
      setStageShake((k) => k + 1);
      setPhase('ended');
      setVerify('idle');

      if (o.won) {
        const mult = o.cashoutAt ?? 1;
        if (mult >= 10) {
          audio.play('winBig', 0.8);
          audio.play('shower', 0.6);
          setBigWin({ amount: o.win, mult });
          setTimeout(() => setBigWin(null), 3800);
        }
      }
    },
    [audio, setDemoChips],
  );

  const settleFromServer = useCallback(
    (st: CrashRoundState) => {
      if (st.profile) applyServerProfile(st.profile);
      void finish(
        {
          won: st.status === 'CASHED',
          crash: Number(st.crash_point ?? st.multiplier),
          cashoutAt: st.cashout_at === null ? null : Number(st.cashout_at),
          win: Number(st.win) || 0,
          bet: Number(st.bet),
          seed: st.server_seed,
          hash: st.hash,
          rtp: Number(st.rtp),
        },
        false,
      );
    },
    [applyServerProfile, finish],
  );

  // ---------------------------------------------------------------------------
  // Boucle d'animation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'running') return;
    let raf = 0;
    let lastMilestone = Math.floor(liveRef.current);
    const step = () => {
      if (endAt.current === null) {
        let m = rawMultAt(performance.now() - t0.current);
        // Ne dépasse jamais l'objectif avant la confirmation du serveur
        if (round && m >= round.target && !cashedAt) m = round.target;
        liveRef.current = m;
        setLive(m);
        audio.engineUpdate(m);
        if (Math.floor(m) > lastMilestone) {
          lastMilestone = Math.floor(m);
          audio.play('tick2', 0.35, 1 + Math.min(1, lastMilestone / 20));
        }
        // Mode démo : le client connaît le crash et l'objectif
        if (round?.demoCrash !== undefined) {
          const crash = round.demoCrash;
          if (!cashedAt && round.target <= crash && m >= round.target) {
            void finishDemo(round.target);
            return;
          }
          if (m >= crash) {
            void finishDemo(null);
            return;
          }
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round, cashedAt]);

  // Suivi serveur pendant la montée
  useEffect(() => {
    if (phase !== 'running' || mode !== 'real') return;
    let inflight = false;
    const id = setInterval(async () => {
      const rid = roundId.current;
      if (!rid || inflight || endAt.current !== null) return;
      inflight = true;
      try {
        const st = await apiCrashStatus(rid);
        if (roundId.current !== rid) return;
        if (st.status !== 'ACTIVE') {
          settleFromServer(st);
        } else {
          // Recalage doux sur l'horloge du serveur
          const target = performance.now() - Number(st.elapsed_ms);
          if (Math.abs(target - t0.current) > 120) t0.current = target;
        }
      } catch {
        // on réessaie au prochain tour
      } finally {
        inflight = false;
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [phase, mode, settleFromServer]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const beginAnimation = (view: RoundView, elapsedMs: number) => {
    t0.current = performance.now() - elapsedMs;
    endAt.current = null;
    liveRef.current = rawMultAt(elapsedMs);
    setLive(liveRef.current);
    setRound(view);
    setOutcome(null);
    setCashedAt(null);
    setMessage('');
    setPhase('running');
    audio.engineStart();
    if (!audio.play('slide1', 0.6)) audio.blip(300, 0.2, 0.2, 'sawtooth');
  };

  const startRound = useCallback(async () => {
    if (busy.current || phaseRef.current === 'running' || phaseRef.current === 'starting') return;
    unlock();
    const target = autoOn ? autoValue : null;
    if (mode === 'real') {
      if (closed) return setMessage('Machine fermée par la direction.');
      if (!isAuthenticated || !user) {
        setMode('demo');
        return setMessage('Connectez-vous pour miser vos jetons.');
      }
      if (balance < bet) return setMessage('Solde insuffisant.');
    } else if (demoChips < bet) {
      return setMessage('Solde démo insuffisant : rechargez-le dans le menu.');
    }
    busy.current = true;
    setPhase('starting');
    audio.play('chip', 0.7);
    try {
      if (mode === 'real') {
        const st = await apiCrashStart(bet, target);
        if (st.profile) applyServerProfile(st.profile);
        const view: RoundView = { bet, target: Number(st.target), auto: target, hash: st.hash };
        if (st.status !== 'ACTIVE') {
          // Crash immédiat à 1,00×
          t0.current = performance.now();
          setRound(view);
          setCashedAt(null);
          setPhase('running');
          settleFromServer(st);
        } else {
          roundId.current = st.round_id;
          beginAnimation(view, Number(st.elapsed_ms));
        }
      } else {
        const seed = randomSeed();
        const crash = await crashFromSeed(seed, cfg.rtp, cfg.maxMultiplier);
        const hash = await sha256Hex(seed);
        const cap = Math.max(1.01, Math.floor((cfg.maxPayout * 100) / bet) / 100);
        setDemoChips((c) => c - bet);
        const view: RoundView = {
          bet,
          target: Math.min(target ?? cfg.maxMultiplier, cfg.maxMultiplier, cap),
          auto: target,
          hash,
          demoCrash: crash,
          demoSeed: seed,
        };
        beginAnimation(view, 0);
      }
    } catch (err) {
      setPhase('idle');
      setAutoPlay(null);
      serverError(err);
    } finally {
      busy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOn, autoValue, mode, closed, isAuthenticated, user, balance, bet, demoChips, cfg, applyServerProfile, settleFromServer]);

  /** Fin d'une manche démo (cashAt = null : crash) */
  const finishDemo = useCallback(
    async (cashAt: number | null) => {
      if (!round || round.demoCrash === undefined || endAt.current !== null) return;
      endAt.current = round.demoCrash;
      const win = cashAt === null ? 0 : Math.min(Math.floor(round.bet * cashAt), cfg.maxPayout);
      await finish(
        { won: cashAt !== null, crash: round.demoCrash, cashoutAt: cashAt, win, bet: round.bet, seed: round.demoSeed ?? null, hash: round.hash, rtp: cfg.rtp },
        true,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round, cfg, finish],
  );

  const cashOut = useCallback(async () => {
    if (phaseRef.current !== 'running' || cashedAt || endAt.current !== null || busy.current) return;
    unlock();
    if (mode === 'demo') {
      const m = Math.floor(liveRef.current * 100) / 100;
      if (round?.demoCrash !== undefined && m < round.demoCrash) void finishDemo(Math.max(1, m));
      return;
    }
    const rid = roundId.current;
    if (!rid) return;
    busy.current = true;
    try {
      settleFromServer(await apiCrashCashout(rid));
    } catch (err) {
      serverError(err);
    } finally {
      busy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashedAt, mode, round, finishDemo, settleFromServer]);

  // Reprise d'une manche en cours (onglet rechargé)
  useEffect(() => {
    if (mode !== 'real' || !isAuthenticated || phaseRef.current !== 'idle') return;
    let alive = true;
    apiCrashCurrent()
      .then((st) => {
        if (!alive || !st || phaseRef.current !== 'idle') return;
        roundId.current = st.round_id;
        beginAnimation({ bet: Number(st.bet), target: Number(st.target), auto: st.auto_cashout === null ? null : Number(st.auto_cashout), hash: st.hash }, Number(st.elapsed_ms));
        setMessage('Manche en cours reprise.');
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isAuthenticated]);

  // Autoplay : relance après chaque manche
  useEffect(() => {
    if (phase !== 'ended' || !autoPlay) return;
    if (!autoPlay.infinite && autoPlay.left <= 0) {
      setAutoPlay(null);
      return;
    }
    const t = setTimeout(() => {
      if (balance < bet || (mode === 'real' && closed)) {
        setAutoPlay(null);
        setMessage('Autoplay arrêté : solde insuffisant.');
        return;
      }
      setAutoPlay((a) => (a ? { ...a, left: a.infinite ? a.left : a.left - 1 } : a));
      void startRound();
    }, 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const mainAction = useCallback(() => {
    if (bigWin) return setBigWin(null);
    if (phaseRef.current === 'running' && !cashedAt && endAt.current === null) void cashOut();
    else if (phaseRef.current === 'idle' || phaseRef.current === 'ended') void startRound();
  }, [bigWin, cashedAt, cashOut, startRound]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        mainAction();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mainAction]);

  const verifyRound = async () => {
    if (!outcome?.seed) return;
    const hashOk = (await sha256Hex(outcome.seed)) === outcome.hash;
    const crash = await crashFromSeed(outcome.seed, outcome.rtp, cfg.maxMultiplier);
    setVerify(hashOk && Math.abs(crash - outcome.crash) < 0.001 ? 'ok' : 'ko');
  };

  // ---------------------------------------------------------------------------
  // Affichage
  // ---------------------------------------------------------------------------
  const running = phase === 'running';
  const locked = phase === 'running' || phase === 'starting';
  const canCash = running && !cashedAt && endAt.current === null && live >= 1;
  const shownMult = Math.floor(live * 100) / 100;
  const potential = round ? Math.min(Math.floor(round.bet * shownMult), cfg.maxPayout) : 0;
  const crashed = phase === 'ended' && outcome !== null;
  const chance = chanceToReach(autoValue, cfg.rtp);
  // Affiché dans le panneau sur ordinateur, juste sous le graphique sur mobile
  const mainButton = (
    <MainButton
      phase={phase}
      canCash={canCash}
      cashed={!!cashedAt}
      potential={potential}
      mult={shownMult}
      autoPlay={!!autoPlay}
      onClick={mainAction}
      disabled={phase === 'starting'}
    />
  );

  return (
    <div className="relative bg-[#07050f] pt-[80px] sm:pt-[90px]">
      <MachineClosedBanner state={closed} />
      <div data-fullscreen-root className="relative w-full overflow-hidden select-none bg-[radial-gradient(ellipse_at_50%_0%,#3a1030_0%,#150820_45%,#07050f_100%)]" style={{ minHeight: 'max(700px, calc(100svh - 90px))' }}>
        <div className="cr-stars pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(1.5px 1.5px at 20px 30px, #fff, transparent), radial-gradient(1px 1px at 120px 80px, #ffd, transparent), radial-gradient(1.5px 1.5px at 300px 160px, #fff, transparent), radial-gradient(1px 1px at 420px 40px, #fdf, transparent), radial-gradient(1px 1px at 600px 220px, #fff, transparent), radial-gradient(1.5px 1.5px at 720px 120px, #fff, transparent)', backgroundSize: '800px 400px' }} />

        <TopBar
          mode={mode}
          onMode={setMode}
          locked={locked || !!autoPlay}
          isAuthenticated={isAuthenticated}
          theme={THEME}
          onMenu={() => setMenuOpen(true)}
          onInfo={() => setInfoOpen(true)}
          muted={muted}
          volume={volume}
          onMute={toggleMute}
          onVolume={setVolume}
        />

        <div className="relative z-10 mx-auto max-w-[1400px] flex flex-col-reverse lg:flex-row gap-4 px-3 sm:px-6 pt-4 pb-6">
          {/* Commandes */}
          <div className="w-full lg:w-[330px] shrink-0 flex flex-col gap-3">
            <Panel className="flex flex-col gap-3">
              <BalanceLine balance={balance} demo={mode === 'demo'} />
              <BetInput bet={bet} onChange={setBet} min={cfg.minBet} max={cfg.maxBet} balance={balance} disabled={locked || !!autoPlay} onClick={() => audio.click()} />

              <div>
                <Label
                  right={
                    <button
                      onClick={() => !locked && setAutoOn((v) => !v)}
                      disabled={locked || !!autoPlay}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wider ${autoOn ? 'bg-[#ff5a3c] text-[#1a0500]' : 'bg-white/10 text-white/60'}`}
                    >
                      {autoOn ? 'ACTIVÉ' : 'MANUEL'}
                    </button>
                  }
                >
                  Encaissement auto
                </Label>
                <div className={`flex items-center gap-1.5 ${autoOn ? '' : 'opacity-40'}`}>
                  <div className="relative flex-1">
                    <input
                      inputMode="decimal"
                      value={autoText}
                      disabled={!autoOn || locked || !!autoPlay}
                      onChange={(e) => setAutoText(e.target.value)}
                      onBlur={() => setAutoText(autoValue.toFixed(2))}
                      aria-label="Objectif d'encaissement"
                      className="w-full h-10 rounded-lg bg-black/50 border-2 border-white/10 focus:border-white/40 outline-none pl-3 pr-8 text-white font-bold og-font-num text-base"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">×</span>
                  </div>
                </div>
                <div className={`grid grid-cols-6 gap-1 mt-1.5 ${autoOn ? '' : 'opacity-40'}`}>
                  {TARGET_PRESETS.map((t) => (
                    <button
                      key={t}
                      disabled={!autoOn || locked || !!autoPlay}
                      onClick={() => {
                        audio.click();
                        setAutoText(t.toFixed(2));
                      }}
                      className={`h-8 rounded-md text-[11px] font-extrabold og-font-num transition-colors disabled:cursor-not-allowed ${autoValue === t ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                      {t}×
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 text-[11px] text-white/50">
                  {autoOn ? (
                    <>
                      {fmt(chance, 2)} % de chance d'atteindre {fmtMult(autoValue)} · gain {fmt(Math.min(Math.floor(bet * autoValue), cfg.maxPayout), 0)}
                    </>
                  ) : (
                    'Encaissez vous-même avant le crash (ESPACE).'
                  )}
                </div>
              </div>

              <div className="hidden lg:block">{mainButton}</div>

              {/* Autoplay */}
              <div className="rounded-xl bg-black/30 border border-white/10 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold tracking-wider text-white/60 og-font-num">AUTOPLAY</span>
                  {autoPlay ? (
                    <button onClick={() => setAutoPlay(null)} className="rounded-md bg-rose-500 px-2.5 py-1 text-[11px] font-extrabold text-white">
                      ARRÊTER {autoPlay.infinite ? '∞' : `(${autoPlay.left})`}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (!autoOn) return setMessage('Activez l’encaissement auto pour lancer l’autoplay.');
                        setAutoPlay({ left: autoCount === 0 ? 0 : autoCount - 1, infinite: autoCount === 0 });
                        if (!locked) void startRound();
                      }}
                      disabled={locked}
                      className="rounded-md bg-white/15 hover:bg-white/25 px-2.5 py-1 text-[11px] font-extrabold text-white disabled:opacity-40"
                    >
                      LANCER
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-1 mt-2">
                  {AUTO_COUNTS.map((n) => (
                    <button
                      key={n}
                      disabled={!!autoPlay}
                      onClick={() => setAutoCount(n)}
                      className={`h-7 rounded-md text-[11px] font-extrabold og-font-num ${autoCount === n ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'} disabled:opacity-50`}
                    >
                      {n === 0 ? '∞' : n}
                    </button>
                  ))}
                </div>
              </div>

              {message && <div className="og-fade-up rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs font-semibold text-white/85">{message}</div>}
            </Panel>

            <div className="grid grid-cols-3 gap-2">
              <StatBox label="RTP" value={`${fmt(cfg.rtp, 1)} %`} />
              <StatBox label="Max" value={`${fmt(cfg.maxMultiplier, 0)}×`} />
              <StatBox label="Gain max" value={fmt(cfg.maxPayout, 0)} />
            </div>
          </div>

          {/* Scène */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <HistoryStrip items={history} />
            <div key={stageShake} className={`relative flex-1 min-h-[360px] sm:min-h-[440px] rounded-2xl border-[3px] border-[#140c22] overflow-hidden bg-[linear-gradient(180deg,#1b0b2c_0%,#2a0f2a_55%,#3a1420_100%)] shadow-[0_20px_50px_rgba(0,0,0,0.6)] ${crashed && !outcome?.won ? 'og-shake' : ''}`}>
              <Skyline />
              <CrashChart
                mult={live}
                running={running}
                target={round?.auto ?? null}
                cashedAt={cashedAt}
                crashed={crashed}
              />

              {/* Multiplicateur */}
              <div className="pointer-events-none absolute inset-x-0 top-[12%] flex flex-col items-center">
                <div
                  className={`og-font-num font-bold leading-none tabular-nums text-[clamp(52px,9vw,112px)] transition-colors ${
                    crashed ? 'text-[#ff4d5e]' : cashedAt ? 'text-[#5effa8]' : 'text-white'
                  }`}
                  style={{ textShadow: '0 5px 0 #140c22, 0 0 30px rgba(0,0,0,0.6)' }}
                >
                  {phase === 'idle' ? '1,00×' : fmtMult(crashed && outcome ? outcome.crash : shownMult)}
                </div>
                <div className="mt-2 h-7">
                  {crashed ? (
                    <span className="og-pop inline-block rounded-full bg-[#ff4d5e] px-4 py-1 og-font-title text-lg tracking-wider text-white border-[3px] border-[#140c22]">CRASH !</span>
                  ) : running && !cashedAt && round ? (
                    <span className="og-font-num text-sm sm:text-base font-bold text-white/85">
                      Gain potentiel <span className="text-[#ffd84a]">{fmt(potential, 0)}</span>
                    </span>
                  ) : phase === 'idle' ? (
                    <span className="og-font-num text-sm font-bold text-white/60">Placez votre mise pour décoller</span>
                  ) : null}
                </div>
              </div>

              {/* Résultat */}
              {outcome && phase === 'ended' && (
                <div className="pointer-events-none absolute inset-x-0 top-[calc(12%+clamp(52px,9vw,112px)+48px)] flex justify-center">
                  <div
                    className={`og-pop rounded-xl border-[4px] border-[#140c22] px-6 py-2.5 text-center shadow-[0_6px_0_#140c22] ${
                      outcome.won ? 'bg-[linear-gradient(180deg,#b0ffd8,#2fd08a_55%,#0f7a4a)]' : 'bg-[linear-gradient(180deg,#ffb08a,#ff4a1a_55%,#8a1010)]'
                    }`}
                  >
                    <div className="og-font-title text-2xl sm:text-3xl text-white [-webkit-text-stroke:1.5px_#140c22]">
                      {outcome.won ? `ENCAISSÉ ${fmtMult(outcome.cashoutAt ?? 1)}` : 'PERDU'}
                    </div>
                    <div className="og-font-num font-bold text-lg text-[#140c22]">{outcome.won ? `+${fmt(outcome.win, 0)}` : `-${fmt(outcome.bet, 0)}`}</div>
                  </div>
                </div>
              )}

              {crashed && !outcome?.won && <div key={`f${stageShake}`} className="og-flash pointer-events-none absolute inset-0 bg-[#ff3a1a]" />}
            </div>
            <div className="lg:hidden">{mainButton}</div>
          </div>
        </div>

        {bigWin && (
          <BigWinOverlay
            amount={bigWin.amount}
            mult={bigWin.mult}
            onClick={() => setBigWin(null)}
            gradient="linear-gradient(180deg,#ffffff 0%,#ffe0a8 35%,#ff9a3c 65%,#c2410c 100%)"
            rays="rgba(255,154,60,0.14)"
          />
        )}

        {menuOpen && (
          <Modal title="MENU" onClose={() => setMenuOpen(false)}>
            <div className="space-y-2">
              <GameVolumeModalRow muted={muted} volume={volume} onMute={toggleMute} onVolumeChange={setVolume} accentClass={THEME.accentClass} />
              <MenuRow icon={<Info size={18} />} label="Règles et équité" onClick={() => { setMenuOpen(false); setInfoOpen(true); }} />
              <MenuRow icon={<RotateCw size={18} />} label={`Recharger le solde démo (${fmt(demoStart, 0)})`} disabled={locked || mode !== 'demo'} onClick={() => setDemoChips(demoStart)} />
            </div>
            <div className="mt-5">
              <div className="flex items-center gap-2 og-font-num font-bold text-white text-sm tracking-wider mb-2">
                <History size={15} /> DERNIÈRES MANCHES
              </div>
              {history.length === 0 ? (
                <p className="text-xs text-white/50">Aucune manche jouée pour l'instant.</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {history.map((h, i) => (
                    <div key={`${h.at}-${i}`} className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-xs">
                      <span className="text-white/60">
                        {new Date(h.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · crash {fmtMult(h.crash)}
                        {h.demo && <span className="ml-1 text-white/35">démo</span>}
                      </span>
                      <span className={`og-font-num font-bold text-sm ${h.win > 0 ? 'text-[#5effa8]' : 'text-[#ff5a4a]'}`}>
                        {h.win > 0 ? `${fmtMult(h.cashoutAt ?? 1)} +${fmt(h.win - h.bet, 0)}` : `-${fmt(h.bet, 0)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Modal>
        )}

        {infoOpen && (
          <Modal title="RÈGLES DU CRASH" onClose={() => setInfoOpen(false)} wide>
            <div className="grid sm:grid-cols-3 gap-3 text-xs text-white/85 leading-relaxed">
              <RuleCard icon={<Rocket size={17} />} title="1. Misez">
                Choisissez votre mise et, si vous voulez, un objectif d'encaissement automatique.
              </RuleCard>
              <RuleCard icon={<TrendingUp size={17} />} title="2. Décollage">
                Le multiplicateur monte de plus en plus vite. Il peut s'écraser à tout moment, même à 1,00×.
              </RuleCard>
              <RuleCard icon={<Zap size={17} />} title="3. Encaissez">
                Encaissez avant le crash pour gagner mise × multiplicateur. Trop tard : la mise est perdue.
              </RuleCard>
            </div>
            <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {[1.5, 2, 3, 5, 10, 100].map((x) => (
                <div key={x} className="rounded-md bg-black/30 px-2 py-1.5 text-center og-font-num">
                  <div className="text-sm font-bold text-[#ffd84a]">{fmtMult(x)}</div>
                  <div className="text-[10px] text-white/55">{fmt(chanceToReach(x, cfg.rtp), 2)} %</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-white/55 text-center">
              Chance d'atteindre chaque multiplicateur. Quel que soit l'objectif, le retour moyen est de {fmt(cfg.rtp, 1)} %.
            </p>

            <div className="mt-5 rounded-lg bg-black/30 p-3 text-xs text-white/80">
              <div className="flex items-center gap-2 og-font-num font-bold text-white text-sm tracking-wider mb-1.5">
                <ShieldCheck size={15} /> ÉQUITÉ PROUVABLE
              </div>
              <p className="text-white/60 mb-2">
                Le point de crash est tiré par le serveur avant le décollage et gardé secret ; son empreinte SHA-256 est connue dès le départ. À la fin, la graine
                est dévoilée : sha256(graine) redonne l'empreinte, et le point de crash se recalcule à partir de sha256(graine:crash).
              </p>
              {outcome?.seed ? (
                <div className="space-y-1.5 font-mono text-[10px]">
                  <HashRow label="Empreinte" value={outcome.hash} />
                  <HashRow label="Graine" value={outcome.seed} />
                  <button
                    onClick={verifyRound}
                    className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-[#2f7a52] px-3 py-1.5 font-sans text-xs font-bold text-white hover:bg-[#3a9064]"
                  >
                    <CheckCircle2 size={13} />
                    {verify === 'ok' ? `Vérifié : crash à ${fmtMult(outcome.crash)}` : verify === 'ko' ? 'Échec de la vérification' : 'Vérifier la dernière manche'}
                  </button>
                </div>
              ) : round && running ? (
                <div className="font-mono text-[10px]">
                  <HashRow label="Empreinte" value={round.hash} />
                  <div className="text-white/40 font-sans mt-1">Graine dévoilée à la fin de la manche.</div>
                </div>
              ) : (
                <div className="text-white/40">Jouez une manche pour obtenir une empreinte.</div>
              )}
            </div>
            <p className="text-white/50 text-[11px] text-center mt-4">
              Multiplicateur max {fmt(cfg.maxMultiplier, 0)}× · gain max {fmt(cfg.maxPayout, 0)} jetons par manche (encaissement automatique au plafond). ESPACE pour miser / encaisser.
            </p>
          </Modal>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Bouton principal
// =============================================================================

const MainButton: React.FC<{
  phase: Phase;
  canCash: boolean;
  cashed: boolean;
  potential: number;
  mult: number;
  autoPlay: boolean;
  disabled: boolean;
  onClick: () => void;
}> = ({ phase, canCash, cashed, potential, mult, autoPlay, disabled, onClick }) => {
  const running = phase === 'running';
  const base = 'w-full h-[64px] rounded-2xl border-[4px] border-[#140c22] og-font-num font-bold leading-none flex flex-col items-center justify-center transition-transform active:translate-y-[3px] disabled:cursor-not-allowed';
  if (running && canCash) {
    return (
      <button onClick={onClick} className={`${base} og-cash-btn bg-[linear-gradient(180deg,#b0ffd8,#2fd08a_55%,#0f7a4a)] text-[#062a18]`}>
        <span className="text-xl tracking-wider">ENCAISSER</span>
        <span className="text-sm mt-1">
          {fmt(potential, 0)} · {fmtMult(mult)}
        </span>
      </button>
    );
  }
  if (running) {
    return (
      <button disabled className={`${base} bg-[linear-gradient(180deg,#4a3e6a,#2a2044)] text-white/70 shadow-[0_5px_0_#140c22]`}>
        <span className="text-lg tracking-wider">{cashed ? 'ENCAISSÉ ✓' : 'EN VOL…'}</span>
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled || autoPlay}
      className={`${base} bg-[linear-gradient(180deg,#ffd2b8,#ff5a3c_55%,#b32a12)] text-[#1a0500] shadow-[0_5px_0_#140c22] hover:brightness-110 disabled:opacity-60`}
    >
      <span className="flex items-center gap-2 text-2xl tracking-wider">
        <Rocket size={22} strokeWidth={2.6} /> {phase === 'starting' ? '…' : autoPlay ? 'AUTOPLAY' : 'MISER'}
      </span>
    </button>
  );
};

// =============================================================================
// Historique
// =============================================================================

const HistoryStrip: React.FC<{ items: HistoryItem[] }> = ({ items }) => (
  <div className="flex items-center gap-2 min-h-[32px]">
    <span className="shrink-0 flex items-center gap-1 text-[11px] font-bold tracking-wider text-white/50 og-font-num">
      <Target size={13} /> VOS DERNIERS CRASHS
    </span>
    <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
      {items.length === 0 ? (
        <span className="text-[11px] text-white/35">Aucun pour l'instant</span>
      ) : (
        items.slice(0, 16).map((h, i) => (
          <span
            key={`${h.at}-${i}`}
            title={h.win > 0 ? `Encaissé à ${fmtMult(h.cashoutAt ?? 1)}` : 'Perdu'}
            className={`cr-chip-in shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold og-font-num border-2 border-[#140c22] ${crashTone(h.crash)} ${h.win > 0 ? 'ring-2 ring-white/70' : ''}`}
          >
            {fmtMult(h.crash)}
          </span>
        ))
      )}
    </div>
  </div>
);

// =============================================================================
// Graphique (canvas) + fusée
// =============================================================================

const niceStep = (range: number, lines = 5) => {
  const raw = range / lines;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
};

const CrashChart: React.FC<{ mult: number; running: boolean; target: number | null; cashedAt: number | null; crashed: boolean }> = ({
  mult,
  running,
  target,
  cashedAt,
  crashed,
}) => {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 440 });
  const [rocket, setRocket] = useState<{ x: number; y: number; a: number } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    const padL = 46;
    const padB = 30;
    const padT = 20;
    const padR = 24;
    const w = size.w - padL - padR;
    const h = size.h - padT - padB;
    const t = msFor(Math.max(1, mult));
    const xMax = Math.max(8000, t * 1.15);
    const yMax = Math.max(2, 1 + (mult - 1) * 1.3);
    const X = (ms: number) => padL + (ms / xMax) * w;
    const Y = (m: number) => padT + h - ((m - 1) / (yMax - 1)) * h;

    // Grille
    ctx.font = '600 11px Oswald, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const yStep = niceStep(yMax - 1);
    for (let v = 1; v <= yMax + 1e-9; v += yStep) {
      const y = Y(v);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(size.w - padR, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.textAlign = 'right';
      ctx.fillText(`${(Math.round(v * 100) / 100).toString().replace('.', ',')}×`, padL - 8, y);
    }
    const xStep = niceStep(xMax / 1000, 6) * 1000;
    ctx.textAlign = 'center';
    for (let s = 0; s <= xMax + 1; s += xStep) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(`${Math.round(s / 1000)} s`, X(s), size.h - padB / 2);
    }

    // Objectif
    if (target && target <= yMax) {
      const y = Y(target);
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(255,216,74,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(size.w - padR, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd84a';
      ctx.textAlign = 'left';
      ctx.fillText(`Objectif ${target.toFixed(2).replace('.', ',')}×`, padL + 6, y - 10);
    }

    if (!running && !crashed) {
      setRocket(null);
      return;
    }

    // Courbe
    const N = 90;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const ms = (t * i) / N;
      pts.push([X(ms), Y(Math.exp(0.00006 * ms))]);
    }
    const color = crashed ? '#ff4d5e' : cashedAt ? '#5effa8' : '#ffb03a';
    const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
    grad.addColorStop(0, crashed ? 'rgba(255,77,94,0.45)' : cashedAt ? 'rgba(94,255,168,0.4)' : 'rgba(255,176,58,0.45)');
    grad.addColorStop(1, 'rgba(255,90,60,0.02)');
    ctx.beginPath();
    ctx.moveTo(pts[0][0], padT + h);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(pts[N][0], padT + h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Point d'encaissement
    if (cashedAt && cashedAt <= mult + 1e-9) {
      const cx = X(msFor(cashedAt));
      const cy = Y(cashedAt);
      ctx.fillStyle = '#5effa8';
      ctx.strokeStyle = '#140c22';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = '700 12px Oswald, system-ui, sans-serif';
      ctx.fillText(`${cashedAt.toFixed(2).replace('.', ',')}×`, cx, cy - 16);
    }

    const [x1, y1] = pts[N];
    const [x0, y0] = pts[N - 2];
    setRocket({ x: x1, y: y1, a: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI });
  }, [mult, running, target, cashedAt, crashed, size]);

  return (
    <div ref={wrap} className="absolute inset-0">
      <canvas ref={canvas} className="absolute inset-0 w-full h-full" />
      {rocket && (
        <div className="pointer-events-none absolute" style={{ left: rocket.x, top: rocket.y, transform: `translate(-50%, -50%) rotate(${crashed ? 0 : rocket.a + 45}deg)` }}>
          {crashed ? <Explosion /> : <RocketArt />}
        </div>
      )}
    </div>
  );
};

const RocketArt: React.FC = () => (
  <svg width="66" height="66" viewBox="0 0 64 64" className="drop-shadow-[0_0_12px_rgba(255,176,58,0.7)]">
    <g className="cr-flame" style={{ transformOrigin: '18px 46px' }}>
      <path d="M22 42 L8 56 L14 44 Z" fill="#ffd84a" />
      <path d="M22 42 L6 50 L16 40 Z" fill="#ff5a3c" />
    </g>
    <path d="M24 40 L40 24 C46 18 54 12 58 6 C52 10 46 18 40 24 Z" fill="#140c22" />
    <path d="M20 44 C18 34 28 22 44 14 C52 10 58 6 58 6 C58 6 54 12 50 20 C42 36 30 46 20 44 Z" fill="#f5f0ff" stroke="#140c22" strokeWidth="3" strokeLinejoin="round" />
    <circle cx="42" cy="22" r="5" fill="#5ee8ff" stroke="#140c22" strokeWidth="3" />
    <path d="M22 32 L12 34 L18 26 Z" fill="#ff5a3c" stroke="#140c22" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M32 42 L30 52 L38 46 Z" fill="#ff5a3c" stroke="#140c22" strokeWidth="2.5" strokeLinejoin="round" />
  </svg>
);

const Explosion: React.FC = () => (
  <svg width="120" height="120" viewBox="0 0 120 120" className="og-pop">
    <path d="M60 4 L70 38 L104 20 L84 50 L116 60 L84 70 L104 100 L70 82 L60 116 L50 82 L16 100 L36 70 L4 60 L36 50 L16 20 L50 38 Z" fill="#ffd84a" stroke="#140c22" strokeWidth="4" strokeLinejoin="round" />
    <path d="M60 24 L66 46 L88 36 L76 56 L96 60 L76 64 L88 84 L66 74 L60 96 L54 74 L32 84 L44 64 L24 60 L44 56 L32 36 L54 46 Z" fill="#ff5a3c" />
    <circle cx="60" cy="60" r="12" fill="#fff4b0" />
  </svg>
);

const Skyline: React.FC = () => (
  <svg className="pointer-events-none absolute inset-x-0 bottom-0 w-full h-[30%] opacity-40" viewBox="0 0 1200 200" preserveAspectRatio="none">
    <path
      d="M0 200 V140 H40 V110 H70 V150 H110 V90 H130 V60 H150 V90 H170 V130 H210 V100 H250 V150 H290 V70 H320 V40 H340 V70 H360 V120 H400 V95 H440 V140 H480 V110 H520 V60 H540 V30 H555 V60 H575 V130 H620 V100 H660 V150 H700 V80 H740 V120 H780 V90 H800 V50 H820 V90 H840 V140 H880 V105 H920 V150 H960 V85 H1000 V125 H1040 V95 H1080 V140 H1120 V110 H1160 V150 H1200 V200 Z"
      fill="#0b0414"
    />
  </svg>
);
