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
  chips: number;
  cash: number;
  total_won: number | null;
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
  MAINTENANCE: 'La roue est suspendue pour maintenance.',
  WHEEL_NOT_CONFIGURED: 'La roue n’est pas encore configurée par la direction.',
  VIP_ALREADY_ACTIVE: 'Cette carte VIP est déjà active sur votre compte.',
  VIP_REQUEST_PENDING: 'Une demande VIP est déjà en attente de validation.',
  FORBIDDEN: 'Action réservée à la gérance.',
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
  profile: ProfilePayload;
}

export const apiSpinWheel = () => rpc<SpinResult>('spin_wheel');

export const apiRequestVip = (tier: VipTier) => rpc<{ status: string; tier: VipTier }>('request_vip', { p_tier: tier });

export const apiRecentWheelWins = (limit = 8) => rpc<WheelWin[]>('recent_wheel_wins', { p_limit: limit });

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
// Settings (public read, staff write)
// -------------------------------------------------------------

export async function dbGetSetting<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase.from('casino_settings').select('value').eq('key', key).maybeSingle();
  if (error || !data) return null;
  return data.value as T;
}

export async function dbSetSetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabase
    .from('casino_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw toApiError(error);
}

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

export async function dbAddAdminLog(log: Omit<SupabaseAdminLog, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('admin_logs').insert({
    action: log.action,
    category: log.category,
    detail: log.detail,
    author: log.author || 'Console Admin',
  });
  if (error) console.warn('[Supabase] admin log refused:', error.message);
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

export const apiAdminAdjustBalance = (profileId: string, chipsDelta: number, cashDelta: number, reason?: string) =>
  rpc<SupabaseProfile>('admin_adjust_balance', {
    p_profile_id: profileId,
    p_chips_delta: Math.trunc(chipsDelta),
    p_cash_delta: Math.trunc(cashDelta),
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
