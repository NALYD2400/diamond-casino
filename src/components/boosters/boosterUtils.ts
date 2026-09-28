/**
 * Outils partagés par le jeu Boosters et l'onglet Boosters de la console :
 * résolution d'une carte (surcharges + véhicule), raretés, probabilités.
 * Le tirage réel est fait par le serveur (open_booster) ; pickWeighted ne sert
 * qu'aux tests et à l'aperçu.
 */
import type { BoosterCardData, BoosterPackData, BoosterRarity } from '../../lib/supabase';

/** « zentorno » → « Zentorno » */
export const modelName = (model: string) => (model ? model.charAt(0).toUpperCase() + model.slice(1) : '');

export const FALLBACK_RARITY: BoosterRarity = { key: '?', label: 'Carte', color: '#a3a3a3', effect: 'none', sort: 0 };

export interface ResolvedCard {
  title: string;
  brand: string;
  model: string;
  vehicleClass: string;
  seats: number | null;
  image: string | null;
  value: number;
  rarity: BoosterRarity;
  color: string;
  holo: boolean;
  subtitle: string | null;
}

export function rarityMap(rarities: BoosterRarity[]): Record<string, BoosterRarity> {
  return Object.fromEntries(rarities.map((r) => [r.key, r]));
}

export function resolveCard(card: BoosterCardData, rarities: Record<string, BoosterRarity>): ResolvedCard {
  const v = card.vehicle;
  const rarity = rarities[card.rarity] ?? { ...FALLBACK_RARITY, key: card.rarity, label: card.rarity };
  const brand = (v?.manufacturer || '').trim();
  return {
    title: card.title?.trim() || modelName(card.vehicle_model),
    brand: brand ? brand.charAt(0) + brand.slice(1).toLowerCase() : '',
    model: card.vehicle_model,
    vehicleClass: (v?.class || '').replace(/_/g, ' '),
    seats: v?.seats ?? null,
    image: card.image_url?.trim() || v?.photo_full_url || v?.photo_url || null,
    value: card.value_override ?? v?.price ?? card.value ?? 0,
    rarity,
    color: card.accent_color || rarity.color,
    holo: card.holo || rarity.effect === 'holo' || rarity.effect === 'rays' || rarity.effect === 'mythic',
    subtitle: card.subtitle?.trim() || null,
  };
}

export const fmtMoney = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('fr-FR')}`;
export const fmtChips = (n: number) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} ⛁`;

/** Intensité de mise en scène d'une rareté : 0 (commune) → 4 (mythique) */
export function rarityTier(r: BoosterRarity): number {
  return { none: 0, glow: 1, holo: 2, rays: 3, mythic: 4 }[r.effect] ?? 0;
}

/**
 * Chances réelles par rareté pour un booster : seules les raretés ayant un
 * poids ET au moins une carte active comptent (même règle que le serveur).
 */
export function packOdds(
  pack: Pick<BoosterPackData, 'rarity_weights' | 'cards'>,
  cardsById: Record<string, BoosterCardData>,
  rarities: BoosterRarity[],
): { rarity: BoosterRarity; weight: number; pct: number; count: number }[] {
  const counts: Record<string, number> = {};
  for (const pc of pack.cards) {
    const c = cardsById[pc.card_id];
    if (c && c.active) counts[c.rarity] = (counts[c.rarity] ?? 0) + 1;
  }
  const rows = rarities
    .map((r) => ({ rarity: r, weight: Math.max(0, Number(pack.rarity_weights?.[r.key]) || 0), count: counts[r.key] ?? 0 }))
    .filter((r) => r.weight > 0 && r.count > 0);
  const total = rows.reduce((a, r) => a + r.weight, 0);
  return rows.map((r) => ({ ...r, pct: total > 0 ? (r.weight / total) * 100 : 0 }));
}

/**
 * Part attendue de chaque rareté parmi TOUTES les cartes tirées, garantie comprise
 * (même règle que le serveur : si aucune carte du niveau garanti ou mieux n'est
 * sortie sur les n-1 premières, la dernière est tirée parmi ces raretés).
 */
export function expectedRarityShares(
  pack: Pick<BoosterPackData, 'rarity_weights' | 'cards' | 'cards_per_pack' | 'guaranteed_rarity'>,
  cardsById: Record<string, BoosterCardData>,
  rarities: BoosterRarity[],
): Record<string, number> {
  const odds = packOdds(pack, cardsById, rarities);
  const n = Math.max(1, pack.cards_per_pack);
  const g = rarities.find((r) => r.key === pack.guaranteed_rarity)?.sort;
  const eligible = g === undefined ? [] : odds.filter((o) => o.rarity.sort >= g);
  const pg = eligible.reduce((a, o) => a + o.pct / 100, 0);
  const out: Record<string, number> = {};
  for (const o of odds) {
    const p = o.pct / 100;
    if (!eligible.length || pg <= 0) {
      out[o.rarity.key] = p;
      continue;
    }
    const q = Math.pow(1 - pg, n - 1); // aucune carte garantie sur les n-1 premières
    const last = (1 - q) * p + q * (o.rarity.sort >= g! ? p / pg : 0);
    out[o.rarity.key] = ((n - 1) * p + last) / n;
  }
  return out;
}

