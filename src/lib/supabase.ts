import { createClient } from '@supabase/supabase-js';

// The publishable (anon) key is designed to be public: access control is enforced
// server-side by RLS policies and SECURITY DEFINER functions
// (see supabase/migrations/20260924120000_secure_casino_backend.sql).
export const SUPABASE_URL: string =
  import.meta.env?.VITE_SUPABASE_URL || 'https://njnznzgcjsdomahviukl.supabase.co';

export const SUPABASE_ANON_KEY: string =
  import.meta.env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_COqb4-9k3vwQUTj6vu_eyw_uuWGps01';

// -------------------------------------------------------------
// Disjoncteur anti-boucle : chaque requête HTTP vers Supabase produit une
// ligne de log (quota « Log Ingestion »). Si un même endpoint est appelé
// anormalement souvent (bug de boucle de rendu, onglet oublié…), on coupe
// côté navigateur au lieu d'inonder le serveur. Les actions de jeu
// (tours, clics mines) ont un plafond large pour ne pas gêner l'autoplay.
// -------------------------------------------------------------
const BREAKER_WINDOW_MS = 60_000;
const BREAKER_DEFAULT_MAX = 40;
const BREAKER_GAME_MAX = 240;
const GAME_ENDPOINTS = /\/(functions\/v1\/slot-round|rest\/v1\/rpc\/(mines_reveal|mines_start|mines_cashout|spin_wheel|open_booster|crash_start|crash_status|crash_cashout))$/;
const breakerHits = new Map<string, number[]>();
const breakerWarned = new Set<string>();

const guardedFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const path = url.replace(SUPABASE_URL, '').split('?')[0];
  // Les jetons d'auth doivent toujours pouvoir se rafraîchir
  if (path.startsWith('/auth/')) return fetch(input, init);

  const key = `${method} ${path}`;
  const now = Date.now();
  const hits = (breakerHits.get(key) ?? []).filter((t) => now - t < BREAKER_WINDOW_MS);
  const max = GAME_ENDPOINTS.test(path) ? BREAKER_GAME_MAX : BREAKER_DEFAULT_MAX;
  if (hits.length >= max) {
    breakerHits.set(key, hits);
    if (!breakerWarned.has(key)) {
      breakerWarned.add(key);
      console.error(`[Supabase] Disjoncteur : ${key} appelé ${hits.length}× en 1 min — requêtes bloquées (boucle probable).`);
      setTimeout(() => breakerWarned.delete(key), BREAKER_WINDOW_MS);
    }
    return Promise.resolve(
      new Response(JSON.stringify({ message: 'CLIENT_RATE_LIMIT', code: 'CLIENT_RATE_LIMIT' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
  hits.push(now);
  breakerHits.set(key, hits);
  return fetch(input, init);
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: { fetch: guardedFetch },
});

// -------------------------------------------------------------
// Types
// -------------------------------------------------------------

export type StaffRole = 'FONDATEUR' | 'DÉVELOPPEUR' | 'DIRECTEUR CASINO';
export type ProfileRole = StaffRole | 'MEMBRE';
export type VipTier = 'SILVER' | 'GOLD' | 'DIAMOND';

export const STAFF_ROLES: readonly StaffRole[] = ['FONDATEUR', 'DÉVELOPPEUR', 'DIRECTEUR CASINO'];
export const PROFILE_ROLES: readonly ProfileRole[] = [...STAFF_ROLES, 'MEMBRE'];

/** Shape returned by the get_my_profile / register_profile / spin_wheel RPCs */
export interface ProfilePayload {
  id: string;
  discord_id: string | null;
  discord_tag: string | null;
  avatar_url: string | null;
  rp_first_name: string;
  rp_last_name: string;
  citizen_id: string;
  phone_number: string | null;
  role: ProfileRole;
  vip_tier: VipTier | null;
  vip_expires_at?: string | null;
  chips: number;
  cash: number;
  inventory: string[];
  vehicles: string[];
  total_won: number;
  total_spins: number;
  last_wheel_spin: string | null;
  cooldown_hours: number;
  next_spin_at: string | null;
  is_staff: boolean;
  is_booster?: boolean | null;
  created_at: string | null;
}

export interface AdminNote {
  text: string;
  author?: string;
  date?: string;
  severity?: 'surveillance' | 'warning' | 'info' | 'vip';
}

/** Raw row of public.profiles (readable by staff only) */
export interface SupabaseProfile {
  id: string;
  user_id: string | null;
  discord_id: string | null;
  discord_tag: string | null;
  rp_first_name: string | null;
  rp_last_name: string | null;
  citizen_id: string | null;
  role: ProfileRole;
  vip_tier: VipTier | null;
  vip_expires_at: string | null;
  chips: number;
  cash: number;
  total_won: number | null;
  total_wagered: number | null;
  total_spins: number | null;
  avatar_url: string | null;
  phone_number: string | null;
  email: string | null;
  inventory: string[] | null;
  vehicles: string[] | null;
  last_wheel_spin: string | null;
  admin_note: AdminNote | null;
  created_at: string | null;
  updated_at: string | null;
}

export type LogCategory = 'WHEEL' | 'ECONOMY' | 'CITIZEN' | 'SYSTEM' | 'BOOSTER';

export interface SupabaseAdminLog {
  id?: string;
  action: string;
  category: LogCategory;
  detail: string;
  author: string;
  created_at?: string;
}

export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'BET'
  | 'WIN'
  | 'WHEEL'
  | 'VIP_REWARD'
  | 'VIP_REQUEST'
  | 'VIP_SUBSCRIPTION'
  | 'ADMIN_ADJUST'
  | 'REWARD_SALE';

export interface SupabaseTransaction {
  id: string;
  profile_id: string | null;
  type: TransactionType;
  amount: number;
  chips: number;
  game: string | null;
  description: string | null;
  status: 'COMPLETED' | 'PENDING' | 'CANCELLED';
  created_at: string;
}

export interface SupabaseBetEntry {
  id: string;
  profile_id: string | null;
  game_id: string;
  bet_amount: number;
  win_amount: number;
  multiplier?: number;
  result_data?: {
    segment?: string;
    type?: string;
    value?: number | string;
    [key: string]: unknown;
  };
  created_at: string;
}

export interface WheelWin {
  winner: string;
  prize: string;
  won_at: string;
}

// -------------------------------------------------------------
// Errors — server error codes mapped to French user-facing messages
// -------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Connectez-vous avec Discord pour continuer.',
  PROFILE_REQUIRED: 'Créez votre profil citoyen dans l’Espace Membre.',
  PROFILE_EXISTS: 'Un profil citoyen existe déjà pour ce compte Discord.',
  PROFILE_NOT_FOUND: 'Profil introuvable.',
  CITIZEN_ID_TAKEN: 'Ce numéro citoyen est déjà utilisé.',
  INVALID_FIRST_NAME: 'Prénom RP invalide (2 à 25 lettres).',
  INVALID_LAST_NAME: 'Nom RP invalide (2 à 25 lettres).',
  INVALID_CITIZEN_ID: 'Numéro citoyen invalide (lettres, chiffres et tirets, 12 max).',
  INVALID_PHONE: 'Numéro de téléphone invalide.',
  INVALID_EMAIL: 'Adresse e-mail invalide.',
  INVALID_TIER: 'Formule VIP inconnue.',
  INVALID_ROLE: 'Rôle inconnu.',
  COOLDOWN: 'Votre prochain tirage n’est pas encore disponible.',
  MAINTENANCE: 'Le casino est en maintenance, revenez bientôt.',
  WHEEL_NOT_CONFIGURED: 'La roue n’est pas encore configurée par la direction.',
  VIP_ALREADY_ACTIVE: 'Cette carte VIP est déjà active sur votre compte.',
  VIP_REQUEST_PENDING: 'Une demande VIP est déjà en attente de validation.',
  INSUFFICIENT_CHIPS: 'Solde de jetons insuffisant pour cet abonnement.',
  INSUFFICIENT_FUNDS: 'Solde de jetons insuffisant.',
  INVALID_BET: 'Mise invalide (hors des limites autorisées).',
  INVALID_MINES: 'Nombre de mines invalide.',
  INVALID_CELL: 'Case invalide.',
  INVALID_TARGET: 'Objectif invalide.',
  ROUND_IN_PROGRESS: 'Une manche est déjà en cours.',
  ROUND_NOT_FOUND: 'Cette manche est terminée.',
  NOTHING_TO_CASHOUT: 'Révélez au moins une case avant d’encaisser.',
  GAME_DISABLED: 'Ce jeu est temporairement fermé par la direction.',
  BUY_DISABLED: 'L’achat de bonus est désactivé.',
  BOOST_DISABLED: 'Le boost est désactivé.',
  INVALID_WIN: 'Gain refusé par le serveur.',
  INVALID_AMOUNT: 'Montant invalide.',
  INVALID_SETTING: 'Réglage refusé : valeur invalide.',
  SERVER_ERROR: 'Erreur serveur, réessayez.',
  REWARD_NOT_CLAIMABLE: 'Ce lot a déjà été réclamé ou traité.',
  REWARD_NOT_FOUND: 'Lot introuvable.',
  VEHICLE_NOT_FOUND: 'Véhicule introuvable dans le catalogue.',
  INVALID_REWARD: 'Lot invalide.',
  INVALID_STATUS: 'Statut invalide.',
  INVALID_IMPORT: 'Fichier d’import invalide (3 000 véhicules maximum par envoi).',
  FORBIDDEN: 'Vous n’avez pas les droits pour cette action (rôle insuffisant).',
  FORBIDDEN_ROLE_CHANGE: 'Vous n’avez pas les droits pour modifier ce rôle.',
  CANNOT_DELETE_SELF: 'Vous ne pouvez pas supprimer votre propre profil.',
  PACK_NOT_FOUND: 'Ce booster n’est plus disponible.',
  PACK_EMPTY: 'Ce booster ne contient encore aucune carte.',
  REWARD_SOLD: 'Ce lot a été revendu par le joueur : il ne peut plus être modifié.',
  SELL_DISABLED: 'La revente des lots est désactivée par la direction.',
  NOTHING_TO_SELL: 'Aucun lot revendable dans la sélection.',
  PACK_UNPROFITABLE: 'Booster perdant pour le casino : la valeur moyenne des véhicules dépasse le retour joueur autorisé. Montez le prix ou baissez les chances des cartes chères.',
  WHEEL_UNPROFITABLE: 'Roue perdante pour le casino : jetons + valeur des véhicules dépassent le retour joueur autorisé. Montez le prix du tour ou baissez les chances des gros lots.',
  FORBIDDEN_SELF: 'Vous ne pouvez pas créditer votre propre compte (solde, VIP ou lot). Demandez à un autre membre de la direction.',
  VIP_HIGHER_ACTIVE: 'Une carte VIP supérieure est déjà active sur votre compte.',
  VEHICLE_NOT_IN_DEALERSHIP: 'Ce véhicule n’est pas vendu en concession : il ne peut pas devenir une carte.',
  CARD_NOT_FOUND: 'Carte introuvable.',
  INVALID_RARITY: 'Rareté inconnue.',
  INVALID_RARITIES: 'Liste de raretés invalide (1 à 12).',
  RARITY_IN_USE: 'Impossible de supprimer une rareté encore utilisée par des cartes.',
  INVALID_THRESHOLDS: 'Indiquez au moins un palier de rareté.',
  EMPTY_FILTER: 'Choisissez au moins une classe, une marque ou un véhicule.',
  SET_NOT_FOUND: 'Cette collection n’est pas disponible.',
  GIFT_NOT_FOUND: 'Ce booster offert a déjà été ouvert.',
  GIFT_WRONG_SET: 'Ce booster offert appartient à l’autre collection.',
  COLLECTION_UNPROFITABLE: 'Collection perdante pour le casino : la revente moyenne d’un booster ou le retour sur un album complet dépasse la limite. Baissez les prix de revente / la récompense, montez le prix du booster ou rendez les cartes rares plus rares.',
  COLLECTION_UNREACHABLE: 'Une carte de l’album ne peut jamais sortir (rareté à 0 % dans ce booster) : l’album serait impossible à compléter.',
};

export class CasinoApiError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message || ERROR_MESSAGES[code] || 'Erreur de communication avec le serveur.');
    this.name = 'CasinoApiError';
    this.code = code;
  }
}

