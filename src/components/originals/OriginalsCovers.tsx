import React from 'react';

/** Couvertures du lobby pour les Diamond Originals (Crash) */

const coverTitle = (gradient: string): React.CSSProperties => ({
  background: gradient,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextStroke: '1.5px #140c22',
  filter: 'drop-shadow(0 3px 0 #140c22)',
});

export const CrashCover: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_50%_20%,#5a1a3a,#2a0c24_55%,#0a0410)]">
    <div
      className="absolute inset-0 opacity-60"
      style={{
        backgroundImage:
          'radial-gradient(1.5px 1.5px at 12% 18%, #fff, transparent), radial-gradient(1px 1px at 70% 12%, #fff, transparent), radial-gradient(1.5px 1.5px at 85% 40%, #fff, transparent), radial-gradient(1px 1px at 30% 45%, #fff, transparent)',
      }}
    />
    <svg viewBox="0 0 100 100" className="absolute inset-x-[6%] top-[8%] w-[88%] transition-transform duration-500 group-hover:-translate-y-1">
      <defs>
        <linearGradient id="crashCoverFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb03a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ff5a3c" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M4 92 C 40 90, 62 78, 80 30 L 80 96 L 4 96 Z" fill="url(#crashCoverFill)" />
      <path d="M4 92 C 40 90, 62 78, 80 30" fill="none" stroke="#ffb03a" strokeWidth="3.5" strokeLinecap="round" />
      <g transform="translate(80 30) rotate(-20)">
        <path d="M-4 6 L-12 16 L-2 10 Z" fill="#ffd84a" />
        <path d="M-6 8 C-8 0 0 -10 12 -16 C 8 -4 2 4 -6 8 Z" fill="#f5f0ff" stroke="#140c22" strokeWidth="2" />
        <circle cx="4" cy="-7" r="2.6" fill="#5ee8ff" stroke="#140c22" strokeWidth="1.5" />
      </g>
    </svg>
    <div className="absolute left-1/2 top-[44%] -translate-x-1/2 rounded-lg border-[3px] border-[#140c22] bg-[#2fd08a] px-2 py-0.5 font-['Oswald'] text-[clamp(12px,1.4vw,16px)] font-bold text-[#062a18] shadow-[0_3px_0_#140c22]">
      12,48×
    </div>
    <div
      className="absolute inset-x-0 bottom-[5%] text-center font-['Luckiest_Guy'] text-[clamp(26px,3vw,38px)] leading-none"
      style={coverTitle('linear-gradient(180deg,#ffffff 0%,#ffe0a8 30%,#ff9a3c 65%,#c2410c 100%)')}
    >
      CRASH
    </div>
  </div>
);
