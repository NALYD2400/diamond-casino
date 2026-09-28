/**
 * Carte à collectionner (véhicule) — utilisée par le jeu et par l'aperçu de la console.
 * Format 5:7, cadre à la couleur de la rareté, photo détourée du véhicule sur un
 * décor lumineux, valeur du véhicule en bas. Inclinaison 3D + reflet holographique
 * qui suivent le pointeur (variables CSS, sans re-rendu React).
 */
import React, { useRef, useState } from 'react';
import { Car, Gem, Users } from 'lucide-react';
import type { ResolvedCard } from './boosterUtils';
import { fmtMoney, rarityTier, rgba } from './boosterUtils';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

interface BoosterCardProps {
  card: ResolvedCard;
  /** Largeur en px (la hauteur suit le ratio 5:7) */
  width?: number;
  /** Inclinaison 3D au survol */
  interactive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Mode grille (beaucoup de cartes à l'écran) : pas d'animation permanente ni
   * de couches de mélange coûteuses ; holo et reflets ne s'allument qu'au survol,
   * images chargées à l'arrivée à l'écran.
   */
  lite?: boolean;
}

/** Inclinaison 3D + position du reflet, pilotées par variables CSS (sans re-rendu) */
function useCardTilt(interactive: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || !interactive) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.classList.add('bst-tracking');
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    el.style.setProperty('--ry', `${(x - 0.5) * 22}deg`);
    el.style.setProperty('--rx', `${(0.5 - y) * 22}deg`);
    el.style.setProperty('--glare', '1');
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('bst-tracking');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--glare', '0');
    el.style.setProperty('--mx', '50%');
    el.style.setProperty('--my', '50%');
  };
  return { ref, onMove, onLeave };
}

