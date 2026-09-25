import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { sanitizeText, sanitizeNumber } from '../lib/security';
import {
  supabase,
  apiAdminSetSetting,
  apiAdminDashboard,
  dbFetchAdminLogs,
  dbFetchProfiles,
  dbFetchPendingVipRequests,
  apiAdminUpdateProfile,
  apiAdminAdjustBalance,
  apiAdminResetCooldown,
  apiAdminSetVip,
  apiAdminRejectVipRequest,
  apiAdminDeleteProfile,
  PROFILE_ROLES,
  type AdminDashboard,
  type AdminProfilePatch,
  type LogCategory,
  type ProfileRole,
  type SupabaseProfile,
  type SupabaseTransaction,
  type VipTier,
} from '../lib/supabase';
import {
  DEFAULT_GAMES_CONFIG,
  DEFAULT_VIP_CONFIG,
  mergeGamesConfig,
  mergeVipConfig,
  type GamesConfig,
  type VipConfig,
} from '../lib/gamesConfig';
import { hasAdminPermissions } from '../lib/discord';
import { useCasinoUser, type CasinoTransaction } from './CasinoUserContext';

export type RewardType = 'vehicle' | 'chips' | 'mystery' | 'clothing';

export interface WheelSegmentConfig {
  id: number;
  label: string;
  type: RewardType;
  value: number | string;
  color: string;
  textColor: string;
  icon: string;
  /** Poids du lot. Les chances réelles = poids / somme des poids */
  dropRate: number;
  /** type 'vehicle' : modèle du catalogue (livré en jeu) */
  vehicleModel?: string;
  /** Image affichée quand le lot est gagné */
  imageUrl?: string;
}

export interface PodiumVehicleConfig {
  name: string;
  imageUrl: string;
  value: number;
  /** Modèle du catalogue (optionnel) */
  model?: string;
}

/** Seul réglage « économie » réel : l'ouverture du casino */
export interface CasinoEconomyConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

export interface AdminLogEntry {
  id: string;
  timestamp: string;
  createdAt?: string;
  action: string;
  category: LogCategory;
  detail: string;
  author: string;
}

/** Fiche d'un joueur telle qu'affichée dans la console */
export interface MockCitizen {
  profileId: string;
  citizenId: string;
  rpFirstName: string;
  rpLastName: string;
  role: string;
  vipTier?: VipTier;
  vipExpiresAt?: string;
  chips: number;
  phoneNumber?: string;
  wheelCooldownRemaining: string;
  lastSpinTimestamp: number | null;
  discordId?: string;
  discordTag?: string;
  avatarUrl?: string;
  createdAt?: string;
  transactions?: CasinoTransaction[];
  totalWon?: number;
  totalWagered?: number;
  totalSpins?: number;
  inventory?: string[];
  isLinked: boolean;
  adminNote?: string;
  adminNoteAuthor?: string;
  adminNoteDate?: string;
  adminNoteSeverity?: 'surveillance' | 'warning' | 'info' | 'vip';
}

export interface VipRequest {
  id: string;
  profileId: string;
  tier: VipTier;
  createdAt: string;
  citizen?: MockCitizen;
}

interface CasinoAdminContextType {
  isStaff: boolean;

  // Réglages publics (lus par tout le monde, écrits par la gérance)
  segments: WheelSegmentConfig[];
  podiumVehicle: PodiumVehicleConfig;
  wheelCooldownHours: number;
  economy: CasinoEconomyConfig;
  gamesConfig: GamesConfig;
  vipConfig: VipConfig;
  configLoaded: boolean;
  reloadConfig: () => Promise<void>;

  saveSegments: (segments: WheelSegmentConfig[]) => Promise<boolean>;
  savePodiumVehicle: (podium: PodiumVehicleConfig) => Promise<boolean>;
  saveWheelCooldownHours: (hours: number) => Promise<boolean>;
  saveGamesConfig: (config: GamesConfig) => Promise<boolean>;
  saveVipConfig: (config: VipConfig) => Promise<boolean>;
  setMaintenance: (enabled: boolean, message?: string) => Promise<boolean>;

  // Joueurs (gérance uniquement)
  citizens: MockCitizen[];
  updateCitizen: (citizenId: string, patch: Partial<MockCitizen>) => Promise<boolean>;
  adjustCitizenBalance: (citizenId: string, chipsDelta: number, reason?: string) => Promise<boolean>;
  setCitizenVip: (citizenId: string, tier: VipTier | null, grantBonus?: boolean) => Promise<boolean>;
  resetCitizenWheelCooldown: (citizenId: string) => Promise<boolean>;
  resetAllWheelCooldowns: () => Promise<boolean>;
  deleteCitizen: (citizenId: string) => Promise<boolean>;
  refreshCitizens: () => Promise<void>;

