/**
 * Carte de collection « marque » (autos & mode de GTA V).
 * Format 5:7 comme les cartes véhicules : cadre à la couleur de la rareté,
 * fond aux couleurs de la marque, logo typographique (ou image fournie par la
 * direction), numéro dans l'album. Inclinaison 3D + reflets holographiques qui
 * suivent le pointeur (variables CSS, sans re-rendu React).
 */
import React, { useState } from 'react';
import { Gem, HelpCircle, Lock, Sparkles } from 'lucide-react';
import { useCardTilt } from '../boosters/BoosterCard';
import { rgba } from '../boosters/boosterUtils';
import { FONT_STYLE, rarityTier, type BrandCard } from './collectionUtils';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

interface BrandCardProps {
  card: BrandCard;
  /** Largeur en px (la hauteur suit le ratio 5:7) */
  width?: number;
  interactive?: boolean;
  /** Mode grille : effets coûteux seulement au survol */
  lite?: boolean;
  /** Nom de l'album en pied de carte */
  setName?: string;
  /** Nombre de cartes de l'album (pour « #12 / 48 ») */
  setSize?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** Taille du logo selon la longueur du nom (tient sur deux lignes max.) */
function wordmarkSize(name: string, s: number) {
  const n = name.length;
  const base = n <= 5 ? 40 : n <= 8 ? 33 : n <= 11 ? 27 : n <= 15 ? 23 : 19;
  return base * s;
}

export const BrandCardFace: React.FC<BrandCardProps> = ({ card, width = 240, interactive = true, lite = false, setName, setSize, className, style }) => {
  const { ref, onMove, onLeave } = useCardTilt(interactive);
  const [hover, setHover] = useState(false);
  const tier = rarityTier(card.rarity);
  const rc = card.rarity.color;
  const s = width / 240;
  const fx = !lite || hover;
  const holo = tier >= 2;
  // Logo absent (pas encore déposé) : logo typographique aux couleurs de la marque
  const [failed, setFailed] = useState<string | null>(null);
  const image = card.image && failed !== card.image ? card.image : null;
  // Cartes secrètes des marques auto : le visuel est une carte complète (plein cadre)
  const fullArt = !!image && card.secret && card.setId === 'autos';

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
        boxShadow:
          tier >= 1
            ? `0 0 ${(lite ? 10 : 18) + tier * (lite ? 5 : 10)}px ${rgba(rc, 0.22 + tier * 0.07)}, 0 ${lite ? 10 : 20}px ${lite ? 24 : 50}px rgba(0,0,0,0.55)`
            : `0 ${lite ? 10 : 20}px ${lite ? 24 : 50}px rgba(0,0,0,0.55)`,
        ...style,
      }}
    >
      {/* Cadre à la couleur de la rareté */}
      <div
        className={cx('absolute inset-0 rounded-[14px] overflow-hidden', tier >= 4 && (fx ? 'bst-mythic-border' : 'bst-mythic-border bst-paused'))}
        style={tier >= 4 ? undefined : { background: `linear-gradient(145deg, ${rc}, ${rgba(rc, 0.35)} 40%, ${rgba(rc, 0.95)} 75%, ${rgba(rc, 0.4)})` }}
      />

      {/* Corps aux couleurs de la marque */}
      <div className="absolute inset-[3px] rounded-[11px] overflow-hidden flex flex-col" style={{ background: '#08080a' }}>
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 120% 70% at 50% 38%, ${rgba(card.color, 0.95)}, ${rgba(card.color, 0.55)} 45%, #060608 100%)`,
          }}
        />
        {/* Motif diagonal */}
        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{ background: `repeating-linear-gradient(135deg, ${card.color2} 0 2px, transparent 2px ${14 * s}px)` }}
        />
        {/* Monogramme géant en filigrane */}
        <div
          className="absolute -right-[8%] top-[4%] leading-none pointer-events-none"
          style={{ ...FONT_STYLE[card.font], fontSize: 170 * s, color: rgba(card.color2, 0.1) }}
        >
          {card.emblem}
        </div>

        {/* En-tête : numéro + rareté */}
        <div className="relative z-[2] flex items-center justify-between gap-2" style={{ padding: `${9 * s}px ${10 * s}px 0` }}>
          <span className="font-mono font-bold text-white/85 rounded-md bg-black/45 border border-white/15" style={{ fontSize: 9.5 * s, padding: `${2 * s}px ${6 * s}px` }}>
            {card.secret ? 'S' : '#'}
            {String(card.number).padStart(2, '0')}
            {setSize && !card.secret ? <span className="text-white/45"> / {setSize}</span> : null}
          </span>
          <span
            className="flex items-center gap-1 rounded-full font-bold uppercase tracking-wider whitespace-nowrap"
            style={{ fontSize: 8.5 * s, padding: `${2 * s}px ${7 * s}px`, color: '#fff', background: rgba(rc, 0.35), border: `1px solid ${rgba(rc, 0.8)}` }}
          >
            {card.secret ? <Sparkles size={9 * s} /> : <Gem size={9 * s} />} {card.rarity.label}
          </span>
        </div>

        {/* Logo */}
        <div className="relative z-[2] flex-1 flex flex-col items-center justify-center" style={{ padding: `0 ${12 * s}px` }}>
          {image ? (
            <img
              src={image}
              onError={() => setFailed(image)}
              alt=""
              draggable={false}
              loading={lite ? 'lazy' : undefined}
              decoding="async"
              className="max-w-[88%] max-h-[70%] object-contain"
              style={{ filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.55))' }}
            />
          ) : (
            <>
              {/* Écusson */}
              <div
                className="relative rounded-full flex items-center justify-center"
                style={{
                  width: 62 * s,
                  height: 62 * s,
                  background: `radial-gradient(circle at 35% 30%, ${rgba(card.color2, 1)}, ${rgba(card.color2, 0.75)} 60%, ${rgba(card.color2, 0.45)})`,
                  boxShadow: `0 0 0 ${2 * s}px ${rgba(card.color, 1)}, 0 0 0 ${3.5 * s}px ${rgba(card.color2, 0.7)}, 0 ${6 * s}px ${14 * s}px rgba(0,0,0,0.55)`,
                }}
              >
                <span className="leading-none" style={{ ...FONT_STYLE[card.font], fontSize: (card.emblem.length > 2 ? 17 : card.emblem.length > 1 ? 23 : 31) * s, color: card.color }}>
                  {card.emblem}
                </span>
              </div>
              {/* Nom de la marque */}
              <div
                className="mt-[9%] text-center leading-[0.95] break-words"
                style={{
                  ...FONT_STYLE[card.font],
                  fontSize: wordmarkSize(card.name, s),
                  color: card.color2,
                  textShadow: `0 ${2 * s}px 0 rgba(0,0,0,0.35), 0 0 ${18 * s}px ${rgba(card.color2, 0.25)}`,
                  maxWidth: '100%',
                }}
              >
                {card.name}
              </div>
            </>
          )}
          {tier >= 3 && fx && <div className="absolute inset-0 bst-shimmer pointer-events-none" />}
        </div>

        {/* Slogan + pied */}
        <div className="relative z-[2]" style={{ padding: `0 ${10 * s}px ${9 * s}px` }}>
          {image && (
            <div className="text-white font-bold uppercase truncate text-center" style={{ ...FONT_STYLE[card.font], fontSize: 17 * s }}>
              {card.name}
            </div>
          )}
          <div
            className="rounded-[8px] text-center"
            style={{ padding: `${5 * s}px ${8 * s}px`, background: 'rgba(0,0,0,0.5)', border: `1px solid ${rgba(rc, 0.45)}` }}
          >
            <div className="text-white/85 truncate" style={{ fontSize: 10.5 * s }}>
              {card.tagline || ' '}
            </div>
            <div className="uppercase text-white/40 truncate mt-0.5" style={{ fontSize: 7 * s, letterSpacing: '0.28em' }}>
              {setName ?? 'Los Santos'} · The Diamond
            </div>
          </div>
        </div>
      </div>

      {/* Carte secrète : visuel plein cadre par-dessus le corps */}
      {fullArt && (
        <img
          src={image!}
          onError={() => setFailed(image)}
          alt={card.name}
          draggable={false}
          loading={lite ? 'lazy' : undefined}
          decoding="async"
          className="absolute inset-[3px] w-[calc(100%-6px)] h-[calc(100%-6px)] rounded-[11px] object-cover pointer-events-none z-[5]"
        />
      )}

      {/* Effets de surface */}
      {holo && fx && (
        <>
          <div className="absolute inset-[3px] rounded-[11px] bst-holo pointer-events-none" />
          <div className="absolute inset-[3px] rounded-[11px] bst-sparkle pointer-events-none" />
        </>
      )}
      {holo && !fx && (
        <div className="absolute inset-[3px] rounded-[11px] pointer-events-none opacity-[0.12]" style={{ background: 'linear-gradient(115deg, #ff0084, #ffc400, #00ffaa, #00a0ff, #aa00ff)' }} />
      )}
      {fx && <div className="absolute inset-0 rounded-[14px] bst-glare pointer-events-none" />}
    </div>
  );
};

