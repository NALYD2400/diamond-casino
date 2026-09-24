import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import { 
  Trophy, 
  Sparkles, 
  Clock, 
  Coins, 
  DollarSign, 
  Gift, 
  Car, 
  RotateCcw, 
  SlidersHorizontal, 
  Volume2, 
  VolumeX, 
  Eye, 
  X, 
  Flame, 
  ShieldCheck, 
  CheckCircle2, 
  Info, 
  ExternalLink, 
  Zap,
  Shirt,
  Disc,
  Award,
  Play,
  ArrowRight
} from 'lucide-react';
import { useCasinoUser } from '../context/CasinoUserContext';
import { useCasinoAdmin, type WheelSegmentConfig } from '../context/CasinoAdminContext';

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

export const LuckyWheel: React.FC<LuckyWheelProps> = () => {
  const { 
    user, 
    isAuthenticated, 
    claimWheelReward, 
    canSpinWheel, 
    timeUntilNextSpin, 
    resetSpinCooldown 
  } = useCasinoUser();

  const {
    segments,
    podiumVehicle,
    economy,
    recordSpinEvent,
    logs,
  } = useCasinoAdmin();

  // State
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [spinPhase, setSpinPhase] = useState<'idle' | 'spinning' | 'slowing' | 'won'>('idle');
  const [rotationDegrees, setRotationDegrees] = useState<number>(0);
  const [winningSegment, setWinningSegment] = useState<WheelSegmentConfig | null>(null);
  const [celebrationOpen, setCelebrationOpen] = useState<boolean>(false);
  const [activeModalKey, setActiveModalKey] = useState<string | null>(null);
  const [oddsModalOpen, setOddsModalOpen] = useState<boolean>(false);
  const [selectedShowcaseTab, setSelectedShowcaseTab] = useState<string>('vehicle');
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return localStorage.getItem('diamond_wheel_sound_muted') === 'true';
  });

  const currentRotationRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const spinTimeoutsRef = useRef<number[]>([]);
  const needleRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const numSegments = segments.length;
  const degreesPerSegment = 360 / numSegments;

  // Persist sound preference
  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem('diamond_wheel_sound_muted', String(next));
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

  // Eagerly unlock audio on any first user touch/click
  useEffect(() => {
    const unlock = () => {
      try {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
      } catch {
        // Safe fallback
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      spinTimeoutsRef.current.forEach((t) => clearTimeout(t));
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [getAudioContext]);

  // Authentic mechanical ratchet click (dual tone: sharp transient click + wood/metal body resonance)
  const playRatchetTick = useCallback((volume = 0.08) => {
    if (isMuted) return;
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      // 1. Sharp high-frequency transient click
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

      // 2. Low metallic/wood body resonance
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

  // Luxury Casino Victory Fanfare chime
  const playVictoryFanfare = useCallback(() => {
    if (isMuted) return;
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      // Grand Arpeggio chords: C5, E5, G5, C6 with warm reverb decay
      const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
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

  // Engine rev sound effect when inspecting the supercar
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

  // Particle explosion for celebration modal
  useEffect(() => {
    if (!celebrationOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const colors = ['#f59e0b', '#fbbf24', '#ffffff', '#a855f7', '#06b6d4', '#10b981', '#ec4899', '#ffd700'];
    const particles = Array.from({ length: 110 }).map(() => ({
      x: canvas.width / 2,
      y: canvas.height / 2 - 40,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.7) * 18,
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
        p.vy += 0.38; // gravity
        p.alpha -= 0.008;
        p.rotation += p.vRotation;

        if (p.alpha > 0) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
          ctx.restore();
        }
      });

      if (alive) {
        animId = requestAnimationFrame(render);
      }
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [celebrationOpen]);

  // Recent winners list
  const recentWinners = useMemo(() => {
    const wheelLogs = logs.filter((l) => l.category === 'WHEEL' && l.action.toLowerCase().includes('spin'));
    if (wheelLogs.length > 0) {
      return wheelLogs.slice(0, 6).map((log) => ({
        id: log.id,
        author: log.detail.split(' a obtenu')[0] || 'Citoyen VIP',
        prize: log.detail.split('a obtenu : ')[1]?.split(' (')[0] || 'Lot d\'exception',
        time: log.timestamp || 'Récemment',
      }));
    }
    return [
      { id: '1', author: 'Citoyen #1042', prize: 'Grotti Itali RSX (Véhicule Podium)', time: 'Il y a 12 min' },
      { id: '2', author: 'Marcus V.', prize: '50 000 Jetons Diamond', time: 'Il y a 34 min' },
      { id: '3', author: 'Dylan R.', prize: '$50 000 Cash Portefeuille', time: 'Il y a 1h' },
      { id: '4', author: 'Éléonore D.', prize: 'Coffre Mystère Diamond', time: 'Il y a 2h' },
      { id: '5', author: 'Lucas K.', prize: 'Pass High Roller Salon VIP', time: 'Il y a 3h' },
    ];
  }, [logs]);

  // Main spin handler
  const handleSpin = () => {
    if (economy.maintenanceMode) return;
    if (isSpinning || (!canSpinWheel && isAuthenticated)) return;

    // Immediately unlock audio context in the user event handler
    const audioCtx = getAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    playRatchetTick(0.12);

    setIsSpinning(true);
    setSpinPhase('spinning');
    setWinningSegment(null);

    // Pick target index using drop rate weights from Admin config
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

    // Compute target angle (top needle at 12 o'clock / 0 deg)
    const fullSpins = 6 + Math.floor(Math.random() * 3); // 6 to 8 full rotations
    // Small random organic jitter within the winning segment (±20% of segment width)
    const jitter = (Math.random() - 0.5) * (degreesPerSegment * 0.4);
    const targetSegmentOffset = (360 - (targetIndex * degreesPerSegment) - (degreesPerSegment / 2) + jitter) % 360;
    
    const baseRotation = Math.ceil(currentRotationRef.current / 360) * 360;
    const finalRotation = baseRotation + (fullSpins * 360) + targetSegmentOffset;

    currentRotationRef.current = finalRotation;
    setRotationDegrees(finalRotation);

    // Clear prior timeouts
    spinTimeoutsRef.current.forEach((t) => clearTimeout(t));
    spinTimeoutsRef.current = [];

    // Realistic mechanical ratcheting tick delays over 7000ms
    const tickDelays = [
      70, 140, 210, 280, 350, 420, 490, 560, 640, 720, 810, 910, 1020, 1140,
      1280, 1430, 1600, 1800, 2030, 2300, 2620, 3000, 3450, 4000, 4650, 5400,
      6100, 6600, 6900
    ];

    tickDelays.forEach((delay, idx) => {
      const tid = window.setTimeout(() => {
        const progress = idx / tickDelays.length;
        const vol = Math.max(0.02, 0.08 * (1 - progress * 0.4));
        playRatchetTick(vol);

        // Needle deflection directly via DOM manipulation (zero React re-renders)
        if (needleRef.current) {
          const wobble = idx % 2 === 0 ? 12 : -9;
          needleRef.current.style.transform = `rotate(${wobble}deg)`;
          window.setTimeout(() => {
            if (needleRef.current) {
              needleRef.current.style.transform = 'rotate(0deg)';
            }
          }, 35);
        }

        if (delay >= 4000) {
          setSpinPhase((prev) => (prev === 'spinning' ? 'slowing' : prev));
        }
      }, delay);
      spinTimeoutsRef.current.push(tid);
    });

    // Complete spin after 7150ms
    const completeTid = window.setTimeout(() => {
      setIsSpinning(false);
      setSpinPhase('won');
      setWinningSegment(chosenSegment);
      setCelebrationOpen(true);
      playVictoryFanfare();

      // Record event in admin logs
      recordSpinEvent(chosenSegment, user ? `${user.rpFirstName} ${user.rpLastName}` : undefined);

      if (isAuthenticated) {
        claimWheelReward({
          type: chosenSegment.type,
          value: chosenSegment.value,
          label: chosenSegment.label,
        });
      }
    }, 7150);
    spinTimeoutsRef.current.push(completeTid);
  };

  // Resolved winning asset
  const winningAsset = useMemo(() => {
    if (!winningSegment) return null;
    return PRIZE_ASSETS[winningSegment.type] || PRIZE_ASSETS.mystery;
  }, [winningSegment]);

  // Current active showcase data
  const currentShowcase = PRIZE_ASSETS[selectedShowcaseTab] || PRIZE_ASSETS.vehicle;

  return (
    <div className="relative min-h-screen bg-black text-white pt-24 sm:pt-32 pb-24 px-4 sm:px-8 overflow-hidden font-sans select-none">
      
      {/* Dynamic Keyframes for High-Performance CSS Chase Animation */}
      <style>{`
        @keyframes bulbChase {
          0%, 100% {
            opacity: 0.35;
            transform: translate(-50%, -50%) scale(0.9);
            box-shadow: 0 0 4px rgba(245, 158, 11, 0.4);
          }
          50% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.35);
            background-color: #ffffff !important;
            box-shadow: 0 0 16px 4px rgba(255, 255, 255, 0.95), 0 0 24px rgba(245, 158, 11, 0.9);
          }
        }
        @keyframes bulbGentleGlow {
          0%, 100% {
            opacity: 0.6;
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.15);
            box-shadow: 0 0 10px 2px rgba(251, 191, 36, 0.8);
          }
        }
      `}</style>

      {/* ============================================================ */}
      {/* 1. ATMOSPHERIC CASINO HALL BACKGROUND & LIGHTING             */}
      {/* ============================================================ */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Real AI-generated Diamond Casino Hall ambient backdrop */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-35 mix-blend-screen scale-105 filter blur-[0.5px]"
          style={{ backgroundImage: `url('/diamond_casino_hall.jpg')` }}
        />
        {/* Luxury gradient vignettes */}
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/80 to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/15 via-transparent to-transparent" />
        
        {/* Dynamic ambient neon glow spots */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-amber-500/[0.08] rounded-full blur-[180px]" />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-purple-600/[0.06] rounded-full blur-[150px]" />
        <div className="absolute top-1/2 right-1/4 w-[450px] h-[450px] bg-yellow-400/[0.05] rounded-full blur-[160px]" />
      </div>

      <div className="relative max-w-7xl mx-auto z-10">

        {/* Maintenance Banner */}
        {economy.maintenanceMode && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center gap-3 text-amber-300 font-['Geist_Mono'] text-xs sm:text-sm text-center shadow-[0_0_30px_rgba(245,158,11,0.2)]">
            <span className="text-xl">⚠️</span>
            <span>MAINTENANCE DU DIAMOND CASINO EN COURS // Les machines et la Roue sont temporairement suspendues par la direction générale.</span>
          </div>
        )}

        {/* ============================================================ */}
        {/* 2. VIP TOP BAR (Player Balance, Sound Toggle, Live Clock)     */}
        {/* ============================================================ */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 p-3.5 sm:p-4 rounded-2xl bg-neutral-950/85 border border-white/10 backdrop-blur-xl shadow-2xl">
          
          {/* Left: Casino Brand Tag */}
          <div className="flex items-center gap-3">
            <img 
              src="/diamond_casino_logo.png" 
              alt="Diamond Casino" 
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain drop-shadow-[0_0_12px_rgba(255,215,0,0.5)]" 
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-['Geist_Mono'] tracking-widest text-amber-400 uppercase font-bold">
                  The Diamond Casino &amp; Resort
                </span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <span className="text-xs text-neutral-400 font-medium hidden sm:inline-block">
                Rotonde Officielle de la Roue de la Fortune • Los Santos, San Andreas
              </span>
            </div>
          </div>

          {/* Right: Balances & Audio Controls */}
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            {isAuthenticated && user ? (
              <>
                {/* Chips Balance */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-amber-500/30 font-['Geist_Mono'] text-xs">
                  <Coins size={14} className="text-amber-400" />
                  <span className="text-neutral-400 hidden sm:inline">JETONS:</span>
                  <span className="font-bold text-amber-300">{(user.chips || 0).toLocaleString()}</span>
                </div>

                {/* Cash Balance */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-emerald-500/30 font-['Geist_Mono'] text-xs">
                  <DollarSign size={14} className="text-emerald-400" />
                  <span className="text-neutral-400 hidden sm:inline">CASH:</span>
                  <span className="font-bold text-emerald-400">${(user.cash || 0).toLocaleString()}</span>
                </div>

                {/* VIP Role Badge */}
                <div className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-['Geist_Mono'] text-[11px] font-bold uppercase tracking-wider hidden md:flex items-center gap-1.5">
                  <ShieldCheck size={13} />
                  <span>{user.role}</span>
                </div>
              </>
            ) : (
              <Link
                to="/espace-membre"
                className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-['Geist_Mono'] transition-colors flex items-center gap-1.5"
              >
                <span>Connexion Citoyen RP</span>
                <ExternalLink size={12} />
              </Link>
            )}

            {/* Odds Table Modal Trigger */}
            <button
              onClick={() => setOddsModalOpen(true)}
              className="p-2 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 border border-white/10 text-neutral-300 hover:text-white transition-colors cursor-pointer"
              title="Tableau des probabilités des 16 lots"
              aria-label="Tableau des probabilités"
            >
              <Info size={16} />
            </button>

            {/* Sound Toggle */}
            <button
              onClick={toggleMute}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                isMuted 
                  ? 'bg-neutral-900 border-white/10 text-neutral-500 hover:text-white' 
                  : 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
              }`}
              title={isMuted ? 'Activer le son' : 'Couper le son'}
              aria-label="Contrôle audio de la roue"
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 3. HEADLINE & LIVE RECENT WINNERS MARQUEE                     */}
        {/* ============================================================ */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-['Geist_Mono'] text-xs font-semibold uppercase tracking-widest mb-3">
            <Sparkles size={13} className="text-amber-400" />
            <span>Tirage Quotidien Garanti 100% Gagnant</span>
          </div>
          
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-3">
            La Roue de la <span className="font-['Instrument_Serif'] font-normal italic text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500">Fortune</span>
          </h1>
          
          <p className="text-neutral-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Chaque citoyen bénéficie d'un tirage gratuit toutes les 24 heures (cooldown réduit à 12h pour Gold et 8h pour Diamond VIP).
            Tentez de remporter le prestigieux bolide sur le podium, des liasses de cash liquide ou jusqu'à 50 000 jetons.
          </p>

          {/* Marquee Ticker */}
          <div className="mt-5 max-w-4xl mx-auto overflow-hidden rounded-xl bg-neutral-950/70 border border-white/10 py-2 px-4 backdrop-blur-md">
            <div className="flex items-center gap-4 text-xs font-['Geist_Mono']">
              <span className="flex items-center gap-1.5 text-amber-400 uppercase font-bold tracking-wider shrink-0">
                <Flame size={14} className="text-amber-400" />
                <span>DERNIERS GAGNANTS :</span>
              </span>
              <div className="flex items-center gap-6 overflow-x-auto no-scrollbar scroll-smooth whitespace-nowrap text-neutral-300">
                {recentWinners.map((win) => (
                  <span key={win.id} className="inline-flex items-center gap-1.5 text-neutral-300 shrink-0">
                    <span className="text-white font-semibold">{win.author}</span>
                    <span className="text-amber-400">➔</span>
                    <span className="text-amber-200">{win.prize}</span>
                    <span className="text-neutral-400 text-[10px]">({win.time})</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 4. MAIN INTERACTIVE SECTION: THE WHEEL & SHOWCASE CARDS       */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          
          {/* ---------------------------------------------------------- */}
          {/* LEFT: THE INTERACTIVE WHEEL & MECHANICS                    */}
          {/* ---------------------------------------------------------- */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center relative">
            
            {/* Ambient Wheel Stand Background Glow */}
            <div className="absolute w-[380px] h-[380px] sm:w-[500px] sm:h-[500px] rounded-full bg-gradient-to-b from-amber-500/10 via-amber-600/5 to-transparent blur-3xl pointer-events-none" />

            {/* Wheel Container with Authentic GTA Casino Bezel */}
            <div className="relative w-[300px] h-[300px] sm:w-[440px] sm:h-[440px] md:w-[480px] md:h-[480px] flex items-center justify-center max-w-[92vw]">
              
              {/* Outer Golden Bezel Ring with Light Studs */}
              <div className="absolute inset-0 rounded-full border-[6px] border-gradient-to-b from-amber-300 via-amber-600 to-yellow-800 shadow-[0_0_60px_rgba(245,158,11,0.25),inset_0_0_30px_rgba(0,0,0,0.8)] pointer-events-none bg-gradient-to-b from-amber-900/20 via-black to-neutral-950/60" />
              
              {/* Outer Illuminated Studs / Bulbs around the perimeter (24 bulbs) */}
              <div className="absolute inset-2 rounded-full pointer-events-none">
                {Array.from({ length: 24 }).map((_, bulbIdx) => {
                  const bulbAngle = (bulbIdx * 360) / 24;
                  const rad = (bulbAngle - 90) * (Math.PI / 180);
                  const radiusPct = 48.5; // percentage from center
                  const left = 50 + radiusPct * Math.cos(rad);
                  const top = 50 + radiusPct * Math.sin(rad);

                  return (
                    <div
                      key={bulbIdx}
                      className="absolute w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full"
                      style={{
                        left: `${left}%`,
                        top: `${top}%`,
                        backgroundColor: bulbIdx % 2 === 0 ? '#fbbf24' : '#f59e0b',
                        animation: isSpinning 
                          ? `bulbChase 0.75s infinite linear` 
                          : `bulbGentleGlow 2.5s infinite ease-in-out`,
                        animationDelay: isSpinning 
                          ? `${-(bulbIdx / 24) * 0.75}s` 
                          : `${(bulbIdx % 4) * 0.4}s`,
                      }}
                    />
                  );
                })}
              </div>

              {/* Physical Pointer / Mechanical Needle at 12 o'clock */}
              <div 
                ref={needleRef}
                className="absolute -top-4 z-40 flex flex-col items-center origin-top pointer-events-none transition-transform duration-75 ease-out"
                style={{ transform: 'rotate(0deg)' }}
              >
                {/* Needle Blade */}
                <div className="relative w-8 h-11 filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.9)]">
                  <svg viewBox="0 0 32 44" className="w-full h-full">
                    <defs>
                      <linearGradient id="needleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fef08a" />
                        <stop offset="40%" stopColor="#f59e0b" />
                        <stop offset="80%" stopColor="#b45309" />
                        <stop offset="100%" stopColor="#78350f" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 16 42 L 5 10 C 3 4, 10 2, 16 2 C 22 2, 29 4, 27 10 Z"
                      fill="url(#needleGrad)"
                      stroke="#fef08a"
                      strokeWidth="1.2"
                    />
                    <circle cx="16" cy="12" r="3.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1" />
                    <circle cx="16" cy="12" r="1.5" fill="#ffffff" />
                  </svg>
                </div>
              </div>

              {/* Rotating Wheel Surface */}
              <div
                className="w-[280px] h-[280px] sm:w-[410px] sm:h-[410px] md:w-[446px] md:h-[446px] rounded-full overflow-hidden shadow-[inset_0_0_40px_rgba(0,0,0,0.9)]"
                style={{
                  transform: `rotate(${rotationDegrees}deg)`,
                  transition: 'transform 7.15s cubic-bezier(0.12, 0.98, 0.16, 1)',
                }}
              >
                <svg viewBox="0 0 500 500" className="w-full h-full select-none">
                  <defs>
                    <radialGradient id="wheelVignette" cx="50%" cy="50%" r="50%">
                      <stop offset="70%" stopColor="transparent" />
                      <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
                    </radialGradient>
                    <linearGradient id="goldStud" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="50%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#78350f" />
                    </linearGradient>
                  </defs>

                  <g transform="translate(250, 250)">
                    {segments.map((seg: WheelSegmentConfig, i: number) => {
                      const angle = degreesPerSegment;
                      const startAngle = i * angle;
                      const endAngle = startAngle + angle;

                      // Polar coordinates
                      const r = 246;
                      const startRad = (startAngle - 90) * (Math.PI / 180);
                      const endRad = (endAngle - 90) * (Math.PI / 180);

                      const x1 = r * Math.cos(startRad);
                      const y1 = r * Math.sin(startRad);
                      const x2 = r * Math.cos(endRad);
                      const y2 = r * Math.sin(endRad);

                      const pathData = `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
                      const midAngle = startAngle + angle / 2;

                      return (
                        <g key={seg.id}>
                          {/* Segment Wedge */}
                          <path
                            d={pathData}
                            fill={seg.color}
                            stroke="#171717"
                            strokeWidth="1.8"
                          />

                          {/* Outer Peg / Stud at segment boundary */}
                          <circle
                            cx={x1 * 0.96}
                            cy={y1 * 0.96}
                            r="3.5"
                            fill="url(#goldStud)"
                            stroke="#451a03"
                            strokeWidth="1"
                          />

                          {/* Segment Label (Rotated along radial spoke) */}
                          <g transform={`rotate(${midAngle}) translate(0, -155)`}>
                            <text
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill={seg.textColor}
                              fontSize="11"
                              fontWeight="800"
                              letterSpacing="0.04em"
                              fontFamily="Inter, sans-serif"
                              transform="rotate(90)"
                              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95)' }}
                            >
                              {seg.label}
                            </text>
                          </g>

                          {/* Segment Icon (Standing upright relative to the spoke) */}
                          <g transform={`rotate(${midAngle}) translate(0, -214)`}>
                            <text
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize="18"
                              style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.85))' }}
                            >
                              {seg.icon}
                            </text>
                          </g>
                        </g>
                      );
                    })}

                    {/* Wheel Inner Radial Vignette */}
                    <circle cx="0" cy="0" r="248" fill="url(#wheelVignette)" pointerEvents="none" />
                  </g>
                </svg>
              </div>

              {/* Center Hub & Embossed Diamond Insignia */}
              <div className="absolute z-30 w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-b from-neutral-900 via-neutral-950 to-black border-4 border-amber-500/70 shadow-[0_0_35px_rgba(0,0,0,0.95),0_0_20px_rgba(245,158,11,0.35)] flex flex-col items-center justify-center p-2 text-center pointer-events-none">
                <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-gradient-to-b from-amber-400/20 via-transparent to-amber-500/10 flex items-center justify-center border border-amber-500/30">
                  <img
                    src="/diamond_casino_logo.png"
                    alt="Diamond Emblem"
                    className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-[0_0_12px_rgba(255,215,0,0.6)]"
                  />
                </div>
              </div>
            </div>

            {/* Spin Trigger Button & Status Controls */}
            <div className="mt-8 flex flex-col items-center gap-3 w-full max-w-sm">
              <button
                onClick={handleSpin}
                disabled={economy.maintenanceMode || isSpinning || (!canSpinWheel && isAuthenticated)}
                className={`w-full py-4 px-8 rounded-2xl font-bold text-sm tracking-wider uppercase transition-all duration-300 shadow-[0_0_35px_rgba(245,158,11,0.3)] flex items-center justify-center gap-3 ${
                  economy.maintenanceMode
                    ? 'bg-neutral-900 border border-amber-500/30 text-amber-400 cursor-not-allowed opacity-75'
                    : isSpinning
                    ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed border border-white/10'
                    : !canSpinWheel && isAuthenticated
                    ? 'bg-neutral-900 border border-white/10 text-neutral-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-400 text-black hover:scale-[1.02] active:scale-98 cursor-pointer shadow-[0_0_40px_rgba(251,191,36,0.4)]'
                }`}
              >
                {economy.maintenanceMode ? (
                  <>
                    <span className="text-base">🔒</span>
                    <span>Casino en Maintenance</span>
                  </>
                ) : isSpinning ? (
                  <>
                    <span className="animate-spin text-lg">⚙️</span>
                    <span>{spinPhase === 'slowing' ? 'Décélération...' : 'La roue tourne...'}</span>
                  </>
                ) : !canSpinWheel && isAuthenticated ? (
                  <>
                    <Clock size={18} className="text-amber-400 animate-pulse" />
                    <span>Disponible dans {timeUntilNextSpin}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} className="text-black" />
                    <span>Lancer le tirage gratuit</span>
                  </>
                )}
              </button>

              {/* Helper status text */}
              {!isAuthenticated ? (
                <p className="text-xs text-neutral-400 text-center font-['Geist_Mono']">
                  ⚡ Mode démonstration libre. Connectez votre profil citoyen pour créditer vos gains in-game.
                </p>
              ) : !canSpinWheel ? (
                <p className="text-[11px] text-neutral-400 text-center font-['Geist_Mono']">
                  Délai de rechargement en cours. Revenez dès expiration du compte à rebours.
                </p>
              ) : null}

              {/* Developer & Admin Quick Actions */}
              {(user?.role === 'DÉVELOPPEUR' || user?.role === 'DIRECTEUR CASINO') && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  {!canSpinWheel && (
                    <button
                      onClick={resetSpinCooldown}
                      className="px-3 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-[11px] font-['Geist_Mono'] text-amber-300 flex items-center gap-1.5 cursor-pointer transition-colors"
                      title="Réinitialise le timer de 24h pour tester le tirage immédiatement"
                    >
                      <RotateCcw size={12} />
                      <span>Reset Timer (Dev)</span>
                    </button>
                  )}
                  <Link
                    to="/admin"
                    className="px-3 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-[11px] font-['Geist_Mono'] text-neutral-400 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Ouvrir la console admin pour configurer les drops"
                  >
                    <SlidersHorizontal size={12} />
                    <span>Console Admin</span>
                  </Link>
                </div>
              )}
            </div>

          </div>

          {/* ---------------------------------------------------------- */}
          {/* RIGHT: INTERACTIVE PRIZE SHOWCASE GALLERY                  */}
          {/* ---------------------------------------------------------- */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            
            {/* Prize Switcher Tabs */}
            <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-neutral-950/80 border border-white/10 backdrop-blur-md overflow-x-auto no-scrollbar">
              {[
                { key: 'vehicle', icon: Car, label: 'Supercar' },
                { key: 'chips', icon: Coins, label: 'Jetons' },
                { key: 'cash', icon: DollarSign, label: 'Cash' },
                { key: 'mystery', icon: Gift, label: 'Mystère' },
                { key: 'clothing', icon: Shirt, label: 'Couture' },
              ].map((tab) => {
                const IconComp = tab.icon;
                const isSelected = selectedShowcaseTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setSelectedShowcaseTab(tab.key);
                      if (tab.key === 'vehicle') playEngineRev();
                    }}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-['Geist_Mono'] font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                        : 'text-neutral-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <IconComp size={14} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Active Prize Showcase Card */}
            <div className="relative rounded-3xl p-6 sm:p-7 bg-neutral-950/85 border border-amber-500/30 backdrop-blur-xl overflow-hidden group shadow-[0_0_50px_rgba(0,0,0,0.85)]">
              
              {/* Background ambient glow */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/[0.08] rounded-full blur-3xl pointer-events-none" />

              {/* Corner Tag */}
              <div className="absolute top-0 right-0 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-['Geist_Mono'] font-bold text-[10px] uppercase tracking-widest rounded-bl-2xl shadow-lg flex items-center gap-1.5">
                <Trophy size={12} />
                <span>{currentShowcase.category}</span>
              </div>

              {/* Subtitle */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-['Geist_Mono'] text-amber-400 uppercase tracking-widest font-semibold">
                  {currentShowcase.subtitle}
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2 tracking-tight">
                {selectedShowcaseTab === 'vehicle' ? podiumVehicle.name : currentShowcase.title}
              </h2>
              
              <p className="text-xs sm:text-sm text-neutral-300 mb-4 leading-relaxed">
                {currentShowcase.description}
              </p>

              {/* High-Resolution AI Showcase Photo */}
              <div className="relative w-full h-48 sm:h-56 rounded-2xl overflow-hidden border border-white/15 mb-4 group-hover:border-amber-500/50 transition-all duration-500 shadow-2xl">
                <img
                  src={selectedShowcaseTab === 'vehicle' ? (podiumVehicle.imageUrl || currentShowcase.image) : currentShowcase.image}
                  alt={currentShowcase.title}
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
                
                {/* Action button overlay */}
                <button
                  onClick={() => {
                    setActiveModalKey(selectedShowcaseTab);
                    if (selectedShowcaseTab === 'vehicle') playEngineRev();
                  }}
                  className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-black/75 hover:bg-black/95 border border-white/20 text-white text-xs font-['Geist_Mono'] backdrop-blur-md flex items-center gap-1.5 cursor-pointer transition-all hover:scale-105 shadow-xl"
                >
                  <Eye size={13} className="text-amber-400" />
                  <span>Inspecter les détails</span>
                </button>

                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 border border-white/10 text-amber-300 font-['Geist_Mono'] text-[10px] backdrop-blur-md">
                  Rotonde VIP // {selectedShowcaseTab.toUpperCase()}
                </div>
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-2xl bg-neutral-900/80 border border-white/10 mb-4 font-['Geist_Mono'] text-center">
                {currentShowcase.specs.map((spec, sIdx) => (
                  <div key={sIdx} className={sIdx > 0 ? 'border-l border-white/10' : ''}>
                    <span className="text-[10px] text-neutral-400 block uppercase">{spec.label}</span>
                    <span className={`text-xs font-bold ${spec.color || 'text-white'}`}>
                      {spec.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Live Drop Rate Footer */}
              <div className="flex items-center justify-between text-xs font-['Geist_Mono'] text-neutral-400 pt-1">
                <span className="flex items-center gap-1.5">
                  <Flame size={14} className="text-amber-400" />
                  <span>Taux de chance à la Roue :</span>
                </span>
                <span className="font-bold text-amber-300">
                  {segments.find((s) => s.type === selectedShowcaseTab)?.dropRate || 2.5}% par lancer
                </span>
              </div>
            </div>

            {/* VIP Cooldown reduction info banner */}
            <div className="p-4 rounded-2xl bg-neutral-950/70 border border-white/10 flex items-center justify-between text-xs font-['Geist_Mono'] backdrop-blur-md">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-amber-400" />
                <span className="text-neutral-300">Périodicité des tirages :</span>
              </div>
              <span className="text-amber-300 font-medium">Diamond: 8h • Gold: 12h • Citoyen: 24h</span>
            </div>

          </div>

        </div>

      </div>

      {/* ============================================================ */}
      {/* 5. CELEBRATION MODAL (Confetti, Fanfare & AI Prize Reveal)     */}
      {/* ============================================================ */}
      <AnimatePresence>
        {celebrationOpen && winningSegment && winningAsset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl">
            {/* Canvas Confetti Explosion */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 30 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="relative z-20 w-full max-w-lg rounded-3xl border border-amber-500/50 bg-neutral-950 p-6 sm:p-8 flex flex-col items-center text-center shadow-[0_0_80px_rgba(245,158,11,0.35)] overflow-hidden"
            >
              {/* Confetti & Radial Flare Background */}
              <div className="absolute inset-0 bg-gradient-to-b from-amber-500/15 via-transparent to-transparent pointer-events-none" />

              {/* Close Icon */}
              <button
                onClick={() => setCelebrationOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>

              {/* Trophy Header Badge */}
              <div className="px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-['Geist_Mono'] text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-400" />
                <span>RÉSULTAT DU TIRAGE OFFICIEL</span>
              </div>

              {/* Hero Prize Graphic with Photorealistic AI Image */}
              <div className="w-full h-48 rounded-2xl overflow-hidden border border-amber-500/40 my-3 shadow-2xl relative">
                <img
                  src={winningSegment.type === 'vehicle' ? (podiumVehicle.imageUrl || winningAsset.image) : winningAsset.image}
                  alt={winningSegment.label}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-black/80 border border-amber-400/40 text-amber-300 font-['Geist_Mono'] text-[10px]">
                  {winningAsset.category}
                </div>
              </div>

              {/* Winning Label */}
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white mb-2 tracking-tight">
                {winningSegment.label}
              </h3>

              {/* Descriptive Gain Message */}
              <p className="text-sm text-neutral-300 mb-6 max-w-sm leading-relaxed">
                {winningSegment.type === 'vehicle' && 'Félicitations citoyen ! Vous remportez la Grotti Itali RSX ! Les clés et la carte grise officielle vous attendent au garage du Penthouse.'}
                {winningSegment.type === 'chips' && `Félicitations ! Un crédit officiel de ${Number(winningSegment.value).toLocaleString()} jetons Diamond a été versé à votre solde.`}
                {winningSegment.type === 'cash' && `Félicitations ! Un montant de $${Number(winningSegment.value).toLocaleString()} a été transféré dans votre portefeuille bancaire RP.`}
                {winningSegment.type === 'mystery' && `Vous ouvrez le coffre et découvrez un trésor rare : ${winningSegment.value}.`}
                {winningSegment.type === 'clothing' && `Un habit de grand luxe a été déposé dans votre garde-robe : ${winningSegment.value}.`}
              </p>

              {/* Actions */}
              <div className="w-full flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setCelebrationOpen(false)}
                  className="flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-black font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_25px_rgba(245,158,11,0.4)]"
                >
                  Encaisser mon gain
                </button>
                <Link
                  to="/espace-membre"
                  className="py-3.5 px-6 rounded-2xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>Espace Membre</span>
                  <ExternalLink size={13} />
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* 6. MODAL D'INSPECTION DÉTAILLÉE DE CHAQUE LOT                */}
      {/* ============================================================ */}
      <AnimatePresence>
        {activeModalKey && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl">
            {(() => {
              const modalData = PRIZE_ASSETS[activeModalKey] || PRIZE_ASSETS.vehicle;
              const ActionIcon = modalData.actionIcon;

              return (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="relative w-full max-w-3xl rounded-3xl border border-amber-500/40 bg-neutral-950 p-6 sm:p-8 flex flex-col shadow-[0_0_90px_rgba(245,158,11,0.3)] overflow-hidden max-h-[90vh] overflow-y-auto"
                >
                  <button
                    onClick={() => setActiveModalKey(null)}
                    className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-neutral-400 hover:text-white transition-colors cursor-pointer z-20"
                    aria-label="Fermer"
                  >
                    <X size={18} />
                  </button>

                  <div className="flex items-center gap-2 mb-2 font-['Geist_Mono'] text-xs text-amber-400">
                    <ShieldCheck size={16} />
                    <span>INSPECTION OFFICIELLE DIAMOND CASINO // {modalData.category}</span>
                  </div>

                  <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">
                    {activeModalKey === 'vehicle' ? podiumVehicle.name : modalData.title}
                  </h2>
                  <p className="text-xs text-neutral-400 mb-4 font-['Geist_Mono']">
                    {modalData.subtitle}
                  </p>

                  {/* Full Image */}
                  <div className="w-full h-64 sm:h-80 rounded-2xl overflow-hidden border border-white/20 relative mb-6">
                    <img
                      src={activeModalKey === 'vehicle' ? (podiumVehicle.imageUrl || modalData.image) : modalData.image}
                      alt={modalData.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-3 left-3 flex gap-2">
                      <button
                        onClick={() => {
                          if (activeModalKey === 'vehicle') playEngineRev();
                          else playRatchetTick(0.15);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-['Geist_Mono'] font-bold flex items-center gap-1.5 cursor-pointer shadow-lg transition-transform active:scale-95"
                      >
                        <ActionIcon size={14} />
                        <span>{modalData.actionLabel}</span>
                      </button>
                    </div>
                  </div>

                  {/* Detailed Specs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-['Geist_Mono'] text-center mb-6">
                    {modalData.specs.map((spec, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-neutral-900 border border-white/10">
                        <span className="text-[10px] text-neutral-400 block uppercase">{spec.label}</span>
                        <span className={`text-xs font-bold ${spec.color || 'text-white'}`}>{spec.value}</span>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-6">
                    {modalData.description}
                  </p>

                  <button
                    onClick={() => setActiveModalKey(null)}
                    className="w-full py-3.5 rounded-xl bg-white text-black font-bold text-xs uppercase tracking-wider hover:bg-neutral-200 transition-colors cursor-pointer"
                  >
                    Retour à la Roue
                  </button>
                </motion.div>
              );
            })()}
          </div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* 7. ODDS & PRIZES TRANSPARENCY MODAL                          */}
      {/* ============================================================ */}
      <AnimatePresence>
        {oddsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-2xl max-h-[85vh] rounded-3xl border border-white/15 bg-neutral-950 p-6 sm:p-8 flex flex-col shadow-2xl overflow-hidden"
            >
              <button
                onClick={() => setOddsModalOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-2 mb-2 font-['Geist_Mono'] text-xs text-amber-400">
                <ShieldCheck size={16} />
                <span>RÉGLEMENTATION OFFICIELLE DES TIRAGES // 16 LOTS</span>
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">
                Tableau des Probabilités &amp; Dotations
              </h2>
              <p className="text-xs text-neutral-400 mb-4">
                Chaque segment de la Roue est certifié équitable. Les taux de drop sont configurés par la gérance RP du Diamond Casino.
              </p>

              {/* Scrollable list */}
              <div className="overflow-y-auto space-y-2 pr-1 my-2 max-h-96">
                {segments.map((seg) => (
                  <div
                    key={seg.id}
                    className="p-3 rounded-xl bg-neutral-900/80 border border-white/5 flex items-center justify-between font-['Geist_Mono'] text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{seg.icon}</span>
                      <div>
                        <span className="font-bold text-white block">{seg.label}</span>
                        <span className="text-[10px] text-neutral-400 uppercase">
                          Type: {seg.type}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-amber-300 block">{seg.dropRate}%</span>
                      <span className="text-[10px] text-neutral-400">chance</span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setOddsModalOpen(false)}
                className="mt-4 w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
