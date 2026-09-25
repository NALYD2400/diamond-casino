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

// Geometry in a -110..110 viewBox
const R_ROTOR = 86;
const R_HUB = 25;
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

function fmtChips(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR')}M`;
  return n.toLocaleString('fr-FR').replace(/ | /g, ' ');
}

interface WedgeTextData {
  primary: string;
  secondary: string;
  fontSize: number;
}

/** Compute clean, non-overflowing text labels */
function formatWedgeText(seg: WheelSegmentConfig): WedgeTextData {
  if (seg.type === 'chips' && typeof seg.value === 'number') {
    const primary = fmtChips(seg.value);
    return {
      primary,
      secondary: 'JETONS',
      fontSize: primary.length > 7 ? 4.2 : 4.8,
    };
  }

  if (seg.type === 'vehicle') {
    return {
      primary: 'VÉHICULE',
      secondary: 'PODIUM',
      fontSize: 4.2,
    };
  }

  if (seg.type === 'clothing') {
    return {
      primary: 'VÊTEMENT',
      secondary: 'VIP STYLE',
      fontSize: 4.0,
    };
  }

  if (seg.type === 'mystery') {
    return {
      primary: 'MYSTÈRE',
      secondary: 'DIAMOND',
      fontSize: 4.1,
    };
  }

  // Fallback for custom configured admin labels
  const words = seg.label.trim().split(/\s+/);
  if (words.length === 1) {
    const primary = words[0].slice(0, 12);
    return {
      primary,
      secondary: '',
      fontSize: Math.min(4.6, 26 / Math.max(primary.length * 0.65, 1)),
    };
  }

  const mid = Math.ceil(words.length / 2);
  const primary = words.slice(0, mid).join(' ').slice(0, 12);
  const secondary = words.slice(mid).join(' ').slice(0, 14);
  const longest = Math.max(primary.length, secondary.length);
  return {
    primary,
    secondary,
    fontSize: Math.min(4.2, 26 / Math.max(longest * 0.65, 1)),
  };
}

