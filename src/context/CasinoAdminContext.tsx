import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { sanitizeText, sanitizeNumber } from '../lib/security';
import {
  supabase,
  dbSetSetting,
  dbGetSetting,
  dbAddAdminLog,
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
  type AdminProfilePatch,
  type LogCategory,
  type ProfileRole,
  type SupabaseProfile,
  type SupabaseTransaction,
  type VipTier,
} from '../lib/supabase';
import { hasAdminPermissions } from '../lib/discord';
import { useCasinoUser, type CasinoTransaction } from './CasinoUserContext';
import {
  DEFAULT_SLOT_MACHINES,
  type SlotMachineConfig,
  type SlotSymbolConfig,
} from '../components/slots/slotsEngine';

export type RewardType = 'vehicle' | 'chips' | 'mystery' | 'clothing';

export interface WheelSegmentConfig {
  id: number;
  label: string;
  type: RewardType;
  value: number | string;
  color: string;
  textColor: string;
  icon: string;
  dropRate: number; // Drop rate percentage (e.g. 5 = 5%)
  /** type 'vehicle': model from the vehicle catalogue (delivered in game) */
  vehicleModel?: string;
  /** Optional picture shown when the prize is won */
  imageUrl?: string;
}

export interface PodiumVehicleConfig {
  name: string;
  imageUrl: string;
  value: number;
  /** Catalogue model of the podium vehicle (optional) */
  model?: string;
}

export interface CasinoEconomyConfig {
  vaultCash: number;
  circulatingChips: number;
  chipToCashRate: number;
  minBet: number;
  maxBet: number;
  jackpotAmount: number;
  maintenanceMode: boolean;
}

export interface AdminLogEntry {
  id: string;
  timestamp: string;
  action: string;
  category: LogCategory;
  detail: string;
  author: string;
}

/** A citizen profile as displayed in the staff console */
export interface MockCitizen {
  profileId: string;
  citizenId: string;
  rpFirstName: string;
  rpLastName: string;
  role: string;
  vipTier?: VipTier;
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

  // Wheel Settings (public read)
  segments: WheelSegmentConfig[];
  podiumVehicle: PodiumVehicleConfig;
  wheelCooldownHours: number;
  updateSegment: (id: number, patch: Partial<WheelSegmentConfig>) => void;
  updatePodiumVehicle: (patch: Partial<PodiumVehicleConfig>) => void;
  setWheelCooldownHours: (hours: number) => void;
  resetWheelDefaults: () => void;

  // Slots Settings (public read, staff write)
  slotMachines: SlotMachineConfig[];
  updateSlotMachine: (id: string, patch: Partial<SlotMachineConfig>) => void;
  updateSlotSymbol: (machineId: string, symbolId: string, patch: Partial<SlotSymbolConfig>) => void;
  addSlotMachine: (machine: SlotMachineConfig) => void;
  deleteSlotMachine: (id: string) => void;
  resetSlotMachinesDefaults: () => void;

  // Economy Settings
  economy: CasinoEconomyConfig;
  updateEconomy: (patch: Partial<CasinoEconomyConfig>) => void;

  // Citizens (staff only)
  citizens: MockCitizen[];
  updateCitizen: (citizenId: string, patch: Partial<MockCitizen>) => Promise<boolean>;
  adjustCitizenBalance: (citizenId: string, chipsDelta: number, reason?: string) => Promise<boolean>;
  setCitizenVip: (citizenId: string, tier: VipTier | null, grantBonus?: boolean) => Promise<boolean>;
  resetCitizenWheelCooldown: (citizenId: string) => Promise<boolean>;
  resetAllWheelCooldowns: () => Promise<boolean>;
  deleteCitizen: (citizenId: string) => Promise<boolean>;
  refreshCitizens: () => Promise<void>;

  // VIP requests
  vipRequests: VipRequest[];
  rejectVipRequest: (requestId: string) => Promise<boolean>;

  // Logs
  logs: AdminLogEntry[];
  addLog: (action: string, category: LogCategory, detail: string) => void;
  clearLogs: () => void;
  refreshLogs: () => Promise<void>;

  // Stats
  totalSpinsCount: number;

