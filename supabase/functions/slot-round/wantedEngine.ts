/**
 * Wanted Dead or a Wild — moteur inspiré du jeu de Hacksaw Gaming.
 *
 * - Grille 5x5, 15 lignes fixes, gains de gauche à droite (en multiples de la mise totale).
 * - WILD (étoile de shérif) sur les rouleaux 2 à 4.
 * - VS : agit comme un wild. S'il fait partie d'un gain, il s'étend à tout le rouleau :
 *   deux pistoleros s'affrontent, le multiplicateur du vainqueur (x2 à x100) s'applique
 *   au rouleau. Plusieurs rouleaux VS sur une même ligne : multiplicateurs ADDITIONNÉS.
 * - Scatters sur les rouleaux 1, 3 et 5 (BONUS, DUEL, DEAD). 3 scatters déclenchent :
 *     3 BONUS                → The Great Train Robbery (10 tours, wilds collants)
 *     un DUEL parmi les 3    → Duel at Dawn (10 tours, VS fréquents, rouleaux VS collants)
 *     un DEAD parmi les 3    → Dead Man's Hand (collecte de wilds et multiplicateurs,
 *                              puis 3 tours « Showdown » : les wilds collectés sont
 *                              replacés au hasard à chaque tour, gains x multiplicateur)
 * - Achat de bonus : 80x / 134x / 219x. Gain max : selon la mise (voir maxWinFor).
 */

export type WantedSymbolId =
  | '10'
  | 'J'
  | 'Q'
  | 'K'
  | 'A'
  | 'revolver'
  | 'whiskey'
  | 'bag'
  | 'skull'
  | 'wild'
  | 'vs'
  | 'fs'
  | 'duel'
  | 'dead';

export type WantedBonus = 'gtr' | 'duel' | 'dmh';

export const REELS = 5;
export const ROWS = 5;
/** Multiplicateur maximum absolu (petites mises) ; voir maxWinFor pour les mises plus hautes */
export const MAX_WIN_X = 1000;

export const BONUS_INFO: Record<WantedBonus, { name: string; price: number; spins: number; tagline: string }> = {
  gtr: { name: 'The Great Train Robbery', price: 80, spins: 10, tagline: 'Wilds collants pendant 10 tours' },
  duel: { name: 'Duel at Dawn', price: 134, spins: 10, tagline: 'VS fréquents, rouleaux VS collants' },
  dmh: { name: "Dead Man's Hand", price: 219, spins: 3, tagline: 'Collecte puis 3 tours Showdown' },
};

/** Paiements en multiples de la MISE TOTALE pour 3, 4, 5 symboles */
export const PAYTABLE: Partial<Record<WantedSymbolId, [number, number, number]>> = {
  skull: [1, 4, 20],
  wild: [1, 4, 20],
  bag: [0.8, 2.5, 10],
  whiskey: [0.6, 2, 7.5],
  revolver: [0.5, 1.5, 5],
  A: [0.15, 0.4, 1],
  K: [0.15, 0.4, 1],
  Q: [0.1, 0.25, 0.75],
  J: [0.1, 0.25, 0.75],
  '10': [0.1, 0.25, 0.75],
};


/**
 * Gain maximum d'une manche selon la mise (jetons) : plus on mise gros, plus le multiplicateur
 * maximum baisse, pour qu'un tour à 10 000 ne puisse pas rapporter des millions.
 *   mise ≤ 100 : ×1 000   mise 200 : ×500   mise 500 : ×200 (100 000)   mise 2 000 : ×65 (130 000)
 *   mise 10 000 : ×29 (290 000)   mise 100 000 : ×20 (2 000 000)
 */
export function maxWinFor(bet: number): number {
  return Math.floor(Math.min(1000 * bet, 100000 + 20 * Math.max(0, bet - 500)));
}
export const maxWinMultiplier = (bet: number): number => maxWinFor(bet) / Math.max(1, bet);

