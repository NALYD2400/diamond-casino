import React, { createContext, useContext, useState, useEffect } from 'react';
import { sanitizeText, sanitizeNumber, safeJsonParse } from '../lib/security';
import { 
  dbSetSetting, 
  dbGetSetting, 
  dbAddAdminLog, 
  dbFetchAdminLogs,
  dbFetchProfiles,
  dbDeleteProfile,
  dbUpsertProfile
} from '../lib/supabase';
import { useCasinoUser, type CasinoTransaction } from './CasinoUserContext';

export type RewardType = 'vehicle' | 'chips' | 'cash' | 'mystery' | 'clothing';

export interface WheelSegmentConfig {
  id: number;
  label: string;
  type: RewardType;
  value: number | string;
  color: string;
  textColor: string;
  icon: string;
  dropRate: number; // Drop rate percentage (e.g. 5 = 5%)
}

export interface PodiumVehicleConfig {
  name: string;
  imageUrl: string;
  value: number;
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
  category: 'WHEEL' | 'ECONOMY' | 'CITIZEN' | 'SYSTEM';
  detail: string;
  author: string;
}

export interface MockCitizen {
  citizenId: string;
  rpFirstName: string;
  rpLastName: string;
  role: string;
  chips: number;
  cash: number;
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
  adminNote?: string;
  adminNoteAuthor?: string;
  adminNoteDate?: string;
  adminNoteSeverity?: 'surveillance' | 'warning' | 'info' | 'vip';
}

interface CasinoAdminContextType {
  // Authentication & Security Guard
  isAdminUnlocked: boolean;
  adminLockoutSecondsRemaining: number;
  unlockAdmin: (pin: string) => boolean;
  lockAdmin: () => void;
  changeAdminPin: (oldPin: string, newPin: string) => boolean;

  // Wheel Settings
  segments: WheelSegmentConfig[];
  podiumVehicle: PodiumVehicleConfig;
  wheelCooldownHours: number;
  updateSegment: (id: number, patch: Partial<WheelSegmentConfig>) => void;
  updatePodiumVehicle: (patch: Partial<PodiumVehicleConfig>) => void;
  setWheelCooldownHours: (hours: number) => void;
  resetWheelDefaults: () => void;
  
  // Economy Settings
  economy: CasinoEconomyConfig;
  updateEconomy: (patch: Partial<CasinoEconomyConfig>) => void;

  // Citizens
  citizens: MockCitizen[];
  updateCitizen: (citizenId: string, patch: Partial<MockCitizen>) => void;
  resetCitizenWheelCooldown: (citizenId: string) => void;
  resetAllWheelCooldowns: () => void;
  deleteCitizen: (citizenId: string) => void;
  refreshCitizens: () => Promise<void>;

  // Logs
  logs: AdminLogEntry[];
  addLog: (action: string, category: 'WHEEL' | 'ECONOMY' | 'CITIZEN' | 'SYSTEM', detail: string) => void;
  clearLogs: () => void;

  // Stats
  totalSpinsCount: number;
  recordSpinEvent: (segment: WheelSegmentConfig, citizenName?: string) => void;
}

const STORAGE_ADMIN_KEY = 'diamond_casino_admin_config_v1';
const ADMIN_PIN_KEY = 'diamond_casino_admin_pin_v1';
const DEFAULT_PIN = '7777';

