/**
 * Réglages des jeux et du VIP.
 *
 * La valeur de référence est en base (casino_settings.games_config /
 * vip_config) et c'est le SERVEUR qui l'applique : mises min/max, jeu ouvert
 * ou fermé, prix des bonus, plafond de gain… Le navigateur ne s'en sert que
 * pour l'affichage. Les valeurs par défaut ci-dessous sont identiques à celles
 * de normalize_games_config() / normalize_vip_config() (migration SQL).
 */
import type { VipTier } from './supabase';

export interface MinesConfig {
  enabled: boolean;
  minBet: number;
  maxBet: number;
  /** Taux de retour joueur en % (ex. 97 = le casino garde 3 % en moyenne) */
  rtp: number;
  /** Gain maximum payé sur une manche (jetons) */
  maxPayout: number;
}

export interface DogHouseConfig {
  enabled: boolean;
  minBet: number;
  maxBet: number;
  buyEnabled: boolean;
  /** Prix de l'achat de bonus en multiple de la mise */
  buyPrice: number;
  boostEnabled: boolean;
  maxPayout: number;
}

export interface WantedConfig {
  enabled: boolean;
  minBet: number;
  maxBet: number;
  buyEnabled: boolean;
  buyPrices: { gtr: number; duel: number; dmh: number };
  maxPayout: number;
}

export interface CrashConfig {
  enabled: boolean;
  minBet: number;
  maxBet: number;
  /** Taux de retour joueur en % : P(crash ≥ x) = RTP / x */
  rtp: number;
  /** Multiplicateur maximum d'une manche (au-delà, encaissement automatique) */
  maxMultiplier: number;
  maxPayout: number;
}

export interface GamesConfig {
  mines: MinesConfig;
  crash: CrashConfig;
  doghouse: DogHouseConfig;
  wanted: WantedConfig;
  /**
   * Roue payante : prix d'un tour en jetons (plus de délai entre deux tirages).
   * maxRtp : retour joueur maximum (%), véhicules comptés à leur valeur catalogue.
   */
  wheel: { enabled: boolean; spinPrice: number; maxRtp: number };
  /** Boosters de cartes : prix et contenu réglés dans l'onglet Boosters de la console */
  boosters: {
    enabled: boolean;
    /** Retour joueur maximum (%) : valeur moyenne des véhicules d'un booster ≤ prix × maxRtp */
    maxRtp: number;
    /** Taux de reprise des lots en jetons (% de leur valeur, 0 = revente désactivée) */
    sellRate: number;
  };
  /**
   * Collections de marques (autos & mode) : prix, récompense et cartes réglés
   * dans l'onglet Collections de la console. Garde-fous de rentabilité :
   * maxRtp = retour max sur un album complet, packMaxRtp = revente max d'un booster.
   */
  collections: {
    enabled: boolean;
    maxRtp: number;
    packMaxRtp: number;
    /** Revente des doublons : % de la valeur de la carte, + bonus (points) selon la carte VIP */
    sellRate: number;
    sellBonusSilver: number;
    sellBonusGold: number;
    sellBonusDiamond: number;
  };
}

export const DEFAULT_GAMES_CONFIG: GamesConfig = {
  mines: { enabled: true, minBet: 10, maxBet: 100000, rtp: 97, maxPayout: 5000000 },
  crash: { enabled: true, minBet: 10, maxBet: 100000, rtp: 97, maxMultiplier: 1000, maxPayout: 5000000 },
  doghouse: { enabled: true, minBet: 20, maxBet: 100000, buyEnabled: true, buyPrice: 115, boostEnabled: true, maxPayout: 10000000 },
  wanted: {
    enabled: true,
    minBet: 10,
    maxBet: 100000,
    buyEnabled: true,
    buyPrices: { gtr: 80, duel: 204, dmh: 406 },
    maxPayout: 10000000,
  },
  wheel: { enabled: true, spinPrice: 25000, maxRtp: 95 },
  boosters: { enabled: false, maxRtp: 90, sellRate: 70 },
  collections: { enabled: true, maxRtp: 90, packMaxRtp: 60, sellRate: 70, sellBonusSilver: 0, sellBonusGold: 5, sellBonusDiamond: 10 },
};