  // Demandes VIP
  vipRequests: VipRequest[];
  rejectVipRequest: (requestId: string) => Promise<boolean>;

  // Journal (écrit uniquement par le serveur)
  logs: AdminLogEntry[];
  /** Conservé pour compatibilité : le serveur journalise déjà, on recharge simplement le journal */
  addLog: (action: string, category: LogCategory, detail: string) => void;
  refreshLogs: () => Promise<void>;

  // Statistiques réelles
  dashboard: AdminDashboard | null;
  dashboardDays: number;
  setDashboardDays: (days: number) => void;
  refreshDashboard: () => Promise<void>;

  lastError: { message: string; at: number } | null;
}

export const DEFAULT_SEGMENTS: WheelSegmentConfig[] = [
  { id: 0, label: 'VÉHICULE PODIUM', type: 'vehicle', value: 'Grotti Itali RSX', color: '#fbbf24', textColor: '#000000', icon: '🏎️', dropRate: 1.5 },
  { id: 1, label: '50 000 JETONS', type: 'chips', value: 50000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 3.5 },
  { id: 2, label: '75 000 JETONS', type: 'chips', value: 75000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 3.5 },
  { id: 3, label: 'MYSTÈRE DIAMOND', type: 'mystery', value: 'Montre Vacheron Royale', color: '#6d28d9', textColor: '#ffffff', icon: '🎁', dropRate: 4.0 },
  { id: 4, label: '25 000 JETONS', type: 'chips', value: 25000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 8.0 },
  { id: 5, label: '30 000 JETONS', type: 'chips', value: 30000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 8.0 },
  { id: 6, label: 'VÊTEMENT VIP', type: 'clothing', value: 'Costume Sur-Mesure Diamond', color: '#2563eb', textColor: '#ffffff', icon: '👔', dropRate: 6.0 },
  { id: 7, label: '10 000 JETONS', type: 'chips', value: 10000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 14.5 },
  { id: 8, label: '5 000 JETONS', type: 'chips', value: 5000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 14.5 },
  { id: 9, label: 'CHAMPAGNE VIP', type: 'mystery', value: 'Bouteille Diamond Reserve', color: '#b45309', textColor: '#ffffff', icon: '🍾', dropRate: 5.0 },
  { id: 10, label: '35 000 JETONS', type: 'chips', value: 35000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 5.0 },
  { id: 11, label: '20 000 JETONS', type: 'chips', value: 20000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 7.0 },
  { id: 12, label: 'PASS HIGH ROLLER', type: 'mystery', value: 'Accès Salon Privé VIP', color: '#4f46e5', textColor: '#ffffff', icon: '🔑', dropRate: 2.0 },
  { id: 13, label: '15 000 JETONS', type: 'chips', value: 15000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 10.0 },
  { id: 14, label: '12 000 JETONS', type: 'chips', value: 12000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 8.5 },
  { id: 15, label: 'BONUS HIGH ROLLER', type: 'chips', value: 40000, color: '#374151', textColor: '#ffffff', icon: '⭐', dropRate: 3.0 },
];

export const DEFAULT_PODIUM: PodiumVehicleConfig = {
  name: 'Grotti Itali RSX',
  imageUrl: '/podium_supercar.jpg',
  value: 2850000,
};

export const DEFAULT_ECONOMY: CasinoEconomyConfig = {
  maintenanceMode: false,
  maintenanceMessage: 'Le casino est fermé pour maintenance. Revenez bientôt !',
};

const PUBLIC_SETTING_KEYS = ['wheel_segments', 'podium_vehicle', 'wheel_cooldown', 'economy_config', 'games_config', 'vip_config'];
const REWARD_TYPES: string[] = ['vehicle', 'chips', 'cash', 'mystery', 'clothing'];

function isValidSegments(value: unknown): value is WheelSegmentConfig[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (s) => s && typeof s === 'object' && typeof s.label === 'string' && REWARD_TYPES.includes(s.type) && typeof s.dropRate === 'number',
    )
  );
}

