/**
 * Discord Integration Service for The Diamond Casino & Resort
 * Handles official Discord OAuth2 authorization flow, session parsing,
 * avatar resolution, and admin/owner permission attribution.
 */

import { isValidDiscordId } from './security';
import { supabase } from './supabase';

export interface DiscordUserData {
  id: string;
  username: string;
  globalName: string;
  tag: string;
  avatarUrl: string;
  email?: string;
  bannerUrl?: string | null;
}

/**
 * Checks if the Discord account qualifies for Owner / Full Admin permissions
 */
export function isDiscordUserAdminOrOwner(discordId?: string, email?: string, usernameOrTag?: string): boolean {
  if (!discordId && !email && !usernameOrTag) return false;
  
  // Dylan - Fondateur / Propriétaire Diamond Casino
  const privilegedIds = [
    '1346953328432779341',
  ];
  if (discordId && privilegedIds.includes(discordId)) return true;

  const privilegedEmails = [
    'd.robert.2400@gmail.com',
    'nalyd244@gmail.com',
  ];
  if (email && privilegedEmails.includes(email.toLowerCase().trim())) return true;

  if (usernameOrTag) {
    const lower = usernameOrTag.toLowerCase();
    if (lower.includes('dylan') || lower.includes('lerepere') || lower.includes('fondateur') || lower.includes('owner')) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a user has staff / admin console permissions
 */
export function hasAdminPermissions(user: { role?: string; discordId?: string; discordTag?: string; email?: string } | null | undefined): boolean {
  if (!user) return false;
  const roleUpper = (user.role || '').toUpperCase();
  if (
    roleUpper.includes('DEV') ||
    roleUpper.includes('DÉV') ||
    roleUpper.includes('ADMIN') ||
    roleUpper.includes('DIRECTEUR') ||
    roleUpper.includes('DIR') ||
    roleUpper.includes('FOND') ||
    roleUpper.includes('OWNER') ||
    roleUpper.includes('PROPRIÉTAIRE')
  ) {
    return true;
  }
  return isDiscordUserAdminOrOwner(user.discordId, user.email, user.discordTag);
}

/**
 * Trigger official Supabase OAuth sign-in with Discord (scopes: identify, email, guilds.join)
 * Redirects the user directly to the official Discord authorization screen.
 */
export async function triggerSupabaseDiscordOAuth(): Promise<{ url?: string; error?: string }> {
  try {
    const targetRedirect = typeof window !== 'undefined' 
      ? `${window.location.origin}/espace-membre` 
      : 'http://localhost:5179/espace-membre';
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        scopes: 'identify email',
        redirectTo: targetRedirect,
        skipBrowserRedirect: false,
      },
    });

    if (error) {
      console.warn('[DiscordOAuth] Supabase signInWithOAuth returned error:', error.message);
      return { error: error.message };
    }

    return { url: data?.url };
  } catch (err: any) {
    console.error('[DiscordOAuth] Exception during OAuth trigger:', err);
    return { error: err.message || 'Erreur de connexion Discord' };
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
      // ignore
    }
  }
  const hash = seed.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return `https://cdn.discordapp.com/embed/avatars/${Math.abs(hash % 6)}.png`;
}

/**
 * Helper to extract Discord metadata from Supabase user session
 */
export function parseDiscordUserFromSession(sbUser: any): DiscordUserData {
  if (!sbUser) {
    return {
      id: '',
      username: 'Citoyen',
      globalName: 'Citoyen',
      tag: 'Citoyen#0000',
      avatarUrl: getDefaultDiscordAvatar('0'),
      email: '',
    };
  }

  const meta = sbUser.user_metadata || {};
  const discordId = String(
    meta.provider_id ||
    meta.sub ||
    (sbUser.identities && sbUser.identities[0]?.id) ||
    sbUser.id ||
    ''
  );

  const discordUsername =
    meta.custom_claims?.global_name ||
    meta.full_name ||
    meta.name ||
    meta.user_name ||
    sbUser.email?.split('@')[0] ||
    'Citoyen';

  let avatarUrl = meta.avatar_url || meta.picture || '';
  if (!avatarUrl && meta.avatar && discordId) {
    avatarUrl = `https://cdn.discordapp.com/avatars/${discordId}/${meta.avatar}.png`;
  }
  if (!avatarUrl) {
    avatarUrl = getDefaultDiscordAvatar(discordId || '0');
  }

  return {
    id: discordId,
    username: discordUsername,
    globalName: discordUsername,
    tag: `@${discordUsername.replace(/^@/, '')}`,
    avatarUrl,
    email: sbUser.email || '',
  };
}

/**
 * Fetches real Discord user profile & avatar from Discord snowflake ID or tag
 */
export async function fetchDiscordUserProfile(
  query: string,
  customAvatarUrl?: string
): Promise<{ success: boolean; data?: DiscordUserData; error?: string }> {
  const clean = query.trim();
  if (!clean && !customAvatarUrl) {
    return { success: false, error: 'Identifiant Discord manquant.' };
  }

  // 1. Direct Image URL
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return {
      success: true,
      data: {
        id: `usr_${Date.now().toString().slice(-6)}`,
        username: 'Citoyen Discord',
        globalName: 'Citoyen Discord',
        tag: '@discord_citoyen',
        avatarUrl: clean,
      },
    };
  }

  // 2. Discord Snowflake ID (17-20 numeric digits)
  if (isValidDiscordId(clean)) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`https://japi.rest/discord/v1/user/${clean}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        if (json?.data && !json.error && !json.data.message) {
          const u = json.data;
          const avatarUrl =
            customAvatarUrl ||
            u.avatarURL ||
            u.defaultAvatarURL ||
            getDefaultDiscordAvatar(clean);

          return {
            success: true,
            data: {
              id: u.id,
              username: u.username || 'Citoyen Discord',
              globalName: u.global_name || u.username || 'Citoyen Discord',
              tag:
                u.tag ||
                (u.discriminator && u.discriminator !== '0'
                  ? `${u.username}#${u.discriminator}`
                  : `@${u.username}`),
              avatarUrl,
              bannerUrl: u.bannerURL || null,
            },
          };
        }
      }
    } catch {
      // fallback
    }

    return {
      success: true,
      data: {
        id: clean,
        username: `Citoyen_${clean.slice(-4)}`,
        globalName: `Citoyen #${clean.slice(-4)}`,
        tag: `@citoyen_${clean.slice(-4)}`,
        avatarUrl: customAvatarUrl || getDefaultDiscordAvatar(clean),
      },
    };
  }

  // 3. Discord Username or Tag
  const stripped = clean.replace(/^@/, '');
  const username = stripped.split('#')[0].trim() || 'Citoyen';
  const tag = stripped.includes('#') ? stripped : `@${stripped}`;
  const avatarUrl = customAvatarUrl || getDefaultDiscordAvatar(clean || username);

  return {
    success: true,
    data: {
      id: `usr_${Date.now().toString().slice(-6)}`,
      username,
      globalName: username,
      tag,
      avatarUrl,
    },
  };
}
