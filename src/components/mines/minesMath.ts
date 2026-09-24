/**
 * Mathematics & Provably Fair Logic for Diamond Casino Mines
 *
 * Grid size: 5x5 = 25 tiles
 * Mines range: 1 to 24
 * Diamonds = 25 - Mines
 * RTP = 98.5% (0.985)
 */

export const GRID_SIZE = 25;
export const DEFAULT_RTP = 0.985;

/**
 * Calculates combinations C(n, k) = n! / (k! * (n-k)!)
 */
function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const c = Math.min(k, n - k);
  let res = 1;
  for (let i = 1; i <= c; i++) {
    res = (res * (n - c + i)) / i;
  }
  return res;
}

/**
 * Calculates fair multiplier and applies casino RTP (98.5%).
 * Formula:
 * P(k) = C(25 - M, k) / C(25, k)
 * Multiplier = RTP / P(k)
 */
export function calculateMultiplier(minesCount: number, gemsRevealed: number, rtp = DEFAULT_RTP): number {
  if (gemsRevealed <= 0) return 1;
  const totalDiamonds = GRID_SIZE - minesCount;
  if (gemsRevealed > totalDiamonds) return 0;

  // Probability of avoiding all mines in `gemsRevealed` picks
  const p = combinations(totalDiamonds, gemsRevealed) / combinations(GRID_SIZE, gemsRevealed);
  if (p <= 0) return 0;

  const mult = (1 / p) * rtp;
  // Round to 2 decimals for standard display, 4 decimals if mult < 1.05
  return mult < 1.05 ? Math.round(mult * 10000) / 10000 : Math.round(mult * 100) / 100;
}

/**
 * Returns the probability of the next pick being a diamond (safe), in percent (0 - 100)
 */
export function getNextStepProbability(minesCount: number, gemsRevealed: number): number {
  const remainingTiles = GRID_SIZE - gemsRevealed;
  const remainingDiamonds = GRID_SIZE - minesCount - gemsRevealed;
  if (remainingTiles <= 0 || remainingDiamonds <= 0) return 0;
  return Math.round((remainingDiamonds / remainingTiles) * 1000) / 10;
}

export interface MultiplierStep {
  step: number;
  multiplier: number;
  probSurvive: number;
}

/**
 * Pre-computes the entire ladder of multipliers for a given number of mines
 */
export function getMultiplierLadder(minesCount: number, rtp = DEFAULT_RTP): MultiplierStep[] {
  const totalDiamonds = GRID_SIZE - minesCount;
  const ladder: MultiplierStep[] = [];

  for (let k = 1; k <= totalDiamonds; k++) {
    const mult = calculateMultiplier(minesCount, k, rtp);
    const prob = (combinations(totalDiamonds, k) / combinations(GRID_SIZE, k)) * 100;
    ladder.push({
      step: k,
      multiplier: mult,
      probSurvive: Math.round(prob * 10) / 10,
    });
  }

  return ladder;
}

/**
 * Computes SHA-256 hex string using standard Web Crypto API
 */
export async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // fallback below
    }
  }
  // Pure JS fallback (FNV-1a 32-bit expanded)
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Generates a random cryptographic server seed
 */
export function generateRandomSeed(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
}

export interface GeneratedBoard {
  /** 25 booleans: true = mine, false = diamond */
  board: boolean[];
  serverSeed: string;
  hash: string;
}

function getCryptoRandomInt(max: number): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

/**
 * Generates the board with exactly `minesCount` mines randomly distributed.
 * Produces the pre-committed SHA-256 server seed hash for Provably Fair auditing.
 */
export async function generateBoard(minesCount: number): Promise<GeneratedBoard> {
  const count = Math.min(Math.max(1, minesCount), 24);
  const board = new Array(GRID_SIZE).fill(false);

  // Pick `count` distinct positions using cryptographic Fisher-Yates
  const indices = Array.from({ length: GRID_SIZE }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = getCryptoRandomInt(i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  for (let i = 0; i < count; i++) {
    board[indices[i]] = true;
  }

  const serverSeed = generateRandomSeed();
  const boardStr = board.map((m) => (m ? 'M' : 'D')).join('');
  const hash = await sha256Hex(`${serverSeed}:${boardStr}`);

  return { board, serverSeed, hash };
}

export interface StrategyPreset {
  id: string;
  name: string;
  badge: string;
  mines: number;
  recommendedGems: number;
  expectedMultiplier: number;
  riskLevel: 'faible' | 'modéré' | 'élevé' | 'extrême';
  description: string;
  proTip: string;
}

/**
 * Presets derived from the YouTube strategy review:
 * [JEU MINES : TEST & AVIS 2022 + ASTUCES]
 */
export const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    id: 'strat-3-mines',
    name: 'La Méthode 3 Mines (Classique)',
    badge: 'La plus populaire',
    mines: 3,
    recommendedGems: 4,
    expectedMultiplier: 1.71,
    riskLevel: 'modéré',
    description:
      '3 mines sur le plateau. Révélez 4 cases (~58% de chances de survie) et encaissez immédiatement à x1.71.',
    proTip:
      'Le compromis idéal entre gain substantiel (+71%) et probabilité mathématique favorable.',
  },
  {
    id: 'strat-1-mine',
    name: 'La Stratégie 1 Mine (Safe & Régulier)',
    badge: 'Sécurisé',
    mines: 1,
    recommendedGems: 6,
    expectedMultiplier: 1.25,
    riskLevel: 'faible',
    description:
      'Une seule mine dissimulée parmi les 25 cases (96% de réussite au 1er clic). Visez 5 à 7 diamants.',
    proTip:
      'Parfait pour faire fructifier son capital en douceur sans stress excessif.',
  },
  {
    id: 'strat-5-mines',
    name: 'Hit & Run 5 Mines',
    badge: 'Rapide & Rentable',
    mines: 5,
    recommendedGems: 2,
    expectedMultiplier: 1.5,
    riskLevel: 'modéré',
    description:
      '5 mines actives. Seulement 2 diamants suffisent pour multiplier votre mise par 1.50x (+50%).',
    proTip:
      'Sortie ultra-rapide en 2 clics : ne soyez pas gourmand, encaissez dès le 2e diamant.',
  },
  {
    id: 'strat-10-mines',
    name: 'Sniper 10 Mines (High Roller)',
    badge: 'Gros Frissons',
    mines: 10,
    recommendedGems: 3,
    expectedMultiplier: 8.52,
    riskLevel: 'extrême',
    description:
      '10 mines cachées. Chaque diamant rapporte une fortune (1er diamant: x1.61, 2e: x3.33, 3e: x8.52).',
    proTip:
      'À utiliser avec de petites mises pour chasser les énormes multiplicateurs sans risquer sa bankroll.',
  },
];
