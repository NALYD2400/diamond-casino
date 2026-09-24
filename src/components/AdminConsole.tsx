import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Disc,
  Users,
  Coins,
  ShieldAlert,
  Server,
  ArrowLeft,
  Search,
  CheckCircle2,
  RefreshCw,
  Sliders,
  DollarSign,
  TrendingUp,
  Download,
  Trash2,
  ExternalLink,
  Edit2,
  Check,
  X,
  Play,
  Activity,
  Sparkles,
  Lock,
  Unlock,
  AlertCircle,
  Terminal,
  Database,
  Radio,
  Zap,
  Crown,
  Copy,
  Trees,
  Code,
  BarChart3,
  FileText,
  Plus,
  Minus,
  Wallet,
} from 'lucide-react';
import {
  useCasinoAdmin,
  type WheelSegmentConfig,
  type RewardType,
  type MockCitizen,
} from '../context/CasinoAdminContext';
import { useCasinoUser } from '../context/CasinoUserContext';
import { dbCheckHealth, type SupabaseHealthResult, supabase } from '../lib/supabase';
import { getDefaultDiscordAvatar, hasAdminPermissions } from '../lib/discord';
import { CitizenProfileSheet } from './CitizenProfileSheet';

export type AdminTab = 'overview' | 'stats' | 'citizens' | 'wheel' | 'economy' | 'logs' | 'system' | 'dev';

