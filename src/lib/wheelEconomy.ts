/**
 * Rentabilité de la Roue de la Fortune, calculée comme wheel_ev() côté serveur :
 * jetons à leur montant, véhicules à leur valeur catalogue, bons de bonus à leur valeur,
 * boosters au prix de l'album, cartes VIP à leur prix d'achat. Objets mystère / vêtements : non chiffrés.
 */
import { useEffect, useState } from 'react';
import type { WheelSegmentConfig } from '../context/CasinoAdminContext';
import { DEFAULT_VIP_CONFIG, type VipConfig } from './gamesConfig';
import { apiCollectionCatalog } from './supabase';

/** Album de collection (id, nom, prix du booster) pour les lots « booster » */
export type PackSet = { id: string; name: string; price: number };

export const DEFAULT_PACK_SETS: PackSet[] = [
  { id: 'autos', name: 'Marques automobiles', price: 25000 },
  { id: 'mode', name: 'Marques de mode', price: 25000 },
];

/** Albums réels lus sur le serveur (valeurs par défaut en attendant) */
export function usePackSets(): PackSet[] {
  const [sets, setSets] = useState<PackSet[]>(DEFAULT_PACK_SETS);
  useEffect(() => {
    apiCollectionCatalog()
      .then((c) => c.sets.length && setSets(c.sets.map((x) => ({ id: x.id, name: x.name, price: x.pack_price }))))
      .catch(() => {});
  }, []);
  return sets;
}

export interface WheelValueContext {
  packSets?: PackSet[];
  vipConfig?: VipConfig;
}

/** Valeur d'un lot en jetons, ou null s'il n'est pas chiffré (objet mystère, vêtement) */
export function lotValue(s: WheelSegmentConfig, ctx: WheelValueContext = {}): number | null {
  const packSets = ctx.packSets ?? DEFAULT_PACK_SETS;
  const vip = ctx.vipConfig ?? DEFAULT_VIP_CONFIG;
  switch (s.type) {
    case 'chips':
      return Number(s.value) || 0;
    case 'vehicle':
      return Number(s.vehicleValue) || 0;
    case 'voucher':
      return Number(s.voucherValue) || 0;
    case 'pack':
      return packSets.find((p) => p.id === s.packSet)?.price ?? Math.max(0, ...packSets.map((p) => p.price));
    case 'vip':
      return vip[s.vipTier ?? 'SILVER']?.price ?? 0;
    default:
      return null;
  }
}

/** Chance de chaque lot, en % (poids ÷ somme des poids) */
export function lotChances(segments: WheelSegmentConfig[]): number[] {
  const total = segments.reduce((a, s) => a + Math.max(0, Number(s.dropRate) || 0), 0);
  return segments.map((s) => (total > 0 ? (Math.max(0, Number(s.dropRate) || 0) / total) * 100 : 100 / Math.max(1, segments.length)));
}

/** Valeur moyenne rendue au joueur par tour, en jetons */
export function wheelExpected(segments: WheelSegmentConfig[], ctx: WheelValueContext = {}): number {
  const chances = lotChances(segments);
  return segments.reduce((a, s, i) => a + (lotValue(s, ctx) ?? 0) * (chances[i] / 100), 0);
}

/** Retour joueur en % du prix du tour */
export function wheelRtp(segments: WheelSegmentConfig[], spinPrice: number, ctx: WheelValueContext = {}): number {
  return spinPrice > 0 ? (wheelExpected(segments, ctx) / spinPrice) * 100 : 0;
}
