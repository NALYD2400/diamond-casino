import React, { useId, useMemo } from 'react';

/**
 * Illustrations vectorielles de Diamond Mines : diamant taillé, bombe, explosion,
 * blocs de roche, logo et décor de la mine. Trait sombre épais façon machine à sous.
 */

const INK = '#140c22';

export const GemArt: React.FC<{ className?: string; hue?: 'cyan' | 'pink' | 'gold' }> = ({ className = '', hue = 'cyan' }) => {
  const id = useId().replace(/:/g, '');
  const pal = {
    cyan: ['#f4ffff', '#9ef3ff', '#3fd2f2', '#1386b8', '#0b4a78'],
    pink: ['#fff0fb', '#ffb0e6', '#ff5fc4', '#c01d8a', '#6a0a4a'],
    gold: ['#ffffff', '#f1f5f9', '#cbd5e1', '#64748b', '#334155'],
  }[hue];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal[0]} />
          <stop offset="1" stopColor={pal[1]} />
        </linearGradient>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={pal[2]} />
          <stop offset="1" stopColor={pal[4]} />
        </linearGradient>
      </defs>
      {/* contour */}
      <path d="M30 20 H70 L90 40 L50 90 L10 40 Z" fill={INK} stroke={INK} strokeWidth="7" strokeLinejoin="round" />
      {/* couronne */}
      <path d="M30 20 L38 40 H10 Z" fill={pal[1]} />
      <path d="M70 20 L90 40 H62 Z" fill={pal[2]} />
      <path d="M30 20 H70 L62 40 H38 Z" fill={`url(#${id}t)`} />
      <path d="M30 20 L38 40 L50 20 Z" fill={pal[0]} opacity="0.55" />
      <path d="M70 20 L62 40 L50 20 Z" fill={pal[2]} opacity="0.35" />
      {/* pavillon */}
      <path d="M10 40 H38 L50 90 Z" fill={pal[2]} />
      <path d="M38 40 H62 L50 90 Z" fill={`url(#${id}p)`} />
      <path d="M62 40 H90 L50 90 Z" fill={pal[4]} />
      <path d="M24 40 L50 90 L38 40 Z" fill={pal[1]} opacity="0.35" />
      {/* arêtes */}
      <path d="M10 40 H90 M38 40 L50 90 L62 40 M30 20 L38 40 M70 20 L62 40" stroke={INK} strokeWidth="2.2" fill="none" strokeLinejoin="round" />
      {/* reflets */}
      <path d="M35 25 L44 25 L40 34 Z" fill="#fff" opacity="0.9" />
      <path d="M17 44 L27 44 L38 70 Z" fill="#fff" opacity="0.35" />
      <g className="mn-twinkle" style={{ transformOrigin: '76px 22px' }}>
        <path d="M76 10 L78.5 19.5 L88 22 L78.5 24.5 L76 34 L73.5 24.5 L64 22 L73.5 19.5 Z" fill="#fff" />
      </g>
    </svg>
  );
};

export const BombArt: React.FC<{ className?: string; lit?: boolean }> = ({ className = '', lit = true }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
    <defs>
      <radialGradient id="mn-bomb-body" cx="0.35" cy="0.35" r="0.75">
        <stop offset="0" stopColor="#6a6480" />
        <stop offset="0.45" stopColor="#2a2438" />
        <stop offset="1" stopColor="#0c0914" />
      </radialGradient>
    </defs>
    {/* mèche */}
    <path d="M62 26 Q70 10 84 14" stroke={INK} strokeWidth="7" fill="none" strokeLinecap="round" />
    <path d="M62 26 Q70 10 84 14" stroke="#c8a070" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeDasharray="4 3" />
    {lit && (
      <g className="mn-fuse" style={{ transformOrigin: '85px 13px' }}>
        <circle cx="85" cy="13" r="8" fill="#ffffff" opacity="0.55" />
        <path d="M85 3 L87 10 L95 9 L89 14 L94 20 L86 17 L83 24 L82 16 L75 15 L81 11 Z" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
      </g>
    )}
    {/* bouchon */}
    <rect x="48" y="22" width="20" height="14" rx="3" transform="rotate(35 58 29)" fill="#4a4460" stroke={INK} strokeWidth="4" />
    {/* corps */}
    <circle cx="44" cy="60" r="32" fill="url(#mn-bomb-body)" stroke={INK} strokeWidth="5" />
    <ellipse cx="32" cy="46" rx="9" ry="6" transform="rotate(-35 32 46)" fill="#fff" opacity="0.55" />
    <circle cx="25" cy="58" r="3" fill="#fff" opacity="0.35" />
    {/* crâne */}
    <g opacity="0.9">
      <path d="M44 55 q-10 0 -10 9 q0 5 4 7 v5 h12 v-5 q4 -2 4 -7 q0 -9 -10 -9 Z" fill="#d8d0e8" />
      <circle cx="40" cy="64" r="2.8" fill="#1c1628" />
      <circle cx="48" cy="64" r="2.8" fill="#1c1628" />
      <path d="M41 76 v-3 M44 76 v-3 M47 76 v-3" stroke="#1c1628" strokeWidth="1.4" />
    </g>
  </svg>
);

