import { createClient } from '@supabase/supabase-js';

// The publishable (anon) key is designed to be public: access control is enforced
// server-side by RLS policies and SECURITY DEFINER functions
// (see supabase/migrations/20260924120000_secure_casino_backend.sql).
export const SUPABASE_URL: string =
  import.meta.env?.VITE_SUPABASE_URL || 'https://njnznzgcjsdomahviukl.supabase.co';

export const SUPABASE_ANON_KEY: string =
  import.meta.env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_COqb4-9k3vwQUTj6vu_eyw_uuWGps01';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
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

export type LogCategory = 'WHEEL' | 'ECONOMY' | 'CITIZEN' | 'SYSTEM';

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
  | 'ADMIN_ADJUST';

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
// Machines à sous — tirage fait par la fonction Edge « slot-round »
// -------------------------------------------------------------

export interface SlotRoundResponse<R> {
  round: R;
  cost: number;
  paid: number;
  profile: ProfilePayload;
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
}

export type RewardStatus = 'IN_INVENTORY' | 'CLAIMED' | 'DELIVERED' | 'REVOKED';

export interface PlayerReward {
  id: string;
  profile_id: string;
  kind: 'vehicle' | 'item';
  label: string;
  vehicle_model: string | null;
  image_url: string | null;
  source: 'wheel' | 'admin';
  status: RewardStatus;
  note: string | null;
  created_at: string;
  claimed_at: string | null;
  handled_at: string | null;
  handled_by: string | null;
}

export async function dbSearchVehicles(query: string, opts: { vehicleClass?: string; limit?: number } = {}): Promise<VehicleCatalogEntry[]> {
  let req = supabase.from('vehicle_catalog').select('*').order('price', { ascending: false }).limit(opts.limit ?? 40);
  const q = query.trim().replace(/[%,()]/g, ' ').trim();
  if (q) req = req.or(`model.ilike.%${q}%,manufacturer.ilike.%${q}%`);
  if (opts.vehicleClass) req = req.eq('class', opts.vehicleClass);
  const { data, error } = await req;
  if (error) throw toApiError(error);
  return (data || []) as VehicleCatalogEntry[];
}

export async function dbCountVehicles(): Promise<number> {
  const { count } = await supabase.from('vehicle_catalog').select('model', { count: 'exact', head: true });
  return count || 0;
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

export const apiClaimReward = (rewardId: string) => rpc<PlayerReward>('claim_reward', { p_reward_id: rewardId });

export const apiAdminGrantReward = (profileId: string, p: { vehicleModel?: string; label?: string; note?: string }) =>
  rpc<PlayerReward>('admin_grant_reward', {
    p_profile_id: profileId,
    p_vehicle_model: p.vehicleModel || null,
    p_label: p.label || null,
    p_note: p.note || null,
  });

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
    pending_rewards: number;
    mines_open_rounds: number;
    mines_open_stake: number;
  };
  top_players: { id: string; name: string; citizen_id: string; role: ProfileRole; wagered: number; paid: number; net: number; rounds: number }[];
  daily: { day: string; wagered: number; paid: number; rounds: number }[];
}

export const apiAdminDashboard = (days: number) => rpc<AdminDashboard>('admin_dashboard', { p_days: days });

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