export interface VipTierConfig {
  price: number;
  bonus: number;
  wheelCooldownHours: number;
}

export type VipConfig = { durationDays: number } & Record<VipTier, VipTierConfig>;

export const DEFAULT_VIP_CONFIG: VipConfig = {
  durationDays: 30,
  SILVER: { price: 25000, bonus: 15000, wheelCooldownHours: 24 },
  GOLD: { price: 75000, bonus: 60000, wheelCooldownHours: 12 },
  DIAMOND: { price: 180000, bonus: 150000, wheelCooldownHours: 8 },
};

/** Fusion superficielle jeu par jeu (les champs manquants gardent leur défaut) */
export function mergeGamesConfig(raw: unknown): GamesConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof GamesConfig, object>>;
  const wanted = { ...DEFAULT_GAMES_CONFIG.wanted, ...(r.wanted || {}) } as WantedConfig;
  wanted.buyPrices = { ...DEFAULT_GAMES_CONFIG.wanted.buyPrices, ...((r.wanted as WantedConfig | undefined)?.buyPrices || {}) };
  return {
    mines: { ...DEFAULT_GAMES_CONFIG.mines, ...(r.mines || {}) },
    crash: { ...DEFAULT_GAMES_CONFIG.crash, ...(r.crash || {}) },
    doghouse: { ...DEFAULT_GAMES_CONFIG.doghouse, ...(r.doghouse || {}) },
    wanted,
    wheel: { ...DEFAULT_GAMES_CONFIG.wheel, ...(r.wheel || {}) },
    boosters: { ...DEFAULT_GAMES_CONFIG.boosters, ...(r.boosters || {}) },
    collections: { ...DEFAULT_GAMES_CONFIG.collections, ...(r.collections || {}) },
  };
}

export function mergeVipConfig(raw: unknown): VipConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<VipConfig>;
  return {
    durationDays: typeof r.durationDays === 'number' ? r.durationDays : DEFAULT_VIP_CONFIG.durationDays,
    SILVER: { ...DEFAULT_VIP_CONFIG.SILVER, ...(r.SILVER || {}) },
    GOLD: { ...DEFAULT_VIP_CONFIG.GOLD, ...(r.GOLD || {}) },
    DIAMOND: { ...DEFAULT_VIP_CONFIG.DIAMOND, ...(r.DIAMOND || {}) },
  };
}

/** Libellés des identifiants de jeu utilisés dans l'historique (bets_history.game_id) */
export const GAME_LABELS: Record<string, string> = {
  mines: 'Mines',
  crash: 'Crash',
  doghouse: 'The Dog House',
  wanted: 'Wanted Dead or a Wild',
  lucky_wheel: 'Roue de la Fortune',
  boosters: 'Boosters véhicules',
  collections: 'Collections',
  'The Dog House': 'The Dog House',
  'Wanted Dead or a Wild': 'Wanted Dead or a Wild',
};

/**
 * RTP théorique des machines à sous : fixé par le moteur de tirage (calibré par
 * simulation), la console admin ne peut pas le modifier. Mines est différent :
 * son RTP se règle dans la console, on lit alors gamesConfig.mines.rtp.
 * Toute l'interface passe par ces valeurs pour rester cohérente.
 * Vérification : npm run check:rtp (simulation des moteurs, ~2 min).
 */
export const SLOT_RTP = { doghouse: 95, wanted: 96.4 } as const;

/** 96.5 -> "96,5 %", 97 -> "97 %" */
export const formatRtp = (rtp: number): string =>
  `${(Math.round(rtp * 10) / 10).toString().replace('.', ',')} %`;

/** Garde les paliers de mise compris entre min et max (au moins un) */
export function clampBetLevels(levels: readonly number[], min: number, max: number): number[] {
  const list = levels.filter((b) => b >= min && b <= max);
  return list.length > 0 ? list : [Math.max(1, Math.round(min))];
}
