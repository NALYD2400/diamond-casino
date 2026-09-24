import React, { forwardRef, useMemo } from 'react';
import { Car, Coins, Gift, Shirt, type LucideIcon } from 'lucide-react';
import type { RewardType, WheelSegmentConfig } from '../../context/CasinoAdminContext';

export type WheelMode = 'idle' | 'spinning' | 'won';

interface WheelProps {
  segments: WheelSegmentConfig[];
  /** Index of the segment to highlight once the wheel has stopped */
  highlightIndex?: number | null;
  mode?: WheelMode;
  /** Pointer element, so the parent can make it flick on each pin */
  pointerRef?: React.Ref<HTMLDivElement>;
  className?: string;
}

// Geometry, in a -110..110 viewBox
const R = 86; // wedge radius
const BULBS = 32;

const ICONS: Record<RewardType, LucideIcon> = {
  vehicle: Car,
  chips: Coins,
  mystery: Gift,
  clothing: Shirt,
};

function polar(radius: number, angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [radius * Math.cos(a), radius * Math.sin(a)];
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR').replace(/ | /g, ' ');
}

/** Split a label into at most two balanced lines */
function splitLines(label: string): string[] {
  const words = label.trim().split(/\s+/);
  if (words.length < 2) return [label];
  let best = [label];
  let bestLen = Infinity;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const len = Math.max(lines[0].length, lines[1].length);
    if (len < bestLen) {
      best = lines;
      bestLen = len;
    }
  }
  return best;
}

/** Big line(s) + small caption shown on a wedge */
function wedgeText(seg: WheelSegmentConfig): { lines: string[]; sub: string } {
  const numeric = typeof seg.value === 'number';
  const genericLabel = /^\$?[\d\s]+(JETONS|CASH)?$/i.test(seg.label.replace(/ | /g, ' ').trim());
  if (seg.type === 'chips' && numeric) return { lines: [fmt(seg.value as number)], sub: genericLabel ? 'JETONS' : seg.label };
  return { lines: splitLines(seg.label), sub: '' };
}

function wedgeTheme(seg: WheelSegmentConfig, index: number) {
  if (seg.type === 'vehicle') return { fill: 'url(#w-gold-wedge)', main: '#1a1204', sub: '#3b2a0a', icon: '#1a1204' };
  const fill = index % 2 ? 'url(#w-wedge-a)' : 'url(#w-wedge-b)';
  if (seg.type === 'mystery' || seg.type === 'clothing') return { fill, main: '#fbbf24', sub: '#a3a3a3', icon: '#fbbf24' };
  return { fill, main: '#ffffff', sub: '#fcd34d', icon: '#fcd34d' };
}

