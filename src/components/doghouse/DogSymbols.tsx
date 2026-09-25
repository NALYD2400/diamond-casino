import React, { createContext, useContext, useId } from 'react';
import type { DogSymbolId } from './dogHouseEngine';

/**
 * Symboles vectoriels originaux au style cartoon « The Dog House ».
 * Tous dessinés sur une viewBox 100x100 avec un contour sombre épais.
 */

const OUTLINE = '#3b1d0e';

/** Préfixe d'id unique par instance : un <defs> dans un parent masqué casserait les autres copies */
const UidContext = createContext('dh');
const useUid = () => useContext(UidContext);

const CARD_STYLES: Record<string, { top: string; bottom: string; stroke: string }> = {
  A: { top: '#ff8a7a', bottom: '#d61f1f', stroke: '#5c0a0a' },
  K: { top: '#ffe27a', bottom: '#f08c00', stroke: '#6b3300' },
  Q: { top: '#e7a6ff', bottom: '#9b30d9', stroke: '#3d0a5c' },
  J: { top: '#8fd6ff', bottom: '#1f7ae0', stroke: '#0a2d5c' },
  '10': { top: '#9df58a', bottom: '#1fa33a', stroke: '#0a4515' },
};

const CardSymbol: React.FC<{ label: string }> = ({ label }) => {
  const u = useUid();
  const s = CARD_STYLES[label];
  const gid = `${u}-card`;
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={s.top} />
          <stop offset="55%" stopColor={s.bottom} />
          <stop offset="100%" stopColor={s.stroke} />
        </linearGradient>
      </defs>
      <text
        x="50"
        y="76"
        textAnchor="middle"
        fontFamily="'Lilita One', 'Luckiest Guy', sans-serif"
        fontSize={label === '10' ? 60 : 74}
        letterSpacing={label === '10' ? -4 : 0}
        fill={`url(#${gid})`}
        stroke={s.stroke}
        strokeWidth="5"
        paintOrder="stroke"
        strokeLinejoin="round"
      >
        {label}
      </text>
      <text
        x="50"
        y="76"
        textAnchor="middle"
        fontFamily="'Lilita One', 'Luckiest Guy', sans-serif"
        fontSize={label === '10' ? 60 : 74}
        letterSpacing={label === '10' ? -4 : 0}
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.2"
        transform="translate(-1.2 -1.6)"
      >
        {label}
      </text>
    </svg>
  );
};

