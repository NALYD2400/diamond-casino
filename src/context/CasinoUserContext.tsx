import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { sanitizeText } from '../lib/security';
import {
  supabase,
  apiGetMyProfile,
  apiRegisterProfile,
  apiUpdateMyProfile,
  apiSpinWheel,
  apiRequestVip,
  dbFetchTransactions,
  dbFetchMyRewards,
  apiClaimReward,
  type PlayerReward,
  type ProfilePayload,
  type ProfileRole,
  type SupabaseTransaction,
  type VipTier,
} from '../lib/supabase';
import { parseDiscordUserFromSession, triggerSupabaseDiscordOAuth, type DiscordUserData } from '../lib/discord';

export type UserRole = ProfileRole;
export type { VipTier };

export interface CasinoTransaction {
  id: string;
  type: 'spin_reward' | 'vip_subscription' | 'vip_request' | 'deposit' | 'withdrawal' | 'bet' | 'bonus' | 'admin';
  label: string;
  amountChips: number;
  date: string; // ISO date string
  status: 'COMPLÉTÉ' | 'EN ATTENTE' | 'ANNULÉ';
  category: 'Roue de la Fortune' | 'Abonnement VIP' | 'Caisse Casino' | 'Jeux';
  vipTier?: VipTier;
}

export interface CasinoUser {
  id: string; // profile uuid
  discordId: string;
  discordTag: string;
  avatarUrl: string;
  rpFirstName: string;
  rpLastName: string;
  citizenId: string;
  phoneNumber: string;
  role: UserRole;
  isStaff: boolean;
  chips: number;
  isDiscordSynced: boolean;
  vipTier?: VipTier;
  lastWheelSpin: number | null; // ms timestamp
  nextSpinAt: number | null; // ms timestamp
  cooldownHours: number;
  inventory: string[];
  vehicles: string[];
  transactions: CasinoTransaction[];
  /** Non-currency prizes (vehicles, items) and their delivery status */
  rewards: PlayerReward[];
  joinedAt?: string;
  totalWon: number;
  totalSpins: number;
}

export interface SpinOutcome {
  segmentIndex: number;
  segment: Record<string, unknown>;
  /** Applies the new balance to the UI — call it once the wheel animation is over. */
  commit: () => void;
}