export const BlastArt: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
    <path
      d="M50 2 L58 30 L84 12 L70 38 L98 44 L72 56 L90 84 L62 70 L54 98 L44 72 L16 90 L30 62 L2 54 L28 44 L10 16 L38 30 Z"
      fill="#ff4a1a"
      stroke={INK}
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <path d="M50 16 L56 36 L74 26 L64 44 L84 48 L64 56 L76 74 L58 64 L52 82 L46 64 L28 74 L38 56 L18 50 L38 44 L26 26 L44 36 Z" fill="#ffb21a" />
    <circle cx="50" cy="50" r="13" fill="#ffffff" />
  </svg>
);

/** Petits éclats de roche projetés à l'ouverture d'une case */
export const RockChips: React.FC = () => (
  <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
    {[
      [-40, -46, -30],
      [44, -40, 40],
      [-50, 18, -60],
      [48, 26, 70],
      [0, -58, 10],
      [-10, 52, 90],
    ].map(([x, y, r], i) => (
      <span
        key={i}
        className="mn-chip absolute left-1/2 top-1/2 w-[14%] h-[11%] -ml-[7%] -mt-[5.5%] bg-[#6d5c8e] border-2 border-[#140c22]"
        style={
          {
            '--dx': `${x}px`,
            '--dy': `${y}px`,
            '--rot': `${r}deg`,
            clipPath: 'polygon(20% 0, 100% 15%, 80% 100%, 0 70%)',
          } as React.CSSProperties
        }
      />
    ))}
  </div>
);

/** Face d'un bloc de roche non révélé : dégradé, fissures et éclat de cristal incrusté */
export const RockFace: React.FC<{ seed: number }> = ({ seed }) => {
  const crack = seed % 4;
  const speck = seed % 3;
  return (
    <>
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        <g stroke="#1e1530" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.7">
          {crack === 0 && <path d="M18 22 L30 34 L26 46 M30 34 L42 36" />}
          {crack === 1 && <path d="M78 16 L70 30 L76 40 M70 30 L58 34" />}
          {crack === 2 && <path d="M20 76 L34 66 L44 72 M34 66 L32 54" />}
          {crack === 3 && <path d="M74 80 L66 68 L70 58 M66 68 L54 70" />}
        </g>
        <g opacity="0.25" fill="#fff">
          <circle cx={30 + seed * 7 % 40} cy={60 - seed * 5 % 30} r="1.6" />
          <circle cx={62 - seed * 3 % 30} cy={30 + seed * 11 % 40} r="1.2" />
        </g>
        <g className="mn-speck">
          {speck === 0 && <path d="M76 70 L82 62 L86 72 L80 80 Z" fill="#5ee8ff" stroke="#1e1530" strokeWidth="1.8" />}
          {speck === 1 && <path d="M18 70 L24 60 L29 70 L22 78 Z" fill="#ff7ad8" stroke="#1e1530" strokeWidth="1.8" />}
          {speck === 2 && <path d="M70 18 L76 12 L80 22 L73 28 Z" fill="#ffffff" stroke="#1e1530" strokeWidth="1.8" />}
        </g>
      </svg>
    </>
  );
};