const Frame: React.FC<{ id: string; c1: string; c2: string; children: React.ReactNode }> = ({ id, c1, c2, children }) => {
  const u = useUid();
  return (
  <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
    <defs>
      <linearGradient id={`${u}-frame`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={c1} />
        <stop offset="100%" stopColor={c2} />
      </linearGradient>
      <radialGradient id={`${u}-bg`} cx="50%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#fff6e0" />
        <stop offset="100%" stopColor={c1} />
      </radialGradient>
      <clipPath id={`${u}-clip`}>
        <rect x="9" y="9" width="82" height="82" rx="8" />
      </clipPath>
    </defs>
    <rect x="3" y="3" width="94" height="94" rx="12" fill={`url(#${u}-frame)`} stroke={OUTLINE} strokeWidth="3" />
    <rect x="9" y="9" width="82" height="82" rx="8" fill={`url(#${u}-bg)`} stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
    <g clipPath={`url(#${u}-clip)`}>{children}</g>
    <rect x="6" y="5.5" width="88" height="6" rx="3" fill="rgba(255,255,255,0.35)" />
  </svg>
  );
};

const Rottweiler = () => (
  <Frame id="rott" c1="#5aa8ff" c2="#1d4fb8">
    {/* oreilles */}
    <path d="M22 34 Q14 44 20 58 Q28 52 32 40 Z" fill="#1a1411" stroke={OUTLINE} strokeWidth="2" />
    <path d="M78 34 Q86 44 80 58 Q72 52 68 40 Z" fill="#1a1411" stroke={OUTLINE} strokeWidth="2" />
    {/* tête */}
    <path d="M26 44 Q26 20 50 20 Q74 20 74 44 L74 70 Q74 92 50 92 Q26 92 26 70 Z" fill="#231a15" stroke={OUTLINE} strokeWidth="2.5" />
    {/* marques feu */}
    <ellipse cx="38" cy="42" rx="5" ry="3" fill="#c46a26" />
    <ellipse cx="62" cy="42" rx="5" ry="3" fill="#c46a26" />
    <path d="M34 62 Q50 52 66 62 Q70 84 50 88 Q30 84 34 62 Z" fill="#c9742e" stroke={OUTLINE} strokeWidth="1.5" />
    {/* yeux */}
    <ellipse cx="39" cy="50" rx="5" ry="5.5" fill="#fff" />
    <ellipse cx="61" cy="50" rx="5" ry="5.5" fill="#fff" />
    <circle cx="40" cy="51" r="3" fill="#3a1a07" />
    <circle cx="60" cy="51" r="3" fill="#3a1a07" />
    <circle cx="41" cy="49.5" r="1" fill="#fff" />
    <circle cx="61" cy="49.5" r="1" fill="#fff" />
    {/* truffe + gueule */}
    <ellipse cx="50" cy="66" rx="8" ry="5.5" fill="#0d0907" />
    <ellipse cx="48" cy="64.5" rx="2.5" ry="1.4" fill="#6b6b6b" />
    <path d="M50 71 L50 76 M42 77 Q50 82 58 77" stroke={OUTLINE} strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M46 79 Q50 86 54 79 Z" fill="#e8546b" stroke={OUTLINE} strokeWidth="1.2" />
    {/* collier à pics */}
    <rect x="24" y="88" width="52" height="8" rx="3" fill="#c0392b" stroke={OUTLINE} strokeWidth="1.5" />
  </Frame>
);

const ShihTzu = () => (
  <Frame id="shih" c1="#ff8fd1" c2="#c21e84">
    {/* poils longs */}
    <path d="M18 40 Q10 70 22 94 L78 94 Q90 70 82 40 Q74 18 50 18 Q26 18 18 40 Z" fill="#e9c79b" stroke={OUTLINE} strokeWidth="2.5" />
    <path d="M22 50 Q16 72 26 92 M78 50 Q84 72 74 92 M34 60 Q30 80 36 94 M66 60 Q70 80 64 94" stroke="#b98a55" strokeWidth="2" fill="none" />
    {/* visage clair */}
    <ellipse cx="50" cy="56" rx="21" ry="20" fill="#fbecd4" stroke="#b98a55" strokeWidth="1.5" />
    {/* noeud rose */}
    <path d="M50 22 L34 12 Q30 22 34 30 Z" fill="#ff3ea5" stroke={OUTLINE} strokeWidth="2" />
    <path d="M50 22 L66 12 Q70 22 66 30 Z" fill="#ff3ea5" stroke={OUTLINE} strokeWidth="2" />
    <circle cx="50" cy="22" r="5" fill="#ff7cc4" stroke={OUTLINE} strokeWidth="2" />
    {/* yeux */}
    <ellipse cx="41" cy="52" rx="5" ry="5.5" fill="#1a0f08" />
    <ellipse cx="59" cy="52" rx="5" ry="5.5" fill="#1a0f08" />
    <circle cx="42.5" cy="50" r="1.8" fill="#fff" />
    <circle cx="60.5" cy="50" r="1.8" fill="#fff" />
    {/* truffe */}
    <ellipse cx="50" cy="63" rx="5" ry="3.5" fill="#1a0f08" />
    <path d="M44 70 Q50 74 56 70" stroke={OUTLINE} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    <path d="M47 71 Q50 77 53 71 Z" fill="#ff6b8a" />
    {/* collier perles */}
    {[30, 38, 46, 54, 62, 70].map((x) => (
      <circle key={x} cx={x} cy={84 + Math.abs(50 - x) * -0.06} r="3" fill="#fff" stroke="#c21e84" strokeWidth="1" />
    ))}
  </Frame>
);

const Pug = () => (
  <Frame id="pug" c1="#7ee06a" c2="#1f8a2e">
    <path d="M20 30 Q12 36 18 48 Q26 42 30 34 Z" fill="#2b1d14" stroke={OUTLINE} strokeWidth="2" />
    <path d="M80 30 Q88 36 82 48 Q74 42 70 34 Z" fill="#2b1d14" stroke={OUTLINE} strokeWidth="2" />
    <path d="M22 50 Q22 22 50 22 Q78 22 78 50 Q78 90 50 92 Q22 90 22 50 Z" fill="#e3b77e" stroke={OUTLINE} strokeWidth="2.5" />
    {/* rides */}
    <path d="M40 32 Q50 28 60 32 M42 37 Q50 34 58 37" stroke="#a87945" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    {/* masque noir */}
    <path d="M32 60 Q34 48 50 48 Q66 48 68 60 Q70 82 50 84 Q30 82 32 60 Z" fill="#2b1d14" stroke={OUTLINE} strokeWidth="1.5" />
    {/* gros yeux */}
    <circle cx="36" cy="48" r="8" fill="#fff" stroke={OUTLINE} strokeWidth="1.5" />
    <circle cx="64" cy="48" r="8" fill="#fff" stroke={OUTLINE} strokeWidth="1.5" />
    <circle cx="37" cy="49" r="5" fill="#2a1406" />
    <circle cx="63" cy="49" r="5" fill="#2a1406" />
    <circle cx="38.5" cy="47" r="1.8" fill="#fff" />
    <circle cx="64.5" cy="47" r="1.8" fill="#fff" />
    {/* truffe */}
    <ellipse cx="50" cy="61" rx="6" ry="4" fill="#0b0705" />
    <path d="M50 65 L50 69 M43 70 Q50 75 57 70" stroke="#6b4a2e" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    <path d="M46 72 Q50 81 54 72 Z" fill="#ff6b8a" stroke={OUTLINE} strokeWidth="1" />
  </Frame>
);

const Dachshund = () => (
  <Frame id="dach" c1="#ffb057" c2="#d0540c">
    {/* oreilles longues */}
    <path d="M28 30 Q10 40 16 76 Q26 78 32 60 Z" fill="#6b3314" stroke={OUTLINE} strokeWidth="2" />
    <path d="M72 30 Q90 40 84 76 Q74 78 68 60 Z" fill="#6b3314" stroke={OUTLINE} strokeWidth="2" />
    {/* tête allongée */}
    <path d="M30 40 Q30 18 50 18 Q70 18 70 40 L66 70 Q62 92 50 92 Q38 92 34 70 Z" fill="#a4561f" stroke={OUTLINE} strokeWidth="2.5" />
    <path d="M40 60 Q50 56 60 60 L58 80 Q50 88 42 80 Z" fill="#c47436" />
    {/* yeux */}
    <ellipse cx="41" cy="44" rx="4.5" ry="5.5" fill="#fff" />
    <ellipse cx="59" cy="44" rx="4.5" ry="5.5" fill="#fff" />
    <circle cx="41.5" cy="45" r="3" fill="#2a1406" />
    <circle cx="58.5" cy="45" r="3" fill="#2a1406" />
    <circle cx="42.5" cy="43.5" r="1" fill="#fff" />
    <circle cx="59.5" cy="43.5" r="1" fill="#fff" />
    <path d="M36 37 Q41 34 45 37 M55 37 Q59 34 64 37" stroke={OUTLINE} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    {/* truffe */}
    <ellipse cx="50" cy="78" rx="6" ry="4.5" fill="#120a06" />
    <ellipse cx="48" cy="76.5" rx="2" ry="1.2" fill="#777" />
    <path d="M45 85 Q50 88 55 85" stroke={OUTLINE} strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </Frame>
);

const Collar = () => {
  const u = useUid();
  return (
  <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
    <defs>
      <linearGradient id={`${u}-collar`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#5ff0c8" />
        <stop offset="100%" stopColor="#0b8a6a" />
      </linearGradient>
      <radialGradient id={`${u}-tag`} cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#fff6b0" />
        <stop offset="60%" stopColor="#f2b600" />
        <stop offset="100%" stopColor="#a86a00" />
      </radialGradient>
    </defs>
    <ellipse cx="50" cy="44" rx="38" ry="24" fill="none" stroke={OUTLINE} strokeWidth="17" />
    <ellipse cx="50" cy="44" rx="38" ry="24" fill="none" stroke={`url(#${u}-collar)`} strokeWidth="12" />
    <ellipse cx="50" cy="44" rx="38" ry="24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeDasharray="5 6" />
    {[16, 30, 70, 84].map((x) => (
      <circle key={x} cx={x} cy={x < 50 ? 54 - (x - 16) * 0.2 : 54 - (84 - x) * 0.2} r="3" fill="#e8e8e8" stroke={OUTLINE} strokeWidth="1.2" />
    ))}
    <rect x="42" y="62" width="16" height="8" rx="2" fill="#c9c9c9" stroke={OUTLINE} strokeWidth="1.5" />
    <path d="M50 68 Q30 72 36 88 Q50 98 64 88 Q70 72 50 68 Z" fill={`url(#${u}-tag)`} stroke={OUTLINE} strokeWidth="2.5" />
    <path d="M44 80 Q50 76 56 80 Q58 86 50 90 Q42 86 44 80 Z" fill="#a86a00" />
    <circle cx="44" cy="76" r="2" fill="#a86a00" />
    <circle cx="56" cy="76" r="2" fill="#a86a00" />
    <circle cx="50" cy="74" r="2" fill="#a86a00" />
  </svg>
  );
};

const Bone = () => {
  const u = useUid();
  return (
  <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
    <defs>
      <linearGradient id={`${u}-bone`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fffaf0" />
        <stop offset="60%" stopColor="#f1d9a8" />
        <stop offset="100%" stopColor="#c99a57" />
      </linearGradient>
    </defs>
    <g transform="rotate(-28 50 50)">
      <path
        d="M24 42 Q12 30 20 24 Q28 18 34 30 L66 30 Q72 18 80 24 Q88 30 76 42 L76 58 Q88 70 80 76 Q72 82 66 70 L34 70 Q28 82 20 76 Q12 70 24 58 Z"
        fill={`url(#${u}-bone)`}
        stroke={OUTLINE}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M36 36 L64 36" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
    </g>
  </svg>
  );
};

const WildHouse: React.FC<{ multiplier: number }> = ({ multiplier }) => {
  const u = useUid();
  return (
  <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
    <defs>
      <linearGradient id={`${u}-roof`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ff8a4a" />
        <stop offset="100%" stopColor="#b83a12" />
      </linearGradient>
      <linearGradient id={`${u}-wall`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffd08a" />
        <stop offset="100%" stopColor="#e39a3c" />
      </linearGradient>
      <linearGradient id={`${u}-mult`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fff38a" />
        <stop offset="55%" stopColor="#ffb300" />
        <stop offset="100%" stopColor="#d86a00" />
      </linearGradient>
    </defs>
    {/* murs */}
    <rect x="16" y="40" width="68" height="54" rx="4" fill={`url(#${u}-wall)`} stroke={OUTLINE} strokeWidth="3" />
    <path d="M16 56 H84 M16 72 H84" stroke="#b86b1f" strokeWidth="1.5" opacity="0.6" />
    {/* porte */}
    <path d="M34 94 V70 Q34 56 50 56 Q66 56 66 70 V94 Z" fill="#6a2e8f" stroke={OUTLINE} strokeWidth="2.5" />
    <path d="M38 94 V72 Q38 62 50 62 Q62 62 62 72 V94 Z" fill="#3d1557" />
    {/* toit */}
    <path d="M6 46 L50 6 L94 46 L84 50 L50 18 L16 50 Z" fill={`url(#${u}-roof)`} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
    {/* plaque os */}
    <path
      d="M30 30 Q24 26 28 22 Q32 20 34 25 L66 25 Q68 20 72 22 Q76 26 70 30 Q76 34 72 38 Q68 40 66 35 L34 35 Q32 40 28 38 Q24 34 30 30 Z"
      fill="#fff6e0"
      stroke={OUTLINE}
      strokeWidth="2"
    />
    <text x="50" y="34" textAnchor="middle" fontFamily="'Lilita One', sans-serif" fontSize="10" fill="#b83a12">
      WILD
    </text>
    {/* multiplicateur */}
    <text
      x="50"
      y="86"
      textAnchor="middle"
      fontFamily="'Lilita One', 'Luckiest Guy', sans-serif"
      fontSize="30"
      fill={`url(#${u}-mult)`}
      stroke={OUTLINE}
      strokeWidth="4"
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      {multiplier}X
    </text>
  </svg>
  );
};

const ScatterPaw = () => {
  const u = useUid();
  return (
  <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
    <defs>
      <radialGradient id={`${u}-coin`} cx="40%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#fff7b0" />
        <stop offset="55%" stopColor="#ffbf1f" />
        <stop offset="100%" stopColor="#b86b00" />
      </radialGradient>
      <radialGradient id={`${u}-ruby`} cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#ffb3c0" />
        <stop offset="45%" stopColor="#ff2b4f" />
        <stop offset="100%" stopColor="#8a0020" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="44" r="40" fill={`url(#${u}-coin)`} stroke={OUTLINE} strokeWidth="3" />
    <circle cx="50" cy="44" r="33" fill="#8a1a00" opacity="0.18" />
    {/* patte rubis */}
    <ellipse cx="50" cy="54" rx="15" ry="13" fill={`url(#${u}-ruby)`} stroke={OUTLINE} strokeWidth="2.5" />
    <ellipse cx="31" cy="38" rx="7" ry="9" transform="rotate(-20 31 38)" fill={`url(#${u}-ruby)`} stroke={OUTLINE} strokeWidth="2.2" />
    <ellipse cx="43" cy="26" rx="7" ry="9" transform="rotate(-6 43 26)" fill={`url(#${u}-ruby)`} stroke={OUTLINE} strokeWidth="2.2" />
    <ellipse cx="57" cy="26" rx="7" ry="9" transform="rotate(6 57 26)" fill={`url(#${u}-ruby)`} stroke={OUTLINE} strokeWidth="2.2" />
    <ellipse cx="69" cy="38" rx="7" ry="9" transform="rotate(20 69 38)" fill={`url(#${u}-ruby)`} stroke={OUTLINE} strokeWidth="2.2" />
    {/* bandeau BONUS */}
    <text
      x="50"
      y="93"
      textAnchor="middle"
      fontFamily="'Lilita One', 'Luckiest Guy', sans-serif"
      fontSize="24"
      fill="#ffe14a"
      stroke="#8a1a00"
      strokeWidth="5"
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      BONUS
    </text>
  </svg>
  );
};

export const DogSymbol: React.FC<{ id: DogSymbolId; multiplier?: number; className?: string }> = ({
  id,
  multiplier = 2,
  className = 'w-full h-full',
}) => {
  const uid = `dh${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  let node: React.ReactNode;
  switch (id) {
    case 'rottweiler':
      node = <Rottweiler />;
      break;
    case 'shihtzu':
      node = <ShihTzu />;
      break;
    case 'pug':
      node = <Pug />;
      break;
    case 'dachshund':
      node = <Dachshund />;
      break;
    case 'collar':
      node = <Collar />;
      break;
    case 'bone':
      node = <Bone />;
      break;
    case 'wild':
      node = <WildHouse multiplier={multiplier} />;
      break;
    case 'scatter':
      node = <ScatterPaw />;
      break;
    default:
      node = <CardSymbol label={id} />;
  }
  return (
    <div className={className}>
      <UidContext.Provider value={uid}>{node}</UidContext.Provider>
    </div>
  );
};
