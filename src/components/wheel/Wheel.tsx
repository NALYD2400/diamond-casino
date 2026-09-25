import React, { forwardRef, useId, useMemo } from 'react';
import type { RewardType, WheelSegmentConfig } from '../../context/CasinoAdminContext';

/**
 * Roue de la Fortune façon machine à sous : quartiers colorés, trait sombre épais,
 * couronne d'ampoules et pointeur « cartoon ». Même encre que Diamond Mines.
 */

export type WheelMode = 'idle' | 'spinning' | 'won';

interface WheelProps {
  segments: WheelSegmentConfig[];
  /** Quartier à mettre en avant une fois la roue arrêtée */
  highlightIndex?: number | null;
  mode?: WheelMode;
  /** Pointeur, pour que le parent le fasse claquer à chaque picot */
  pointerRef?: React.Ref<HTMLDivElement>;
  className?: string;
}

const INK = '#140c22';
// Géométrie dans une viewBox -110..110
const R_ROTOR = 93;
const R_HUB = 22;
const BULBS = 32;

const PALETTES: Record<RewardType | 'chipsA' | 'chipsB' | 'chipsC', { light: string; dark: string; text: string; sub: string }> = {
  chipsA: { light: '#8f6bff', dark: '#3a1d8f', text: '#ffffff', sub: '#d9ccff' },
  chipsB: { light: '#4a8cff', dark: '#15327f', text: '#ffffff', sub: '#c9dcff' },
  chipsC: { light: '#b45cff', dark: '#4e1480', text: '#ffffff', sub: '#ecd2ff' },
  chips: { light: '#8f6bff', dark: '#3a1d8f', text: '#ffffff', sub: '#d9ccff' },
  vehicle: { light: '#ffe98a', dark: '#d48a0c', text: '#ffffff', sub: '#fff4c2' },
  mystery: { light: '#ff7fd4', dark: '#a0137a', text: '#ffffff', sub: '#ffd6f2' },
  clothing: { light: '#6ff0ff', dark: '#10789f', text: '#ffffff', sub: '#d2fbff' },
};

function polar(radius: number, angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [radius * Math.cos(a), radius * Math.sin(a)];
}