/**
 * Coefficient de gains selon le plafond de la mise (interpolé sur le logarithme du multiplicateur max).
 * Couper les gros gains fait baisser le retour : ce coefficient (jeu de base seulement, pas les bonus ni les achats)
 * le ramène vers ≈ 90 %, plafonné à ×2.
 * Table calibrée par simulation (voir supabase/migrations/20261002100000_audit_house_edge_floors.sql).
 */
const SCALE_TABLE: readonly (readonly [number, number])[] = [[100, 2.0], [200, 1.571], [300, 1.465], [500, 1.361], [1000, 1.235]];
export function payoutScale(bet: number): number {
  const x = Math.min(1000, Math.max(1, maxWinMultiplier(bet)));
  const t = SCALE_TABLE;
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const f = (Math.log(x) - Math.log(t[i - 1][0])) / (Math.log(t[i][0]) - Math.log(t[i - 1][0]));
      return t[i - 1][1] + f * (t[i][1] - t[i - 1][1]);
    }
  }
  return t[t.length - 1][1];
}

/**
 * Coefficient appliqué à TOUS les gains (jeu de base et bonus) selon le plafond de la mise : aux grosses mises
 * le plafond coupe les bonus et payoutScale (jeu de base seulement, max ×2) ne suffit plus à garder ≈ 90 %.
 * Vaut 1 tant que le plafond reste ≥ ×200 (mises où l'achat de bonus est permis). Table calibrée par simulation.
 */
const CAP_SCALE_TABLE: readonly (readonly [number, number])[] = [[20, 2.025], [29, 1.65], [38, 1.404], [56, 1.166], [80, 1.026], [110, 0.956], [150, 0.965], [200, 1], [1000, 1]];
export function capPayoutScale(bet: number): number {
  const x = Math.min(1000, Math.max(1, maxWinMultiplier(bet)));
  const t = CAP_SCALE_TABLE;
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const f = (Math.log(x) - Math.log(t[i - 1][0])) / (Math.log(t[i][0]) - Math.log(t[i - 1][0]));
      return t[i - 1][1] + f * (t[i][1] - t[i - 1][1]);
    }
  }
  return t[t.length - 1][1];
}

export const PAYING: WantedSymbolId[] = ['skull', 'bag', 'whiskey', 'revolver', 'A', 'K', 'Q', 'J', '10'];

export const PAYLINES: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3],
  [4, 4, 4, 4, 4],
  [0, 1, 2, 1, 0],
  [4, 3, 2, 3, 4],
  [1, 2, 3, 2, 1],
  [3, 2, 1, 2, 3],
  [0, 1, 0, 1, 0],
  [4, 3, 4, 3, 4],
  [2, 1, 0, 1, 2],
  [2, 3, 4, 3, 2],
  [1, 0, 0, 0, 1],
  [3, 4, 4, 4, 3],
];

const VS_VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 25, 50, 100];
const VS_WEIGHTS = [26, 20, 15, 11, 8, 6, 4.5, 3.4, 2.6, 1.3, 0.9, 0.35, 0.12];
const DMH_TOKENS = [1, 2, 3, 4, 5, 10];
const DMH_TOKEN_WEIGHTS = [30, 28, 18, 12, 8, 4];

type Weights = Partial<Record<WantedSymbolId, number>>;

const SYMBOLS: Weights = { skull: 3, bag: 4, whiskey: 5, revolver: 6, A: 10, K: 10, Q: 12, J: 12, '10': 12 };

/** Réglages calibrés par simulation Monte Carlo : RTP ≈ 96,4 %, chaque bonus ≈ son prix d’achat */
const TUNING = {
  baseWild: 1.5,
  baseVs: 1.1,
  scatterPerReel: 0.167,
  scatterDuelShare: 0.075,
  scatterDeadShare: 0.024,
  gtrWild: 9,
  gtrVs: 3.3,
  duelVs: 0.52,
  dmhWildChance: 0.0061,
  dmhTokenChance: 0.03,
};

