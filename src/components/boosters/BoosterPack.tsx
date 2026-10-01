/**
 * Paquet de booster en 3D : un vrai volume (face avant, dos, tranches) en
 * aluminium métallisé à la couleur du booster, soudures crantées, reflet
 * spéculaire et irisation qui suivent le pointeur, balancement au repos.
 * En mode « tearable », le joueur fait glisser le doigt / la souris le long
 * du haut du paquet pour le déchirer.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Layers } from 'lucide-react';
import type { BoosterPackData } from '../../lib/supabase';
import { hexToRgb, rgba } from './boosterUtils';

type PackLook = Pick<BoosterPackData, 'name' | 'cover_image_url' | 'accent_color' | 'cards_per_pack'> & {
  /** Visuel de la fenêtre à la place de cover_image_url (ex. éventail de cartes) */
  cover?: React.ReactNode;
  /** Surtitre de la face avant */
  kicker?: string;
  /** Textes du dos */
  backTitle?: string;
  backText?: string;
};

const TEAR_Y = 12.5; // % depuis le haut
const CRIMP = 5.5; // hauteur des soudures (%)
const TEETH = 1.1; // profondeur des crans (%)

function shade(hex: string, f: number) {
  const [r, g, b] = hexToRgb(hex);
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

/** Bord cranté (x de 0 à 100) */
function teeth(y0: number, dir: 1 | -1): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 44; i++) pts.push([(i / 44) * 100, i % 2 ? y0 : y0 + dir * TEETH]);
  return pts;
}

/** Ligne de déchirure irrégulière — stable pour un même paquet */
function tearLine(seed: string): [number, number][] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const rand = () => {
    h = (h * 1103515245 + 12345) | 0;
    return ((h >>> 0) % 1000) / 1000;
  };
  const pts: [number, number][] = [];
  for (let x = 0; x <= 100; x += 2.5) pts.push([x, TEAR_Y + (rand() - 0.5) * 1.8 + Math.sin(x / 9) * 0.4]);
  return pts;
}

const poly = (pts: [number, number][]) => `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`;

// ---------------------------------------------------------------------------
// Faces
// ---------------------------------------------------------------------------

/** Feuille d'aluminium : dégradé métallisé + brossage + volume « coussin » */
const Foil: React.FC<{ accent: string; dark?: boolean }> = ({ accent, dark }) => (
  <>
    <div
      className="absolute inset-0"
      style={{
        background: dark
          ? `linear-gradient(160deg, ${shade(accent, -0.45)}, ${shade(accent, -0.7)} 55%, ${shade(accent, -0.85)})`
          : `linear-gradient(160deg, ${shade(accent, 0.45)} 0%, ${shade(accent, 0.05)} 22%, ${shade(accent, -0.35)} 48%, ${shade(accent, 0.1)} 70%, ${shade(accent, -0.6)} 100%)`,
      }}
    />
    {/* Brossage */}
    <div className="absolute inset-0 opacity-60" style={{ background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px, rgba(0,0,0,0.05) 3px 4px)' }} />
    {/* Volume : bords écrasés, centre bombé */}
    <div
      className="absolute inset-0"
      style={{
        background:
          'linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 7%, rgba(255,255,255,0.14) 20%, transparent 38%, transparent 70%, rgba(0,0,0,0.12) 88%, rgba(0,0,0,0.6) 100%)',
      }}
    />
    <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 10%, transparent 90%, rgba(0,0,0,0.4) 100%)' }} />
  </>
);

/** Soudure crantée (haut / bas) */
const Crimp: React.FC<{ accent: string; bottom?: boolean }> = ({ accent, bottom }) => (
  <div
    className="absolute inset-x-0"
    style={{
      [bottom ? 'bottom' : 'top']: 0,
      height: `${CRIMP}%`,
      background: `repeating-linear-gradient(90deg, ${shade(accent, 0.35)} 0 2px, ${shade(accent, -0.45)} 2px 4px)`,
      boxShadow: bottom ? 'inset 0 3px 4px rgba(0,0,0,0.45)' : 'inset 0 -3px 4px rgba(0,0,0,0.45)',
      opacity: 0.95,
    }}
  >
    <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.25), transparent 60%)' }} />
  </div>
);

