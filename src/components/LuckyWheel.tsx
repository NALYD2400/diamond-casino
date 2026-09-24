import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import {
  Sparkles,
  Clock,
  Coins,
  DollarSign,
  Gift,
  Zap,
  Shirt,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Eye,
  X,
  ShieldCheck,
  ExternalLink,
  Crown,
  Lock,
  ChevronRight,
  Dices,
  ScrollText,
} from 'lucide-react';
import { useCasinoUser } from '../context/CasinoUserContext';
import { useCasinoAdmin, type WheelSegmentConfig } from '../context/CasinoAdminContext';
import { FortuneWheel, segmentIcon, segmentPalettes, paletteSwatch, type WheelMode } from './wheel/FortuneWheel';

interface LuckyWheelProps {
  onBackToHome?: () => void;
  onNavigateToMemberPortal?: () => void;
}

// Visual catalog of photorealistic AI assets
const PRIZE_ASSETS: Record<string, {
  image: string;
  title: string;
  category: string;
  subtitle: string;
  description: string;
  specs: { label: string; value: string; color?: string }[];
  actionLabel: string;
  actionIcon: typeof Zap;
}> = {
  vehicle: {
    image: '/podium_supercar.jpg',
    title: 'Grotti Itali RSX',
    category: 'VÉHICULE SUR PODIUM',
    subtitle: 'Supercar Hyper-Luxe • Plateau Rotatif #01',
    description: 'La Grotti Itali RSX domine la scène automobile de Los Santos. Équipée d\'un aileron aérodynamique adaptatif, d\'une transmission intégrale permanente et d\'un habitacle cuir surpiqué d\'or 24 carats.',
    specs: [
      { label: 'MOTEUR', value: 'V8 BITURBO HYBRIDE' },
      { label: '0-100 KM/H', value: '2.6 SEC', color: 'text-amber-400' },
      { label: 'VITESSE MAX', value: '215 KM/H', color: 'text-white' },
      { label: 'VALEUR RP', value: '$2,850,000', color: 'text-emerald-400' },
    ],
    actionLabel: 'Démarrer le V8 Biturbo',
    actionIcon: Zap,
  },
  chips: {
    image: '/diamond_chips_jackpot.jpg',
    title: 'Jackpot Jetons Diamond',
    category: 'RÉSERVE HAUTE SÉCURITÉ',
    subtitle: '50 000 Jetons en Céramique & Or Massif',
    description: 'Piles monumentales de jetons Diamond Casino officielles en céramique composite et or guilloché. Créditables immédiatement pour miser aux tables High Roller de Blackjack et Roulette VIP.',
    specs: [
      { label: 'DOTATION', value: '50 000 JETONS', color: 'text-amber-300' },
      { label: 'VALEUR TABLE', value: '$50,000 RP', color: 'text-emerald-400' },
      { label: 'USAGE', value: '100% TABLES VIP' },
      { label: 'SÉCURITÉ', value: 'PUCE RFID CRYPTÉE' },
    ],
    actionLabel: 'Examiner les jetons',
    actionIcon: Coins,
  },
  cash: {
    image: '/diamond_cash_case.jpg',
    title: 'Mallette Cash & Or Pur',
    category: 'VALISE DE CASH OFFICIELLE',
    subtitle: '$50 000 Cash + Lingots Or Fin 1kg',
    description: 'Mallette hermétique en cuir et fibre de carbone scellée contenant des liasses de coupures nettes de $100 et des lingots or fin 1kg poinçonnés du Diamond Casino. Transférée directement dans votre portefeuille RP.',
    specs: [
      { label: 'CASH LIQUIDE', value: '$50,000 DIRECT', color: 'text-emerald-400' },
      { label: 'LINGOTS', value: 'OR PUR 99.99%', color: 'text-amber-400' },
      { label: 'TRANSFERT', value: 'IMMÉDIAT EN BANQUE' },
      { label: 'TAXES RP', value: '0% EXONÉRATION' },
    ],
    actionLabel: 'Ouvrir la mallette',
    actionIcon: DollarSign,
  },
  mystery: {
    image: '/mystery_vault.jpg',
    title: 'Coffre Mystère Diamond',
    category: 'LOTS SECRETS D\'EXCEPTION',
    subtitle: 'Trésor Rare du Coffre-Fort Souterrain',
    description: 'Le coffre aux dorures et liserés laser néon renferme les plus rares trésors de San Andreas : garde-temps suisses Vacheron Royale, champagnes millésimés d\'exception ou accès VIP ultra-privés.',
    specs: [
      { label: 'STATUT', value: 'MYSTÈRE SCELLÉ', color: 'text-purple-400' },
      { label: 'CHANCE', value: '4.0% PAR TIRAGE' },
      { label: 'ORIGINE', value: 'VAULT SOUTERRAIN' },
      { label: 'RARITÉ', value: 'ÉDITION UNIQUE', color: 'text-amber-300' },
    ],
    actionLabel: 'Inspecter le coffre',
    actionIcon: Gift,
  },
  clothing: {
    image: '/diamond_vip_couture.jpg',
    title: 'Garde-Robe Haute Couture',
    category: 'VESTIAIRE PRIVÉ DIAMOND',
    subtitle: 'Costume Sur-Mesure Nuit & Broderies Or',
    description: 'Ensemble haute couture exclusif comprenant un blazer en velours de minuit brodé de fil d\'or, boutons de manchette sertis de diamants, montre en or et mocassins monogrammés.',
    specs: [
      { label: 'TAILLEUR', value: 'SUR-MESURE MILAN' },
      { label: 'TISSUS', value: 'VELOURS & OR PUR', color: 'text-amber-300' },
      { label: 'ACCESSOIRES', value: 'MONTRE & BOUTONS' },
      { label: 'STATUT RP', value: 'PRESTIGE MONDIAL' },
    ],
    actionLabel: 'Essayer le vestiaire',
    actionIcon: Shirt,
  },
};

