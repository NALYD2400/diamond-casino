/**
 * Discord Integration Service for The Diamond Casino & Resort
 * Discord OAuth2 through Supabase Auth, session parsing and avatar resolution.
 *
 * Permissions are NOT derived from Discord data: staff roles live in
 * public.profiles.role and are enforced server-side (RLS + SQL functions).
 */

import type { User } from '@supabase/supabase-js';
import { isValidDiscordId } from './security';
import { supabase, STAFF_ROLES } from './supabase';

export interface DiscordUserData {
  id: string;
  username: string;
  globalName: string;
  tag: string;
  avatarUrl: string;
  email?: string;
}

/**
 * UI-only check used to show or hide staff screens.
 * The database refuses every staff action from non-staff accounts anyway.
 */
export function hasAdminPermissions(user: { role?: string; isStaff?: boolean } | null | undefined): boolean {
  if (!user) return false;
  if (user.isStaff) return true;
  return STAFF_ROLES.includes((user.role || '') as (typeof STAFF_ROLES)[number]);
}

/**
 * Redirects to the official Discord authorization screen via Supabase Auth.
 */
export async function triggerSupabaseDiscordOAuth(): Promise<{ error?: string }> {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        scopes: 'identify email',
        redirectTo: `${window.location.origin}/espace-membre`,
      },
    });
    return error ? { error: error.message } : {};
  } catch (err) {
    return { error: (err as Error)?.message || 'Erreur de connexion Discord' };
  }
}

/**
 * Computes a deterministic default Discord avatar (0..5)
 */
export function getDefaultDiscordAvatar(seed: string): string {
  if (isValidDiscordId(seed)) {
    try {
      const idx = Number((BigInt(seed) >> 22n) % 6n);
      return `https://cdn.discordapp.com/embed/avatars/${Math.abs(idx)}.png`;
    } catch {
      // fall through to the hash below
    }
  }
  const hash = (seed || '0').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return `https://cdn.discordapp.com/embed/avatars/${Math.abs(hash % 6)}.png`;
}

/**
 * Extracts Discord metadata from a Supabase auth user (display purposes only).
 */
export function parseDiscordUserFromSession(sbUser: User | null | undefined): DiscordUserData {
  if (!sbUser) {
    return {
      id: '',
      username: 'Citoyen',
      globalName: 'Citoyen',
      tag: '@citoyen',
      avatarUrl: getDefaultDiscordAvatar('0'),
      email: '',
    };
  }

  const meta = (sbUser.user_metadata || {}) as Record<string, any>;
  const discordIdentity = sbUser.identities?.find((i) => i.provider === 'discord');
  const discordId = String(meta.provider_id || discordIdentity?.id || meta.sub || '');

  const username: string =
    meta.custom_claims?.global_name ||
    meta.full_name ||
    meta.name ||
    meta.user_name ||
    sbUser.email?.split('@')[0] ||
    'Citoyen';

  const avatarUrl: string = meta.avatar_url || meta.picture || getDefaultDiscordAvatar(discordId || '0');

  return {
    id: discordId,
    username,
    globalName: username,
    tag: `@${username.replace(/^@/, '')}`,
    avatarUrl,
    email: sbUser.email || '',
  };
}
