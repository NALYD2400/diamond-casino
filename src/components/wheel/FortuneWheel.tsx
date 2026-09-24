import React, { forwardRef } from 'react';
import {
  Car,
  Coins,
  Banknote,
  Gem,
  Shirt,
  Wine,
  KeyRound,
  Star,
  type LucideIcon,
} from 'lucide-react';
import type { WheelSegmentConfig } from '../../context/CasinoAdminContext';

/* ------------------------------------------------------------------ */
/* Palette & helpers                                                   */
/* ------------------------------------------------------------------ */

type PaletteKey = 'gold' | 'crimson' | 'onyx' | 'emerald' | 'royal' | 'sapphire';

// [deep (hub side), base, highlight (rim side), text]
const PALETTES: Record<PaletteKey, { deep: string; base: string; light: string; text: string; accent: string }> = {
  gold: { deep: '#6b4508', base: '#d9a93e', light: '#fbe7a6', text: '#1d1303', accent: '#1d1303' },
  crimson: { deep: '#2e040b', base: '#8e1424', light: '#c42a3c', text: '#fff4dc', accent: '#f5d27a' },
  onyx: { deep: '#020202', base: '#141414', light: '#2e2a24', text: '#fff4dc', accent: '#f5d27a' },
  emerald: { deep: '#021a11', base: '#0b6040', light: '#18925f', text: '#fff4dc', accent: '#f5d27a' },
  royal: { deep: '#14072e', base: '#4a2296', light: '#7446cf', text: '#fff4dc', accent: '#f5d27a' },
  sapphire: { deep: '#06122f', base: '#173f94', light: '#3269d1', text: '#fff4dc', accent: '#f5d27a' },
};

/** Casino palette for every segment, derived from its prize type so the wheel stays coherent. */
export function segmentPalettes(segments: WheelSegmentConfig[]): PaletteKey[] {
  let chipsCount = 0;
  return segments.map((seg) => {
    switch (seg.type) {
      case 'vehicle':
        return 'gold';
      case 'cash':
        return 'emerald';
      case 'mystery':
        return 'royal';
      case 'clothing':
        return 'sapphire';
      default:
        return chipsCount++ % 2 === 0 ? 'crimson' : 'onyx';
    }
  });
}

export function segmentIcon(seg: WheelSegmentConfig): LucideIcon {
  const label = seg.label.toUpperCase();
  if (label.includes('CHAMPAGNE')) return Wine;
  if (label.includes('PASS')) return KeyRound;
  if (label.includes('BONUS')) return Star;
  switch (seg.type) {
    case 'vehicle':
      return Car;
    case 'cash':
      return Banknote;
    case 'mystery':
      return Gem;
    case 'clothing':
      return Shirt;
    default:
      return Coins;
  }
}

/** CSS background matching a segment's lacquer colour, for legends and lists. */
export function paletteSwatch(palette: PaletteKey): React.CSSProperties {
  const p = PALETTES[palette];
  return { background: `linear-gradient(135deg, ${p.light}, ${p.base} 55%, ${p.deep})` };
}

