import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { sanitizeText, safeJsonParse, isValidCitizenId, isValidRPName } from '../lib/security';
import { dbUpsertProfile, dbRecordSpinBet, dbGetProfile, supabase, type SupabaseProfile } from '../lib/supabase';
import { 
  getDefaultDiscordAvatar, 
  parseDiscordUserFromSession, 
  isDiscordUserAdminOrOwner, 
  triggerSupabaseDiscordOAuth,
  type DiscordUserData 
} from '../lib/discord';

export type UserRole =
  | 'DÉVELOPPEUR'
  | 'DIRECTEUR CASINO'
  | 'VIP DIAMOND'
  | 'HIGH ROLLER'
  | 'MEMBRE'
  | 'MEMBRE CITOYEN VIP';

export interface CasinoTransaction {
  id: string;
  type: 'spin_reward' | 'vip_subscription' | 'deposit' | 'withdrawal' | 'bet' | 'bonus' | 'transfer';
  label: string;
  amountChips?: number;
  amountCash?: number;
  date: string; // ISO date string
  status: 'COMPLÉTÉ' | 'EN ATTENTE' | 'CONFIRMÉ';
  category: 'Roue de la Fortune' | 'Abonnement VIP' | 'Caisse Casino' | 'Bonus' | 'Jeux';
}

export interface CasinoUser {
  id: string;
  discordId: string;
  discordTag: string;
  avatarUrl: string;
  rpFirstName: string;
  rpLastName: string;
  citizenId: string;
  phoneNumber: string;
  role: UserRole;
  chips: number;
  cash: number;
  isDiscordSynced: boolean;
  vipTier?: 'SILVER' | 'GOLD' | 'DIAMOND';
  lastWheelSpin: number | null; // Timestamp in ms
  inventory: string[];
  transactions: CasinoTransaction[];
  joinedAt?: string;
  totalWon?: number;
  totalSpins?: number;
}

interface CasinoUserContextType {
  user: CasinoUser | null;
  isAuthenticated: boolean;
  pendingDiscordUser: DiscordUserData | null;
  loginWithDiscordOAuth: () => Promise<void>;
  completeRPRegistration: (data: {
    rpFirstName: string;
    rpLastName: string;
    citizenId: string;
    phoneNumber?: string;
  }) => Promise<void>;
  cancelPendingDiscord: () => void;
  loginWithDiscord: (preset?: Partial<CasinoUser>) => void;
  loginWithCitizenId: (citizenId: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (data: {
    rpFirstName?: string;
    rpLastName?: string;
    citizenId?: string;
    phoneNumber?: string;
    avatarUrl?: string;
    discordTag?: string;
    discordId?: string;
    role?: UserRole;
  }) => void;
  syncDiscordRoles: () => void;
  syncDiscordProfile: (discordId: string, discordTag: string, avatarUrl: string) => void;
  subscribeVipTier: (tier: 'SILVER' | 'GOLD' | 'DIAMOND') => void;
  claimWheelReward: (reward: {
    type: 'chips' | 'cash' | 'vehicle' | 'mystery' | 'clothing';
    value: number | string;
    label: string;
  }) => void;
  canSpinWheel: boolean;
  timeUntilNextSpin: string;
  resetSpinCooldown: () => void;
  addTransaction: (tx: Omit<CasinoTransaction, 'id' | 'date'>) => void;
}

const STORAGE_KEY = 'diamond_casino_user_v3';

const INITIAL_TRANSACTIONS: CasinoTransaction[] = [];

const DEFAULT_USER: CasinoUser = {
  id: 'usr_new',
  discordId: '',
  discordTag: 'Citoyen#0000',
  avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
  rpFirstName: '',
  rpLastName: '',
  citizenId: '',
  phoneNumber: '',
  role: 'MEMBRE',
  chips: 0,
  cash: 0,
  isDiscordSynced: false,
  lastWheelSpin: null,
  inventory: [],
  transactions: [],
  joinedAt: new Date().toISOString(),
  totalWon: 0,
  totalSpins: 0,
};

// Strips any obsolete Nitro / Booster items from inventory
function sanitizeInventory(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (item): item is string =>
      typeof item === 'string' &&
      !item.toLowerCase().includes('nitro') &&
      !item.toLowerCase().includes('booster')
  );
}