/** Reflets qui suivent le pointeur (variables CSS --px / --py / --pg) */
const Sheen: React.FC = () => (
  <>
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          'repeating-linear-gradient(115deg, rgba(255,0,132,0.5) 0%, rgba(255,196,0,0.45) 7%, rgba(0,255,170,0.45) 14%, rgba(0,160,255,0.5) 21%, rgba(170,0,255,0.45) 28%, rgba(255,0,132,0.5) 35%)',
        backgroundSize: '320% 320%',
        backgroundPosition: 'var(--px, 50%) var(--py, 50%)',
        mixBlendMode: 'color-dodge',
        opacity: 'calc(0.12 + var(--pg, 0) * 0.28)',
      }}
    />
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: 'radial-gradient(ellipse 60% 45% at var(--px, 50%) var(--py, 30%), rgba(255,255,255,0.55), rgba(255,255,255,0) 60%)',
        mixBlendMode: 'overlay',
      }}
    />
    <div className="absolute inset-0 pointer-events-none bst-pack-sweep" />
  </>
);

const PackFront: React.FC<{ pack: PackLook; width: number }> = ({ pack, width }) => {
  const accent = pack.accent_color || '#c9a44c';
  const s = width / 240;
  return (
    <div className="absolute inset-0 overflow-hidden">
      <Foil accent={accent} />
      <Crimp accent={accent} />
      <Crimp accent={accent} bottom />

      {/* Impression */}
      <div className="absolute inset-x-[8%] flex flex-col items-center" style={{ top: `${CRIMP + 6}%`, bottom: `${CRIMP + 3}%` }}>
        <div className="text-center uppercase font-semibold text-white/80" style={{ fontSize: 6.5 * s, letterSpacing: '0.42em' }}>
          {pack.kicker ?? 'Collection officielle'}
        </div>
        <img src="/hero_logo.png" alt="" draggable={false} className="w-[64%] h-auto mt-[3%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />

        {/* Fenêtre visuel */}
        <div className="relative w-full flex-1 mt-[5%]">
          <div
            className="absolute inset-0 rounded-[12px] overflow-hidden"
            style={{
              background: `radial-gradient(circle at 50% 45%, ${rgba(accent, 0.7)}, ${shade(accent, -0.8)} 62%, #050505 100%)`,
              boxShadow: `inset 0 0 0 ${1.5 * s}px rgba(255,255,255,0.35), inset 0 0 ${24 * s}px rgba(0,0,0,0.8), 0 ${4 * s}px ${10 * s}px rgba(0,0,0,0.45)`,
            }}
          >
            <div
              className="absolute left-1/2 top-1/2 w-[240%] aspect-square -translate-x-1/2 -translate-y-1/2 bst-rays opacity-80"
              style={{ ['--bst-ray' as string]: rgba('#ffffff', 0.13) }}
            />
            <div className="absolute inset-x-0 bottom-0 h-[35%]" style={{ background: `linear-gradient(to top, ${rgba(accent, 0.35)}, transparent)` }} />
          </div>
          {pack.cover ? (
            <div className="absolute inset-0">{pack.cover}</div>
          ) : pack.cover_image_url ? (
            // La voiture déborde légèrement de la fenêtre
            <img
              src={pack.cover_image_url}
              alt=""
              draggable={false}
              className="absolute left-[-9%] right-[-9%] top-[8%] bottom-[2%] w-[118%] h-[90%] object-contain"
              style={{ filter: 'drop-shadow(0 10px 10px rgba(0,0,0,0.65))' }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/60">
              <Layers size={54 * s} />
            </div>
          )}
        </div>

        {/* Bandeau nom */}
        <div className="relative w-[114%] mt-[6%] py-[3.5%] text-center" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.6) 12%, rgba(0,0,0,0.6) 88%, transparent)' }}>
          <div className="absolute inset-x-[10%] top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${shade(accent, 0.6)}, transparent)` }} />
          <div className="absolute inset-x-[10%] bottom-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${shade(accent, 0.6)}, transparent)` }} />
          <div
            className="px-[12%] font-bold uppercase leading-[0.95] line-clamp-2"
            style={{
              fontSize: 19 * s,
              fontFamily: 'var(--font-tight)',
              letterSpacing: '-0.01em',
              background: `linear-gradient(180deg, #ffffff 30%, ${shade(accent, 0.55)})`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.8))',
            }}
          >
            {pack.name}
          </div>
        </div>

        <div className="mt-auto pt-[4%] w-full flex items-center justify-between">
          <div className="flex gap-[3px]">
            {['#a3a3a3', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444'].map((c) => (
              <span key={c} className="rotate-45" style={{ width: 5 * s, height: 5 * s, background: c, boxShadow: `0 0 ${4 * s}px ${c}` }} />
            ))}
          </div>
          <div
            className="rounded-full bg-black/55 border border-white/25 text-white font-bold uppercase"
            style={{ fontSize: 7.5 * s, padding: `${2.5 * s}px ${7 * s}px`, letterSpacing: '0.16em' }}
          >
            {pack.cards_per_pack} carte{pack.cards_per_pack > 1 ? 's' : ''}
          </div>
        </div>
      </div>
      <Sheen />
    </div>
  );
};