function toApiError(error: { message?: string; code?: string } | null | undefined): CasinoApiError {
  const raw = (error?.message || '').trim();
  if (ERROR_MESSAGES[raw]) return new CasinoApiError(raw);
  if (error?.code === '42501' || /permission denied/i.test(raw)) return new CasinoApiError('FORBIDDEN');
  if (/failed to fetch|network/i.test(raw)) {
    return new CasinoApiError('NETWORK', 'Serveur injoignable. Vérifiez votre connexion.');
  }
  return new CasinoApiError(raw || 'UNKNOWN');
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toApiError(error);
  return data as T;
}

// -------------------------------------------------------------
// Player API
// -------------------------------------------------------------

export const apiGetMyProfile = () => rpc<ProfilePayload | null>('get_my_profile');

export const apiRegisterProfile = (p: { firstName: string; lastName: string; citizenId: string; phone?: string }) =>
  rpc<ProfilePayload>('register_profile', {
    p_first_name: p.firstName,
    p_last_name: p.lastName,
    p_citizen_id: p.citizenId,
    p_phone: p.phone || null,
  });

export const apiUpdateMyProfile = (p: { firstName: string; lastName: string; citizenId: string; phone?: string }) =>
  rpc<ProfilePayload>('update_my_profile', {
    p_first_name: p.firstName,
    p_last_name: p.lastName,
    p_citizen_id: p.citizenId,
    p_phone: p.phone || null,
  });

export interface SpinResult {
  segment_index: number;
  segment: Record<string, unknown>;
  reward_id: string | null;
  profile: ProfilePayload;
}

export const apiSpinWheel = () => rpc<SpinResult>('spin_wheel');

export const apiRequestVip = (tier: VipTier) => rpc<{ status: string; tier: VipTier }>('request_vip', { p_tier: tier });

export const apiBuyVipWithChips = (tier: VipTier) => rpc<ProfilePayload>('buy_vip_with_chips', { p_tier: tier });

export const apiRecentWheelWins = (limit = 8) => rpc<WheelWin[]>('recent_wheel_wins', { p_limit: limit });

// -------------------------------------------------------------
// Mines — la grille est secrète et gérée par le serveur
// -------------------------------------------------------------

export interface MinesRoundState {
  round_id: string;
  status: 'ACTIVE' | 'LOST' | 'CASHED';
  bet: number;
  mines: number;
  rtp: number;
  revealed: number[];
  gems: number;
  multiplier: number;
  next_multiplier: number;
  win: number;
  hash: string;
  /** Uniquement en fin de manche : true = mine */
  board?: boolean[] | null;
  server_seed?: string | null;
  /** Uniquement après mines_reveal */
  cell?: number;
  hit?: boolean;
  profile?: ProfilePayload;
}

export const apiMinesStart = (bet: number, mines: number) =>
  rpc<MinesRoundState>('mines_start', { p_bet: Math.trunc(bet), p_mines: mines });
export const apiMinesReveal = (roundId: string, cell: number) =>
  rpc<MinesRoundState>('mines_reveal', { p_round_id: roundId, p_cell: cell });
export const apiMinesCashout = (roundId: string) => rpc<MinesRoundState>('mines_cashout', { p_round_id: roundId });
export const apiMinesCurrent = () => rpc<MinesRoundState | null>('mines_current');

// -------------------------------------------------------------
// Crash — le point de crash est secret, le temps écoulé est celui du serveur
// -------------------------------------------------------------

export interface CrashRoundState {
  round_id: string;
  status: 'ACTIVE' | 'LOST' | 'CASHED';
  bet: number;
  auto_cashout: number | null;
  /** Encaissement automatique effectif (objectif, plafond de gain ou multiplicateur max) */
  target: number;
  rtp: number;
  max_payout: number;
  /** Temps écoulé côté serveur depuis le départ */
  elapsed_ms: number;
  multiplier: number;
  cashout_at: number | null;
  win: number;
  hash: string;
  /** Uniquement en fin de manche */
  crash_point: number | null;
  server_seed: string | null;
  started_at: string;
  profile?: ProfilePayload;
}

export interface CrashHistoryEntry {
  crash_point: number;
  cashout_at: number | null;
  win: number;
  bet: number;
  at: string;
}

export const apiCrashStart = (bet: number, auto: number | null) =>
  rpc<CrashRoundState>('crash_start', { p_bet: Math.trunc(bet), p_auto: auto });