interface CasinoUserContextType {
  user: CasinoUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  pendingDiscordUser: DiscordUserData | null;
  pendingVipTier: VipTier | null;
  loginWithDiscordOAuth: () => Promise<void>;
  completeRPRegistration: (data: {
    rpFirstName: string;
    rpLastName: string;
    citizenId: string;
    phoneNumber?: string;
  }) => Promise<void>;
  cancelPendingDiscord: () => void;
  logout: () => Promise<void>;
  updateProfile: (data: {
    rpFirstName: string;
    rpLastName: string;
    citizenId: string;
    phoneNumber?: string;
  }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  spinWheel: () => Promise<SpinOutcome>;
  requestVip: (tier: VipTier) => Promise<void>;
  claimReward: (rewardId: string) => Promise<void>;
  canSpinWheel: boolean;
  timeUntilNextSpin: string;
}

const TX_TYPE_MAP: Record<SupabaseTransaction['type'], Pick<CasinoTransaction, 'type' | 'category'>> = {
  WHEEL: { type: 'spin_reward', category: 'Roue de la Fortune' },
  VIP_REQUEST: { type: 'vip_request', category: 'Abonnement VIP' },
  VIP_REWARD: { type: 'vip_subscription', category: 'Abonnement VIP' },
  ADMIN_ADJUST: { type: 'admin', category: 'Caisse Casino' },
  DEPOSIT: { type: 'deposit', category: 'Caisse Casino' },
  WITHDRAW: { type: 'withdrawal', category: 'Caisse Casino' },
  BET: { type: 'bet', category: 'Jeux' },
  WIN: { type: 'bonus', category: 'Jeux' },
};

export function mapTransaction(tx: SupabaseTransaction): CasinoTransaction {
  const mapped = TX_TYPE_MAP[tx.type] || { type: 'admin', category: 'Caisse Casino' };
  return {
    id: tx.id,
    ...mapped,
    label: tx.description || 'Opération casino',
    amountChips: Number(tx.chips) || 0,
    date: tx.created_at,
    status: tx.status === 'PENDING' ? 'EN ATTENTE' : tx.status === 'CANCELLED' ? 'ANNULÉ' : 'COMPLÉTÉ',
    vipTier: tx.type === 'VIP_REQUEST' ? ((tx.game as VipTier) || undefined) : undefined,
  };
}

function mapProfile(p: ProfilePayload, transactions: CasinoTransaction[], rewards: PlayerReward[]): CasinoUser {
  return {
    id: p.id,
    discordId: p.discord_id || '',
    discordTag: p.discord_tag ? `@${p.discord_tag.replace(/^@/, '')}` : '',
    avatarUrl: p.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png',
    rpFirstName: p.rp_first_name,
    rpLastName: p.rp_last_name,
    citizenId: p.citizen_id,
    phoneNumber: p.phone_number || '',
    role: p.role,
    isStaff: !!p.is_staff,
    chips: Number(p.chips) || 0,
    isDiscordSynced: !!p.discord_id,
    vipTier: p.vip_tier || undefined,
    lastWheelSpin: p.last_wheel_spin ? new Date(p.last_wheel_spin).getTime() : null,
    nextSpinAt: p.next_spin_at ? new Date(p.next_spin_at).getTime() : null,
    cooldownHours: Number(p.cooldown_hours) || 24,
    inventory: Array.isArray(p.inventory) ? p.inventory : [],
    vehicles: Array.isArray(p.vehicles) ? p.vehicles : [],
    transactions,
    rewards,
    joinedAt: p.created_at || undefined,
    totalWon: Number(p.total_won) || 0,
    totalSpins: Number(p.total_spins) || 0,
  };
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

// Keys written by previous versions, which stored balances/roles in the browser
function purgeLegacyStorage() {
  try {
    const keep = new Set(['diamond_wheel_sound_muted']);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('diamond_') && !keep.has(key)) localStorage.removeItem(key);
    }
  } catch {
    // storage unavailable
  }
}

const CasinoUserContext = createContext<CasinoUserContextType | undefined>(undefined);