const SPIN_DURATION_MS = 8200;
const SHOWCASE_ORDER = ['vehicle', 'chips', 'cash', 'mystery', 'clothing'] as const;

// Heavy ease-out: fast launch, long suspenseful crawl over the last pins
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

export const LuckyWheel: React.FC<LuckyWheelProps> = () => {
  const {
    user,
    isAuthenticated,
    claimWheelReward,
    canSpinWheel,
    timeUntilNextSpin,
    resetSpinCooldown,
  } = useCasinoUser();

  const { segments, podiumVehicle, economy, recordSpinEvent, logs } = useCasinoAdmin();

  // State
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [spinPhase, setSpinPhase] = useState<'idle' | 'spinning' | 'slowing' | 'won'>('idle');
  const [winningSegment, setWinningSegment] = useState<WheelSegmentConfig | null>(null);
  const [celebrationOpen, setCelebrationOpen] = useState<boolean>(false);
  const [activeModalKey, setActiveModalKey] = useState<string | null>(null);
  const [oddsModalOpen, setOddsModalOpen] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('diamond_wheel_sound_muted') === 'true';
    } catch {
      return false;
    }
  });

  const currentRotationRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const spinTimeoutsRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const rotorRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<SVGGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const numSegments = segments.length;
  const degreesPerSegment = 360 / numSegments;
  const palettes = useMemo(() => segmentPalettes(segments), [segments]);

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('diamond_wheel_sound_muted', String(next));
      } catch {
        // Storage unavailable
      }
      return next;
    });
  };

  // Web Audio Context initialization with immediate auto-unlock
  const getAudioContext = useCallback(() => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass) {
          audioCtxRef.current = new AudioCtxClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const unlock = () => {
      try {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      } catch {
        // Safe fallback
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      spinTimeoutsRef.current.forEach((t) => clearTimeout(t));
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [getAudioContext]);

  // Mechanical ratchet click (sharp transient + body resonance)
  const playRatchetTick = useCallback((volume = 0.08) => {
    if (isMuted) return;
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      const clickOsc = audioCtx.createOscillator();
      const clickGain = audioCtx.createGain();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(2400, now);
      clickOsc.frequency.exponentialRampToValueAtTime(300, now + 0.015);
      clickGain.gain.setValueAtTime(volume * 1.2, now);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);
      clickOsc.connect(clickGain);
      clickGain.connect(audioCtx.destination);
      clickOsc.start(now);
      clickOsc.stop(now + 0.02);

      const bodyOsc = audioCtx.createOscillator();
      const bodyGain = audioCtx.createGain();
      bodyOsc.type = 'sine';
      bodyOsc.frequency.setValueAtTime(260, now);
      bodyOsc.frequency.exponentialRampToValueAtTime(70, now + 0.035);
      bodyGain.gain.setValueAtTime(volume * 0.7, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
      bodyOsc.connect(bodyGain);
      bodyGain.connect(audioCtx.destination);
      bodyOsc.start(now);
      bodyOsc.stop(now + 0.04);
    } catch {
      // Audio not permitted
    }
  }, [isMuted, getAudioContext]);

  // Victory fanfare arpeggio
  const playVictoryFanfare = useCallback(() => {
    if (isMuted) return;
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        const start = audioCtx.currentTime + idx * 0.1;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.8);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + 0.85);
      });
    } catch {
      // Audio not permitted
    }
  }, [isMuted, getAudioContext]);

  // Engine rev when inspecting the supercar
  const playEngineRev = useCallback(() => {
    if (isMuted) return;
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      const now = audioCtx.currentTime;
      osc.frequency.setValueAtTime(75, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.4);
      osc.frequency.exponentialRampToValueAtTime(160, now + 1.1);
      osc.frequency.exponentialRampToValueAtTime(45, now + 2.0);
      gain.gain.setValueAtTime(0.005, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 2.1);
    } catch {
      // Audio not permitted
    }
  }, [isMuted, getAudioContext]);

  // Gold confetti burst for the celebration modal
  useEffect(() => {
    if (!celebrationOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const colors = ['#f5d27a', '#fbe7a6', '#d9a93e', '#ffffff', '#c42a3c', '#18925f'];
    const particles = Array.from({ length: 140 }).map(() => ({
      x: canvas.width / 2,
      y: canvas.height / 2 - 60,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 0.75) * 20,
      size: Math.random() * 7 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      rotation: Math.random() * 360,
      vRotation: (Math.random() - 0.5) * 12,
    }));

    let animId: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.36;
        p.vx *= 0.99;
        p.alpha -= 0.007;
        p.rotation += p.vRotation;
        if (p.alpha > 0) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6);
          ctx.restore();
        }
      });
      if (alive) animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [celebrationOpen]);

  // Recent winners (live admin logs, with a fallback showcase)
  const recentWinners = useMemo(() => {
    const wheelLogs = logs.filter((l) => l.category === 'WHEEL' && l.action.toLowerCase().includes('spin'));
    if (wheelLogs.length > 0) {
      return wheelLogs.slice(0, 8).map((log) => ({
        id: log.id,
        author: log.detail.split(' a obtenu')[0] || 'Citoyen VIP',
        prize: log.detail.split('a obtenu : ')[1]?.split(' (')[0] || "Lot d'exception",
        time: log.timestamp || 'Récemment',
      }));
    }
    return [
      { id: '1', author: 'Citoyen #1042', prize: 'Grotti Itali RSX', time: 'Il y a 12 min' },
      { id: '2', author: 'Marcus V.', prize: '50 000 Jetons Diamond', time: 'Il y a 34 min' },
      { id: '3', author: 'Dylan R.', prize: '$50 000 Cash', time: 'Il y a 1h' },
      { id: '4', author: 'Éléonore D.', prize: 'Coffre Mystère Diamond', time: 'Il y a 2h' },
      { id: '5', author: 'Lucas K.', prize: 'Pass High Roller', time: 'Il y a 3h' },
    ];
  }, [logs]);

  // Rarest prizes first for the "lots en jeu" board
  const rarestSegments = useMemo(
    () => segments.map((s, i) => ({ seg: s, palette: palettes[i] })).sort((a, b) => a.seg.dropRate - b.seg.dropRate),
    [segments, palettes],
  );
  const maxDropRate = useMemo(() => Math.max(...segments.map((s) => s.dropRate), 1), [segments]);

  const dropRateByType = useCallback(
    (type: string) => segments.filter((s) => s.type === type).reduce((acc, s) => acc + s.dropRate, 0),
    [segments],
  );

  // Flapper kick when a pin passes under it
  const kickPointer = (strength: number) => {
    const el = pointerRef.current;
    if (!el) return;
    el.style.transform = `rotate(${-(6 + strength * 20)}deg)`;
    window.setTimeout(() => {
      if (pointerRef.current) pointerRef.current.style.transform = 'rotate(0deg)';
    }, 55);
  };

  // Main spin handler
  const handleSpin = () => {
    if (economy.maintenanceMode) return;
    if (isSpinning || (!canSpinWheel && isAuthenticated)) return;

    const audioCtx = getAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

    setIsSpinning(true);
    setSpinPhase('spinning');
    setWinningSegment(null);

    // Weighted draw using admin-configured drop rates
    const totalWeight = segments.reduce((acc, s) => acc + (s.dropRate > 0 ? s.dropRate : 1), 0);
    let rand = Math.random() * totalWeight;
    let targetIndex = 0;
    for (let i = 0; i < segments.length; i++) {
      const w = segments[i].dropRate > 0 ? segments[i].dropRate : 1;
      if (rand < w) {
        targetIndex = i;
        break;
      }
      rand -= w;
    }
    const chosenSegment = segments[targetIndex];

    // Flapper sits at 12 o'clock: bring the chosen wedge's centre (± jitter) to 0°
    const fullSpins = 7 + Math.floor(Math.random() * 3);
    const jitter = (Math.random() - 0.5) * (degreesPerSegment * 0.6);
    const targetOffset = (360 - targetIndex * degreesPerSegment - degreesPerSegment / 2 + jitter + 360) % 360;
    const from = currentRotationRef.current;
    const baseRotation = Math.ceil(from / 360) * 360;
    const to = baseRotation + fullSpins * 360 + targetOffset;
    currentRotationRef.current = to;

    spinTimeoutsRef.current.forEach((t) => clearTimeout(t));
    spinTimeoutsRef.current = [];
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    // Frame-driven spin so every pin crossing clicks & kicks the flapper in sync
    const startTime = performance.now();
    let lastPin = Math.floor(from / degreesPerSegment);
    let lastTickAt = 0;
    let slowingFlagged = false;

    const frame = (now: number) => {
      const t = Math.min(1, (now - startTime) / SPIN_DURATION_MS);
      const angle = from + (to - from) * easeOutQuart(t);
      if (rotorRef.current) rotorRef.current.style.transform = `rotate(${angle}deg)`;

      const pin = Math.floor(angle / degreesPerSegment);
      if (pin !== lastPin) {
        lastPin = pin;
        const speed = Math.pow(1 - t, 3); // normalised angular speed
        if (now - lastTickAt > 40) {
          lastTickAt = now;
          playRatchetTick(0.03 + 0.06 * Math.min(1, speed * 2 + 0.3));
          kickPointer(Math.min(1, speed * 1.5 + 0.25));
        }
      }

      if (!slowingFlagged && t > 0.55) {
        slowingFlagged = true;
        setSpinPhase('slowing');
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      rafRef.current = null;
      setIsSpinning(false);
      setSpinPhase('won');
      setWinningSegment(chosenSegment);
      playVictoryFanfare();
      recordSpinEvent(chosenSegment, user ? `${user.rpFirstName} ${user.rpLastName}` : undefined);
      if (isAuthenticated) {
        claimWheelReward({ type: chosenSegment.type, value: chosenSegment.value, label: chosenSegment.label });
      }
      // Let the winning wedge glow under the flapper for a beat before the reveal
      spinTimeoutsRef.current.push(window.setTimeout(() => setCelebrationOpen(true), 900));
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  const winningAsset = useMemo(() => {
    if (!winningSegment) return null;
    return PRIZE_ASSETS[winningSegment.type] || PRIZE_ASSETS.mystery;
  }, [winningSegment]);

  const wheelMode: WheelMode = isSpinning ? 'spinning' : spinPhase === 'won' ? 'won' : 'idle';
  const spinLocked = economy.maintenanceMode || isSpinning || (!canSpinWheel && isAuthenticated);
  const userTierKey = user?.vipTier === 'DIAMOND' ? 'DIAMOND' : user?.vipTier === 'GOLD' ? 'GOLD' : 'CITIZEN';
  const isStaff = user?.role === 'DÉVELOPPEUR' || user?.role === 'DIRECTEUR CASINO';

  return (
    <div className="relative min-h-screen text-white pt-24 sm:pt-28 pb-24 overflow-hidden font-sans select-none bg-black">
      {/* ============================================================ */}
      {/* ATMOSPHERE                                                   */}
      {/* ============================================================ */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20 scale-105 blur-[2px]"
          style={{ backgroundImage: `url('/diamond_casino_hall.jpg')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/90 to-black" />
        <div className="absolute inset-0 deco-pattern opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
        {/* Stage spotlight */}
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[1100px] bg-[conic-gradient(from_180deg_at_50%_0%,transparent_160deg,rgba(255,225,150,0.10)_175deg,rgba(255,225,150,0.14)_180deg,rgba(255,225,150,0.10)_185deg,transparent_200deg)]" />
        <div className="absolute top-[30%] left-1/2 -translate-x-1/2 w-[760px] h-[760px] rounded-full bg-[#d9a93e]/10 blur-[160px]" />
        <div className="absolute top-1/3 -left-40 w-[500px] h-[500px] rounded-full bg-[#8e1424]/15 blur-[160px]" />
        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] rounded-full bg-[#0b6040]/15 blur-[160px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8">
        {economy.maintenanceMode && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center gap-3 text-amber-200 font-['Geist_Mono'] text-xs sm:text-sm text-center">
            <Lock size={16} className="shrink-0" />
            <span>MAINTENANCE EN COURS — La Roue est temporairement suspendue par la direction.</span>
          </div>
        )}

        {/* ============================================================ */}
        {/* HEADER                                                       */}
        {/* ============================================================ */}
        <header className="text-center mb-8 sm:mb-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="h-px w-10 sm:w-20 bg-gradient-to-r from-transparent to-[#d9a93e]" />
            <span className="font-cinzel text-[10px] sm:text-xs tracking-[0.45em] text-[#e2b54e] uppercase">
              The Diamond · Rotonde
            </span>
            <span className="h-px w-10 sm:w-20 bg-gradient-to-l from-transparent to-[#d9a93e]" />
          </div>
          <h1 className="font-cinzel font-black text-4xl sm:text-6xl lg:text-7xl tracking-wide leading-none">
            <span className="text-gold drop-shadow-[0_4px_30px_rgba(217,169,62,0.35)]">Roue de la Fortune</span>
          </h1>
          <p className="mt-4 text-neutral-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            Un tirage offert à chaque visite. Supercar du podium, mallettes de cash, jetons et trésors du coffre —
            <span className="text-[#f5d27a]"> chaque lancer est gagnant.</span>
          </p>
        </header>

        {/* ============================================================ */}
        {/* STAGE: session panel · wheel · prize board                   */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_300px] gap-8 xl:gap-10 items-start">
          {/* ---------- LEFT: player session ---------- */}
          <aside className="order-2 xl:order-1 deco-panel rounded-2xl p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="font-cinzel text-xs tracking-[0.3em] text-[#e2b54e]">VOTRE SESSION</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setOddsModalOpen(true)}
                  className="p-2 rounded-lg border border-white/10 text-neutral-400 hover:text-white hover:border-[#d9a93e]/50 transition-colors cursor-pointer"
                  title="Règlement & probabilités"
                  aria-label="Règlement et probabilités"
                >
                  <ScrollText size={15} />
                </button>
                <button
                  onClick={toggleMute}
                  className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                    isMuted ? 'border-white/10 text-neutral-500 hover:text-white' : 'border-[#d9a93e]/50 text-[#f5d27a] bg-[#d9a93e]/10'
                  }`}
                  title={isMuted ? 'Activer le son' : 'Couper le son'}
                  aria-label="Contrôle audio de la roue"
                >
                  {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
              </div>
            </div>

            {isAuthenticated && user ? (
              <>
                <div className="flex items-center gap-3">
                  <img src={user.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover ring-2 ring-[#d9a93e]/70" />
                  <div className="min-w-0">
                    <div className="font-semibold truncate">
                      {user.rpFirstName} {user.rpLastName}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-['Geist_Mono'] text-[#e2b54e] uppercase tracking-wider">
                      <Crown size={11} />
                      <span className="truncate">{user.role}</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-black/50 border border-[#d9a93e]/20 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 font-['Geist_Mono'] uppercase">
                      <Coins size={11} className="text-[#e2b54e]" /> Jetons
                    </div>
                    <div className="mt-1 font-['Geist_Mono'] font-bold text-[#f5d27a] tabular-nums">
                      {(user.chips || 0).toLocaleString('fr-FR')}
                    </div>
                  </div>
                  <div className="rounded-xl bg-black/50 border border-emerald-500/20 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 font-['Geist_Mono'] uppercase">
                      <DollarSign size={11} className="text-emerald-400" /> Cash
                    </div>
                    <div className="mt-1 font-['Geist_Mono'] font-bold text-emerald-400 tabular-nums">
                      ${(user.cash || 0).toLocaleString('fr-FR')}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-[#d9a93e]/30 p-4 text-center">
                <p className="text-sm text-neutral-300 mb-3">
                  Mode démonstration. Connectez votre profil citoyen pour encaisser vos gains en jeu.
                </p>
                <Link
                  to="/espace-membre"
                  className="btn-gold inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
                >
                  Connexion citoyen <ChevronRight size={14} />
                </Link>
              </div>
            )}

            <div className="gold-rule" />

            {/* Spin cadence by tier */}
            <div>
              <div className="text-[11px] font-['Geist_Mono'] uppercase tracking-wider text-neutral-500 mb-2.5">
                Cadence des tirages
              </div>
              <ul className="space-y-1.5">
                {[
                  { key: 'DIAMOND', label: 'Diamond VIP', value: 'toutes les 8 h' },
                  { key: 'GOLD', label: 'Gold VIP', value: 'toutes les 12 h' },
                  { key: 'CITIZEN', label: 'Citoyen', value: 'toutes les 24 h' },
                ].map((tier) => {
                  const active = isAuthenticated && tier.key === userTierKey;
                  return (
                    <li
                      key={tier.key}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs border ${
                        active ? 'border-[#d9a93e]/60 bg-[#d9a93e]/10 text-[#fbe7a6]' : 'border-white/5 text-neutral-400'
                      }`}
                    >
                      <span className="font-semibold">{tier.label}</span>
                      <span className="font-['Geist_Mono']">{tier.value}</span>
                    </li>
                  );
                })}
              </ul>
              <Link
                to="/abonnements"
                className="mt-3 inline-flex items-center gap-1 text-xs text-[#e2b54e] hover:text-[#fbe7a6] transition-colors"
              >
                Réduire mon délai avec un pass VIP <ChevronRight size={13} />
              </Link>
            </div>

            {isStaff && (
              <>
                <div className="gold-rule" />
                <div className="flex flex-wrap gap-2">
                  {!canSpinWheel && (
                    <button
                      onClick={resetSpinCooldown}
                      className="px-3 py-1.5 rounded-lg bg-black/60 hover:bg-neutral-900 border border-white/10 text-[11px] font-['Geist_Mono'] text-[#f5d27a] flex items-center gap-1.5 cursor-pointer transition-colors"
                      title="Réinitialise le délai pour tester le tirage immédiatement"
                    >
                      <RotateCcw size={12} /> Reset timer
                    </button>
                  )}
                  <Link
                    to="/admin"
                    className="px-3 py-1.5 rounded-lg bg-black/60 hover:bg-neutral-900 border border-white/10 text-[11px] font-['Geist_Mono'] text-neutral-400 hover:text-white flex items-center gap-1.5 transition-colors"
                  >
                    <SlidersHorizontal size={12} /> Console admin
                  </Link>
                </div>
              </>
            )}
          </aside>

          {/* ---------- CENTRE: the wheel on its pedestal ---------- */}
          <section className="order-1 xl:order-2 flex flex-col items-center">
            <div className="relative w-full max-w-[560px]">
              <div className="absolute inset-[6%] rounded-full bg-[#d9a93e]/20 blur-3xl" aria-hidden="true" />
              <FortuneWheel
                ref={rotorRef}
                segments={segments}
                rotation={currentRotationRef.current}
                mode={wheelMode}
                pointerRef={pointerRef}
                className="w-full drop-shadow-[0_40px_60px_rgba(0,0,0,0.9)]"
              />
            </div>

            {/* Pedestal */}
            <div className="relative -mt-3 w-[46%] max-w-[240px] h-10 rounded-b-[40%] bg-gradient-to-b from-[#8a5c14] via-[#3b2606] to-[#120c03] border-x border-b border-[#d9a93e]/40 shadow-[0_20px_40px_rgba(0,0,0,0.9)]" aria-hidden="true" />
            <div className="w-[70%] max-w-[380px] h-4 -mt-1 rounded-[50%] bg-black/80 blur-md" aria-hidden="true" />

            {/* Spin control */}
            <div className="mt-6 w-full max-w-sm flex flex-col items-center gap-3">
              <button
                onClick={handleSpin}
                disabled={spinLocked}
                className={`group relative w-full h-16 rounded-full font-cinzel font-black text-lg tracking-[0.25em] uppercase transition-all duration-300 flex items-center justify-center gap-3 ${
                  spinLocked
                    ? 'bg-neutral-950 border border-[#d9a93e]/25 text-neutral-500 cursor-not-allowed'
                    : 'btn-gold cursor-pointer hover:scale-[1.02] active:scale-[0.98]'
                }`}
              >
                {economy.maintenanceMode ? (
                  <>
                    <Lock size={18} /> <span className="text-sm tracking-[0.2em]">En maintenance</span>
                  </>
                ) : isSpinning ? (
                  <span className="text-sm tracking-[0.3em] text-[#e2b54e] animate-pulse">
                    {spinPhase === 'slowing' ? 'Rien ne va plus…' : 'La roue tourne…'}
                  </span>
                ) : !canSpinWheel && isAuthenticated ? (
                  <>
                    <Clock size={18} className="text-[#e2b54e]" />
                    <span className="text-sm tracking-[0.15em] text-neutral-300 font-['Geist_Mono'] normal-case">
                      Prochain tirage dans {timeUntilNextSpin}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles size={20} />
                    <span>Tourner</span>
                  </>
                )}
                {!spinLocked && (
                  <span className="absolute inset-0 rounded-full ring-2 ring-[#fbe7a6]/50 animate-ping opacity-30 pointer-events-none" />
                )}
              </button>
              <p className="text-[11px] text-neutral-500 font-['Geist_Mono'] text-center">
                {isAuthenticated
                  ? canSpinWheel
                    ? 'Tirage gratuit disponible — bonne chance.'
                    : 'Votre tirage se recharge. Revenez à la fin du compte à rebours.'
                  : 'Démo libre : les gains ne sont pas crédités sans connexion.'}
              </p>
            </div>
          </section>

          {/* ---------- RIGHT: prize board ---------- */}
          <aside className="order-3 deco-panel rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-cinzel text-xs tracking-[0.3em] text-[#e2b54e]">LOTS EN JEU</span>
              <span className="text-[10px] font-['Geist_Mono'] text-neutral-500">{numSegments} cases</span>
            </div>
            <ul className="space-y-2">
              {rarestSegments.slice(0, 7).map(({ seg, palette }) => {
                const Icon = segmentIcon(seg);
                return (
                  <li key={seg.id} className="flex items-center gap-3">
                    <span
                      className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border border-[#d9a93e]/40"
                      style={paletteSwatch(palette)}
                    >
                      <Icon size={15} className={palette === 'gold' ? 'text-[#1d1303]' : 'text-[#f5d27a]'} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate">{seg.label}</span>
                        <span className="text-[11px] font-['Geist_Mono'] text-[#f5d27a] tabular-nums">{seg.dropRate}%</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#8a5c14] to-[#f5d27a]"
                          style={{ width: `${Math.max(4, (seg.dropRate / maxDropRate) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              onClick={() => setOddsModalOpen(true)}
              className="mt-4 w-full py-2.5 rounded-lg border border-[#d9a93e]/30 text-xs text-[#f5d27a] hover:bg-[#d9a93e]/10 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              Voir les {numSegments} lots & probabilités <ChevronRight size={13} />
            </button>
          </aside>
        </div>

        {/* ============================================================ */}
        {/* WINNERS TICKER                                               */}
        {/* ============================================================ */}
        <div className="mt-14 relative overflow-hidden rounded-full border border-[#d9a93e]/25 bg-black/60 backdrop-blur py-3">
          <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center">
            <div className="h-full flex items-center gap-2 pl-5 pr-3 bg-black">
              <span className="w-2 h-2 rounded-full bg-[#c42a3c] animate-pulse" />
              <span className="font-cinzel text-[11px] tracking-[0.25em] text-[#e2b54e]">GAGNANTS</span>
            </div>
            <div className="h-full w-10 bg-gradient-to-r from-black to-transparent" />
          </div>
          <div className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-black to-transparent" />
          <div className="marquee-track flex w-max gap-10 pl-40 text-xs whitespace-nowrap">
            {[...recentWinners, ...recentWinners].map((win, idx) => (
              <span key={`${win.id}-${idx}`} className="inline-flex items-center gap-2 text-neutral-300">
                <span className="font-semibold text-white">{win.author}</span>
                <span className="text-[#d9a93e]">◆</span>
                <span className="text-[#fbe7a6]">{win.prize}</span>
                <span className="text-neutral-600 font-['Geist_Mono'] text-[10px]">{win.time}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ============================================================ */}
        {/* PRIZE SHOWCASE                                               */}
        {/* ============================================================ */}
        <section className="mt-20">
          <div className="text-center mb-10">
            <span className="font-cinzel text-xs tracking-[0.4em] text-[#e2b54e]">LA VITRINE</span>
            <h2 className="mt-2 font-cinzel font-bold text-3xl sm:text-4xl text-gold">Ce que la roue réserve</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-5">
            {SHOWCASE_ORDER.map((key, idx) => {
              const asset = PRIZE_ASSETS[key];
              const isHero = idx === 0;
              const title = key === 'vehicle' ? podiumVehicle.name : asset.title;
              const image = key === 'vehicle' ? podiumVehicle.imageUrl || asset.image : asset.image;
              return (
                <button
                  key={key}
                  onClick={() => {
                    setActiveModalKey(key);
                    if (key === 'vehicle') playEngineRev();
                  }}
                  className={`group relative text-left rounded-2xl overflow-hidden border border-[#d9a93e]/25 hover:border-[#d9a93e]/70 transition-all duration-500 cursor-pointer bg-neutral-950 ${
                    isHero
                      ? 'sm:col-span-2 lg:col-span-4 lg:row-span-2 min-h-[320px] lg:min-h-[480px]'
                      : idx >= 3
                        ? 'lg:col-span-3 min-h-[230px]'
                        : 'lg:col-span-2 min-h-[230px]'
                  }`}
                >
                  <img
                    src={image}
                    alt={title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1200ms] group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                  <div className="absolute top-4 left-4 px-2.5 py-1 rounded-full bg-black/70 border border-[#d9a93e]/40 text-[10px] font-['Geist_Mono'] text-[#f5d27a] tracking-wider">
                    {dropRateByType(key).toFixed(1)}% de chance
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
                    <div className="text-[10px] font-['Geist_Mono'] tracking-[0.2em] text-[#e2b54e] uppercase mb-1">
                      {asset.category}
                    </div>
                    <h3 className={`font-cinzel font-bold text-white ${isHero ? 'text-2xl sm:text-4xl' : 'text-lg sm:text-xl'}`}>
                      {title}
                    </h3>
                    {isHero && <p className="mt-2 text-sm text-neutral-300 max-w-lg line-clamp-2">{asset.description}</p>}
                    <span className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#fbe7a6] opacity-80 group-hover:opacity-100 transition-opacity">
                      <Eye size={13} /> Inspecter
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Cross-link to the games lobby */}
        <Link
          to="/jeux"
          className="mt-16 group flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl felt border border-[#d9a93e]/30 p-6 sm:p-8 hover:border-[#d9a93e]/70 transition-colors"
        >
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 rounded-full btn-gold flex items-center justify-center">
              <Dices size={22} />
            </span>
            <div>
              <div className="font-cinzel font-bold text-xl text-white">Les salons de jeux vous attendent</div>
              <div className="text-sm text-emerald-100/70">Blackjack, roulette, poker, machines à sous et Inside Track.</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 font-cinzel text-sm tracking-[0.2em] text-[#f5d27a] group-hover:translate-x-1 transition-transform">
            VOIR LES JEUX <ChevronRight size={16} />
          </span>
        </Link>
      </div>

      {/* ============================================================ */}
      {/* CELEBRATION MODAL                                            */}
      {/* ============================================================ */}
      <AnimatePresence>
        {celebrationOpen && winningSegment && winningAsset && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />
            <div className="absolute w-[700px] h-[700px] rounded-full bg-[conic-gradient(from_0deg,transparent,rgba(245,210,122,0.18),transparent_30%,rgba(245,210,122,0.18),transparent_60%,rgba(245,210,122,0.18),transparent_90%)] slow-spin pointer-events-none" />

            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 18, stiffness: 180 }}
              className="relative z-20 w-full max-w-lg deco-panel rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center overflow-hidden"
            >
              <button
                onClick={() => setCelebrationOpen(false)}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>

              <span className="font-cinzel text-xs tracking-[0.4em] text-[#e2b54e]">FÉLICITATIONS</span>
              <h3 className="mt-2 font-cinzel font-black text-3xl sm:text-4xl text-gold leading-tight">{winningSegment.label}</h3>

              <div className="relative w-full h-48 rounded-2xl overflow-hidden border border-[#d9a93e]/50 my-5">
                <img
                  src={winningSegment.type === 'vehicle' ? podiumVehicle.imageUrl || winningAsset.image : winningAsset.image}
                  alt={winningSegment.label}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full bg-black/80 border border-[#d9a93e]/40 text-[#f5d27a] font-['Geist_Mono'] text-[10px]">
                  {winningAsset.category}
                </div>
              </div>

              <p className="text-sm text-neutral-300 mb-6 max-w-sm leading-relaxed">
                {winningSegment.type === 'vehicle' &&
                  `Vous remportez la ${podiumVehicle.name} ! Les clés et la carte grise vous attendent au garage du Penthouse.`}
                {winningSegment.type === 'chips' &&
                  `${Number(winningSegment.value).toLocaleString('fr-FR')} jetons Diamond ont été crédités sur votre solde.`}
                {winningSegment.type === 'cash' &&
                  `$${Number(winningSegment.value).toLocaleString('fr-FR')} ont été transférés sur votre compte bancaire RP.`}
                {winningSegment.type === 'mystery' && `Le coffre s'ouvre et révèle un trésor rare : ${winningSegment.value}.`}
                {winningSegment.type === 'clothing' && `Une pièce de haute couture rejoint votre garde-robe : ${winningSegment.value}.`}
                {!isAuthenticated && (
                  <span className="block mt-2 text-[#e2b54e] text-xs">Mode démo — connectez-vous pour encaisser vos prochains gains.</span>
                )}
              </p>

              <div className="w-full flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setCelebrationOpen(false)}
                  className="flex-1 py-3.5 px-6 rounded-full btn-gold font-cinzel font-bold text-sm tracking-[0.2em] uppercase cursor-pointer"
                >
                  Encaisser
                </button>
                <Link
                  to="/espace-membre"
                  className="py-3.5 px-6 rounded-full border border-[#d9a93e]/40 text-[#fbe7a6] hover:bg-[#d9a93e]/10 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                >
                  Espace membre <ExternalLink size={13} />
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* PRIZE INSPECTION MODAL                                       */}
      {/* ============================================================ */}
      <AnimatePresence>
        {activeModalKey && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveModalKey(null)}
          >
            {(() => {
              const modalData = PRIZE_ASSETS[activeModalKey] || PRIZE_ASSETS.vehicle;
              const ActionIcon = modalData.actionIcon;
              return (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  onClick={(e) => e.stopPropagation()}
                  className="relative w-full max-w-4xl deco-panel rounded-3xl overflow-hidden max-h-[90vh] overflow-y-auto grid md:grid-cols-2"
                >
                  <button
                    onClick={() => setActiveModalKey(null)}
                    className="absolute top-4 right-4 p-2 rounded-full bg-black/60 hover:bg-black/90 text-neutral-300 hover:text-white transition-colors cursor-pointer z-20"
                    aria-label="Fermer"
                  >
                    <X size={18} />
                  </button>

                  <div className="relative min-h-[260px]">
                    <img
                      src={activeModalKey === 'vehicle' ? podiumVehicle.imageUrl || modalData.image : modalData.image}
                      alt={modalData.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-transparent via-transparent to-black/60" />
                    <button
                      onClick={() => {
                        if (activeModalKey === 'vehicle') playEngineRev();
                        else playRatchetTick(0.15);
                      }}
                      className="absolute bottom-4 left-4 px-4 py-2 rounded-full btn-gold text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
                    >
                      <ActionIcon size={14} /> {modalData.actionLabel}
                    </button>
                  </div>

                  <div className="p-6 sm:p-8 flex flex-col">
                    <div className="flex items-center gap-2 mb-2 font-['Geist_Mono'] text-[11px] text-[#e2b54e] tracking-wider">
                      <ShieldCheck size={14} /> {modalData.category}
                    </div>
                    <h2 className="font-cinzel font-bold text-3xl text-white mb-1">
                      {activeModalKey === 'vehicle' ? podiumVehicle.name : modalData.title}
                    </h2>
                    <p className="text-xs text-neutral-500 mb-5 font-['Geist_Mono']">{modalData.subtitle}</p>
                    <p className="text-sm text-neutral-300 leading-relaxed mb-6">{modalData.description}</p>

                    <dl className="grid grid-cols-2 gap-2 mb-6">
                      {modalData.specs.map((spec) => (
                        <div key={spec.label} className="p-3 rounded-xl bg-black/50 border border-[#d9a93e]/15">
                          <dt className="text-[10px] text-neutral-500 font-['Geist_Mono'] uppercase">{spec.label}</dt>
                          <dd className={`text-xs font-bold font-['Geist_Mono'] ${spec.color || 'text-white'}`}>{spec.value}</dd>
                        </div>
                      ))}
                    </dl>

                    <button
                      onClick={() => setActiveModalKey(null)}
                      className="mt-auto w-full py-3 rounded-full border border-[#d9a93e]/40 text-[#fbe7a6] hover:bg-[#d9a93e]/10 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Retour à la roue
                    </button>
                  </div>
                </motion.div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* ODDS & RULES MODAL                                           */}
      {/* ============================================================ */}
      <AnimatePresence>
        {oddsModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOddsModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl max-h-[85vh] deco-panel rounded-3xl p-6 sm:p-8 flex flex-col overflow-hidden"
            >
              <button
                onClick={() => setOddsModalOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-neutral-400 hover:text-white transition-colors cursor-pointer z-10"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>

              <span className="font-cinzel text-xs tracking-[0.35em] text-[#e2b54e]">RÈGLEMENT OFFICIEL</span>
              <h2 className="mt-1 font-cinzel font-bold text-2xl text-white">Probabilités & dotations</h2>
              <p className="mt-2 text-xs text-neutral-400">
                Chaque case est tirée selon les taux configurés par la direction du Diamond Casino. Un tirage gratuit par période de
                recharge, selon votre statut.
              </p>

              <div className="overflow-y-auto mt-5 pr-1 grid sm:grid-cols-2 gap-2">
                {segments.map((seg, i) => {
                  const Icon = segmentIcon(seg);
                  return (
                    <div key={seg.id} className="p-3 rounded-xl bg-black/50 border border-white/5 flex items-center gap-3">
                      <span
                        className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center border border-[#d9a93e]/40"
                        style={paletteSwatch(palettes[i])}
                      >
                        <Icon size={16} className={palettes[i] === 'gold' ? 'text-[#1d1303]' : 'text-[#f5d27a]'} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white truncate">{seg.label}</div>
                        <div className="text-[10px] text-neutral-500 font-['Geist_Mono'] truncate">{String(seg.value)}</div>
                      </div>
                      <span className="font-['Geist_Mono'] text-sm font-bold text-[#f5d27a] tabular-nums">{seg.dropRate}%</span>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setOddsModalOpen(false)}
                className="mt-5 w-full py-3 rounded-full btn-gold font-cinzel font-bold text-sm tracking-[0.2em] uppercase cursor-pointer"
              >
                Fermer
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
