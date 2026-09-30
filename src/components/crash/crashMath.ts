/**
 * Maths du Crash — identiques à la base (migration crash_game) :
 *   multiplicateur(t) = e^(0,00006 × t_ms), arrondi au centième inférieur
 *   point de crash    = ⌊ RTP × 2^52 / (2^52 − n) ⌋ / 100, n = 52 bits de sha256(graine:crash)
 * P(crash ≥ x) = RTP / x : encaisser à x rend RTP % en moyenne, quel que soit x.
 */
import { seedInt52 } from '../originals/OriginalsShell';

export const GROWTH = 0.00006;
const E52 = 4503599627370496n;

/** Multiplicateur exact (non arrondi) après ms millisecondes */
export const rawMultAt = (ms: number) => Math.exp(GROWTH * Math.max(0, ms));
/** Multiplicateur affiché / payé (centième inférieur) */
export const multAt = (ms: number) => Math.floor(rawMultAt(ms) * 100) / 100;
/** Temps (ms) pour atteindre un multiplicateur */
export const msFor = (mult: number) => Math.log(Math.max(1, mult)) / GROWTH;

/** Point de crash tiré d'une graine (recalcul exact de la valeur serveur) */
export async function crashFromSeed(seed: string, rtp: number, maxMult: number): Promise<number> {
  const n = await seedInt52(seed, 'crash');
  const cents = (BigInt(Math.round(rtp * 100)) * E52) / ((E52 - n) * 100n);
  return Math.min(Math.max(Number(cents) / 100, 1), maxMult);
}

/** Probabilité d'atteindre x (en %) */
export const chanceToReach = (x: number, rtp: number) => Math.min(100, x <= 1 ? 100 : rtp / x);

/** Couleur d'une pastille d'historique */
export const crashTone = (x: number) =>
  x < 1.5 ? 'bg-[#ff4d5e] text-white' : x < 2 ? 'bg-[#ff9f43] text-[#2a1200]' : x < 10 ? 'bg-[#2fd08a] text-[#062a18]' : 'bg-[#ffd84a] text-[#3a2600]';