interface AdminConsoleProps {
  initialTab?: AdminTab;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({ initialTab }) => {
  const {
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
    adjustCitizenBalance,
    setCitizenVip,
    vipRequests,
    rejectVipRequest,
    lastError,
    resetCitizenWheelCooldown,
    resetAllWheelCooldowns,
    deleteCitizen,
    refreshCitizens,
    logs,
    addLog,
    clearLogs,
    totalSpinsCount,
  } = useCasinoAdmin();

  const { user, isLoading: isUserLoading } = useCasinoUser();

  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    if (initialTab) return initialTab;
    if (typeof window !== 'undefined' && window.location.hash === '#dev') return 'dev';
    return 'overview';
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [searchCitizen, setSearchCitizen] = useState<string>('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [deletingCitizen, setDeletingCitizen] = useState<MockCitizen | null>(null);

  const handleCopyDiscordId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    showToast(`ID ${id} copié`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      await refreshCitizens();
      showToast('Données synchronisées avec Supabase');
    } catch {
      showToast('Erreur de synchronisation');
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const [editingSegment, setEditingSegment] = useState<WheelSegmentConfig | null>(null);
  const [editingCitizen, setEditingCitizen] = useState<MockCitizen | null>(null);

  // Quick Chips Adjuster States
  const [quickMoneyCitizen, setQuickMoneyCitizen] = useState<MockCitizen | null>(null);
  const [quickMoneyOperation, setQuickMoneyOperation] = useState<'add' | 'remove'>('add');
  const [quickMoneyAmount, setQuickMoneyAmount] = useState<string>('');
  const [quickMoneyReason, setQuickMoneyReason] = useState<string>('');

  const handleApplyQuickMoney = async (explicitDelta?: number) => {
    if (!quickMoneyCitizen) return;

    const amt = explicitDelta !== undefined ? explicitDelta : Math.max(0, parseInt(quickMoneyAmount) || 0);
    if (!amt || amt <= 0 || isNaN(amt)) {
      showToast('Veuillez entrer un montant valide supérieur à 0');
      return;
    }

    const delta = (quickMoneyOperation === 'add' ? 1 : -1) * amt;
    const ok = await adjustCitizenBalance(
      quickMoneyCitizen.profileId,
      delta,
      0,
      quickMoneyReason.trim() || `Ajustement console (${delta > 0 ? '+' : ''}${delta.toLocaleString('fr-FR')} jetons)`,
    );
    if (!ok) return;

    showToast(`Solde #${quickMoneyCitizen.citizenId} mis à jour (${delta > 0 ? '+' : ''}${delta.toLocaleString('fr-FR')} jetons)`);
    setQuickMoneyCitizen(null);
    setQuickMoneyAmount('');
    setQuickMoneyReason('');
  };

  // Surface server-side refusals (RLS / role checks) as toasts
  useEffect(() => {
    if (lastError) showToast(lastError.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastError]);

  const [vaultActionAmount, setVaultActionAmount] = useState<string>('');
  const [simResults, setSimResults] = useState<{ total: number; counts: Record<number, number> } | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [healthData, setHealthData] = useState<SupabaseHealthResult | null>(null);

  // Dev tab specific states
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [customChipsAmount, setCustomChipsAmount] = useState<string>('50000');
  const [queryOutput, setQueryOutput] = useState<string | null>(null);
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [storageUsage, setStorageUsage] = useState<number>(0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const totalDropRate = useMemo(() => {
    return segments.reduce((sum, s) => sum + (Number(s.dropRate) || 0), 0);
  }, [segments]);

  useEffect(() => {
    dbCheckHealth().then(setHealthData);
    const interval = setInterval(() => {
      dbCheckHealth().then(setHealthData);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleRunSimulation = (spins = 1000) => {
    setIsSimulating(true);
    setTimeout(() => {
      const counts: Record<number, number> = {};
      segments.forEach((s) => (counts[s.id] = 0));

      // Same weighting as the server (spin_wheel): a 0 % segment never wins
      const weightOf = (s: WheelSegmentConfig) => Math.max(0, Number(s.dropRate) || 0);
      const totalWeight = segments.reduce((acc, s) => acc + weightOf(s), 0);

      for (let i = 0; i < spins; i++) {
        let rand = Math.random() * totalWeight;
        let chosenId = segments[segments.length - 1].id;
        for (let j = 0; j < segments.length; j++) {
          const w = totalWeight > 0 ? weightOf(segments[j]) : 1;
          if (w > 0 && rand < w) {
            chosenId = segments[j].id;
            break;
          }
          rand -= w;
        }
        counts[chosenId] = (counts[chosenId] || 0) + 1;
      }

      setSimResults({ total: spins, counts });
      setIsSimulating(false);
      showToast(`Simulation de ${spins.toLocaleString()} spins calculée.`);
    }, 350);
  };

  const handleExportConfig = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      wheel: { cooldownHours: wheelCooldownHours, podiumVehicle, segments },
      economy,
      system: { logsCount: logs.length, totalSpinsCount },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diamond_casino_admin_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Configuration exportée avec succès.');
  };

  const measureHealth = async () => {
    setIsPinging(true);
    try {
      const res = await dbCheckHealth();
      setHealthData(res);
      showToast(`Ping Supabase : ${res.latencyMs}ms`);
    } catch {
      showToast('Erreur lors du test de latence.');
    } finally {
      setIsPinging(false);
    }
  };

  const handleAddCustomChips = async (explicit?: number) => {
    const amt = explicit ?? Number(customChipsAmount);
    if (!user || !amt || amt <= 0) return;
    const ok = await adjustCitizenBalance(user.id, amt, 0, 'Injection Développeur (test)');
    if (ok) showToast(`+${amt.toLocaleString('fr-FR')} jetons crédités.`);
  };

  const handleSetVipTier = async (tier: 'SILVER' | 'GOLD' | 'DIAMOND') => {
    if (!user) return;
    const ok = await setCitizenVip(user.id, tier, false);
    if (ok) showToast(`Statut VIP activé : ${tier}`);
  };

  const handleExecuteQuery = async () => {
    setIsQuerying(true);
    setQueryOutput(null);
    try {
      const tables = ['profiles', 'bets_history', 'casino_transactions', 'admin_logs', 'casino_settings'] as const;
      const counts = await Promise.all(
        tables.map(async (table) => {
          const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
          return [table, error ? `ERREUR : ${error.message}` : count ?? 0] as const;
        }),
      );
      setQueryOutput(
        JSON.stringify(
          {
            executedAt: new Date().toISOString(),
            latencyMs: healthData?.latencyMs ?? null,
            rowsVisibleWithYourRole: Object.fromEntries(counts),
          },
          null,
          2,
        ),
      );
    } catch (e) {
      setQueryOutput(`[EXCEPTION] ${(e as Error).message || 'Erreur réseau'}`);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleClearCache = () => {
    // Only this app's own preferences: never the Supabase session
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('diamond_')) localStorage.removeItem(key);
    }
    showToast('Cache local nettoyé.');
  };

  const handleDownloadFullDump = () => {
    const dump = {
      generatedAt: new Date().toISOString(),
      user: user ? { ...user, transactions: user.transactions.length } : null,
      economy,
      wheel: { cooldownHours: wheelCooldownHours, segments },
      healthData,
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diamond_casino_dev_dump_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Snapshot exporté en JSON.');
  };

  const filteredCitizens = useMemo(() => {
    return citizens.filter((c) => {
      // Role filter
      if (selectedRoleFilter !== 'ALL') {
        const r = (c.role || '').toUpperCase();
        if (selectedRoleFilter === 'DEVELOPPEUR') {
          if (!r.includes('DÉV') && !r.includes('DEV')) return false;
        } else if (selectedRoleFilter === 'FONDATEUR') {
          if ((!r.includes('FOND') && !r.includes('PROPRIÉTAIRE') && !r.includes('OWNER')) || r.includes('DÉV') || r.includes('DEV')) return false;
        } else if (selectedRoleFilter === 'ADMIN') {
          if (!r.includes('ADMIN') || r.includes('DÉV') || r.includes('FOND')) return false;
        } else if (selectedRoleFilter === 'CITOYEN') {
          if (r.includes('FOND') || r.includes('PROPRIÉTAIRE') || r.includes('DÉV') || r.includes('DEV') || r.includes('ADMIN') || r.includes('VIP') || r.includes('ROLLER')) return false;
        } else if (selectedRoleFilter === 'VIP') {
          if (!r.includes('VIP') && !r.includes('ROLLER')) return false;
        }
      }

      // Search query filter
      if (!searchCitizen.trim()) return true;
      const q = searchCitizen.toLowerCase();
      return (
        c.citizenId.toLowerCase().includes(q) ||
        c.rpFirstName.toLowerCase().includes(q) ||
        c.rpLastName.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q) ||
        (c.discordId && c.discordId.includes(q)) ||
        (c.phoneNumber && c.phoneNumber.includes(q))
      );
    });
  }, [citizens, searchCitizen, selectedRoleFilter]);

  const DiscordIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
    <svg className={className} viewBox="0 0 127.14 96.36" fill="currentColor">
      <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z" />
    </svg>
  );

  const renderRoleBadge = (role: string) => {
    const r = (role || '').toUpperCase();
    if (r.includes('DÉV') || r.includes('DEV')) {
      return (
        <span className="bg-[#082f49] text-[#38bdf8] border border-[#0284c7]/40 font-semibold px-2.5 py-1 rounded-full text-xs inline-flex items-center gap-1.5 shadow-[0_0_12px_rgba(56,189,248,0.2)]">
          <Code size={12} className="text-sky-400" />
          Développeur
        </span>
      );
    }
    if (r.includes('FOND') || r.includes('PROPRIÉTAIRE') || r.includes('OWNER')) {
      return (
        <span className="bg-[#281a06] text-[#eab308] border border-[#ca8a04]/40 font-semibold px-2.5 py-1 rounded-full text-xs inline-flex items-center gap-1.5 shadow-[0_0_12px_rgba(234,179,8,0.2)]">
          <Crown size={12} className="text-amber-400" />
          Fondateur
        </span>
      );
    }
    if (r.includes('ADMIN')) {
      return (
        <span className="bg-[#3f1212] text-[#f87171] border border-[#dc2626]/40 font-semibold px-2.5 py-1 rounded-full text-xs inline-flex items-center gap-1.5 shadow-[0_0_12px_rgba(248,113,113,0.2)]">
          <ShieldAlert size={12} className="text-red-400" />
          Admin
        </span>
      );
    }
    if (r.includes('VIP') || r.includes('ROLLER')) {
      return (
        <span className="bg-[#2e1065] text-[#c084fc] border border-[#7e22ce]/40 font-semibold px-2.5 py-1 rounded-full text-xs inline-flex items-center gap-1.5 shadow-[0_0_12px_rgba(192,132,252,0.2)]">
          <Sparkles size={12} className="text-purple-400" />
          {role}
        </span>
      );
    }
    return (
      <span className="bg-[#062c1e] text-[#34d399] border border-[#059669]/40 font-semibold px-2.5 py-1 rounded-full text-xs inline-flex items-center gap-1.5 shadow-[0_0_12px_rgba(52,211,153,0.2)]">
        <Trees size={12} className="text-emerald-400" />
        Citoyen
      </span>
    );
  };

  const formatRegistrationDate = (dateStr?: string) => {
    if (!dateStr) return '20/09/2026';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '20/09/2026';
      return d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '20/09/2026';
    }
  };

  if (isUserLoading) {
    return (
      <div className="w-full h-screen bg-black text-neutral-400 flex items-center justify-center font-['Geist_Mono'] text-xs tracking-[3px] uppercase">
        Vérification des accès…
      </div>
    );
  }

  if (!hasAdminPermissions(user)) {
    return (
      <div className="w-full h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md w-full p-8 rounded-2xl bg-neutral-950 border border-red-500/20 shadow-[0_0_50px_rgba(239,68,68,0.15)] flex flex-col items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-400">
            <Lock size={32} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide mb-1.5">Accès Direction Restreint</h1>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Cette console est strictement réservée à l'équipe de Direction et d'Administration du Diamond Casino.
            </p>
          </div>
          <Link
            to="/espace-membre"
            className="w-full py-3 rounded-xl bg-white text-black text-xs font-bold uppercase tracking-wider hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft size={14} />
            Retour à l'Espace Client
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen overflow-hidden bg-black text-white flex flex-col font-sans select-none antialiased">
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 px-5 py-3 rounded-full bg-white text-black text-xs font-semibold tracking-wide uppercase shadow-[0_0_30px_rgba(255,255,255,0.3)] flex items-center gap-2.5"
          >
            <CheckCircle2 size={15} className="text-black" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <header className="h-16 sm:h-20 border-b border-white/10 px-4 sm:px-8 flex items-center justify-between shrink-0 sticky top-0 z-40 bg-black/80 backdrop-blur-xl">
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            to="/espace-membre"
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2 text-xs"
            title="Retour à l'Espace Membre"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Espace Membre</span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center font-bold font-serif shadow-[0_0_15px_rgba(255,255,255,0.2)]">
              D
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-white uppercase">Console Direction</span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-neutral-300 font-semibold border border-white/10">
                  ADMIN V2
                </span>
              </div>
              <p className="text-[10px] text-neutral-500 font-mono hidden md:block">
                SUPERVISION & GESTION HAUTE VOLÉE FIVE-M
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-5">
          {/* Cloud Health Pill */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                healthData?.online === false ? 'bg-red-500' : 'bg-neutral-300 animate-pulse'
              }`}
            />
            <span className="text-neutral-400">
              SUPABASE :{' '}
              <strong className="text-white">
                {healthData ? (healthData.online ? `${healthData.latencyMs}ms` : 'OFFLINE') : 'SYNC'}
              </strong>
            </span>
          </div>

          {/* Quick link to test wheel */}
          <Link
            to="/roue-de-la-fortune"
            target="_blank"
            className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-neutral-300 hover:text-white hover:bg-white/10 transition-all"
          >
            <Disc size={14} className="text-white" />
            <span>Tester Roue</span>
            <ExternalLink size={11} className="text-neutral-500" />
          </Link>
        </div>
      </header>

      {/* Main Layout: Sidebar + View Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-20 md:w-64 border-r border-white/10 bg-neutral-950/40 flex flex-col justify-between shrink-0 p-3 sm:p-5 h-full overflow-hidden">
          <div className="flex-1 flex flex-col gap-5 overflow-y-auto pr-1 pt-1">

            {/* Menu Group 1: GÉNÉRAL */}
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 px-3 hidden md:block mb-2 font-semibold">
                GÉNÉRAL
              </span>
              <nav className="flex flex-col gap-1">
                {[
                  { id: 'overview', icon: LayoutDashboard, label: "Vue d'ensemble" },
                  { id: 'stats', icon: BarChart3, label: 'Statistiques Générales' },
                  { id: 'citizens', icon: Users, label: 'Utilisateurs & Citoyens' },
                ].map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id as AdminTab)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                        isActive
                          ? 'bg-white text-black font-semibold shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                          : 'text-neutral-400 hover:text-white hover:bg-white/5'
                      }`}
                      title={item.label}
                    >
                      <div className="flex items-center gap-3.5">
                        <Icon size={16} className={isActive ? 'text-black' : 'text-neutral-400'} />
                        <span className="hidden md:inline truncate">{item.label}</span>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Menu Group 2: CASINO & ACTIVITÉS */}
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 px-3 hidden md:block mb-2 font-semibold">
                CASINO & ACTIVITÉS
              </span>
              <nav className="flex flex-col gap-1">
                {[
                  { id: 'wheel', icon: Disc, label: 'Roue de Fortune' },
                  { id: 'economy', icon: Coins, label: 'Économie & Caisse' },
                ].map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id as AdminTab)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                        isActive
                          ? 'bg-white text-black font-semibold shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                          : 'text-neutral-400 hover:text-white hover:bg-white/5'
                      }`}
                      title={item.label}
                    >
                      <div className="flex items-center gap-3.5">
                        <Icon size={16} className={isActive ? 'text-black' : 'text-neutral-400'} />
                        <span className="hidden md:inline truncate">{item.label}</span>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Menu Group 3: DÉVELOPPEUR */}
            <div>
              <div className="flex items-center justify-between px-3 hidden md:flex mb-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 font-semibold">
                  DÉVELOPPEUR
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 font-bold border border-sky-500/20">
                  DEV
                </span>
              </div>
              <nav className="flex flex-col gap-1">
                {[
                  { id: 'logs', icon: ShieldAlert, label: 'Logs & Sécurité' },
                  { id: 'system', icon: Server, label: 'Système & Serveur' },
                  { id: 'dev', icon: Terminal, label: 'Console Dev' },
                ].map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id as AdminTab)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                        isActive
                          ? 'bg-white text-black font-semibold shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                          : 'text-neutral-400 hover:text-white hover:bg-white/5'
                      }`}
                      title={item.label}
                    >
                      <div className="flex items-center gap-3.5">
                        <Icon size={16} className={isActive ? 'text-black' : 'text-neutral-400'} />
                        <span className="hidden md:inline truncate">{item.label}</span>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Bottom Sidebar: User Profile Card (Fixed at bottom) */}
          <div className="pt-4 border-t border-white/10 shrink-0">
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/10 border border-white/20 overflow-hidden flex items-center justify-center font-bold text-xs text-white shrink-0">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.rpFirstName || 'Avatar'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{user?.rpFirstName ? user.rpFirstName.charAt(0) : 'A'}</span>
                )}
              </div>
              <div className="hidden md:flex flex-col min-w-0">
                <span className="text-xs font-bold text-white truncate leading-tight">
                  {user ? `${user.rpFirstName} ${user.rpLastName}` : ''}
                </span>
                <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider mt-0.5">
                  {user?.role}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto bg-black p-4 sm:p-8 lg:p-10">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="max-w-6xl mx-auto flex flex-col gap-8 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-1">
                    Vue d'ensemble • Direction
                  </h1>
                  <p className="text-xs sm:text-sm text-neutral-400">
                    Statistiques de la caisse, jetons en circulation et flux joueurs en direct.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {(economy.vaultCash > 0 || economy.circulatingChips > 0) && (
                    <button
                      onClick={() => {
                        updateEconomy({ vaultCash: 0, circulatingChips: 0 });
                        showToast('Trésorerie réinitialisée à 0.');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-medium text-neutral-300 hover:text-white transition-colors cursor-pointer"
                    >
                      Remise à 0$
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab('wheel')}
                    className="px-4 py-2 rounded-xl bg-white text-black text-xs font-semibold uppercase tracking-wider hover:bg-neutral-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                  >
                    Gérer la Roue
                  </button>
                </div>
              </div>

              {/* Pending VIP requests */}
              {vipRequests.length > 0 && (
                <div className="p-5 rounded-2xl bg-amber-500/[0.04] border border-amber-500/25 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-amber-300 text-xs font-bold uppercase tracking-wider">
                    <Crown size={14} /> Demandes VIP en attente ({vipRequests.length})
                  </div>
                  {vipRequests.map((req) => (
                    <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-black/40 border border-white/5">
                      <div className="text-xs">
                        <span className="text-white font-semibold">
                          {req.citizen ? `${req.citizen.rpFirstName} ${req.citizen.rpLastName}` : 'Citoyen'}
                        </span>
                        <span className="text-neutral-500 font-mono"> #{req.citizen?.citizenId ?? '?'}</span>
                        <span className="text-neutral-400"> — carte </span>
                        <span className="text-amber-300 font-bold">{req.tier}</span>
                        <span className="text-neutral-500"> · {new Date(req.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (await setCitizenVip(req.profileId, req.tier, true)) showToast(`VIP ${req.tier} activé (paiement validé).`);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white text-black text-[11px] font-bold uppercase tracking-wider hover:bg-neutral-200 cursor-pointer"
                        >
                          Valider
                        </button>
                        <button
                          onClick={async () => {
                            if (await rejectVipRequest(req.id)) showToast('Demande VIP refusée.');
                          }}
                          className="px-3 py-1.5 rounded-lg border border-white/15 text-neutral-300 text-[11px] font-bold uppercase tracking-wider hover:bg-white/10 cursor-pointer"
                        >
                          Refuser
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 4 Primary KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col justify-between gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
                      Coffre-Fort Central
                    </span>
                    <DollarSign size={16} className="text-neutral-500" />
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold text-white font-mono tracking-tight">
                      ${economy.vaultCash.toLocaleString()}
                    </div>
                    <span className="text-[11px] text-neutral-500 mt-1 block">
                      Trésorerie globale du casino
                    </span>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col justify-between gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
                      Jetons en Circulation
                    </span>
                    <Coins size={16} className="text-neutral-500" />
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold text-white font-mono tracking-tight">
                      {economy.circulatingChips.toLocaleString()}
                    </div>
                    <span className="text-[11px] text-neutral-500 mt-1 block">
                      Taux : 1 Jeton = ${economy.chipToCashRate}
                    </span>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col justify-between gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
                      Spins Enregistrés
                    </span>
                    <Disc size={16} className="text-neutral-500" />
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold text-white font-mono tracking-tight">
                      {totalSpinsCount}
                    </div>
                    <span className="text-[11px] text-neutral-500 mt-1 block">
                      Tirages effectués par les membres
                    </span>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col justify-between gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
                      Citoyens Enregistrés
                    </span>
                    <Users size={16} className="text-neutral-500" />
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold text-white font-mono tracking-tight">
                      {citizens.length}
                    </div>
                    <span className="text-[11px] text-neutral-500 mt-1 block">
                      Comptes FiveM & Discord synchronisés
                    </span>
                  </div>
                </div>
              </div>

              {/* Status and Diagnostics Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <span className="text-xs uppercase tracking-wider text-neutral-400 font-semibold flex items-center gap-2">
                      <Activity size={14} className="text-white" />
                      Services Cloud & Base de Données
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">LIVE HEARTBEAT</span>
                  </div>

                  <div className="space-y-3 font-mono text-xs">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <span className="text-neutral-400">PostgreSQL Cloud (Supabase)</span>
                      <span className={healthData?.online ? 'text-white font-bold' : 'text-red-400'}>
                        {healthData?.online ? `OPÉRATIONNEL (${healthData.latencyMs}ms)` : 'DÉCONNECTÉ'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <span className="text-neutral-400">Webhook Discord Rôles</span>
                      <span className="text-white font-bold">CONNECTÉ (Synchro active)</span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <span className="text-neutral-400">Mode Maintenance</span>
                      <span className={economy.maintenanceMode ? 'text-amber-400 font-bold' : 'text-neutral-300'}>
                        {economy.maintenanceMode ? 'VERROUILLÉ' : 'OUVERT AUX JOUEURS'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <span className="text-xs uppercase tracking-wider text-neutral-400 font-semibold flex items-center gap-2">
                      <ShieldAlert size={14} className="text-white" />
                      Dernières Activités & Sécurité
                    </span>
                    <button
                      onClick={() => setActiveTab('logs')}
                      className="text-[10px] font-mono text-neutral-400 hover:text-white uppercase"
                    >
                      Voir Tout →
                    </button>
                  </div>

                  {logs.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-8 text-neutral-500 text-xs">
                      <p>Aucun événement récent enregistré.</p>
                      <span className="text-[10px] text-neutral-600 mt-1">La caisse et la roue sont prêtes.</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {logs.slice(0, 3).map((log) => (
                        <div
                          key={log.id}
                          className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-semibold text-white">{log.detail}</div>
                            <span className="text-[10px] text-neutral-500">{log.action} • {log.author}</span>
                          </div>
                          <span className="text-[10px] font-mono text-neutral-400">{log.timestamp}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WHEEL OF FORTUNE */}
          {activeTab === 'wheel' && (
            <div className="max-w-6xl mx-auto flex flex-col gap-8 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-1">
                    Roue de la Fortune
                  </h1>
                  <p className="text-xs sm:text-sm text-neutral-400">
                    Gérez le véhicule du podium, les pourcentages de drop et les 16 segments.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => handleRunSimulation(1000)}
                    disabled={isSimulating}
                    className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-medium text-neutral-200 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Play size={13} />
                    <span>{isSimulating ? 'Calcul...' : 'Simuler 1 000 Spins'}</span>
                  </button>
                  <button
                    onClick={async () => {
                      if (await resetAllWheelCooldowns()) showToast('Tous les cooldowns de roue ont été réinitialisés.');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-medium text-neutral-200 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw size={13} />
                    <span>Reset Cooldowns</span>
                  </button>
                  <button
                    onClick={() => {
                      resetWheelDefaults();
                      showToast('Configuration par défaut restaurée.');
                    }}
                    className="px-3.5 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Réinitialiser
                  </button>
                </div>
              </div>

              {/* Simulation Result Drawer if active */}
              {simResults && (
                <div className="p-6 rounded-2xl bg-neutral-950 border border-white/20 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-bold flex items-center gap-2">
                      <Sparkles size={14} className="text-white" />
                      Résultats du Test ({simResults.total} spins)
                    </span>
                    <button
                      onClick={() => setSimResults(null)}
                      className="text-xs text-neutral-500 hover:text-white"
                    >
                      Fermer
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
                    {segments.map((seg) => {
                      const count = simResults.counts[seg.id] || 0;
                      const pct = ((count / simResults.total) * 100).toFixed(1);
                      return (
                        <div
                          key={seg.id}
                          className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-1 text-center"
                        >
                          <span className="text-[10px] text-neutral-400 truncate">{seg.label}</span>
                          <span className="text-lg font-bold text-white font-mono">{count}</span>
                          <span className="text-[10px] font-mono text-neutral-500">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Podium & Timer Configuration */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Podium Vehicle Box */}
                <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col gap-5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-white">
                      Véhicule du Podium
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400 uppercase">
                      Segment #0
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-5 items-center">
                    <div className="w-full sm:w-44 h-28 rounded-xl overflow-hidden bg-black border border-white/10 shrink-0">
                      <img
                        src={podiumVehicle.imageUrl || '/podium_supercar.jpg'}
                        alt="Podium"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 w-full space-y-3">
                      <div>
                        <label className="text-[10px] font-mono text-neutral-500 uppercase block mb-1">
                          Modèle du Véhicule
                        </label>
                        <input
                          type="text"
                          value={podiumVehicle.name}
                          onChange={(e) => updatePodiumVehicle({ name: e.target.value })}
                          className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-white transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-neutral-500 uppercase block mb-1">
                          Valeur Estimée ($)
                        </label>
                        <input
                          type="number"
                          value={podiumVehicle.value}
                          onChange={(e) => updatePodiumVehicle({ value: Number(e.target.value) || 0 })}
                          className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white font-mono focus:outline-none focus:border-white transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-neutral-500 uppercase block mb-1">
                      URL Image Directe
                    </label>
                    <input
                      type="text"
                      value={podiumVehicle.imageUrl}
                      onChange={(e) => updatePodiumVehicle({ imageUrl: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-xs text-neutral-300 focus:outline-none focus:border-white transition-colors"
                    />
                  </div>
                </div>

                {/* Cooldown & Probabilities Balance */}
                <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col justify-between gap-5">
                  <div>
                    <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                      <span className="text-xs font-semibold uppercase tracking-wider text-white">
                        Délai entre les Tirages (Cooldown)
                      </span>
                      <span className="text-[10px] font-mono text-neutral-400">
                        ACTUEL : {wheelCooldownHours}H
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 mb-6">
                      {[24, 12, 6, 0].map((hours) => (
                        <button
                          key={hours}
                          onClick={() => {
                            setWheelCooldownHours(hours);
                            showToast(`Délai fixé à ${hours === 0 ? 'instantané' : `${hours}h`}.`);
                          }}
                          className={`py-3 rounded-xl text-xs font-semibold uppercase tracking-wider border transition-all cursor-pointer ${
                            wheelCooldownHours === hours
                              ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                              : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          {hours === 0 ? 'Aucun' : `${hours}h`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Taux Total des Segments</span>
                      <span className="text-[11px] text-neutral-500">Doit être égal à 100%</span>
                    </div>
                    <div
                      className={`text-lg font-mono font-bold ${
                        Math.abs(totalDropRate - 100) < 0.1 ? 'text-white' : 'text-amber-400'
                      }`}
                    >
                      {totalDropRate.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* 16 Segments Table */}
              <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white">
                    Configuration des 16 Lots de la Roue
                  </span>
                  <span className="text-[11px] font-mono text-neutral-400">16 SEGMENTS</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[700px] text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-neutral-500 font-mono text-[10px] uppercase">
                        <th className="py-3 px-2">#</th>
                        <th className="py-3 px-3">Nom du Lot</th>
                        <th className="py-3 px-3">Type</th>
                        <th className="py-3 px-3">Valeur Réelle</th>
                        <th className="py-3 px-3">Chance (%)</th>
                        <th className="py-3 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {segments.map((seg) => (
                        <tr
                          key={seg.id}
                          className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="py-3 px-2 font-mono text-neutral-500">{seg.id}</td>
                          <td className="py-3 px-3 font-semibold text-white">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-5 h-5 rounded flex items-center justify-center text-xs"
                                style={{ backgroundColor: seg.color }}
                              >
                                {seg.icon}
                              </span>
                              <span>{seg.label}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-white/5 border border-white/10 text-neutral-300">
                              {seg.type}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-neutral-300">
                            {typeof seg.value === 'number' ? seg.value.toLocaleString() : seg.value}
                          </td>
                          <td className="py-3 px-3 font-mono text-white font-bold">
                            {seg.dropRate}%
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => setEditingSegment(seg)}
                              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-neutral-300 hover:text-white transition-colors cursor-pointer"
                            >
                              Modifier
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GENERAL STATS */}
          {activeTab === 'stats' && (
            <div className="max-w-6xl mx-auto flex flex-col gap-8 animate-in fade-in duration-300">
              <div className="border-b border-white/10 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-1">
                    Statistiques Générales & Activité
                  </h1>
                  <p className="text-xs sm:text-sm text-neutral-400">
                    Métriques d'engagement, répartition des rôles VIP et flux de trésorerie.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-neutral-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Synchronisation Cloud Active</span>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-neutral-950 border border-white/10">
                  <span className="text-xs uppercase text-neutral-500 font-mono block mb-1">Citoyens Inscrits</span>
                  <div className="text-3xl font-bold text-white font-mono">{citizens.length}</div>
                  <span className="text-[11px] text-emerald-400 mt-1 block">Comptes Discord & FiveM</span>
                </div>
                <div className="p-5 rounded-2xl bg-neutral-950 border border-white/10">
                  <span className="text-xs uppercase text-neutral-500 font-mono block mb-1">Jetons en Circulation</span>
                  <div className="text-3xl font-bold text-white font-mono">
                    {citizens.reduce((acc, c) => acc + (c.chips || 0), 0).toLocaleString()}
                  </div>
                  <span className="text-[11px] text-neutral-500 mt-1 block">Masse monétaire casino</span>
                </div>
                <div className="p-5 rounded-2xl bg-neutral-950 border border-white/10">
                  <span className="text-xs uppercase text-neutral-500 font-mono block mb-1">Joueurs Approvisionnés</span>
                  <div className="text-3xl font-bold text-amber-400 font-mono">
                    {citizens.filter((c) => (c.chips || 0) > 0).length}
                  </div>
                  <span className="text-[11px] text-neutral-500 mt-1 block">Comptes avec solde actif</span>
                </div>
                <div className="p-5 rounded-2xl bg-neutral-950 border border-white/10">
                  <span className="text-xs uppercase text-neutral-500 font-mono block mb-1">Tirages Roue</span>
                  <div className="text-3xl font-bold text-white font-mono">{totalSpinsCount}</div>
                  <span className="text-[11px] text-sky-400 mt-1 block">Spins enregistrés</span>
                </div>
              </div>

              {/* Roles Breakdown */}
              <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">
                  Répartition des Rôles au Serveur
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-xs text-neutral-400 block mb-1">👑 Fondateurs</span>
                    <span className="text-xl font-bold text-amber-400 font-mono">
                      {citizens.filter(c => (c.role || '').toUpperCase().includes('FOND') || (c.role || '').toUpperCase().includes('OWNER') || (c.role || '').toUpperCase().includes('PROPRIÉTAIRE')).length}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-xs text-neutral-400 block mb-1">💻 Développeurs</span>
                    <span className="text-xl font-bold text-sky-400 font-mono">
                      {citizens.filter(c => (c.role || '').toUpperCase().includes('DÉV') || (c.role || '').toUpperCase().includes('DEV')).length}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-xs text-neutral-400 block mb-1">🌲 Citoyens</span>
                    <span className="text-xl font-bold text-emerald-400 font-mono">
                      {citizens.filter(c => !(c.role || '').toUpperCase().includes('FOND') && !(c.role || '').toUpperCase().includes('DÉV') && !(c.role || '').toUpperCase().includes('DEV') && !(c.role || '').toUpperCase().includes('ADMIN') && !(c.role || '').toUpperCase().includes('VIP')).length}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-xs text-neutral-400 block mb-1">💎 Membres VIP</span>
                    <span className="text-xl font-bold text-purple-400 font-mono">
                      {citizens.filter(c => (c.role || '').toUpperCase().includes('VIP') || (c.role || '').toUpperCase().includes('ROLLER')).length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CITIZENS & ROLES (TABLE VIEW IDENTICAL TO IMAGE 2) */}
          {activeTab === 'citizens' && (
            <div className="max-w-7xl mx-auto flex flex-col gap-6 animate-in fade-in duration-300">
              {/* Header Title */}
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-1.5">
                  Utilisateurs & Citoyens Enregistrés
                </h1>
                <p className="text-xs sm:text-sm text-neutral-400">
                  Gérez l'ensemble des comptes créés via Discord, leurs rôles RP, identifiants et accès au serveur.
                </p>
              </div>

              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-1 items-center gap-3">
                  {/* Count Badge Pill */}
                  <div className="px-3.5 py-2 rounded-xl bg-neutral-900 border border-white/10 text-xs font-semibold text-white whitespace-nowrap">
                    {filteredCitizens.length} citoyen{filteredCitizens.length > 1 ? 's' : ''}
                  </div>

                  {/* Search bar */}
                  <div className="relative flex-1 max-w-md">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                      type="text"
                      value={searchCitizen}
                      onChange={(e) => setSearchCitizen(e.target.value)}
                      placeholder="Rechercher pseudo, blaze, ID"
                      className="w-full h-10 pl-9 pr-10 rounded-xl bg-neutral-900 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/30 transition-colors"
                    />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-mono text-neutral-500">
                      ⌘K
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-auto">
                  {/* Role dropdown filter */}
                  <select
                    value={selectedRoleFilter}
                    onChange={(e) => setSelectedRoleFilter(e.target.value)}
                    className="h-10 px-3.5 rounded-xl bg-neutral-900 border border-white/10 text-xs text-neutral-200 focus:outline-none focus:border-white/30 cursor-pointer"
                  >
                    <option value="ALL">Tous les rôles</option>
                    <option value="FONDATEUR">Fondateurs</option>
                    <option value="DEVELOPPEUR">Développeurs</option>
                    <option value="ADMIN">Administrateurs</option>
                    <option value="CITOYEN">Citoyens</option>
                    <option value="VIP">VIP & High Roller</option>
                  </select>

                  {/* Refresh button */}
                  <button
                    onClick={handleRefreshData}
                    disabled={isRefreshing}
                    title="Actualiser les données"
                    className="h-10 w-10 rounded-xl bg-neutral-900 border border-white/10 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-white' : ''} />
                  </button>
                </div>
              </div>

              {/* Table Container */}
              <div className="w-full rounded-2xl bg-neutral-950/70 border border-white/10 overflow-hidden shadow-2xl backdrop-blur-md">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[850px]">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.02]">
                        <th className="py-3.5 px-5 text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-medium">
                          CITOYEN / PROFIL
                        </th>
                        <th className="py-3.5 px-4 text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-medium">
                          ID DISCORD
                        </th>
                        <th className="py-3.5 px-4 text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-medium">
                          MATRICULE RP
                        </th>
                        <th className="py-3.5 px-4 text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-medium">
                          RÔLE
                        </th>
                        <th className="py-3.5 px-4 text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-medium">
                          INSCRIPTION
                        </th>
                        <th className="py-3.5 px-5 text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-medium text-right">
                          ACTIONS
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredCitizens.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-16 text-center text-neutral-500">
                            <Users size={32} className="mx-auto mb-2 opacity-40" />
                            <div className="text-sm font-medium text-white">Aucun citoyen trouvé</div>
                            <div className="text-xs text-neutral-500 mt-1">
                              {searchCitizen || selectedRoleFilter !== 'ALL'
                                ? 'Aucun résultat ne correspond aux filtres appliqués.'
                                : 'Les comptes enregistrés apparaîtront ici.'}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredCitizens.map((c, index) => {
                          const displayDiscordId = c.discordId || (c.citizenId.length >= 16 ? c.citizenId : '1015312426169923665');
                          const matricule = c.citizenId.startsWith('test_') ? '#test' : `#${c.citizenId}`;
                          const isCopied = copiedId === displayDiscordId;
                          const displayName = `${c.rpFirstName} ${c.rpLastName}`.trim();
                          const avatar = c.avatarUrl || getDefaultDiscordAvatar(displayDiscordId);

                          return (
                            <tr
                              key={`citizen_${c.citizenId}_${c.discordId || index}`}
                              onClick={() => setEditingCitizen(c)}
                              className="hover:bg-white/[0.04] transition-colors group cursor-pointer"
                            >
                              {/* Citoyen / Profil */}
                              <td className="py-3.5 px-5">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-lg bg-neutral-900 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                                    <img
                                      src={avatar}
                                      alt={displayName}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLElement).style.display = 'none';
                                      }}
                                    />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-sm font-semibold text-white truncate group-hover:text-white transition-colors">
                                        {displayName}
                                      </span>
                                      {c.adminNote && (
                                        <span
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30 shrink-0"
                                          title={`Note administrative : ${c.adminNote}`}
                                        >
                                          <FileText size={10} />
                                          Note
                                        </span>
                                      )}
                                    </div>
                                    {c.phoneNumber && (
                                      <span className="text-[11px] font-mono text-neutral-500">
                                        📞 {c.phoneNumber}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* ID Discord */}
                              <td className="py-3.5 px-4">
                                <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-neutral-900/90 border border-white/10 font-mono text-xs text-neutral-300">
                                  <DiscordIcon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                  <span className="truncate max-w-[130px] sm:max-w-none">{displayDiscordId}</span>
                                  <button
                                    onClick={(e) => handleCopyDiscordId(displayDiscordId, e)}
                                    title="Copier l'ID Discord"
                                    className="p-0.5 rounded text-neutral-500 hover:text-white transition-colors cursor-pointer"
                                  >
                                    {isCopied ? (
                                      <Check size={12} className="text-emerald-400" />
                                    ) : (
                                      <Copy size={12} />
                                    )}
                                  </button>
                                </div>
                              </td>

                              {/* Matricule RP */}
                              <td className="py-3.5 px-4">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-neutral-900 border border-white/10 font-mono text-xs text-neutral-300">
                                  {matricule}
                                </span>
                              </td>

                              {/* Rôle */}
                              <td className="py-3.5 px-4">
                                {renderRoleBadge(c.role)}
                              </td>

                              {/* Inscription & Soldes */}
                              <td className="py-3.5 px-4">
                                <div className="flex flex-col gap-1">
                                  <span className="text-[11px] font-mono text-neutral-400">
                                    {formatRegistrationDate(c.createdAt)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setQuickMoneyCitizen(c);
                                    }}
                                    title="Cliquer pour ajuster rapidement les jetons (+/-)"
                                    className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-amber-500/15 border border-white/10 hover:border-amber-500/35 transition-colors cursor-pointer w-fit group/bal shadow-sm"
                                  >
                                    <span className="text-amber-400 font-bold">🪙 {c.chips.toLocaleString()} Jetons</span>
                                    <span className="text-[9px] font-bold text-neutral-500 group-hover/bal:text-amber-300 ml-0.5">±</span>
                                  </button>
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="py-3.5 px-5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* Bouton Ajustement Rapide Jetons */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setQuickMoneyCitizen(c);
                                    }}
                                    title="Ajustement rapide : Ajouter ou enlever de l'argent/jetons (+/-)"
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer flex items-center gap-1 text-xs font-mono font-bold shadow-sm"
                                  >
                                    <DollarSign size={13} />
                                    <span>+/-</span>
                                  </button>

                                  {/* Modifier / Inspecter Fiche (Icon ↗) */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingCitizen(c);
                                    }}
                                    title="Inspecter la fiche citoyen (La Totale)"
                                    className="p-2 rounded-lg bg-neutral-900 border border-white/10 hover:bg-white/10 hover:border-white/20 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                                  >
                                    <ExternalLink size={14} />
                                  </button>

                                  {/* Supprimer (Trash icon) */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeletingCitizen(c);
                                    }}
                                    title="Supprimer le citoyen"
                                    className="p-2 rounded-lg bg-neutral-900 border border-red-500/20 text-red-400/80 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-colors cursor-pointer"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ECONOMY & VAULT */}
          {activeTab === 'economy' && (
            <div className="max-w-4xl mx-auto flex flex-col gap-8 animate-in fade-in duration-300">
              <div className="border-b border-white/10 pb-6">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-1">
                  Économie Centrale & Caisse
                </h1>
                <p className="text-xs sm:text-sm text-neutral-400">
                  Ajustez les réserves du coffre-fort et configurez le taux de conversion Jetons / Cash.
                </p>
              </div>

              {/* Central Vault Box */}
              <div className="p-6 sm:p-8 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold block mb-1">
                      Solde Réel du Coffre-Fort
                    </span>
                    <div className="text-4xl sm:text-5xl font-bold text-white font-mono">
                      ${economy.vaultCash.toLocaleString()}
                    </div>
                  </div>

                  {/* Vault Actions: Deposit / Withdraw */}
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Montant ($)"
                      value={vaultActionAmount}
                      onChange={(e) => setVaultActionAmount(e.target.value)}
                      className="w-36 h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-white transition-colors"
                    />
                    <button
                      onClick={() => {
                        const amt = Number(vaultActionAmount);
                        if (amt > 0) {
                          updateEconomy({ vaultCash: economy.vaultCash + amt });
                          setVaultActionAmount('');
                          showToast(`+$${amt.toLocaleString()} ajoutés au coffre.`);
                        }
                      }}
                      className="px-4 py-2.5 rounded-xl bg-white text-black text-xs font-semibold uppercase tracking-wider hover:bg-neutral-200 transition-colors cursor-pointer"
                    >
                      Dépôt
                    </button>
                    <button
                      onClick={() => {
                        const amt = Number(vaultActionAmount);
                        if (amt > 0) {
                          updateEconomy({ vaultCash: Math.max(0, economy.vaultCash - amt) });
                          setVaultActionAmount('');
                          showToast(`-$${amt.toLocaleString()} retirés du coffre.`);
                        }
                      }}
                      className="px-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white text-xs font-semibold uppercase tracking-wider hover:bg-white/20 transition-colors cursor-pointer"
                    >
                      Retrait
                    </button>
                  </div>
                </div>
              </div>

              {/* Conversion and Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block">
                    Taux de conversion (1 Jeton = $)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={economy.chipToCashRate}
                    onChange={(e) => updateEconomy({ chipToCashRate: parseFloat(e.target.value) || 1.0 })}
                    className="w-full h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-lg font-mono text-white focus:outline-none focus:border-white transition-colors"
                  />
                  <span className="text-[11px] text-neutral-500 block">
                    Ratio appliqué lors de l'achat ou revente de jetons à la caisse.
                  </span>
                </div>

                <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block">
                    Cagnotte Jackpot ($)
                  </label>
                  <input
                    type="number"
                    value={economy.jackpotAmount}
                    onChange={(e) => updateEconomy({ jackpotAmount: Number(e.target.value) || 0 })}
                    className="w-full h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-lg font-mono text-white focus:outline-none focus:border-white transition-colors"
                  />
                  <span className="text-[11px] text-neutral-500 block">
                    Montant de la cagnotte globale affichée aux machines à sous.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT LOGS */}
          {activeTab === 'logs' && (
            <div className="max-w-6xl mx-auto flex flex-col gap-8 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-1">
                    Journal d'Audit & Sécurité
                  </h1>
                  <p className="text-xs sm:text-sm text-neutral-400">
                    Traçabilité complète des actions de modération, gains et modifications de caisse.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={handleExportConfig}
                    className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-medium text-white transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Exporter JSON</span>
                  </button>
                  <button
                    onClick={() => {
                      clearLogs();
                      showToast('Journal effacé.');
                    }}
                    className="px-3.5 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>Vider les Logs</span>
                  </button>
                </div>
              </div>

              {logs.length === 0 ? (
                <div className="p-12 rounded-2xl bg-neutral-950 border border-white/10 text-center flex flex-col items-center justify-center gap-2">
                  <ShieldAlert size={32} className="text-neutral-600" />
                  <h3 className="text-sm font-semibold text-white">Aucun log dans le registre</h3>
                  <p className="text-xs text-neutral-500">
                    Les actions effectuées dans cette console apparaîtront ici chronologiquement.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-neutral-950 border border-white/10 divide-y divide-white/5 overflow-hidden">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-start sm:items-center gap-3">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-neutral-300 font-bold shrink-0">
                          {log.category}
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-white">{log.detail}</div>
                          <span className="text-xs text-neutral-500">{log.action}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-mono text-neutral-400 shrink-0">
                        <span>{log.author}</span>
                        <span className="text-neutral-600">•</span>
                        <span>{log.timestamp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: SYSTEM & MAINTENANCE */}
          {activeTab === 'system' && (
            <div className="max-w-4xl mx-auto flex flex-col gap-8 animate-in fade-in duration-300">
              <div className="border-b border-white/10 pb-6">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-1">
                  Système & Maintenance
                </h1>
                <p className="text-xs sm:text-sm text-neutral-400">
                  Contrôlez l'accès au site et vérifiez l'état de l'infrastructure cloud.
                </p>
              </div>

              {/* Maintenance Toggle */}
              <div className="p-6 sm:p-8 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-base font-bold text-white">Mode Maintenance Général</span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        economy.maintenanceMode ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20' : 'bg-white/10 text-neutral-300'
                      }`}
                    >
                      {economy.maintenanceMode ? 'ACTIF' : 'DÉSACTIVÉ'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 max-w-md">
                    Si activé, les joueurs ne pourront plus faire tourner la roue ni échanger de jetons.
                  </p>
                </div>

                <button
                  onClick={() => {
                    const next = !economy.maintenanceMode;
                    updateEconomy({ maintenanceMode: next });
                    showToast(`Mode maintenance ${next ? 'activé' : 'désactivé'}.`);
                  }}
                  className={`px-5 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                    economy.maintenanceMode
                      ? 'bg-amber-400 text-black shadow-[0_0_20px_rgba(251,191,36,0.3)]'
                      : 'bg-white text-black hover:bg-neutral-200'
                  }`}
                >
                  {economy.maintenanceMode ? 'Désactiver Maintenance' : 'Activer Maintenance'}
                </button>
              </div>

              {/* Database Telemetry */}
              <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 space-y-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-white block">
                  Télémétrie Cloud Supabase
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-[10px] text-neutral-500 block mb-1">ÉTAT GLOBAL</span>
                    <span className="text-sm font-bold text-white">
                      {healthData?.online ? 'OPÉRATIONNEL' : 'NON DISPONIBLE'}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-[10px] text-neutral-500 block mb-1">TEMPS DE RÉPONSE</span>
                    <span className="text-sm font-bold text-white">
                      {healthData?.latencyMs || 0} ms
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-[10px] text-neutral-500 block mb-1">SYNCHRONISATION</span>
                    <span className="text-sm font-bold text-white">EN TEMPS RÉEL</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: DEVELOPER SUITE */}
          {activeTab === 'dev' && (
            <div className="max-w-6xl mx-auto flex flex-col gap-8 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                      Console Développeur
                    </h1>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-black font-bold">
                      ROOT
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-neutral-400">
                    Outils avancés, injection de ressources, simulateur de statuts et télémétrie en temps réel.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={measureHealth}
                    disabled={isPinging}
                    className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-mono text-neutral-200 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw size={13} className={isPinging ? 'animate-spin' : ''} />
                    <span>{isPinging ? 'Ping...' : 'Ping Serveur'}</span>
                  </button>
                  <button
                    onClick={handleDownloadFullDump}
                    className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-mono text-neutral-200 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Dump JSON</span>
                  </button>
                </div>
              </div>

              {/* SERVICES CLOUD & BASE DE DONNÉES (Live Heartbeat) */}
              <div className="p-6 sm:p-8 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col gap-6 shadow-[0_0_40px_rgba(255,255,255,0.02)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <Activity size={16} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                        Services Cloud & Base de Données
                      </h2>
                      <span className="text-[10px] font-mono text-neutral-500">
                        LIVE HEARTBEAT & STATUTS EN TEMPS RÉEL
                      </span>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono px-3 py-1 rounded-full bg-white/5 border border-white/10 text-neutral-300">
                    SYNCHRO ACTIVE (30S)
                  </span>
                </div>

                <div className="flex flex-col gap-3 font-mono text-xs">
                  {/* PostgreSQL Cloud */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <Database size={16} className="text-neutral-400" />
                      <span className="text-neutral-300">PostgreSQL Cloud (Supabase)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-neutral-500 hidden sm:inline">Port 5432 / TLS 1.3</span>
                      <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                        healthData?.online ? 'bg-white/10 text-white border border-white/20' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {healthData?.online ? `OPÉRATIONNEL (${healthData.latencyMs}ms)` : 'DÉCONNECTÉ'}
                      </span>
                    </div>
                  </div>

                  {/* Discord OAuth */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <Radio size={16} className="text-neutral-400" />
                      <span className="text-neutral-300">Connexion Discord (Supabase Auth)</span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                      user?.isDiscordSynced ? 'bg-white/10 text-white border border-white/20' : 'bg-amber-400/20 text-amber-400 border border-amber-400/30'
                    }`}>
                      {user?.isDiscordSynced ? 'COMPTE LIÉ' : 'NON LIÉ'}
                    </span>
                  </div>

                  {/* Mode Maintenance */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex items-center gap-3">
                      {economy.maintenanceMode ? <Lock size={16} className="text-amber-400" /> : <Unlock size={16} className="text-neutral-400" />}
                      <span className="text-neutral-300">Mode Maintenance</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          const next = !economy.maintenanceMode;
                          updateEconomy({ maintenanceMode: next });
                          showToast(`Mode maintenance ${next ? 'activé' : 'désactivé'}.`);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-[10px] uppercase tracking-wider text-neutral-300 hover:text-white transition-colors cursor-pointer"
                      >
                        Basculer
                      </button>
                      <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                        economy.maintenanceMode
                          ? 'bg-amber-400/20 text-amber-400 border border-amber-400/30'
                          : 'bg-white/10 text-neutral-300 border border-white/20'
                      }`}>
                        {economy.maintenanceMode ? 'VERROUILLÉ (DEV UNIQUEMENT)' : 'OUVERT AUX JOUEURS'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* DEVELOPER GOD-MODE CONTROLS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Balance Injection */}
                <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col justify-between gap-5">
                  <div>
                    <div className="flex items-center gap-3 border-b border-white/10 pb-3 mb-4">
                      <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <Coins size={16} className="text-white" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                          Injection Directe de Jetons
                        </h3>
                        <span className="text-[10px] font-mono text-neutral-500">
                          CRÉDITER MON COMPTE DEV
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-neutral-400 mb-4">
                      Ajoutez des jetons immédiatement sans restrictions pour tester les jeux et tirages.
                    </p>

                    <div className="flex items-center gap-2 mb-4">
                      <input
                        type="number"
                        value={customChipsAmount}
                        onChange={(e) => setCustomChipsAmount(e.target.value)}
                        className="flex-1 h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-sm font-mono text-white focus:outline-none focus:border-white transition-colors"
                        placeholder="Montant"
                      />
                      <button
                        onClick={() => handleAddCustomChips()}
                        className="px-5 h-11 rounded-xl bg-white text-black font-semibold text-xs uppercase tracking-wider hover:bg-neutral-200 transition-colors cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                      >
                        Injecter
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[10000, 50000, 250000].map((amt) => (
                        <button
                          key={amt}
                          onClick={() => handleAddCustomChips(amt)}
                          className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-neutral-300 hover:text-white transition-colors text-center cursor-pointer"
                        >
                          +{amt.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono text-neutral-400">
                    <span>MON SOLDE :</span>
                    <span className="text-white font-bold">{user?.chips.toLocaleString() || 0} JETONS</span>
                  </div>
                </div>

                {/* VIP Overrides & Wheel Bypass */}
                <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col justify-between gap-5">
                  <div>
                    <div className="flex items-center gap-3 border-b border-white/10 pb-3 mb-4">
                      <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <Crown size={16} className="text-white" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                          Simulateur Statut VIP
                        </h3>
                        <span className="text-[10px] font-mono text-neutral-500">
                          TEST DES PALIERS VIP
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-neutral-400 mb-4">
                      Basculez instantanément votre carte VIP pour tester les cartes et les animations.
                    </p>

                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <button
                        onClick={() => handleSetVipTier('SILVER')}
                        className={`py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider border transition-colors cursor-pointer ${
                          user?.vipTier === 'SILVER' ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                        }`}
                      >
                        Silver
                      </button>
                      <button
                        onClick={() => handleSetVipTier('GOLD')}
                        className={`py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider border transition-colors cursor-pointer ${
                          user?.vipTier === 'GOLD' ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                        }`}
                      >
                        Gold
                      </button>
                      <button
                        onClick={() => handleSetVipTier('DIAMOND')}
                        className={`py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider border transition-colors cursor-pointer ${
                          user?.vipTier === 'DIAMOND' ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                        }`}
                      >
                        Black
                      </button>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white block">Cooldown de la Roue</span>
                        <span className="text-[11px] text-neutral-500">Débloquer mon spin immédiatement</span>
                      </div>
                      <button
                        onClick={async () => {
                          if (user && (await resetCitizenWheelCooldown(user.id))) showToast('Cooldown réinitialisé !');
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Reset Spin
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono text-neutral-400">
                    <span>STATUT ACTUEL :</span>
                    <span className="text-white font-bold">{user?.vipTier || 'AUCUN'}</span>
                  </div>
                </div>
              </div>

              {/* SYSTEM CONSOLE & DB QUERY INSPECTOR */}
              <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col gap-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <Terminal size={16} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                        Inspecteur de Requêtes & API
                      </h3>
                      <span className="text-[10px] font-mono text-neutral-500">
                        COMMUNICATION SUPABASE DIRECTE
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleExecuteQuery}
                    disabled={isQuerying}
                    className="px-4 py-2 rounded-xl bg-white text-black text-xs font-semibold uppercase tracking-wider hover:bg-neutral-200 transition-colors flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                  >
                    <Zap size={13} />
                    <span>{isQuerying ? 'Exécution...' : 'Diagnostic Tables'}</span>
                  </button>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <p className="text-neutral-500">
                    Compte les lignes visibles avec votre rôle (les règles RLS s'appliquent).
                  </p>

                  {queryOutput && (
                    <pre className="p-4 rounded-xl bg-black border border-white/10 text-neutral-300 overflow-x-auto text-[11px] leading-relaxed max-h-60">
                      {queryOutput}
                    </pre>
                  )}
                </div>
              </div>

              {/* STORAGE & DIAGNOSTIC */}
              <div className="p-6 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-1">
                    Mémoire Locale & Diagnostic
                  </h3>
                  <p className="text-xs text-neutral-400 font-mono">
                    STOCKAGE CLIENT ESTIMÉ : ~{storageUsage} KB • POOL SUPABASE ONLINE
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleClearCache}
                    className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>Purger Cache Local</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* MODAL: EDIT SEGMENT */}
      <AnimatePresence>
        {editingSegment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-neutral-950 border border-white/20 p-6 sm:p-8 rounded-3xl flex flex-col gap-6 shadow-[0_0_50px_rgba(255,255,255,0.1)]"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h3 className="text-base font-bold text-white">
                  Modifier le Segment #{editingSegment.id}
                </h3>
                <button
                  onClick={() => setEditingSegment(null)}
                  className="p-1 rounded-lg text-neutral-500 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="text-[10px] font-mono text-neutral-400 uppercase block mb-1">
                    Nom du Lot
                  </label>
                  <input
                    type="text"
                    value={editingSegment.label}
                    onChange={(e) => setEditingSegment({ ...editingSegment, label: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-white transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-neutral-400 uppercase block mb-1">
                      Type
                    </label>
                    <select
                      value={editingSegment.type}
                      onChange={(e) =>
                        setEditingSegment({ ...editingSegment, type: e.target.value as RewardType })
                      }
                      className="w-full h-11 px-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-white uppercase font-mono cursor-pointer"
                    >
                      <option value="chips" className="bg-black">Jetons</option>
                      <option value="cash" className="bg-black">Cash</option>
                      <option value="vehicle" className="bg-black">Véhicule</option>
                      <option value="mystery" className="bg-black">Mystère</option>
                      <option value="clothing" className="bg-black">Vêtement</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-neutral-400 uppercase block mb-1">
                      Chance (%)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={editingSegment.dropRate}
                      onChange={(e) =>
                        setEditingSegment({
                          ...editingSegment,
                          dropRate: parseFloat(e.target.value) || 0.1,
                        })
                      }
                      className="w-full h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-white font-mono focus:outline-none focus:border-white transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-neutral-400 uppercase block mb-1">
                    Valeur Réelle (Jetons / Cash / Item)
                  </label>
                  <input
                    type="text"
                    value={String(editingSegment.value)}
                    onChange={(e) => {
                      const v = isNaN(Number(e.target.value))
                        ? e.target.value
                        : Number(e.target.value);
                      setEditingSegment({ ...editingSegment, value: v });
                    }}
                    className="w-full h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-white font-mono focus:outline-none focus:border-white transition-colors"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setEditingSegment(null)}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-neutral-400 hover:text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    updateSegment(editingSegment.id, editingSegment);
                    setEditingSegment(null);
                    showToast('Segment mis à jour.');
                  }}
                  className="flex-1 py-3 rounded-xl bg-white text-black text-xs font-semibold uppercase tracking-wider hover:bg-neutral-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)] cursor-pointer"
                >
                  Sauvegarder
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: QUICK MONEY & CHIPS ADJUSTER */}
      <AnimatePresence>
        {quickMoneyCitizen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-lg bg-neutral-950 border border-white/15 p-6 sm:p-7 rounded-3xl flex flex-col gap-5 shadow-[0_0_80px_rgba(0,0,0,0.9),0_0_30px_rgba(255,255,255,0.06)]"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border bg-amber-500/10 border-amber-500/30 text-amber-400">
                    <Coins size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      Ajustement Rapide des Jetons
                    </h3>
                    <p className="text-xs text-neutral-400 font-mono mt-0.5">
                      {quickMoneyCitizen.rpFirstName} {quickMoneyCitizen.rpLastName} • <strong className="text-white">#{quickMoneyCitizen.citizenId}</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setQuickMoneyCitizen(null)}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Current Chips Balance Display */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Solde Jetons Actuel</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-2xl font-black font-mono text-white tracking-tight">
                      {(quickMoneyCitizen.chips || 0).toLocaleString()}
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-400">⛁ JETONS</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Coins size={18} />
                </div>
              </div>

              {/* Toggle: Operation (Add vs Remove) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-neutral-400 uppercase">Opération</label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-neutral-900 border border-white/10">
                  <button
                    type="button"
                    onClick={() => setQuickMoneyOperation('add')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      quickMoneyOperation === 'add'
                        ? 'bg-amber-400 text-black shadow-md'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Plus size={14} />
                    <span>+ Ajouter (Créditer)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickMoneyOperation('remove')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      quickMoneyOperation === 'remove'
                        ? 'bg-rose-600 text-white shadow-md'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Minus size={14} />
                    <span>- Enlever (Débiter)</span>
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono text-neutral-400 uppercase">Montant en Jetons</label>
                  {/* Realtime Projected Calculation Preview */}
                  {(() => {
                    const current = quickMoneyCitizen.chips || 0;
                    const delta = Math.max(0, parseInt(quickMoneyAmount) || 0);
                    const projected = quickMoneyOperation === 'add' ? current + delta : Math.max(0, current - delta);
                    return (
                      <span className="text-[11px] font-mono text-neutral-300">
                        Nouveau solde : <strong className={quickMoneyOperation === 'add' ? 'text-amber-400' : 'text-rose-400'}>{projected.toLocaleString()} ⛁</strong>
                      </span>
                    );
                  })()}
                </div>

                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-sm text-amber-400">
                    ⛁
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={quickMoneyAmount}
                    onChange={(e) => setQuickMoneyAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleApplyQuickMoney();
                      }
                    }}
                    placeholder="Entrez le montant de jetons (ex: 50000)"
                    autoFocus
                    className="w-full h-12 pl-8 pr-3.5 rounded-xl bg-neutral-900 border border-white/10 text-white font-mono text-base font-bold focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>

                {/* Quick Presets Buttons */}
                <div className="grid grid-cols-5 gap-1.5 mt-1">
                  {[1000, 10000, 50000, 250000, 1000000].map((val) => {
                    const label =
                      val >= 1000000
                        ? `${val / 1000000}M`
                        : `${val / 1000}k`;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setQuickMoneyAmount(val.toString())}
                        className="py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-mono text-neutral-300 hover:text-white transition-colors cursor-pointer text-center"
                      >
                        {quickMoneyOperation === 'add' ? '+' : '-'}{label} ⛁
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Reason / Justification */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-neutral-400 uppercase">
                  Motif / Raison (Optionnel)
                </label>
                <input
                  type="text"
                  value={quickMoneyReason}
                  onChange={(e) => setQuickMoneyReason(e.target.value)}
                  placeholder="Ex: Récompense événement, régularisation caisse..."
                  className="w-full h-10 px-3.5 rounded-xl bg-neutral-900 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setQuickMoneyCitizen(null)}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-neutral-400 hover:text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyQuickMoney()}
                  disabled={!quickMoneyAmount || parseInt(quickMoneyAmount) <= 0}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-lg ${
                    quickMoneyOperation === 'add'
                      ? 'bg-amber-400 hover:bg-amber-300 text-black shadow-amber-500/20'
                      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {quickMoneyOperation === 'add' ? 'Confirmer le Crédit Jetons' : 'Confirmer le Débit Jetons'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: DELETE CITIZEN CONFIRMATION */}
      <AnimatePresence>
        {deletingCitizen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-neutral-950 border border-red-500/30 p-6 sm:p-8 rounded-3xl flex flex-col gap-5 shadow-[0_0_50px_rgba(239,68,68,0.15)]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Supprimer ce citoyen ?</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Fiche #{deletingCitizen.citizenId} • {deletingCitizen.rpFirstName} {deletingCitizen.rpLastName}
                  </p>
                </div>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed bg-white/[0.02] border border-white/5 p-3.5 rounded-xl">
                Cette action supprimera définitivement le compte citoyen et son solde de jetons (🪙 {deletingCitizen.chips.toLocaleString()} ⛁) de Supabase.
              </p>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setDeletingCitizen(null)}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-neutral-400 hover:text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={async () => {
                    const target = deletingCitizen;
                    setDeletingCitizen(null);
                    if (await deleteCitizen(target.profileId)) showToast(`Citoyen #${target.citizenId} supprimé.`);
                  }}
                  className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold uppercase tracking-wider transition-colors shadow-[0_0_20px_rgba(239,68,68,0.3)] cursor-pointer"
                >
                  Supprimer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: CITIZEN PROFILE SHEET ("LA TOTALE") */}
      <AnimatePresence>
        {editingCitizen && (
          <CitizenProfileSheet
            citizen={editingCitizen}
            onClose={() => setEditingCitizen(null)}
            onSave={async (updated) => {
              if (await updateCitizen(editingCitizen.profileId, updated)) {
                showToast(`Fiche de ${updated.rpFirstName} ${updated.rpLastName} mise à jour.`);
                setEditingCitizen(null);
              }
            }}
            onUpdateLive={(updated) => {
              void updateCitizen(editingCitizen.profileId, updated);
            }}
            onResetCooldown={() => resetCitizenWheelCooldown(editingCitizen.profileId)}
            onAdjustBalance={(chipsDelta, cashDelta, reason) =>
              adjustCitizenBalance(editingCitizen.profileId, chipsDelta, cashDelta, reason)
            }
            adminLogs={logs}
            onAddLog={addLog}
            showToast={showToast}
            currentUser={user}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