export const BoosterCardFace: React.FC<BoosterCardProps> = ({ card, width = 260, interactive = true, className, style, lite = false }) => {
  const { ref, onMove, onLeave } = useCardTilt(interactive);
  const [hover, setHover] = useState(false);
  const tier = rarityTier(card.rarity);
  const c = card.color;
  const s = width / 260; // échelle typographique
  // En mode grille, les effets ne sont calculés que pour la carte survolée
  const fx = !lite || hover;

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerEnter={lite ? () => setHover(true) : undefined}
      onPointerLeave={() => {
        onLeave();
        if (lite) setHover(false);
      }}
      className={cx('bst-card relative select-none rounded-[14px]', className)}
      style={{
        width,
        height: width * 1.4,
        boxShadow: lite
          ? tier >= 1
            ? `0 0 ${10 + tier * 5}px ${rgba(c, 0.22 + tier * 0.06)}, 0 10px 24px rgba(0,0,0,0.5)`
            : '0 10px 24px rgba(0,0,0,0.5)'
          : tier >= 1
            ? `0 0 ${18 + tier * 10}px ${rgba(c, 0.25 + tier * 0.08)}, 0 20px 50px rgba(0,0,0,0.6)`
            : '0 20px 50px rgba(0,0,0,0.6)',
        ...style,
      }}
    >
      {/* Cadre */}
      <div
        className={cx('absolute inset-0 rounded-[14px] overflow-hidden', tier >= 4 && (fx ? 'bst-mythic-border' : 'bst-mythic-border bst-paused'))}
        style={tier >= 4 ? undefined : { background: `linear-gradient(145deg, ${rgba(c, 1)}, ${rgba(c, 0.35)} 40%, ${rgba(c, 0.9)} 75%, ${rgba(c, 0.4)})` }}
      />
      {/* Corps */}
      <div className="absolute inset-[3px] rounded-[11px] overflow-hidden bg-[#0a0a0d] flex flex-col" style={{ padding: 9 * s }}>
        {/* En-tête : marque + rareté */}
        <div className="flex items-center justify-between gap-2 relative z-[2]" style={{ height: 22 * s }}>
          <span className="uppercase tracking-[0.18em] text-white/60 font-semibold truncate" style={{ fontSize: 9.5 * s }}>
            {card.brand || '—'}
          </span>
          <span
            className="flex items-center gap-1 rounded-full font-bold uppercase tracking-wider whitespace-nowrap"
            style={{ fontSize: 8.5 * s, padding: `${2 * s}px ${7 * s}px`, color: c, background: rgba(c, 0.14), border: `1px solid ${rgba(c, 0.45)}` }}
          >
            <Gem size={9 * s} /> {card.rarity.label}
          </span>
        </div>

        {/* Visuel */}
        <div
          className="relative rounded-[8px] overflow-hidden mt-1.5 border"
          style={{
            height: 172 * s,
            borderColor: rgba(c, 0.35),
            background: `radial-gradient(ellipse at 50% 42%, ${rgba(c, 0.55)}, ${rgba(c, 0.12)} 45%, #050507 80%)`,
          }}
        >
          {/* Sol + reflet */}
          <div className="absolute inset-x-0 bottom-0 h-[38%]" style={{ background: `linear-gradient(to top, ${rgba(c, 0.18)}, transparent)` }} />
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-[50%]"
            style={{ bottom: '12%', width: '70%', height: 14 * s, background: 'radial-gradient(ellipse, rgba(0,0,0,0.8), transparent 70%)' }}
          />
          {card.image ? (
            <img
              src={card.image}
              alt=""
              draggable={false}
              loading={lite ? 'lazy' : undefined}
              decoding="async"
              className="absolute inset-0 w-full h-full object-contain"
              style={{ padding: `${10 * s}px ${6 * s}px ${14 * s}px`, filter: lite ? undefined : 'drop-shadow(0 10px 12px rgba(0,0,0,0.6))' }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/20">
              <Car size={56 * s} />
            </div>
          )}
          {tier >= 3 && fx && <div className="absolute inset-0 bst-shimmer pointer-events-none" />}
        </div>

        {/* Nom */}
        <div className="relative z-[2] mt-2 min-w-0">
          <div className="text-white font-bold uppercase leading-none truncate" style={{ fontSize: 19 * s, fontFamily: 'var(--font-tight)', letterSpacing: '-0.01em' }}>
            {card.title}
          </div>
          <div className="text-white/45 truncate mt-1" style={{ fontSize: 10 * s }}>
            {card.subtitle || (card.title.toLowerCase() !== card.model.toLowerCase() ? card.model : ' ')}
          </div>
        </div>

        {/* Caractéristiques */}
        <div className="relative z-[2] flex items-center gap-1.5 mt-auto" style={{ fontSize: 9 * s }}>
          {card.vehicleClass && (
            <span className="rounded-md bg-white/[0.06] border border-white/10 text-white/70 uppercase tracking-wider" style={{ padding: `${2 * s}px ${6 * s}px` }}>
              {card.vehicleClass}
            </span>
          )}
          {card.seats ? (
            <span className="flex items-center gap-1 rounded-md bg-white/[0.06] border border-white/10 text-white/70" style={{ padding: `${2 * s}px ${6 * s}px` }}>
              <Users size={9 * s} /> {card.seats}
            </span>
          ) : null}
        </div>

        {/* Valeur */}
        <div
          className="relative z-[2] mt-2 rounded-[8px] flex items-center justify-between"
          style={{ padding: `${6 * s}px ${9 * s}px`, background: rgba(c, 0.1), border: `1px solid ${rgba(c, 0.35)}` }}
        >
          <span className="uppercase tracking-[0.2em] text-white/50 font-semibold" style={{ fontSize: 8.5 * s }}>
            Valeur
          </span>
          <span className="font-mono font-bold text-white" style={{ fontSize: 15 * s }}>
            {fmtMoney(card.value)}
          </span>
        </div>
      </div>

      {/* Effets de surface */}
      {card.holo && fx && (
        <>
          <div className="absolute inset-[3px] rounded-[11px] bst-holo pointer-events-none" />
          <div className="absolute inset-[3px] rounded-[11px] bst-sparkle pointer-events-none" />
        </>
      )}
      {card.holo && !fx && (
        // Aperçu statique de l'irisation (sans mélange de calques)
        <div className="absolute inset-[3px] rounded-[11px] pointer-events-none opacity-[0.12]" style={{ background: 'linear-gradient(115deg, #ff0084, #ffc400, #00ffaa, #00a0ff, #aa00ff)' }} />
      )}
      {fx && <div className="absolute inset-0 rounded-[14px] bst-glare pointer-events-none" />}
    </div>
  );
};

const GOLD = '#d9b25f';

/** Ornement d'angle du dos de carte */
function corner(pos: string, rot: number, s: number) {
  return (
    <svg key={pos} className={cx('absolute', pos)} width={22 * s} height={22 * s} viewBox="0 0 22 22" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M1 21V7Q1 1 7 1h14" fill="none" stroke={GOLD} strokeWidth="1.2" opacity="0.8" />
      <path d="M5 21V10Q5 5 10 5h11" fill="none" stroke={GOLD} strokeWidth="0.6" opacity="0.5" />
      <rect x="0.5" y="0.5" width="4" height="4" transform="rotate(45 2.5 2.5)" fill={GOLD} />
    </svg>
  );
}

/**
 * Dos de carte commun à toute la collection : bordure métal brossé, fond
 * guilloché façon billet, médaillon central avec le logo, losanges d'angle,
 * reflet holographique. `hint` = couleur qui pulse (carte rare ou mieux à venir).
 */