export const apiCrashStatus = (roundId: string) => rpc<CrashRoundState>('crash_status', { p_round_id: roundId });
export const apiCrashCashout = (roundId: string) => rpc<CrashRoundState>('crash_cashout', { p_round_id: roundId });
export const apiCrashCurrent = () => rpc<CrashRoundState | null>('crash_current');
export const apiCrashHistory = (limit = 20) => rpc<CrashHistoryEntry[]>('crash_history', { p_limit: limit });

// -------------------------------------------------------------
// Machines à sous — tirage fait par la fonction Edge « slot-round »
// -------------------------------------------------------------

export interface SlotRoundResponse<R> {
  round: R;
  cost: number;
  paid: number;
  profile: ProfilePayload;
  /** Bonus offert : mise réellement utilisée par le serveur */
  bet?: number;
}

/** Réveille la fonction Edge (aucun effet côté serveur) pour éviter le démarrage à froid */
export function apiWarmSlotRound(): void {
  void supabase.functions.invoke('slot-round', { method: 'GET' }).catch(() => undefined);
}

export async function apiPlaySlotRound<R>(body: {
  game: 'doghouse' | 'wanted';
  bet: number;
  mode?: 'spin' | 'boost' | 'buy';
  buy?: string | null;
  /** Bonus offert : le serveur relit le bon et joue le bonus gratuitement */
  voucher_id?: string;
}): Promise<SlotRoundResponse<R>> {
  const { data, error } = await supabase.functions.invoke('slot-round', { body });
  if (error) {
    let code = 'SERVER_ERROR';
    try {
      const ctx = (error as { context?: Response }).context;
      const payload = ctx ? await ctx.json() : null;
      if (payload?.error) code = payload.error;
    } catch {
      if (/fetch|network/i.test(error.message || '')) code = 'NETWORK';
    }
    throw code === 'NETWORK' ? new CasinoApiError('NETWORK', 'Serveur injoignable. Vérifiez votre connexion.') : new CasinoApiError(code);
  }
  return data as SlotRoundResponse<R>;
}

export const apiSubscribeEvents = (email: string) => rpc<null>('subscribe_events', { p_email: email });

export async function dbFetchTransactions(profileId: string, limit = 50): Promise<SupabaseTransaction[]> {
  const { data, error } = await supabase
    .from('casino_transactions')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw toApiError(error);
  return (data || []) as SupabaseTransaction[];
}

export async function dbFetchBetsHistory(profileId: string, limit = 50): Promise<SupabaseBetEntry[]> {
  const { data, error } = await supabase
    .from('bets_history')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw toApiError(error);
  return (data || []) as SupabaseBetEntry[];
}

// -------------------------------------------------------------
// Vehicle catalogue & won prizes
// -------------------------------------------------------------

export interface VehicleCatalogEntry {
  model: string;
  hash: string | null;
  dlc: string | null;
  manufacturer: string | null;
  class: string | null;
  type: string | null;
  seats: number | null;
  price: number | null;
  photo_url: string | null;
  photo_full_url: string | null;
  screenshot_url: string | null;
  /** Vendu en concession (seuls ces véhicules peuvent devenir des cartes de booster) */
  in_dealership?: boolean | null;
}

export type RewardStatus = 'IN_INVENTORY' | 'CLAIMED' | 'DELIVERED' | 'REVOKED' | 'SOLD' | 'USED';

export interface PlayerReward {
  id: string;
  profile_id: string;
  kind: 'vehicle' | 'item' | 'voucher' | 'pack';
  label: string;
  vehicle_model: string | null;
  image_url: string | null;
  source: 'wheel' | 'admin' | 'booster';
  status: RewardStatus;
  note: string | null;
  created_at: string;
  claimed_at: string | null;
  handled_at: string | null;
  handled_by: string | null;
  /** Valeur du lot ($) et revente éventuelle */
  value?: number | null;
  booster_card_id?: string | null;
  sold_at?: string | null;
  sold_for?: number | null;
  /** Bon de bonus offert : machine, type de bonus et mise déduite de sa valeur */
  voucher?: VoucherSpec | null;
  /** Booster de collection offert (kind 'pack') : album concerné */
  pack_set?: string | null;
}

export interface VoucherSpec {
  game: 'doghouse' | 'wanted';
  buy: string;
  bet: number;
  cost: number;
}

export async function dbSearchVehicles(query: string, opts: { vehicleClass?: string; limit?: number; dealershipOnly?: boolean } = {}): Promise<VehicleCatalogEntry[]> {
  let req = supabase.from('vehicle_catalog').select('*').order('price', { ascending: false }).limit(opts.limit ?? 40);
  const q = query.trim().replace(/[%,()]/g, ' ').trim();
  if (q) req = req.or(`model.ilike.%${q}%,manufacturer.ilike.%${q}%`);
  if (opts.vehicleClass) req = req.eq('class', opts.vehicleClass);
  if (opts.dealershipOnly) req = req.eq('in_dealership', true);
  const { data, error } = await req;
  if (error) throw toApiError(error);
  return (data || []) as VehicleCatalogEntry[];
}

export async function dbCountVehicles(): Promise<number> {
  const { count } = await supabase.from('vehicle_catalog').select('model', { count: 'exact', head: true });
  return count || 0;
}

/** Bons de bonus offerts non utilisés du joueur pour une machine */
export async function dbFetchMyVouchers(profileId: string, game: 'doghouse' | 'wanted'): Promise<PlayerReward[]> {
  const { data, error } = await supabase
    .from('player_rewards')
    .select('*')
    .eq('profile_id', profileId)
    .eq('kind', 'voucher')
    .eq('status', 'IN_INVENTORY')
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw toApiError(error);
  return ((data || []) as PlayerReward[]).filter((r) => r.voucher?.game === game);
}

