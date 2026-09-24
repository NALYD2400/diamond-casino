import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Clock, Coins, Crown, Lock, Loader2, User, Volume2, VolumeX, X } from 'lucide-react';
import { fadeUp } from '../constants/animations';
import { useCasinoUser } from '../context/CasinoUserContext';
import { useCasinoAdmin, type WheelSegmentConfig } from '../context/CasinoAdminContext';
import { apiRecentWheelWins, type WheelWin } from '../lib/supabase';
import { Wheel } from './wheel/Wheel';

const PRIZE_IMAGES: Record<WheelSegmentConfig['type'], string> = {
  vehicle: '/podium_supercar.jpg',
  chips: '/diamond_chips_jackpot.jpg',
  cash: '/diamond_cash_case.jpg',
  mystery: '/mystery_vault.jpg',
  clothing: '/diamond_vip_couture.jpg',
};

const TYPE_LABEL: Record<WheelSegmentConfig['type'], string> = {
  vehicle: 'Véhicule',
  chips: 'Jetons',
  cash: 'Cash',
  mystery: 'Lot mystère',
  clothing: 'Garde-robe',
};

const RULES = [
  { num: '01', title: 'Un tirage par cycle', desc: 'Chaque citoyen inscrit dispose d’un tirage gratuit toutes les 24 heures.' },
  { num: '02', title: 'Avantage VIP', desc: 'Carte Gold : un tirage toutes les 12 h. Black Diamond : toutes les 8 h.' },
  { num: '03', title: 'Tirage certifié', desc: 'Le résultat est calculé par le serveur du casino, jamais par votre navigateur.' },
  { num: '04', title: 'Gains crédités', desc: 'Jetons et cash arrivent immédiatement sur votre compte. Les lots vous sont remis en ville par la direction.' },
];

const SPIN_MS = 7000;
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