export const BoosterCardBack: React.FC<{ width?: number; hint?: string | null; interactive?: boolean; className?: string; style?: React.CSSProperties }> = ({
  width = 260,
  hint,
  interactive = true,
  className,
  style,
}) => {
  const { ref, onMove, onLeave } = useCardTilt(interactive);
  const s = width / 260;
    return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cx('bst-card relative select-none rounded-[14px]', hint && 'bst-back-pulse', className)}
      style={{
        width,
        height: width * 1.4,
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        ['--bst-hint' as string]: hint ? rgba(hint, 0.8) : undefined,
        ...style,
      }}
    >
      {/* Bordure métal */}
      <div
        className="absolute inset-0 rounded-[14px]"
        style={{
          background: `linear-gradient(135deg, #f4e3b0, ${GOLD} 18%, #6b5424 38%, #e8cf8a 55%, #7a5f28 75%, #f1dca0)`,
        }}
      />
      <div className="absolute inset-0 rounded-[14px] opacity-40" style={{ background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.25) 0 1px, transparent 1px 3px)' }} />

      {/* Fond guilloché */}
      <div className="absolute rounded-[10px] overflow-hidden" style={{ inset: 5 * s }}>
        <div
          className="absolute inset-0"
          style={{
            background: [
              'repeating-radial-gradient(circle at 50% 50%, rgba(217,178,95,0.10) 0 1px, transparent 1px 6px)',
              'repeating-conic-gradient(from 0deg at 50% 50%, rgba(217,178,95,0.06) 0deg 2deg, transparent 2deg 7deg)',
              'repeating-linear-gradient(60deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 11px)',
              'repeating-linear-gradient(-60deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 11px)',
              'radial-gradient(ellipse at 50% 45%, #1c1a22 0%, #0b0a0e 55%, #030304 100%)',
            ].join(', '),
          }}
        />
        {/* Cadre intérieur */}
        <div className="absolute rounded-[8px]" style={{ inset: 9 * s, border: `1px solid ${rgba(GOLD, 0.45)}`, boxShadow: `inset 0 0 0 ${3 * s}px rgba(0,0,0,0.6), inset 0 0 0 ${3 * s + 1}px ${rgba(GOLD, 0.2)}` }} />
        {corner('top-[6%] left-[7%]', 0, s)}
        {corner('top-[6%] right-[7%]', 90, s)}
        {corner('bottom-[6%] right-[7%]', 180, s)}
        {corner('bottom-[6%] left-[7%]', 270, s)}

        {/* Textes */}
        <div className="absolute inset-x-0 text-center uppercase font-semibold" style={{ top: '11%', fontSize: 8 * s, letterSpacing: '0.45em', color: rgba(GOLD, 0.85) }}>
          The Diamond Casino
        </div>
        <div className="absolute inset-x-0 text-center uppercase" style={{ bottom: '11%', fontSize: 7 * s, letterSpacing: '0.35em', color: rgba(GOLD, 0.6) }}>
          Carte véhicule · Série 01
        </div>

        {/* Médaillon */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: 170 * s, height: 170 * s }}>
          <div className="absolute inset-0 rounded-full bst-rays opacity-70" style={{ ['--bst-ray' as string]: rgba(GOLD, 0.18) }} />
          <div
            className="absolute rounded-full"
            style={{
              inset: 22 * s,
              background: `conic-gradient(from 210deg, #f4e3b0, ${GOLD}, #5e4a1e, #e8cf8a, #6b5424, #f4e3b0)`,
              boxShadow: `0 0 ${24 * s}px ${rgba(GOLD, 0.35)}, 0 ${6 * s}px ${14 * s}px rgba(0,0,0,0.7)`,
            }}
          />
          <div
            className="absolute rounded-full flex items-center justify-center"
            style={{
              inset: 26 * s,
              background: 'radial-gradient(circle at 50% 35%, #25222c, #07070a 75%)',
              boxShadow: `inset 0 0 0 1px ${rgba(GOLD, 0.5)}, inset 0 ${4 * s}px ${12 * s}px rgba(0,0,0,0.8)`,
            }}
          >
            <div className="absolute rounded-full" style={{ inset: 7 * s, border: `1px dashed ${rgba(GOLD, 0.35)}` }} />
            <img src="/hero_logo.png" alt="" draggable={false} className="relative w-[82%] h-auto drop-shadow-[0_0_10px_rgba(255,255,255,0.25)]" />
          </div>
        </div>
      </div>

      {/* Reflets */}
      <div className="absolute rounded-[10px] bst-holo pointer-events-none" style={{ inset: 5 * s, opacity: 'calc(0.06 + var(--glare) * 0.3)' }} />
      <div className="absolute inset-0 rounded-[14px] bst-shimmer pointer-events-none opacity-70" />
      <div className="absolute inset-0 rounded-[14px] bst-glare pointer-events-none" />
    </div>
  );
};
