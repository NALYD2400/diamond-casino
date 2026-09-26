import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Gift, History, Info, Menu, RotateCw, ShieldCheck, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { useCasinoUser } from '../context/CasinoUserContext';
import { useCasinoAdmin, type WheelSegmentConfig } from '../context/CasinoAdminContext';
import { MachineClosedBanner, useMachineClosed } from './MachineClosedBanner';
import { apiRecentWheelWins, CasinoApiError, type WheelWin } from '../lib/supabase';
import { Wheel } from './wheel/Wheel';
import { WheelAudio } from './wheel/wheelAudio';
import { SampleBank } from './slots/sampleBank';
import { GameVolumeButton, GameVolumeModalRow } from './VolumeControl';
import { useSlotTimeline } from './slots/useSlotTimeline';

const DEMO_KEY = 'diamond_wheel_demo_chips';
const DEMO_START = 250000;
const SPIN_MS = 11000;
const SPIN_TURNS = 9;
/** Retour en arrière final : la roue dépasse un peu puis retombe sur le lot */
const SETTLE_MS = 1100;
const SUSPENSE_FROM = 0.55;
// Longue traîne : la roue rampe de picot en picot sur la fin
const easeOutWheel = (t: number) => 1 - Math.pow(1 - t, 4.6);
const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

/**
 * Point d'arrêt dans le quartier gagnant (0 = bord que le pointeur quitte, 1 = bord par lequel il entre)
 * et dépassement avant le retour. Pour créer le doute, la roue s'arrête souvent tout près d'un bord :
 * soit elle entre de justesse, soit elle passe dans le quartier voisin puis retombe en arrière.
 */
function pickLanding(): { pos: number; overshoot: number } {
  const r = Math.random();
  if (r < 0.35) return { pos: 0.1 + Math.random() * 0.1, overshoot: 0.25 + Math.random() * 0.12 };
  if (r < 0.65) return { pos: 0.82 + Math.random() * 0.1, overshoot: 0.04 + Math.random() * 0.04 };
  return { pos: 0.3 + Math.random() * 0.4, overshoot: 0.08 + Math.random() * 0.08 };
}

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

const PRIZE_IMAGES: Record<WheelSegmentConfig['type'], string> = {
  vehicle: '/podium_supercar.jpg',
  chips: '/diamond_chips_jackpot.jpg',
  mystery: '/mystery_vault.jpg',
  clothing: '/diamond_vip_couture.jpg',
};
const TYPE_EMOJI: Record<WheelSegmentConfig['type'], string> = { vehicle: '🏎️', chips: '🪙', mystery: '🎁', clothing: '👔' };

type Phase = 'idle' | 'requesting' | 'spinning';
type Mood = 'idle' | 'spin' | 'win';
type SampleName = 'coin1' | 'coin2' | 'coin3' | 'winSmall' | 'winMedium' | 'winBig' | 'shower';

interface SpinResult {
  index: number;
  segment: WheelSegmentConfig;
  price: number;
  chipsWon: number;
  mode: 'real' | 'demo';
}
interface HistoryEntry extends SpinResult {
  id: string;
  at: Date;
}

const chipsOf = (s: WheelSegmentConfig) => (s.type === 'chips' && typeof s.value === 'number' ? s.value : 0);