function formatLogTime(iso?: string): string {
  if (!iso) return 'Récent';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Récent';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toCitizen(p: SupabaseProfile, cooldownHours: number, vip: VipConfig): MockCitizen {
  const expired = !!p.vip_expires_at && new Date(p.vip_expires_at).getTime() < Date.now();
  const tier = p.vip_tier && !expired ? p.vip_tier : undefined;
  const tierCooldown = tier ? Math.min(vip[tier].wheelCooldownHours, cooldownHours) : cooldownHours;
  const lastSpin = p.last_wheel_spin ? new Date(p.last_wheel_spin).getTime() : null;
  const onCooldown = lastSpin !== null && lastSpin + tierCooldown * 3600_000 > Date.now();
  const note = p.admin_note;
  return {
    profileId: p.id,
    citizenId: p.citizen_id || p.id.slice(0, 8),
    rpFirstName: p.rp_first_name || 'Citoyen',
    rpLastName: p.rp_last_name || '',
    role: p.role,
    vipTier: tier,
    vipExpiresAt: tier ? p.vip_expires_at || undefined : undefined,
    chips: Number(p.chips) || 0,
    phoneNumber: p.phone_number || '',
    wheelCooldownRemaining: onCooldown ? 'Cooldown actif' : 'Disponible',
    lastSpinTimestamp: lastSpin,
    discordId: p.discord_id || undefined,
    discordTag: p.discord_tag || undefined,
    avatarUrl: p.avatar_url || undefined,
    createdAt: p.created_at || undefined,
    totalWon: Number(p.total_won) || 0,
    totalWagered: Number(p.total_wagered) || 0,
    totalSpins: Number(p.total_spins) || 0,
    inventory: p.inventory || [],
    isLinked: !!p.user_id,
    adminNote: note?.text,
    adminNoteAuthor: note?.author,
    adminNoteDate: note?.date,
    adminNoteSeverity: note?.severity,
  };
}

const CasinoAdminContext = createContext<CasinoAdminContextType | undefined>(undefined);

