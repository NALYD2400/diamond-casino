/**
 * Visuel d'un booster de collection : éventail des plus belles cartes de
 * l'album dans la fenêtre du paquet. Partagé par le jeu Collections et
 * l'inventaire de l'Espace Membre.
 */
import React from 'react';
import type { CollectionCatalog, CollectionSetData } from '../../lib/supabase';
import { BrandCardFace } from './BrandCard';
import { fmtChips, rarityMap, resolveBrandCard, type BrandCard } from './collectionUtils';

/** Éventail de cartes affiché dans la fenêtre du paquet */
export const PackFan: React.FC<{ cards: BrandCard[]; width: number; setName: string }> = ({ cards, width, setName }) => {
  const w = width * 0.42;
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {cards.slice(0, 3).map((c, i) => {
        const off = i - (Math.min(3, cards.length) - 1) / 2;
        return (
          <div key={c.id} className="absolute" style={{ transform: `translateX(${off * w * 0.55}px) translateY(${Math.abs(off) * 6}px) rotate(${off * 12}deg)`, zIndex: 3 - Math.abs(off) }}>
            <BrandCardFace card={c} width={w} interactive={false} lite setName={setName} />
          </div>
        );
      })}
    </div>
  );
};

/** Trois plus belles cartes d'un album (éventail sur le paquet) */
export function packFanCards(catalog: CollectionCatalog, setId: string): BrandCard[] {
  const rarities = rarityMap(catalog.rarities);
  return catalog.cards
    .filter((c) => c.set_id === setId && !c.hidden)
    .map((c) => resolveBrandCard(c, rarities))
    .filter((c) => !c.secret)
    .sort((a, b) => b.rarity.sort - a.rarity.sort || a.number - b.number)
    .slice(0, 3)
    .reverse();
}

/** Habillage du paquet d'un album pour <BoosterPack> */
export const packLookFor = (x: CollectionSetData) => ({
  id: x.id,
  name: x.name,
  cover_image_url: null,
  accent_color: x.accent_color,
  cards_per_pack: x.cards_per_pack,
  kicker: 'Collection de marques',
  backTitle: `Contient ${x.cards_per_pack} cartes de marques tirées au hasard`,
  backText: `Complétez l'album pour gagner ${fmtChips(x.reward)}. Les doublons se revendent en jetons.`,
});