function shortChips(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}M`;
  if (n >= 10_000) return `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}K`;
  return n.toLocaleString('fr-FR').replace(/\s/g, ' ');
}

function wedgeText(seg: WheelSegmentConfig): { primary: string; secondary: string; emoji: string } {
  if (seg.type === 'chips' && typeof seg.value === 'number') return { primary: shortChips(seg.value), secondary: 'JETONS', emoji: '' };
  if (seg.type === 'vehicle') return { primary: 'VÉHICULE', secondary: 'JACKPOT', emoji: '🏎️' };
  if (seg.type === 'clothing') return { primary: 'VÊTEMENT', secondary: 'VIP', emoji: '👔' };
  const words = seg.label.trim().split(/\s+/);
  return {
    primary: (words[0] || 'MYSTÈRE').slice(0, 9).toUpperCase(),
    secondary: words.slice(1).join(' ').slice(0, 11).toUpperCase(),
    emoji: seg.icon && seg.icon.length <= 4 ? seg.icon : '🎁',
  };
}

function paletteFor(seg: WheelSegmentConfig, chipsRank: number) {
  if (seg.type !== 'chips') return PALETTES[seg.type] || PALETTES.mystery;
  return [PALETTES.chipsA, PALETTES.chipsB, PALETTES.chipsC][chipsRank % 3];
}

export const Wheel = forwardRef<HTMLDivElement, WheelProps>(
  ({ segments, highlightIndex = null, mode = 'idle', pointerRef, className = '' }, rotorRef) => {
    const uid = useId().replace(/:/g, '');
    const n = Math.max(segments.length, 1);
    const deg = 360 / n;

    const wedges = useMemo(() => {
      let chipsRank = 0;
      return segments.map((seg, i) => {
        const start = i * deg - 90;
        const end = (i + 1) * deg - 90;
        const [x1, y1] = polar(R_ROTOR, start);
        const [x2, y2] = polar(R_ROTOR, end);
        const pal = paletteFor(seg, seg.type === 'chips' ? chipsRank++ : 0);
        const text = wedgeText(seg);
        const longest = Math.max(text.primary.length, 4);
        return {
          seg,
          i,
          pal,
          text,
          fontSize: Math.min(10, 48 / longest),
          path: `M0 0 L${x1.toFixed(3)} ${y1.toFixed(3)} A${R_ROTOR} ${R_ROTOR} 0 ${deg > 180 ? 1 : 0} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`,
          divider: polar(R_ROTOR, start),
          centre: start + deg / 2,
        };
      });
    }, [segments, deg]);

    const bulbs = useMemo(() => Array.from({ length: BULBS }, (_, i) => polar(99.6, (i * 360) / BULBS - 90)), []);

    return (
      <div className={`relative aspect-square select-none wheel-root wheel-${mode} ${className}`}>
        {/* ----- Châssis fixe : jante, ampoules ----- */}
        <svg viewBox="-110 -110 220 220" className="absolute inset-0 w-full h-full" aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}rim`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.35" stopColor="#cbd5e1" />
              <stop offset="0.7" stopColor="#64748b" />
              <stop offset="1" stopColor="#1e293b" />
            </linearGradient>
            <radialGradient id={`${uid}ring`} cx="0.5" cy="0.4" r="0.6">
              <stop offset="0" stopColor="#4a2c8a" />
              <stop offset="1" stopColor="#1a0d3a" />
            </radialGradient>
          </defs>
          <circle r="107.5" fill={INK} />
          <circle r="105.5" fill={`url(#${uid}rim)`} />
          <circle r="103" fill={`url(#${uid}ring)`} stroke={INK} strokeWidth="2" />
          {bulbs.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="2.8" fill={INK} />
              <circle
                cx={x}
                cy={y}
                r="2"
                className="wheel-bulb wf-bulb"
                style={{ '--i': i, fill: i % 2 ? '#fff4b0' : '#ffffff' } as React.CSSProperties}
              />
            </g>
          ))}
          <circle r={R_ROTOR + 3} fill={INK} />
        </svg>

        {/* ----- Rotor ----- */}
        <div ref={rotorRef} className="absolute inset-0 will-change-transform" style={{ transform: 'rotate(0deg)' }}>
          <svg viewBox="-110 -110 220 220" className="w-full h-full" role="img" aria-label="Roue de la Fortune">
            <defs>
              {wedges.map(({ i, pal }) => (
                <radialGradient key={i} id={`${uid}w${i}`} cx="0" cy="0" r={R_ROTOR} gradientUnits="userSpaceOnUse">
                  <stop offset="0.2" stopColor={pal.dark} />
                  <stop offset="0.75" stopColor={pal.light} />
                  <stop offset="1" stopColor={pal.dark} />
                </radialGradient>
              ))}
              <radialGradient id={`${uid}gloss`} cx="0.35" cy="0.2" r="0.8">
                <stop offset="0" stopColor="rgba(255,255,255,0.28)" />
                <stop offset="0.5" stopColor="rgba(255,255,255,0.04)" />
                <stop offset="1" stopColor="rgba(255,255,255,0)" />
              </radialGradient>
            </defs>

            {wedges.map(({ i, path }) => (
              <path key={`w${i}`} d={path} fill={`url(#${uid}w${i})`} />
            ))}

            {highlightIndex !== null &&
              wedges.map(({ i, path }) =>
                i === highlightIndex ? (
                  <path key={`h${i}`} d={path} fill="rgba(255,255,255,0.22)" stroke="#fff4b0" strokeWidth="2.4" className="wheel-win-pulse" />
                ) : (
                  <path key={`d${i}`} d={path} fill="rgba(10,4,20,0.62)" />
                ),
              )}

            {/* Séparations */}
            {wedges.map(({ i, divider: [dx, dy] }) => (
              <line key={`l${i}`} x1="0" y1="0" x2={dx} y2={dy} stroke={INK} strokeWidth="2.2" />
            ))}

            {/* Libellés : lecture du centre vers l'extérieur */}
            {wedges.map(({ i, centre, text, pal, fontSize }) => (
              <g key={`t${i}`} transform={`rotate(${centre})`}>
                {text.emoji && (
                  <text x={83} y={0} fontSize={8.5} textAnchor="middle" dominantBaseline="central" transform="rotate(90 83 0)">
                    {text.emoji}
                  </text>
                )}
                <g transform={`translate(${text.emoji ? 57 : 62}, 0)`}>
                  <text
                    x={0}
                    y={text.secondary ? -2.6 : 0}
                    fill={pal.text}
                    stroke={INK}
                    strokeWidth={2.2}
                    paintOrder="stroke"
                    strokeLinejoin="round"
                    fontSize={fontSize}
                    fontFamily="'Luckiest Guy', 'Lilita One', system-ui, sans-serif"
                    letterSpacing={0.3}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {text.primary}
                  </text>
                  {text.secondary && (
                    <text
                      x={0}
                      y={fontSize / 2 + 1.8}
                      fill={pal.sub}
                      stroke={INK}
                      strokeWidth={1.2}
                      paintOrder="stroke"
                      fontSize={3.4}
                      fontFamily="'Oswald', system-ui, sans-serif"
                      fontWeight={700}
                      letterSpacing={0.5}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {text.secondary}
                    </text>
                  )}
                </g>
              </g>
            ))}

            {/* Picots aux séparations */}
            {wedges.map(({ i, divider: [dx, dy] }) => (
              <g key={`p${i}`}>
                <circle cx={dx * 0.97} cy={dy * 0.97} r="2.6" fill={INK} />
                <circle cx={dx * 0.97} cy={dy * 0.97} r="1.7" fill="#f1f5f9" />
                <circle cx={dx * 0.97 - 0.5} cy={dy * 0.97 - 0.5} r="0.6" fill="#fff" />
              </g>
            ))}

            <circle r={R_ROTOR} fill={`url(#${uid}gloss)`} pointerEvents="none" />
            <circle r={R_ROTOR} fill="none" stroke={INK} strokeWidth="2.5" />
          </svg>
        </div>

        {/* ----- Moyeu fixe ----- */}
        <svg viewBox="-110 -110 220 220" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
          <defs>
            <radialGradient id={`${uid}hub`} cx="0.4" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#3a2470" />
              <stop offset="1" stopColor="#0d0620" />
            </radialGradient>
            <linearGradient id={`${uid}hubrim`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.5" stopColor="#cbd5e1" />
              <stop offset="1" stopColor="#475569" />
            </linearGradient>
          </defs>
          <circle r={R_HUB + 4} fill={INK} />
          <circle r={R_HUB + 1.5} fill={`url(#${uid}hubrim)`} />
          <circle r={R_HUB - 1} fill={`url(#${uid}hub)`} stroke={INK} strokeWidth="1.5" />
          <image href="/wheel_hub_logo.png" x="-18" y="-18" width="36" height="36" preserveAspectRatio="xMidYMid meet" />
        </svg>

        {/* ----- Pointeur ----- */}
        <div
          ref={pointerRef}
          className="absolute left-1/2 top-[-3%] z-20 w-[11%] max-w-[64px] min-w-[34px] -translate-x-1/2 origin-[50%_30%] pointer-events-none"
          aria-hidden="true"
        >
          <svg viewBox="0 0 60 80" className="w-full drop-shadow-[0_6px_0_rgba(20,12,34,0.6)]">
            <defs>
              <linearGradient id={`${uid}ptr`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="0.5" stopColor="#ffe98a" />
                <stop offset="1" stopColor="#d48a0c" />
              </linearGradient>
            </defs>
            <path d="M30 76 L6 28 A26 26 0 1 1 54 28 Z" fill={`url(#${uid}ptr)`} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
            <path d="M14 22 A17 17 0 0 1 30 8" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.85" />
            <circle cx="30" cy="24" r="9" fill="#ff4a8a" stroke={INK} strokeWidth="4" />
            <circle cx="27" cy="21" r="2.6" fill="#fff" opacity="0.9" />
          </svg>
        </div>
      </div>
    );
  },
);

Wheel.displayName = 'Wheel';