/** Splits "50 000 JETONS" into a big value line and a small caption line. */
function splitLabel(label: string): [string, string] {
  const numeric = label.match(/^(\$?[\d\s.,]+)\s+(.+)$/);
  if (numeric) return [numeric[1].trim(), numeric[2]];
  const [first, ...rest] = label.split(' ');
  return [first, rest.join(' ')];
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

const C = 300; // centre of the 600×600 viewBox
const R_WEDGE = 258;
const R_INNER = 92;
const BULBS = 32;

function polar(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
}

function wedgePath(startDeg: number, endDeg: number, rOuter: number, rInner: number) {
  const o1 = polar(rOuter, startDeg);
  const o2 = polar(rOuter, endDeg);
  const i2 = polar(rInner, endDeg);
  const i1 = polar(rInner, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${o1.x} ${o1.y} A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x} ${o2.y} L ${i2.x} ${i2.y} A ${rInner} ${rInner} 0 ${large} 0 ${i1.x} ${i1.y} Z`;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export type WheelMode = 'idle' | 'spinning' | 'won';

interface FortuneWheelProps {
  segments: WheelSegmentConfig[];
  /** Initial rotation in degrees; live rotation is driven through `rotorRef` by the parent. */
  rotation: number;
  mode: WheelMode;
  pointerRef?: React.Ref<SVGGElement>;
  className?: string;
}

/**
 * Casino-grade prize wheel: brushed-gold bezel with chasing marquee bulbs, shaded
 * lacquer wedges, gold pins, a jewelled flapper and a fixed centre medallion.
 * The rotating layer is exposed through the forwarded ref so the parent can drive
 * the spin frame-by-frame without re-rendering React.
 */
export const FortuneWheel = forwardRef<HTMLDivElement, FortuneWheelProps>(function FortuneWheel(
  { segments, rotation, mode, pointerRef, className = '' },
  rotorRef,
) {
  const n = Math.max(segments.length, 1);
  const deg = 360 / n;
  const palettes = segmentPalettes(segments);

  return (
    <div className={`relative aspect-square select-none ${className}`}>
      {/* ---------- Static bezel & marquee bulbs ---------- */}
      <svg viewBox="0 0 600 600" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <defs>
          <linearGradient id="fw-frame" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff1c1" />
            <stop offset="18%" stopColor="#d9a93e" />
            <stop offset="40%" stopColor="#7a5010" />
            <stop offset="58%" stopColor="#f0cb6c" />
            <stop offset="78%" stopColor="#8a5c14" />
            <stop offset="100%" stopColor="#e9c667" />
          </linearGradient>
          <radialGradient id="fw-shadow" cx="50%" cy="50%" r="50%">
            <stop offset="80%" stopColor="rgba(0,0,0,0.9)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <filter id="bulbGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={C} cy={C + 6} r={299} fill="url(#fw-shadow)" />
        {/* Gold bezel */}
        <circle cx={C} cy={C} r={280} fill="none" stroke="url(#fw-frame)" strokeWidth={38} />
        <circle cx={C} cy={C} r={298} fill="none" stroke="#3b2606" strokeWidth={2} />
        <circle cx={C} cy={C} r={293} fill="none" stroke="rgba(255,240,200,0.35)" strokeWidth={1} />
        <circle cx={C} cy={C} r={262} fill="#0b0805" stroke="#2a1b04" strokeWidth={4} />

        {/* Marquee bulbs */}
        {Array.from({ length: BULBS }).map((_, i) => {
          const p = polar(280, (i * 360) / BULBS);
          const cls = mode === 'spinning' ? 'bulb-chase' : mode === 'won' ? 'bulb-win' : 'bulb-idle';
          const delay =
            mode === 'spinning' ? `${-(i / BULBS) * 0.6}s` : mode === 'won' ? `${(i % 2) * 0.35}s` : `${(i % 2) * 1.2}s`;
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={8} fill="#2a1b04" stroke="rgba(255,235,180,0.45)" strokeWidth={1} />
              <circle cx={p.x} cy={p.y} r={5.2} className={cls} style={{ animationDelay: delay }} fill="#f0c350" />
            </g>
          );
        })}
      </svg>

      {/* ---------- Rotating wedge layer ---------- */}
      <div
        ref={rotorRef}
        className="absolute inset-0 will-change-transform"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <svg viewBox="0 0 600 600" className="w-full h-full" role="img" aria-label="Roue de la Fortune">
          <defs>
            {(Object.keys(PALETTES) as PaletteKey[]).map((key) => (
              <radialGradient key={key} id={`fw-w-${key}`} cx={C} cy={C} r={R_WEDGE} gradientUnits="userSpaceOnUse">
                <stop offset="30%" stopColor={PALETTES[key].deep} />
                <stop offset="72%" stopColor={PALETTES[key].base} />
                <stop offset="96%" stopColor={PALETTES[key].light} />
                <stop offset="100%" stopColor={PALETTES[key].base} />
              </radialGradient>
            ))}
            <radialGradient id="fw-pin" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#fffbe8" />
              <stop offset="45%" stopColor="#e2b54e" />
              <stop offset="100%" stopColor="#5a3a08" />
            </radialGradient>
          </defs>

          {segments.map((seg, i) => {
            const start = i * deg;
            const mid = start + deg / 2;
            const pal = PALETTES[palettes[i]];
            const [primary, secondary] = splitLabel(seg.label);
            const Icon = segmentIcon(seg);
            const iconPos = polar(226, mid);
            const labelPos = polar(158, mid);
            const primarySize = primary.length > 8 ? 15 : primary.length > 6 ? 18 : 21;

            return (
              <g key={seg.id}>
                <path d={wedgePath(start, start + deg, R_WEDGE, R_INNER)} fill={`url(#fw-w-${palettes[i]})`} />
                {/* thin inner bevel */}
                <path
                  d={wedgePath(start + 0.6, start + deg - 0.6, R_WEDGE - 4, R_INNER + 4)}
                  fill="none"
                  stroke="rgba(255,240,200,0.10)"
                  strokeWidth={1}
                />

                {/* Icon, upright toward the rim */}
                <g transform={`translate(${iconPos.x} ${iconPos.y}) rotate(${mid})`}>
                  <circle r={17} fill="rgba(0,0,0,0.28)" stroke={pal.accent} strokeOpacity={0.55} strokeWidth={1} />
                  <Icon x={-10} y={-10} size={20} color={pal.accent} strokeWidth={1.8} />
                </g>

                {/* Two-line radial label */}
                <g transform={`translate(${labelPos.x} ${labelPos.y}) rotate(${mid + 90})`}>
                  <text
                    y={-5}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={pal.text}
                    fontFamily="Cinzel, Georgia, serif"
                    fontWeight={800}
                    fontSize={primarySize}
                    letterSpacing="0.02em"
                    style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.35)', strokeWidth: 2 }}
                  >
                    {primary}
                  </text>
                  <text
                    y={12}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={pal.accent}
                    fontFamily="Inter, sans-serif"
                    fontWeight={700}
                    fontSize={8.5}
                    letterSpacing="0.22em"
                  >
                    {secondary}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Gold dividers & pins */}
          {segments.map((seg, i) => {
            const a = polar(R_WEDGE, i * deg);
            const b = polar(R_INNER, i * deg);
            const pin = polar(R_WEDGE - 9, i * deg);
            return (
              <g key={`div-${seg.id}`}>
                <line x1={b.x} y1={b.y} x2={a.x} y2={a.y} stroke="#1a1104" strokeWidth={4} />
                <line x1={b.x} y1={b.y} x2={a.x} y2={a.y} stroke="#d9a93e" strokeWidth={1.6} />
                <circle cx={pin.x} cy={pin.y + 1.5} r={6} fill="rgba(0,0,0,0.5)" />
                <circle cx={pin.x} cy={pin.y} r={5.5} fill="url(#fw-pin)" stroke="#3b2606" strokeWidth={0.8} />
              </g>
            );
          })}

          {/* Inner gold ring */}
          <circle cx={C} cy={C} r={R_INNER} fill="none" stroke="#1a1104" strokeWidth={9} />
          <circle cx={C} cy={C} r={R_INNER} fill="none" stroke="url(#fw-frame)" strokeWidth={5} />
          <circle cx={C} cy={C} r={R_WEDGE} fill="none" stroke="#d9a93e" strokeWidth={2} />
        </svg>
      </div>

      {/* ---------- Static overlay: gloss, winner highlight, hub, flapper ---------- */}
      <svg viewBox="0 0 600 600" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        <defs>
          <linearGradient id="fw-gloss" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.20)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0.03)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <radialGradient id="fw-hub" cx="40%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#2b2418" />
            <stop offset="60%" stopColor="#0c0a07" />
            <stop offset="100%" stopColor="#000" />
          </radialGradient>
          <linearGradient id="fw-flapper" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff6d0" />
            <stop offset="35%" stopColor="#e2b54e" />
            <stop offset="75%" stopColor="#8a5c14" />
            <stop offset="100%" stopColor="#5a3a08" />
          </linearGradient>
          <radialGradient id="fw-ruby" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffd1d6" />
            <stop offset="40%" stopColor="#e11d48" />
            <stop offset="100%" stopColor="#4c0519" />
          </radialGradient>
        </defs>

        {/* Gloss sweep */}
        <path d={`M ${C - R_WEDGE} ${C} A ${R_WEDGE} ${R_WEDGE} 0 0 1 ${C + R_WEDGE} ${C} Q ${C} ${C - 60} ${C - R_WEDGE} ${C} Z`} fill="url(#fw-gloss)" />

        {/* Winner highlight — the winning wedge always stops under the flapper */}
        {mode === 'won' && (
          <g className="win-glow">
            <path d={wedgePath(-deg / 2, deg / 2, R_WEDGE, R_INNER)} fill="rgba(255,240,190,0.18)" stroke="#fff3c4" strokeWidth={4} />
          </g>
        )}

        {/* Centre medallion (does not rotate) */}
        <circle cx={C} cy={C + 4} r={80} fill="rgba(0,0,0,0.6)" />
        <circle cx={C} cy={C} r={78} fill="url(#fw-frame)" />
        <circle cx={C} cy={C} r={68} fill="url(#fw-hub)" stroke="#2a1b04" strokeWidth={2} />
        <circle cx={C} cy={C} r={60} fill="none" stroke="rgba(226,181,78,0.45)" strokeWidth={1} strokeDasharray="2 4" />
        <image href="/diamond_casino_logo.png" x={C - 48} y={C - 30} width={96} height={54} preserveAspectRatio="xMidYMid meet" />
        <text x={C} y={C + 38} textAnchor="middle" fill="#e2b54e" fontFamily="Cinzel, serif" fontSize={9} fontWeight={700} letterSpacing="0.3em">
          FORTUNE
        </text>

        {/* Flapper / pointer — pivots at its top screw */}
        <g ref={pointerRef} style={{ transformOrigin: `${C}px 14px`, transition: 'transform 120ms cubic-bezier(.3,1.6,.5,1)' }}>
          <path d={`M ${C} 74 L ${C - 17} 26 Q ${C} 2 ${C + 17} 26 Z`} fill="rgba(0,0,0,0.55)" transform="translate(0 4)" />
          <path d={`M ${C} 74 L ${C - 17} 26 Q ${C} 2 ${C + 17} 26 Z`} fill="url(#fw-flapper)" stroke="#3b2606" strokeWidth={1.5} />
          <path d={`M ${C} 66 L ${C - 7} 34 L ${C} 28 Z`} fill="rgba(255,255,255,0.35)" />
          <circle cx={C} cy={24} r={9} fill="url(#fw-ruby)" stroke="#fff1c1" strokeWidth={1.5} />
          <circle cx={C - 3} cy={21} r={2.4} fill="rgba(255,255,255,0.8)" />
        </g>
      </svg>
    </div>
  );
});