export const MinesLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`relative text-center leading-none select-none ${className}`}>
    <div
      className="font-['Oswald'] font-bold text-[clamp(13px,2.8cqw,26px)] tracking-[0.42em] pl-[0.42em] text-white"
      style={{ filter: 'drop-shadow(0 2px 0 #140c22) drop-shadow(0 0 8px rgba(255,255,255,0.45))' }}
    >
      DIAMOND
    </div>
    <div className="relative inline-flex items-center gap-[0.12em] -mt-[0.05em]">
      <span
        className="font-['Luckiest_Guy'] text-[clamp(36px,9cqw,92px)] tracking-[0.03em]"
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #b8f6ff 30%, #3fd2f2 60%, #1470a8 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextStroke: '2.5px #140c22',
          filter: 'drop-shadow(0 5px 0 #140c22) drop-shadow(0 0 18px rgba(63,210,242,0.45))',
        }}
      >
        MINES
      </span>
      <GemArt className="absolute -right-[0.55em] -top-[0.15em] w-[clamp(22px,5cqw,50px)] rotate-12 drop-shadow-[0_3px_0_#140c22]" hue="pink" />
    </div>
  </div>
);

// =============================================================================
// Décor : galerie de mine
// =============================================================================

const CrystalCluster: React.FC<{ className?: string; color: string; glow: string; flip?: boolean }> = ({
  className = '',
  color,
  glow,
  flip,
}) => (
  <svg
    viewBox="0 0 120 120"
    className={`mn-glow ${className}`}
    style={{ transform: flip ? 'scaleX(-1)' : undefined, filter: `drop-shadow(0 0 18px ${glow})` }}
    aria-hidden="true"
  >
    <g stroke={INK} strokeWidth="3" strokeLinejoin="round">
      <path d="M40 120 L30 50 L42 30 L54 50 L52 120 Z" fill={color} />
      <path d="M42 30 L54 50 L52 120 L46 120 Z" fill="#fff" opacity="0.25" />
      <path d="M56 120 L58 20 L70 2 L82 20 L78 120 Z" fill={color} />
      <path d="M70 2 L82 20 L78 120 L70 120 Z" fill="#000" opacity="0.25" />
      <path d="M62 30 L68 10" stroke="#fff" strokeWidth="3" opacity="0.7" />
      <path d="M80 120 L90 64 L100 52 L108 66 L96 120 Z" fill={color} />
      <path d="M100 52 L108 66 L96 120 L92 120 Z" fill="#000" opacity="0.2" />
      <path d="M10 120 L16 84 L24 76 L30 88 L28 120 Z" fill={color} />
    </g>
  </svg>
);

const Lantern: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
  <div className={`absolute ${className}`} style={style} aria-hidden="true">
    <div className="mn-lantern-glow absolute left-1/2 top-[60%] w-[220px] h-[220px] -ml-[110px] -mt-[110px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.35),rgba(255,255,255,0.08)_45%,transparent_70%)]" />
    <svg viewBox="0 0 40 80" className="relative w-[34px] mn-swing" style={{ transformOrigin: '20px 0' }}>
      <path d="M20 0 V18" stroke={INK} strokeWidth="2.5" />
      <path d="M12 18 H28 L30 26 H10 Z" fill="#3a2a1a" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="11" y="26" width="18" height="30" rx="4" fill="#cbd5e1" stroke={INK} strokeWidth="2.5" />
      <path d="M20 32 q5 8 0 16 q-5 -8 0 -16 Z" fill="#ffffff" />
      <path d="M15 26 V56 M25 26 V56" stroke={INK} strokeWidth="1.8" />
      <path d="M9 56 H31 L28 62 H12 Z" fill="#3a2a1a" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  </div>
);

export type MinesMood = 'idle' | 'play' | 'boom' | 'win';

