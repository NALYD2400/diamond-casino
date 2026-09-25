import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import {
  ArrowUpRight,
  Car,
  Clock,
  Coins,
  Crown,
  Gift,
  Lock,
  Loader2,
  ShieldCheck,
  Shirt,
  Sparkles,
  User,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { fadeUp } from '../constants/animations';
import { useCasinoUser } from '../context/CasinoUserContext';
import { useCasinoAdmin, type WheelSegmentConfig } from '../context/CasinoAdminContext';
import { apiRecentWheelWins, type WheelWin } from '../lib/supabase';
import { Wheel } from './wheel/Wheel';
import { WheelAudio } from './wheel/wheelAudio';

const PRIZE_IMAGES: Record<WheelSegmentConfig['type'], string> = {
  vehicle: '/podium_supercar.jpg',
  chips: '/diamond_chips_jackpot.jpg',
  mystery: '/mystery_vault.jpg',
  clothing: '/diamond_vip_couture.jpg',
};

const TYPE_LABEL: Record<WheelSegmentConfig['type'], string> = {
  vehicle: 'Véhicule',
  chips: 'Jetons',
  mystery: 'Lot mystère',
  clothing: 'Garde-robe',
};

const RULES = [
  {
    num: '01',
    title: 'Un tirage quotidien',
    desc: 'Chaque citoyen enregistré reçoit 1 lancer gratuit toutes les 24 heures.',
  },
  {
    num: '02',
    title: 'Boost Discord & VIP (/boost)',
    desc: 'Boostez le Discord ou souscrivez un pass : cooldown réduit à 12h (Booster/Gold) ou 8h (Black Diamond).',
  },
  {
    num: '03',
    title: 'Provably Fair certifié',
    desc: 'Le tirage est calculé de manière cryptographique et vérifiable par le serveur.',
  },
  {
    num: '04',
    title: 'Crédit immédiat & Inventaire',
    desc: 'Les jetons sont crédités instantanément. Les véhicules et récompenses rejoignent votre inventaire.',
  },
];

const SPIN_MS = 8500;
const SPIN_TURNS = 8;
const SUSPENSE_FROM = 0.65;
// Inertia friction easing (smooth natural deceleration)
const easeOutWheel = (t: number) => 1 - Math.pow(1 - t, 3.8);

function formatPrizeValue(seg: WheelSegmentConfig): string {
  if (seg.type === 'chips' && typeof seg.value === 'number') {
    return `${seg.value.toLocaleString('fr-FR')} jetons`;
  }
  return String(seg.value);
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'À l’instant';
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Il y a ${h} h`;
  return `Il y a ${Math.floor(h / 24)} j`;
}

export const WheelOfFortune: React.FC = () => {
  const { user, isAuthenticated, isLoading, canSpinWheel, timeUntilNextSpin, spinWheel } = useCasinoUser();
  const { segments, podiumVehicle, economy, gamesConfig } = useCasinoAdmin();

  const [phase, setPhase] = useState<'idle' | 'requesting' | 'spinning' | 'won'>('idle');
  const [winIndex, setWinIndex] = useState<number | null>(null);
  const [wonSegment, setWonSegment] = useState<WheelSegmentConfig | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentWins, setRecentWins] = useState<WheelWin[]>([]);
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('diamond_wheel_sound_muted') === 'true';
    } catch {
      return false;
    }
  });

  const rotorRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<WheelAudio>(new WheelAudio());
  const pendingCommitRef = useRef<(() => void) | null>(null);
  audioRef.current.muted = muted;

  const n = Math.max(segments.length, 1);
  const deg = 360 / n;

  const loadRecentWins = useCallback(() => {
    apiRecentWheelWins(8)
      .then(setRecentWins)
      .catch(() => setRecentWins([]));
  }, []);

  useEffect(() => {
    loadRecentWins();
  }, [loadRecentWins]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      pendingCommitRef.current?.();
      audioRef.current.close();
    },
    [],
  );

  useEffect(() => {
    if (!resultOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setResultOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resultOpen]);

  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      if (next) audioRef.current.stopSuspense();
      try {
        localStorage.setItem('diamond_wheel_sound_muted', String(next));
      } catch {
        // storage fallback
      }
      return next;
    });
  };

  // Roue fermée = maintenance générale OU roue désactivée dans la console
  const maintenance = economy.maintenanceMode || !gamesConfig.wheel.enabled;
  const busy = phase === 'requesting' || phase === 'spinning';
  const spinDisabled = !isAuthenticated || !canSpinWheel || maintenance || busy;

  const handleSpin = async () => {
    if (spinDisabled) return;
    setError(null);
    setResultOpen(false);
    setWinIndex(null);
    setPhase('requesting');

    const audio = audioRef.current;
    audio.unlock();

    let outcome;
    try {
      outcome = await spinWheel();
    } catch (err) {
      setError((err as Error).message);
      setPhase('idle');
      return;
    }

    pendingCommitRef.current = outcome.commit;
    const index = Math.min(Math.max(outcome.segmentIndex, 0), n - 1);
    const segment: WheelSegmentConfig = {
      ...(segments[index] || segments[0]),
      ...(outcome.segment as Partial<WheelSegmentConfig>),
    };

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = reduceMotion ? 1500 : SPIN_MS;
    const jitter = (Math.random() - 0.5) * deg * 0.5;
    const targetMod = (((360 - (index + 0.5) * deg + jitter) % 360) + 360) % 360;
    const from = rotationRef.current;
    const base = from - (from % 360);
    const to = base + (reduceMotion ? 2 : SPIN_TURNS) * 360 + targetMod;

    setPhase('spinning');
    audio.whoosh();
    const start = performance.now();
    let lastPin = Math.floor(from / deg);
    let suspenseStarted = false;
    let pointerDeflection = 0;

    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const angle = from + (to - from) * easeOutWheel(t);
      if (rotorRef.current) rotorRef.current.style.transform = `rotate(${angle}deg)`;

      const pin = Math.floor(angle / deg);
      if (pin !== lastPin) {
        lastPin = pin;
        audio.tick(Math.pow(1 - t, 2));
        pointerDeflection = -(5 + 14 * Math.pow(1 - t, 1.2));
      }

      // Smooth damped spring decay on pointer
      pointerDeflection *= 0.84;
      if (pointerRef.current) {
        pointerRef.current.style.transform =
          Math.abs(pointerDeflection) > 0.05 ? `rotate(${pointerDeflection.toFixed(2)}deg)` : '';
      }

      if (!suspenseStarted && !reduceMotion && t >= SUSPENSE_FROM) {
        suspenseStarted = true;
        audio.startSuspense(((1 - SUSPENSE_FROM) * duration) / 1000);
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      rafRef.current = null;
      rotationRef.current = to;
      pendingCommitRef.current?.();
      pendingCommitRef.current = null;
      setWinIndex(index);
      setWonSegment(segment);
      setPhase('won');
      audio.stopSuspense();
      audio.win(segment.type === 'vehicle' || segment.type === 'mystery' || segment.type === 'clothing');
      loadRecentWins();
      window.setTimeout(() => setResultOpen(true), 600);
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  const prizeBoard = useMemo(() => {
    const total = segments.reduce((acc, s) => acc + Math.max(0, s.dropRate || 0), 0) || 1;
    return [...segments]
      .map((s) => ({ seg: s, chance: (Math.max(0, s.dropRate || 0) / total) * 100 }))
      .sort((a, b) => a.chance - b.chance);
  }, [segments]);

  const maxChance = Math.max(...prizeBoard.map((p) => p.chance), 1);

  // Status badges & labels
  let statusBadge = {
    label: 'Connexion requise',
    dotClass: 'bg-neutral-500',
    textClass: 'text-neutral-400',
  };
  if (maintenance) {
    statusBadge = {
      label: 'Maintenance',
      dotClass: 'bg-amber-400',
      textClass: 'text-amber-400',
    };
  } else if (isAuthenticated && canSpinWheel) {
    statusBadge = {
      label: 'Tirage disponible',
      dotClass: 'bg-emerald-400 animate-pulse',
      textClass: 'text-emerald-400',
    };
  } else if (isAuthenticated) {
    statusBadge = {
      label: 'Cooldown actif',
      dotClass: 'bg-amber-400',
      textClass: 'text-amber-300',
    };
  }

  return (
    <div className="relative min-h-screen bg-black text-white selection:bg-white selection:text-black font-sans pb-24">
      {/* Background Ambience Monochrome */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-gradient-to-b from-white/[0.04] via-white/[0.015] to-transparent blur-[140px]"
        aria-hidden="true"
      />

      {/* ================================================================ */}
      {/* HEADER : Sober, modern, clean luxury                             */}
      {/* ================================================================ */}
      <header className="relative pt-28 sm:pt-32 pb-8 px-4 sm:px-6 text-center max-w-4xl mx-auto">
        <motion.h1
          {...fadeUp(0.06)}
          className="text-4xl sm:text-6xl lg:text-7xl font-['Instrument_Serif'] font-normal tracking-tight leading-tight mb-3"
        >
          La Roue de la <em className="italic text-white">Fortune</em>
        </motion.h1>

        <motion.p
          {...fadeUp(0.1)}
          className="text-sm sm:text-base text-neutral-400 max-w-xl mx-auto leading-relaxed"
        >
          Un tirage quotidien certifié pour chaque citoyen. Véhicules d’exception, jetons et dotations prestigieuses.
        </motion.p>
      </header>

      {/* ================================================================ */}
      {/* MAIN STAGE : Perfectly balanced Wheel & Session Control Panel    */}
      {/* ================================================================ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6">
        {maintenance && (
          <div className="mb-6 p-3.5 rounded-xl border border-white/20 bg-white/[0.04] flex items-center justify-center gap-2.5 text-neutral-300 font-['Geist_Mono'] text-xs sm:text-sm text-center">
            <Lock size={14} className="shrink-0" />
            MAINTENANCE — La roue est momentanément suspendue par la direction du casino.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.8fr] gap-8 lg:gap-14 items-center">
          {/* 1. Wheel Container (Strictly bounded, magnified & fluid) */}
          <motion.div {...fadeUp(0.1)} className="relative flex flex-col items-center justify-center w-full max-w-[620px] lg:max-w-[680px] xl:max-w-[740px] mx-auto">
            <div className="relative w-full aspect-square flex items-center justify-center">
              {/* Subtle ambient light behind wheel */}
              <div
                className="absolute inset-[8%] rounded-full bg-white/[0.04] blur-[110px] pointer-events-none"
                aria-hidden="true"
              />

              {/* The Wheel */}
              <Wheel
                ref={rotorRef}
                pointerRef={pointerRef}
                segments={segments}
                mode={phase === 'won' ? 'won' : busy ? 'spinning' : 'idle'}
                highlightIndex={phase === 'won' ? winIndex : null}
                className="w-full h-full drop-shadow-[0_28px_60px_rgba(0,0,0,0.95)]"
              />
            </div>

            {/* Subtle luxury floor shadow */}
            <div
              className="mt-3 h-5 w-3/4 rounded-full bg-white/[0.06] blur-2xl pointer-events-none"
              aria-hidden="true"
            />
          </motion.div>

          {/* 2. Session & Boost Control Dashboard */}
          <motion.aside
            {...fadeUp(0.18)}
            className="liquid-glass rounded-2xl p-5 sm:p-7 border border-white/10 flex flex-col gap-5"
          >
            {/* Top Bar: Session title, Status pill, and Sound toggle */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full ${statusBadge.dotClass}`} />
                <span className={`text-xs font-['Geist_Mono'] uppercase tracking-wider font-medium ${statusBadge.textClass}`}>
                  {statusBadge.label}
                </span>
              </div>

              <button
                type="button"
                onClick={toggleMute}
                className="w-8 h-8 rounded-full border border-white/15 bg-white/[0.02] flex items-center justify-center text-neutral-400 hover:text-white hover:border-white/30 transition-colors cursor-pointer"
                aria-label={muted ? 'Activer le son' : 'Couper le son'}
                title={muted ? 'Activer le son' : 'Couper le son'}
              >
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            </div>

            {/* User Identity / Discord Connection */}
            {isLoading ? (
              <div className="flex items-center gap-3 py-4 text-neutral-400 text-sm">
                <Loader2 size={16} className="animate-spin text-amber-400" />
                Chargement de votre profil citoyen…
              </div>
            ) : isAuthenticated && user ? (
              <div className="flex items-center justify-between gap-3 bg-white/[0.02] border border-white/10 rounded-xl p-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover border border-white/20 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-white truncate">
                      {user.rpFirstName} {user.rpLastName}
                    </p>
                    <p className="font-['Geist_Mono'] text-xs text-neutral-400 truncate">
                      #{user.citizenId}
                      {user.vipTier && <span className="text-amber-400"> · VIP {user.vipTier}</span>}
                    </p>
                  </div>
                </div>

                {user.isBooster ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-['Geist_Mono'] font-semibold tracking-wider uppercase bg-purple-500/15 border border-purple-500/30 text-purple-300 shrink-0">
                    <Zap size={11} className="text-purple-400" /> Booster
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-['Geist_Mono'] font-medium tracking-wider uppercase bg-white/5 border border-white/10 text-neutral-400 shrink-0">
                    Citoyen
                  </span>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] text-sm text-neutral-400 leading-relaxed">
                Connectez votre compte Discord pour accéder à votre lancer quotidien gratuit et retrouver vos lots.
              </div>
            )}

            {/* Metrics: Chips & Rewards Inventory */}
            {isAuthenticated && user && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                  <span className="font-['Geist_Mono'] text-[10px] tracking-[1.5px] uppercase text-neutral-400 block mb-1 flex items-center gap-1.5">
                    <Coins size={12} className="text-amber-400" /> Jetons
                  </span>
                  <p className="font-semibold text-lg sm:text-xl tabular-nums text-white">
                    {user.chips.toLocaleString('fr-FR')}
                  </p>
                </div>

                <Link
                  to="/espace-membre"
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 hover:border-amber-400/40 hover:bg-white/[0.04] transition-all group"
                  title="Voir mes récompenses"
                >
                  <span className="font-['Geist_Mono'] text-[10px] tracking-[1.5px] uppercase text-neutral-400 block mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Gift size={12} className="text-amber-400" /> Inventaire
                    </span>
                    <ArrowUpRight size={12} className="text-neutral-500 group-hover:text-amber-400 transition-colors" />
                  </span>
                  <p className="font-semibold text-lg sm:text-xl tabular-nums text-amber-400">
                    {user.rewards.filter((r) => r.status === 'IN_INVENTORY' || r.status === 'CLAIMED').length} lot(s)
                  </p>
                </Link>
              </div>
            )}

            {/* Countdown / Cooldown Timer Card */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-xs text-neutral-400 font-['Geist_Mono']">
                <span className="flex items-center gap-1.5 uppercase tracking-wider">
                  <Clock size={12} className="text-amber-400" /> Cooldown
                </span>
                <span>
                  {isAuthenticated && user ? `1 tirage / ${user.cooldownHours}h` : '1 tirage / 24h'}
                </span>
              </div>

              <div className="text-2xl sm:text-3xl font-semibold tabular-nums text-white tracking-tight">
                {isAuthenticated && !canSpinWheel && !maintenance
                  ? timeUntilNextSpin
                  : canSpinWheel && !maintenance
                    ? 'Disponible immédiatement'
                    : maintenance
                      ? 'Service suspendu'
                      : '24h 00m 00s'}
              </div>
            </div>

            {/* Discord Booster & VIP Perk Banner (/boost) */}
            <div className="p-3.5 rounded-xl border border-white/10 bg-gradient-to-r from-amber-500/[0.04] to-purple-500/[0.04] flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0 text-amber-400">
                  <Zap size={14} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-200 truncate">Avantage Boost Discord (/boost)</p>
                  <p className="text-neutral-400 text-[11px] truncate">
                    Booster Discord &amp; VIP Gold : 12h · Black Diamond : 8h
                  </p>
                </div>
              </div>

              <Link
                to="/abonnements"
                className="shrink-0 font-['Geist_Mono'] text-[11px] font-semibold text-amber-400 hover:text-amber-300 transition-colors uppercase tracking-wider flex items-center gap-1"
              >
                Pass <ArrowUpRight size={12} />
              </Link>
            </div>

            {/* Action CTA Button */}
            {isAuthenticated || isLoading ? (
              <button
                type="button"
                onClick={handleSpin}
                disabled={spinDisabled}
                className="w-full rounded-xl py-3.5 sm:py-4 text-xs sm:text-sm font-bold tracking-widest uppercase transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 text-black shadow-[0_0_24px_rgba(245,158,11,0.25)] hover:shadow-[0_0_32px_rgba(245,158,11,0.4)] hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:shadow-none disabled:active:scale-100"
              >
                {phase === 'requesting' && <Loader2 size={16} className="animate-spin text-black" />}
                {phase === 'requesting'
                  ? 'Génération certifiée…'
                  : phase === 'spinning'
                    ? 'La roue tourne…'
                    : !canSpinWheel && !maintenance
                      ? `Prochain tirage dans ${timeUntilNextSpin}`
                      : 'Tourner la Roue'}
              </button>
            ) : (
              <Link
                to="/espace-membre"
                className="w-full rounded-xl py-3.5 sm:py-4 text-xs sm:text-sm font-semibold tracking-wider uppercase bg-white text-black flex items-center justify-center gap-2 hover:bg-neutral-200 transition-colors shadow-[0_0_24px_rgba(255,255,255,0.15)]"
              >
                <User size={15} /> Se connecter avec Discord
              </Link>
            )}

            {error && (
              <p role="alert" className="text-xs text-red-400 text-center">
                {error}
              </p>
            )}

            {/* Cryptographic Certification Footnote */}
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-['Geist_Mono'] text-neutral-500 text-center">
              <ShieldCheck size={13} className="text-neutral-400" />
              <span>Tirage RNG certifié · Algorithme Provably Fair</span>
            </div>
          </motion.aside>
        </div>
      </main>

      {/* ================================================================ */}
      {/* PRIZES & ODDS : Clean, balanced layout                           */}
      {/* ================================================================ */}
      <section className="mt-20 sm:mt-24 pt-16 border-t border-white/10 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <span className="text-xs font-['Geist_Mono'] tracking-[3px] uppercase text-neutral-400 block mb-1.5">
              DOTATIONS EN JEU &amp; PROBABILITÉS
            </span>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
              Ce que la roue vous <span className="font-['Instrument_Serif'] font-normal italic text-amber-400">réserve</span>
            </h2>
          </div>
          <p className="text-neutral-400 text-xs sm:text-sm max-w-md">
            Probabilités transparentes calculées par le serveur au moment du tirage, du lot le plus rare au plus fréquent.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.3fr] gap-6 items-start">
          {/* 1. Featured Podium Vehicle Showcase */}
          <motion.div
            {...fadeUp(0.06)}
            className="relative rounded-2xl overflow-hidden border border-white/15 group aspect-[16/11] max-h-[460px] bg-neutral-900"
          >
            <img
              src={podiumVehicle.imageUrl}
              alt={podiumVehicle.name}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
            <div className="absolute top-4 left-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-['Geist_Mono'] font-bold uppercase tracking-wider bg-amber-400 text-black shadow-lg">
                <Crown size={12} /> Lot 01 // Podium
              </span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <h3 className="text-2xl sm:text-3xl font-semibold text-white">{podiumVehicle.name}</h3>
              <p className="text-neutral-300 text-sm mt-1 font-['Geist_Mono']">
                Valeur concessionnaire : {podiumVehicle.value.toLocaleString('fr-FR')} $
              </p>
            </div>
          </motion.div>

          {/* 2. Structured Odds & Prizes Board */}
          <motion.div
            {...fadeUp(0.12)}
            className="liquid-glass rounded-2xl p-5 border border-white/10 flex flex-col max-h-[460px] overflow-hidden"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10 text-xs font-['Geist_Mono'] text-neutral-400 uppercase tracking-wider">
              <span>Lot &amp; Nature</span>
              <span>Cote de tirage</span>
            </div>

            <ul className="divide-y divide-white/5 overflow-y-auto pr-1">
              {prizeBoard.map(({ seg, chance }) => {
                const Icon = seg.type === 'vehicle' ? Car : seg.type === 'chips' ? Coins : seg.type === 'clothing' ? Shirt : Gift;
                const isSpecial = seg.type === 'vehicle' || seg.type === 'mystery' || seg.type === 'clothing';
                return (
                  <li key={seg.id} className="py-2.5 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
                      <Icon size={14} className={isSpecial ? 'text-amber-400' : 'text-neutral-400'} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-xs sm:text-sm font-medium truncate ${isSpecial ? 'text-amber-300' : 'text-white'}`}>
                          {seg.label}
                        </span>
                        <span className="font-['Geist_Mono'] text-xs text-neutral-400 tabular-nums shrink-0">
                          {chance.toLocaleString('fr-FR', { maximumFractionDigits: chance < 1 ? 2 : 1 })} %
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            seg.type === 'vehicle' ? 'bg-amber-400' : isSpecial ? 'bg-amber-500/70' : 'bg-neutral-500'
                          }`}
                          style={{ width: `${Math.max(2, (chance / maxChance) * 100)}%` }}
                        />
                      </div>
                    </div>

                    <span className="hidden sm:inline font-['Geist_Mono'] text-[10px] tracking-wider uppercase text-neutral-500 shrink-0 w-16 text-right">
                      {TYPE_LABEL[seg.type]}
                    </span>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* RULES & RECENT WINS : Symmetrical, clean                         */}
      {/* ================================================================ */}
      <section className="mt-20 pt-16 border-t border-white/10 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-10 lg:gap-14">
          {/* Rules / Boost FAQ */}
          <div>
            <span className="text-xs font-['Geist_Mono'] tracking-[3px] uppercase text-neutral-400 block mb-1.5">
              RÈGLEMENT &amp; AVANTAGES
            </span>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-8">
              Équité, transparence &amp; <span className="font-['Instrument_Serif'] font-normal italic text-amber-400">avantages.</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {RULES.map((rule, idx) => (
                <motion.div
                  key={rule.num}
                  {...fadeUp(0.06 * idx)}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between"
                >
                  <span className="font-['Geist_Mono'] text-xs text-amber-400 font-bold mb-1.5">{rule.num}</span>
                  <h3 className="font-semibold text-sm text-white mb-1.5">{rule.title}</h3>
                  <p className="text-neutral-400 text-xs leading-relaxed">{rule.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Recent Winners Live Stream */}
          <div>
            <span className="text-xs font-['Geist_Mono'] tracking-[3px] uppercase text-neutral-400 block mb-1.5">
              DERNIERS GAGNANTS
            </span>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-8">
              Tirages en <span className="font-['Instrument_Serif'] font-normal italic text-amber-400">ville.</span>
            </h2>

            <div className="liquid-glass rounded-2xl p-2 border border-white/10">
              {recentWins.length === 0 ? (
                <p className="text-xs text-neutral-500 p-5 text-center font-['Geist_Mono']">
                  Aucun tirage récent pour le moment.
                </p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {recentWins.slice(0, 6).map((win, i) => (
                    <li
                      key={`${win.won_at}-${i}`}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-white truncate">{win.winner}</p>
                        <p className="text-[11px] text-amber-400/90 truncate">{win.prize}</p>
                      </div>
                      <span className="font-['Geist_Mono'] text-[10px] text-neutral-500 shrink-0">
                        {timeAgo(win.won_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 p-3.5 rounded-xl border border-white/10 bg-white/[0.02] flex items-center justify-between gap-3">
              <span className="text-xs text-neutral-300 flex items-center gap-2">
                <Crown size={14} className="text-amber-400 shrink-0" />
                Cooldown réduit avec les cartes VIP
              </span>
              <Link
                to="/abonnements"
                className="text-xs font-['Geist_Mono'] uppercase tracking-wider font-bold text-amber-400 hover:underline flex items-center gap-1 shrink-0"
              >
                Voir <ArrowUpRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* RESULT MODAL : Ultra-clean minimalist victory modal              */}
      {/* ================================================================ */}
      <AnimatePresence>
        {resultOpen && wonSegment && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setResultOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wheel-result-title"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="liquid-glass bg-black/90 rounded-2xl w-full max-w-md overflow-hidden border border-white/20 shadow-2xl"
            >
              <div className="relative h-48 sm:h-52 bg-neutral-900">
                <img
                  src={wonSegment.imageUrl || (wonSegment.type === 'vehicle' ? podiumVehicle.imageUrl : PRIZE_IMAGES[wonSegment.type])}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = PRIZE_IMAGES[wonSegment.type] || '/mystery_vault.jpg';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                <button
                  type="button"
                  onClick={() => setResultOpen(false)}
                  className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center hover:bg-black text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  aria-label="Fermer"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="p-6 text-center">
                <span className="font-['Geist_Mono'] text-xs tracking-[3px] uppercase text-neutral-400">
                  Tirage Gagnant
                </span>
                <h3 id="wheel-result-title" className="text-3xl sm:text-4xl font-['Instrument_Serif'] mt-1 mb-2 font-normal">
                  <em className="italic text-amber-400">{wonSegment.label}</em>
                </h3>

                <p className="text-neutral-300 text-xs sm:text-sm leading-relaxed max-w-sm mx-auto mb-6">
                  {wonSegment.type === 'chips'
                    ? `${formatPrizeValue(wonSegment)} crédités sur votre compte joueur.`
                    : `« ${formatPrizeValue(wonSegment)} » rejoint votre inventaire citoyen. Réclamez-le depuis votre Espace Membre pour remise en ville.`}
                </p>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <Link
                    to="/espace-membre"
                    className="flex-1 rounded-xl py-3 text-xs sm:text-sm font-semibold tracking-wide bg-white text-black flex items-center justify-center gap-2 hover:bg-neutral-200 transition-colors"
                  >
                    <Coins size={14} /> {wonSegment.type === 'chips' ? 'Voir mon compte' : 'Accéder à l’inventaire'}
                  </Link>
                  <button
                    type="button"
                    onClick={() => setResultOpen(false)}
                    className="flex-1 rounded-xl py-3 text-xs sm:text-sm font-medium border border-white/20 hover:bg-white/10 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