export const CasinoUserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CasinoUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [pendingDiscordUser, setPendingDiscordUser] = useState<DiscordUserData | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const loadSeq = useRef(0);

  const loadTransactions = useCallback(async (profileId: string) => {
    try {
      const [rows, rewards] = await Promise.all([dbFetchTransactions(profileId, 50), dbFetchMyRewards(profileId)]);
      setUser((prev) =>
        prev && prev.id === profileId ? { ...prev, transactions: rows.map(mapTransaction), rewards } : prev,
      );
    } catch (err) {
      console.warn('[CasinoUser] history unavailable:', err);
    }
  }, []);

  const applyProfile = useCallback(
    (profile: ProfilePayload) => {
      setUser((prev) =>
        mapProfile(
          profile,
          prev && prev.id === profile.id ? prev.transactions : [],
          prev && prev.id === profile.id ? prev.rewards : [],
        ),
      );
      setPendingDiscordUser(null);
      void loadTransactions(profile.id);
    },
    [loadTransactions],
  );

  const loadSession = useCallback(
    async (sbUser: User | null) => {
      const seq = ++loadSeq.current;
      if (!sbUser) {
        setUser(null);
        setPendingDiscordUser(null);
        setIsLoading(false);
        return;
      }
      try {
        const profile = await apiGetMyProfile();
        if (seq !== loadSeq.current) return;
        setAuthError(null);
        if (profile) {
          applyProfile(profile);
        } else {
          setUser(null);
          setPendingDiscordUser(parseDiscordUserFromSession(sbUser));
        }
      } catch (err) {
        if (seq !== loadSeq.current) return;
        setAuthError((err as Error).message);
      } finally {
        if (seq === loadSeq.current) setIsLoading(false);
      }
    },
    [applyProfile],
  );

  useEffect(() => {
    purgeLegacyStorage();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return;
      // Defer: calling Supabase from inside this callback can deadlock the auth client
      setTimeout(() => void loadSession(session?.user ?? null), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [loadSession]);

  // Countdown clock — only ticks while a cooldown is running
  const nextSpinAt = user?.nextSpinAt ?? null;
  useEffect(() => {
    setNow(Date.now());
    if (!nextSpinAt || nextSpinAt <= Date.now()) return;
    const interval = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= nextSpinAt) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [nextSpinAt]);

  const canSpinWheel = !!user && (!nextSpinAt || nextSpinAt <= now);
  const timeUntilNextSpin = !user ? '' : canSpinWheel ? 'Disponible' : formatCountdown((nextSpinAt || 0) - now);

  const pendingVipTier = useMemo<VipTier | null>(() => {
    const pending = user?.transactions.find((tx) => tx.type === 'vip_request' && tx.status === 'EN ATTENTE');
    return pending?.vipTier ?? null;
  }, [user?.transactions]);

  const loginWithDiscordOAuth = useCallback(async () => {
    setAuthError(null);
    const res = await triggerSupabaseDiscordOAuth();
    if (res.error) {
      setAuthError(res.error);
      throw new Error(res.error);
    }
  }, []);

  const cancelPendingDiscord = useCallback(() => {
    setPendingDiscordUser(null);
    supabase.auth.signOut().catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    loadSeq.current++;
    setUser(null);
    setPendingDiscordUser(null);
    await supabase.auth.signOut().catch(() => {});
  }, []);

  const completeRPRegistration = useCallback<CasinoUserContextType['completeRPRegistration']>(
    async (data) => {
      const profile = await apiRegisterProfile({
        firstName: sanitizeText(data.rpFirstName, 25),
        lastName: sanitizeText(data.rpLastName, 25),
        citizenId: sanitizeText(data.citizenId, 12),
        phone: sanitizeText(data.phoneNumber || '', 20),
      });
      applyProfile(profile);
    },
    [applyProfile],
  );

  const updateProfile = useCallback<CasinoUserContextType['updateProfile']>(
    async (data) => {
      const profile = await apiUpdateMyProfile({
        firstName: sanitizeText(data.rpFirstName, 25),
        lastName: sanitizeText(data.rpLastName, 25),
        citizenId: sanitizeText(data.citizenId, 12),
        phone: sanitizeText(data.phoneNumber || '', 20),
      });
      applyProfile(profile);
    },
    [applyProfile],
  );

  const refreshProfile = useCallback(async () => {
    const profile = await apiGetMyProfile();
    if (profile) applyProfile(profile);
  }, [applyProfile]);

  const spinWheel = useCallback(async (): Promise<SpinOutcome> => {
    const result = await apiSpinWheel();
    let committed = false;
    return {
      segmentIndex: result.segment_index,
      segment: result.segment,
      commit: () => {
        if (committed) return;
        committed = true;
        applyProfile(result.profile);
      },
    };
  }, [applyProfile]);

  const requestVip = useCallback(
    async (tier: VipTier) => {
      await apiRequestVip(tier);
      if (user) await loadTransactions(user.id);
    },
    [user, loadTransactions],
  );

  const claimReward = useCallback(
    async (rewardId: string) => {
      await apiClaimReward(rewardId);
      if (user) await loadTransactions(user.id);
    },
    [user, loadTransactions],
  );

  const value = useMemo<CasinoUserContextType>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      authError,
      pendingDiscordUser,
      pendingVipTier,
      loginWithDiscordOAuth,
      completeRPRegistration,
      cancelPendingDiscord,
      logout,
      updateProfile,
      refreshProfile,
      spinWheel,
      requestVip,
      claimReward,
      canSpinWheel,
      timeUntilNextSpin,
    }),
    [
      user,
      isLoading,
      authError,
      pendingDiscordUser,
      pendingVipTier,
      loginWithDiscordOAuth,
      completeRPRegistration,
      cancelPendingDiscord,
      logout,
      updateProfile,
      refreshProfile,
      spinWheel,
      requestVip,
      claimReward,
      canSpinWheel,
      timeUntilNextSpin,
    ],
  );

  return <CasinoUserContext.Provider value={value}>{children}</CasinoUserContext.Provider>;
};

export const useCasinoUser = (): CasinoUserContextType => {
  const context = useContext(CasinoUserContext);
  if (!context) {
    throw new Error('useCasinoUser must be used within a CasinoUserProvider');
  }
  return context;
};