  // Last server error, surfaced by the console as a toast
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
  vaultCash: 0,
  circulatingChips: 0,
  chipToCashRate: 1.0,
  minBet: 100,
  maxBet: 500000,
  jackpotAmount: 2500000,
  maintenanceMode: false,
};

const REWARD_TYPES: string[] = ['vehicle', 'chips', 'cash', 'mystery', 'clothing'];

function isValidSegments(value: unknown): value is WheelSegmentConfig[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (s) =>
        s &&
        typeof s === 'object' &&
        typeof s.label === 'string' &&
        REWARD_TYPES.includes(s.type) &&
        typeof s.dropRate === 'number',
    )
  );
}

function formatLogTime(iso?: string): string {
  if (!iso) return 'Récent';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Récent';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toCitizen(p: SupabaseProfile, cooldownHours: number): MockCitizen {
  const tierCooldown =
    p.vip_tier === 'DIAMOND' ? Math.min(8, cooldownHours) : p.vip_tier === 'GOLD' ? Math.min(12, cooldownHours) : cooldownHours;
  const lastSpin = p.last_wheel_spin ? new Date(p.last_wheel_spin).getTime() : null;
  const onCooldown = lastSpin !== null && lastSpin + tierCooldown * 3600_000 > Date.now();
  const note = p.admin_note;
  return {
    profileId: p.id,
    citizenId: p.citizen_id || p.id.slice(0, 8),
    rpFirstName: p.rp_first_name || 'Citoyen',
    rpLastName: p.rp_last_name || '',
    role: p.role,
    vipTier: p.vip_tier || undefined,
    chips: Number(p.chips) || 0,
    phoneNumber: p.phone_number || '',
    wheelCooldownRemaining: onCooldown ? 'Cooldown actif' : 'Disponible',
    lastSpinTimestamp: lastSpin,
    discordId: p.discord_id || undefined,
    discordTag: p.discord_tag || undefined,
    avatarUrl: p.avatar_url || undefined,
    createdAt: p.created_at || undefined,
    totalWon: Number(p.total_won) || 0,
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
  const [economy, setEconomyState] = useState<CasinoEconomyConfig>(DEFAULT_ECONOMY);
  const [slotMachines, setSlotMachines] = useState<SlotMachineConfig[]>(() => {
    try {
      const cached = localStorage.getItem('diamond_slots_machines_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_SLOT_MACHINES;
  });
  const [citizens, setCitizens] = useState<MockCitizen[]>([]);
  const [vipRequestRows, setVipRequestRows] = useState<SupabaseTransaction[]>([]);
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [totalSpinsCount, setTotalSpinsCount] = useState<number>(0);
  const [lastError, setLastError] = useState<{ message: string; at: number } | null>(null);

  const reportError = useCallback((err: unknown) => {
    const message = (err as Error)?.message || 'Erreur serveur';
    console.warn('[CasinoAdmin]', message);
    setLastError({ message, at: Date.now() });
  }, []);

  // ---------------------------------------------------------------
  // Public configuration (wheel + economy + slots) — read-only for everyone
  // ---------------------------------------------------------------
  const loadConfig = useCallback(async () => {
    const [remoteSegments, remotePodium, remoteCooldown, remoteEconomy, remoteSlots] = await Promise.all([
      dbGetSetting<unknown>('wheel_segments'),
      dbGetSetting<PodiumVehicleConfig>('podium_vehicle'),
      dbGetSetting<number>('wheel_cooldown'),
      dbGetSetting<CasinoEconomyConfig>('economy_config'),
      dbGetSetting<SlotMachineConfig[]>('slots_machines'),
    ]);
    if (isValidSegments(remoteSegments)) {
      // Single currency: a legacy « cash » segment is shown (and paid) as chips
      setSegments(remoteSegments.map((s) => ((s.type as string) === 'cash' ? { ...s, type: 'chips' as const } : s)));
    }
    if (remotePodium && typeof remotePodium.name === 'string') {
      setPodiumVehicle({ ...DEFAULT_PODIUM, ...remotePodium, imageUrl: remotePodium.imageUrl || DEFAULT_PODIUM.imageUrl });
    }
    if (typeof remoteCooldown === 'number') setWheelCooldownHoursState(remoteCooldown);
    if (remoteEconomy && typeof remoteEconomy === 'object') setEconomyState({ ...DEFAULT_ECONOMY, ...remoteEconomy });
    if (Array.isArray(remoteSlots) && remoteSlots.length > 0) {
      setSlotMachines(remoteSlots);
      try {
        localStorage.setItem('diamond_slots_machines_cache', JSON.stringify(remoteSlots));
      } catch {}
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const persistSetting = useCallback(
    (key: string, value: unknown) => {
      dbSetSetting(key, value).catch((err) => {
        reportError(err);
        void loadConfig(); // roll back to the server truth
      });
    },
    [reportError, loadConfig],
  );

  // ---------------------------------------------------------------
  // Staff data
  // ---------------------------------------------------------------
  const refreshCitizens = useCallback(async () => {
    if (!isStaff) return;
    try {
      const [profiles, requests] = await Promise.all([dbFetchProfiles(500), dbFetchPendingVipRequests()]);
      setCitizens(profiles.map((p) => toCitizen(p, wheelCooldownHours)));
      setVipRequestRows(requests);
    } catch (err) {
      reportError(err);
    }
  }, [isStaff, wheelCooldownHours, reportError]);

  const refreshLogs = useCallback(async () => {
    if (!isStaff) return;
    const cloudLogs = await dbFetchAdminLogs(100);
    setLogs(
      cloudLogs.map((l) => ({
        id: l.id || `log_${Math.random().toString(36).slice(2)}`,
        timestamp: formatLogTime(l.created_at),
        action: l.action,
        category: l.category,
        detail: l.detail,
        author: l.author || 'Console Admin',
      })),
    );
  }, [isStaff]);

  const refreshSpinCount = useCallback(async () => {
    if (!isStaff) return;
    const { count } = await supabase
      .from('bets_history')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', 'lucky_wheel');
    setTotalSpinsCount(count || 0);
  }, [isStaff]);

  useEffect(() => {
    if (!isStaff) {
      setCitizens([]);
      setVipRequestRows([]);
      setLogs([]);
      return;
    }
    void refreshCitizens();
    void refreshLogs();
    void refreshSpinCount();
  }, [isStaff, refreshCitizens, refreshLogs, refreshSpinCount]);

  const addLog = useCallback(
    (action: string, category: LogCategory, detail: string) => {
      const cleanAction = sanitizeText(action, 80);
      const cleanDetail = sanitizeText(detail, 200);
      setLogs((prev) => [
        {
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: "À l'instant",
          action: cleanAction,
          category,
          detail: cleanDetail,
          author: authorName,
        },
        ...prev.slice(0, 99),
      ]);
      void dbAddAdminLog({ action: cleanAction, category, detail: cleanDetail, author: authorName });
    },
    [authorName],
  );

  // After any server-side mutation: reload staff lists, logs and (if concerned) the own profile
  const afterMutation = useCallback(
    async (profileId?: string | null) => {
      await Promise.all([refreshCitizens(), refreshLogs(), refreshSpinCount()]);
      if (!profileId || profileId === user?.id) await refreshProfile().catch(() => {});
    },
    [refreshCitizens, refreshLogs, refreshSpinCount, refreshProfile, user?.id],
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
  // Wheel & economy settings
  // ---------------------------------------------------------------
  const updateSegment = useCallback(
    (id: number, patch: Partial<WheelSegmentConfig>) => {
      const next = segments.map((s) => {
        if (s.id !== id) return s;
        const merged = { ...s, ...patch };
        return {
          ...merged,
          label: sanitizeText(merged.label, 30) || s.label,
          dropRate: sanitizeNumber(merged.dropRate, 0, 100, s.dropRate),
          value:
            merged.type === 'chips'
              ? sanitizeNumber(merged.value, 0, 100_000_000, 0)
              : sanitizeText(String(merged.value), 60),
          vehicleModel:
            merged.type === 'vehicle' && /^[A-Za-z0-9_-]{1,64}$/.test(merged.vehicleModel || '') ? merged.vehicleModel : undefined,
          imageUrl: /^(https:\/\/|\/)[^\s"'<>]{1,500}$/.test(merged.imageUrl || '') ? merged.imageUrl : undefined,
        };
      });
      setSegments(next);
      persistSetting('wheel_segments', next);
      addLog('Modification segment Roue', 'WHEEL', `Segment #${id} mis à jour`);
    },
    [segments, persistSetting, addLog],
  );

  const updatePodiumVehicle = useCallback(
    (patch: Partial<PodiumVehicleConfig>) => {
      const prev = podiumVehicle;
      const next: PodiumVehicleConfig = {
        ...prev,
        ...patch,
        name: patch.name !== undefined ? sanitizeText(patch.name, 40) || prev.name : prev.name,
        value: patch.value !== undefined ? sanitizeNumber(patch.value, 0, 100_000_000, prev.value) : prev.value,
        imageUrl: patch.imageUrl !== undefined ? sanitizeText(patch.imageUrl, 300) || DEFAULT_PODIUM.imageUrl : prev.imageUrl,
      };
      setPodiumVehicle(next);
      persistSetting('podium_vehicle', next);
      // Keep the "podium" wheel segment(s) in sync; vehicle segments bound to another model are left alone
      if (next.name !== prev.name || next.model !== prev.model || next.imageUrl !== prev.imageUrl) {
        const isPodiumSegment = (s: WheelSegmentConfig) =>
          s.type === 'vehicle' && (!s.vehicleModel || s.vehicleModel === prev.model);
        const updated = segments.map((s) =>
          isPodiumSegment(s) ? { ...s, value: next.name, vehicleModel: next.model, imageUrl: next.imageUrl } : s,
        );
        setSegments(updated);
        persistSetting('wheel_segments', updated);
      }
      addLog('Véhicule Podium modifié', 'WHEEL', `Véhicule : ${next.name}`);
    },
    [podiumVehicle, segments, persistSetting, addLog],
  );

  const setWheelCooldownHours = useCallback(
    (hours: number) => {
      const valid = sanitizeNumber(hours, 1, 168, 24);
      setWheelCooldownHoursState(valid);
      persistSetting('wheel_cooldown', valid);
      addLog('Délai Roue ajusté', 'WHEEL', `Cooldown fixé à ${valid}h`);
    },
    [persistSetting, addLog],
  );

  const resetWheelDefaults = useCallback(() => {
    setSegments(DEFAULT_SEGMENTS);
    setPodiumVehicle(DEFAULT_PODIUM);
    setWheelCooldownHoursState(24);
    persistSetting('wheel_segments', DEFAULT_SEGMENTS);
    persistSetting('podium_vehicle', DEFAULT_PODIUM);
    persistSetting('wheel_cooldown', 24);
    addLog('Réinitialisation Roue', 'WHEEL', 'Paramètres par défaut rétablis');
  }, [persistSetting, addLog]);

  const updateEconomy = useCallback(
    (patch: Partial<CasinoEconomyConfig>) => {
      const prev = economy;
      const next: CasinoEconomyConfig = {
        ...prev,
        ...patch,
        vaultCash: sanitizeNumber(patch.vaultCash ?? prev.vaultCash, 0),
        circulatingChips: sanitizeNumber(patch.circulatingChips ?? prev.circulatingChips, 0),
        jackpotAmount: sanitizeNumber(patch.jackpotAmount ?? prev.jackpotAmount, 0),
        minBet: sanitizeNumber(patch.minBet ?? prev.minBet, 0),
        maxBet: sanitizeNumber(patch.maxBet ?? prev.maxBet, 0),
        chipToCashRate: sanitizeNumber(patch.chipToCashRate ?? prev.chipToCashRate, 0, 1000, 1),
        maintenanceMode: patch.maintenanceMode ?? prev.maintenanceMode,
      };
      setEconomyState(next);
      persistSetting('economy_config', next);
      addLog('Économie mise à jour', 'ECONOMY', 'Paramètres financiers modifiés');
    },
    [economy, persistSetting, addLog],
  );

  // ---------------------------------------------------------------
  // Slot Machines settings
  // ---------------------------------------------------------------
  const updateSlotMachine = useCallback(
    (id: string, patch: Partial<SlotMachineConfig>) => {
      const next = slotMachines.map((m) => {
        if (m.id !== id) return m;
        return { ...m, ...patch };
      });
      setSlotMachines(next);
      try {
        localStorage.setItem('diamond_slots_machines_cache', JSON.stringify(next));
      } catch {}
      persistSetting('slots_machines', next);
      addLog('Machine à sous modifiée', 'ECONOMY', `Machine ${patch.name || id} mise à jour`);
    },
    [slotMachines, persistSetting, addLog],
  );

  const updateSlotSymbol = useCallback(
    (machineId: string, symbolId: string, patch: Partial<SlotSymbolConfig>) => {
      const next = slotMachines.map((m) => {
        if (m.id !== machineId) return m;
        const nextSymbols = m.symbols.map((s) => (s.id === symbolId ? { ...s, ...patch } : s));
        return { ...m, symbols: nextSymbols };
      });
      setSlotMachines(next);
      try {
        localStorage.setItem('diamond_slots_machines_cache', JSON.stringify(next));
      } catch {}
      persistSetting('slots_machines', next);
      addLog('Symbole de slot modifié', 'ECONOMY', `Symbole ${symbolId} modifié sur ${machineId}`);
    },
    [slotMachines, persistSetting, addLog],
  );

  const addSlotMachine = useCallback(
    (machine: SlotMachineConfig) => {
      const next = [...slotMachines, machine];
      setSlotMachines(next);
      try {
        localStorage.setItem('diamond_slots_machines_cache', JSON.stringify(next));
      } catch {}
      persistSetting('slots_machines', next);
      addLog('Nouvelle machine à sous', 'ECONOMY', `Machine ${machine.name} créée`);
    },
    [slotMachines, persistSetting, addLog],
  );

  const deleteSlotMachine = useCallback(
    (id: string) => {
      if (slotMachines.length <= 1) return;
      const next = slotMachines.filter((m) => m.id !== id);
      setSlotMachines(next);
      try {
        localStorage.setItem('diamond_slots_machines_cache', JSON.stringify(next));
      } catch {}
      persistSetting('slots_machines', next);
      addLog('Machine à sous supprimée', 'ECONOMY', `Machine ID ${id} retirée`);
    },
    [slotMachines, persistSetting, addLog],
  );

  const resetSlotMachinesDefaults = useCallback(() => {
    setSlotMachines(DEFAULT_SLOT_MACHINES);
    try {
      localStorage.setItem('diamond_slots_machines_cache', JSON.stringify(DEFAULT_SLOT_MACHINES));
    } catch {}
    persistSetting('slots_machines', DEFAULT_SLOT_MACHINES);
    addLog('Réinitialisation Machines à sous', 'ECONOMY', 'Valeurs constructeur rétablies');
  }, [persistSetting, addLog]);

  // ---------------------------------------------------------------
  // Citizens
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

      const noteTouched =
        patch.adminNote !== undefined ||
        patch.adminNoteSeverity !== undefined ||
        patch.adminNoteAuthor !== undefined;
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

  const resetAllWheelCooldowns = useCallback(
    async () => runMutation(null, () => apiAdminResetCooldown(null)),
    [runMutation],
  );

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

  const clearLogs = useCallback(() => setLogs([]), []);

  const value = useMemo<CasinoAdminContextType>(
    () => ({
      isStaff,
      segments,
      podiumVehicle,
      wheelCooldownHours,
      updateSegment,
      updatePodiumVehicle,
      setWheelCooldownHours,
      resetWheelDefaults,
      slotMachines,
      updateSlotMachine,
      updateSlotSymbol,
      addSlotMachine,
      deleteSlotMachine,
      resetSlotMachinesDefaults,
      economy,
      updateEconomy,
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
      clearLogs,
      refreshLogs,
      totalSpinsCount,
      lastError,
    }),
    [
      isStaff,
      segments,
      podiumVehicle,
      wheelCooldownHours,
      updateSegment,
      updatePodiumVehicle,
      setWheelCooldownHours,
      resetWheelDefaults,
      slotMachines,
      updateSlotMachine,
      updateSlotSymbol,
      addSlotMachine,
      deleteSlotMachine,
      resetSlotMachinesDefaults,
      economy,
      updateEconomy,
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
      clearLogs,
      refreshLogs,
      totalSpinsCount,
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
