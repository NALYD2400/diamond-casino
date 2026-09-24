import React, { forwardRef, useMemo } from 'react';
import type { WheelSegmentConfig } from '../../context/CasinoAdminContext';

interface WheelProps {
  segments: WheelSegmentConfig[];
  /** Index of the segment to highlight once the wheel has stopped */
  highlightIndex?: number | null;
  className?: string;
}

const R = 92; // segment radius in the -100..100 viewBox

function polar(radius: number, angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [radius * Math.cos(a), radius * Math.sin(a)];
}

function segmentStyle(seg: WheelSegmentConfig, index: number) {
  if (seg.type === 'vehicle') return { fill: 'url(#wheel-amber)', text: '#0a0a0a' };
  if (seg.type === 'mystery' || seg.type === 'clothing') return { fill: index % 2 ? '#1a1a1a' : '#121212', text: '#fbbf24' };
  if (seg.type === 'cash') return { fill: index % 2 ? '#1c1c1c' : '#141414', text: '#d4d4d4' };
  return { fill: index % 2 ? '#161616' : '#0b0b0b', text: '#ffffff' };
}

/**
 * Monochrome fortune wheel. Segment 0 starts at 12 o'clock and segments run clockwise,
 * so segment i is centred on (i + 0.5) * 360 / n degrees from the top.
 * Rotation is applied by the parent on the forwarded element.
 */
export const Wheel = forwardRef<HTMLDivElement, WheelProps>(({ segments, highlightIndex = null, className = '' }, rotorRef) => {
  const n = Math.max(segments.length, 1);
  const deg = 360 / n;

  const wedges = useMemo(
    () =>
      segments.map((seg, i) => {
        const start = i * deg - 90;
        const end = (i + 1) * deg - 90;
        const [x1, y1] = polar(R, start);
        const [x2, y2] = polar(R, end);
        const largeArc = deg > 180 ? 1 : 0;
        const centre = start + deg / 2;
        const flip = centre > 90 && centre < 270;
        return {
          seg,
          i,
          path: `M0 0 L${x1.toFixed(3)} ${y1.toFixed(3)} A${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`,
          textTransform: `rotate(${centre}) translate(${R * 0.6} 0)${flip ? ' rotate(180)' : ''}`,
          pin: polar(R - 3, start),
          style: segmentStyle(seg, i),
        };
      }),
    [segments, deg],
  );

  return (
    <div className={`relative aspect-square ${className}`}>
      {/* Pointer (fixed, outside the rotor) */}
      <div className="absolute left-1/2 -top-1 z-20 -translate-x-1/2" aria-hidden="true">
        <svg width="34" height="40" viewBox="0 0 34 40">
          <path d="M17 38 L3 6 Q17 -2 31 6 Z" fill="#fbbf24" stroke="#000" strokeWidth="2" />
          <circle cx="17" cy="11" r="3.5" fill="#000" />
        </svg>
      </div>

      <div ref={rotorRef} className="absolute inset-0 will-change-transform" style={{ transform: 'rotate(0deg)' }}>
        <svg viewBox="-100 -100 200 200" className="w-full h-full" role="img" aria-label="Roue de la Fortune">
          <defs>
            <linearGradient id="wheel-amber" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="55%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
            <radialGradient id="wheel-sheen" cx="50%" cy="35%" r="65%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>

          {/* Outer rim */}
          <circle r="99" fill="#050505" stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" />
          <circle r="94.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />

          {wedges.map(({ seg, i, path, textTransform, style }) => (
            <g key={`${seg.id}-${i}`}>
              <path d={path} fill={style.fill} stroke="rgba(255,255,255,0.14)" strokeWidth="0.35" />
              {highlightIndex === i && (
                <path d={path} fill="rgba(251,191,36,0.22)" stroke="#fbbf24" strokeWidth="1.2" className="wheel-win-pulse" />
              )}
              <text
                transform={textTransform}
                fill={style.text}
                fontSize={n > 12 ? 4.6 : 5.6}
                fontFamily='"Geist Mono", monospace'
                fontWeight={600}
                letterSpacing="0.3"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {seg.label.length > 18 ? `${seg.label.slice(0, 17)}…` : seg.label}
              </text>
            </g>
          ))}

          {/* Pins between segments */}
          {wedges.map(({ pin: [px, py], i }) => (
            <circle key={`pin-${i}`} cx={px} cy={py} r="1.1" fill="#e5e5e5" />
          ))}

          <circle r={R} fill="url(#wheel-sheen)" pointerEvents="none" />

          {/* Hub */}
          <circle r="21" fill="#000" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
          <circle r="17.5" fill="none" stroke="rgba(251,191,36,0.55)" strokeWidth="0.6" />
          <image href="/diamond_casino_logo.png" x="-13" y="-13" width="26" height="26" preserveAspectRatio="xMidYMid meet" />
        </svg>
      </div>
    </div>
  );
});

Wheel.displayName = 'Wheel';
