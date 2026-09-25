/**
 * The Dog House — moteur de jeu fidèle à l'original (Pragmatic Play).
 *
 * Règles reproduites :
 * - 5 rouleaux x 3 rangées, 20 lignes fixes, gains de gauche à droite.
 * - WILD (niche) uniquement sur les rouleaux 2, 3 et 4, remplace tout sauf le SCATTER.
 *   Chaque WILD porte un multiplicateur aléatoire x2 ou x3. Si plusieurs WILD participent
 *   à une même ligne, leurs multiplicateurs sont ADDITIONNÉS (max 3+3+3 = x9).
 * - SCATTER (patte) uniquement sur les rouleaux 1, 3 et 5. 3 SCATTER = 5x la mise totale
 *   et déclenchent les Tours Gratuits.
 * - Tours Gratuits : une grille 3x3 de valeurs 1 à 3 est tirée, la somme donne le nombre
 *   de tours (9 à 27). Pendant les tours, chaque WILD qui tombe devient COLLANT (sticky)
 *   avec son multiplicateur jusqu'à la fin du bonus. Pas de SCATTER pendant les tours.
 * - Gain maximum plafonné à 6 750x la mise.
 */

export type DogSymbolId =
  | 'rottweiler'
  | 'shihtzu'
  | 'pug'
  | 'dachshund'
  | 'collar'
  | 'bone'
  | 'A'
  | 'K'
  | 'Q'
  | 'J'
  | '10'
  | 'wild'
  | 'scatter';

export interface DogSymbolInfo {
  id: DogSymbolId;
  name: string;
  /** Paiement en multiple de la MISE PAR LIGNE pour 3, 4, 5 symboles */
  pays: [number, number, number];
}

export const DOG_SYMBOLS: Record<DogSymbolId, DogSymbolInfo> = {
  rottweiler: { id: 'rottweiler', name: 'Rottweiler', pays: [50, 150, 750] },
  shihtzu: { id: 'shihtzu', name: 'Shih Tzu', pays: [35, 100, 500] },
  pug: { id: 'pug', name: 'Carlin', pays: [25, 60, 300] },
  dachshund: { id: 'dachshund', name: 'Teckel', pays: [20, 40, 200] },
  collar: { id: 'collar', name: 'Collier', pays: [12, 25, 150] },
  bone: { id: 'bone', name: 'Os', pays: [8, 20, 100] },
  A: { id: 'A', name: 'As', pays: [5, 10, 50] },
  K: { id: 'K', name: 'Roi', pays: [5, 10, 50] },
  Q: { id: 'Q', name: 'Dame', pays: [2, 5, 25] },
  J: { id: 'J', name: 'Valet', pays: [2, 5, 25] },
  '10': { id: '10', name: 'Dix', pays: [2, 5, 25] },
  wild: { id: 'wild', name: 'Niche WILD', pays: [0, 0, 0] },
  scatter: { id: 'scatter', name: 'Patte BONUS', pays: [0, 0, 0] },
};

export const PAYING_SYMBOLS: DogSymbolId[] = [
  'rottweiler',
  'shihtzu',
  'pug',
  'dachshund',
  'collar',
  'bone',
  'A',
  'K',
  'Q',
  'J',
  '10',
];

/** 20 lignes de The Dog House (rangée 0 = haut) */
export const DOG_PAYLINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 2, 1, 0, 1],
  [1, 0, 1, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 0, 2, 0, 0],
  [2, 2, 0, 2, 2],
  [0, 2, 2, 2, 0],
];

export const SCATTER_PAY_X_BET = 5;
export const MAX_WIN_X_BET = 6750;
export const BONUS_BUY_X_BET = 100;

type Weights = Partial<Record<DogSymbolId, number>>;

/** Poids communs des symboles payants (identiques sur les 5 rouleaux) */
const SYMBOL_WEIGHTS: Weights = {
  rottweiler: 3,
  shihtzu: 4,
  pug: 5,
  dachshund: 6,
  collar: 7,
  bone: 8,
  A: 9,
  K: 9,
  Q: 10,
  J: 10,
  '10': 10,
};

const BASE_WILD_WEIGHT = 5.4;
const BASE_SCATTER_WEIGHT = 4.4;
/** Plus rare pendant le bonus car chaque wild y devient collant */
const FREE_WILD_WEIGHT = 1.75;