export const MinesBackdrop: React.FC<{ mood: MinesMood }> = ({ mood }) => {
  const motes = useMemo(
    () =>
      Array.from({ length: 26 }, () => ({
        left: Math.random() * 100,
        size: 2 + Math.random() * 4,
        dur: 7 + Math.random() * 9,
        delay: -Math.random() * 12,
        hue: Math.random() < 0.6 ? '#7ae8ff' : '#ffb0ea',
      })),
    [],
  );
  const sky =
    mood === 'boom'
      ? 'radial-gradient(ellipse at 50% 40%, #6a1a2a 0%, #2a0a1a 50%, #07030a 100%)'
      : mood === 'win'
        ? 'radial-gradient(ellipse at 50% 40%, #1a5a6a 0%, #182a4a 50%, #060812 100%)'
        : 'radial-gradient(ellipse at 50% 40%, #3a2a6a 0%, #1a1238 50%, #07050f 100%)';
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 transition-[background] duration-700" style={{ background: sky }} />
      {/* texture de roche */}
      <div
        className="absolute inset-0 opacity-40 mix-blend-multiply"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(0,0,0,0.6) 0 2px, transparent 3px), radial-gradient(circle at 70% 60%, rgba(0,0,0,0.5) 0 1px, transparent 2px)',
          backgroundSize: '23px 19px, 11px 13px',
        }}
      />
      {/* parois de la galerie */}
      <svg viewBox="0 0 200 600" preserveAspectRatio="none" className="absolute left-0 top-0 h-full w-[22%] min-w-[90px]">
        <path d="M0 0 H150 Q120 80 140 160 Q170 250 120 330 Q90 420 130 500 Q150 560 110 600 H0 Z" fill="#120b22" />
        <path d="M0 0 H90 Q70 100 95 200 Q110 300 70 400 Q50 500 80 600 H0 Z" fill="#0a0614" />
      </svg>
      <svg viewBox="0 0 200 600" preserveAspectRatio="none" className="absolute right-0 top-0 h-full w-[22%] min-w-[90px] -scale-x-100">
        <path d="M0 0 H150 Q120 80 140 160 Q170 250 120 330 Q90 420 130 500 Q150 560 110 600 H0 Z" fill="#120b22" />
        <path d="M0 0 H90 Q70 100 95 200 Q110 300 70 400 Q50 500 80 600 H0 Z" fill="#0a0614" />
      </svg>
      {/* étais en bois */}
      <div className="absolute inset-x-[6%] top-0 h-[18px] sm:h-[26px] bg-[linear-gradient(180deg,#8a5a2a,#4a2a12)] border-b-4 border-[#140c22] shadow-[0_10px_30px_rgba(0,0,0,0.6)]" />
      <div className="hidden md:block absolute left-[8%] top-0 bottom-0 w-[22px] bg-[linear-gradient(90deg,#4a2a12,#8a5a2a_45%,#4a2a12)] border-x-4 border-[#140c22]" />
      <div className="hidden md:block absolute right-[8%] top-0 bottom-0 w-[22px] bg-[linear-gradient(90deg,#4a2a12,#8a5a2a_45%,#4a2a12)] border-x-4 border-[#140c22]" />
      <Lantern className="left-[calc(8%+30px)] top-[18px] sm:top-[26px] hidden md:block" />
      <Lantern className="right-[calc(8%+30px)] top-[18px] sm:top-[26px] hidden md:block" />
      {/* cristaux lumineux */}
      <CrystalCluster className="absolute left-[-2%] bottom-[8%] w-[28vmin] max-w-[260px]" color="#3fd2f2" glow="rgba(63,210,242,0.7)" />
      <CrystalCluster className="absolute right-[-2%] bottom-[10%] w-[24vmin] max-w-[220px]" color="#ff5fc4" glow="rgba(255,95,196,0.65)" flip />
      <CrystalCluster className="absolute left-[1%] bottom-[34%] w-[11vmin] max-w-[100px] opacity-75" color="#9a7aff" glow="rgba(154,122,255,0.6)" flip />
      {/* sol */}
      <svg viewBox="0 0 1200 200" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 w-full h-[16%]">
        <path d="M0 90 Q200 50 400 80 T800 70 T1200 85 V200 H0 Z" fill="#120b22" />
        <path d="M0 140 Q300 110 600 135 T1200 130 V200 H0 Z" fill="#07040e" />
      </svg>
      {/* poussière scintillante */}
      {motes.map((m, i) => (
        <span
          key={i}
          className="mn-mote absolute bottom-0 rounded-full"
          style={{
            left: `${m.left}%`,
            width: m.size,
            height: m.size,
            background: m.hue,
            boxShadow: `0 0 8px ${m.hue}`,
            animationDuration: `${m.dur}s`,
            animationDelay: `${m.delay}s`,
          }}
        />
      ))}
    </div>
  );
};
