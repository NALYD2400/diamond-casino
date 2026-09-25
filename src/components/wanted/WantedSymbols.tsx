import React, { createContext, useContext, useId } from 'react';
import type { WantedSymbolId } from './wantedEngine';

/**
 * Symboles vectoriels originaux, style western « affiche usée ».
 * viewBox 100x100, contours sombres, couleurs désaturées.
 */

const INK = '#1c120c';
const PAPER = '#efe4cc';

const Uid = createContext('wd');
const useUid = () => useContext(Uid);

/** Cadre orné coloré des symboles premium */
const Plate: React.FC<{ c1: string; c2: string; inner: string; children: React.ReactNode }> = ({ c1, c2, inner, children }) => {
  const u = useUid();
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
      <defs>
        <linearGradient id={`${u}-plate`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
        <pattern id={`${u}-grain`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill="rgba(0,0,0,0.18)" />
          <circle cx="4" cy="4" r="0.5" fill="rgba(255,255,255,0.12)" />
        </pattern>
      </defs>
      <rect x="5" y="5" width="90" height="90" rx="4" fill={`url(#${u}-plate)`} stroke={INK} strokeWidth="3" />
      <rect x="11" y="11" width="78" height="78" rx="2" fill={inner} stroke={INK} strokeWidth="2" />
      {/* motifs d'angle */}
      {[
        [11, 11],
        [89, 11],
        [11, 89],
        [89, 89],
      ].map(([x, y]) => (
        <path key={`${x}${y}`} d={`M${x} ${y} m-5 0 l5 -5 l5 5 l-5 5 z`} fill={c1} stroke={INK} strokeWidth="1.5" />
      ))}
      <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="6" strokeDasharray="3 5" />
      {children}
      <rect x="5" y="5" width="90" height="90" rx="4" fill={`url(#${u}-grain)`} />
    </svg>
  );
};

const Card: React.FC<{ label: string }> = ({ label }) => {
  const u = useUid();
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
      <defs>
        <pattern id={`${u}-worn`} width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.8" fill="rgba(60,40,20,0.22)" />
          <circle cx="5" cy="5.5" r="0.5" fill="rgba(60,40,20,0.15)" />
        </pattern>
      </defs>
      <g transform="rotate(8 50 50)">
        <rect x="28" y="12" width="52" height="74" rx="5" fill="#c9bb9c" stroke={INK} strokeWidth="2.5" />
      </g>
      <g transform="rotate(-4 50 50)">
        <rect x="20" y="10" width="56" height="80" rx="5" fill={PAPER} stroke={INK} strokeWidth="3" />
        <rect x="20" y="10" width="56" height="80" rx="5" fill={`url(#${u}-worn)`} />
        <text
          x="48"
          y="67"
          textAnchor="middle"
          fontFamily="'Oswald', 'Rye', sans-serif"
          fontWeight="700"
          fontSize={label === '10' ? 40 : 48}
          fill="#2b2622"
          letterSpacing={label === '10' ? -3 : 0}
        >
          {label}
        </text>
        <path d="M27 20 l5 -4 l5 4 l-5 4 z" fill="#2b2622" />
      </g>
    </svg>
  );
};

const Revolver = () => (
  <Plate c1="#d4553a" c2="#7a1f14" inner="#5a1a12">
    <circle cx="50" cy="50" r="28" fill="#8c8a6e" stroke={INK} strokeWidth="3" />
    {[0, 60, 120, 180, 240, 300].map((a) => {
      const x = 50 + Math.cos((a * Math.PI) / 180) * 16;
      const y = 50 + Math.sin((a * Math.PI) / 180) * 16;
      return (
        <g key={a}>
          <circle cx={x} cy={y} r="8.5" fill="#d8c27a" stroke={INK} strokeWidth="2" />
          <circle cx={x} cy={y} r="4" fill="#a8883a" stroke={INK} strokeWidth="1" />
        </g>
      );
    })}
    <circle cx="50" cy="50" r="5" fill="#4a473a" stroke={INK} strokeWidth="1.5" />
  </Plate>
);

const Whiskey = () => (
  <Plate c1="#e08a3c" c2="#2f7a72" inner="#1f4f4a">
    <g transform="rotate(28 50 50)">
      <path d="M44 12 H56 V28 Q66 34 66 46 V86 Q66 90 62 90 H38 Q34 90 34 86 V46 Q34 34 44 28 Z" fill="#2a1d14" stroke={INK} strokeWidth="3" />
      <rect x="44" y="8" width="12" height="7" rx="1" fill="#8a5a2a" stroke={INK} strokeWidth="2" />
      <rect x="37" y="52" width="26" height="26" rx="2" fill={PAPER} stroke={INK} strokeWidth="1.5" />
      <text x="50" y="62" textAnchor="middle" fontFamily="'Rye', serif" fontSize="6" fill={INK}>
        WHISKEY
      </text>
      <path d="M40 66 H60 M40 70 H60 M40 74 H56" stroke={INK} strokeWidth="1.5" />
      <path d="M38 40 Q38 34 44 31" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" fill="none" />
    </g>
  </Plate>
);