const WILD_REELS = [1, 2, 3];
const SCATTER_REELS = [0, 2, 4];

/**
 * Poids par rouleau, calibrés par simulation Monte Carlo :
 * RTP ~96.5 % (≈ 64 % jeu de base + ≈ 33 % bonus), bonus ≈ 1 tour sur 340.
 */
const BASE_WEIGHTS: Weights[] = [0, 1, 2, 3, 4].map((r) => ({
  ...SYMBOL_WEIGHTS,
  ...(WILD_REELS.includes(r) ? { wild: BASE_WILD_WEIGHT } : {}),
  ...(SCATTER_REELS.includes(r) ? { scatter: BASE_SCATTER_WEIGHT } : {}),
}));

const FREE_WEIGHTS: Weights[] = [0, 1, 2, 3, 4].map((r) => ({
  ...SYMBOL_WEIGHTS,
  ...(WILD_REELS.includes(r) ? { wild: FREE_WILD_WEIGHT } : {}),
}));

function pick(weights: Weights, rng: () => number): DogSymbolId {
  const entries = Object.entries(weights) as [DogSymbolId, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let cursor = rng() * total;
  for (const [id, w] of entries) {
    cursor -= w;
    if (cursor <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

/** Symbole aléatoire pour l'animation de défilement (jamais utilisé pour le résultat) */
export function randomStripSymbol(reel: number, rng: () => number = Math.random): DogSymbolId {
  return pick(BASE_WEIGHTS[reel], rng);
}

export interface StickyWild {
  reel: number;
  row: number;
  multiplier: number;
}

export interface DogLineWin {
  lineIndex: number; // -1 = scatter
  symbol: DogSymbolId;
  count: number;
  positions: [number, number][];
  wildMultiplier: number;
  win: number;
}

export interface DogSpinResult {
  /** grid[reel][row] */
  grid: DogSymbolId[][];
  /** multiplicateur de chaque case (1 si pas wild) */
  multipliers: number[][];
  wins: DogLineWin[];
  totalWin: number;
  scatterCount: number;
  triggersBonus: boolean;
  /** Wilds collants après ce tour (tours gratuits seulement) */
  stickyWilds: StickyWild[];
}

export function evaluateDogHouseSpin(params: {
  bet: number;
  isFreeSpin?: boolean;
  stickyWilds?: StickyWild[];
  forceScatters?: boolean;
  rng?: () => number;
}): DogSpinResult {
  const { bet, isFreeSpin = false, stickyWilds = [], forceScatters = false, rng = Math.random } = params;
  const weights = isFreeSpin ? FREE_WEIGHTS : BASE_WEIGHTS;

  const grid: DogSymbolId[][] = [];
  const multipliers: number[][] = [];
  for (let r = 0; r < 5; r++) {
    const col: DogSymbolId[] = [];
    const mcol: number[] = [];
    let scatterInReel = false;
    for (let row = 0; row < 3; row++) {
      const sticky = stickyWilds.find((w) => w.reel === r && w.row === row);
      if (sticky) {
        col.push('wild');
        mcol.push(sticky.multiplier);
        continue;
      }
      let w = weights[r];
      if (scatterInReel && w.scatter) {
        w = { ...w };
        delete w.scatter;
      }
      const sym = pick(w, rng);
      if (sym === 'scatter') scatterInReel = true;
      col.push(sym);
      mcol.push(sym === 'wild' ? (rng() < 0.5 ? 2 : 3) : 1);
    }
    grid.push(col);
    multipliers.push(mcol);
  }

  // Achat du bonus : garantit un scatter sur les rouleaux 1, 3 et 5
  if (forceScatters && !isFreeSpin) {
    for (const r of [0, 2, 4]) {
      if (!grid[r].includes('scatter')) {
        const row = Math.floor(rng() * 3);
        grid[r][row] = 'scatter';
        multipliers[r][row] = 1;
      }
    }
  }

  const lineBet = bet / DOG_PAYLINES.length;
  const wins: DogLineWin[] = [];

  DOG_PAYLINES.forEach((rows, lineIndex) => {
    let target: DogSymbolId | null = null;
    for (let r = 0; r < 5; r++) {
      const s = grid[r][rows[r]];
      if (s === 'scatter') break;
      if (s !== 'wild') {
        target = s;
        break;
      }
    }
    // Les wilds n'apparaissent que sur 2-4 : une ligne ne peut jamais être 100% wild
    if (!target) return;

    let count = 0;
    let multSum = 0;
    const positions: [number, number][] = [];
    for (let r = 0; r < 5; r++) {
      const s = grid[r][rows[r]];
      if (s === target || s === 'wild') {
        count++;
        positions.push([r, rows[r]]);
        if (s === 'wild') multSum += multipliers[r][rows[r]];
      } else break;
    }
    if (count < 3) return;
    const base = DOG_SYMBOLS[target].pays[count - 3];
    const wildMultiplier = multSum > 0 ? multSum : 1;
    const win = Math.round(lineBet * base * wildMultiplier * 100) / 100;
    if (win > 0) {
      wins.push({ lineIndex, symbol: target, count, positions, wildMultiplier, win });
    }
  });

  const scatterPositions: [number, number][] = [];
  grid.forEach((col, r) => col.forEach((s, row) => s === 'scatter' && scatterPositions.push([r, row])));
  const scatterCount = scatterPositions.length;
  const triggersBonus = !isFreeSpin && scatterCount >= 3;
  if (triggersBonus) {
    wins.push({
      lineIndex: -1,
      symbol: 'scatter',
      count: scatterCount,
      positions: scatterPositions,
      wildMultiplier: 1,
      win: bet * SCATTER_PAY_X_BET,
    });
  }

  let totalWin = Math.round(wins.reduce((a, w) => a + w.win, 0) * 100) / 100;
  totalWin = Math.min(totalWin, bet * MAX_WIN_X_BET);

  const nextSticky: StickyWild[] = isFreeSpin ? [...stickyWilds] : [];
  if (isFreeSpin) {
    grid.forEach((col, r) =>
      col.forEach((s, row) => {
        if (s === 'wild' && !nextSticky.some((w) => w.reel === r && w.row === row)) {
          nextSticky.push({ reel: r, row, multiplier: multipliers[r][row] });
        }
      }),
    );
  }

  return { grid, multipliers, wins, totalWin, scatterCount, triggersBonus, stickyWilds: nextSticky };
}

/** Tirage du nombre de tours gratuits : grille 3x3 de valeurs 1 à 3 (total 9 à 27) */
export function rollFreeSpinsGrid(rng: () => number = Math.random): number[] {
  return Array.from({ length: 9 }, () => 1 + Math.floor(rng() * 3));
}

export interface DogWinTier {
  id: 'none' | 'win' | 'big' | 'mega' | 'superb' | 'sensational';
  label: string;
}

export function getWinTier(win: number, bet: number): DogWinTier {
  const x = bet > 0 ? win / bet : 0;
  if (x >= 100) return { id: 'sensational', label: 'SENSATIONNEL' };
  if (x >= 50) return { id: 'superb', label: 'SUPERBE WIN' };
  if (x >= 25) return { id: 'mega', label: 'MEGA WIN' };
  if (x >= 10) return { id: 'big', label: 'BIG WIN' };
  if (x > 0) return { id: 'win', label: 'WIN' };
  return { id: 'none', label: '' };
}

/** Simulation Monte Carlo complète (base + bonus) pour contrôler le RTP */
export function simulateDogHouse(spins = 200000, rng: () => number = Math.random) {
  const bet = 1;
  let wagered = 0;
  let returned = 0;
  let hits = 0;
  let bonuses = 0;
  let maxX = 0;
  for (let i = 0; i < spins; i++) {
    wagered += bet;
    const res = evaluateDogHouseSpin({ bet, rng });
    let spinWin = res.totalWin;
    if (res.totalWin > 0) hits++;
    if (res.triggersBonus) {
      bonuses++;
      let left = rollFreeSpinsGrid(rng).reduce((a, b) => a + b, 0);
      let sticky: StickyWild[] = [];
      while (left-- > 0) {
        const fs = evaluateDogHouseSpin({ bet, isFreeSpin: true, stickyWilds: sticky, rng });
        sticky = fs.stickyWilds;
        spinWin += fs.totalWin;
      }
    }
    spinWin = Math.min(spinWin, bet * MAX_WIN_X_BET);
    returned += spinWin;
    maxX = Math.max(maxX, spinWin / bet);
  }
  return {
    rtp: (returned / wagered) * 100,
    hitRate: (hits / spins) * 100,
    bonusFrequency: bonuses > 0 ? spins / bonuses : Infinity,
    maxX,
  };
}
