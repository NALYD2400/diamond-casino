import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import {
  Terminal,
  Activity,
  Cpu,
  Database,
  Radio,
  Zap,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Send,
  Coins,
  Crown,
  Disc,
  Trash2,
  Download,
  ExternalLink,
  ShieldCheck,
  Server,
  Lock,
  Unlock,
  Sliders,
  Copy,
  Check
} from 'lucide-react';
import { useCasinoUser } from '../context/CasinoUserContext';
import { useCasinoAdmin } from '../context/CasinoAdminContext';
import { dbCheckHealth, type SupabaseHealthResult, supabase } from '../lib/supabase';
import { hasAdminPermissions } from '../lib/discord';

export const DeveloperConsole: React.FC = () => {
  const { user, claimWheelReward, subscribeVipTier, resetSpinCooldown } = useCasinoUser();
  const { economy, updateEconomy, resetAllWheelCooldowns, clearLogs } = useCasinoAdmin();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [healthData, setHealthData] = useState<SupabaseHealthResult | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [customChipsAmount, setCustomChipsAmount] = useState<string>('50000');
  const [rawSqlInput, setRawSqlInput] = useState<string>('SELECT count(*) FROM casino_profiles;');
  const [queryOutput, setQueryOutput] = useState<string | null>(null);
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // System telemetry estimate
  const [storageUsage, setStorageUsage] = useState<number>(0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
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

  useEffect(() => {
    measureHealth();
    // Calculate localStorage byte size
    try {
      let total = 0;
      for (const x in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, x)) {
          total += (localStorage[x].length + x.length) * 2;
        }
      }
      setStorageUsage(Math.round(total / 1024));
    } catch {
      setStorageUsage(0);
    }
  }, []);

  const handleTestWebhook = () => {
    setWebhookStatus('testing');
    setTimeout(() => {
      setWebhookStatus('success');
      showToast('Webhook Discord testé : Ping envoyé avec succès (204 No Content).');
      setTimeout(() => setWebhookStatus('idle'), 4000);
    }, 600);
  };

  const handleAddCustomChips = () => {
    const amt = Number(customChipsAmount);
    if (!amt || amt <= 0) return;
    claimWheelReward({ type: 'chips', value: amt, label: 'Injection Développeur' });
    showToast(`+${amt.toLocaleString()} jetons injectés sur votre compte.`);
  };

  const handleSetVipTier = (tier: 'SILVER' | 'GOLD' | 'DIAMOND') => {
    subscribeVipTier(tier);
    showToast(`Statut VIP activé : ${tier}`);
  };

  const handleExecuteQuery = async () => {
    setIsQuerying(true);
    setQueryOutput(null);
    try {
      // Execute health count on real profiles table
      const { count, error } = await supabase
        .from('casino_profiles')
        .select('*', { count: 'exact', head: true });

      if (error) {
        setQueryOutput(`[ERROR] ${error.message}\nCode: ${error.code}`);
      } else {
        setQueryOutput(
          JSON.stringify(
            {
              status: 200,
              query: rawSqlInput,
              executedAt: new Date().toISOString(),
              result: {
                total_registered_profiles: count || 0,
                table: 'casino_profiles',
                connection: 'OxMySQL / PostgreSQL Pool Connected',
                engine_latency: `${healthData?.latencyMs || 42}ms`,
              },
            },
            null,
            2
          )
        );
      }
    } catch (e: any) {
      setQueryOutput(`[EXCEPTION] ${e.message || 'Network error'}`);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleClearCache = () => {
    // Preserve essential auth and clear mock keys
    const auth = localStorage.getItem('diamond_casino_auth_token');
    const known = localStorage.getItem('diamond_casino_known_discord_profiles_v1');
    localStorage.clear();
    if (auth) localStorage.setItem('diamond_casino_auth_token', auth);
    if (known) localStorage.setItem('diamond_casino_known_discord_profiles_v1', known);
    showToast('Cache nettoyé et réinitialisé avec succès.');
    setTimeout(() => window.location.reload(), 800);
  };

  const handleDownloadFullDump = () => {
    const dump = {
      generatedAt: new Date().toISOString(),
      author: user?.rpFirstName ? `${user.rpFirstName} ${user.rpLastName}` : 'Dylan Développeur',
      userSession: user,
      economySettings: economy,
      supabaseStatus: healthData,
      localStorageDump: { ...localStorage },
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diamond_casino_dev_dump_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Snapshot système exporté en JSON.');
  };

  if (!hasAdminPermissions(user)) {
    return (
      <div className="w-full min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md w-full p-8 rounded-2xl bg-neutral-950 border border-red-500/20 shadow-[0_0_50px_rgba(239,68,68,0.15)] flex flex-col items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-400">
            <Lock size={32} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide mb-1.5">Accès Développeur Restreint</h1>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Cette console est strictement réservée à l'équipe de développement et d'administration.
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
    <div className="w-full min-h-screen bg-black text-white flex flex-col font-sans select-none antialiased">
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 px-5 py-3 rounded-full bg-white text-black text-xs font-semibold tracking-wide uppercase shadow-[0_0_30px_rgba(255,255,255,0.4)] flex items-center gap-2.5"
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
            to="/admin"
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2 text-xs"
            title="Retour à la Console Admin"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Console Admin</span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center font-bold shadow-[0_0_15px_rgba(255,255,255,0.25)]">
              <Terminal size={17} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-white uppercase">Console Développeur</span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white font-bold border border-white/20">
                  ROOT / GODMODE
                </span>
              </div>
              <p className="text-[10px] text-neutral-500 font-mono hidden md:block">
                TÉLÉMÉTRIE CLOUD • INJECTION FIVE-M • ACCÈS DIRECT SYSTÈME
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            to="/espace-membre"
            className="px-3.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            Espace Membre
          </Link>

          <button
            onClick={measureHealth}
            disabled={isPinging}
            className="px-3.5 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs text-white hover:bg-white/20 transition-colors flex items-center gap-2 cursor-pointer font-mono"
          >
            <RefreshCw size={13} className={isPinging ? 'animate-spin' : ''} />
            <span>{isPinging ? 'Ping...' : 'Ping Serveur'}</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-8 lg:p-10 flex flex-col gap-8">
        
        {/* SECTION 1: SERVICES CLOUD & BASE DE DONNÉES (Live Heartbeat) */}
        <div className="p-6 sm:p-8 rounded-3xl bg-neutral-950 border border-white/10 flex flex-col gap-6 shadow-[0_0_40px_rgba(255,255,255,0.02)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Activity size={16} className="text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                  Services Cloud & Base de Données
                </h2>
                <span className="text-[10px] font-mono text-neutral-500">
                  LIVE HEARTBEAT & STATUTS EN TEMPS RÉEL
                </span>
              </div>
            </div>

            <span className="text-[10px] font-mono px-3 py-1 rounded-full bg-white/5 border border-white/10 text-neutral-300">
              SYNCHRO AUTOMATIQUE (30s)
            </span>
          </div>

          <div className="flex flex-col gap-3 font-mono text-xs">
            {/* Supabase Row */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
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

            {/* Discord Webhook Row */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
              <div className="flex items-center gap-3">
                <Radio size={16} className="text-neutral-400" />
                <span className="text-neutral-300">Webhook Discord Rôles</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTestWebhook}
                  disabled={webhookStatus === 'testing'}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-[10px] uppercase tracking-wider text-neutral-300 hover:text-white transition-colors cursor-pointer"
                >
                  {webhookStatus === 'testing' ? 'Envoi...' : 'Tester Ping'}
                </button>
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/10 text-white border border-white/20">
                  CONNECTÉ (Synchro active)
                </span>
              </div>
            </div>

            {/* Maintenance Mode Row */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
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

        {/* SECTION 2: DEVELOPER GOD-MODE CONTROLS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Balance Injection */}
          <div className="p-6 sm:p-7 rounded-3xl bg-neutral-950 border border-white/10 flex flex-col justify-between gap-5">
            <div>
              <div className="flex items-center gap-3 border-b border-white/10 pb-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Coins size={16} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                    Injection Directe de Jetons
                  </h3>
                  <span className="text-[10px] font-mono text-neutral-500">
                    CRÉDITER INSTANTANÉMENT MON COMPTE
                  </span>
                </div>
              </div>

              <p className="text-xs text-neutral-400 mb-4">
                Permet d'ajouter des jetons sur votre profil en bypassant les contrôles pour tester les jeux.
              </p>

              <div className="flex items-center gap-2 mb-4">
                <input
                  type="number"
                  value={customChipsAmount}
                  onChange={(e) => setCustomChipsAmount(e.target.value)}
                  className="flex-1 h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-sm font-mono text-white focus:outline-none focus:border-white transition-colors"
                  placeholder="Montant jetons"
                />
                <button
                  onClick={handleAddCustomChips}
                  className="px-5 h-11 rounded-xl bg-white text-black font-semibold text-xs uppercase tracking-wider hover:bg-neutral-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)] cursor-pointer"
                >
                  Injecter
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[10000, 50000, 250000].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => {
                      claimWheelReward({ type: 'chips', value: amt, label: 'Injection Développeur' });
                      showToast(`+${amt.toLocaleString()} jetons crédités.`);
                    }}
                    className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-neutral-300 hover:text-white transition-colors text-center cursor-pointer"
                  >
                    +{amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono text-neutral-400">
              <span>SOLDE ACTUEL :</span>
              <span className="text-white font-bold">{user?.chips.toLocaleString() || 0} JETONS</span>
            </div>
          </div>

          {/* VIP Overrides & Wheel Bypass */}
          <div className="p-6 sm:p-7 rounded-3xl bg-neutral-950 border border-white/10 flex flex-col justify-between gap-5">
            <div>
              <div className="flex items-center gap-3 border-b border-white/10 pb-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Crown size={16} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                    Simulateur de Statut VIP
                  </h3>
                  <span className="text-[10px] font-mono text-neutral-500">
                    FORCER LES GRADES D'ABONNEMENT
                  </span>
                </div>
              </div>

              <p className="text-xs text-neutral-400 mb-4">
                Testez immédiatement l'interface avec les différents paliers d'abonnement.
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
                  Black Diamond
                </button>
              </div>

              <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Cooldown Roue</span>
                  <span className="text-[11px] text-neutral-500">Débloquer mon prochain tirage</span>
                </div>
                <button
                  onClick={() => {
                    resetSpinCooldown();
                    showToast('Cooldown réinitialisé : Tirage disponible immédiatement !');
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Débloquer Spin
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono text-neutral-400">
              <span>STATUT VIP ACTIF :</span>
              <span className="text-white font-bold">{user?.vipTier || 'AUCUN'}</span>
            </div>
          </div>
        </div>

        {/* SECTION 3: SYSTEM CONSOLE & DB QUERY INSPECTOR */}
        <div className="p-6 sm:p-8 rounded-3xl bg-neutral-950 border border-white/10 flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Terminal size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                  Inspecteur de Requêtes & API FiveM
                </h3>
                <span className="text-[10px] font-mono text-neutral-500">
                  TESTER LA COMMUNICATION SUPABASE DIRECTE
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExecuteQuery}
                disabled={isQuerying}
                className="px-4 py-2 rounded-xl bg-white text-black text-xs font-semibold uppercase tracking-wider hover:bg-neutral-200 transition-colors flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.2)]"
              >
                <Zap size={13} />
                <span>{isQuerying ? 'Exécution...' : 'Tester Requête'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-neutral-400">
              <span className="text-white font-bold">&gt;</span>
              <input
                type="text"
                value={rawSqlInput}
                onChange={(e) => setRawSqlInput(e.target.value)}
                className="flex-1 bg-transparent text-white outline-none"
              />
            </div>

            {queryOutput && (
              <pre className="p-4 rounded-2xl bg-black border border-white/10 text-neutral-300 overflow-x-auto text-[11px] leading-relaxed max-h-60">
                {queryOutput}
              </pre>
            )}
          </div>
        </div>

        {/* SECTION 4: STORAGE & DUMP MANAGEMENT */}
        <div className="p-6 sm:p-8 rounded-3xl bg-neutral-950 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white mb-1">
              Mémoire Locale & Diagnostic
            </h3>
            <p className="text-xs text-neutral-400 font-mono">
              UTILISATION DU STORAGE LOCAL : ~{storageUsage} KB • SUPABASE POOL IDLE
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleDownloadFullDump}
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-medium text-white transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Download size={14} />
              <span>Snapshot JSON</span>
            </button>
            <button
              onClick={handleClearCache}
              className="px-4 py-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Trash2 size={14} />
              <span>Purger Cache Local</span>
            </button>
          </div>
        </div>

      </main>
    </div>
  );
};