export async function dbFetchMyRewards(profileId: string): Promise<PlayerReward[]> {
  const { data, error } = await supabase
    .from('player_rewards')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw toApiError(error);
  return (data || []) as PlayerReward[];
}

/** Staff: every prize, newest first (optionally filtered by status) */
export async function dbFetchRewards(status?: RewardStatus, limit = 200): Promise<PlayerReward[]> {
  let req = supabase.from('player_rewards').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status) req = req.eq('status', status);
  const { data, error } = await req;
  if (error) throw toApiError(error);
  return (data || []) as PlayerReward[];
}

// -------------------------------------------------------------
// Boosters (cartes véhicules)
// -------------------------------------------------------------

export type BoosterEffect = 'none' | 'glow' | 'holo' | 'rays' | 'mythic';

export interface BoosterRarity {
  key: string;
  label: string;
  color: string;
  effect: BoosterEffect;
  sort: number;
}

export interface BoosterCardVehicle {
  model: string;
  manufacturer: string | null;
  class: string | null;
  type: string | null;
  seats: number | null;
  price: number | null;
  photo_url: string | null;
  photo_full_url: string | null;
}

export interface BoosterCardData {
  id: string;
  vehicle_model: string;
  rarity: string;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  value_override: number | null;
  accent_color: string | null;
  holo: boolean;
  active: boolean;
  created_at?: string;
  vehicle: BoosterCardVehicle | null;
  /** Valeur affichée : surcharge ou prix du véhicule */
  value: number;
  /** Présent sur les cartes tirées (lot créé dans l'inventaire) */
  reward_id?: string;
}

export interface BoosterPackCard {
  card_id: string;
  weight: number;
}

export interface BoosterPackData {
  id: string;
  name: string;
  description: string | null;
  price: number;
  cards_per_pack: number;
  rarity_weights: Record<string, number>;
  guaranteed_rarity: string | null;
  cover_image_url: string | null;
  accent_color: string;
  active: boolean;
  sort_order: number;
  cards: BoosterPackCard[];
  /** Calculés par le serveur : valeur moyenne des véhicules d'un booster ($) et retour joueur (%) */
  ev?: number;
  rtp?: number;
}

export interface BoosterCatalog {
  rarities: BoosterRarity[];
  packs: BoosterPackData[];
  cards: BoosterCardData[];
  /** Retour joueur maximum autorisé (%) */
  max_rtp?: number;
}

export interface OpenBoosterResult {
  pack_id: string;
  price: number;
  cards: BoosterCardData[];
  total_value: number;
  profile: ProfilePayload;
}

/** Catalogue public (boosters actifs) ou complet pour la console (all = true, staff) */
export const apiBoosterCatalog = (all = false) => rpc<BoosterCatalog>('booster_catalog', { p_all: all });
export const apiOpenBooster = (packId: string) => rpc<OpenBoosterResult>('open_booster', { p_pack_id: packId });

export interface BoosterCollectionCard extends BoosterCardData {
  count: number;
  first_at: string;
  last_at: string;
}
export interface BoosterCollection {
  openings: number;
  cards: BoosterCollectionCard[];
}
/** Espace Membre : cartes obtenues par le joueur connecté (exemplaires, dates) */
export const apiMyBoosterCollection = () => rpc<BoosterCollection>('my_booster_collection');

/** Console : mettre des véhicules en concession ou les en retirer (retirer désactive leurs cartes) */
export const apiAdminSetVehicleDealership = (models: string[], value: boolean) =>
  rpc<number>('admin_set_vehicle_dealership', { p_models: models, p_value: value });

// -------------------------------------------------------------
// Inventaire unique (lots de la roue + cartes des boosters) et revente
// -------------------------------------------------------------

export interface InventoryItem extends PlayerReward {
  /** Valeur du véhicule ($) */
  value: number;
  /** Jetons obtenus en le revendant maintenant (0 = non revendable) */
  sell_value: number;
  card: BoosterCardData | null;
  vehicle: BoosterCardVehicle | null;
}
export interface Inventory {
  items: InventoryItem[];
  /** Taux de reprise (%) */
  sell_rate: number;
}
export const apiMyInventory = () => rpc<Inventory>('my_inventory');
export const apiSellRewards = (ids: string[]) =>
  rpc<{ sold: number; chips: number; profile: ProfilePayload }>('sell_rewards', { p_ids: ids });

export type BoosterCardInput = Pick<
  BoosterCardData,
  'vehicle_model' | 'rarity' | 'title' | 'subtitle' | 'image_url' | 'value_override' | 'accent_color' | 'holo' | 'active'
> & { id?: string };

export const apiAdminSaveBoosterCard = (card: BoosterCardInput) =>
  rpc<BoosterCardData>('admin_save_booster_card', { p_card: card });
export const apiAdminDeleteBoosterCards = (ids: string[]) => rpc<number>('admin_delete_booster_cards', { p_ids: ids });

export interface BoosterBulkOptions {
  classes?: string[];
  manufacturers?: string[];
  models?: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
  thresholds: { rarity: string; minPrice: number }[];
  skipExisting?: boolean;
  packId?: string | null;
}
export const apiAdminBulkCreateBoosterCards = (opts: BoosterBulkOptions) =>
  rpc<number>('admin_bulk_create_booster_cards', { p_opts: opts });