export const CasinoAdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, refreshProfile } = useCasinoUser();
  const isStaff = hasAdminPermissions(user);
  const authorName = user ? `${user.rpFirstName} ${user.rpLastName}`.trim() : 'Console Admin';

  const [segments, setSegments] = useState<WheelSegmentConfig[]>(DEFAULT_SEGMENTS);
  const [podiumVehicle, setPodiumVehicle] = useState<PodiumVehicleConfig>(DEFAULT_PODIUM);
  const [wheelCooldownHours, setWheelCooldownHoursState] = useState<number>(24);
  const [economy, setEconomy] = useState<CasinoEconomyConfig>(DEFAULT_ECONOMY);
  const [gamesConfig, setGamesConfig] = useState<GamesConfig>(DEFAULT_GAMES_CONFIG);
  const [vipConfig, setVipConfig] = useState<VipConfig>(DEFAULT_VIP_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);

  const [citizens, setCitizens] = useState<MockCitizen[]>([]);
  const [vipRequestRows, setVipRequestRows] = useState<SupabaseTransaction[]>([]);
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [dashboardDays, setDashboardDays] = useState<number>(7);
  const [lastError, setLastError] = useState<{ message: string; at: number } | null>(null);

  const reportError = useCallback((err: unknown) => {
    const message = (err as Error)?.message || 'Erreur serveur';
    console.warn('[CasinoAdmin]', message);
    setLastError({ message, at: Date.now() });
  }, []);

  // ---------------------------------------------------------------
  // Réglages publics — une seule requête pour tout
  // ---------------------------------------------------------------
  const applySetting = useCallback((key: string, value: unknown) => {
    switch (key) {
      case 'wheel_segments':
        if (isValidSegments(value)) {
          setSegments(value.map((s) => ((s.type as string) === 'cash' ? { ...s, type: 'chips' as const } : s)));
        }
        break;
      case 'podium_vehicle': {
        const v = value as PodiumVehicleConfig | null;
        if (v && typeof v.name === 'string') setPodiumVehicle({ ...DEFAULT_PODIUM, ...v, imageUrl: v.imageUrl || DEFAULT_PODIUM.imageUrl });
        break;
      }
      case 'wheel_cooldown':
        if (typeof value === 'number') setWheelCooldownHoursState(value);
        break;
      case 'economy_config':
        if (value && typeof value === 'object') setEconomy({ ...DEFAULT_ECONOMY, ...(value as Partial<CasinoEconomyConfig>) });
        break;
      case 'games_config':
        setGamesConfig(mergeGamesConfig(value));
        break;
      case 'vip_config':
        setVipConfig(mergeVipConfig(value));
        break;
    }
  }, []);

  const reloadConfig = useCallback(async () => {
    const { data, error } = await supabase.from('casino_settings').select('key, value').in('key', PUBLIC_SETTING_KEYS);
    if (!error && data) data.forEach((row) => applySetting(row.key as string, row.value));
    setConfigLoaded(true);
  }, [applySetting]);

  useEffect(() => {
    void reloadConfig();
    // Les joueurs voient les changements (maintenance, mises…) sans recharger la page
    const interval = setInterval(() => void reloadConfig(), 60_000);
    const onFocus = () => void reloadConfig();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [reloadConfig]);

  // ---------------------------------------------------------------
  // Données gérance
  // ---------------------------------------------------------------
  const refreshCitizens = useCallback(async () => {
    if (!isStaff) return;
    try {
      const [profiles, requests] = await Promise.all([dbFetchProfiles(1000), dbFetchPendingVipRequests()]);
      setCitizens(profiles.map((p) => toCitizen(p, wheelCooldownHours, vipConfig)));
      setVipRequestRows(requests);
    } catch (err) {
      reportError(err);
    }
  }, [isStaff, wheelCooldownHours, vipConfig, reportError]);

  const refreshLogs = useCallback(async () => {
    if (!isStaff) return;
    const cloudLogs = await dbFetchAdminLogs(200);
    setLogs(
      cloudLogs.map((l) => ({
        id: l.id || `log_${Math.random().toString(36).slice(2)}`,
        timestamp: formatLogTime(l.created_at),
        createdAt: l.created_at,
        action: l.action,
        category: l.category,
        detail: l.detail,
        author: l.author || 'Console Admin',
      })),
    );
  }, [isStaff]);

  const refreshDashboard = useCallback(async () => {
    if (!isStaff) return;
    try {
      setDashboard(await apiAdminDashboard(dashboardDays));
    } catch (err) {
      reportError(err);
    }
  }, [isStaff, dashboardDays, reportError]);

  useEffect(() => {
    if (!isStaff) {
      setCitizens([]);
      setVipRequestRows([]);
      setLogs([]);
      setDashboard(null);
      return;
    }
    void refreshCitizens();
    void refreshLogs();
  }, [isStaff, refreshCitizens, refreshLogs]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  const addLog = useCallback(() => {
    void refreshLogs();
  }, [refreshLogs]);

  const afterMutation = useCallback(
    async (profileId?: string | null) => {
      await Promise.all([refreshCitizens(), refreshLogs(), refreshDashboard()]);
      if (!profileId || profileId === user?.id) await refreshProfile().catch(() => {});
    },
    [refreshCitizens, refreshLogs, refreshDashboard, refreshProfile, user?.id],
  );

  const findCitizen = useCallback(
    (citizenId: string) => citizens.find((c) => c.citizenId === citizenId || c.profileId === citizenId),
    [citizens],
  );

  const runMutation = useCallback(
    async (profileId: string | null, fn: () => Promise<unknown>): Promise<boolean> => {
      try {
        await fn();
        await afterMutation(profileId);
        return true;
      } catch (err) {
        reportError(err);
        await refreshCitizens();
        return false;
      }
    },
    [afterMutation, reportError, refreshCitizens],
  );

  // ---------------------------------------------------------------
  // Écriture des réglages : validée, normalisée et journalisée par le serveur
  // ---------------------------------------------------------------
  const saveSetting = useCallback(
    async (key: string, value: unknown): Promise<boolean> => {
      try {
        const saved = await apiAdminSetSetting<unknown>(key, value);
        applySetting(key, saved);
        void refreshLogs();
        return true;
      } catch (err) {
        reportError(err);
        void reloadConfig();
        return false;
      }
    },
    [applySetting, refreshLogs, reportError, reloadConfig],
  );

  const saveSegments = useCallback(
    (next: WheelSegmentConfig[]) =>
      saveSetting(
        'wheel_segments',
        next.map((s) => ({
          ...s,
          label: sanitizeText(s.label, 30) || 'Lot',
          dropRate: sanitizeNumber(s.dropRate, 0, 100, 0),
          value: s.type === 'chips' ? sanitizeNumber(s.value, 0, 100_000_000, 0) : sanitizeText(String(s.value), 80),
          vehicleModel: s.type === 'vehicle' && /^[A-Za-z0-9_-]{1,64}$/.test(s.vehicleModel || '') ? s.vehicleModel : undefined,
          imageUrl: /^(https:\/\/|\/)[^\s"'<>]{1,500}$/.test(s.imageUrl || '') ? s.imageUrl : undefined,
        })),
      ),
    [saveSetting],
  );

  const savePodiumVehicle = useCallback(
    async (podium: PodiumVehicleConfig) => {
      const prev = podiumVehicle;
      const ok = await saveSetting('podium_vehicle', {
        ...podium,
        name: sanitizeText(podium.name, 60) || prev.name,
        value: sanitizeNumber(podium.value, 0, 1_000_000_000, 0),
        imageUrl: sanitizeText(podium.imageUrl, 500) || DEFAULT_PODIUM.imageUrl,
      });
      // Le(s) segment(s) « véhicule podium » suivent le nouveau véhicule
      if (ok && (podium.name !== prev.name || podium.model !== prev.model || podium.imageUrl !== prev.imageUrl)) {
        const isPodiumSegment = (s: WheelSegmentConfig) => s.type === 'vehicle' && (!s.vehicleModel || s.vehicleModel === prev.model);
        if (segments.some(isPodiumSegment)) {
          await saveSegments(
            segments.map((s) =>
              isPodiumSegment(s) ? { ...s, value: podium.name, vehicleModel: podium.model, imageUrl: podium.imageUrl } : s,
            ),
          );
        }
      }
      return ok;
    },
    [podiumVehicle, segments, saveSetting, saveSegments],
  );

  const saveWheelCooldownHours = useCallback(
    (hours: number) => saveSetting('wheel_cooldown', sanitizeNumber(hours, 1, 168, 24)),
    [saveSetting],
  );
  const saveGamesConfig = useCallback((config: GamesConfig) => saveSetting('games_config', config), [saveSetting]);
  const saveVipConfig = useCallback((config: VipConfig) => saveSetting('vip_config', config), [saveSetting]);
  const setMaintenance = useCallback(
    (enabled: boolean, message?: string) =>
      saveSetting('economy_config', { maintenanceMode: enabled, maintenanceMessage: message ?? economy.maintenanceMessage }),
    [saveSetting, economy.maintenanceMessage],
  );

  // ---------------------------------------------------------------
  // Joueurs
  // ---------------------------------------------------------------
  const updateCitizen = useCallback(
    async (citizenId: string, patch: Partial<MockCitizen>) => {
      const existing = findCitizen(citizenId);
      if (!existing) return false;

      const serverPatch: AdminProfilePatch = {};
      if (patch.rpFirstName !== undefined && patch.rpFirstName !== existing.rpFirstName) serverPatch.rp_first_name = sanitizeText(patch.rpFirstName, 25);
      if (patch.rpLastName !== undefined && patch.rpLastName !== existing.rpLastName) serverPatch.rp_last_name = sanitizeText(patch.rpLastName, 25);
      if (patch.citizenId !== undefined && patch.citizenId !== existing.citizenId) serverPatch.citizen_id = sanitizeText(patch.citizenId.replace(/^#/, ''), 12);
      if (patch.phoneNumber !== undefined && patch.phoneNumber !== existing.phoneNumber) serverPatch.phone_number = sanitizeText(patch.phoneNumber, 20);
      if (patch.avatarUrl !== undefined && patch.avatarUrl !== existing.avatarUrl) serverPatch.avatar_url = sanitizeText(patch.avatarUrl, 300) || null;
      if (patch.role !== undefined && patch.role !== existing.role && PROFILE_ROLES.includes(patch.role as ProfileRole)) {
        serverPatch.role = patch.role as ProfileRole;
      }
      if (patch.vipTier !== undefined && patch.vipTier !== existing.vipTier) serverPatch.vip_tier = patch.vipTier ?? null;
      if (patch.chips !== undefined && patch.chips !== existing.chips) serverPatch.chips = sanitizeNumber(patch.chips, 0);

      const noteTouched = patch.adminNote !== undefined || patch.adminNoteSeverity !== undefined || patch.adminNoteAuthor !== undefined;
      if (noteTouched) {
        const text = (patch.adminNote ?? existing.adminNote ?? '').trim();
        serverPatch.admin_note = text
          ? {
              text: sanitizeText(text, 1000),
              author: patch.adminNoteAuthor ?? existing.adminNoteAuthor ?? authorName,
              date: patch.adminNoteDate ?? existing.adminNoteDate ?? new Date().toISOString(),
              severity: patch.adminNoteSeverity ?? existing.adminNoteSeverity ?? 'surveillance',
            }
          : null;
      }

      if (Object.keys(serverPatch).length === 0) return true;
      return runMutation(existing.profileId, () => apiAdminUpdateProfile(existing.profileId, serverPatch));
    },
    [findCitizen, runMutation, authorName],
  );

  const adjustCitizenBalance = useCallback(
    async (citizenId: string, chipsDelta: number, reason?: string) => {
      const existing = findCitizen(citizenId);
      if (!existing) return false;
      return runMutation(existing.profileId, () =>
        apiAdminAdjustBalance(existing.profileId, chipsDelta, reason ? sanitizeText(reason, 140) : undefined),
      );
    },
    [findCitizen, runMutation],
  );

  const setCitizenVip = useCallback(
    async (citizenId: string, tier: VipTier | null, grantBonus = true) => {
      const existing = findCitizen(citizenId);
      if (!existing) return false;
      return runMutation(existing.profileId, () => apiAdminSetVip(existing.profileId, tier, grantBonus));
    },
    [findCitizen, runMutation],
  );

  const resetCitizenWheelCooldown = useCallback(
    async (citizenId: string) => {
      const existing = findCitizen(citizenId);
      if (!existing) return false;
      return runMutation(existing.profileId, () => apiAdminResetCooldown(existing.profileId));
    },
    [findCitizen, runMutation],
  );

  const resetAllWheelCooldowns = useCallback(async () => runMutation(null, () => apiAdminResetCooldown(null)), [runMutation]);

  const deleteCitizen = useCallback(
    async (citizenId: string) => {
      const existing = findCitizen(citizenId);
      if (!existing) return false;
      return runMutation(existing.profileId, () => apiAdminDeleteProfile(existing.profileId));
    },
    [findCitizen, runMutation],
  );

  const vipRequests = useMemo<VipRequest[]>(
    () =>
      vipRequestRows
        .filter((r) => r.profile_id)
        .map((r) => ({
          id: r.id,
          profileId: r.profile_id as string,
          tier: (r.game as VipTier) || 'SILVER',
          createdAt: r.created_at,
          citizen: citizens.find((c) => c.profileId === r.profile_id),
        })),
    [vipRequestRows, citizens],
  );

  const rejectVipRequest = useCallback(
    async (requestId: string) => {
      const req = vipRequestRows.find((r) => r.id === requestId);
      return runMutation(req?.profile_id ?? null, () => apiAdminRejectVipRequest(requestId));
    },
    [vipRequestRows, runMutation],
  );

  const value = useMemo<CasinoAdminContextType>(
    () => ({
      isStaff,
      segments,
      podiumVehicle,
      wheelCooldownHours,
      economy,
      gamesConfig,
      vipConfig,
      configLoaded,
      reloadConfig,
      saveSegments,
      savePodiumVehicle,
      saveWheelCooldownHours,
      saveGamesConfig,
      saveVipConfig,
      setMaintenance,
      citizens,
      updateCitizen,
      adjustCitizenBalance,
      setCitizenVip,
      resetCitizenWheelCooldown,
      resetAllWheelCooldowns,
      deleteCitizen,
      refreshCitizens,
      vipRequests,
      rejectVipRequest,
      logs,
      addLog,
      refreshLogs,
      dashboard,
      dashboardDays,
      setDashboardDays,
      refreshDashboard,
      lastError,
    }),
    [
      isStaff,
      segments,
      podiumVehicle,
      wheelCooldownHours,
      economy,
      gamesConfig,
      vipConfig,
      configLoaded,
      reloadConfig,
      saveSegments,
      savePodiumVehicle,
      saveWheelCooldownHours,
      saveGamesConfig,
      saveVipConfig,
      setMaintenance,
      citizens,
      updateCitizen,
      adjustCitizenBalance,
      setCitizenVip,
      resetCitizenWheelCooldown,
      resetAllWheelCooldowns,
      deleteCitizen,
      refreshCitizens,
      vipRequests,
      rejectVipRequest,
      logs,
      addLog,
      refreshLogs,
      dashboard,
      dashboardDays,
      refreshDashboard,
      lastError,
    ],
  );

  return <CasinoAdminContext.Provider value={value}>{children}</CasinoAdminContext.Provider>;
};

export const useCasinoAdmin = () => {
  const context = useContext(CasinoAdminContext);
  if (!context) {
    throw new Error('useCasinoAdmin must be used within a CasinoAdminProvider');
  }
  return context;
};
