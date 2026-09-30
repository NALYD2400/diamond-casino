/**
 * Outils partagés par le jeu Collections et l'onglet Collections de la console :
 * résolution d'une carte de marque, polices des logos, chances par rareté.
 * Le tirage réel est fait par le serveur (open_collection_pack).
 */
import type React from 'react';
import type { CollectionCardData, CollectionFont, CollectionRarity, CollectionSetData } from '../../lib/supabase';

export const FALLBACK_RARITY: CollectionRarity = {
  key: '?',
  label: 'Carte',
  color: '#a3a3a3',
  effect: 'none',
  sort: 0,
  sell_value: 0,
  in_collection: true,
};

export interface BrandCard {
  id: string;
  setId: string;
  number: number;
  name: string;
  tagline: string | null;
  rarity: CollectionRarity;
  color: string;
  color2: string;
  font: CollectionFont;
  emblem: string;
  image: string | null;
  /** Carte secrète pas encore trouvée */
  hidden: boolean;
  /** Carte hors album (rareté secrète) */
  secret: boolean;
}

/** « Överflöd » → « overflod », « Le Chien » → « le-chien » */
export function brandSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Logo d'une carte : URL saisie dans la console, sinon fichier déposé dans
 * public/logos/<album>/<marque>.png (ex. public/logos/autos/pegassi.png).
 */
export const logoPath = (setId: string, name: string) => `/logos/${setId}/${brandSlug(name)}.png`;

export function rarityMap(rarities: CollectionRarity[]): Record<string, CollectionRarity> {
  return Object.fromEntries(rarities.map((r) => [r.key, r]));
}

export function resolveBrandCard(card: CollectionCardData, rarities: Record<string, CollectionRarity>): BrandCard {
  const rarity = rarities[card.rarity] ?? { ...FALLBACK_RARITY, key: card.rarity, label: card.rarity };
  const name = card.name?.trim() || '???';
  return {
    id: card.id,
    setId: card.set_id,
    number: card.number,
    name,
    tagline: card.tagline?.trim() || null,
    rarity,
    color: card.color || rarity.color,
    color2: card.color2 || '#111111',
    font: card.font || 'tight',
    emblem: (card.emblem?.trim() || name.charAt(0)).toUpperCase(),
    image: card.image_url?.trim() || (card.hidden || !card.name ? null : logoPath(card.set_id, card.name)),
    hidden: !!card.hidden,
    secret: !rarity.in_collection,
  };
}

/** Style typographique du logo d'une marque */
export const FONT_STYLE: Record<CollectionFont, React.CSSProperties> = {
  tight: { fontFamily: 'var(--font-tight)', fontWeight: 800, letterSpacing: '-0.02em' },
  'tight-italic': { fontFamily: 'var(--font-tight)', fontWeight: 800, fontStyle: 'italic', letterSpacing: '-0.03em' },
  serif: { fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: '0.01em' },
  'serif-italic': { fontFamily: 'var(--font-serif)', fontWeight: 400, fontStyle: 'italic' },
  mono: { fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.04em' },
  oswald: { fontFamily: "'Oswald', sans-serif", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' },
  lilita: { fontFamily: "'Lilita One', sans-serif", fontWeight: 400 },
  luckiest: { fontFamily: "'Luckiest Guy', sans-serif", fontWeight: 400, letterSpacing: '0.02em' },
  rye: { fontFamily: "'Rye', serif", fontWeight: 400 },
};

export const FONT_LABELS: Record<CollectionFont, string> = {
  tight: 'Moderne',
  'tight-italic': 'Moderne italique',
  serif: 'Classique',
  'serif-italic': 'Classique italique',
  mono: 'Technique',
  oswald: 'Condensée',
  lilita: 'Ronde',
  luckiest: 'Cartoon',
  rye: 'Western',
};

export const fmtChips = (n: number) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} ⛁`;

/** Intensité de mise en scène d'une rareté : 0 (commune) → 4 (mythique / secrète) */
export function rarityTier(r: CollectionRarity): number {
  return { none: 0, glow: 1, holo: 2, rays: 3, mythic: 4 }[r.effect] ?? 0;
}

/**
 * Chances par carte tirée pour chaque rareté d'un album : seules les raretés
 * ayant un poids ET au moins une carte comptent (même règle que le serveur).
 */
export function setOdds(
  set: Pick<CollectionSetData, 'id' | 'rarity_weights'>,
  cards: CollectionCardData[],
  rarities: CollectionRarity[],
): { rarity: CollectionRarity; pct: number; count: number }[] {
  const counts: Record<string, number> = {};
  for (const c of cards) if (c.set_id === set.id && c.active) counts[c.rarity] = (counts[c.rarity] ?? 0) + 1;
  const rows = rarities
    .map((r) => ({ rarity: r, weight: Math.max(0, Number(set.rarity_weights?.[r.key]) || 0), count: counts[r.key] ?? 0 }))
    .filter((r) => r.weight > 0 && r.count > 0);
  const total = rows.reduce((a, r) => a + r.weight, 0);
  return rows.map((r) => ({ rarity: r.rarity, count: r.count, pct: total > 0 ? (r.weight / total) * 100 : 0 }));
}

/** 0.7 → « 0,7 % », 58 → « 58 % », 0.1 → « 0,1 % » */
export const fmtPct = (pct: number) => `${pct.toLocaleString('fr-FR', { maximumFractionDigits: pct < 1 ? 2 : 1 })} %`;