export type BoosterPackInput = Omit<BoosterPackData, 'id'> & { id?: string };
export const apiAdminSaveBoosterPack = (pack: BoosterPackInput) => rpc<string>('admin_save_booster_pack', { p_pack: pack });
export const apiAdminDeleteBoosterPack = (id: string) => rpc<null>('admin_delete_booster_pack', { p_id: id });
export interface BoosterSimulation {
  pack_id: string;
  packs: number;
  cards_drawn: number;
  /** Nombre de fois où la rareté garantie a dû être forcée sur la dernière carte */
  forced: number;
  rarities: { rarity: string; count: number }[];
  cards: { card_id: string; count: number }[];
  value: { avg: number; min: number; max: number; p50: number; p90: number; p99: number };
  price: number;
  ms: number;
}
/** Console : N ouvertures « à blanc » avec le vrai tirage du serveur (10 000 max., sans jetons ni lots) */
export const apiAdminSimulateBooster = (packId: string, count: number) =>
  rpc<BoosterSimulation>('admin_simulate_booster', { p_pack_id: packId, p_count: count });

export const apiAdminSaveBoosterRarities = (rows: BoosterRarity[]) =>
  rpc<null>('admin_save_booster_rarities', { p_rows: rows });

// -------------------------------------------------------------
// Collections de marques (cartes à collectionner)
// -------------------------------------------------------------

export type CollectionFont = 'tight' | 'tight-italic' | 'serif' | 'serif-italic' | 'mono' | 'oswald' | 'lilita' | 'luckiest' | 'rye';

export interface CollectionRarity {
  key: string;
  label: string;
  color: string;
  effect: BoosterEffect;
  sort: number;
  /** Valeur d'une carte (jetons) : un doublon se revend valeur × taux de revente du joueur */
  sell_value: number;
  /** false = carte secrète, hors album */
  in_collection: boolean;
}

export interface CollectionCardData {
  id: string;
  set_id: string;
  number: number;
  rarity: string;
  active: boolean;
  /** Carte secrète pas encore trouvée : seuls numéro et rareté sont connus */
  hidden: boolean;
  name?: string;
  tagline?: string | null;
  color?: string;
  color2?: string;
  font?: CollectionFont;
  emblem?: string | null;
  image_url?: string | null;
  weight?: number;
}

export interface CollectionSetStats {
  playable?: boolean;
  cards?: number;
  unreachable?: number;
  pack_resale_ev?: number;
  pack_rtp?: number;
  expected_packs?: number;
  expected_cost?: number;
  completion_resale?: number;
  completion_rtp?: number | null;
}

export interface CollectionSetData {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  accent_color: string;
  pack_price: number;
  cards_per_pack: number;
  reward: number;
  rarity_weights: Record<string, number>;
  sort_order: number;
  active?: boolean;
  stats?: CollectionSetStats;
  ok?: boolean;
  players?: number;
  completions?: number;
  openings?: number;
}

export interface CollectionsConfig {
  enabled: boolean;
  /** Retour joueur max sur un album complet (%) */
  maxRtp: number;
  /** Revente moyenne max d'un booster (% du prix) */
  packMaxRtp: number;
  /** Taux de revente des doublons (% de la valeur) et bonus par carte VIP (points) */
  sellRate: number;
  sellBonusSilver: number;
  sellBonusGold: number;
  sellBonusDiamond: number;
}

export interface CollectionCatalog {
  rarities: CollectionRarity[];
  sets: CollectionSetData[];
  cards: CollectionCardData[];
  config: CollectionsConfig;
}

export interface MyCollections {
  owned: { card_id: string; count: number; total_found: number; first_at: string; last_at: string }[];
  secrets: CollectionCardData[];
  completions: { set_id: string; reward: number; packs_opened: number; completed_at: string }[];
  gifts: { id: string; set_id: string | null; label: string; source: string; created_at: string }[];
  openings: number;
  /** Taux de revente des doublons du joueur (%, bonus VIP compris) */
  sell_rate: number;
}

export interface OpenedCollectionCard extends CollectionCardData {
  is_new: boolean;
  count: number;
  secret: boolean;
}

export interface OpenCollectionPackResult {
  set_id: string;
  price: number;
  gift: boolean;
  cards: OpenedCollectionCard[];
  completed: boolean;
  reward: number;
  profile: ProfilePayload;
}

export const apiCollectionCatalog = () => rpc<CollectionCatalog>('collection_catalog');
export const apiMyCollections = () => rpc<MyCollections>('my_collections');
export const apiOpenCollectionPack = (setId: string, giftId?: string | null) =>
  rpc<OpenCollectionPackResult>('open_collection_pack', { p_set_id: setId, p_reward_id: giftId ?? null });
export const apiSellCollectionCards = (items: { card_id: string; qty: number }[]) =>
  rpc<{ sold: number; chips: number; rate: number; profile: ProfilePayload }>('sell_collection_cards', { p_items: items });

export interface AdminCollectionCard extends CollectionCardData {
  owners: number;
  found: number;
}
export interface AdminCollectionCatalog extends Omit<CollectionCatalog, 'cards'> {
  cards: AdminCollectionCard[];
}
export const apiAdminCollectionCatalog = () => rpc<AdminCollectionCatalog>('admin_collection_catalog');
export const apiAdminSaveCollectionSet = (set: Omit<CollectionSetData, 'stats' | 'ok' | 'players' | 'completions' | 'openings'>) =>
  rpc<null>('admin_save_collection_set', { p_set: set });
export const apiAdminSaveCollectionCard = (card: Partial<CollectionCardData> & { set_id: string; name: string; rarity: string }) =>
  rpc<CollectionCardData>('admin_save_collection_card', { p_card: card });
export const apiAdminDeleteCollectionCard = (id: string) => rpc<null>('admin_delete_collection_card', { p_id: id });
export const apiAdminSaveCollectionRarities = (rows: CollectionRarity[]) =>
  rpc<null>('admin_save_collection_rarities', { p_rows: rows });
export const apiAdminGrantCollectionPack = (profileId: string, setId: string, qty: number, note?: string) =>
  rpc<number>('admin_grant_collection_pack', { p_profile_id: profileId, p_set_id: setId, p_qty: qty, p_note: note ?? null });

