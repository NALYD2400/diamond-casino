import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import { 
  ArrowLeft, 
  Crown, 
  LogOut, 
  Edit3, 
  Disc, 
  CheckCircle2, 
  Coins, 
  ShieldCheck, 
  Check, 
  History, 
  User, 
  Car, 
  AlertCircle, 
  X, 
  ChevronRight, 
  Search,
  ExternalLink
} from 'lucide-react';
import { useCasinoUser, type CasinoTransaction } from '../context/CasinoUserContext';
import { sanitizeText, isValidCitizenId, isValidRPName, isValidPhoneNumber } from '../lib/security';
import { hasAdminPermissions } from '../lib/discord';
import { MemberRewards } from './member/MemberRewards';

interface MemberPortalProps {
  onBackToHome?: () => void;
  onNavigateToWheel?: () => void;
}

type ConsoleTab = 'overview' | 'lots' | 'vault' | 'profile' | 'vip';

export const MemberPortal: React.FC<MemberPortalProps> = ({ onBackToHome, onNavigateToWheel }) => {
  const { 
    user, 
    isAuthenticated, 
    isLoading, 
    authError, 
    pendingDiscordUser, 
    loginWithDiscordOAuth, 
    completeRPRegistration, 
    cancelPendingDiscord, 
    logout, 
    updateProfile, 
    canSpinWheel, 
    timeUntilNextSpin, 
  } = useCasinoUser();

  const [activeTab, setActiveTab] = useState<ConsoleTab>('overview');
  const [txFilter, setTxFilter] = useState<'ALL' | 'WHEEL' | 'VIP' | 'GAMES'>('ALL');
  const [txSearchQuery, setTxSearchQuery] = useState<string>('');
  const [isEditingModalOpen, setIsEditingModalOpen] = useState<boolean>(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState<boolean>(false);

  // Onboarding RP Form state (first-time registration)
  const [onboardFirst, setOnboardFirst] = useState<string>('');
  const [onboardLast, setOnboardLast] = useState<string>('');
  const [onboardCitizenId, setOnboardCitizenId] = useState<string>('');
  const [onboardPhone, setOnboardPhone] = useState<string>('');
  const [rulesAccepted, setRulesAccepted] = useState<boolean>(true);
  const [onboardSubmitting, setOnboardSubmitting] = useState<boolean>(false);
  const [onboardError, setOnboardError] = useState<string | null>(null);

  // Form state for profile edition modal
  const [editFirstName, setEditFirstName] = useState<string>(user?.rpFirstName || '');
  const [editLastName, setEditLastName] = useState<string>(user?.rpLastName || '');
  const [editCitizenId, setEditCitizenId] = useState<string>(user?.citizenId || '');
  const [editPhone, setEditPhone] = useState<string>(user?.phoneNumber || '');
  const [editError, setEditError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    if (authError) showToast(authError);
  }, [authError]);

  const handleConnectDiscord = async () => {
    setIsRedirecting(true);
    showToast('Connexion Discord en cours...');
    try {
      await loginWithDiscordOAuth();
    } catch {
      setIsRedirecting(false);
    }
  };

  const handleFinishOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardError(null);

    const cleanFirst = sanitizeText(onboardFirst.trim(), 25);
    const cleanLast = sanitizeText(onboardLast.trim(), 25);
    const cleanId = sanitizeText(onboardCitizenId.trim(), 15);
    const cleanPhone = sanitizeText(onboardPhone.trim(), 15);

    if (!cleanFirst || !cleanLast || !cleanId) {
      setOnboardError('Veuillez renseigner votre Prénom RP, Nom RP et Numéro Citoyen.');
      return;
    }
    if (!isValidRPName(cleanFirst)) {
      setOnboardError('Prénom RP invalide (2-25 lettres, sans chiffres ni caractères spéciaux).');
      return;
    }
    if (!isValidRPName(cleanLast)) {
      setOnboardError('Nom RP invalide (2-25 lettres, sans chiffres ni caractères spéciaux).');
      return;
    }
    if (!isValidCitizenId(cleanId)) {
      setOnboardError('ID Citoyen invalide (chiffres, lettres et tirets uniquement).');
      return;
    }
    if (cleanPhone && !isValidPhoneNumber(cleanPhone)) {
      setOnboardError('Numéro de téléphone in-game invalide.');
      return;
    }
    if (!rulesAccepted) {
      setOnboardError('Veuillez accepter le règlement du Diamond Casino.');
      return;
    }

    setOnboardSubmitting(true);
    try {
      await completeRPRegistration({
        rpFirstName: cleanFirst.charAt(0).toUpperCase() + cleanFirst.slice(1),
        rpLastName: cleanLast.charAt(0).toUpperCase() + cleanLast.slice(1),
        citizenId: cleanId,
        phoneNumber: cleanPhone,
      });
      showToast(`Bienvenue au Diamond Casino, ${cleanFirst} ! Profil créé.`);
    } catch (err: any) {
      setOnboardError(err.message || 'Erreur lors de la création du profil RP.');
    } finally {
      setOnboardSubmitting(false);
    }
  };

  const handleOpenEditModal = () => {
    if (user) {
      setEditFirstName(user.rpFirstName || '');
      setEditLastName(user.rpLastName || '');
      setEditCitizenId(user.citizenId || '');
      setEditPhone(user.phoneNumber || '');
      setEditError(null);
    }
    setIsEditingModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    const cleanFirst = sanitizeText(editFirstName.trim(), 25);
    const cleanLast = sanitizeText(editLastName.trim(), 25);
    const cleanId = sanitizeText(editCitizenId.trim(), 15);
    const cleanPhone = sanitizeText(editPhone.trim(), 15);

    if (!isValidRPName(cleanFirst) || !isValidRPName(cleanLast)) {
      setEditError('Nom ou prénom invalide.');
      return;
    }
    if (!isValidCitizenId(cleanId)) {
      setEditError('ID Citoyen invalide.');
      return;
    }
    if (cleanPhone && !isValidPhoneNumber(cleanPhone)) {
      setEditError('Numéro de téléphone in-game invalide.');
      return;
    }

    try {
      await updateProfile({
        rpFirstName: cleanFirst.charAt(0).toUpperCase() + cleanFirst.slice(1),
        rpLastName: cleanLast.charAt(0).toUpperCase() + cleanLast.slice(1),
        citizenId: cleanId,
        phoneNumber: cleanPhone,
      });
      setIsEditingModalOpen(false);
      showToast('Profil mis à jour.');
    } catch (err) {
      setEditError((err as Error).message || 'Mise à jour refusée.');
    }
  };

  const filteredTransactions: CasinoTransaction[] = useMemo(() => {
    return (user?.transactions || []).filter((tx) => {
      const matchQuery = !txSearchQuery || 
        (tx.label || '').toLowerCase().includes(txSearchQuery.toLowerCase()) ||
        (tx.category || '').toLowerCase().includes(txSearchQuery.toLowerCase()) ||
        (tx.id || '').toLowerCase().includes(txSearchQuery.toLowerCase());

      if (!matchQuery) return false;

      if (txFilter === 'ALL') return true;
      if (txFilter === 'WHEEL') return tx.category === 'Roue de la Fortune' || tx.type === 'spin_reward';
      if (txFilter === 'VIP') return tx.category === 'Abonnement VIP';
      if (txFilter === 'GAMES') return tx.category === 'Jeux' || tx.category === 'Caisse Casino';
      return true;
    });
  }, [user?.transactions, txFilter, txSearchQuery]);

  const isOwnerOrAdmin = hasAdminPermissions(user);

  // =========================================================================
  // VIEW A : CHARGEMENT
  // =========================================================================
  if (isLoading) {
    return (
      <div className="w-full min-h-screen bg-black flex items-center justify-center font-mono text-xs text-neutral-400">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-white animate-ping" />
          <span>Chargement du compte...</span>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW B : NON AUTHENTIFIÉ (LOGIN DISCORD OU FORMULAIRE RP)
  // =========================================================================
  if (!isAuthenticated || !user) {
    return (
      <div className="w-full min-h-screen bg-black text-white flex flex-col justify-between selection:bg-neutral-800 selection:text-white">
        {/* Toast */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="fixed top-6 right-6 z-50 px-4 py-2.5 rounded-lg bg-white text-black font-medium text-xs shadow-lg flex items-center gap-2"
            >
              <CheckCircle2 size={16} className="text-black" />
              <span>{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Minimal Header */}
        <header className="border-b border-neutral-900 px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            onClick={() => onBackToHome?.()}
            className="flex items-center gap-2 text-neutral-400 hover:text-white text-xs font-mono transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Retour au Casino</span>
          </Link>
          <span className="text-[11px] font-mono text-neutral-500 uppercase">Diamond Resort &bull; Espace Membre</span>
        </header>

        {/* Center Auth Card */}
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm border border-neutral-800 bg-[#0a0a0a] rounded-xl p-6 sm:p-8">
            {!pendingDiscordUser ? (
              <div className="flex flex-col text-center">
                <div className="flex justify-center mb-6">
                  <img
                    src="/diamond_casino_logo.png"
                    alt="Diamond Casino"
                    className="h-9 w-auto object-contain opacity-90"
                  />
                </div>

                <h1 className="text-lg font-semibold tracking-tight text-white mb-1.5">
                  Espace Membre
                </h1>
                <p className="text-xs text-neutral-400 leading-relaxed mb-6">
                  Connectez votre compte Discord pour gérer vos jetons, vos tirages quotidiens et vos accès VIP.
                </p>

                <button
                  type="button"
                  onClick={handleConnectDiscord}
                  disabled={isRedirecting}
                  className="w-full h-10 rounded-lg bg-white text-black hover:bg-neutral-200 font-medium text-xs flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  <span>{isRedirecting ? 'Redirection...' : 'Continuer avec Discord'}</span>
                </button>

                <div className="mt-8 pt-6 border-t border-neutral-900 text-left space-y-2.5">
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <Check size={14} className="text-white shrink-0" />
                    <span>Sauvegarde en temps réel de votre solde</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <Check size={14} className="text-white shrink-0" />
                    <span>1 tour gratuit à la Roue chaque jour</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <Check size={14} className="text-white shrink-0" />
                    <span>Authentification sécurisée officielle</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col text-left">
                {/* Pending user badge */}
                <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-between gap-3 mb-5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={pendingDiscordUser.avatarUrl}
                      alt={pendingDiscordUser.username}
                      className="w-8 h-8 rounded-full border border-neutral-700 object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-white block truncate">
                        {pendingDiscordUser.globalName || pendingDiscordUser.username}
                      </span>
                      <span className="text-[10px] text-neutral-500 font-mono block truncate">
                        {pendingDiscordUser.tag}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={cancelPendingDiscord}
                    className="text-[11px] text-neutral-400 hover:text-white underline cursor-pointer shrink-0"
                  >
                    Changer
                  </button>
                </div>

                <h2 className="text-base font-semibold text-white mb-1">
                  Finaliser votre profil
                </h2>
                <p className="text-xs text-neutral-400 mb-5">
                  Renseignez vos coordonnées Roleplay in-game pour initialiser votre compte.
                </p>

                {onboardError && (
                  <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-300 text-xs flex items-center gap-2 mb-4">
                    <AlertCircle size={14} className="text-white shrink-0" />
                    <span>{onboardError}</span>
                  </div>
                )}

                <form onSubmit={handleFinishOnboarding} className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-neutral-400">Prénom RP</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Dylan"
                        value={onboardFirst}
                        onChange={(e) => setOnboardFirst(e.target.value)}
                        className="w-full h-9 rounded-lg bg-black border border-neutral-800 px-3 text-xs text-white focus:outline-none focus:border-white transition-colors"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-neutral-400">Nom RP</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Carter"
                        value={onboardLast}
                        onChange={(e) => setOnboardLast(e.target.value)}
                        className="w-full h-9 rounded-lg bg-black border border-neutral-800 px-3 text-xs text-white focus:outline-none focus:border-white transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">ID / Matricule Citoyen</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 3932"
                      value={onboardCitizenId}
                      onChange={(e) => setOnboardCitizenId(e.target.value)}
                      className="w-full h-9 rounded-lg bg-black border border-neutral-800 px-3 text-xs font-mono text-white focus:outline-none focus:border-white transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">Téléphone in-game (optionnel)</label>
                    <input
                      type="text"
                      placeholder="Ex: 555-0142"
                      value={onboardPhone}
                      onChange={(e) => setOnboardPhone(e.target.value)}
                      className="w-full h-9 rounded-lg bg-black border border-neutral-800 px-3 text-xs font-mono text-white focus:outline-none focus:border-white transition-colors"
                    />
                  </div>

                  <label className="flex items-center gap-2 pt-1 text-[11px] text-neutral-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rulesAccepted}
                      onChange={(e) => setRulesAccepted(e.target.checked)}
                      className="rounded border-neutral-800 accent-white"
                    />
                    <span>J'accepte le règlement du Diamond Casino</span>
                  </label>

                  <button
                    type="submit"
                    disabled={onboardSubmitting}
                    className="w-full h-10 mt-2 rounded-lg bg-white text-black hover:bg-neutral-200 font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span>{onboardSubmitting ? 'Création en cours...' : 'Créer mon profil'}</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        </main>

        {/* Minimal Footer */}
        <footer className="border-t border-neutral-900 px-6 py-4 text-center text-xs text-neutral-600 font-mono">
          Diamond Casino &bull; FiveM Los Santos RP
        </footer>
      </div>
    );
  }

  // =========================================================================
  // VIEW C : ESPACE MEMBRE AUTHENTIFIÉ (DESIGN VERCEL PUR ET CLAIR)
  // =========================================================================
  return (
    <div className="w-full min-h-screen bg-black text-white flex flex-col font-sans selection:bg-neutral-800 selection:text-white">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-5 right-5 z-50 px-4 py-2.5 rounded-lg bg-white text-black font-medium text-xs shadow-xl flex items-center gap-2"
          >
            <CheckCircle2 size={16} className="text-black" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Navbar */}
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              onClick={() => onBackToHome?.()}
              className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-xs font-mono"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">Casino</span>
            </Link>
            <span className="text-neutral-700">/</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">Espace Membre</span>
              <span className="text-[11px] font-mono text-neutral-500">#{user.citizenId}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isOwnerOrAdmin && (
              <Link
                to="/admin"
                className="px-2.5 py-1 rounded border border-neutral-700 hover:border-neutral-500 text-neutral-300 hover:text-white text-xs font-mono transition-colors"
              >
                Admin
              </Link>
            )}

            <div className="flex items-center gap-2.5 pl-3 border-l border-neutral-800">
              <img
                src={user.avatarUrl}
                alt={user.rpFirstName}
                className="w-6 h-6 rounded-full border border-neutral-700 object-cover"
              />
              <span className="text-xs font-medium text-white hidden sm:inline">
                {user.rpFirstName} {user.rpLastName}
              </span>
              <button
                type="button"
                onClick={() => setIsLogoutModalOpen(true)}
                title="Se déconnecter"
                className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors cursor-pointer"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Subnav Tabs (Vercel Style Underline) */}
      <nav className="border-b border-neutral-800 bg-black sticky top-14 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'overview', label: "Vue d'ensemble" },
            { 
              id: 'lots', 
              label: 'Mes récompenses', 
              count: user.rewards.filter((r) => r.status === 'IN_INVENTORY').length 
            },
            { id: 'vault', label: 'Historique des jetons' },
            { id: 'profile', label: 'Mon profil' },
            { id: 'vip', label: 'Avantages VIP' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ConsoleTab)}
                className={`relative py-3 px-3 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                  isActive ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white text-black font-bold">
                    {tab.count}
                  </span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="activeTabUnderline"
                    className="absolute bottom-0 inset-x-0 h-0.5 bg-white"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        
        {/* =================================================================== */}
        {/* TAB 1: VUE D'ENSEMBLE                                               */}
        {/* =================================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            
            {/* User Greeting & Fast Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
              <div>
                <h1 className="text-xl font-semibold text-white tracking-tight">
                  Bonjour, {user.rpFirstName}
                </h1>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Matricule #{user.citizenId} &bull; Compte Discord @{user.discordTag || 'connecté'} &bull; Adhésion {user.vipTier ? `VIP ${user.vipTier}` : 'Standard'}
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <Link
                  to="/roue-de-la-fortune"
                  onClick={() => onNavigateToWheel?.()}
                  className={`h-9 px-4 rounded-lg font-medium text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                    canSpinWheel
                      ? 'bg-white text-black hover:bg-neutral-200'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
                  }`}
                >
                  <Disc size={14} className={canSpinWheel ? 'animate-spin' : ''} style={{ animationDuration: '6s' }} />
                  <span>{canSpinWheel ? 'Tourner la Roue' : 'Roue quotidienne'}</span>
                </Link>

                <button
                  type="button"
                  onClick={handleOpenEditModal}
                  className="h-9 px-3.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit3 size={13} />
                  <span>Modifier</span>
                </button>
              </div>
            </div>

            {/* 4 Stat Cards Grid (Clean Vercel Cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Card 1: Solde Jetons */}
              <div className="p-4 rounded-xl border border-neutral-800 bg-[#0a0a0a] flex flex-col justify-between">
                <div className="flex items-center justify-between text-neutral-400 text-xs">
                  <span className="font-mono text-[11px] uppercase">Solde de jetons</span>
                  <Coins size={14} className="text-neutral-500" />
                </div>
                <div className="my-2.5">
                  <div className="text-2xl font-bold font-mono text-white tracking-tight">
                    {user.chips.toLocaleString()} <span className="text-sm font-normal text-neutral-400">⛁</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('vault')}
                  className="text-[11px] text-neutral-400 hover:text-white flex items-center justify-between pt-2 border-t border-neutral-900 transition-colors cursor-pointer"
                >
                  <span>Voir l'historique</span>
                  <ChevronRight size={12} />
                </button>
              </div>

              {/* Card 2: Roue de la fortune */}
              <div className="p-4 rounded-xl border border-neutral-800 bg-[#0a0a0a] flex flex-col justify-between">
                <div className="flex items-center justify-between text-neutral-400 text-xs">
                  <span className="font-mono text-[11px] uppercase">Roue quotidienne</span>
                  <Disc size={14} className="text-neutral-500" />
                </div>
                <div className="my-2.5">
                  <div className="text-sm font-semibold text-white">
                    {canSpinWheel ? (
                      <span className="text-white flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-white" />
                        Tirage disponible
                      </span>
                    ) : (
                      <span className="text-neutral-400 font-mono">
                        Dans {timeUntilNextSpin || '24h'}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-neutral-500 font-mono">
                    {user.totalSpins || 0} tirage{(user.totalSpins || 0) > 1 ? 's' : ''} effectué{(user.totalSpins || 0) > 1 ? 's' : ''}
                  </span>
                </div>
                <Link
                  to="/roue-de-la-fortune"
                  onClick={() => onNavigateToWheel?.()}
                  className="text-[11px] text-neutral-400 hover:text-white flex items-center justify-between pt-2 border-t border-neutral-900 transition-colors"
                >
                  <span>{canSpinWheel ? 'Lancer maintenant' : 'Voir le podium'}</span>
                  <ChevronRight size={12} />
                </Link>
              </div>

              {/* Card 3: Adhésion VIP */}
              <div className="p-4 rounded-xl border border-neutral-800 bg-[#0a0a0a] flex flex-col justify-between">
                <div className="flex items-center justify-between text-neutral-400 text-xs">
                  <span className="font-mono text-[11px] uppercase">Niveau d'adhésion</span>
                  <Crown size={14} className="text-neutral-500" />
                </div>
                <div className="my-2.5">
                  <div className="text-sm font-semibold text-white">
                    {user.vipTier ? `VIP ${user.vipTier}` : 'Membre Standard'}
                  </div>
                  <span className="text-[11px] text-neutral-500 font-mono">
                    {user.vipTier === 'DIAMOND' 
                      ? '3 tirages / jour (8h cooldown)' 
                      : user.vipTier === 'GOLD' 
                      ? '2 tirages / jour (12h cooldown)' 
                      : '1 tirage / jour (24h cooldown)'}
                  </span>
                </div>
                <Link
                  to="/abonnements"
                  className="text-[11px] text-neutral-400 hover:text-white flex items-center justify-between pt-2 border-t border-neutral-900 transition-colors"
                >
                  <span>Gérer l'abonnement</span>
                  <ChevronRight size={12} />
                </Link>
              </div>

              {/* Card 4: Fiche Citoyenne */}
              <div className="p-4 rounded-xl border border-neutral-800 bg-[#0a0a0a] flex flex-col justify-between">
                <div className="flex items-center justify-between text-neutral-400 text-xs">
                  <span className="font-mono text-[11px] uppercase">Téléphone in-game</span>
                  <User size={14} className="text-neutral-500" />
                </div>
                <div className="my-2.5">
                  <div className="text-sm font-mono font-medium text-white truncate">
                    {user.phoneNumber || 'Non renseigné'}
                  </div>
                  <span className="text-[11px] text-neutral-500 font-mono">
                    ID #{user.citizenId}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleOpenEditModal}
                  className="text-[11px] text-neutral-400 hover:text-white flex items-center justify-between pt-2 border-t border-neutral-900 transition-colors cursor-pointer"
                >
                  <span>Modifier les infos</span>
                  <ChevronRight size={12} />
                </button>
              </div>

            </div>

            {/* Split Section: Recent Transactions + Recent Rewards */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
              
              {/* Left Column (7 cols): Dernières transactions */}
              <div className="lg:col-span-7 border border-neutral-800 bg-[#0a0a0a] rounded-xl p-5">
                <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-neutral-800">
                  <div className="flex items-center gap-2">
                    <History size={14} className="text-neutral-400" />
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
                      Dernières transactions
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('vault')}
                    className="text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Voir tout &rarr;
                  </button>
                </div>

                <div className="space-y-2">
                  {user.transactions && user.transactions.length > 0 ? (
                    user.transactions.slice(0, 4).map((tx) => (
                      <div
                        key={tx.id}
                        className="py-2.5 px-3 rounded-lg bg-black border border-neutral-900 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-medium text-white block truncate">
                            {tx.label}
                          </span>
                          <span className="text-[10px] text-neutral-500 font-mono">
                            {new Date(tx.date).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })} &bull; {tx.category}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          {tx.amountChips !== 0 ? (
                            <span className={`font-mono font-medium ${tx.amountChips > 0 ? 'text-white' : 'text-neutral-400'}`}>
                              {tx.amountChips > 0 ? `+${tx.amountChips.toLocaleString()}` : tx.amountChips.toLocaleString()} ⛁
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-neutral-400">
                              {tx.status}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-xs text-neutral-500 font-mono">
                      Aucune transaction récente
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column (5 cols): Mes Récompenses & Podium */}
              <div className="lg:col-span-5 border border-neutral-800 bg-[#0a0a0a] rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-neutral-800">
                    <div className="flex items-center gap-2">
                      <Car size={14} className="text-neutral-400" />
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
                        Mes lots & récompenses
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('lots')}
                      className="text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Inventaire ({user.rewards.length}) &rarr;
                    </button>
                  </div>

                  <div className="space-y-2">
                    {user.rewards.length > 0 ? (
                      user.rewards.slice(0, 3).map((reward) => (
                        <div
                          key={reward.id}
                          className="p-3 rounded-lg bg-black border border-neutral-900 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-medium text-white block truncate">
                              {reward.label}
                            </span>
                            <span className="text-[10px] text-neutral-500 font-mono uppercase">
                              {reward.kind === 'vehicle' ? 'Véhicule' : 'Objet'}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
                            reward.status === 'IN_INVENTORY'
                              ? 'bg-white text-black font-semibold border-white'
                              : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                          }`}>
                            {reward.status === 'IN_INVENTORY' ? 'À réclamer' : 'Remis'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="py-8 text-center text-xs text-neutral-500 font-mono">
                        Aucun lot dans votre inventaire pour l'instant.
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-neutral-900">
                  <Link
                    to="/roue-de-la-fortune"
                    onClick={() => onNavigateToWheel?.()}
                    className="w-full h-9 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 text-xs font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <Disc size={13} />
                    <span>Voir le véhicule sur le podium</span>
                  </Link>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: MES RÉCOMPENSES (UTILISE MEMBER REWARDS)                     */}
        {/* =================================================================== */}
        {activeTab === 'lots' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div>
                <h1 className="text-lg font-semibold text-white tracking-tight">
                  Mes Récompenses &amp; Lots
                </h1>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Consultez les véhicules et gains remportés à la Roue et demandez leur remise en ville.
                </p>
              </div>
            </div>

            <MemberRewards showToast={showToast} />
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: HISTORIQUE DES JETONS                                        */}
        {/* =================================================================== */}
        {activeTab === 'vault' && (
          <div className="space-y-6">
            
            {/* Header & Balance Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-neutral-800 bg-[#0a0a0a]">
              <div>
                <span className="text-[11px] font-mono uppercase text-neutral-400 block mb-1">
                  Solde disponible
                </span>
                <div className="text-3xl font-bold font-mono text-white">
                  {user.chips.toLocaleString()} <span className="text-sm font-normal text-neutral-400">⛁</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Gains cumulés : <span className="font-mono text-neutral-300">{(user.totalWon || 0).toLocaleString()} ⛁</span> &bull; Tirages : <span className="font-mono text-neutral-300">{user.totalSpins || 0}</span>
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <Link
                  to="/roue-de-la-fortune"
                  onClick={() => onNavigateToWheel?.()}
                  className="h-9 px-4 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Disc size={13} />
                  <span>Jouer à la Roue</span>
                </Link>
                <Link
                  to="/abonnements"
                  className="h-9 px-4 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Crown size={13} />
                  <span>Pass VIP</span>
                </Link>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-0.5 rounded-lg border border-neutral-800 bg-neutral-950 text-xs">
                {(['ALL', 'WHEEL', 'VIP', 'GAMES'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTxFilter(key)}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                      txFilter === key
                        ? 'bg-neutral-800 text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {key === 'ALL' ? 'Toutes' : key === 'WHEEL' ? 'Roue' : key === 'VIP' ? 'VIP' : 'Jeux'}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  value={txSearchQuery}
                  onChange={(e) => setTxSearchQuery(e.target.value)}
                  placeholder="Rechercher une opération..."
                  className="w-full h-8 pl-8 pr-3 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors font-mono"
                />
              </div>
            </div>

            {/* Transactions Table */}
            <div className="border border-neutral-800 rounded-xl overflow-hidden bg-[#0a0a0a]">
              {filteredTransactions.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  <p className="text-xs text-neutral-500 font-mono">
                    Aucune transaction trouvée.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-900">
                  {filteredTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-3.5 sm:px-4 flex items-center justify-between gap-4 hover:bg-neutral-950/50 transition-colors text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0 text-neutral-400">
                          {tx.type === 'spin_reward' ? (
                            <Disc size={14} />
                          ) : tx.type === 'vip_subscription' ? (
                            <Crown size={14} />
                          ) : (
                            <Coins size={14} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-medium text-white block truncate">
                            {tx.label}
                          </span>
                          <span className="text-[11px] text-neutral-500 font-mono">
                            {new Date(tx.date).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })} &bull; {tx.category}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {tx.amountChips !== 0 ? (
                          <div className={`font-mono font-medium ${tx.amountChips > 0 ? 'text-white' : 'text-neutral-400'}`}>
                            {tx.amountChips > 0 ? `+${tx.amountChips.toLocaleString()}` : tx.amountChips.toLocaleString()} ⛁
                          </div>
                        ) : (
                          <div className="text-[11px] font-mono text-neutral-400 uppercase">
                            {tx.type === 'vip_request' ? 'Demande VIP' : 'Lot'}
                          </div>
                        )}
                        <span className="text-[10px] font-mono text-neutral-500 uppercase">
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: MON PROFIL CITOYEN                                           */}
        {/* =================================================================== */}
        {activeTab === 'profile' && (
          <div className="space-y-6 max-w-3xl">
            
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div>
                <h1 className="text-lg font-semibold text-white tracking-tight">
                  Informations du Compte
                </h1>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Coordonnées in-game enregistrées et liaison avec votre compte Discord.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenEditModal}
                className="h-8 px-3 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Edit3 size={13} />
                <span>Modifier</span>
              </button>
            </div>

            {/* Profile Identity Card */}
            <div className="border border-neutral-800 rounded-xl bg-[#0a0a0a] divide-y divide-neutral-900">
              <div className="p-4 sm:p-5 flex items-center gap-4">
                <img
                  src={user.avatarUrl}
                  alt={user.rpFirstName}
                  className="w-14 h-14 rounded-full border border-neutral-700 object-cover"
                />
                <div>
                  <h2 className="text-base font-semibold text-white">
                    {user.rpFirstName} {user.rpLastName}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400 font-mono">
                    <span>Matricule #{user.citizenId}</span>
                    <span>&bull;</span>
                    <span>{user.vipTier ? `VIP ${user.vipTier}` : user.role}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-[11px] font-mono text-neutral-500 uppercase block mb-1">
                    Prénom &amp; Nom Roleplay
                  </span>
                  <span className="font-medium text-white text-sm">
                    {user.rpFirstName} {user.rpLastName}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-mono text-neutral-500 uppercase block mb-1">
                    Numéro de Citoyen
                  </span>
                  <span className="font-mono font-medium text-white text-sm">
                    #{user.citizenId}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-mono text-neutral-500 uppercase block mb-1">
                    Téléphone In-Game
                  </span>
                  <span className="font-mono text-neutral-300 text-sm">
                    {user.phoneNumber || 'Non renseigné'}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-mono text-neutral-500 uppercase block mb-1">
                    Date d'inscription
                  </span>
                  <span className="font-mono text-neutral-300 text-sm">
                    {new Date(user.joinedAt || Date.now()).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              </div>

              {/* Linked Discord */}
              <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-white">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-white block">
                      Compte Discord relié
                    </span>
                    <span className="text-[11px] font-mono text-neutral-500">
                      @{user.discordTag || user.discordId}
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-neutral-900 border border-neutral-800 text-neutral-400">
                  Vérifié
                </span>
              </div>
            </div>

          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 5: AVANTAGES VIP                                                */}
        {/* =================================================================== */}
        {activeTab === 'vip' && (
          <div className="space-y-6">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
              <div>
                <h1 className="text-lg font-semibold text-white tracking-tight">
                  Paliers &amp; Avantages VIP
                </h1>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Augmentez votre fréquence de tirages à la Roue de la Fortune et accédez aux salons privés.
                </p>
              </div>

              <Link
                to="/abonnements"
                className="h-9 px-4 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-medium flex items-center gap-1.5 transition-colors self-start sm:self-auto"
              >
                <span>Souscrire un abonnement</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            {/* 3 VIP Tiers Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Tier 1: Standard */}
              <div className="p-5 rounded-xl border border-neutral-800 bg-[#0a0a0a] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
                    <span className="font-mono uppercase text-[11px]">Membre Standard</span>
                    <span>Gratuit</span>
                  </div>
                  <h3 className="text-base font-semibold text-white mb-4">Citoyen Los Santos</h3>
                  <ul className="space-y-2.5 text-xs text-neutral-400">
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-white shrink-0" />
                      <span>1 tirage de Roue toutes les 24h</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-white shrink-0" />
                      <span>Accès aux tables publiques</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-white shrink-0" />
                      <span>Fiche citoyenne certifiée</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-4 mt-6 border-t border-neutral-900">
                  <span className="text-[11px] font-mono text-neutral-500 uppercase">
                    Statut de base
                  </span>
                </div>
              </div>

              {/* Tier 2: VIP Gold */}
              <div className="p-5 rounded-xl border border-neutral-700 bg-neutral-950 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
                    <span className="font-mono uppercase text-[11px] text-white">VIP Gold</span>
                    <span className="text-[10px] font-mono bg-white text-black px-1.5 py-0.2 rounded font-bold">Populaire</span>
                  </div>
                  <h3 className="text-base font-semibold text-white mb-4">High Roller</h3>
                  <ul className="space-y-2.5 text-xs text-neutral-300">
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-white shrink-0" />
                      <span><strong>2 tirages / jour</strong> (Cooldown 12h)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-white shrink-0" />
                      <span>+60 000 jetons offerts à l'adhésion</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-white shrink-0" />
                      <span>Salons privés High Roller</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-4 mt-6 border-t border-neutral-800">
                  <Link
                    to="/abonnements"
                    className="text-xs text-white hover:underline flex items-center justify-between font-medium"
                  >
                    <span>Voir l'offre VIP Gold</span>
                    <ChevronRight size={12} />
                  </Link>
                </div>
              </div>

              {/* Tier 3: VIP Diamond */}
              <div className="p-5 rounded-xl border border-neutral-800 bg-[#0a0a0a] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
                    <span className="font-mono uppercase text-[11px]">Black Diamond</span>
                    <span>Élite</span>
                  </div>
                  <h3 className="text-base font-semibold text-white mb-4">Maître du Resort</h3>
                  <ul className="space-y-2.5 text-xs text-neutral-400">
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-white shrink-0" />
                      <span><strong>3 tirages / jour</strong> (Cooldown 8h)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-white shrink-0" />
                      <span>+150 000 jetons offerts à l'adhésion</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-white shrink-0" />
                      <span>Accès Rooftop &amp; Penthouse</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-4 mt-6 border-t border-neutral-900">
                  <Link
                    to="/abonnements"
                    className="text-xs text-white hover:underline flex items-center justify-between font-medium"
                  >
                    <span>Voir l'offre Black Diamond</span>
                    <ChevronRight size={12} />
                  </Link>
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* ===================================================================== */}
      {/* MODAL 1: MODIFIER PROFIL RP                                           */}
      {/* ===================================================================== */}
      <AnimatePresence>
        {isEditingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-sm rounded-xl bg-[#0a0a0a] border border-neutral-800 p-6 shadow-2xl relative"
            >
              <button
                type="button"
                onClick={() => setIsEditingModalOpen(false)}
                className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>

              <h2 className="text-sm font-semibold text-white mb-1">
                Modifier mes informations
              </h2>
              <p className="text-xs text-neutral-400 mb-4">
                Mise à jour de vos coordonnées enregistrées.
              </p>

              {editError && (
                <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-300 text-xs flex items-center gap-2 mb-3">
                  <AlertCircle size={14} className="text-white shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">Prénom RP</label>
                    <input
                      type="text"
                      disabled
                      value={editFirstName}
                      className="w-full h-8 rounded-lg bg-neutral-900 border border-neutral-800 px-2.5 text-xs text-neutral-500 cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">Nom RP</label>
                    <input
                      type="text"
                      disabled
                      value={editLastName}
                      className="w-full h-8 rounded-lg bg-neutral-900 border border-neutral-800 px-2.5 text-xs text-neutral-500 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-400">ID Citoyen</label>
                  <input
                    type="text"
                    disabled
                    value={editCitizenId}
                    className="w-full h-8 rounded-lg bg-neutral-900 border border-neutral-800 px-2.5 text-xs font-mono text-neutral-500 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-400">Téléphone in-game</label>
                  <input
                    type="text"
                    maxLength={15}
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="555-0142"
                    className="w-full h-8 rounded-lg bg-black border border-neutral-800 px-2.5 text-xs font-mono text-white focus:outline-none focus:border-white transition-colors"
                  />
                </div>

                <div className="flex items-center gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsEditingModalOpen(false)}
                    className="flex-1 h-9 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-xs font-medium text-neutral-300 transition-colors cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex-1 h-9 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Enregistrer
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ===================================================================== */}
      {/* MODAL 2: CONFIRMATION DÉCONNEXION                                     */}
      {/* ===================================================================== */}
      <AnimatePresence>
        {isLogoutModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-sm rounded-xl bg-[#0a0a0a] border border-neutral-800 p-6 shadow-2xl relative text-left"
            >
              <h2 className="text-sm font-semibold text-white mb-1.5">
                Se déconnecter
              </h2>
              <p className="text-xs text-neutral-400 leading-relaxed mb-5">
                Êtes-vous sûr de vouloir fermer votre session ? Votre solde ({user.chips.toLocaleString()} ⛁) et vos récompenses restent sauvegardés sur le serveur.
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsLogoutModalOpen(false)}
                  className="flex-1 h-9 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-xs font-medium text-neutral-300 transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsLogoutModalOpen(false);
                    void logout();
                  }}
                  className="flex-1 h-9 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-medium transition-colors cursor-pointer"
                >
                  Déconnexion
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
