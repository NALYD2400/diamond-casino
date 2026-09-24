import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || 
  'https://njnznzgcjsdomahviukl.supabase.co';

export const SUPABASE_ANON_KEY = 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || 
  'sb_publishable_COqb4-9k3vwQUTj6vu_eyw_uuWGps01';

// Single official Supabase client for The Diamond Casino & Resort
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Alias for backwards compatibility
export const casinoDb = supabase;

export interface SupabaseProfile {
  id?: string;
  user_id?: string;
  discord_id?: string;
  full_name?: string;
  rp_name?: string;
  rp_first_name?: string;
  rp_last_name?: string;
  citizen_id?: string;
  identifier?: string;
  role?: string;
  vip_level?: string;
  chips?: number;
  chips_balance?: number;
  cash?: number;
  cash_balance?: number;
  total_wagered?: number;
  total_won?: number;
  avatar_url?: string;
  phone_number?: string;
  email?: string;
  vehicles?: string[];
  inventory?: string[];
  last_wheel_spin?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SupabaseAdminLog {
  id?: string;
  action: string;
  category: 'WHEEL' | 'ECONOMY' | 'CITIZEN' | 'SYSTEM';
  detail: string;
  author: string;
  created_at?: string;
}

export interface SupabaseJackpot {
  id: string;
  current_amount: number;
  seed_amount: number;
  last_winner_name?: string | null;
  last_win_amount?: number | null;
  last_win_date?: string | null;
  updated_at?: string;
}

// -------------------------------------------------------------
// Database Helpers for The Diamond Casino & Resort
// -------------------------------------------------------------

/**
 * Searches for a profile by Discord Snowflake ID, Citizen ID, or UUID
 */
export async function dbGetProfile(identifier: string): Promise<SupabaseProfile | null> {
  if (!identifier) return null;
  try {
    // 1. Search by discord_id
    const { data: byDiscord } = await supabase
      .from('profiles')
      .select('*')
      .eq('discord_id', identifier)
      .maybeSingle();

    if (byDiscord) return byDiscord;

    // 2. Search by citizen_id
    const { data: byCitizen } = await supabase
      .from('profiles')
      .select('*')
      .eq('citizen_id', identifier)
      .maybeSingle();

    if (byCitizen) return byCitizen;

    // 3. Search by identifier column
    const { data: byIdent } = await supabase
      .from('profiles')
      .select('*')
      .eq('identifier', identifier)
      .maybeSingle();

    if (byIdent) return byIdent;

    // 4. Search by primary UUID id
    const { data: byId } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', identifier)
      .maybeSingle();

    if (byId) return byId;

    return null;
  } catch (err) {
    console.warn('[Supabase] dbGetProfile fetch warning:', err);
    return null;
  }
}

/**
 * Searches explicitly by Discord ID
 */
export async function dbGetProfileByDiscord(discordId: string): Promise<SupabaseProfile | null> {
  if (!discordId) return null;
  return dbGetProfile(discordId);
}

/**
 * Robust upsert into profiles table, persisting cleanly in Supabase
 */
export async function dbUpsertProfile(profile: SupabaseProfile): Promise<SupabaseProfile | null> {
  try {
    const fullRpName = 
      profile.full_name || 
      profile.rp_name || 
      `${profile.rp_first_name || ''} ${profile.rp_last_name || ''}`.trim();
    
    const formattedWithId = 
      profile.citizen_id 
        ? `${fullRpName} | #${profile.citizen_id}` 
        : fullRpName;

    const chipsAmount = profile.chips ?? profile.chips_balance ?? 10000;
    const cashAmount = profile.cash ?? profile.cash_balance ?? 30000;

    let targetDiscordId = profile.discord_id;
    let targetProfileId = profile.id;

    // If discord_id is missing, check if an existing profile exists for this citizen_id or identifier
    if (!targetDiscordId && (profile.citizen_id || profile.identifier)) {
      const ident = profile.citizen_id || profile.identifier || '';
      const existing = await dbGetProfile(ident);
      if (existing) {
        targetDiscordId = existing.discord_id;
        targetProfileId = existing.id;
      } else {
        targetDiscordId = ident.length >= 17 && /^\d+$/.test(ident) ? ident : `fivem_${ident}`;
      }
    }

    const payload: any = {
      ...profile,
      discord_id: targetDiscordId,
      id: targetProfileId || undefined,
      rp_first_name: profile.rp_first_name || (fullRpName ? fullRpName.split(' ')[0] : 'Citoyen'),
      rp_last_name: profile.rp_last_name || (fullRpName ? fullRpName.split(' ').slice(1).join(' ') || 'RP' : 'RP'),
      citizen_id: profile.citizen_id || profile.identifier || '0000',
      role: profile.role || profile.vip_level || 'MEMBRE',
      vip_level: profile.vip_level || profile.role || 'MEMBRE',
      full_name: formattedWithId,
      rp_name: fullRpName,
      chips: chipsAmount,
      chips_balance: chipsAmount,
      cash: cashAmount,
      cash_balance: cashAmount,
      updated_at: new Date().toISOString(),
    };

    const conflictTarget = payload.discord_id ? 'discord_id' : 'id';
    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: conflictTarget })
      .select()
      .maybeSingle();