function formatPrizeValue(seg: WheelSegmentConfig): string {
  if (seg.type === 'chips' && typeof seg.value === 'number') return `${seg.value.toLocaleString('fr-FR')} jetons`;
  if (seg.type === 'cash' && typeof seg.value === 'number') return `$${seg.value.toLocaleString('fr-FR')}`;
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
  const { segments, podiumVehicle, economy } = useCasinoAdmin();

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
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const pendingCommitRef = useRef<(() => void) | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

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

  // Cleanup: stop the animation, release audio and never lose a won balance
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      pendingCommitRef.current?.();
      audioRef.current?.close().catch(() => {});
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
      try {
        localStorage.setItem('diamond_wheel_sound_muted', String(next));
      } catch {
        // storage unavailable
      }
      return next;
    });
  };

  const tick = useCallback((volume: number) => {
    if (mutedRef.current) return;
    try {
      const ctx = audioRef.current;
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1800, t);
      osc.frequency.exponentialRampToValueAtTime(260, t + 0.02);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.035);
    } catch {
      // audio not permitted
    }
  }, []);

  const chime = useCallback(() => {
    if (mutedRef.current) return;
    try {
      const ctx = audioRef.current;
      if (!ctx) return;
      [659.25, 783.99, 1046.5].forEach((freq, i) => {
        const start = ctx.currentTime + i * 0.12;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.08, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.75);
      });
    } catch {
      // audio not permitted
    }
  }, []);

  const maintenance = economy.maintenanceMode;
  const busy = phase === 'requesting' || phase === 'spinning';
  const spinDisabled = !isAuthenticated || !canSpinWheel || maintenance || busy;

  const handleSpin = async () => {
    if (spinDisabled) return;
    setError(null);
    setResultOpen(false);
    setWinIndex(null);
    setPhase('requesting');

    // The AudioContext must be created from a user gesture
    try {
      if (!audioRef.current) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioRef.current = Ctor ? new Ctor() : null;
      }
      await audioRef.current?.resume();
    } catch {
      audioRef.current = null;
    }

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
    const duration = reduceMotion ? 1200 : SPIN_MS;
    const jitter = (Math.random() - 0.5) * deg * 0.6;
    const targetMod = (((360 - (index + 0.5) * deg + jitter) % 360) + 360) % 360;
    const from = rotationRef.current;
    const base = from - (from % 360);
    const to = base + (reduceMotion ? 2 : 7) * 360 + targetMod;

    setPhase('spinning');
    const start = performance.now();
    let lastPin = Math.floor(from / deg);

    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const angle = from + (to - from) * easeOutQuart(t);
      if (rotorRef.current) rotorRef.current.style.transform = `rotate(${angle}deg)`;

      const pin = Math.floor(angle / deg);
      if (pin !== lastPin) {
        lastPin = pin;
        tick(0.02 + 0.05 * (1 - t));
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
      chime();
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

  // ------------------------------------------------------------------
  // Session panel content
  // ------------------------------------------------------------------
  let statusLabel = 'Connexion requise';
  let statusTone = 'text-neutral-400';
  if (maintenance) {
    statusLabel = 'Maintenance';
    statusTone = 'text-amber-400';
  } else if (isAuthenticated && canSpinWheel) {
    statusLabel = 'Tirage disponible';
    statusTone = 'text-emerald-400';
  } else if (isAuthenticated) {
    statusLabel = 'Prochain tirage';
    statusTone = 'text-white';
  }

  return (
    <div className="relative bg-black text-white">
      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}
      <section className="relative pt-36 sm:pt-44 pb-12 px-6 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-25 grayscale"
          style={{ backgroundImage: "url('/diamond_casino_hall.jpg')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black" aria-hidden="true" />

        <div className="relative max-w-4xl mx-auto text-center">
          <motion.span {...fadeUp(0.05)} className="text-xs font-['Geist_Mono'] tracking-[4px] uppercase text-neutral-400 block mb-4">
            THE DIAMOND // ROTONDE CENTRALE
          </motion.span>
          <motion.h1
            {...fadeUp(0.1)}
            className="text-5xl sm:text-7xl lg:text-8xl tracking-tight leading-[1.05] mb-6 font-['Instrument_Serif'] font-normal"
          >
            La Roue de la <em className="italic text-amber-400">Fortune</em>
          </motion.h1>
          <motion.p {...fadeUp(0.15)} className="text-base sm:text-lg text-neutral-300 max-w-2xl mx-auto leading-relaxed">
            Un tirage offert à chaque citoyen. Jetons, cash, lots d’exception et la {podiumVehicle.name} exposée sur le
            podium — chaque lancer est gagnant.
          </motion.p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* STAGE                                                            */}
      {/* ================================================================ */}
      <section className="px-6 pb-24 max-w-6xl mx-auto">
        {maintenance && (
          <div className="mb-8 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-center justify-center gap-3 text-amber-300 font-['Geist_Mono'] text-xs sm:text-sm text-center">
            <Lock size={15} className="shrink-0" />
            MAINTENANCE — La roue est temporairement suspendue par la direction.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-10 lg:gap-14 items-center">
          {/* Wheel */}
          <motion.div {...fadeUp(0.1)} className="relative mx-auto w-full max-w-[560px]">
            <div className="absolute inset-[8%] rounded-full bg-amber-500/10 blur-[80px]" aria-hidden="true" />
            <Wheel ref={rotorRef} segments={segments} highlightIndex={phase === 'won' ? winIndex : null} className="w-full" />
          </motion.div>

          {/* Session panel */}
          <motion.aside {...fadeUp(0.2)} className="liquid-glass rounded-2xl p-6 sm:p-7 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <span className="font-['Geist_Mono'] text-xs tracking-[3px] uppercase text-neutral-400">Votre session</span>
              <button
                type="button"
                onClick={toggleMute}
                className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-neutral-400 hover:text-white hover:border-white/30 transition-colors cursor-pointer"
                aria-label={muted ? 'Activer le son' : 'Couper le son'}
                title={muted ? 'Activer le son' : 'Couper le son'}
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            </div>

            {isLoading ? (
              <div className="flex items-center gap-3 text-neutral-400 text-sm py-6">
                <Loader2 size={16} className="animate-spin" /> Vérification de votre session…
              </div>
            ) : isAuthenticated && user ? (
              <>
                <div className="flex items-center gap-3">
                  <img src={user.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover border border-white/20" />
                  <div className="min-w-0">
                    <p className="font-semibold truncate">
                      {user.rpFirstName} {user.rpLastName}
                    </p>
                    <p className="font-['Geist_Mono'] text-xs text-neutral-500">
                      #{user.citizenId}
                      {user.vipTier && <span className="text-amber-400"> · VIP {user.vipTier}</span>}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <span className="font-['Geist_Mono'] text-[10px] tracking-[2px] uppercase text-neutral-500">Jetons</span>
                    <p className="font-semibold text-lg tabular-nums">{user.chips.toLocaleString('fr-FR')}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <span className="font-['Geist_Mono'] text-[10px] tracking-[2px] uppercase text-neutral-500">Cash</span>
                    <p className="font-semibold text-lg tabular-nums">${user.cash.toLocaleString('fr-FR')}</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-neutral-400 text-sm leading-relaxed">
                Connectez votre compte Discord et créez votre fiche citoyen pour recevoir votre tirage gratuit.
              </p>
            )}

            <div className="border-t border-white/10 pt-5">
              <span className="font-['Geist_Mono'] text-[10px] tracking-[2px] uppercase text-neutral-500 flex items-center gap-2">
                <Clock size={12} /> Statut
              </span>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${statusTone}`} aria-live="polite">
                {isAuthenticated && !canSpinWheel && !maintenance ? timeUntilNextSpin : statusLabel}
              </p>
              {isAuthenticated && user && (
                <p className="text-xs text-neutral-500 mt-1">
                  Un tirage toutes les {user.cooldownHours} h
                  {!user.vipTier && (
                    <>
                      {' · '}
                      <Link to="/abonnements" className="text-amber-400 hover:underline">
                        plus avec le VIP
                      </Link>
                    </>
                  )}
                </p>
              )}
            </div>

            {isAuthenticated || isLoading ? (
              <button
                type="button"
                onClick={handleSpin}
                disabled={spinDisabled}
                className="w-full rounded-full py-4 text-sm font-bold tracking-wider uppercase transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-black shadow-[0_0_30px_rgba(245,158,11,0.35)] hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-none"
              >
                {phase === 'requesting' && <Loader2 size={16} className="animate-spin" />}
                {phase === 'requesting'
                  ? 'Tirage en cours…'
                  : phase === 'spinning'
                    ? 'La roue tourne…'
                    : 'Tourner la roue'}
              </button>
            ) : (
              <Link
                to="/espace-membre"
                className="w-full rounded-full py-4 text-sm font-semibold tracking-wide bg-white text-black flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-[0_0_30px_rgba(255,255,255,0.2)]"
              >
                <User size={16} /> Se connecter avec Discord
              </Link>
            )}

            {error && (
              <p role="alert" className="text-sm text-red-400 -mt-2">
                {error}
              </p>
            )}
          </motion.aside>
        </div>
      </section>

      {/* ================================================================ */}
      {/* PRIZES                                                           */}
      {/* ================================================================ */}
      <section className="py-24 sm:py-28 px-6 max-w-6xl mx-auto border-t border-white/10">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <span className="text-xs font-['Geist_Mono'] tracking-[3px] uppercase text-neutral-400 block mb-2">
              LOTS EN JEU &amp; PROBABILITÉS
            </span>
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em]">
              Ce que la roue vous <span className="font-['Instrument_Serif'] font-normal italic text-amber-400">réserve</span>
            </h2>
          </div>
          <p className="text-neutral-400 text-sm max-w-sm">
            Les chances affichées sont celles utilisées par le serveur au moment du tirage. Du plus rare au plus fréquent.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-8">
          {/* Podium vehicle */}
          <motion.div {...fadeUp(0.05)} className="relative rounded-2xl overflow-hidden border border-white/15 min-h-[360px] group">
            <img
              src={podiumVehicle.imageUrl}
              alt={podiumVehicle.name}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-7">
              <span className="font-['Geist_Mono'] text-xs tracking-[3px] uppercase text-amber-400">Lot 01 // Podium</span>
              <h3 className="text-3xl sm:text-4xl font-semibold mt-2">{podiumVehicle.name}</h3>
              <p className="text-neutral-300 text-sm mt-1">
                Valeur estimée ${podiumVehicle.value.toLocaleString('fr-FR')}
              </p>
            </div>
          </motion.div>

          {/* Odds list */}
          <motion.div {...fadeUp(0.1)} className="liquid-glass rounded-2xl p-6">
            <ul className="divide-y divide-white/5">
              {prizeBoard.map(({ seg, chance }) => (
                <li key={seg.id} className="py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span
                        className={`text-sm font-medium truncate ${
                          seg.type === 'vehicle' || seg.type === 'mystery' || seg.type === 'clothing' ? 'text-amber-300' : 'text-white'
                        }`}
                      >
                        {seg.label}
                      </span>
                      <span className="font-['Geist_Mono'] text-xs text-neutral-400 tabular-nums shrink-0">
                        {chance.toLocaleString('fr-FR', { maximumFractionDigits: chance < 1 ? 2 : 1 })} %
                      </span>
                    </div>
                    <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${seg.type === 'vehicle' ? 'bg-amber-400' : 'bg-white/40'}`}
                        style={{ width: `${Math.max(2, (chance / maxChance) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="hidden sm:block font-['Geist_Mono'] text-[10px] tracking-[2px] uppercase text-neutral-500 w-20 text-right">
                    {TYPE_LABEL[seg.type]}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* RULES + RECENT WINNERS                                           */}
      {/* ================================================================ */}
      <section className="py-24 sm:py-28 px-6 max-w-6xl mx-auto border-t border-white/10">
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-14">
          <div>
            <span className="text-xs font-['Geist_Mono'] tracking-[3px] uppercase text-neutral-400 block mb-2">RÈGLEMENT</span>
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em] mb-10">
              Simple, équitable, <span className="font-['Instrument_Serif'] font-normal italic text-amber-400">vérifié.</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {RULES.map((rule, idx) => (
                <motion.div key={rule.num} {...fadeUp(0.08 * idx)} className="flex flex-col border-l border-white/10 pl-5">
                  <span className="font-['Geist_Mono'] text-xs text-amber-400/80 mb-2">{rule.num}</span>
                  <h3 className="font-semibold text-lg mb-2">{rule.title}</h3>
                  <p className="text-neutral-400 text-sm leading-relaxed">{rule.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs font-['Geist_Mono'] tracking-[3px] uppercase text-neutral-400 block mb-2">DERNIERS GAGNANTS</span>
            <div className="liquid-glass rounded-2xl p-2 mt-4">
              {recentWins.length === 0 ? (
                <p className="text-sm text-neutral-500 p-5">Aucun tirage pour le moment. Soyez le premier !</p>
              ) : (
                <ul>
                  {recentWins.map((win, i) => (
                    <li
                      key={`${win.won_at}-${i}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{win.winner}</p>
                        <p className="text-xs text-neutral-400 truncate">{win.prize}</p>
                      </div>
                      <span className="font-['Geist_Mono'] text-[11px] text-neutral-500 shrink-0">{timeAgo(win.won_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6 p-5 rounded-xl border border-white/15 bg-white/[0.02] flex items-center justify-between gap-4">
              <span className="text-sm text-neutral-300 flex items-center gap-2">
                <Crown size={16} className="text-amber-400 shrink-0" /> Plus de tirages avec les cartes VIP
              </span>
              <Link
                to="/abonnements"
                className="text-xs uppercase tracking-widest font-bold hover:underline flex items-center gap-1 shrink-0"
              >
                Voir <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* RESULT MODAL                                                     */}
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
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="liquid-glass bg-black/70 rounded-3xl w-full max-w-md overflow-hidden border border-white/15"
            >
              <div className="relative h-56">
                <img
                  src={wonSegment.type === 'vehicle' ? podiumVehicle.imageUrl : PRIZE_IMAGES[wonSegment.type]}
                  alt=""
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                <button
                  type="button"
                  onClick={() => setResultOpen(false)}
                  className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 border border-white/20 flex items-center justify-center hover:bg-black cursor-pointer"
                  aria-label="Fermer"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-7 text-center">
                <span className="font-['Geist_Mono'] text-xs tracking-[3px] uppercase text-neutral-400">Félicitations</span>
                <h3 id="wheel-result-title" className="text-4xl font-['Instrument_Serif'] mt-2 mb-2">
                  <em className="italic text-amber-400">{wonSegment.label}</em>
                </h3>
                <p className="text-neutral-300 text-sm">
                  {wonSegment.type === 'chips' || wonSegment.type === 'cash'
                    ? `${formatPrizeValue(wonSegment)} crédités sur votre compte.`
                    : `« ${formatPrizeValue(wonSegment)} » a été ajouté à votre inventaire. La direction vous le remettra en ville.`}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 mt-7">
                  <Link
                    to="/espace-membre"
                    className="flex-1 rounded-full py-3 text-sm font-semibold bg-white text-black flex items-center justify-center gap-2 hover:bg-neutral-200 transition-colors"
                  >
                    <Coins size={15} /> Voir mon compte
                  </Link>
                  <button
                    type="button"
                    onClick={() => setResultOpen(false)}
                    className="flex-1 rounded-full py-3 text-sm font-medium border border-white/20 hover:bg-white/10 transition-colors cursor-pointer"
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