function timeAgo(iso: string): string {
  const min = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} j`;
}

/** Tirage pondéré local, uniquement pour le mode démo (le vrai tirage est fait par le serveur) */
function demoPick(segments: WheelSegmentConfig[]): number {
  const total = segments.reduce((a, s) => a + Math.max(0, s.dropRate || 0), 0);
  if (total <= 0) return Math.floor(Math.random() * segments.length);
  let r = Math.random() * total;
  for (let i = 0; i < segments.length; i++) {
    const w = Math.max(0, segments[i].dropRate || 0);
    if (w > 0 && r < w) return i;
    r -= w;
  }
  return segments.length - 1;
}

export const WheelOfFortune: React.FC = () => {
  const { user, isAuthenticated, spinWheel } = useCasinoUser();
  const { segments, podiumVehicle, economy, gamesConfig } = useCasinoAdmin();
  const price = gamesConfig.wheel.spinPrice;
  const closedState = useMachineClosed('wheel');
  const closed = closedState !== null;

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

  /** Solde affiché pendant la rotation (prix débité, gain pas encore révélé) */
  const [pendingBalance, setPendingBalance] = useState<number | null>(null);
  const balance = mode === 'real' ? (pendingBalance ?? user?.chips ?? 0) : demoChips;

  // ---------------------------------------------------------------------------
  // État de jeu
  // ---------------------------------------------------------------------------
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<SpinResult | null>(null);
  const [plaque, setPlaque] = useState(false);
  const [bigWin, setBigWin] = useState<{ amount: number; shown: number; ratio: number } | null>(null);
  const [prizeWon, setPrizeWon] = useState<SpinResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [recentWins, setRecentWins] = useState<WheelWin[]>([]);
  const [message, setMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

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

  const audio = useRef(new WheelAudio());
  const samples = useRef(
    new SampleBank<SampleName>('/sounds/wheel/', {
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

  const handleVolumeChange = useCallback((newVol: number) => {
    const clamped = Math.max(0, Math.min(1, Math.round(newVol * 100) / 100));
    setVolume(clamped);
    if (clamped > 0 && muted) {
      setMuted(false);
      try { localStorage.setItem('diamond_sound_muted', 'false'); } catch {}
    }
    try { localStorage.setItem('diamond_sound_volume', String(clamped)); } catch {}
  }, [muted]);

  const rotorRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const skipSpinRef = useRef<(() => void) | null>(null);
  const commitRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);
  const { wait, skipAll, countUp } = useSlotTimeline();

  const n = Math.max(segments.length, 1);
  const deg = 360 / n;

  const loadRecentWins = useCallback(() => {
    apiRecentWheelWins(8)
      .then(setRecentWins)
      .catch(() => setRecentWins([]));
  }, []);
  useEffect(() => loadRecentWins(), [loadRecentWins]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      commitRef.current?.();
      audio.current.close();
      samples.current.close();
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Animation de la roue
  // ---------------------------------------------------------------------------
  const animateTo = (index: number) =>
    new Promise<void>((resolve) => {
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const duration = reduceMotion ? 1200 : SPIN_MS;
      const settleMs = reduceMotion ? 0 : SETTLE_MS;
      const { pos, overshoot } = reduceMotion ? { pos: 0.5, overshoot: 0 } : pickLanding();
      const targetMod = (((360 - (index + pos) * deg) % 360) + 360) % 360;
      const from = rotationRef.current;
      const to = from - (from % 360) + (reduceMotion ? 2 : SPIN_TURNS) * 360 + targetMod;
      const peak = to + overshoot * deg;
      let start = performance.now();
      let lastPin = Math.floor(from / deg);
      let suspense = false;
      let flick = 0;

      // « Arrêt rapide » : on saute presque à la fin de la décélération
      skipSpinRef.current = () => {
        start = Math.min(start, performance.now() - duration * 0.93);
      };

      const frame = (now: number) => {
        const elapsed = now - start;
        const t = Math.min(1, elapsed / duration);
        const u = settleMs > 0 ? Math.min(1, Math.max(0, (elapsed - duration) / settleMs)) : 1;
        const angle = t < 1 ? from + (peak - from) * easeOutWheel(t) : peak + (to - peak) * easeInOut(u);
        if (rotorRef.current) rotorRef.current.style.transform = `rotate(${angle}deg)`;

        const pin = Math.floor(angle / deg);
        if (pin !== lastPin) {
          lastPin = pin;
          audio.current.tick(Math.pow(1 - t, 2));
          flick = (t < 1 ? -1 : 1) * (9 + 18 * Math.pow(1 - t, 1.2));
        }
        flick *= 0.85;
        if (pointerRef.current) {
          pointerRef.current.style.transform = Math.abs(flick) > 0.05 ? `rotate(${flick.toFixed(2)}deg)` : '';
        }
        if (!suspense && !reduceMotion && t >= SUSPENSE_FROM && t < 0.9) {
          suspense = true;
          audio.current.startSuspense(((1 - t) * duration + settleMs) / 1000);
        }
        if (t < 1 || u < 1) {
          rafRef.current = requestAnimationFrame(frame);
          return;
        }
        rafRef.current = null;
        skipSpinRef.current = null;
        rotationRef.current = to;
        audio.current.stopSuspense();
        audio.current.stop();
        resolve();
      };
      rafRef.current = requestAnimationFrame(frame);
    });

  // ---------------------------------------------------------------------------
  // Tour de roue
  // ---------------------------------------------------------------------------
  const unlockAudio = () => {
    audio.current.unlock();
    samples.current.unlock();
  };

  const spin = useCallback(async () => {
    if (busyRef.current || phase !== 'idle') return;
    unlockAudio();
    if (closed) {
      setMessage('ROUE FERMÉE PAR LA DIRECTION');
      return;
    }
    if (mode === 'real') {
      if (!isAuthenticated || !user) {
        setMode('demo');
        setMessage('CONNECTEZ-VOUS POUR JOUER VOS JETONS');
        return;
      }
      if (user.chips < price) {
        setMessage('SOLDE INSUFFISANT');
        return;
      }
    } else if (demoChips < price) {
      setMessage('SOLDE DÉMO INSUFFISANT');
      return;
    }

    busyRef.current = true;
    setMessage('');
    setResult(null);
    setPlaque(false);
    setPhase('requesting');

    let index: number;
    let segment: WheelSegmentConfig;
    if (mode === 'real') {
      const before = user!.chips;
      try {
        const outcome = await spinWheel();
        commitRef.current = outcome.commit;
        index = Math.min(Math.max(outcome.segmentIndex, 0), n - 1);
        segment = { ...(segments[index] || segments[0]), ...(outcome.segment as Partial<WheelSegmentConfig>) };
        setPendingBalance(before - price);
      } catch (err) {
        setMessage(err instanceof CasinoApiError ? err.message.toUpperCase() : 'ERREUR SERVEUR');
        setPhase('idle');
        busyRef.current = false;
        return;
      }
    } else {
      index = demoPick(segments);
      segment = segments[index];
      setDemoChips((c) => c - price);
    }

    setPhase('spinning');
    audio.current.whoosh();
    await animateTo(index);

    // Règlement affiché : le serveur a déjà tout crédité en mode jetons
    const r: SpinResult = { index, segment, price, chipsWon: chipsOf(segment), mode };
    if (mode === 'real') {
      commitRef.current?.();
      commitRef.current = null;
      setPendingBalance(null);
      loadRecentWins();
    } else if (r.chipsWon > 0) {
      setDemoChips((c) => c + r.chipsWon);
    }
    setResult(r);
    setHistory((h) => [{ ...r, id: `${Date.now()}`, at: new Date() }, ...h].slice(0, 20));
    setPhase('idle');

    const ratio = r.chipsWon / price;
    if (segment.type !== 'chips') {
      audio.current.win(true);
      setPrizeWon(r);
    } else if (ratio >= 2) {
      if (!samples.current.play('winBig', 0.8)) audio.current.win(true);
      samples.current.play('shower', 0.6);
      setBigWin({ amount: r.chipsWon, shown: 0, ratio });
      let tick = 0;
      await countUp(0, r.chipsWon, ratio >= 3 ? 4200 : 3000, (v) => {
        setBigWin((b) => (b ? { ...b, shown: v } : b));
        if (++tick % 4 === 0) samples.current.play((['coin1', 'coin2', 'coin3'] as const)[tick % 3], 0.35);
      });
      await wait(1800);
      setBigWin(null);
    } else {
      if (!samples.current.play(ratio >= 1 ? 'winMedium' : 'winSmall', 0.8)) audio.current.win(false);
      else samples.current.play('coin2', 0.5);
      setPlaque(true);
    }
    busyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, closed, mode, isAuthenticated, user, price, demoChips, spinWheel, segments, n, loadRecentWins, countUp, wait]);

  const mainAction = useCallback(() => {
    if (bigWin) return skipAll();
    if (prizeWon) return setPrizeWon(null);
    if (phase === 'spinning') return skipSpinRef.current?.();
    void spin();
  }, [bigWin, skipAll, prizeWon, phase, spin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.repeat || menuOpen || infoOpen) return;
      if (e.code === 'Space') {
        e.preventDefault();
        mainAction();
      } else if (e.code === 'Escape' && prizeWon) {
        setPrizeWon(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mainAction, prizeWon, menuOpen, infoOpen]);

  useEffect(() => {
    if (!plaque) return;
    const t = setTimeout(() => setPlaque(false), 2600);
    return () => clearTimeout(t);
  }, [plaque]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (next) audio.current.stopSuspense();
    try {
      localStorage.setItem('diamond_sound_muted', String(next));
    } catch {}
  };

  // ---------------------------------------------------------------------------
  // Affichage
  // ---------------------------------------------------------------------------
  const board = useMemo(() => {
    const total = segments.reduce((a, s) => a + Math.max(0, s.dropRate || 0), 0) || 1;
    return segments
      .map((seg, i) => ({ seg, i, chance: (Math.max(0, seg.dropRate || 0) / total) * 100 }))
      .sort((a, b) => a.chance - b.chance);
  }, [segments]);
  const topChips = Math.max(0, ...segments.map(chipsOf));

  const spinning = phase !== 'idle';
  const mood: Mood = spinning ? 'spin' : result && (result.segment.type !== 'chips' || result.chipsWon >= result.price) ? 'win' : 'idle';
  const winShown = spinning ? 0 : (result?.chipsWon ?? 0);
  const status = (() => {
    if (message) return message;
    if (phase === 'requesting') return 'TIRAGE EN COURS…';
    if (phase === 'spinning') return 'LA ROUE TOURNE… (ESPACE POUR ARRÊTER)';
    if (result) return result.segment.type === 'chips' ? `${fmt(result.chipsWon)} JETONS !` : `${result.segment.label} !`;
    if (closed) return 'ROUE FERMÉE';
    return `${fmt(price)} JETONS LE TOUR · SANS LIMITE`;
  })();

  return (
    <div className="relative bg-[#07050f] pt-[80px] sm:pt-[90px]">
      <MachineClosedBanner state={closedState} demo={false} />
      <div className="relative w-full overflow-hidden select-none" style={{ height: 'max(720px, calc(100svh - 90px))' }}>
        <WheelBackdrop mood={mood} />

        {/* Haut */}
        <div className="absolute top-8 sm:top-10 left-3 right-3 z-30 flex items-center justify-between gap-2">
          <Link
            to="/jeux"
            className="flex items-center gap-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur px-3 py-1.5 text-xs font-semibold text-white transition-colors"
          >
            <ArrowLeft size={14} /> Lobby
          </Link>
          <div className="flex items-center rounded-full bg-black/50 backdrop-blur p-1 text-[11px] font-bold">
            <button
              onClick={() => !spinning && isAuthenticated && setMode('real')}
              disabled={spinning || !isAuthenticated}
              title={isAuthenticated ? 'Jouer avec vos jetons' : 'Connectez-vous pour jouer avec vos jetons'}
              className={`px-3 py-1 rounded-full transition-colors ${
                mode === 'real' ? 'bg-white text-black font-bold' : 'text-white/70 hover:text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              JETONS
            </button>
            <button
              onClick={() => !spinning && setMode('demo')}
              disabled={spinning}
              className={`px-3 py-1 rounded-full transition-colors ${mode === 'demo' ? 'bg-white text-black font-bold' : 'text-white/70 hover:text-white'}`}
            >
              DÉMO
            </button>
          </div>
        </div>

        {/* Plateau */}
        <div className="absolute inset-x-0 top-[52px] sm:top-[48px] bottom-[140px] sm:bottom-[104px] flex items-center justify-center gap-5 px-2 sm:px-6">
          <PrizeBoard className="hidden lg:flex" board={board} highlight={spinning ? null : (result?.index ?? null)} />

          <div className="relative flex-1 h-full min-w-0 max-w-[680px] flex items-center justify-center" style={{ containerType: 'size' }}>
            <div className="relative flex flex-col items-center" style={{ width: 'min(100cqw, calc(100cqh * 0.92))' }}>
              <WheelLogo className="relative z-20 w-full mb-[2.5%]" />
              <div className={`relative w-full ${mood === 'win' ? 'wf-glow' : ''}`}>
                <Wheel
                  ref={rotorRef}
                  pointerRef={pointerRef}
                  segments={segments}
                  mode={spinning ? 'spinning' : result ? 'won' : 'idle'}
                  highlightIndex={!spinning && result ? result.index : null}
                  className="w-full drop-shadow-[0_24px_40px_rgba(0,0,0,0.75)]"
                />
                {plaque && result && <ResultPlaque result={result} />}
              </div>
            </div>
          </div>

          <div className="hidden lg:flex w-[190px] shrink-0 flex-col gap-2">
            <InfoCard title="PRIX DU TOUR" value={fmt(price)} sub="Jetons, sans limite de tirages" />
            <JackpotCard name={podiumVehicle.name} image={podiumVehicle.imageUrl} />
            <InfoCard title="MEILLEUR LOT JETONS" value={fmt(topChips)} sub={`Soit x${(topChips / Math.max(1, price)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} la mise`} />
            <RecentWinsCard wins={recentWins} />
          </div>
        </div>

        <ControlBar
          credit={balance}
          price={price}
          win={winShown}
          demo={mode === 'demo'}
          status={status}
          phase={phase}
          disabled={closed || (!spinning && balance < price)}
          muted={muted}
          volume={volume}
          onMain={mainAction}
          onMenu={() => setMenuOpen(true)}
          onInfo={() => setInfoOpen(true)}
          onMute={toggleMute}
          onVolumeChange={handleVolumeChange}
        />

        {bigWin && <BigWinOverlay amount={bigWin.shown} ratio={bigWin.ratio} onClick={skipAll} />}
        {prizeWon && <PrizeOverlay result={prizeWon} podiumImage={podiumVehicle.imageUrl} onClose={() => setPrizeWon(null)} />}

        {menuOpen && (
          <Modal title="MENU" onClose={() => setMenuOpen(false)}>
            <div className="space-y-2">
              <GameVolumeModalRow
                muted={muted}
                volume={volume}
                onMute={toggleMute}
                onVolumeChange={handleVolumeChange}
                accentClass="accent-[#ffd84a]"
              />
              <MenuRow
                icon={<Info size={18} />}
                label="Règles et lots"
                onClick={() => {
                  setMenuOpen(false);
                  setInfoOpen(true);
                }}
              />
              <MenuRow
                icon={<RotateCw size={18} />}
                label={`Recharger le solde démo (${fmt(DEMO_START)})`}
                disabled={spinning || mode !== 'demo'}
                onClick={() => setDemoChips(DEMO_START)}
              />
              {isAuthenticated && (
                <Link
                  to="/espace-membre"
                  className="w-full flex items-center gap-3 rounded-lg bg-black/30 hover:bg-black/50 px-4 py-3 text-sm font-semibold text-white"
                >
                  <Gift size={18} /> Mon inventaire de lots
                </Link>
              )}
            </div>
            <div className="mt-5">
              <div className="flex items-center gap-2 font-['Oswald'] font-bold text-white text-sm tracking-wider mb-2">
                <History size={15} /> DERNIERS TOURS
              </div>
              {history.length === 0 ? (
                <p className="text-xs text-white/50">Aucun tour joué pour l'instant.</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-2 text-xs">
                      <span className="text-white/60 truncate">
                        {h.at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {TYPE_EMOJI[h.segment.type]} {h.segment.label}
                        {h.mode === 'demo' && <span className="ml-1 text-white/35">démo</span>}
                      </span>
                      <span
                        className={`shrink-0 font-['Oswald'] font-bold text-sm ${
                          h.segment.type !== 'chips' ? 'text-[#ffd84a]' : h.chipsWon >= h.price ? 'text-[#5ee8ff]' : 'text-[#ff5a4a]'
                        }`}
                      >
                        {h.segment.type !== 'chips' ? 'LOT' : `${h.chipsWon - h.price >= 0 ? '+' : ''}${fmt(h.chipsWon - h.price)}`}
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
              <RuleCard emoji="🪙" title="1. Payez le tour">
                Chaque tour coûte {fmt(price)} jetons, débités par le serveur. Aucune limite : tournez autant que vous voulez.
              </RuleCard>
              <RuleCard emoji="🎡" title="2. La roue décide">
                Le lot est tiré par le serveur avant l'animation, selon les chances affichées ci-dessous.
              </RuleCard>
              <RuleCard emoji="🏎️" title="3. Gagnez">
                Les jetons sont crédités tout de suite. Véhicules et objets rejoignent votre inventaire (Espace Membre).
              </RuleCard>
            </div>

            <div className="mt-5 grid sm:grid-cols-[1fr_1.3fr] gap-4">
              <div className="relative rounded-lg overflow-hidden border-[3px] border-[#140c22] min-h-[160px] bg-black">
                <img src={podiumVehicle.imageUrl} alt={podiumVehicle.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-3">
                  <div className="font-['Luckiest_Guy'] text-[#ffd84a] text-sm tracking-wide">JACKPOT</div>
                  <div className="font-['Oswald'] font-bold text-white text-lg leading-tight">{podiumVehicle.name}</div>
                  <div className="text-[11px] text-white/60">Valeur {fmt(podiumVehicle.value)} $</div>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto pr-1 space-y-1">
                {board.map(({ seg, i, chance }) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-md bg-black/30 px-3 py-1.5 text-xs">
                    <span className="truncate text-white/85">
                      {TYPE_EMOJI[seg.type]} {seg.label}
                    </span>
                    <span className="shrink-0 font-['Oswald'] font-bold text-[#5ee8ff]">
                      {chance.toLocaleString('fr-FR', { maximumFractionDigits: chance < 1 ? 2 : 1 })} %
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-lg bg-black/30 p-3 text-xs text-white/60 flex items-start gap-2">
              <ShieldCheck size={15} className="shrink-0 text-white mt-0.5" />
              <p>
                Le tirage est calculé par le serveur du casino : le navigateur ne fait qu'animer le résultat. En mode démo, les tours sont gratuits et
                les lots ne sont pas réels.
              </p>
            </div>
            <p className="text-white/50 text-[11px] text-center mt-4">ESPACE pour tourner · ESPACE pendant la rotation pour l'arrêt rapide.</p>
          </Modal>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Décor
// =============================================================================

const WheelBackdrop: React.FC<{ mood: Mood }> = ({ mood }) => {
  const motes = useMemo(
    () =>
      Array.from({ length: 28 }, () => ({
        left: Math.random() * 100,
        size: 2 + Math.random() * 4,
        dur: 7 + Math.random() * 9,
        delay: -Math.random() * 12,
        hue: Math.random() < 0.5 ? '#ffe98a' : Math.random() < 0.5 ? '#ff9ae0' : '#9ef3ff',
      })),
    [],
  );
  const sky =
    mood === 'win'
      ? 'radial-gradient(ellipse at 50% 45%, #7a5a14 0%, #3a1a5a 50%, #07030f 100%)'
      : mood === 'spin'
        ? 'radial-gradient(ellipse at 50% 45%, #5a2a8a 0%, #24104a 50%, #07030f 100%)'
        : 'radial-gradient(ellipse at 50% 45%, #3a2a6a 0%, #1a1238 50%, #07050f 100%)';
  const bulbs = Array.from({ length: 30 });
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 transition-[background] duration-700" style={{ background: sky }} />
      {/* rayons tournants derrière la roue */}
      <div
        className={`dh-rays absolute left-1/2 top-[45%] w-[180vmax] h-[180vmax] -ml-[90vmax] -mt-[90vmax] transition-opacity duration-700 ${
          mood === 'idle' ? 'opacity-40' : 'opacity-90'
        }`}
        style={{ background: 'repeating-conic-gradient(rgba(255,233,138,0.07) 0deg 8deg, transparent 8deg 20deg)' }}
      />
      {/* rideaux de scène */}
      {(['left', 'right'] as const).map((side) => (
        <svg
          key={side}
          viewBox="0 0 200 600"
          preserveAspectRatio="none"
          className={`absolute top-0 h-full w-[20%] min-w-[80px] ${side === 'left' ? 'left-0' : 'right-0 -scale-x-100'}`}
        >
          <defs>
            <linearGradient id={`wf-curtain-${side}`} x1="0" x2="1">
              <stop offset="0" stopColor="#3a0d4a" />
              <stop offset="0.5" stopColor="#6a1a7a" />
              <stop offset="1" stopColor="#2a0838" />
            </linearGradient>
          </defs>
          <path d="M0 0 H160 Q110 150 140 300 Q170 450 100 600 H0 Z" fill={`url(#wf-curtain-${side})`} />
          <path d="M40 0 Q20 300 50 600 M90 0 Q70 300 80 600 M130 0 Q100 200 120 400" stroke="#140c22" strokeWidth="6" fill="none" opacity="0.45" />
          <path d="M0 0 H160 Q110 150 140 300 Q170 450 100 600" stroke="#140c22" strokeWidth="8" fill="none" />
        </svg>
      ))}
      {/* bandeau d'ampoules façon enseigne */}
      <div className="absolute inset-x-0 top-0 h-[20px] sm:h-[26px] flex items-center justify-around px-2 bg-[linear-gradient(180deg,#5a2a8a,#2a1048)] border-b-4 border-[#140c22] shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
        {bulbs.map((_, i) => (
          <span
            key={i}
            className="wf-marquee w-[9px] h-[9px] sm:w-[11px] sm:h-[11px] rounded-full border-2 border-[#140c22]"
            style={{ background: i % 2 ? '#fff4b0' : '#ffffff', animationDelay: `${(i % 2) * 0.45}s` }}
          />
        ))}
      </div>
      {/* sol */}
      <svg viewBox="0 0 1200 200" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 w-full h-[16%]">
        <path d="M0 90 Q300 60 600 80 T1200 85 V200 H0 Z" fill="#120b22" />
        <path d="M0 140 Q300 115 600 135 T1200 130 V200 H0 Z" fill="#07040e" />
      </svg>
      {motes.map((m, i) => (
        <span
          key={i}
          className="mn-mote absolute bottom-0 rounded-full"
          style={{
            left: `${m.left}%`,
            width: m.size,
            height: m.size,
            background: m.hue,
            boxShadow: `0 0 8px ${m.hue}`,
            animationDuration: `${m.dur}s`,
            animationDelay: `${m.delay}s`,
          }}
        />
      ))}
    </div>
  );
};

const WheelLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`text-center leading-none ${className}`}>
    <div
      className="font-['Luckiest_Guy'] whitespace-nowrap text-[clamp(22px,7.2cqw,58px)]"
      style={{
        background: 'linear-gradient(180deg, #ffffff 0%, #fff4b0 40%, #ffd84a 70%, #d48a0c 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        WebkitTextStroke: '2.5px #140c22',
        filter: 'drop-shadow(0 5px 0 #140c22)',
      }}
    >
      ROUE DE LA FORTUNE
    </div>
  </div>
);

// =============================================================================
// Panneaux
// =============================================================================

const PrizeBoard: React.FC<{
  className?: string;
  board: { seg: WheelSegmentConfig; i: number; chance: number }[];
  highlight: number | null;
}> = ({ className = '', board, highlight }) => (
  <div className={`${className} w-[190px] shrink-0 max-h-full flex-col gap-2 rounded-xl bg-black/50 backdrop-blur border border-white/10 p-3`}>
    <div className="flex items-center gap-2 font-['Oswald'] font-bold text-white text-sm tracking-wider">
      <Trophy size={15} /> LOTS EN JEU
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-1">
      {board.map(({ seg, i, chance }) => (
        <div
          key={i}
          className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11px] transition-colors ${
            highlight === i ? 'bg-[#ffd84a] text-[#140c22]' : 'bg-black/35 text-white/85'
          }`}
        >
          <span className="truncate font-semibold">
            {TYPE_EMOJI[seg.type]} {seg.type === 'chips' && typeof seg.value === 'number' ? fmt(seg.value) : seg.label}
          </span>
          <span className={`shrink-0 font-['Oswald'] font-bold ${highlight === i ? '' : 'text-[#5ee8ff]'}`}>
            {chance.toLocaleString('fr-FR', { maximumFractionDigits: chance < 1 ? 2 : 1 })}%
          </span>
        </div>
      ))}
    </div>
  </div>
);

const InfoCard: React.FC<{ title: string; value: string; sub?: string }> = ({ title, value, sub }) => (
  <div className="rounded-lg bg-black/50 backdrop-blur p-3 text-center border border-white/10">
    <div className="font-['Oswald'] font-bold text-neutral-300 text-xs tracking-wider">{title}</div>
    <div className="font-['Oswald'] font-bold text-xl text-white">{value}</div>
    {sub && <div className="text-[10px] text-white/60 leading-tight mt-0.5 truncate">{sub}</div>}
  </div>
);

const JackpotCard: React.FC<{ name: string; image: string }> = ({ name, image }) => (
  <div className="relative rounded-lg overflow-hidden border border-white/10 h-[92px] bg-black/50">
    <img
      src={image}
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      onError={(e) => {
        e.currentTarget.src = PRIZE_IMAGES.vehicle;
      }}
    />
    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />
    <div className="absolute top-1.5 inset-x-0 text-center font-['Luckiest_Guy'] text-[#ffd84a] text-sm tracking-wide [-webkit-text-stroke:1px_#140c22]">
      JACKPOT
    </div>
    <div className="absolute bottom-1.5 inset-x-2 text-center font-['Oswald'] font-bold text-white text-sm leading-tight truncate capitalize">{name}</div>
  </div>
);

const RecentWinsCard: React.FC<{ wins: WheelWin[] }> = ({ wins }) => (
  <div className="rounded-lg bg-black/50 backdrop-blur p-3 border border-white/10 min-h-0">
    <div className="font-['Oswald'] font-bold text-neutral-300 text-xs tracking-wider text-center mb-1.5">EN VILLE</div>
    {wins.length === 0 ? (
      <div className="text-[10px] text-white/50 text-center">Aucun gagnant récent</div>
    ) : (
      <div className="space-y-1">
        {wins.slice(0, 4).map((w, i) => (
          <div key={`${w.won_at}-${i}`} className="text-[10px] leading-tight">
            <div className="flex justify-between gap-1 text-white/85">
              <span className="truncate font-semibold">{w.winner}</span>
              <span className="shrink-0 text-white/40">{timeAgo(w.won_at)}</span>
            </div>
            <div className="truncate text-[#ffd84a]">{w.prize}</div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const ResultPlaque: React.FC<{ result: SpinResult }> = ({ result }) => {
  const good = result.chipsWon >= result.price;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div
        className={`wd-pop rounded-xl border-[4px] border-[#140c22] px-6 py-3 text-center shadow-[0_6px_0_#140c22,0_18px_40px_rgba(0,0,0,0.6)] ${
          good ? 'bg-[linear-gradient(180deg,#b8f6ff,#3fd2f2_55%,#1386b8)]' : 'bg-[linear-gradient(180deg,#d9ccff,#8f6bff_55%,#3a1d8f)]'
        }`}
      >
        <div className="font-['Luckiest_Guy'] text-[clamp(26px,7cqw,48px)] leading-none text-white [-webkit-text-stroke:2px_#140c22] drop-shadow-[0_3px_0_#140c22]">
          +{fmt(result.chipsWon)}
        </div>
        <div className={`font-['Oswald'] font-bold text-[clamp(13px,3cqw,20px)] mt-1 ${good ? 'text-[#07203a]' : 'text-white'}`}>JETONS</div>
      </div>
    </div>
  );
};

// =============================================================================
// Barre de contrôle (même disposition que Mines et les machines à sous)
// =============================================================================

interface ControlBarProps {
  credit: number;
  price: number;
  win: number;
  demo: boolean;
  status: string;
  phase: Phase;
  disabled: boolean;
  muted: boolean;
  volume: number;
  onMain: () => void;
  onMenu: () => void;
  onInfo: () => void;
  onMute: () => void;
  onVolumeChange: (vol: number) => void;
}

const ControlBar: React.FC<ControlBarProps> = (p) => {
  const spinning = p.phase === 'spinning';
  return (
    <div className="absolute inset-x-0 bottom-0 z-30">
      <div className="bg-gradient-to-t from-black/90 via-black/70 to-black/0 pt-6 pb-3 px-3 sm:px-6">
        <div className="mx-auto max-w-[1100px] grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_1fr] items-end gap-x-2 gap-y-2">
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
                accentClass="accent-[#ffd84a]"
              />
            </div>
            <div className="leading-tight min-w-0 font-['Oswald'] font-bold tracking-wide">
              <div className="text-[13px] sm:text-base whitespace-nowrap">
                <span className="text-neutral-400">SOLDE </span>
                <span className="text-white">{fmt(p.credit)}</span>
                {p.demo && <span className="ml-1 text-[10px] text-white/50 align-middle">DÉMO</span>}
              </div>
              <div className="text-[13px] sm:text-base whitespace-nowrap">
                <span className="text-neutral-400">PRIX DU TOUR </span>
                <span className="text-white">{fmt(p.price)}</span>
              </div>
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 order-first sm:order-none flex flex-col items-center pb-1 min-w-0">
            <div className="h-5 font-['Oswald'] font-bold tracking-wide text-white text-xs sm:text-sm truncate max-w-full">{p.status}</div>
            <div
              className={`font-['Oswald'] font-bold text-center whitespace-nowrap text-[15px] sm:text-2xl ${
                p.win > 0 ? 'text-[#ffd84a] drop-shadow-[0_0_10px_rgba(255,216,74,0.6)]' : 'text-white'
              }`}
            >
              GAIN {fmt(p.win)}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <button
              onClick={p.onMain}
              disabled={p.phase === 'requesting' || (p.phase === 'idle' && p.disabled)}
              title={spinning ? 'Arrêt rapide (ESPACE)' : 'Tourner (ESPACE)'}
              className={`dh-spin-btn relative h-[72px] sm:h-[80px] w-[140px] sm:w-[170px] rounded-full border-[4px] border-[#140c22] flex flex-col items-center justify-center font-['Oswald'] font-bold leading-none active:translate-y-[3px] transition-transform disabled:cursor-not-allowed disabled:opacity-60 ${
                spinning
                  ? 'dh-spinning bg-[linear-gradient(180deg,#d9ccff,#8f6bff_55%,#3a1d8f)] text-white shadow-[0_5px_0_#140c22]'
                  : 'bg-[linear-gradient(180deg,#fff4b0,#ffd84a_55%,#d48a0c)] text-[#140c22] shadow-[0_5px_0_#140c22] hover:brightness-110'
              }`}
            >
              <span className="flex items-center gap-2 text-xl sm:text-2xl tracking-wider">
                <RotateCw size={22} strokeWidth={3} className="dh-spin-arrows" />
                {spinning ? 'STOP' : p.phase === 'requesting' ? '…' : 'TOURNER'}
              </span>
              {!spinning && <span className="text-[12px] sm:text-sm mt-1 opacity-80">{fmt(p.price)} JETONS</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Overlays & modales
// =============================================================================

const ChipArt: React.FC<{ className?: string; color: string }> = ({ className = '', color }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
    <circle cx="50" cy="50" r="46" fill={color} stroke="#140c22" strokeWidth="6" />
    {Array.from({ length: 8 }, (_, i) => (
      <rect key={i} x="45" y="6" width="10" height="16" rx="2" fill="#fff" transform={`rotate(${i * 45} 50 50)`} />
    ))}
    <circle cx="50" cy="50" r="28" fill="#fff" stroke="#140c22" strokeWidth="4" />
    <circle cx="50" cy="50" r="21" fill={color} />
    <path d="M40 44 H60 L50 60 Z" fill="#fff" stroke="#140c22" strokeWidth="2.5" strokeLinejoin="round" />
  </svg>
);

const BigWinOverlay: React.FC<{ amount: number; ratio: number; onClick: () => void }> = ({ amount, ratio, onClick }) => {
  const label = ratio >= 3 ? 'MEGA WIN' : 'BIG WIN';
  const rain = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: Math.random() * 100,
        size: 24 + Math.random() * 26,
        dur: 1.8 + Math.random() * 2,
        delay: Math.random() * 2.5,
        color: ['#8f6bff', '#ff5fc4', '#ffd84a', '#3fd2f2'][i % 4],
      })),
    [],
  );
  return (
    <div
      onClick={onClick}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden cursor-pointer bg-[radial-gradient(circle,rgba(110,70,20,0.85),rgba(0,0,0,0.93))]"
    >
      <div
        className="dh-rays absolute left-1/2 top-1/2 w-[160vmax] h-[160vmax] -ml-[80vmax] -mt-[80vmax] pointer-events-none"
        style={{ background: 'repeating-conic-gradient(rgba(255,216,74,0.14) 0deg 7deg, transparent 7deg 18deg)' }}
      />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {rain.map((c, i) => (
          <div
            key={i}
            className="dh-coin absolute top-0"
            style={{
              left: `${c.left}%`,
              width: c.size,
              height: c.size,
              animationDuration: `${c.dur}s`,
              animationDelay: `${c.delay}s`,
              animationIterationCount: 'infinite',
            }}
          >
            <ChipArt className="w-full h-full" color={c.color} />
          </div>
        ))}
      </div>
      <div
        key={label}
        className="relative wd-pop font-['Luckiest_Guy'] text-[clamp(48px,11vw,130px)] leading-none text-center px-4"
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #fff4b0 35%, #ffd84a 65%, #d48a0c 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextStroke: '3px #140c22',
          filter: 'drop-shadow(0 7px 0 #140c22)',
        }}
      >
        {label}
      </div>
      <div className="relative mt-3 font-['Oswald'] font-bold text-[clamp(36px,7vw,84px)] text-white drop-shadow-[0_5px_0_#140c22]">
        {fmt(Math.floor(amount))}
      </div>
      <div className="relative font-['Oswald'] font-bold text-[clamp(16px,2.5vw,26px)] text-[#ffd84a]">JETONS</div>
      <div className="relative mt-2 text-white/60 text-xs font-semibold">Cliquez pour passer</div>
    </div>
  );
};

const PrizeOverlay: React.FC<{ result: SpinResult; podiumImage: string; onClose: () => void }> = ({ result, podiumImage, onClose }) => {
  const seg = result.segment;
  const fallback = PRIZE_IMAGES[seg.type] || '/mystery_vault.jpg';
  const title = seg.type === 'vehicle' ? 'JACKPOT !' : seg.type === 'clothing' ? 'LOT VIP !' : 'LOT MYSTÈRE !';
  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden p-4 bg-[radial-gradient(circle,rgba(120,40,120,0.85),rgba(0,0,0,0.93))]"
    >
      <div
        className="dh-rays absolute left-1/2 top-1/2 w-[160vmax] h-[160vmax] -ml-[80vmax] -mt-[80vmax] pointer-events-none"
        style={{ background: 'repeating-conic-gradient(rgba(255,154,224,0.13) 0deg 7deg, transparent 7deg 18deg)' }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="wd-pop relative w-full max-w-md rounded-2xl border-[4px] border-[#140c22] bg-[linear-gradient(180deg,#2e2250,#140c22)] shadow-[0_8px_0_#140c22,0_30px_60px_rgba(0,0,0,0.7)] overflow-hidden"
      >
        <button onClick={onClose} aria-label="Fermer" className="absolute z-10 top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center">
          <X size={16} />
        </button>
        <div className="relative h-48 bg-black border-b-4 border-[#140c22]">
          <img
            src={seg.imageUrl || (seg.type === 'vehicle' ? podiumImage : fallback)}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.src = fallback;
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#140c22] via-transparent to-transparent" />
        </div>
        <div className="p-5 text-center">
          <div
            className="font-['Luckiest_Guy'] text-5xl leading-none"
            style={{
              background: 'linear-gradient(180deg, #ffffff 0%, #fff4b0 40%, #ffd84a 70%, #d48a0c 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              WebkitTextStroke: '2px #140c22',
              filter: 'drop-shadow(0 4px 0 #140c22)',
            }}
          >
            {title}
          </div>
          <div className="mt-2 font-['Oswald'] font-bold text-xl text-white">{seg.label}</div>
          <div className="text-sm text-white/70">{String(seg.value)}</div>
          <p className="mt-3 text-xs text-white/60">
            {result.mode === 'demo'
              ? 'Tour de démonstration : ce lot n’est pas crédité.'
              : 'Le lot rejoint votre inventaire. Réclamez-le depuis votre Espace Membre pour la remise en ville.'}
          </p>
          <div className="mt-4 flex gap-2">
            {result.mode === 'real' && (
              <Link
                to="/espace-membre"
                className="flex-1 font-['Oswald'] font-bold py-2.5 rounded-lg bg-[linear-gradient(180deg,#fff4b0,#ffd84a_55%,#d48a0c)] text-[#140c22] border-[3px] border-[#140c22] shadow-[0_4px_0_#140c22]"
              >
                MON INVENTAIRE
              </Link>
            )}
            <button
              onClick={onClose}
              className="flex-1 font-['Oswald'] font-bold py-2.5 rounded-lg bg-[#2a2044] hover:bg-[#3a2c5c] text-white border-[3px] border-[#140c22] shadow-[0_4px_0_#140c22]"
            >
              CONTINUER
            </button>
          </div>
        </div>
      </div>
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

const RuleCard: React.FC<{ emoji: string; title: string; children: React.ReactNode }> = ({ emoji, title, children }) => (
  <div className="rounded-lg bg-black/30 p-3">
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-2xl">{emoji}</span>
      <b className="text-white font-['Oswald'] text-sm tracking-wide">{title}</b>
    </div>
    <p>{children}</p>
  </div>
);