export const apiClaimReward = (rewardId: string) => rpc<PlayerReward>('claim_reward', { p_reward_id: rewardId });

export const apiAdminGrantReward = (profileId: string, p: { vehicleModel?: string; label?: string; note?: string }) =>
  rpc<PlayerReward>('admin_grant_reward', {
    p_profile_id: profileId,
    p_vehicle_model: p.vehicleModel || null,
    p_label: p.label || null,
    p_note: p.note || null,
  });

export const apiAdminGrantVoucher = (
  profileId: string,
  p: { game: 'doghouse' | 'wanted'; buy: string; value: number; note?: string },
) =>
  rpc<PlayerReward>('admin_grant_voucher', {
    p_profile_id: profileId,
    p_game: p.game,
    p_buy: p.buy,
    p_value: p.value,
    p_note: p.note || null,
  });

export interface DbUsage {
  db_bytes: number;
  limit_bytes: number;
  rounds: number;
  transactions: number;
  logs: number;
  oldest_round: string | null;
  rounds_24h: number;
}
export const apiAdminDbUsage = () => rpc<DbUsage>('admin_db_usage');

/** Staff : parties de tous les joueurs, plus récentes d'abord (pagination par date) */
export async function dbFetchAllBets(opts: {
  game?: string;
  profileId?: string;
  minWin?: number;
  before?: string;
  limit?: number;
}): Promise<SupabaseBetEntry[]> {
  let req = supabase.from('bets_history').select('*').order('created_at', { ascending: false }).limit(opts.limit ?? 50);
  if (opts.game) req = req.eq('game_id', opts.game);
  if (opts.profileId) req = req.eq('profile_id', opts.profileId);
  if (opts.minWin) req = req.gte('win_amount', opts.minWin);
  if (opts.before) req = req.lt('created_at', opts.before);
  const { data, error } = await req;
  if (error) throw toApiError(error);
  return (data || []) as SupabaseBetEntry[];
}

export const apiAdminUpdateReward = (rewardId: string, status: Exclude<RewardStatus, 'CLAIMED'>, note?: string) =>
  rpc<PlayerReward>('admin_update_reward', { p_reward_id: rewardId, p_status: status, p_note: note || null });

export const CTG_ASSET_BASE = 'https://api.staff.gta.ctgaming.fr:2096';

/**
 * Accepts either the raw CTG export (Name, Manufacturer, photoUrl…) or the
 * already-normalised format, and returns rows for admin_import_vehicles.
 */
export function normalizeVehicleImport(raw: unknown): VehicleCatalogEntry[] {
  if (!Array.isArray(raw)) throw new CasinoApiError('INVALID_IMPORT');
  const abs = (p: unknown) =>
    typeof p === 'string' && p ? (p.startsWith('http') ? p : `${CTG_ASSET_BASE}${p.startsWith('/') ? '' : '/'}${p}`) : null;
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      model: String(r.model ?? r.Name ?? '').trim(),
      hash: r.hash != null || r.Hash != null ? String(r.hash ?? r.Hash) : null,
      dlc: (r.dlc ?? r.DlcName ?? null) as string | null,
      manufacturer: (r.manufacturer ?? r.Manufacturer ?? null) as string | null,
      class: (r.class ?? r.Class ?? null) as string | null,
      type: (r.type ?? r.Type ?? null) as string | null,
      seats: Number(r.seats ?? r.Seats) || null,
      price: Math.max(0, Number(r.price ?? r.Price) || 0),
      photo_url: abs(r.photo_url ?? r.photoUrl),
      photo_full_url: abs(r.photo_full_url ?? r.photoFullUrl),
      screenshot_url: abs(r.screenshot_url ?? r.screenshotUrl),
    }))
    .filter((r) => r.model);
}

export async function apiAdminImportVehicles(rows: VehicleCatalogEntry[], onProgress?: (done: number) => void): Promise<number> {
  let total = 0;
  for (let i = 0; i < rows.length; i += 400) {
    total += await rpc<number>('admin_import_vehicles', { p_rows: rows.slice(i, i + 400) });
    onProgress?.(Math.min(rows.length, i + 400));
  }
  return total;
}

// -------------------------------------------------------------
// Settings (public read, staff write)
// -------------------------------------------------------------

export async function dbGetSetting<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase.from('casino_settings').select('value').eq('key', key).maybeSingle();
  if (error || !data) return null;
  return data.value as T;
}

/** Staff : écriture validée et journalisée côté serveur (admin_set_setting) */
export const apiAdminSetSetting = <T>(key: string, value: unknown) =>
  rpc<T>('admin_set_setting', { p_key: key, p_value: value });

// -------------------------------------------------------------
// Staff API (every call is re-checked server-side)
// -------------------------------------------------------------

export async function dbFetchProfiles(limit = 500): Promise<SupabaseProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw toApiError(error);
  return (data || []) as SupabaseProfile[];
}

export async function dbFetchPendingVipRequests(): Promise<SupabaseTransaction[]> {
  const { data, error } = await supabase
    .from('casino_transactions')
    .select('*')
    .eq('type', 'VIP_REQUEST')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true });
  if (error) throw toApiError(error);
  return (data || []) as SupabaseTransaction[];
}

