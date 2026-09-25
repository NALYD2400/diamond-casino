import React from 'react';
import type { SlotSymbolId } from './slotsEngine';

interface SlotIconProps {
  id: SlotSymbolId;
  className?: string;
  isWinning?: boolean;
  wildMultiplier?: number;
}

export const SlotIcon: React.FC<SlotIconProps> = ({
  id,
  className = 'w-16 h-16',
  isWinning = false,
  wildMultiplier = 1,
}) => {
  return (
    <div
      className={`relative flex items-center justify-center transition-transform duration-300 ${
        isWinning ? 'scale-110 drop-shadow-[0_0_20px_rgba(251,191,36,0.7)]' : ''
      }`}
    >
      {/* ========================================================================= */}
      {/* THE DOG HOUSE (STAKE / PRAGMATIC) ICONS                                  */}
      {/* ========================================================================= */}

      {/* 1. THE DOG HOUSE WILD (Kennel with x2 / x3 Multipliers) */}
      {id === 'dog_house_wild' && (
        <div className="relative flex items-center justify-center">
          <svg viewBox="0 0 64 64" fill="none" className={className}>
            <defs>
              <linearGradient id="roofGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f87171" />
                <stop offset="50%" stopColor="#dc2626" />
                <stop offset="100%" stopColor="#991b1b" />
              </linearGradient>
              <linearGradient id="woodGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fef3c7" />
                <stop offset="35%" stopColor="#d97706" />
                <stop offset="85%" stopColor="#92400e" />
                <stop offset="100%" stopColor="#78350f" />
              </linearGradient>
              <linearGradient id="goldPlate" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="50%" stopColor="#eab308" />
                <stop offset="100%" stopColor="#ca8a04" />
              </linearGradient>
            </defs>
            {/* Kennel House Walls */}
            <rect x="14" y="24" width="36" height="32" rx="3" fill="url(#woodGrad)" stroke="#78350f" strokeWidth="2" />
            {/* Wood planks texture */}
            <line x1="14" y1="34" x2="50" y2="34" stroke="#78350f" strokeWidth="1" strokeOpacity="0.6" />
            <line x1="14" y1="44" x2="50" y2="44" stroke="#78350f" strokeWidth="1" strokeOpacity="0.6" />
            {/* Kennel Door Arch */}
            <path d="M24 56 C24 40 40 40 40 56 Z" fill="#18181b" stroke="#78350f" strokeWidth="1.5" />
            {/* Roof Peak with Overhang */}
            <polygon points="32,6 56,26 8,26" fill="url(#roofGrad)" stroke="#7f1d1d" strokeWidth="2" strokeLinejoin="round" />
            <polygon points="32,10 52,26 12,26" fill="#fca5a5" fillOpacity="0.3" />
            {/* Bone plaque above door */}
            <path
              d="M22 28 C20 28 19 26 21 25 C19 24 20 22 22 22 L42 22 C44 22 45 24 43 25 C45 26 44 28 42 28 Z"
              fill="url(#goldPlate)"
              stroke="#854d0e"
              strokeWidth="1"
            />
            <text x="32" y="26.5" textAnchor="middle" fill="#78350f" fontSize="5" fontWeight="bold" fontFamily="monospace">
              WILD
            </text>
          </svg>

          {/* Floating Glowing Multiplier Badge (x2 or x3) */}
          <div className="absolute -bottom-1 -right-1 flex items-center justify-center">
            <span className="px-1.5 py-0.5 rounded-full bg-white text-black font-black font-['Geist_Mono'] text-[11px] border border-white shadow-[0_0_12px_rgba(255,255,255,0.8)]">
              x{wildMultiplier >= 2 ? wildMultiplier : 2}
            </span>
          </div>
        </div>
      )}

      {/* 2. RUBY PAW PRINT BONUS SCATTER */}
      {id === 'dog_paw_bonus' && (
        <div className="relative flex items-center justify-center">
          <svg viewBox="0 0 64 64" fill="none" className={className}>
            <defs>
              <linearGradient id="pawRing" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="35%" stopColor="#f59e0b" />
                <stop offset="85%" stopColor="#b45309" />
                <stop offset="100%" stopColor="#78350f" />
              </linearGradient>
              <linearGradient id="rubyPaw" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fda4af" />
                <stop offset="30%" stopColor="#f43f5e" />
                <stop offset="70%" stopColor="#be123c" />
                <stop offset="100%" stopColor="#881337" />
              </linearGradient>
            </defs>
            {/* Golden Medal Coin Base */}
            <circle cx="32" cy="32" r="28" fill="#1c1917" stroke="url(#pawRing)" strokeWidth="3.5" />
            <circle cx="32" cy="32" r="24" fill="#292524" stroke="#eab308" strokeWidth="1" strokeDasharray="3 3" />
            {/* Ruby Main Paw Pad (Heart-rounded shape) */}
            <path
              d="M32 44 C24 44 20 37 23 32 C26 28 32 30 32 30 C32 30 38 28 41 32 C44 37 40 44 32 44 Z"
              fill="url(#rubyPaw)"
              stroke="#ffe4e6"
              strokeWidth="1.2"
            />
            {/* 4 Toe Pads */}
            <ellipse cx="20" cy="24" rx="4" ry="5.5" fill="url(#rubyPaw)" stroke="#ffe4e6" strokeWidth="1" transform="rotate(-20 20 24)" />
            <ellipse cx="28" cy="18" rx="4" ry="6" fill="url(#rubyPaw)" stroke="#ffe4e6" strokeWidth="1" transform="rotate(-6 28 18)" />
            <ellipse cx="36" cy="18" rx="4" ry="6" fill="url(#rubyPaw)" stroke="#ffe4e6" strokeWidth="1" transform="rotate(6 36 18)" />
            <ellipse cx="44" cy="24" rx="4" ry="5.5" fill="url(#rubyPaw)" stroke="#ffe4e6" strokeWidth="1" transform="rotate(20 44 24)" />
            {/* Highlights */}
            <ellipse cx="30" cy="36" rx="2" ry="1.5" fill="#ffffff" fillOpacity="0.6" />
          </svg>
          {/* BONUS ribbon banner at bottom */}
          <div className="absolute -bottom-1 inset-x-0 flex justify-center">
            <span className="px-2 py-0.2 rounded-md bg-gradient-to-r from-red-600 via-rose-500 to-red-600 text-white font-black font-['Geist_Mono'] text-[9px] tracking-wider border border-white/40 shadow-[0_0_10px_rgba(244,63,94,0.7)]">
              BONUS
            </span>
          </div>
        </div>
      )}

      {/* 3. ROTTWEILER BLEU (TOP PAYING DOG) */}
      {id === 'dog_rottweiler' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <defs>
            <linearGradient id="rottBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
            <linearGradient id="tanPoints" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fde047" />
              <stop offset="100%" stopColor="#ca8a04" />
            </linearGradient>
          </defs>
          {/* Circular Badge */}
          <circle cx="32" cy="32" r="28" fill="url(#rottBg)" stroke="#e0f2fe" strokeWidth="2.5" />
          {/* Head & Jowls */}
          <path d="M18 36 C18 20 46 20 46 36 C46 48 38 54 32 54 C26 54 18 48 18 36 Z" fill="#1e293b" />
          {/* Tan Eyebrow Dots */}
          <circle cx="26" cy="26" r="2.5" fill="url(#tanPoints)" />
          <circle cx="38" cy="26" r="2.5" fill="url(#tanPoints)" />
          {/* Alert Ears */}
          <polygon points="16,24 22,12 26,24" fill="#0f172a" />
          <polygon points="48,24 42,12 38,24" fill="#0f172a" />
          {/* Tan Muzzle */}
          <ellipse cx="32" cy="40" rx="9" ry="7" fill="url(#tanPoints)" />
          {/* Black Nose */}
          <polygon points="29,36 35,36 32,41" fill="#0f172a" />
          {/* Happy Open Mouth & Tongue */}
          <path d="M28 42 C28 48 36 48 36 42 Z" fill="#881337" />
          <path d="M30 44 C30 49 34 49 34 44 Z" fill="#fb7185" />
          {/* Glowing Alert Eyes */}
          <circle cx="25" cy="31" r="3" fill="#ffffff" />
          <circle cx="25" cy="31" r="1.8" fill="#78350f" />
          <circle cx="24.5" cy="30.5" r="0.8" fill="#ffffff" />
          <circle cx="39" cy="31" r="3" fill="#ffffff" />
          <circle cx="39" cy="31" r="1.8" fill="#78350f" />
          <circle cx="38.5" cy="30.5" r="0.8" fill="#ffffff" />
        </svg>
      )}

      {/* 4. SHIH TZU ROSE (CUTE PINK PUPPY) */}
      {id === 'dog_shihtzu' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <defs>
            <linearGradient id="shihBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f472b6" />
              <stop offset="100%" stopColor="#be185d" />
            </linearGradient>
            <linearGradient id="fur" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#fef3c7" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="28" fill="url(#shihBg)" stroke="#fdf2f8" strokeWidth="2.5" />
          {/* Fluffy Ear Tufts */}
          <ellipse cx="18" cy="32" rx="7" ry="14" fill="url(#fur)" transform="rotate(10 18 32)" />
          <ellipse cx="46" cy="32" rx="7" ry="14" fill="url(#fur)" transform="rotate(-10 46 32)" />
          {/* Head */}
          <circle cx="32" cy="34" r="15" fill="url(#fur)" />
          {/* Pink Bow on top */}
          <polygon points="32,16 25,12 25,20" fill="#ec4899" stroke="#be185d" strokeWidth="1" />
          <polygon points="32,16 39,12 39,20" fill="#ec4899" stroke="#be185d" strokeWidth="1" />
          <circle cx="32" cy="16" r="3" fill="#f43f5e" />
          {/* Big Cute Eyes */}
          <circle cx="26" cy="32" r="3.8" fill="#18181b" />
          <circle cx="25" cy="31" r="1.5" fill="#ffffff" />
          <circle cx="38" cy="32" r="3.8" fill="#18181b" />
          <circle cx="37" cy="31" r="1.5" fill="#ffffff" />
          {/* Nose & Smile */}
          <ellipse cx="32" cy="39" rx="2.5" ry="1.8" fill="#18181b" />
          <path d="M29 42 C31 44 33 44 35 42" stroke="#18181b" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}

      {/* 5. CARLIN / PUG MARRON */}
      {id === 'dog_pug' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <defs>
            <linearGradient id="pugBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
            <linearGradient id="pugFur" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="100%" stopColor="#eab308" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="28" fill="url(#pugBg)" stroke="#fef3c7" strokeWidth="2.5" />
          {/* Floppy Dark Ears */}
          <polygon points="17,20 25,18 20,30" fill="#451a03" />
          <polygon points="47,20 39,18 44,30" fill="#451a03" />
          {/* Round Head */}
          <circle cx="32" cy="34" r="16" fill="url(#pugFur)" />
          {/* Wrinkles */}
          <path d="M28 22 C32 20 32 20 36 22" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M26 26 C32 24 32 24 38 26" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" />
          {/* Black Mask Muzzle */}
          <ellipse cx="32" cy="39" rx="10" ry="7" fill="#451a03" />
          {/* Round Derpy Eyes */}
          <circle cx="24" cy="31" r="4.2" fill="#ffffff" />
          <circle cx="23.5" cy="31" r="2.8" fill="#18181b" />
          <circle cx="22.5" cy="30" r="1.2" fill="#ffffff" />
          <circle cx="40" cy="31" r="4.2" fill="#ffffff" />
          <circle cx="40.5" cy="31" r="2.8" fill="#18181b" />
          <circle cx="39.5" cy="30" r="1.2" fill="#ffffff" />
          {/* Nose */}
          <polygon points="30,36 34,36 32,39" fill="#18181b" />
          {/* Tongue sticking out to side */}
          <path d="M33 42 C33 48 38 48 38 43 Z" fill="#fb7185" stroke="#f43f5e" strokeWidth="0.8" />
        </svg>
      )}

      {/* 6. TECKEL / DACHSHUND VERT */}
      {id === 'dog_dachshund' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <defs>
            <linearGradient id="dachBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="dachFur" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#b45309" />
              <stop offset="100%" stopColor="#78350f" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="28" fill="url(#dachBg)" stroke="#d1fae5" strokeWidth="2.5" />
          {/* Long Ears */}
          <ellipse cx="20" cy="34" rx="5" ry="12" fill="#451a03" transform="rotate(15 20 34)" />
          {/* Long Snout Head */}
          <ellipse cx="34" cy="33" rx="14" ry="10" fill="url(#dachFur)" />
          <ellipse cx="44" cy="36" rx="6" ry="4.5" fill="url(#dachFur)" />
          {/* Wet Nose */}
          <ellipse cx="49" cy="36" rx="2" ry="1.5" fill="#18181b" />
          {/* Bright Playful Eye */}
          <circle cx="30" cy="28" r="3.5" fill="#ffffff" />
          <circle cx="31" cy="28" r="2" fill="#18181b" />
          <circle cx="31.5" cy="27.5" r="0.8" fill="#ffffff" />
          {/* Green Collar */}
          <rect x="18" y="44" width="16" height="4" rx="2" fill="#10b981" stroke="#047857" strokeWidth="1" />
          <circle cx="26" cy="50" r="2" fill="#fbbf24" />
        </svg>
      )}

      {/* 7. COLLIER EN CUIR */}
      {id === 'dog_collar' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <defs>
            <linearGradient id="colGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="50%" stopColor="#059669" />
              <stop offset="100%" stopColor="#064e3b" />
            </linearGradient>
          </defs>
          {/* Curved Collar Band */}
          <ellipse cx="32" cy="32" rx="22" ry="14" fill="none" stroke="url(#colGrad)" strokeWidth="7" />
          {/* Silver Studs */}
          <circle cx="16" cy="30" r="2.5" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1" />
          <circle cx="23" cy="39" r="2.5" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1" />
          <circle cx="32" cy="43" r="2.5" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1" />
          <circle cx="41" cy="39" r="2.5" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1" />
          <circle cx="48" cy="30" r="2.5" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1" />
          {/* Gold Tag Dangling */}
          <circle cx="32" cy="46" r="3.5" fill="#facc15" stroke="#ca8a04" strokeWidth="1" />
        </svg>
      )}

      {/* 8. OS D'OR */}
      {id === 'dog_bone' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <defs>
            <linearGradient id="boneGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="50%" stopColor="#facc15" />
              <stop offset="100%" stopColor="#ca8a04" />
            </linearGradient>
          </defs>
          {/* Diagonal Bone */}
          <g transform="rotate(-30 32 32)">
            {/* Left Knobs */}
            <circle cx="16" cy="27" r="6" fill="url(#boneGrad)" stroke="#854d0e" strokeWidth="1.5" />
            <circle cx="16" cy="37" r="6" fill="url(#boneGrad)" stroke="#854d0e" strokeWidth="1.5" />
            {/* Right Knobs */}
            <circle cx="48" cy="27" r="6" fill="url(#boneGrad)" stroke="#854d0e" strokeWidth="1.5" />
            <circle cx="48" cy="37" r="6" fill="url(#boneGrad)" stroke="#854d0e" strokeWidth="1.5" />
            {/* Center Shaft */}
            <rect x="18" y="27" width="28" height="10" rx="3" fill="url(#boneGrad)" stroke="#854d0e" strokeWidth="1.5" />
            {/* Ribbon tied in middle */}
            <rect x="30" y="25" width="4" height="14" rx="1" fill="#ef4444" stroke="#991b1b" strokeWidth="1" />
          </g>
        </svg>
      )}

      {/* 9. STAKE-STYLE METALLIC CARDS: A, K, Q, J, 10 */}
      {id === 'card_a' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <text x="32" y="47" textAnchor="middle" fill="#ef4444" fontSize="42" fontWeight="900" fontFamily="sans-serif" stroke="#fca5a5" strokeWidth="1.5">
            A
          </text>
        </svg>
      )}
      {id === 'card_k' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <text x="32" y="47" textAnchor="middle" fill="#f97316" fontSize="42" fontWeight="900" fontFamily="sans-serif" stroke="#fed7aa" strokeWidth="1.5">
            K
          </text>
        </svg>
      )}
      {id === 'card_q' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <text x="32" y="47" textAnchor="middle" fill="#a855f7" fontSize="42" fontWeight="900" fontFamily="sans-serif" stroke="#e9d5ff" strokeWidth="1.5">
            Q
          </text>
        </svg>
      )}
      {id === 'card_j' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <text x="32" y="47" textAnchor="middle" fill="#3b82f6" fontSize="42" fontWeight="900" fontFamily="sans-serif" stroke="#bfdbfe" strokeWidth="1.5">
            J
          </text>
        </svg>
      )}
      {id === 'card_10' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <text x="32" y="46" textAnchor="middle" fill="#94a3b8" fontSize="36" fontWeight="900" fontFamily="sans-serif" stroke="#f1f5f9" strokeWidth="1.5">
            10
          </text>
        </svg>
      )}

      {/* ========================================================================= */}
      {/* CLASSIC DIAMOND CASINO SYMBOLS                                            */}
      {/* ========================================================================= */}
      {id === 'diamond' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <defs>
            <linearGradient id="diamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="35%" stopColor="#bae6fd" />
              <stop offset="70%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
            <linearGradient id="diamEdge" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f0f9ff" />
              <stop offset="100%" stopColor="#7dd3fc" />
            </linearGradient>
          </defs>
          <polygon points="20,12 44,12 56,26 32,54 8,26" fill="url(#diamGrad)" />
          <polygon points="22,14 42,14 48,24 16,24" fill="#ffffff" fillOpacity="0.45" />
          <polygon points="32,24 48,24 32,52" fill="#0284c7" fillOpacity="0.5" />
          <polygon points="32,24 16,24 32,52" fill="#38bdf8" fillOpacity="0.6" />
          <polygon points="20,12 44,12 56,26 32,54 8,26" stroke="url(#diamEdge)" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="28" cy="20" r="2" fill="#ffffff" />
        </svg>
      )}

      {id === 'seven' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <defs>
            <linearGradient id="sevGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffe4e6" />
              <stop offset="25%" stopColor="#f43f5e" />
              <stop offset="70%" stopColor="#be123c" />
              <stop offset="100%" stopColor="#881337" />
            </linearGradient>
            <linearGradient id="sevGold" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#ca8a04" />
            </linearGradient>
          </defs>
          <path d="M16 13 L48 13 L32 51 L22 51 L35 21 L16 21 Z" fill="url(#sevGrad)" stroke="url(#sevGold)" strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
      )}

      {id === 'crown' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <defs>
            <linearGradient id="crwGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="40%" stopColor="#f59e0b" />
              <stop offset="85%" stopColor="#b45309" />
              <stop offset="100%" stopColor="#78350f" />
            </linearGradient>
          </defs>
          <path d="M10 46 L14 20 L24 33 L32 15 L40 33 L50 20 L54 46 Z" fill="url(#crwGrad)" stroke="#fef08a" strokeWidth="2" strokeLinejoin="round" />
          <rect x="10" y="46" width="44" height="6" rx="2" fill="#d97706" stroke="#fef08a" strokeWidth="1.5" />
        </svg>
      )}

      {id === 'gold_bar' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <defs>
            <linearGradient id="gbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="45%" stopColor="#eab308" />
              <stop offset="80%" stopColor="#ca8a04" />
              <stop offset="100%" stopColor="#854d0e" />
            </linearGradient>
          </defs>
          <polygon points="18,22 46,22 52,32 12,32" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
          <polygon points="12,32 52,32 46,46 18,46" fill="url(#gbGrad)" stroke="#854d0e" strokeWidth="1.5" />
        </svg>
      )}

      {id === 'emerald' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <polygon points="20,12 44,12 52,20 52,44 44,52 20,52 12,44 12,20" fill="#10b981" stroke="#d1fae5" strokeWidth="2" />
        </svg>
      )}

      {id === 'bell' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <path d="M32 17 C23 17 21 28 19 37 C17 44 13 46 13 48 L51 48 C51 46 47 44 45 37 C43 28 41 17 32 17 Z" fill="#facc15" stroke="#fef08a" strokeWidth="2" />
          <ellipse cx="32" cy="51" rx="5" ry="3.5" fill="#854d0e" />
        </svg>
      )}

      {id === 'ruby' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <polygon points="32,10 52,25 44,52 20,52 12,25" fill="#ec4899" stroke="#fce7f3" strokeWidth="2" />
        </svg>
      )}

      {id === 'cherry' && (
        <svg viewBox="0 0 64 64" fill="none" className={className}>
          <circle cx="23" cy="40" r="10" fill="#e11d48" stroke="#f43f5e" strokeWidth="1.5" />
          <circle cx="41" cy="43" r="10" fill="#e11d48" stroke="#f43f5e" strokeWidth="1.5" />
          <path d="M23 33 C23 20 33 13 44 11" stroke="#16a34a" strokeWidth="2.8" fill="none" />
        </svg>
      )}

      {id === 'wild' && (
        <div className="relative flex items-center justify-center">
          <svg viewBox="0 0 64 64" fill="none" className={className}>
            <polygon points="32,6 58,32 32,58 6,32" fill="#18181b" stroke="#ffffff" strokeWidth="2.5" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[12px] font-black font-['Geist_Mono'] text-white">WILD</span>
            {wildMultiplier > 1 && (
              <span className="text-[9px] font-bold font-mono px-1 bg-white text-black rounded">
                x{wildMultiplier}
              </span>
            )}
          </div>
        </div>
      )}

      {id === 'scatter' && (
        <div className="relative flex items-center justify-center">
          <svg viewBox="0 0 64 64" fill="none" className={className}>
            <circle cx="32" cy="32" r="26" fill="#0f172a" stroke="#38bdf8" strokeWidth="3" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[9px] font-black font-mono text-sky-200">BONUS</span>
          </div>
        </div>
      )}
    </div>
  );
};