export const DEFAULT_SEGMENTS: WheelSegmentConfig[] = [
  { id: 0, label: 'VÉHICULE PODIUM', type: 'vehicle', value: 'Grotti Itali RSX', color: '#fbbf24', textColor: '#000000', icon: '🏎️', dropRate: 1.5 },
  { id: 1, label: '50 000 JETONS', type: 'chips', value: 50000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 3.5 },
  { id: 2, label: '$50 000 CASH', type: 'cash', value: 50000, color: '#047857', textColor: '#ffffff', icon: '💵', dropRate: 3.5 },
  { id: 3, label: 'MYSTÈRE DIAMOND', type: 'mystery', value: 'Montre Vacheron Royale', color: '#6d28d9', textColor: '#ffffff', icon: '🎁', dropRate: 4.0 },
  { id: 4, label: '25 000 JETONS', type: 'chips', value: 25000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 8.0 },
  { id: 5, label: '$25 000 CASH', type: 'cash', value: 25000, color: '#059669', textColor: '#ffffff', icon: '💵', dropRate: 8.0 },
  { id: 6, label: 'VÊTEMENT VIP', type: 'clothing', value: 'Costume Sur-Mesure Diamond', color: '#2563eb', textColor: '#ffffff', icon: '👔', dropRate: 6.0 },
  { id: 7, label: '10 000 JETONS', type: 'chips', value: 10000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 14.5 },
  { id: 8, label: '$10 000 CASH', type: 'cash', value: 10000, color: '#059669', textColor: '#ffffff', icon: '💵', dropRate: 14.5 },
  { id: 9, label: 'CHAMPAGNE VIP', type: 'mystery', value: 'Bouteille Diamond Reserve', color: '#b45309', textColor: '#ffffff', icon: '🍾', dropRate: 5.0 },
  { id: 10, label: '35 000 JETONS', type: 'chips', value: 35000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 5.0 },
  { id: 11, label: '$20 000 CASH', type: 'cash', value: 20000, color: '#059669', textColor: '#ffffff', icon: '💵', dropRate: 7.0 },
  { id: 12, label: 'PASS HIGH ROLLER', type: 'mystery', value: 'Accès Salon Privé VIP', color: '#4f46e5', textColor: '#ffffff', icon: '🔑', dropRate: 2.0 },
  { id: 13, label: '15 000 JETONS', type: 'chips', value: 15000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 10.0 },
  { id: 14, label: '$15 000 CASH', type: 'cash', value: 15000, color: '#059669', textColor: '#ffffff', icon: '💵', dropRate: 8.5 },
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

const DEFAULT_LOGS: AdminLogEntry[] = [];

const CasinoAdminContext = createContext<CasinoAdminContextType | undefined>(undefined);

export const CasinoAdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, resetSpinCooldown, updateProfile } = useCasinoUser();

  // Admin PIN Protection State (Always unlocked for admin console)
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(true);

  const [adminLockoutSecondsRemaining, setAdminLockoutSecondsRemaining] = useState<number>(() => {
    const until = Number(localStorage.getItem('diamond_casino_admin_lockout_until') || sessionStorage.getItem('diamond_casino_admin_lockout_until') || 0);
    const diff = Math.ceil((until - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  });

  useEffect(() => {
    if (adminLockoutSecondsRemaining <= 0) return;
    const interval = setInterval(() => {
      const until = Number(localStorage.getItem('diamond_casino_admin_lockout_until') || sessionStorage.getItem('diamond_casino_admin_lockout_until') || 0);
      const diff = Math.ceil((until - Date.now()) / 1000);
      if (diff <= 0) {
        setAdminLockoutSecondsRemaining(0);
        localStorage.removeItem('diamond_casino_admin_lockout_until');
        sessionStorage.removeItem('diamond_casino_admin_lockout_until');
      } else {
        setAdminLockoutSecondsRemaining(diff);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [adminLockoutSecondsRemaining]);

  const [adminPin, setAdminPin] = useState<string>(() => {
    const savedPin = localStorage.getItem(ADMIN_PIN_KEY);
    return savedPin || DEFAULT_PIN;
  });

  // Load saved state or defaults safely
  const [segments, setSegments] = useState<WheelSegmentConfig[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_ADMIN_KEY}_segments`);
    return safeJsonParse<WheelSegmentConfig[]>(saved, DEFAULT_SEGMENTS);
  });

  const [podiumVehicle, setPodiumVehicle] = useState<PodiumVehicleConfig>(() => {
    const saved = localStorage.getItem(`${STORAGE_ADMIN_KEY}_podium`);
    const parsed = safeJsonParse<PodiumVehicleConfig>(saved, DEFAULT_PODIUM);
    if (!parsed.imageUrl || parsed.imageUrl.includes('unsplash.com')) {
      parsed.imageUrl = '/podium_supercar.jpg';
      localStorage.setItem(`${STORAGE_ADMIN_KEY}_podium`, JSON.stringify(parsed));
    }
    return parsed;
  });

  const [wheelCooldownHours, setWheelCooldownHoursState] = useState<number>(() => {
    const saved = localStorage.getItem(`${STORAGE_ADMIN_KEY}_cooldown`);
    return safeJsonParse<number>(saved, 24);
  });

  const [economy, setEconomyState] = useState<CasinoEconomyConfig>(() => {
    const saved = localStorage.getItem(`${STORAGE_ADMIN_KEY}_economy`);
    const parsed = safeJsonParse<CasinoEconomyConfig>(saved, DEFAULT_ECONOMY);
    if (parsed.vaultCash === 14250000 || parsed.circulatingChips === 1890000) {
      const cleaned = { ...parsed, vaultCash: 0, circulatingChips: 0 };
      localStorage.setItem(`${STORAGE_ADMIN_KEY}_economy`, JSON.stringify(cleaned));
      return cleaned;
    }
    return parsed;
  });

  const [logs, setLogs] = useState<AdminLogEntry[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_ADMIN_KEY}_logs`);
    return safeJsonParse<AdminLogEntry[]>(saved, DEFAULT_LOGS);
  });

  const [totalSpinsCount, setTotalSpinsCount] = useState<number>(0);

  const [citizens, setCitizens] = useState<MockCitizen[]>([]);

  // Sync to Cloud Supabase on Initial Load
  useEffect(() => {
    // 1. Fetch remote settings from Supabase if available
    dbGetSetting<WheelSegmentConfig[]>('wheel_segments').then((remoteSegments) => {
      if (remoteSegments && Array.isArray(remoteSegments) && remoteSegments.length > 0) {
        setSegments(remoteSegments);
      }
    });

    dbGetSetting<PodiumVehicleConfig>('podium_vehicle').then((remotePodium) => {
      if (remotePodium && remotePodium.name) {
        if (!remotePodium.imageUrl || remotePodium.imageUrl.includes('unsplash.com')) {
          remotePodium.imageUrl = '/podium_supercar.jpg';
        }
        setPodiumVehicle(remotePodium);
      }
    });

    dbGetSetting<number>('wheel_cooldown').then((remoteCooldown) => {
      if (remoteCooldown && typeof remoteCooldown === 'number') {
        setWheelCooldownHoursState(remoteCooldown);
      }
    });

    dbGetSetting<CasinoEconomyConfig>('economy_config').then((remoteEcon) => {
      if (remoteEcon && typeof remoteEcon.vaultCash === 'number') {
        if (remoteEcon.vaultCash === 14250000 || remoteEcon.circulatingChips === 1890000) {
          remoteEcon.vaultCash = 0;
          remoteEcon.circulatingChips = 0;
          dbSetSetting('economy_config', remoteEcon);
        }
        setEconomyState(remoteEcon);
      }
    });

    // 2. Fetch remote admin logs from Supabase
    dbFetchAdminLogs(30).then((cloudLogs) => {
      if (cloudLogs && cloudLogs.length > 0) {
        const formatted: AdminLogEntry[] = cloudLogs.map((l) => ({
          id: l.id || `log_${Date.now()}`,
          timestamp: l.created_at ? new Date(l.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Récent',
          action: l.action,
          category: l.category,
          detail: l.detail,
          author: l.author || 'Console Admin',
        }));
        setLogs(formatted);
      }
    });

    // 3. Fetch registered citizen profiles from Supabase and merge with mock citizens
    refreshCitizens();
  }, []);

  const refreshCitizens = async () => {
    try {
      const cloudProfiles = await dbFetchProfiles(100);
      if (cloudProfiles && cloudProfiles.length > 0) {
        setCitizens((prev) => {
          const map = new Map<string, MockCitizen>();
          prev.forEach((c) => map.set(c.citizenId, c));

          cloudProfiles.forEach((cp) => {
            const cid = cp.citizen_id || cp.identifier || cp.id || cp.discord_id;
            if (!cid) return;
            const names = (cp.rp_name || cp.full_name || `${cp.rp_first_name || ''} ${cp.rp_last_name || ''}`).split('|')[0].trim().split(' ');
            const discordId = cp.discord_id || (cp.identifier && /^\d{17,20}$/.test(cp.identifier) ? cp.identifier : undefined);
            const matricule = cp.citizen_id || (cp.identifier && !cp.identifier.startsWith('test_') ? cp.identifier : cid.length > 15 ? cid.slice(-4) : cid);
            const existing = map.get(matricule) || map.get(cid);
            const assignedRole = (cp.vip_level && cp.vip_level.toUpperCase().includes('DÉV'))
              ? 'DÉVELOPPEUR'
              : (cp.vip_level && (cp.vip_level.toUpperCase().includes('FOND') || cp.vip_level.toUpperCase().includes('PROPRIÉTAIRE')))
                ? 'FONDATEUR'
                : (cp.role === 'owner' ? (cp.vip_level || 'FONDATEUR') : (cp.vip_level || cp.role || 'MEMBRE'));

            const savedNoteRaw = localStorage.getItem(`diamond_casino_citizen_note_${matricule}`) || (cid ? localStorage.getItem(`diamond_casino_citizen_note_${cid}`) : null);
            const savedNote = savedNoteRaw ? safeJsonParse<any>(savedNoteRaw, null) : null;

            map.set(matricule, {
              citizenId: matricule,
              rpFirstName: cp.rp_first_name || names[0] || 'Citoyen',
              rpLastName: cp.rp_last_name || names.slice(1).join(' ') || `#${matricule}`,
              role: assignedRole,
              chips: cp.chips_balance ?? cp.chips ?? (existing?.chips || 0),
              cash: cp.cash_balance ?? cp.cash ?? (existing?.cash || 0),
              phoneNumber: cp.phone_number || existing?.phoneNumber,
              wheelCooldownRemaining: cp.last_wheel_spin ? 'Cooldown actif' : 'Disponible',
              lastSpinTimestamp: cp.last_wheel_spin ? new Date(cp.last_wheel_spin).getTime() : null,
              discordId: discordId,
              discordTag: (cp as any).discord_tag || (cp.full_name && cp.full_name.includes('#') ? cp.full_name.split('|')[0].trim() : (existing?.discordTag || undefined)),
              avatarUrl: cp.avatar_url,
              createdAt: cp.created_at,
              totalWon: cp.total_won ?? existing?.totalWon ?? 0,
              adminNote: savedNote?.adminNote || existing?.adminNote,
              adminNoteAuthor: savedNote?.adminNoteAuthor || existing?.adminNoteAuthor,
              adminNoteDate: savedNote?.adminNoteDate || existing?.adminNoteDate,
              adminNoteSeverity: savedNote?.adminNoteSeverity || existing?.adminNoteSeverity,
            });
          });

          return Array.from(map.values());
        });
      }
    } catch (err) {
      console.warn('[CasinoAdmin] Error refreshing citizens:', err);
    }
  };

  // Persist segments locally & Supabase
  useEffect(() => {
    localStorage.setItem(`${STORAGE_ADMIN_KEY}_segments`, JSON.stringify(segments));
    dbSetSetting('wheel_segments', segments);
  }, [segments]);

  // Persist podium locally & Supabase
  useEffect(() => {
    localStorage.setItem(`${STORAGE_ADMIN_KEY}_podium`, JSON.stringify(podiumVehicle));
    dbSetSetting('podium_vehicle', podiumVehicle);
  }, [podiumVehicle]);

  // Persist cooldown locally & Supabase
  useEffect(() => {
    localStorage.setItem(`${STORAGE_ADMIN_KEY}_cooldown`, JSON.stringify(wheelCooldownHours));
    dbSetSetting('wheel_cooldown', wheelCooldownHours);
  }, [wheelCooldownHours]);

  // Persist economy locally & Supabase
  useEffect(() => {
    localStorage.setItem(`${STORAGE_ADMIN_KEY}_economy`, JSON.stringify(economy));
    dbSetSetting('economy_config', economy);
  }, [economy]);

  // Persist logs locally
  useEffect(() => {
    localStorage.setItem(`${STORAGE_ADMIN_KEY}_logs`, JSON.stringify(logs));
  }, [logs]);

  // Auth Methods
  const unlockAdmin = (pin: string): boolean => {
    if (adminLockoutSecondsRemaining > 0) {
      return false;
    }

    const cleanPin = pin.trim();
    if (cleanPin === adminPin) {
      setIsAdminUnlocked(true);
      sessionStorage.setItem('diamond_casino_admin_auth', 'true');
      localStorage.removeItem('diamond_casino_admin_failed_attempts');
      localStorage.removeItem('diamond_casino_admin_lockout_until');
      sessionStorage.removeItem('diamond_casino_admin_failed_attempts');
      sessionStorage.removeItem('diamond_casino_admin_lockout_until');
      setAdminLockoutSecondsRemaining(0);
      addLog('Connexion Console Admin', 'SYSTEM', 'Authentification par clé maître réussie');
      return true;
    }

    // Rate limiting: 5 failed attempts locks out for 60s
    const currentFailed = Number(localStorage.getItem('diamond_casino_admin_failed_attempts') || sessionStorage.getItem('diamond_casino_admin_failed_attempts') || 0) + 1;
    localStorage.setItem('diamond_casino_admin_failed_attempts', String(currentFailed));
    sessionStorage.setItem('diamond_casino_admin_failed_attempts', String(currentFailed));

    if (currentFailed >= 5) {
      const lockUntil = Date.now() + 60 * 1000;
      localStorage.setItem('diamond_casino_admin_lockout_until', String(lockUntil));
      sessionStorage.setItem('diamond_casino_admin_lockout_until', String(lockUntil));
      setAdminLockoutSecondsRemaining(60);
      addLog('Alerte Sécurité Console', 'SYSTEM', '5 tentatives consécutives échouées. Console verrouillée pendant 60 secondes.');
    } else {
      addLog('Échec d\'authentification Admin', 'SYSTEM', `Tentative avec code invalide rejetée (${currentFailed}/5)`);
    }

    return false;
  };

  const lockAdmin = () => {
    setIsAdminUnlocked(false);
    sessionStorage.removeItem('diamond_casino_admin_auth');
  };

  const changeAdminPin = (oldPin: string, newPin: string): boolean => {
    if (oldPin.trim() === adminPin && newPin.trim().length >= 4) {
      const sanitized = sanitizeText(newPin, 10);
      setAdminPin(sanitized);
      localStorage.setItem(ADMIN_PIN_KEY, sanitized);
      addLog('Modification Code Admin', 'SYSTEM', 'Clé d\'accès gérance mise à jour');
      return true;
    }
    return false;
  };

  const updateSegment = (id: number, patch: Partial<WheelSegmentConfig>) => {
    const cleanLabel = patch.label !== undefined ? sanitizeText(patch.label, 30) : undefined;
    const cleanDropRate = patch.dropRate !== undefined ? sanitizeNumber(patch.dropRate, 0, 100) : undefined;

    setSegments((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          return {
            ...s,
            ...patch,
            ...(cleanLabel ? { label: cleanLabel } : {}),
            ...(cleanDropRate !== undefined ? { dropRate: cleanDropRate } : {}),
          };
        }
        return s;
      })
    );
    addLog('Modification segment Roue', 'WHEEL', `Segment #${id} mis à jour (${cleanLabel || ''})`);
  };

  const updatePodiumVehicle = (patch: Partial<PodiumVehicleConfig>) => {
    const cleanName = patch.name !== undefined ? sanitizeText(patch.name, 40) : undefined;
    const cleanValue = patch.value !== undefined ? sanitizeNumber(patch.value, 0, 100000000) : undefined;

    setPodiumVehicle((prev) => {
      const updated = {
        ...prev,
        ...patch,
        ...(cleanName ? { name: cleanName } : {}),
        ...(cleanValue !== undefined ? { value: cleanValue } : {}),
      };
      if (cleanName) {
        setSegments((sPrev) =>
          sPrev.map((s) => (s.id === 0 ? { ...s, value: cleanName } : s))
        );
      }
      return updated;
    });
    addLog('Véhicule Podium modifié', 'WHEEL', `Nouveau véhicule: ${cleanName || podiumVehicle.name}`);
  };

  const setWheelCooldownHours = (hours: number) => {
    const validHours = sanitizeNumber(hours, 1, 168, 24);
    setWheelCooldownHoursState(validHours);
    addLog('Délai Roue ajusté', 'WHEEL', `Cooldown fixé à ${validHours}h`);
  };

  const resetWheelDefaults = () => {
    setSegments(DEFAULT_SEGMENTS);
    setPodiumVehicle(DEFAULT_PODIUM);
    setWheelCooldownHoursState(24);
    addLog('Réinitialisation Roue', 'WHEEL', 'Paramètres par défaut rétablis');
  };

  const updateEconomy = (patch: Partial<CasinoEconomyConfig>) => {
    setEconomyState((prev) => ({
      ...prev,
      ...patch,
      vaultCash: patch.vaultCash !== undefined ? sanitizeNumber(patch.vaultCash, 0) : prev.vaultCash,
      circulatingChips: patch.circulatingChips !== undefined ? sanitizeNumber(patch.circulatingChips, 0) : prev.circulatingChips,
      jackpotAmount: patch.jackpotAmount !== undefined ? sanitizeNumber(patch.jackpotAmount, 0) : prev.jackpotAmount,
    }));
    addLog('Économie mise à jour', 'ECONOMY', 'Paramètres financiers modifiés');
  };

  const updateCitizen = (citizenId: string, patch: Partial<MockCitizen>) => {
    const existing = citizens.find((c) => c.citizenId === citizenId || (c.discordId && c.discordId === citizenId));
    if (!existing) return;

    const newCitizenId = patch.citizenId ? sanitizeText(patch.citizenId.replace(/^#/, ''), 32) : existing.citizenId;
    const cleanFirstName = patch.rpFirstName ? sanitizeText(patch.rpFirstName, 25) : existing.rpFirstName;
    const cleanLastName = patch.rpLastName ? sanitizeText(patch.rpLastName, 25) : existing.rpLastName;
    const cleanRole = patch.role ? sanitizeText(patch.role, 30) : existing.role;
    const cleanPhone = patch.phoneNumber !== undefined ? sanitizeText(patch.phoneNumber, 20) : existing.phoneNumber;
    const cleanAvatar = patch.avatarUrl !== undefined ? sanitizeText(patch.avatarUrl, 300) : existing.avatarUrl;
    const cleanDiscordId = patch.discordId !== undefined ? sanitizeText(patch.discordId, 32) : existing.discordId;

    const updatedCitizen: MockCitizen = {
      ...existing,
      ...patch,
      citizenId: newCitizenId,
      rpFirstName: cleanFirstName,
      rpLastName: cleanLastName,
      role: cleanRole,
      phoneNumber: cleanPhone,
      avatarUrl: cleanAvatar,
      discordId: cleanDiscordId,
      chips: patch.chips !== undefined ? sanitizeNumber(patch.chips, 0) : existing.chips,
      cash: patch.cash !== undefined ? sanitizeNumber(patch.cash, 0) : existing.cash,
      adminNote: patch.adminNote !== undefined ? patch.adminNote : existing.adminNote,
      adminNoteAuthor: patch.adminNoteAuthor !== undefined ? patch.adminNoteAuthor : existing.adminNoteAuthor,
      adminNoteDate: patch.adminNoteDate !== undefined ? patch.adminNoteDate : existing.adminNoteDate,
      adminNoteSeverity: patch.adminNoteSeverity !== undefined ? patch.adminNoteSeverity : existing.adminNoteSeverity,
    };

    if (patch.adminNote !== undefined) {
      if (patch.adminNote && patch.adminNote.trim()) {
        try {
          localStorage.setItem(
            `diamond_casino_citizen_note_${newCitizenId}`,
            JSON.stringify({
              adminNote: patch.adminNote,
              adminNoteAuthor: patch.adminNoteAuthor || existing.adminNoteAuthor,
              adminNoteDate: patch.adminNoteDate || existing.adminNoteDate,
              adminNoteSeverity: patch.adminNoteSeverity || existing.adminNoteSeverity || 'surveillance',
            })
          );
        } catch {}
      } else {
        try {
          localStorage.removeItem(`diamond_casino_citizen_note_${newCitizenId}`);
          localStorage.removeItem(`diamond_casino_citizen_note_${citizenId}`);
        } catch {}
      }
    }

    setCitizens((prev) =>
      prev.map((c) => (c.citizenId === citizenId || (existing.discordId && c.discordId === existing.discordId) ? updatedCitizen : c))
    );

    // Sync to active logged-in user if this citizen is currently browsing
    if (
      user &&
      (user.citizenId === citizenId ||
        user.citizenId === newCitizenId ||
        user.id === citizenId ||
        (existing.discordId && user.id === existing.discordId))
    ) {
      updateProfile({
        rpFirstName: updatedCitizen.rpFirstName,
        rpLastName: updatedCitizen.rpLastName,
        citizenId: updatedCitizen.citizenId,
      });
    }

    // Persist to Supabase profiles
    dbUpsertProfile({
      discord_id: updatedCitizen.discordId || (updatedCitizen.citizenId.length >= 17 ? updatedCitizen.citizenId : undefined),
      citizen_id: updatedCitizen.citizenId,
      rp_first_name: updatedCitizen.rpFirstName,
      rp_last_name: updatedCitizen.rpLastName,
      rp_name: `${updatedCitizen.rpFirstName} ${updatedCitizen.rpLastName}`.trim(),
      role: updatedCitizen.role,
      vip_level: updatedCitizen.role,
      chips: updatedCitizen.chips,
      chips_balance: updatedCitizen.chips,
      cash: updatedCitizen.cash,
      cash_balance: updatedCitizen.cash,
      phone_number: updatedCitizen.phoneNumber,
      avatar_url: updatedCitizen.avatarUrl,
      last_wheel_spin: updatedCitizen.lastSpinTimestamp ? new Date(updatedCitizen.lastSpinTimestamp).toISOString() : null,
    }).catch((err) => {
      console.warn('[CasinoAdmin] dbUpsertProfile failed:', err);
    });

    addLog('Citoyen modifié', 'CITIZEN', `Mise à jour fiche #${newCitizenId} (${cleanFirstName} ${cleanLastName})`);
  };

  const resetCitizenWheelCooldown = (citizenId: string) => {
    setCitizens((prev) =>
      prev.map((c) =>
        c.citizenId === citizenId
          ? { ...c, wheelCooldownRemaining: 'Disponible', lastSpinTimestamp: null }
          : c
      )
    );

    // If current logged-in user matches, reset their React state immediately!
    if (user && (user.citizenId === citizenId || user.id === citizenId)) {
      resetSpinCooldown();
    }

    try {
      const activeUser = localStorage.getItem('diamond_casino_user_v3');
      if (activeUser) {
        const parsed = safeJsonParse<any>(activeUser, null);
        if (parsed && (parsed.citizenId === citizenId || parsed.id === citizenId)) {
          parsed.lastWheelSpin = null;
          localStorage.setItem('diamond_casino_user_v3', JSON.stringify(parsed));
        }
      }
    } catch {
      // ignore
    }

    // Reset in Supabase profiles
    dbUpsertProfile({
      identifier: citizenId,
      rp_name: 'Citoyen',
      vip_level: 'MEMBRE',
      chips_balance: 0,
      cash_balance: 0,
      last_wheel_spin: null,
    }).catch(() => {});

    // Broadcast reset event for all components & tabs
    window.dispatchEvent(new Event('diamond_wheel_cooldown_reset'));
    addLog('Reset Cooldown Roue', 'CITIZEN', `Délai remis à zéro pour #${citizenId}`);
  };

  const resetAllWheelCooldowns = () => {
    setCitizens((prev) =>
      prev.map((c) => ({
        ...c,
        wheelCooldownRemaining: 'Disponible',
        lastSpinTimestamp: null,
      }))
    );

    resetSpinCooldown();

    try {
      const activeUser = localStorage.getItem('diamond_casino_user_v3');
      if (activeUser) {
        const parsed = safeJsonParse<any>(activeUser, null);
        if (parsed) {
          parsed.lastWheelSpin = null;
          localStorage.setItem('diamond_casino_user_v3', JSON.stringify(parsed));
        }
      }
    } catch {
      // ignore
    }

    // Broadcast reset event for all components & tabs
    window.dispatchEvent(new Event('diamond_wheel_cooldown_reset'));
    addLog('Reset Global Cooldowns', 'WHEEL', 'Tous les joueurs peuvent maintenant tourner la roue');
  };

  const deleteCitizen = (citizenId: string) => {
    setCitizens((prev) => prev.filter((c) => c.citizenId !== citizenId));
    dbDeleteProfile(citizenId).catch(() => {});
    addLog('Citoyen supprimé', 'CITIZEN', `Fiche #${citizenId} archivée`);
  };

  const addLog = (
    action: string,
    category: 'WHEEL' | 'ECONOMY' | 'CITIZEN' | 'SYSTEM',
    detail: string
  ) => {
    const cleanAction = sanitizeText(action, 80);
    const cleanDetail = sanitizeText(detail, 200);

    const newEntry: AdminLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: 'À l\'instant',
      action: cleanAction,
      category,
      detail: cleanDetail,
      author: 'Console Admin',
    };
    setLogs((prev) => [newEntry, ...prev.slice(0, 49)]);

    // Mirror to Supabase cloud table
    dbAddAdminLog({
      action: cleanAction,
      category,
      detail: cleanDetail,
      author: 'Console Admin',
    });
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const recordSpinEvent = (segment: WheelSegmentConfig, citizenName?: string) => {
    setTotalSpinsCount((c) => c + 1);
    const cleanName = citizenName ? sanitizeText(citizenName, 40) : 'Un joueur';
    addLog(
      'Spin Roue de la Fortune',
      'WHEEL',
      `${cleanName} a obtenu : ${segment.label} (${segment.dropRate}% chance)`
    );
  };

  // Cross-component spin event telemetry listener
  useEffect(() => {
    const handleSpinRecorded = (e: any) => {
      if (e.detail) {
        setTotalSpinsCount((c) => c + 1);
        addLog(
          'Spin Roue de la Fortune',
          'WHEEL',
          `${e.detail.citizenName || 'Un joueur'} a obtenu : ${e.detail.segment}`
        );
      }
    };
    window.addEventListener('diamond_spin_recorded', handleSpinRecorded);
    return () => window.removeEventListener('diamond_spin_recorded', handleSpinRecorded);
  }, []);

  return (
    <CasinoAdminContext.Provider
      value={{
        isAdminUnlocked,
        adminLockoutSecondsRemaining,
        unlockAdmin,
        lockAdmin,
        changeAdminPin,
        segments,
        podiumVehicle,
        wheelCooldownHours,
        updateSegment,
        updatePodiumVehicle,
        setWheelCooldownHours,
        resetWheelDefaults,
        economy,
        updateEconomy,
        citizens,
        updateCitizen,
        resetCitizenWheelCooldown,
        resetAllWheelCooldowns,
        deleteCitizen,
        refreshCitizens,
        logs,
        addLog,
        clearLogs,
        totalSpinsCount,
        recordSpinEvent,
      }}
    >
      {children}
    </CasinoAdminContext.Provider>
  );
};

export const useCasinoAdmin = () => {
  const context = useContext(CasinoAdminContext);
  if (!context) {
    throw new Error('useCasinoAdmin must be used within a CasinoAdminProvider');
  }
  return context;
};