/** Tirage pondéré (miroir du serveur) : rand dans [0, 1) */
export function pickWeighted<T>(items: T[], weight: (t: T) => number, rand: number): T | undefined {
  const total = items.reduce((a, t) => a + Math.max(0, weight(t)), 0);
  if (total <= 0) return undefined;
  let x = rand * total;
  let last: T | undefined;
  for (const t of items) {
    const w = Math.max(0, weight(t));
    if (w <= 0) continue;
    last = t;
    if (x < w) return t;
    x -= w;
  }
  return last;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [163, 163, 163];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

type PackForEv = Pick<BoosterPackData, 'rarity_weights' | 'cards' | 'cards_per_pack' | 'guaranteed_rarity'>;

/** Valeur moyenne d'une carte de chaque rareté (pondérée par le poids des cartes) */
function rarityAverages(pack: PackForEv, cardsById: Record<string, BoosterCardData>): Record<string, number> {
  const sum: Record<string, { v: number; w: number }> = {};
  for (const pc of pack.cards) {
    const c = cardsById[pc.card_id];
    if (!c?.active) continue;
    const s = (sum[c.rarity] ??= { v: 0, w: 0 });
    s.v += c.value * pc.weight;
    s.w += pc.weight;
  }
  return Object.fromEntries(Object.entries(sum).map(([k, s]) => [k, s.w ? s.v / s.w : 0]));
}

/**
 * Valeur moyenne des véhicules d'un booster ($), garantie comprise.
 * Même formule que booster_pool_ev() côté serveur (qui fait foi).
 */
export function packExpectedValue(pack: PackForEv, cardsById: Record<string, BoosterCardData>, rarities: BoosterRarity[]): number {
  const shares = expectedRarityShares(pack, cardsById, rarities);
  const avg = rarityAverages(pack, cardsById);
  return Math.round(Object.entries(shares).reduce((a, [k, s]) => a + s * (avg[k] ?? 0), 0) * Math.max(1, pack.cards_per_pack));
}

/** Retour joueur (%) = valeur moyenne / prix (1 jeton = 1 $) */
export const packRtp = (ev: number, price: number) => (ev * 100) / Math.max(1, price);

/** Prix conseillé pour atteindre un retour joueur cible (arrondi « commercial » vers le haut) */
export function suggestPrice(ev: number, targetRtp: number): number {
  const raw = ev / (Math.max(1, targetRtp) / 100);
  if (raw <= 0) return 0;
  const step = Math.pow(10, Math.max(2, Math.floor(Math.log10(raw)) - 1)) / 2;
  return Math.ceil(raw / step) * step;
}

/**
 * Ajuste les chances par rareté pour que la valeur moyenne atteigne `targetEv`
 * sans changer le prix : les raretés dont les cartes valent cher sont rendues
 * plus rares (et inversement), en gardant leur ordre. Renvoie null si la cible
 * est hors d'atteinte (ex. la carte la moins chère vaut déjà plus que la cible).
 */
export function tiltRarityWeights(
  pack: PackForEv,
  cardsById: Record<string, BoosterCardData>,
  rarities: BoosterRarity[],
  targetEv: number,
): Record<string, number> | null {
  const avg = rarityAverages(pack, cardsById);
  const keys = packOdds(pack, cardsById, rarities).map((o) => o.rarity.key);
  if (!keys.length) return null;
  const maxAvg = Math.max(1, ...keys.map((k) => avg[k] ?? 0));
  const base = Object.fromEntries(keys.map((k) => [k, Math.max(0, Number(pack.rarity_weights[k]) || 0)]));
  const weightsFor = (t: number) => {
    const raw = keys.map((k) => base[k] * Math.exp(-t * ((avg[k] ?? 0) / maxAvg)));
    const total = raw.reduce((a, b) => a + b, 0) || 1;
    // Normalisé sur 100, 4 chiffres significatifs, jamais 0 (la rareté reste possible)
    return Object.fromEntries(keys.map((k, i) => [k, Math.max(0.0001, Number(((raw[i] / total) * 100).toPrecision(4)))]));
  };
  const evFor = (t: number) => packExpectedValue({ ...pack, rarity_weights: weightsFor(t) }, cardsById, rarities);
  let lo = -60;
  let hi = 60;
  if (targetEv < evFor(hi) || targetEv > evFor(lo)) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (evFor(mid) > targetEv) lo = mid;
    else hi = mid;
  }
  return weightsFor(hi);
}