    if (!error && data) {
      return data;
    }

    if (error) {
      console.warn('[Supabase] dbUpsertProfile upsert error:', error.message);
    }

    return payload;
  } catch (err) {
    console.warn('[Supabase] dbUpsertProfile warning:', err);
    return null;
  }
}

export async function dbRecordSpinBet(params: {
  identifier: string;
  segmentLabel: string;
  rewardType: string;
  rewardValue: number | string;
}): Promise<void> {
  try {
    const betRecord = {
      game_id: 'lucky_wheel',
      bet_amount: 0,
      win_amount: typeof params.rewardValue === 'number' ? params.rewardValue : 0,
      multiplier: 1.0,
      result_data: {
        segment: params.segmentLabel,
        type: params.rewardType,
        value: params.rewardValue,
        identifier: params.identifier,
        timestamp: new Date().toISOString(),
      },
    };

    await supabase.from('bets_history').insert(betRecord);
  } catch (err) {
    console.warn('[Supabase] Failed to record bet:', err);
  }
}

export interface SupabaseBetEntry {
  id?: string;
  game_id: string;
  bet_amount: number;
  win_amount: number;
  multiplier?: number;
  result_data?: {
    segment?: string;
    type?: string;
    value?: number | string;
    identifier?: string;
    timestamp?: string;
    [key: string]: any;
  };
  created_at?: string;
}

export async function dbFetchBetsHistory(identifier?: string, limit = 50): Promise<SupabaseBetEntry[]> {
  try {
    const { data, error } = await supabase
      .from('bets_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    if (!identifier) return data;

    const cleanIdent = identifier.trim().toLowerCase();
    if (!cleanIdent) return data;

    return data.filter((b: any) => {
      const bIdent = String(b.result_data?.identifier || b.user_id || '').trim().toLowerCase();
      if (!bIdent) return false;
      return bIdent === cleanIdent || bIdent.includes(cleanIdent);
    });
  } catch {
    return [];
  }
}

export async function dbAddAdminLog(log: Omit<SupabaseAdminLog, 'id' | 'created_at'>): Promise<void> {
  try {
    const logRecord = {
      action: log.action,
      category: log.category,
      detail: log.detail,
      author: log.author || 'Console Admin',
      created_at: new Date().toISOString(),
    };

    await supabase.from('admin_logs').insert(logRecord);
  } catch (err) {
    console.warn('[Supabase] Failed to record admin log:', err);
  }
}

export async function dbFetchAdminLogs(limit = 50): Promise<SupabaseAdminLog[]> {
  try {
    const { data, error } = await supabase
      .from('admin_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function dbGetSetting<T = any>(key: string): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('casino_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error || !data) return null;
    return data.value as T;
  } catch {
    return null;
  }
}

export async function dbSetSetting(key: string, value: any): Promise<void> {
  try {
    await supabase.from('casino_settings').upsert({
      key,
      value,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[Supabase] Failed to save setting:', err);
  }
}

export async function dbFetchProfiles(limit = 100): Promise<SupabaseProfile[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data) return data;
    return [];
  } catch {
    return [];
  }
}

export async function dbDeleteProfile(identifier: string): Promise<boolean> {
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    if (isUuid) {
      const { error } = await supabase.from('profiles').delete().eq('id', identifier);
      return !error;
    }

    const { error } = await supabase
      .from('profiles')
      .delete()
      .or(`discord_id.eq.${identifier},citizen_id.eq.${identifier},identifier.eq.${identifier}`);

    return !error;
  } catch {
    return false;
  }
}

export interface SupabaseHealthResult {
  online: boolean;
  latencyMs: number;
  version?: string;
  error?: string;
}

export async function dbCheckHealth(): Promise<SupabaseHealthResult> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - start);

    if (res.ok) {
      const data = await res.json();
      return {
        online: true,
        latencyMs,
        version: data.version || 'v2',
      };
    }
    return {
      online: false,
      latencyMs,
      error: `HTTP ${res.status}`,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      online: false,
      latencyMs,
      error: err?.name === 'AbortError' ? 'Timeout' : 'Erreur réseau',
    };
  }
}