/**
 * Emplacement vide de l'album : carte pas encore trouvée (numéro + rareté),
 * ou carte secrète inconnue (« ??? »).
 */
export const BrandCardSlot: React.FC<{ card: BrandCard; width?: number; setSize?: number; className?: string }> = ({ card, width = 240, setSize, className }) => {
  const s = width / 240;
  const rc = card.rarity.color;
  return (
    <div
      className={cx('relative select-none rounded-[14px] overflow-hidden', className)}
      style={{
        width,
        height: width * 1.4,
        background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0 6px, transparent 6px 12px), #0b0b0e',
        border: `${Math.max(1, 1.5 * s)}px dashed ${rgba(rc, 0.45)}`,
      }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center" style={{ padding: 12 * s }}>
        <span className="font-mono font-bold" style={{ fontSize: 26 * s, color: rgba(rc, 0.75) }}>
          {card.secret ? 'S' : '#'}
          {String(card.number).padStart(2, '0')}
        </span>
        {card.hidden ? <HelpCircle size={28 * s} className="text-white/25" /> : <Lock size={22 * s} className="text-white/20" />}
        <span className="font-semibold text-white/45 truncate max-w-full" style={{ fontSize: 12 * s }}>
          {card.hidden ? 'Carte secrète' : card.name}
        </span>
        <span className="uppercase font-bold tracking-wider" style={{ fontSize: 8.5 * s, color: rgba(rc, 0.8) }}>
          {card.rarity.label}
        </span>
      </div>
      {setSize && !card.secret && (
        <span className="absolute bottom-1.5 right-2 font-mono text-white/20" style={{ fontSize: 8 * s }}>
          / {setSize}
        </span>
      )}
    </div>
  );
};