export async function dbFetchAdminLogs(limit = 50): Promise<SupabaseAdminLog[]> {
  const { data, error } = await supabase
    .from('admin_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []) as SupabaseAdminLog[];
}

export interface AdminProfilePatch {
  rp_first_name?: string;
  rp_last_name?: string;
  citizen_id?: string;
  phone_number?: string | null;
  role?: ProfileRole;
  vip_tier?: VipTier | null;
  chips?: number;
  cash?: number;
  avatar_url?: string | null;
  admin_note?: AdminNote | null;
}

export const apiAdminUpdateProfile = (profileId: string, patch: AdminProfilePatch) =>
  rpc<SupabaseProfile>('admin_update_profile', { p_profile_id: profileId, p_patch: patch });

export const apiAdminAdjustBalance = (profileId: string, chipsDelta: number, reason?: string) =>
  rpc<SupabaseProfile>('admin_adjust_balance', {
    p_profile_id: profileId,
    p_chips_delta: Math.trunc(chipsDelta),
    p_cash_delta: 0,
    p_reason: reason || null,
  });

export const apiAdminResetCooldown = (profileId: string | null) =>
  rpc<number>('admin_reset_cooldown', { p_profile_id: profileId });

export const apiAdminSetVip = (profileId: string, tier: VipTier | null, grantBonus = true) =>
  rpc<SupabaseProfile>('admin_set_vip', { p_profile_id: profileId, p_tier: tier, p_grant_bonus: grantBonus });

export const apiAdminRejectVipRequest = (transactionId: string) =>
  rpc<null>('admin_reject_vip_request', { p_transaction_id: transactionId });

export const apiAdminDeleteProfile = (profileId: string) =>
  rpc<null>('admin_delete_profile', { p_profile_id: profileId });

export interface GameStats {
  rounds: number;
  players: number;
  wagered: number;
  paid: number;
  profit: number;
  rtp: number | null;
  biggest_win: number;
}

export interface AdminDashboard {
  since: string;
  days: number;
  games: Record<string, GameStats>;
  totals: {
    players: number;
    linked_players: number;
    active_players: number;
    chips_in_circulation: number;
    chips_players_only: number;
    vip_active: number;
    admin_injected: number;
    admin_removed: number;
    vip_sales: number;
    vip_bonuses: number;
    pending_vip: number;
    /** Jetons versés aux joueurs pour la revente de leurs lots (absent avant la migration d'intégrité) */
    reward_sales?: number;
    pending_rewards: number;
    mines_open_rounds: number;
    mines_open_stake: number;
    crash_open_rounds?: number;
    crash_open_stake?: number;
  };
  top_players: { id: string; name: string; citizen_id: string; role: ProfileRole; wagered: number; paid: number; net: number; rounds: number }[];
  daily: { day: string; wagered: number; paid: number; rounds: number }[];
}

export const apiAdminDashboard = (days: number) => rpc<AdminDashboard>('admin_dashboard', { p_days: days });

export type StatsGameId = 'mines' | 'doghouse' | 'wanted' | 'lucky_wheel' | 'boosters' | 'crash' | 'collections';

interface GameStatsPlayer {
  id: string;
  name: string;
  citizen_id: string;
  role: ProfileRole;
  rounds: number;
  wagered: number;
  paid: number;
  net: number;
}

export interface AdminGameStats {
  game: StatsGameId;
  days: number;
  summary: {
    rounds: number;
    players: number;
    wagered: number;
    paid: number;
    profit: number;
    rtp: number | null;
    avg_bet: number;
    win_rate: number | null;
    bonus_rounds: number;
    biggest_win: number;
    biggest_multiplier: number;
    first_at: string | null;
    last_at: string | null;
  };
  /** Mode de jeu (slots), nombre de mines (Mines) ou lot tiré (roue) */
  breakdown: { key: string; rounds: number; players: number; wagered: number; paid: number; rtp: number | null }[];
  distribution: { ord: number; label: string; rounds: number; paid: number }[];
  daily: { day: string; rounds: number; players: number; wagered: number; paid: number }[];
  hours: { hour: number; rounds: number }[];
  winners: GameStatsPlayer[];
  losers: GameStatsPlayer[];
  biggest: { created_at: string; bet: number; win: number; multiplier: number; name: string | null; citizen_id: string | null; result_data: Record<string, unknown> }[];
}

export const apiAdminGameStats = (game: StatsGameId, days: number) =>
  rpc<AdminGameStats>('admin_game_stats', { p_game: game, p_days: days });

export type HistoryExportKind = 'bets' | 'transactions';
const EXPORT_PAGE = 2000;

/** Récupère tout l'historique encore en base (les lignes de jeu sont purgées après 30 jours), page par page */
export async function apiAdminExportHistory(
  kind: HistoryExportKind,
  onProgress?: (rows: number) => void,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let after: { created_at: string; id: string } | null = null;
  for (;;) {
    const page: Record<string, unknown>[] = await rpc<Record<string, unknown>[]>('admin_export_history', {
      p_kind: kind,
      p_after_created: after?.created_at ?? null,
      p_after_id: after?.id ?? null,
      p_limit: EXPORT_PAGE,
    });
    all.push(...page);
    onProgress?.(all.length);
    if (page.length < EXPORT_PAGE) return all;
    const last = page[page.length - 1] as { created_at: string; id: string };
    after = { created_at: last.created_at, id: last.id };
  }
}

// -------------------------------------------------------------
// Health
// -------------------------------------------------------------

export interface SupabaseHealthResult {
  online: boolean;
  latencyMs: number;
  version?: string;
  error?: string;
}

export async function dbCheckHealth(): Promise<SupabaseHealthResult> {
  const start = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) return { online: false, latencyMs, error: `HTTP ${res.status}` };
    const data = await res.json().catch(() => ({}));
    return { online: true, latencyMs, version: data.version || 'v2' };
  } catch (err) {
    return {
      online: false,
      latencyMs: Math.round(performance.now() - start),
      error: (err as Error)?.name === 'AbortError' ? 'Timeout' : 'Erreur réseau',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