function getWedgeTheme(seg: WheelSegmentConfig, index: number) {
  if (seg.type === 'vehicle') {
    return {
      fill: 'url(#w-platinum-wedge)',
      primaryColor: '#ffffff',
      secondaryColor: '#cbd5e1',
      iconColor: '#ffffff',
      accentColor: '#ffffff',
      isPodium: true,
    };
  }
  if (seg.type === 'mystery') {
    return {
      fill: index % 2 ? 'url(#w-wedge-a)' : 'url(#w-wedge-b)',
      primaryColor: '#ffffff',
      secondaryColor: '#94a3b8',
      iconColor: '#e2e8f0',
      accentColor: '#cbd5e1',
      isPodium: false,
    };
  }
  if (seg.type === 'clothing') {
    return {
      fill: index % 2 ? 'url(#w-wedge-a)' : 'url(#w-wedge-b)',
      primaryColor: '#ffffff',
      secondaryColor: '#94a3b8',
      iconColor: '#e2e8f0',
      accentColor: '#cbd5e1',
      isPodium: false,
    };
  }
  // Standard chips
  const fill = index % 2 ? 'url(#w-wedge-a)' : 'url(#w-wedge-b)';
  return {
    fill,
    primaryColor: '#ffffff',
    secondaryColor: '#64748b',
    iconColor: '#ffffff',
    accentColor: '#94a3b8',
    isPodium: false,
  };
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
          const [x1, y1] = polar(R_ROTOR, start);
          const [x2, y2] = polar(R_ROTOR, end);
          const centre = start + deg / 2;
          const text = formatWedgeText(seg);
          const theme = getWedgeTheme(seg, i);
          const Icon = ICONS[seg.type] || Gift;

          return {
            seg,
            i,
            path: `M0 0 L${x1.toFixed(3)} ${y1.toFixed(3)} A${R_ROTOR} ${R_ROTOR} 0 ${deg > 180 ? 1 : 0} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`,
            divider: polar(R_ROTOR, start),
            centre,
            text,
            theme,
            Icon,
          };
        }),
      [segments, deg, n],
    );

    const perimeterPips = useMemo(
      () => Array.from({ length: BULBS }, (_, i) => polar(92.5, (i * 360) / BULBS - 90)),
      [],
    );

    return (
      <div className={`relative aspect-square select-none wheel-root wheel-${mode} ${className}`}>
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          <defs>
            {/* Bezel Ring Titanium Monochrome */}
            <radialGradient id="w-bezel-rim" cx="50%" cy="50%" r="50%">
              <stop offset="82%" stopColor="#07080a" />
              <stop offset="90%" stopColor="#1a1d26" />
              <stop offset="97%" stopColor="#0f1117" />
              <stop offset="100%" stopColor="#050608" />
            </radialGradient>

            {/* Alternating Sleek Wedges Monochrome */}
            <radialGradient id="w-wedge-a" cx="0" cy="0" r={R_ROTOR} gradientUnits="userSpaceOnUse">
              <stop offset="25%" stopColor="#07080a" />
              <stop offset="75%" stopColor="#0f1116" />
              <stop offset="100%" stopColor="#141720" />
            </radialGradient>

            <radialGradient id="w-wedge-b" cx="0" cy="0" r={R_ROTOR} gradientUnits="userSpaceOnUse">
              <stop offset="25%" stopColor="#0b0d12" />
              <stop offset="75%" stopColor="#151821" />
              <stop offset="100%" stopColor="#1d222e" />
            </radialGradient>

            {/* Special Vehicle Luxury Platinum Wedge */}
            <radialGradient id="w-platinum-wedge" cx="0" cy="0" r={R_ROTOR} gradientUnits="userSpaceOnUse">
              <stop offset="20%" stopColor="#10131a" />
              <stop offset="65%" stopColor="#222838" />
              <stop offset="100%" stopColor="#323b52" />
            </radialGradient>

            {/* Specular Sheen */}
            <radialGradient id="w-gloss-overlay" cx="30%" cy="20%" r="75%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.01)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>

            {/* Minimalist Center Hub */}
            <radialGradient id="w-hub-body" cx="45%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#1c202a" />
              <stop offset="60%" stopColor="#0d0f14" />
              <stop offset="100%" stopColor="#050608" />
            </radialGradient>

            {/* Soft Shadow Filter for Text */}
            <filter id="w-clean-shadow" x="-20%" y="-40%" width="140%" height="180%">
              <feDropShadow dx="0" dy="0.8" stdDeviation="0.8" floodColor="#000000" floodOpacity="0.95" />
            </filter>
          </defs>
        </svg>

        {/* ============================================================ */}
        {/* STATIC BEZEL: Sleek Swiss Horology Outer Chassis              */}
        {/* ============================================================ */}
        <svg viewBox="-110 -110 220 220" className="absolute inset-0 w-full h-full" aria-hidden="true">
          {/* Outer Chassis */}
          <circle r="98" fill="url(#w-bezel-rim)" stroke="#1a1d26" strokeWidth="1" />
          <circle r="95.5" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
          <circle r="88" fill="none" stroke="#262b38" strokeWidth="1.2" />

          {/* Precision Perimeter Indices */}
          <g>
            {perimeterPips.map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="1.2"
                className="wheel-pip transition-opacity duration-300"
                style={{ '--i': i } as React.CSSProperties}
              />
            ))}
          </g>
        </svg>

        {/* ============================================================ */}
        {/* ROTOR: Rotating disc containing wedges, icons & labels       */}
        {/* ============================================================ */}
        <div ref={rotorRef} className="absolute inset-0 will-change-transform" style={{ transform: 'rotate(0deg)' }}>
          <svg viewBox="-110 -110 220 220" className="w-full h-full" role="img" aria-label="Roue de la Fortune">
            {/* Wedge Wedges */}
            {wedges.map(({ seg, i, path, theme }) => (
              <path key={`w-${seg.id}-${i}`} d={path} fill={theme.fill} />
            ))}

            {/* Win Highlight: dim others, subtly illuminate winner */}
            {highlightIndex !== null &&
              wedges.map(({ i, path }) =>
                i === highlightIndex ? (
                  <path
                    key={`hl-${i}`}
                    d={path}
                    fill="rgba(255,255,255,0.18)"
                    stroke="#ffffff"
                    strokeWidth="1.2"
                    className="wheel-win-pulse"
                  />
                ) : (
                  <path key={`dim-${i}`} d={path} fill="rgba(0,0,0,0.65)" />
                ),
              )}

            {/* Hairline Wedge Dividers */}
            {wedges.map(({ i, divider: [dx, dy], seg }) => (
              <line
                key={`d-${i}`}
                x1="0"
                y1="0"
                x2={dx}
                y2={dy}
                stroke={seg.type === 'vehicle' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.08)'}
                strokeWidth="0.75"
              />
            ))}

            {/* Wedge Labels & Icons — Radially Oriented with zero overflow */}
            {wedges.map(({ i, centre, text, theme, Icon }) => (
              <g key={`content-${i}`} transform={`rotate(${centre})`}>
                {/* Minimalist Category Icon near outer rim (r = 73) */}
                <g transform="translate(73, 0) rotate(90)">
                  <Icon
                    x={-3.4}
                    y={-3.4}
                    width={6.8}
                    height={6.8}
                    color={theme.iconColor}
                    strokeWidth={1.8}
                  />
                </g>

                {/* Primary & Secondary Label (Centered at r = 51) */}
                <g transform="translate(51, 0)" filter="url(#w-clean-shadow)">
                  {/* Primary Hero Label */}
                  <text
                    x={0}
                    y={text.secondary ? -2.2 : 0}
                    fill={theme.primaryColor}
                    fontSize={text.fontSize}
                    fontFamily='"Inter Tight", "Inter", sans-serif'
                    fontWeight={800}
                    letterSpacing={0.4}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {text.primary}
                  </text>

                  {/* Secondary Sub Label */}
                  {text.secondary && (
                    <text
                      x={0}
                      y={2.4}
                      fill={theme.secondaryColor}
                      fontSize={2.5}
                      fontFamily='"Geist Mono", monospace'
                      fontWeight={600}
                      letterSpacing={0.8}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {text.secondary}
                    </text>
                  )}
                </g>
              </g>
            ))}

            {/* Precision Rim Studs at Segment Outer Dividers (r = 86) */}
            {wedges.map(({ i, divider: [dx, dy] }) => (
              <g key={`stud-${i}`}>
                <circle cx={dx} cy={dy} r="1.5" fill="#141720" stroke="#94a3b8" strokeWidth="0.5" />
                <circle cx={dx - 0.3} cy={dy - 0.3} r="0.4" fill="#ffffff" opacity="0.95" />
              </g>
            ))}

            {/* Subtle Surface Gloss Ring */}
            <circle r={R_ROTOR} fill="url(#w-gloss-overlay)" pointerEvents="none" />
          </svg>
        </div>

        {/* ============================================================ */}
        {/* STATIC CENTER HUB: Minimalist Luxury Monochrome Medallion    */}
        {/* ============================================================ */}
        <svg viewBox="-110 -110 220 220" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
          {/* Bevel Shadow & Concentric Precision Rings */}
          <circle r={R_HUB} fill="#050608" stroke="#252a36" strokeWidth="1" />
          <circle r="23" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" />
          <circle r="21.5" fill="url(#w-hub-body)" />
          <circle r="19" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />

          {/* Requested Center Logo */}
          <image
            href="/wheel_hub_logo.png"
            x="-19"
            y="-19"
            width="38"
            height="38"
            preserveAspectRatio="xMidYMid meet"
            className="select-none pointer-events-none drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]"
          />
        </svg>

        {/* ============================================================ */}
        {/* FLAPPER POINTER: Razor-sharp Titanium Monochrome Needle      */}
        {/* ============================================================ */}
        <div
          ref={pointerRef}
          className="absolute left-1/2 top-[2%] z-20 w-[6%] max-w-[30px] min-w-[20px] -translate-x-1/2 origin-[50%_15%] transition-transform duration-75 pointer-events-none"
          aria-hidden="true"
        >
          <svg viewBox="0 0 28 44" className="w-full drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)]" fill="none">
            {/* Sleek Minimalist Arrow Indicator */}
            <path
              d="M14 42 L3 12 A11 11 0 1 1 25 12 Z"
              fill="#0a0c10"
              stroke="#ffffff"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            {/* Inner Chamfer */}
            <path
              d="M14 38 L6 13 A8 8 0 1 1 22 13 Z"
              fill="#181c26"
            />
            {/* Center Pivot Jewel */}
            <circle cx="14" cy="12" r="4.5" fill="#0b0d13" stroke="#cbd5e1" strokeWidth="0.8" />
            <circle cx="14" cy="12" r="2.2" fill="#ffffff" />
            <circle cx="13" cy="11" r="0.6" fill="#cbd5e1" />
          </svg>
        </div>
      </div>
    );
  },
);

Wheel.displayName = 'Wheel';