export const Wheel = forwardRef<HTMLDivElement, WheelProps>(
  ({ segments, highlightIndex = null, mode = 'idle', pointerRef, className = '' }, rotorRef) => {
    const n = Math.max(segments.length, 1);
    const deg = 360 / n;

    const wedges = useMemo(
      () =>
        segments.map((seg, i) => {
          const start = i * deg - 90;
          const end = (i + 1) * deg - 90;
          const [x1, y1] = polar(R, start);
          const [x2, y2] = polar(R, end);
          const centre = start + deg / 2;
          const flip = centre > 90 && centre < 270;
          const text = wedgeText(seg);
          const longest = Math.max(...text.lines.map((l) => l.length), 1);
          const mainSize = Math.min(text.lines.length > 1 ? 6 : n > 12 ? 8.5 : 10, 36 / (longest * 0.62));
          return {
            seg,
            i,
            path: `M0 0 L${x1.toFixed(3)} ${y1.toFixed(3)} A${R} ${R} 0 ${deg > 180 ? 1 : 0} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`,
            divider: polar(R, start),
            textTransform: `rotate(${centre}) translate(50 0)${flip ? ' rotate(180)' : ''}`,
            iconTransform: `rotate(${centre}) translate(76 0) rotate(90)`,
            text,
            mainSize,
            theme: wedgeTheme(seg, i),
            Icon: ICONS[seg.type] || Gift,
          };
        }),
      [segments, deg, n],
    );

    const bulbs = useMemo(() => Array.from({ length: BULBS }, (_, i) => polar(97, (i * 360) / BULBS - 90)), []);

    return (
      <div className={`relative aspect-square select-none wheel-${mode} ${className}`}>
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          <defs>
            <linearGradient id="w-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fff3c4" />
              <stop offset="22%" stopColor="#f5c451" />
              <stop offset="45%" stopColor="#9a6a12" />
              <stop offset="62%" stopColor="#f3c14f" />
              <stop offset="80%" stopColor="#8a5a0c" />
              <stop offset="100%" stopColor="#fde68a" />
            </linearGradient>
            <linearGradient id="w-gold-soft" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#7c5410" />
              <stop offset="50%" stopColor="#e8b54a" />
              <stop offset="100%" stopColor="#6b470c" />
            </linearGradient>
            <radialGradient id="w-gold-wedge" cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse">
              <stop offset="15%" stopColor="#8a560b" />
              <stop offset="60%" stopColor="#f2b233" />
              <stop offset="100%" stopColor="#fde9a8" />
            </radialGradient>
            <radialGradient id="w-wedge-a" cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse">
              <stop offset="20%" stopColor="#050505" />
              <stop offset="100%" stopColor="#1f1f1f" />
            </radialGradient>
            <radialGradient id="w-wedge-b" cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse">
              <stop offset="20%" stopColor="#020202" />
              <stop offset="100%" stopColor="#121212" />
            </radialGradient>
            <radialGradient id="w-gloss" cx="35%" cy="25%" r="75%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
              <stop offset="45%" stopColor="rgba(255,255,255,0.03)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
            <radialGradient id="w-hub" cx="40%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#2a2a2a" />
              <stop offset="100%" stopColor="#000" />
            </radialGradient>
            <filter id="w-bulb-glow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="1.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="w-text-shadow" x="-20%" y="-50%" width="140%" height="200%">
              <feDropShadow dx="0" dy="0.6" stdDeviation="0.6" floodColor="#000" floodOpacity="0.8" />
            </filter>
          </defs>
        </svg>

        {/* Static bezel + marquee bulbs */}
        <svg viewBox="-110 -110 220 220" className="absolute inset-0 w-full h-full" aria-hidden="true">
          <circle r="108" fill="#000" />
          <circle r="104" fill="none" stroke="url(#w-gold)" strokeWidth="7" />
          <circle r="100.2" fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="0.8" />
          <circle r="107.6" fill="none" stroke="rgba(255,236,170,0.35)" strokeWidth="0.5" />
          <circle r="93" fill="#0a0a0a" stroke="url(#w-gold-soft)" strokeWidth="2.2" />
          <g filter="url(#w-bulb-glow)">
            {bulbs.map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="1.9"
                className="wheel-bulb"
                style={{ '--i': i } as React.CSSProperties}
              />
            ))}
          </g>
        </svg>

        {/* Rotor */}
        <div ref={rotorRef} className="absolute inset-0 will-change-transform" style={{ transform: 'rotate(0deg)' }}>
          <svg viewBox="-110 -110 220 220" className="w-full h-full" role="img" aria-label="Roue de la Fortune">
            {wedges.map(({ seg, i, path, theme }) => (
              <path key={`w-${seg.id}-${i}`} d={path} fill={theme.fill} />
            ))}

            {/* Win focus: dim the others, light up the winner */}
            {highlightIndex !== null &&
              wedges.map(({ i, path }) =>
                i === highlightIndex ? (
                  <path key={`hl-${i}`} d={path} fill="rgba(251,191,36,0.18)" stroke="#fde68a" strokeWidth="1.4" className="wheel-win-pulse" />
                ) : (
                  <path key={`dim-${i}`} d={path} fill="rgba(0,0,0,0.55)" />
                ),
              )}

            {/* Gold dividers */}
            {wedges.map(({ i, divider: [dx, dy] }) => (
              <line key={`d-${i}`} x1="0" y1="0" x2={dx} y2={dy} stroke="url(#w-gold-soft)" strokeWidth="0.7" opacity="0.9" />
            ))}

            {/* Labels & icons */}
            {wedges.map(({ i, text, mainSize, textTransform, iconTransform, theme, Icon }) => (
              <g key={`t-${i}`}>
                <g transform={iconTransform}>
                  <Icon x={-4.2} y={-4.2} width={8.4} height={8.4} color={theme.icon} strokeWidth={2} />
                </g>
                <g transform={textTransform} filter="url(#w-text-shadow)">
                  {text.lines.map((line, li) => (
                    <text
                      key={li}
                      y={text.lines.length > 1 ? (li - 0.5) * (mainSize + 1) : text.sub ? -1.2 : 0}
                      fill={theme.main}
                      fontSize={mainSize}
                      fontFamily='"Inter Tight", "Inter", sans-serif'
                      fontWeight={800}
                      letterSpacing={text.lines.length > 1 ? 0.3 : 0}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {line}
                    </text>
                  ))}
                  {text.sub && (
                  <text
                    y={mainSize / 2 + 2.6}
                    fill={theme.sub}
                    fontSize={3.3}
                    fontFamily='"Geist Mono", monospace'
                    fontWeight={600}
                    letterSpacing="0.9"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {text.sub.length > 22 ? `${text.sub.slice(0, 21)}…` : text.sub}
                  </text>
                  )}
                </g>
              </g>
            ))}

            {/* Rim studs */}
            {wedges.map(({ i, divider: [dx, dy] }) => (
              <g key={`s-${i}`}>
                <circle cx={dx} cy={dy} r="2.1" fill="url(#w-gold)" stroke="#3b2a0a" strokeWidth="0.4" />
                <circle cx={dx - 0.5} cy={dy - 0.5} r="0.6" fill="#fff8dc" />
              </g>
            ))}

            <circle r={R} fill="url(#w-gloss)" pointerEvents="none" />
          </svg>
        </div>

        {/* Static hub (logo stays upright) */}
        <svg viewBox="-110 -110 220 220" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
          <circle r="25" fill="rgba(0,0,0,0.6)" />
          <circle r="22.5" fill="url(#w-gold)" />
          <circle r="19.8" fill="url(#w-hub)" />
          <circle r="17.6" fill="none" stroke="rgba(251,191,36,0.45)" strokeWidth="0.5" />
          <image href="/diamond_casino_logo.png" x="-14" y="-14" width="28" height="28" preserveAspectRatio="xMidYMid meet" />
        </svg>

        {/* Pointer */}
        <div
          ref={pointerRef}
          className="absolute left-1/2 top-0 z-10 w-[9%] -translate-x-1/2 -translate-y-[22%] origin-[50%_28%] transition-transform duration-75"
          aria-hidden="true"
        >
          <svg viewBox="0 0 40 56" className="w-full drop-shadow-[0_6px_10px_rgba(0,0,0,0.8)]">
            <defs>
              <linearGradient id="w-ptr" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fff3c4" />
                <stop offset="45%" stopColor="#f2b233" />
                <stop offset="100%" stopColor="#7c5410" />
              </linearGradient>
            </defs>
            <path d="M20 54 L4 18 A17 17 0 1 1 36 18 Z" fill="url(#w-ptr)" stroke="#2a1d06" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="20" cy="16" r="7" fill="#0a0a0a" stroke="#2a1d06" strokeWidth="1" />
            <path d="M20 10.5 L25 16 L20 21.5 L15 16 Z" fill="#fff" opacity="0.92" />
            <path d="M20 10.5 L25 16 L20 16 Z" fill="#dbeafe" />
          </svg>
        </div>
      </div>
    );
  },
);

Wheel.displayName = 'Wheel';