const KNOWN_DISCORD_PROFILES_KEY = 'diamond_casino_known_discord_profiles_v1';

export function getKnownDiscordProfile(discordId: string): Partial<CasinoUser> | null {
  if (!discordId) return null;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KNOWN_DISCORD_PROFILES_KEY) : null;
    const map = safeJsonParse<Record<string, Partial<CasinoUser>>>(raw, {});
    return map[discordId] || null;
  } catch {
    return null;
  }
}

export function saveKnownDiscordProfile(discordId: string, profile: Partial<CasinoUser>): void {
  if (!discordId || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(KNOWN_DISCORD_PROFILES_KEY);
    const map = safeJsonParse<Record<string, Partial<CasinoUser>>>(raw, {}) || {};
    map[discordId] = {
      ...map[discordId],
      ...profile,
      discordId,
    };
    localStorage.setItem(KNOWN_DISCORD_PROFILES_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

const CasinoUserContext = createContext<CasinoUserContextType | undefined>(undefined);

export const CasinoUserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CasinoUser | null>(() => {
    try {
      localStorage.removeItem('diamond_casino_user_v1');
      localStorage.removeItem('diamond_casino_user_v2');
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = safeJsonParse<any>(saved, null);
      if (parsed && parsed.rpFirstName && parsed.citizenId) {
        const cleanTransactions = (Array.isArray(parsed.transactions) ? parsed.transactions : [])
          .filter((tx: any) => {
            const lbl = (tx?.label || '').toLowerCase();
            return !lbl.includes('bienvenue') && 
                   !lbl.includes('bonus d\'accueil') && 
                   !lbl.includes('ouverture de compte') && 
                   !lbl.includes('reconnexion') &&
                   !lbl.includes('synchronisation cloud') &&
                   !lbl.includes('synchronisation compte') &&
                   !lbl.includes('boost') &&
                   !lbl.includes('goal');
          });

        const isOwner = parsed.role === 'DÉVELOPPEUR';
        let safeChips = typeof parsed.chips === 'number' ? parsed.chips : 0;
        // Purge legacy fake initial 10,000 / 5,000 grant if not won via wheel / games
        if (!isOwner && (safeChips === 10000 || safeChips === 5000) && (!parsed.totalWon || parsed.totalWon === 0) && cleanTransactions.length === 0) {
          safeChips = 0;
        }

        return {
          ...DEFAULT_USER,
          ...parsed,
          chips: safeChips,
          cash: 0,
          inventory: sanitizeInventory(parsed.inventory),
          transactions: cleanTransactions,
          joinedAt: parsed.joinedAt || new Date().toISOString(),
          totalWon: parsed.totalWon ?? 0,
          totalSpins: parsed.totalSpins ?? 0,
        };
      }
      return null;
    } catch {
      return null;
    }
  });

  const [pendingDiscordUser, setPendingDiscordUser] = useState<DiscordUserData | null>(null);
  const [timeUntilNextSpin, setTimeUntilNextSpin] = useState<string>('');
  const [canSpinWheel, setCanSpinWheel] = useState<boolean>(true);

  // Sync to local storage & Supabase on user changes
  useEffect(() => {
    if (user && user.rpFirstName && user.citizenId) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      if (user.discordId) {
        saveKnownDiscordProfile(user.discordId, user);
      }

      // Asynchronously upsert to Supabase
      const identifier = user.citizenId || user.id;
      dbUpsertProfile({
        identifier,
        discord_id: user.discordId,
        rp_first_name: user.rpFirstName,
        rp_last_name: user.rpLastName,
        citizen_id: user.citizenId,
        rp_name: `${user.rpFirstName} ${user.rpLastName}`.trim(),
        full_name: `${user.rpFirstName} ${user.rpLastName} | #${user.citizenId}`,
        vip_level: user.vipTier ? `VIP ${user.vipTier}` : user.role,
        role: user.role === 'DÉVELOPPEUR' ? 'owner' : (user.role || 'client'),
        chips: user.chips,
        chips_balance: user.chips,
        cash: user.cash,
        cash_balance: user.cash,
        phone_number: user.phoneNumber,
        avatar_url: user.avatarUrl,
        inventory: user.inventory,
        last_wheel_spin: user.lastWheelSpin ? new Date(user.lastWheelSpin).toISOString() : null,
      }).catch((err) => {
        console.warn('[CasinoUserContext] Supabase profile sync fallback:', err);
      });
    } else if (!user) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  // Supabase Auth listener: captures Discord OAuth session on callback / sign-in
  useEffect(() => {
    const handleAuthUser = async (sbUser: any) => {
      if (!sbUser) return;
      const discordData = parseDiscordUserFromSession(sbUser);
      const discordId = discordData.id;

      if (!discordId) return;

      // Check if this Discord user already has an RP profile in Supabase or local persistent registry
      try {
        let cloudProfile = await dbGetProfile(discordId);
        if (!cloudProfile && sbUser.id) {
          cloudProfile = await dbGetProfile(sbUser.id);
        }

        const cachedLocal = getKnownDiscordProfile(discordId);

        let existingFirst = cloudProfile?.rp_first_name || cachedLocal?.rpFirstName || '';
        let existingLast = cloudProfile?.rp_last_name || cachedLocal?.rpLastName || '';
        let existingCitizenId = cloudProfile?.citizen_id || cloudProfile?.identifier || cachedLocal?.citizenId || '';

        // Extract from full_name format: "FirstName LastName | #CitizenId"
        if ((!existingFirst || !existingCitizenId) && cloudProfile?.full_name) {
          const fn = cloudProfile.full_name;
          if (fn.includes('|')) {
            const parts = fn.split('|');
            const nameParts = parts[0].trim().split(' ');
            existingFirst = nameParts[0] || '';
            existingLast = nameParts.slice(1).join(' ') || '';
            existingCitizenId = parts[1].replace('#', '').trim();
          } else if (cloudProfile.rp_name) {
            const nameParts = cloudProfile.rp_name.trim().split(' ');
            existingFirst = nameParts[0] || '';
            existingLast = nameParts.slice(1).join(' ') || '';
          }
        }

        const isOwner = 
          isDiscordUserAdminOrOwner(discordId, sbUser.email, discordData.tag) ||
          cloudProfile?.role === 'owner' ||
          cloudProfile?.role === 'admin' ||
          cloudProfile?.role === 'DÉVELOPPEUR' ||
          cloudProfile?.vip_level?.includes('PROPRIÉTAIRE') ||
          cachedLocal?.role === 'DÉVELOPPEUR';

        // BRANCH 1 : Compte existant -> Reconnexion immédiate automatique sans rien redemander !
        if (existingFirst && existingCitizenId) {
          const assignedRole: UserRole = isOwner ? 'DÉVELOPPEUR' : ((cloudProfile?.role as UserRole) || (cloudProfile?.vip_level as UserRole) || cachedLocal?.role || 'MEMBRE');
          let chipsAmount = cloudProfile?.chips ?? cloudProfile?.chips_balance ?? cachedLocal?.chips ?? (isOwner ? 500000 : 0);
          if (!isOwner && (chipsAmount === 10000 || chipsAmount === 5000)) {
            const hasRealGains = (cachedLocal?.totalWon || 0) > 0 || (cachedLocal?.transactions || []).some((tx: any) => tx.type === 'spin_reward');
            if (!hasRealGains) {
              chipsAmount = 0;
            }
          }

          const existingTx = (cachedLocal?.transactions || []).filter((tx: any) => {
            const lbl = (tx?.label || '').toLowerCase();
            return !lbl.includes('bienvenue') && 
                   !lbl.includes('bonus d\'accueil') && 
                   !lbl.includes('ouverture de compte') && 
                   !lbl.includes('reconnexion') &&
                   !lbl.includes('synchronisation cloud') &&
                   !lbl.includes('synchronisation compte');
          });

          const restoredUser: CasinoUser = {
            ...DEFAULT_USER,
            id: `usr_${existingCitizenId || discordId.slice(-6)}`,
            discordId,
            discordTag: discordData.tag,
            avatarUrl: discordData.avatarUrl || cloudProfile?.avatar_url || cachedLocal?.avatarUrl || DEFAULT_USER.avatarUrl,
            rpFirstName: existingFirst,
            rpLastName: existingLast || 'Diamond',
            citizenId: existingCitizenId,
            phoneNumber: cloudProfile?.phone_number || cachedLocal?.phoneNumber || '',
            role: assignedRole,
            chips: chipsAmount,
            cash: 0,
            isDiscordSynced: true,
            lastWheelSpin: cloudProfile?.last_wheel_spin ? new Date(cloudProfile.last_wheel_spin).getTime() : (cachedLocal?.lastWheelSpin ?? null),
            inventory: sanitizeInventory(cloudProfile?.inventory || cachedLocal?.inventory || (isOwner ? ['Pass Propriétaire Diamond', 'Carte VIP Black Diamond Elite', 'Clé Maître Casino'] : ['Pass Membre Diamond'])),
            transactions: existingTx,
          };

          setUser(restoredUser);
          setPendingDiscordUser(null);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredUser));
          saveKnownDiscordProfile(discordId, restoredUser);
          return;
        }

        // BRANCH 2 : Nouveau compte Discord -> formulaire de première inscription
        setUser((prev) => {
          if (prev && prev.citizenId && prev.rpFirstName) {
            return prev;
          }
          setPendingDiscordUser(discordData);
          return null;
        });
      } catch (err) {
        console.warn('[CasinoUserContext] Auth user processing error:', err);
        setPendingDiscordUser(discordData);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        handleAuthUser(session.user);
      }
    }).catch(() => {});

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        handleAuthUser(session.user);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  // Cross-component and cross-tab reactive cooldown reset listener
  useEffect(() => {
    const handleReset = () => {
      setUser((prev) => {
        if (!prev) return null;
        return { ...prev, lastWheelSpin: null };
      });
      setCanSpinWheel(true);
      setTimeUntilNextSpin('Disponible');
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const updated = safeJsonParse<CasinoUser | null>(e.newValue, null);
        if (updated) {
          setUser({
            ...updated,
            inventory: sanitizeInventory(updated.inventory),
          });
        }
      }
    };

    window.addEventListener('diamond_wheel_cooldown_reset', handleReset);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('diamond_wheel_cooldown_reset', handleReset);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Handle spin countdown (respects VIP scaling)
  useEffect(() => {
    const updateCountdown = () => {
      if (!user || !user.lastWheelSpin) {
        setCanSpinWheel(true);
        setTimeUntilNextSpin('Disponible');
        return;
      }

      const storedCooldownHours = safeJsonParse<number>(
        localStorage.getItem('diamond_casino_admin_config_v1_cooldown'),
        24
      );

      let effectiveHours = storedCooldownHours;
      if (user.vipTier === 'DIAMOND') {
        effectiveHours = Math.min(8, storedCooldownHours);
      } else if (user.vipTier === 'GOLD') {
        effectiveHours = Math.min(12, storedCooldownHours);
      }

      const COOLDOWN_MS = effectiveHours * 60 * 60 * 1000;
      const now = Date.now();
      const diff = user.lastWheelSpin + COOLDOWN_MS - now;

      if (diff <= 0) {
        setCanSpinWheel(true);
        setTimeUntilNextSpin('Disponible');
      } else {
        setCanSpinWheel(false);
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeUntilNextSpin(`${hours}h ${minutes}m ${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [user]);

  const addTransaction = useCallback((tx: Omit<CasinoTransaction, 'id' | 'date'>) => {
    const newTx: CasinoTransaction = {
      ...tx,
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      date: new Date().toISOString(),
    };
    setUser((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        transactions: [newTx, ...(prev.transactions || [])].slice(0, 50),
      };
    });
  }, []);

  const loginWithDiscordOAuth = async () => {
    const res = await triggerSupabaseDiscordOAuth();
    if (res.error) {
      console.warn('[CasinoUserContext] Supabase OAuth provider pending or local dev mode:', res.error);
      const testDiscordId = '1346953328432779341';
      const existingProfile = await dbGetProfile(testDiscordId);
      const cachedLocal = getKnownDiscordProfile(testDiscordId);

      const existingFirst = existingProfile?.rp_first_name || cachedLocal?.rpFirstName;
      const existingCitizenId = existingProfile?.citizen_id || cachedLocal?.citizenId;

      if (existingFirst && existingCitizenId) {
        // Compte Discord déjà existant dans Supabase -> Restauration automatique immédiate
        const isOwner = isDiscordUserAdminOrOwner(testDiscordId, existingProfile?.email, '@dylan_dev');
        const assignedRole: UserRole = isOwner ? 'DÉVELOPPEUR' : ((existingProfile?.role as UserRole) || 'MEMBRE');
        const chipsAmount = existingProfile?.chips ?? existingProfile?.chips_balance ?? (isOwner ? 500000 : 0);

        const existingTx = (cachedLocal?.transactions || []).filter((tx: any) => {
          const lbl = (tx?.label || '').toLowerCase();
          return !lbl.includes('bienvenue') && 
                 !lbl.includes('bonus d\'accueil') && 
                 !lbl.includes('ouverture de compte') && 
                 !lbl.includes('reconnexion') &&
                 !lbl.includes('synchronisation cloud') &&
                 !lbl.includes('synchronisation compte');
        });

        const restoredUser: CasinoUser = {
          ...DEFAULT_USER,
          id: `usr_${existingCitizenId}`,
          discordId: testDiscordId,
          discordTag: '@dylan_dev',
          avatarUrl: existingProfile?.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png',
          rpFirstName: existingFirst,
          rpLastName: existingProfile?.rp_last_name || cachedLocal?.rpLastName || 'Fondateur',
          citizenId: existingCitizenId,
          phoneNumber: existingProfile?.phone_number || '555-0001',
          role: assignedRole,
          chips: chipsAmount,
          cash: 0,
          isDiscordSynced: true,
          inventory: isOwner 
            ? ['Pass Propriétaire Diamond', 'Carte VIP Black Diamond Elite', 'Clé Maître Casino'] 
            : ['Pass Membre Diamond'],
          transactions: existingTx,
        };

        setUser(restoredUser);
        setPendingDiscordUser(null);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredUser));
        saveKnownDiscordProfile(testDiscordId, restoredUser);
      } else {
        // Nouveau compte Discord -> Demande prénom, nom, ID citoyen
        setPendingDiscordUser({
          id: testDiscordId,
          username: 'Dylan',
          globalName: 'Dylan Fondateur',
          tag: '@dylan_dev',
          avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
          email: 'd.robert.2400@gmail.com',
        });
      }
    }
  };

  const cancelPendingDiscord = () => {
    setPendingDiscordUser(null);
    supabase.auth.signOut().catch(() => {});
  };

  const completeRPRegistration = async (data: {
    rpFirstName: string;
    rpLastName: string;
    citizenId: string;
    phoneNumber?: string;
  }) => {
    const cleanFirst = sanitizeText(data.rpFirstName, 25);
    const cleanLast = sanitizeText(data.rpLastName, 25);
    const cleanId = sanitizeText(data.citizenId, 15);
    const cleanPhone = sanitizeText(data.phoneNumber || '', 15);

    const discordInfo = pendingDiscordUser;
    const discordId = discordInfo?.id || `usr_${Date.now().toString().slice(-6)}`;
    const discordTag = discordInfo?.tag || 'Citoyen#0000';
    const avatarUrl = discordInfo?.avatarUrl || getDefaultDiscordAvatar(discordId);
    const email = discordInfo?.email || '';

    const isOwner = isDiscordUserAdminOrOwner(discordId, email, discordTag);
    const assignedRole: UserRole = isOwner ? 'DÉVELOPPEUR' : 'MEMBRE';
    const initialChips = isOwner ? 500000 : 0;

    const newUser: CasinoUser = {
      ...DEFAULT_USER,
      id: `usr_${cleanId || discordId.slice(-6)}`,
      discordId,
      discordTag,
      avatarUrl,
      rpFirstName: cleanFirst,
      rpLastName: cleanLast,
      citizenId: cleanId,
      phoneNumber: cleanPhone,
      role: assignedRole,
      chips: initialChips,
      cash: 0,
      isDiscordSynced: true,
      inventory: isOwner ? ['Pass Propriétaire Diamond', 'Carte VIP Black Diamond Elite'] : ['Pass Membre Diamond'],
      transactions: [],
    };

    setUser(newUser);
    setPendingDiscordUser(null);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    saveKnownDiscordProfile(discordId, newUser);

    // Save profile to Supabase Cloud
    try {
      const sbUser = (await supabase.auth.getUser()).data.user;
      await dbUpsertProfile({
        id: sbUser?.id,
        discord_id: discordId,
        full_name: `${cleanFirst} ${cleanLast} | #${cleanId}`,
        rp_name: `${cleanFirst} ${cleanLast}`,
        rp_first_name: cleanFirst,
        rp_last_name: cleanLast,
        citizen_id: cleanId,
        identifier: cleanId,
        avatar_url: avatarUrl,
        role: isOwner ? 'owner' : 'client',
        vip_level: assignedRole,
        chips: initialChips,
        chips_balance: initialChips,
        cash: 0,
        cash_balance: 0,
        phone_number: cleanPhone,
        email,
        inventory: newUser.inventory,
      });
    } catch (err) {
      console.warn('[CasinoUserContext] Supabase profile registration sync error:', err);
    }
  };

  const loginWithDiscord = (preset?: Partial<CasinoUser>) => {
    const cleanFirstName = sanitizeText(preset?.rpFirstName || DEFAULT_USER.rpFirstName, 25);
    const cleanLastName = sanitizeText(preset?.rpLastName || DEFAULT_USER.rpLastName, 25);
    const cleanCitizenId = sanitizeText(preset?.citizenId || DEFAULT_USER.citizenId, 15);
    const cleanPhone = sanitizeText(preset?.phoneNumber || DEFAULT_USER.phoneNumber, 15);
    const avatar = preset?.avatarUrl || DEFAULT_USER.avatarUrl;
    const chips = typeof preset?.chips === 'number' ? preset.chips : 0;

    const userTransactions = (preset?.transactions || []).filter((tx: any) => {
      const lbl = (tx?.label || '').toLowerCase();
      return !lbl.includes('bienvenue') && 
             !lbl.includes('bonus d\'accueil') && 
             !lbl.includes('ouverture de compte') && 
             !lbl.includes('reconnexion') &&
             !lbl.includes('synchronisation cloud') &&
             !lbl.includes('synchronisation compte');
    });

    const newUser: CasinoUser = {
      ...DEFAULT_USER,
      ...preset,
      avatarUrl: avatar,
      rpFirstName: cleanFirstName,
      rpLastName: cleanLastName,
      citizenId: cleanCitizenId,
      phoneNumber: cleanPhone,
      chips,
      cash: 0,
      isDiscordSynced: true,
      inventory: sanitizeInventory(preset?.inventory || DEFAULT_USER.inventory),
      transactions: userTransactions,
    };
    setUser(newUser);
  };

  const syncDiscordProfile = (discordId: string, discordTag: string, avatarUrl: string) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated: CasinoUser = {
        ...prev,
        discordId,
        discordTag,
        avatarUrl: avatarUrl || prev.avatarUrl,
        isDiscordSynced: true,
      };

      const identifier = updated.citizenId || updated.id;
      if (identifier) {
        dbUpsertProfile({
          identifier,
          discord_id: updated.discordId,
          full_name: `${updated.rpFirstName} ${updated.rpLastName} | #${updated.citizenId}`,
          rp_name: `${updated.rpFirstName} ${updated.rpLastName}`.trim(),
          vip_level: updated.vipTier ? `VIP ${updated.vipTier}` : updated.role,
          chips_balance: updated.chips,
          cash_balance: 0,
          phone_number: updated.phoneNumber,
          avatar_url: updated.avatarUrl,
          inventory: updated.inventory,
          last_wheel_spin: updated.lastWheelSpin ? new Date(updated.lastWheelSpin).toISOString() : null,
        }).catch((err) => {
          console.warn('[CasinoUserContext] Cloud profile sync on Discord update:', err);
        });
      }

      return updated;
    });
  };

  const loginWithCitizenId = async (citizenId: string): Promise<boolean> => {
    const cleanId = sanitizeText(citizenId, 15);
    if (!cleanId) return false;
    try {
      const profile = await dbGetProfile(cleanId);
      if (profile) {
        const names = (profile.rp_name || profile.full_name || '').split('|')[0].trim().split(' ');
        const firstName = names[0] || 'Citoyen';
        const lastName = names.slice(1).join(' ') || `#${cleanId}`;
        const restoredUser: CasinoUser = {
          ...DEFAULT_USER,
          id: `usr_${cleanId}`,
          citizenId: cleanId,
          rpFirstName: firstName,
          rpLastName: lastName,
          phoneNumber: profile.phone_number || '',
          role: (profile.vip_level as UserRole) || 'MEMBRE',
          chips: profile.chips_balance ?? 0,
          cash: 0,
          avatarUrl: profile.avatar_url || DEFAULT_USER.avatarUrl,
          inventory: sanitizeInventory(profile.inventory || []),
          isDiscordSynced: true,
          lastWheelSpin: profile.last_wheel_spin ? new Date(profile.last_wheel_spin).getTime() : null,
          transactions: [],
        };
        setUser(restoredUser);
        return true;
      }
    } catch (err) {
      console.warn('[CasinoUserContext] Error restoring profile:', err);
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    setPendingDiscordUser(null);
    localStorage.removeItem(STORAGE_KEY);
    supabase.auth.signOut().catch(() => {});
  };

  const updateProfile = (data: {
    rpFirstName?: string;
    rpLastName?: string;
    citizenId?: string;
    phoneNumber?: string;
    avatarUrl?: string;
    discordTag?: string;
    discordId?: string;
    role?: UserRole;
  }) => {
    if (!user) return;
    const cleanFirstName = data.rpFirstName !== undefined ? sanitizeText(data.rpFirstName, 25) : user.rpFirstName;
    const cleanLastName = data.rpLastName !== undefined ? sanitizeText(data.rpLastName, 25) : user.rpLastName;
    const cleanCitizenId = data.citizenId !== undefined ? sanitizeText(data.citizenId, 15) : user.citizenId;
    const cleanPhone = data.phoneNumber !== undefined ? sanitizeText(data.phoneNumber, 15) : user.phoneNumber;

    setUser({
      ...user,
      rpFirstName: cleanFirstName || user.rpFirstName,
      rpLastName: cleanLastName || user.rpLastName,
      citizenId: cleanCitizenId || user.citizenId,
      phoneNumber: cleanPhone !== undefined ? cleanPhone : user.phoneNumber,
      avatarUrl: data.avatarUrl || user.avatarUrl,
      discordTag: data.discordTag || user.discordTag,
      discordId: data.discordId || user.discordId,
      role: data.role || user.role,
    });
  };

  const syncDiscordRoles = () => {
    if (!user) return;
    setUser({
      ...user,
      isDiscordSynced: true,
    });
  };

  const claimWheelReward = (reward: {
    type: 'chips' | 'cash' | 'vehicle' | 'mystery' | 'clothing';
    value: number | string;
    label: string;
  }) => {
    if (!user) return;

    let updatedChips = user.chips;
    let updatedCash = user.cash;
    let gainWon = 0;
    const updatedInventory = [...user.inventory];

    if (reward.type === 'chips' && typeof reward.value === 'number') {
      updatedChips += reward.value;
      gainWon = reward.value;
    } else if (reward.type === 'cash' && typeof reward.value === 'number') {
      updatedCash += reward.value;
      gainWon = reward.value;
    } else {
      const sanitizedLabel = sanitizeText(reward.label, 50);
      if (sanitizedLabel && !updatedInventory.includes(sanitizedLabel)) {
        updatedInventory.push(sanitizedLabel);
      }
    }

    const spinTimestamp = Date.now();
    const newTx: CasinoTransaction = {
      id: `tx_${spinTimestamp}_${Math.random().toString(36).substring(2, 7)}`,
      type: 'spin_reward',
      label: `Gain Roue de la Fortune : ${reward.label}`,
      amountChips: reward.type === 'chips' && typeof reward.value === 'number' ? reward.value : 0,
      amountCash: reward.type === 'cash' && typeof reward.value === 'number' ? reward.value : 0,
      date: new Date().toISOString(),
      status: 'COMPLÉTÉ',
      category: 'Roue de la Fortune',
    };

    setUser({
      ...user,
      chips: updatedChips,
      cash: updatedCash,
      inventory: sanitizeInventory(updatedInventory),
      lastWheelSpin: spinTimestamp,
      totalWon: (user.totalWon || 0) + gainWon,
      totalSpins: (user.totalSpins || 0) + 1,
      transactions: [newTx, ...(user.transactions || [])].slice(0, 50),
    });

    dbRecordSpinBet({
      identifier: user.citizenId || user.id,
      segmentLabel: reward.label,
      rewardType: reward.type,
      rewardValue: reward.value,
    });
  };

  const subscribeVipTier = (tier: 'SILVER' | 'GOLD' | 'DIAMOND') => {
    if (!user) return;
    const inv = [...user.inventory];
    let chipBonus = 15000;
    let cardName = 'Carte VIP Silver Privilège';

    if (tier === 'SILVER') {
      chipBonus = 15000;
      cardName = 'Carte VIP Silver Privilège';
    } else if (tier === 'GOLD') {
      chipBonus = 60000;
      cardName = 'Carte VIP Gold High Roller';
    } else if (tier === 'DIAMOND') {
      chipBonus = 150000;
      cardName = 'Carte VIP Black Diamond Elite';
    }

    if (!inv.includes(cardName)) {
      inv.push(cardName);
    }

    const tx: CasinoTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: 'vip_subscription',
      label: `Souscription VIP ${tier} (+${chipBonus.toLocaleString()} Jetons)`,
      amountChips: chipBonus,
      amountCash: 0,
      date: new Date().toISOString(),
      status: 'COMPLÉTÉ',
      category: 'Abonnement VIP',
    };

    setUser({
      ...user,
      vipTier: tier,
      role: tier === 'DIAMOND' ? 'VIP DIAMOND' : 'MEMBRE CITOYEN VIP',
      chips: user.chips + chipBonus,
      inventory: sanitizeInventory(inv),
      lastWheelSpin: null,
      transactions: [tx, ...(user.transactions || [])].slice(0, 50),
    });
  };

  const resetSpinCooldown = () => {
    if (!user) return;
    setUser({
      ...user,
      lastWheelSpin: null,
    });
  };

  return (
    <CasinoUserContext.Provider
      value={{
        user,
        isAuthenticated: !!user && !!user.rpFirstName && !!user.citizenId,
        pendingDiscordUser,
        loginWithDiscordOAuth,
        completeRPRegistration,
        cancelPendingDiscord,
        loginWithDiscord,
        loginWithCitizenId,
        logout,
        updateProfile,
        syncDiscordRoles,
        syncDiscordProfile,
        subscribeVipTier,
        claimWheelReward,
        canSpinWheel,
        timeUntilNextSpin,
        resetSpinCooldown,
        addTransaction,
      }}
    >
      {children}
    </CasinoUserContext.Provider>
  );
};

export const useCasinoUser = (): CasinoUserContextType => {
  const context = useContext(CasinoUserContext);
  if (!context) {
    throw new Error('useCasinoUser must be used within a CasinoUserProvider');
  }
  return context;
};