const MoneyBag = () => (
  <Plate c1="#f2c94c" c2="#b8741a" inner="#c9563a">
    <path d="M40 22 Q50 30 60 22 L56 32 Q76 44 76 66 Q76 88 50 88 Q24 88 24 66 Q24 44 44 32 Z" fill="#c9a071" stroke={INK} strokeWidth="3" />
    <path d="M40 32 Q50 36 60 32" stroke={INK} strokeWidth="3" fill="none" />
    <path d="M36 50 Q30 62 34 76" stroke="rgba(255,255,255,0.3)" strokeWidth="3" fill="none" />
    <text x="50" y="76" textAnchor="middle" fontFamily="'Rye', serif" fontSize="30" fill={PAPER} stroke={INK} strokeWidth="1.5">
      $
    </text>
  </Plate>
);

const Skull = () => (
  <Plate c1="#5fb8d4" c2="#1f5a7a" inner="#2f6f86">
    {/* cornes */}
    <path d="M36 36 Q20 36 6 22 Q14 42 34 46 Z" fill="#e6dcc4" stroke={INK} strokeWidth="2.5" />
    <path d="M64 36 Q80 36 94 22 Q86 42 66 46 Z" fill="#e6dcc4" stroke={INK} strokeWidth="2.5" />
    {/* crâne de bovin */}
    <path d="M34 34 Q50 26 66 34 Q70 50 62 64 L58 86 Q50 92 42 86 L38 64 Q30 50 34 34 Z" fill="#f2ead6" stroke={INK} strokeWidth="3" />
    <path d="M40 44 Q44 40 47 46 Q44 52 40 48 Z" fill={INK} />
    <path d="M60 44 Q56 40 53 46 Q56 52 60 48 Z" fill={INK} />
    <path d="M50 52 L47 58 L53 58 Z" fill={INK} />
    <path d="M45 76 Q50 80 55 76" stroke={INK} strokeWidth="2" fill="none" />
    <path d="M50 30 L52 35 L57 35 L53 38 L55 43 L50 40 L45 43 L47 38 L43 35 L48 35 Z" fill="#d23a2a" stroke={INK} strokeWidth="1" />
  </Plate>
);

const Wild = () => {
  const u = useUid();
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
      <defs>
        <linearGradient id={`${u}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe89a" />
          <stop offset="50%" stopColor="#d9a52a" />
          <stop offset="100%" stopColor="#8a5a10" />
        </linearGradient>
      </defs>
      <rect x="5" y="5" width="90" height="90" rx="4" fill="#3f8f8a" stroke={INK} strokeWidth="3" />
      <rect x="11" y="11" width="78" height="78" rx="2" fill="#2a5f5c" stroke={INK} strokeWidth="2" />
      {/* étoile de shérif */}
      <path
        d="M50 8 L60 32 L86 30 L68 50 L86 70 L60 68 L50 92 L40 68 L14 70 L32 50 L14 30 L40 32 Z"
        fill={`url(#${u}-gold)`}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {[
        [50, 8],
        [86, 30],
        [86, 70],
        [50, 92],
        [14, 70],
        [14, 30],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="4" fill={`url(#${u}-gold)`} stroke={INK} strokeWidth="2" />
      ))}
      <rect x="6" y="38" width="88" height="26" rx="3" fill="#e0633a" stroke={INK} strokeWidth="3" />
      <text x="50" y="59" textAnchor="middle" fontFamily="'Rye', serif" fontSize="22" fill="#ffe89a" stroke={INK} strokeWidth="1.2">
        WILD
      </text>
    </svg>
  );
};

const Versus = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
    <path d="M50 4 L96 50 L50 96 L4 50 Z" fill="#e8c26a" stroke={INK} strokeWidth="3" />
    <path d="M50 12 L88 50 L50 88 L12 50 Z" fill="#f4e6c4" stroke={INK} strokeWidth="2" />
    {/* revolvers croisés */}
    {[-1, 1].map((d) => (
      <g key={d} transform={`translate(50 50) scale(${d} 1) rotate(-35)`}>
        <rect x="-4" y="-44" width="8" height="30" rx="2" fill="#4a5a66" stroke={INK} strokeWidth="2" />
        <rect x="-7" y="-16" width="14" height="14" rx="3" fill="#6a7a86" stroke={INK} strokeWidth="2" />
        <path d="M-6 -2 L6 -2 L10 22 L-2 26 Z" fill="#7a4a2a" stroke={INK} strokeWidth="2" />
      </g>
    ))}
    <rect x="20" y="36" width="60" height="30" rx="4" fill="#f4e6c4" stroke={INK} strokeWidth="3" />
    <text x="50" y="61" textAnchor="middle" fontFamily="'Oswald', sans-serif" fontWeight="700" fontSize="27" fill="#d23a2a" stroke={INK} strokeWidth="1.5">
      VS
    </text>
  </svg>
);