const PackBack: React.FC<{ pack: PackLook; width: number }> = ({ pack, width }) => {
  const accent = pack.accent_color || '#c9a44c';
  const s = width / 240;
  return (
    <div className="absolute inset-0 overflow-hidden">
      <Foil accent={accent} dark />
      <Crimp accent={accent} />
      <Crimp accent={accent} bottom />
      <div className="absolute inset-x-[10%] flex flex-col items-center text-center text-white/70" style={{ top: `${CRIMP + 8}%`, bottom: `${CRIMP + 5}%`, fontSize: 7 * s }}>
        <img src="/hero_logo.png" alt="" draggable={false} className="w-[46%] h-auto opacity-80" />
        <p className="mt-[8%] leading-relaxed uppercase" style={{ letterSpacing: '0.12em' }}>
          {pack.backTitle ??
            `Contient ${pack.cards_per_pack} carte${pack.cards_per_pack > 1 ? 's' : ''} véhicule${pack.cards_per_pack > 1 ? 's' : ''} tirée${pack.cards_per_pack > 1 ? 's' : ''} au hasard`}
        </p>
        <p className="mt-[4%] text-white/45 leading-relaxed">{pack.backText ?? "Chaque véhicule obtenu est livré dans l'inventaire de l'Espace Membre."}</p>
        <div className="mt-auto w-full flex items-end justify-between">
          <div className="flex flex-col items-start gap-1">
            <div style={{ width: 70 * s, height: 22 * s, background: 'repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 3px, #fff 3px 5px, transparent 5px 6px, #fff 6px 7px, transparent 7px 10px)', opacity: 0.85 }} />
            <span className="font-mono text-white/50" style={{ fontSize: 5.5 * s }}>
              0 42 2026 {pack.name.length.toString().padStart(3, '0')}
            </span>
          </div>
          <span className="rounded-full border border-white/30 px-1.5 py-0.5 font-bold" style={{ fontSize: 6 * s }}>
            18+
          </span>
        </div>
      </div>
      <Sheen />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Paquet
// ---------------------------------------------------------------------------

interface BoosterPackProps {
  pack: Pick<BoosterPackData, 'id'> & PackLook;
  width: number;
  /** Autorise la déchirure au glissé */
  tearable?: boolean;
  /** Déclenche une déchirure automatique (bouton « Ouvrir ») */
  autoTear?: boolean;
  onTearProgress?: (p: number) => void;
  onTorn?: () => void;
  /** Balancement lent au repos */
  idle?: boolean;
  /** Inclinaison au survol */
  interactive?: boolean;
  /** Rotation de base (carrousel) */
  baseRotateY?: number;
  className?: string;
}

export const BoosterPack: React.FC<BoosterPackProps> = ({
  pack,
  width,
  tearable = false,
  autoTear = false,
  onTearProgress,
  onTorn,
  idle = false,
  interactive = true,
  baseRotateY = 0,
  className,
}) => {
  const height = width * 1.62;
  const depth = Math.max(5, width * 0.05);
  const [progress, setProgress] = useState(0);
  const [torn, setTorn] = useState(false);
  const drag = useRef<{ x: number; last: number } | null>(null);
  const tornRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hovering = useRef(false);

  // Inclinaison (pointeur + balancement) — ressorts pour un mouvement physique
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rx = useSpring(tiltX, { stiffness: 140, damping: 16 });
  const ryRaw = useSpring(tiltY, { stiffness: 140, damping: 16 });
  const ry = useTransform(ryRaw, (v) => v + baseRotateY);
  const lift = tearable ? 0.4 : 1; // moins d'inclinaison pendant la déchirure
  const shadowScale = useTransform(ry, (v) => 1 - Math.min(0.25, Math.abs(v) / 120));

  useEffect(() => {
    if (!idle) return;
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      if (!hovering.current) {
        const t = (now - t0) / 1000;
        tiltY.set(Math.sin(t * 0.8) * 11);
        tiltX.set(Math.sin(t * 0.55 + 1) * 4);
        const el = rootRef.current;
        if (el) {
          el.style.setProperty('--px', `${50 + Math.sin(t * 0.8) * 35}%`);
          el.style.setProperty('--py', `${35 + Math.cos(t * 0.6) * 20}%`);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [idle, tiltX, tiltY]);

  const onPointerMove = (e: React.PointerEvent) => {
    if (!interactive || drag.current) return;
    const el = rootRef.current;
    if (!el) return;
    hovering.current = true;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    tiltY.set((x - 0.5) * 34 * lift);
    tiltX.set((0.5 - y) * 22 * lift);
    el.style.setProperty('--px', `${x * 100}%`);
    el.style.setProperty('--py', `${y * 100}%`);
    el.style.setProperty('--pg', '1');
  };
  const onPointerLeave = () => {
    hovering.current = false;
    tiltX.set(0);
    tiltY.set(0);
    rootRef.current?.style.setProperty('--pg', '0');
  };

  // Formes
  const line = useMemo(() => tearLine(pack.id), [pack.id]);
  const topEdge = useMemo(() => teeth(0, 1), []);
  const bottomEdge = useMemo(() => [...teeth(100, -1)].reverse(), []);
  const fullClip = poly([...topEdge, ...bottomEdge]);
  const bodyClip = poly([...line, ...bottomEdge]);
  const stripClip = poly([...topEdge, ...[...line].reverse()]);
  const split = tearable || torn;

  const finish = () => {
    if (tornRef.current) return;
    tornRef.current = true;
    setProgress(1);
    setTorn(true);
    onTorn?.();
  };

  const update = (p: number) => {
    const v = Math.max(0, Math.min(1, p));
    setProgress(v);
    onTearProgress?.(v);
    if (v >= 0.62) finish();
  };

  // Déchirure automatique
  useEffect(() => {
    if (!autoTear || tornRef.current) return;
    const c = animate(0, 0.7, { duration: 0.55, ease: 'easeIn', onUpdate: update });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTear]);

  const onDown = (e: React.PointerEvent) => {
    if (!tearable || tornRef.current) return;
    // Pas de sélection de texte ni de glisser-déposer natif pendant le geste
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, last: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || tornRef.current) return;
    const p = Math.abs(e.clientX - drag.current.x) / (width * 0.95);
    if (p > drag.current.last) {
      drag.current.last = p;
      update(p);
    }
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (!tornRef.current) update(0);
  };

  const accent = pack.accent_color || '#c9a44c';
  const sideStyle: React.CSSProperties = {
    background: `linear-gradient(180deg, ${shade(accent, -0.2)}, ${shade(accent, -0.65)})`,
    backgroundImage: `repeating-linear-gradient(180deg, ${shade(accent, 0.2)} 0 2px, ${shade(accent, -0.55)} 2px 4px)`,
  };
  const sideTop = split ? `${TEAR_Y}%` : '1%';

  return (
    <div
      ref={rootRef}
      className={`relative select-none ${className ?? ''}`}
      style={{ width, height, perspective: width * 5, WebkitUserSelect: 'none' }}
      onDragStart={(e) => e.preventDefault()}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {/* Ombre portée */}
      <motion.div
        className="absolute left-1/2 -bottom-7 h-7 rounded-[50%] bg-black/75 blur-xl pointer-events-none"
        style={{ width: '82%', x: '-50%', scaleX: shadowScale }}
      />

      <motion.div className="absolute inset-0" style={{ transformStyle: 'preserve-3d', rotateX: rx, rotateY: ry }}>
        {/* Dos */}
        <div className="absolute inset-0" style={{ transform: `rotateY(180deg) translateZ(${depth / 2}px)`, clipPath: fullClip, backfaceVisibility: 'hidden' }}>
          <PackBack pack={pack} width={width} />
        </div>
        {/* Tranches */}
        <div className="absolute" style={{ ...sideStyle, width: depth, top: sideTop, bottom: '1%', left: (width - depth) / 2, transform: `rotateY(90deg) translateZ(${width / 2 - 0.5}px)` }} />
        <div className="absolute" style={{ ...sideStyle, width: depth, top: sideTop, bottom: '1%', left: (width - depth) / 2, transform: `rotateY(-90deg) translateZ(${width / 2 - 0.5}px)` }} />
        {!split && (
          <div className="absolute" style={{ ...sideStyle, height: depth, left: '1%', right: '1%', top: (height - depth) / 2, transform: `rotateX(90deg) translateZ(${height / 2 - 1}px)` }} />
        )}
        <div className="absolute" style={{ ...sideStyle, height: depth, left: '1%', right: '1%', top: (height - depth) / 2, transform: `rotateX(-90deg) translateZ(${height / 2 - 1}px)` }} />

        {/* Face avant (entière, ou corps sous la ligne de déchirure) */}
        <div className="absolute inset-0" style={{ transform: `translateZ(${depth / 2}px)`, clipPath: split ? bodyClip : fullClip, backfaceVisibility: 'hidden' }}>
          <PackFront pack={pack} width={width} />
        </div>

        {/* Lèvre lumineuse de la déchirure */}
        {progress > 0 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ transform: `translateZ(${depth / 2 + 1}px)` }}>
            <polyline
              points={line.filter(([x]) => x <= progress * 140).map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke="rgba(255,255,255,0.95)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              style={{ filter: `drop-shadow(0 0 4px ${rgba(accent, 1)}) drop-shadow(0 0 2px #fff)` }}
            />
          </svg>
        )}

        {/* Haut du paquet (bande arrachée) */}
        {split && (
          <motion.div
            className="absolute inset-0"
            style={{ clipPath: stripClip, transformOrigin: '100% 12%', transformStyle: 'preserve-3d' }}
            animate={
              torn
                ? { x: width * 0.6, y: -height * 0.55, rotate: 40, rotateX: 50, opacity: 0, z: depth / 2 }
                : { x: 0, y: -progress * 8, rotate: -progress * 8, rotateX: progress * 18, opacity: 1, z: depth / 2 }
            }
            transition={torn ? { duration: 0.75, ease: [0.2, 0.7, 0.3, 1] } : { type: 'spring', stiffness: 400, damping: 30 }}
          >
            <PackFront pack={pack} width={width} />
          </motion.div>
        )}
      </motion.div>

      {/* Zone de prise pour déchirer : tout le paquet (le geste est horizontal) */}
      {tearable && !torn && (
        <div
          className="absolute inset-x-0 -top-4 bottom-0 z-20 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="Glisser pour déchirer le booster"
        />
      )}
    </div>
  );
};