function pickWeighted<T extends string>(w: Partial<Record<T, number>>, rng: () => number): T {
  const entries = Object.entries(w) as [T, number][];
  let total = 0;
  for (const [, v] of entries) total += v;
  let c = rng() * total;
  for (const [k, v] of entries) {
    c -= v;
    if (c <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function pickValue(values: number[], weights: number[], rng: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let c = rng() * total;
  for (let i = 0; i < values.length; i++) {
    c -= weights[i];
    if (c <= 0) return values[i];
  }
  return values[values.length - 1];
}

export const rollVsMultiplier = (rng: () => number = Math.random) => pickValue(VS_VALUES, VS_WEIGHTS, rng);

export type SpinMode = 'base' | 'gtr' | 'duel' | 'dmh';

function reelWeights(mode: SpinMode, reel: number): Weights {
  const inner = reel >= 1 && reel <= 3;
  const w: Weights = { ...SYMBOLS };
  if (mode === 'base') {
    if (inner) {
      w.wild = TUNING.baseWild;
      w.vs = TUNING.baseVs;
    }
  } else if (mode === 'gtr') {
    if (inner) {
      w.wild = TUNING.gtrWild;
      w.vs = TUNING.gtrVs;
    }
  } else if (mode === 'duel') {
    w.vs = TUNING.duelVs;
  }
  return w;
}

/** Symbole aléatoire pour l'animation des rouleaux */
export function randomStripSymbol(reel: number, rng: () => number = Math.random): WantedSymbolId {
  return pickWeighted(reelWeights('base', reel), rng);
}

export interface Cell {
  reel: number;
  row: number;
}

export interface VsReel {
  reel: number;
  multiplier: number;
  /** multiplicateur du perdant du duel (purement visuel) */
  loser: number;
  sticky?: boolean;
}

export interface WantedLineWin {
  lineIndex: number;
  symbol: WantedSymbolId;
  count: number;
  positions: [number, number][];
  multiplier: number;
  win: number;
}

export interface WantedSpinResult {
  /** grille tombée, avant extension des VS */
  landed: WantedSymbolId[][];
  /** grille finale (rouleaux VS étendus) */
  grid: WantedSymbolId[][];
  /** rouleaux VS actifs sur ce tour (nouveaux + collants) */
  vsReels: VsReel[];
  /** rouleaux VS étendus sur ce tour (à animer) */
  newVsReels: VsReel[];
  wins: WantedLineWin[];
  totalWin: number;
  scatterCells: { reel: number; row: number; kind: 'fs' | 'duel' | 'dead' }[];
  bonus: WantedBonus | null;
  /** wilds collants après ce tour (Train Robbery / Showdown) */
  stickyWilds: Cell[];
}

const isWildLike = (s: WantedSymbolId) => s === 'wild' || s === 'vs';
const isScatter = (s: WantedSymbolId) => s === 'fs' || s === 'duel' || s === 'dead';

function evaluateLines(grid: WantedSymbolId[][], reelMult: number[], bet: number, scale = 1): WantedLineWin[] {
  const wins: WantedLineWin[] = [];
  PAYLINES.forEach((rows, lineIndex) => {
    const cells = rows.map((row, r) => grid[r][row]);
    if (isScatter(cells[0])) return;

    let wildRun = 0;
    while (wildRun < REELS && isWildLike(cells[wildRun])) wildRun++;
    const target = wildRun < REELS ? cells[wildRun] : null;

    let symCount = wildRun;
    if (target && !isScatter(target)) {
      while (symCount < REELS && (cells[symCount] === target || isWildLike(cells[symCount]))) symCount++;
    }

    const multFor = (count: number) => {
      let m = 0;
      for (let r = 0; r < count; r++) m += reelMult[r];
      return m > 0 ? m : 1;
    };
    const wildPay = wildRun >= 3 ? PAYTABLE.wild![wildRun - 3] * scale * multFor(wildRun) : 0;
    const symPay =
      target && !isScatter(target) && symCount >= 3 && PAYTABLE[target]
        ? PAYTABLE[target]![symCount - 3] * scale * multFor(symCount)
        : 0;

    if (wildPay <= 0 && symPay <= 0) return;
    const useWild = wildPay >= symPay;
    const count = useWild ? wildRun : symCount;
    const mult = multFor(count);
    wins.push({
      lineIndex,
      symbol: useWild ? 'wild' : target!,
      count,
      positions: rows.slice(0, count).map((row, r) => [r, row] as [number, number]),
      multiplier: mult,
      win: Math.round(bet * (useWild ? wildPay : symPay) * 100) / 100,
    });
  });
  return wins;
}

export function evaluateWantedSpin(params: {
  bet: number;
  mode?: SpinMode;
  stickyWilds?: Cell[];
  stickyVs?: VsReel[];
  /** multiplicateur global (Showdown de Dead Man's Hand) */
  globalMultiplier?: number;
  forceBonus?: WantedBonus;
  /** Coefficient appliqué à tous les gains de lignes (voir capPayoutScale) */
  extraScale?: number;
  rng?: () => number;
}): WantedSpinResult {
  const {
    bet,
    mode = 'base',
    stickyWilds = [],
    stickyVs = [],
    globalMultiplier = 1,
    forceBonus,
    extraScale = 1,
    rng = Math.random,
  } = params;

  // 1. Tirage de la grille
  const landed: WantedSymbolId[][] = [];
  const scatterCells: WantedSpinResult['scatterCells'] = [];
  for (let r = 0; r < REELS; r++) {
    const w = reelWeights(mode === 'dmh' ? 'dmh' : mode, r);
    const col: WantedSymbolId[] = [];
    for (let row = 0; row < ROWS; row++) col.push(pickWeighted(w, rng));
    // scatter : au plus un par rouleau 1/3/5, en jeu de base uniquement
    if (mode === 'base' && r % 2 === 0 && (forceBonus || rng() < TUNING.scatterPerReel)) {
      const row = Math.floor(rng() * ROWS);
      let kind: 'fs' | 'duel' | 'dead' = 'fs';
      if (forceBonus) {
        kind = r === 2 && forceBonus === 'duel' ? 'duel' : r === 2 && forceBonus === 'dmh' ? 'dead' : 'fs';
      } else {
        const x = rng();
        kind = x < TUNING.scatterDeadShare ? 'dead' : x < TUNING.scatterDeadShare + TUNING.scatterDuelShare ? 'duel' : 'fs';
      }
      col[row] = kind;
      scatterCells.push({ reel: r, row, kind });
    }
    landed.push(col);
  }
  stickyWilds.forEach(({ reel, row }) => {
    landed[reel][row] = 'wild';
  });

  let bonus: WantedBonus | null = null;
  if (scatterCells.length >= 3) {
    bonus = scatterCells.some((s) => s.kind === 'dead')
      ? 'dmh'
      : scatterCells.some((s) => s.kind === 'duel')
        ? 'duel'
        : 'gtr';
  }

  // 2. Rouleaux VS collants + premier passage pour savoir quels VS participent à un gain
  const grid = landed.map((c) => [...c]);
  const reelMult = [0, 0, 0, 0, 0];
  const vsReels: VsReel[] = stickyVs.map((v) => ({ ...v, sticky: true }));
  vsReels.forEach((v) => {
    reelMult[v.reel] = v.multiplier;
    for (let row = 0; row < ROWS; row++) grid[v.reel][row] = 'vs';
  });

  const expand = new Set<number>();
  if (mode === 'duel') {
    // Duel at Dawn : chaque VS s'étend, gain ou pas
    for (let r = 0; r < REELS; r++) if (!reelMult[r] && grid[r].includes('vs')) expand.add(r);
  } else {
    const prelim = evaluateLines(grid, reelMult, bet);
    prelim.forEach((w) =>
      w.positions.forEach(([r, row]) => {
        if (grid[r][row] === 'vs' && !reelMult[r]) expand.add(r);
      }),
    );
  }

  const newVsReels: VsReel[] = [...expand]
    .sort((a, b) => a - b)
    .map((reel) => {
      const multiplier = rollVsMultiplier(rng);
      let loser = rollVsMultiplier(rng);
      if (loser === multiplier) loser = VS_VALUES[(VS_VALUES.indexOf(multiplier) + 1) % VS_VALUES.length];
      return { reel, multiplier, loser, sticky: mode === 'duel' };
    });
  newVsReels.forEach((v) => {
    reelMult[v.reel] = v.multiplier;
    for (let row = 0; row < ROWS; row++) grid[v.reel][row] = 'vs';
    vsReels.push(v);
  });

  // 3. Évaluation finale
  const wins = evaluateLines(grid, reelMult, bet, (mode === 'base' && !forceBonus ? payoutScale(bet) : 1) * extraScale);
  if (globalMultiplier > 1) wins.forEach((w) => (w.win = Math.round(w.win * globalMultiplier * 100) / 100));
  let totalWin = Math.round(wins.reduce((a, w) => a + w.win, 0) * 100) / 100;
  totalWin = Math.min(totalWin, maxWinFor(bet));

  const nextSticky: Cell[] = [...stickyWilds];
  if (mode === 'gtr') {
    landed.forEach((col, reel) =>
      col.forEach((s, row) => {
        if (s === 'wild' && !reelMult[reel] && !nextSticky.some((c) => c.reel === reel && c.row === row)) {
          nextSticky.push({ reel, row });
        }
      }),
    );
  }

  return { landed, grid, vsReels, newVsReels, wins, totalWin, scatterCells, bonus, stickyWilds: nextSticky };
}

// =============================================================================
// Dead Man's Hand — phase de collecte
// =============================================================================

export interface DmhLanding {
  reel: number;
  row: number;
  kind: 'wild' | 'mult';
  value: number;
}

/** Plafond de wilds collectés (comme le vrai jeu) */
export const DMH_MAX_WILDS = 20;
/** Plafond du multiplicateur collecté */
export const DMH_MAX_MULT = 100;

/**
 * Un respin de collecte : les 25 cartes se retournent, chaque carte peut révéler un
 * wild ou un multiplicateur, aussitôt versé dans son compteur (la grille ne se remplit pas).
 */
export function dmhCollectStep(
  collected: { wilds: number; multiplier: number },
  rng: () => number = Math.random,
): DmhLanding[] {
  const out: DmhLanding[] = [];
  let wilds = collected.wilds;
  let mult = collected.multiplier;
  for (let reel = 0; reel < REELS; reel++) {
    for (let row = 0; row < ROWS; row++) {
      const x = rng();
      if (x < TUNING.dmhWildChance) {
        if (wilds < DMH_MAX_WILDS) {
          wilds++;
          out.push({ reel, row, kind: 'wild', value: 0 });
        }
      } else if (x > 1 - TUNING.dmhTokenChance) {
        const value = Math.min(pickValue(DMH_TOKENS, DMH_TOKEN_WEIGHTS, rng), DMH_MAX_MULT - mult);
        if (value > 0) {
          mult += value;
          out.push({ reel, row, kind: 'mult', value });
        }
      }
    }
  }
  return out;
}

/** Déroule toute la collecte (3 respins, remis à 3 à chaque symbole collecté) */
export function runDmhCollect(rng: () => number = Math.random) {
  const steps: DmhLanding[][] = [];
  let wilds = 0;
  let mult = 0;
  let left = 3;
  while (left > 0) {
    const landing = dmhCollectStep({ wilds, multiplier: mult }, rng);
    landing.forEach((l) => (l.kind === 'wild' ? wilds++ : (mult += l.value)));
    steps.push(landing);
    left = landing.length > 0 ? 3 : left - 1;
  }
  return { steps, wilds, multiplier: Math.max(1, mult) };
}

/** Showdown : les wilds collectés sont replacés au hasard sur la grille à chaque tour */
export function placeShowdownWilds(count: number, rng: () => number = Math.random): Cell[] {
  const cells: Cell[] = [];
  for (let reel = 0; reel < REELS; reel++) for (let row = 0; row < ROWS; row++) cells.push({ reel, row });
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, Math.min(count, cells.length));
}

// =============================================================================
// Simulation complète d'un bonus / du jeu (RTP)
// =============================================================================

export function simulateBonus(bonus: WantedBonus, bet: number, rng: () => number = Math.random): number {
  let total = 0;
  const cap = maxWinFor(bet);
  if (bonus === 'dmh') {
    const { wilds, multiplier } = runDmhCollect(rng);
    for (let i = 0; i < 3 && total < cap; i++) {
      const stickyWilds = placeShowdownWilds(wilds, rng);
      total += evaluateWantedSpin({ bet, mode: 'dmh', stickyWilds, globalMultiplier: multiplier, rng }).totalWin;
    }
    return Math.min(total, cap);
  }
  let sticky: Cell[] = [];
  let stickyVs: VsReel[] = [];
  for (let i = 0; i < BONUS_INFO[bonus].spins && total < cap; i++) {
    const res = evaluateWantedSpin({ bet, mode: bonus, stickyWilds: sticky, stickyVs, rng });
    total += res.totalWin;
    sticky = res.stickyWilds;
    if (bonus === 'duel') stickyVs = res.vsReels;
  }
  return Math.min(total, cap);
}

export function simulateWanted(spins = 200000, rng: () => number = Math.random) {
  let wagered = 0;
  let returned = 0;
  let hits = 0;
  const triggers: Record<WantedBonus, number> = { gtr: 0, duel: 0, dmh: 0 };
  for (let i = 0; i < spins; i++) {
    wagered += 1;
    const res = evaluateWantedSpin({ bet: 1, rng });
    let win = res.totalWin;
    if (win > 0) hits++;
    if (res.bonus) {
      triggers[res.bonus]++;
      win += simulateBonus(res.bonus, 1, rng);
    }
    returned += Math.min(win, MAX_WIN_X);
  }
  return { rtp: (returned / wagered) * 100, hitRate: (hits / spins) * 100, triggers };
}

export interface WantedWinTier {
  id: 'none' | 'win' | 'big' | 'mega' | 'epic' | 'max';
  label: string;
}

export function getWantedTier(win: number, bet: number): WantedWinTier {
  const x = bet > 0 ? win / bet : 0;
  if (x >= MAX_WIN_X) return { id: 'max', label: 'MAX WIN' };
  if (x >= 100) return { id: 'epic', label: 'EPIC WIN' };
  if (x >= 40) return { id: 'mega', label: 'MEGA WIN' };
  if (x >= 15) return { id: 'big', label: 'BIG WIN' };
  if (x > 0) return { id: 'win', label: 'WIN' };
  return { id: 'none', label: '' };
}


// =============================================================================
// Manche complète (tour de base + bonus éventuel)
// Utilisée telle quelle par le serveur (fonction Edge « slot-round ») pour les
// parties en jetons, et par le navigateur pour le mode démo.
// =============================================================================

export interface WantedBonusRound {
  bonus: WantedBonus;
  /** Dead Man's Hand : phase de collecte (wilds + multiplicateurs) */
  collect: ReturnType<typeof runDmhCollect> | null;
  multiplier: number;
  spins: WantedSpinResult[];
  win: number;
}

export interface WantedRound {
  buy: WantedBonus | null;
  bet: number;
  cost: number;
  base: WantedSpinResult;
  bonus: WantedBonusRound | null;
  totalWin: number;
}

/**
 * Achat de bonus : le gain maximum d'une manche (maxPayout) doit rester au moins
 * BUY_CAP_RATIO fois plus haut que le prix payé, sinon le joueur débourse plus
 * qu'il ne peut gagner. Plus grosse mise autorisée pour acheter ce bonus.
 * (Même fonction dans dogHouseEngine.ts et wantedEngine.ts : copiées côté serveur.)
 */
export const BUY_CAP_RATIO = 5;
/**
 * Plafond de gain minimum (× la mise) pour acheter chaque bonus. Duel at Dawn et Dead Man's Hand tirent
 * leur valeur de gains énormes que le plafond coupe vite : achat réservé aux mises où il reste à ×1 000
 * (mise ≤ 100). Prix ×134 et ×219 calibrés par simulation pour un retour ≈ 80 % à ces mises.
 * Great Train Robbery : retour correct tant que le plafond de la mise reste ≥ ×200 (mise ≤ 500).
 */
const BUY_MIN_MAX_WIN_X: Record<WantedBonus, number> = { gtr: 200, duel: 1000, dmh: 1000 };
export function maxBuyBet(buyPriceX: number, maxPayout: number, bonus: WantedBonus = 'gtr'): number {
  const byPayout = Math.floor(maxPayout / (BUY_CAP_RATIO * buyPriceX));
  let lo = 1;
  let hi = 100000;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (maxWinMultiplier(mid) >= BUY_MIN_MAX_WIN_X[bonus]) lo = mid;
    else hi = mid - 1;
  }
  return Math.min(byPayout, lo);
}

export function playWantedRound(params: {
  bet: number;
  buy?: WantedBonus | null;
  /** Prix d'achat des bonus (x la mise) */
  buyPrices?: Partial<Record<WantedBonus, number>>;
  maxPayout?: number;
  /** Coefficient de gains (par défaut capPayoutScale, sauf bonus acheté) */
  extraScale?: number;
  rng?: () => number;
}): WantedRound {
  const { bet, buy = null, buyPrices = {}, maxPayout = Infinity, rng = Math.random } = params;
  const extraScale = params.extraScale ?? (buy ? 1 : capPayoutScale(bet));
  const cap = Math.min(maxWinFor(bet), maxPayout);
  const base = evaluateWantedSpin({ bet, forceBonus: buy ?? undefined, extraScale, rng });
  base.totalWin = Math.min(base.totalWin, cap);

  let bonus: WantedBonusRound | null = null;
  if (base.bonus) {
    const kind = base.bonus;
    let sticky: Cell[] = [];
    let stickyVs: VsReel[] = [];
    let multiplier = 1;
    let collect: WantedBonusRound['collect'] = null;
    if (kind === 'dmh') {
      collect = runDmhCollect(rng);
      multiplier = collect.multiplier;
    }
    const spins: WantedSpinResult[] = [];
    let win = 0;
    for (let i = 0; i < BONUS_INFO[kind].spins; i++) {
      if (collect) sticky = placeShowdownWilds(collect.wilds, rng);
      const res = evaluateWantedSpin({ bet, mode: kind, stickyWilds: sticky, stickyVs, globalMultiplier: multiplier, extraScale, rng });
      res.totalWin = Math.min(res.totalWin, Math.max(0, cap - base.totalWin - win));
      if (kind === 'gtr') sticky = res.stickyWilds;
      if (kind === 'duel') stickyVs = res.vsReels.map((v) => ({ ...v, sticky: true }));
      win = Math.round((win + res.totalWin) * 100) / 100;
      spins.push(res);
      if (base.totalWin + win >= cap) break;
    }
    bonus = { bonus: kind, collect, multiplier, spins, win };
  }

  const price = buy ? (buyPrices[buy] ?? BONUS_INFO[buy].price) : 1;
  return {
    buy,
    bet,
    cost: Math.round(bet * price * 100) / 100,
    base,
    bonus,
    totalWin: Math.round((base.totalWin + (bonus?.win ?? 0)) * 100) / 100,
  };
}