const Scatter: React.FC<{ kind: 'fs' | 'duel' | 'dead' }> = ({ kind }) => {
  const u = useUid();
  const cfg = {
    fs: { bg1: '#f2c94c', bg2: '#9a5a10', label: 'BONUS', color: '#2a1a0a' },
    duel: { bg1: '#e0633a', bg2: '#7a1f14', label: 'DUEL', color: '#ffe89a' },
    dead: { bg1: '#6a6a6a', bg2: '#1a1a1a', label: 'DEAD', color: '#e6dcc4' },
  }[kind];
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
      <defs>
        <radialGradient id={`${u}-sc`} cx="40%" cy="30%" r="80%">
          <stop offset="0%" stopColor={cfg.bg1} />
          <stop offset="100%" stopColor={cfg.bg2} />
        </radialGradient>
      </defs>
      <circle cx="50" cy="46" r="40" fill={`url(#${u}-sc)`} stroke={INK} strokeWidth="3" />
      <circle cx="50" cy="46" r="32" fill="none" stroke={INK} strokeWidth="1.5" strokeDasharray="2 3" />
      {kind === 'fs' && (
        <path d="M50 18 L57 36 L76 36 L61 48 L67 66 L50 55 L33 66 L39 48 L24 36 L43 36 Z" fill="#ffe89a" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      )}
      {kind === 'duel' && (
        <g stroke={INK} strokeWidth="2">
          <path d="M26 58 L46 30 L52 34 L34 62 Z" fill="#c9c9c9" />
          <path d="M74 58 L54 30 L48 34 L66 62 Z" fill="#c9c9c9" />
          <circle cx="50" cy="30" r="5" fill="#ffe89a" />
        </g>
      )}
      {kind === 'dead' && (
        <g stroke={INK} strokeWidth="2.5">
          <path d="M30 40 Q30 18 50 18 Q70 18 70 40 Q70 52 62 56 L62 66 L38 66 L38 56 Q30 52 30 40 Z" fill="#e6dcc4" />
          <circle cx="42" cy="40" r="6" fill={INK} />
          <circle cx="58" cy="40" r="6" fill={INK} />
          <path d="M50 46 L47 52 L53 52 Z" fill={INK} />
          <path d="M44 66 V60 M50 66 V60 M56 66 V60" />
        </g>
      )}
      <rect x="8" y="72" width="84" height="22" rx="3" fill={cfg.bg2} stroke={INK} strokeWidth="3" />
      <text x="50" y="89" textAnchor="middle" fontFamily="'Rye', serif" fontSize="17" fill={cfg.color}>
        {cfg.label}
      </text>
    </svg>
  );
};

export const WantedSymbol: React.FC<{ id: WantedSymbolId; className?: string }> = ({ id, className = 'w-full h-full' }) => {
  const uid = `wd${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  let node: React.ReactNode;
  switch (id) {
    case 'revolver':
      node = <Revolver />;
      break;
    case 'whiskey':
      node = <Whiskey />;
      break;
    case 'bag':
      node = <MoneyBag />;
      break;
    case 'skull':
      node = <Skull />;
      break;
    case 'wild':
      node = <Wild />;
      break;
    case 'vs':
      node = <Versus />;
      break;
    case 'fs':
    case 'duel':
    case 'dead':
      node = <Scatter kind={id} />;
      break;
    default:
      node = <Card label={id} />;
  }
  return (
    <div className={className}>
      <Uid.Provider value={uid}>{node}</Uid.Provider>
    </div>
  );
};

/** Logo « WANTED — DEAD OR A WILD » */
export const WantedLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`relative text-center leading-none select-none ${className}`}>
    <div
      className="font-['Rye'] text-[clamp(34px,8cqw,84px)] tracking-[0.02em]"
      style={{
        background: 'linear-gradient(180deg, #fff1b0 0%, #e0b040 45%, #a86a10 70%, #6a3a08 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        WebkitTextStroke: '2px #1c120c',
        filter: 'drop-shadow(0 4px 0 #1c120c)',
      }}
    >
      WANTED
    </div>
    <div
      className="font-['Oswald'] font-bold text-[clamp(12px,2.6cqw,28px)] tracking-[0.18em] -mt-1 text-[#4fb08a]"
      style={{ WebkitTextStroke: '1px #0f2a20', filter: 'drop-shadow(0 2px 0 #0f2a20)' }}
    >
      DEAD OR A WILD
    </div>
    {/* impacts de balles */}
    {[
      ['8%', '18%'],
      ['62%', '30%'],
      ['88%', '12%'],
    ].map(([l, t]) => (
      <span
        key={l}
        className="absolute w-[clamp(6px,1.2cqw,12px)] aspect-square rounded-full bg-[#1c120c] shadow-[0_0_0_2px_#6a4a2a]"
        style={{ left: l, top: t }}
      />
    ))}
  </div>
);
