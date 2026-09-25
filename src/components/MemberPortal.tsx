import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from '@tanstack/react-router';
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
  Clock,
  X,
  Activity,
  ChevronRight,
  Search,
  Wifi
} from 'lucide-react';
import { useCasinoUser, type CasinoTransaction } from '../context/CasinoUserContext';
import { sanitizeText, isValidCitizenId, isValidRPName, isValidPhoneNumber } from '../lib/security';
import { dbCheckHealth } from '../lib/supabase';
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

  const navigate = useNavigate();

  // Internal view state
  const [activeTab, setActiveTab] = useState<ConsoleTab>('overview');
  const [txFilter, setTxFilter] = useState<'ALL' | 'WHEEL' | 'VIP' | 'GAMES'>('ALL');
  const [txSearchQuery, setTxSearchQuery] = useState<string>('');
  const [isEditingModalOpen, setIsEditingModalOpen] = useState<boolean>(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState<boolean>(false);

  // Live real-time clock & Supabase connection status
  const [liveClock, setLiveClock] = useState<string>('');
  const [supabaseOnline, setSupabaseOnline] = useState<boolean | null>(null);
  const [supabasePing, setSupabasePing] = useState<number>(34);

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

  // Canvas ref for interactive matrix background (unauthenticated auth view)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Live Supabase Health Check
  useEffect(() => {
    const checkSupabase = () => {
      const start = Date.now();
      dbCheckHealth()
        .then((res) => {
          setSupabaseOnline(res.online);
          setSupabasePing(res.latencyMs || Math.max(18, Date.now() - start));
        })
        .catch(() => {
          setSupabaseOnline(false);
        });
    };

    checkSupabase();
    const healthInterval = setInterval(checkSupabase, 30000);
    return () => clearInterval(healthInterval);
  }, []);

  // Live Los Santos Clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setLiveClock(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Interactive matrix background canvas (used on unauthenticated landing)
  useEffect(() => {
    if (isAuthenticated) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    const step = 14;
    const mouse = { x: -1000, y: -1000 };
    const smoothedMouse = { x: -1000, y: -1000 };
    let hasInteracted = false;
    let lastMoveTime = Date.now();
    let animId: number;

    const handleResize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      lastMoveTime = Date.now();
      hasInteracted = true;
    };

    const handleMouseLeave = () => {
      hasInteracted = false;
    };

    container.addEventListener('mousemove', handleMouseMove, { passive: true });
    container.addEventListener('mouseleave', handleMouseLeave);

    const render = (time: number) => {
      const t = time * 0.001;
      const elapsed = Date.now() - lastMoveTime;

      let targetX = mouse.x;
      let targetY = mouse.y;

      if (!hasInteracted || elapsed > 3000) {
        targetX = width * 0.5 + Math.sin(t * 0.8) * (width * 0.28);
        targetY = height * 0.5 + Math.cos(t * 0.6) * (height * 0.22);
        smoothedMouse.x += (targetX - smoothedMouse.x) * 0.05;
        smoothedMouse.y += (targetY - smoothedMouse.y) * 0.05;
      } else {
        smoothedMouse.x = mouse.x;
        smoothedMouse.y = mouse.y;
      }

      ctx.clearRect(0, 0, width, height);

      const glowRadius = Math.min(220, Math.max(140, width * 0.25));
      if (smoothedMouse.x > 0 && smoothedMouse.x < width && smoothedMouse.y > 0 && smoothedMouse.y < height) {
        const radGrad = ctx.createRadialGradient(
          smoothedMouse.x, smoothedMouse.y, 0,
          smoothedMouse.x, smoothedMouse.y, glowRadius * 1.3
        );
        radGrad.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
        radGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)');
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(smoothedMouse.x, smoothedMouse.y, glowRadius * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }

      const cols = Math.ceil(width / step) + 1;
      const rows = Math.ceil(height / step) + 1;

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = c * step;
          const y = r * step;
          const dx = smoothedMouse.x - x;
          const dy = smoothedMouse.y - y;
          const distSq = dx * dx + dy * dy;

          let radius = 1.0;
          let alpha = 0.08;

          if (distSq < glowRadius * glowRadius) {
            const dist = Math.sqrt(distSq);
            const factor = 1 - dist / glowRadius;
            radius = 1.0 + factor * 1.8;
            alpha = 0.08 + factor * 0.55;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          } else {
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          }

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animId);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (authError) showToast(authError);
  }, [authError]);

  // Primary Action: Trigger official Discord OAuth flow
  const handleConnectDiscord = async () => {
    setIsRedirecting(true);
    showToast('Connexion Discord en cours...');
    try {
      await loginWithDiscordOAuth(); // redirects to Discord on success
    } catch {
      setIsRedirecting(false);
    }
  };

  // Onboarding submission handler (First-time registration)
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
      showToast(`Bienvenue au Diamond Casino, ${cleanFirst} ! Console activée.`);
    } catch (err: any) {
      setOnboardError(err.message || 'Erreur lors de la création du profil RP.');
    } finally {
      setOnboardSubmitting(false);
    }
  };

  // Profile Edition Modal Open
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

  // Profile Edition Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    const cleanFirst = sanitizeText(editFirstName.trim(), 25);
    const cleanLast = sanitizeText(editLastName.trim(), 25);
    const cleanId = sanitizeText(editCitizenId.trim(), 15);
    const cleanPhone = sanitizeText(editPhone.trim(), 15);

    if (!isValidRPName(cleanFirst)) {
      setEditError('Prénom RP invalide (2-25 lettres).');
      return;
    }
    if (!isValidRPName(cleanLast)) {
      setEditError('Nom RP invalide (2-25 lettres).');
      return;
    }
    if (!isValidCitizenId(cleanId)) {
      setEditError('ID Citoyen invalide (lettres, chiffres et tirets uniquement).');
      return;
    }
    if (cleanPhone && !isValidPhoneNumber(cleanPhone)) {
      setEditError('Numéro de téléphone in-game invalide.');
      return;
    }

    const formattedFirst = cleanFirst.charAt(0).toUpperCase() + cleanFirst.slice(1);
    const formattedLast = cleanLast.charAt(0).toUpperCase() + cleanLast.slice(1);

    try {
      await updateProfile({
        rpFirstName: formattedFirst,
        rpLastName: formattedLast,
        citizenId: cleanId,
        phoneNumber: cleanPhone,
      });
      setIsEditingModalOpen(false);
      showToast('Profil citoyen mis à jour et synchronisé.');
    } catch (err) {
      setEditError((err as Error).message || 'Mise à jour refusée par le serveur.');
    }
  };

  // Filtered transactions for the client console ledger
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
  // VIEW A : UNAUTHENTICATED USERS (LOGIN & FIRST-TIME ONBOARDING SPLIT VIEW)
  // =========================================================================
  if (isLoading) {
    return (
      <div className="w-full min-h-screen bg-black flex items-center justify-center font-['Geist_Mono'] text-xs tracking-[3px] uppercase text-neutral-400">
        Connexion à votre suite…
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="w-full min-h-screen lg:h-screen bg-black flex flex-col lg:grid lg:grid-cols-2 font-sans relative overflow-x-hidden lg:overflow-hidden select-none">
        {/* Toast Feedback */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-6 right-6 z-50 px-6 py-3 rounded-full bg-white text-black font-semibold text-sm shadow-[0_0_30px_rgba(255,255,255,0.4)] flex items-center gap-2"
            >
              <CheckCircle2 size={18} className="text-black" />
              {toastMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Left Side: Matrix Canvas & Prestige Presentation (Full Edge-to-Edge Half) */}
        <div 
          ref={containerRef}
          className="relative w-full h-[380px] sm:h-[460px] lg:h-full border-b lg:border-b-0 lg:border-r border-white/10 bg-[#050608] flex items-center justify-center p-6 sm:p-10 lg:p-14 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.9)]"
        >
          <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_18%_22%,rgba(255,255,255,0.06)_0%,transparent_45%),radial-gradient(circle_at_82%_78%,rgba(45,65,105,0.12)_0%,transparent_55%),radial-gradient(circle_at_50%_50%,rgba(12,14,20,0.7),#030406)] pointer-events-none" />
          <canvas ref={canvasRef} className="absolute inset-0 z-10 w-full h-full pointer-events-none" />
          <div className="absolute inset-0 z-20 pointer-events-none bg-[radial-gradient(circle_at_center,transparent,rgba(0,0,0,0.55)),linear-gradient(to_bottom,rgba(3,4,6,0.4),transparent_40%,rgba(3,4,6,0.8))]" />

          {/* Floating Back Button */}
          <div className="absolute top-6 left-6 sm:top-8 sm:left-8 z-30">
            <Link
              to="/"
              onClick={() => onBackToHome?.()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/15 text-white text-xs font-semibold tracking-wide transition-all cursor-pointer shadow-lg group"
              title="Retour au Casino"
            >
              <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
              <span>Retour au Casino</span>
            </Link>
          </div>

          {/* Perfectly Centered Content */}
          <div className="relative z-30 flex flex-col items-center text-center max-w-xl mx-auto py-6">
            <div className="mb-6 sm:mb-8 flex justify-center items-center">
              <img
                src="/diamond_casino_logo.png"
                alt="The Diamond Casino & Resort"
                className="h-36 sm:h-48 lg:h-56 xl:h-64 w-auto max-w-[90%] object-contain drop-shadow-[0_0_60px_rgba(255,255,255,0.38)] transition-transform hover:scale-105 duration-300"
              />
            </div>

            <p className="text-neutral-400 text-xs sm:text-sm lg:text-[15px] leading-relaxed max-w-md mx-auto font-normal">
              Explorez nos salons exclusifs : jeux de table VIP, Roue de la Fortune quotidienne, salons privés et service d'exception Los Santos RP.
            </p>
          </div>
        </div>

        {/* Right Side: Clean Discord OAuth Landing or Onboarding Form (Full Edge-to-Edge Half) */}
        <div className="w-full h-full min-h-[520px] lg:min-h-0 bg-neutral-950 flex flex-col justify-center items-center p-6 sm:p-12 lg:p-16 overflow-y-auto relative custom-scrollbar">
            {!pendingDiscordUser ? (
              <motion.div
                key="auth-landing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="w-full max-w-[440px] mx-auto my-auto flex flex-col items-center text-center"
              >
                <div className="mb-4 flex items-center justify-center">
                  <img
                    src="/diamond_casino_logo.png"
                    alt="The Diamond Casino"
                    className="h-12 w-auto object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                  />
                </div>

                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
                  Espace Membre
                </h2>
                <p className="text-neutral-400 text-xs sm:text-[13.5px] leading-relaxed mb-8 max-w-sm">
                  Connectez votre compte Discord pour accéder instantanément à votre console privée, vos jetons réels et votre profil citoyen.
                </p>

                <button
                  type="button"
                  onClick={handleConnectDiscord}
                  disabled={isRedirecting}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#5865F2] to-[#4752C4] hover:from-[#4752C4] hover:to-[#3b44a9] active:scale-[0.99] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-3.5 transition-all cursor-pointer border border-white/20 shadow-[0_4px_30px_rgba(88,101,242,0.45)] disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  <span>{isRedirecting ? 'Redirection vers Discord...' : 'Connexion avec Discord'}</span>
                </button>

                <div className="w-full mt-6 p-4 rounded-2xl bg-white/[0.03] border border-white/8 text-left space-y-2">
                  <div className="flex items-center gap-2 text-white text-xs font-semibold">
                    <ShieldCheck size={16} className="text-neutral-300" />
                    <span>Synchronisation Cloud Supabase Sécurisée</span>
                  </div>
                  <p className="text-[11.5px] text-neutral-400 leading-relaxed">
                    Connexion officielle Discord OAuth2. Vos jetons, historique de gains et profil citoyen sont automatiquement conservés et synchronisés en temps réel.
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="auth-onboarding"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full max-w-[480px] mx-auto my-auto flex flex-col text-left py-2"
              >
                <div className="p-4 rounded-2xl bg-gradient-to-r from-[#5865F2]/15 via-[#181926]/90 to-[#0e0f18] border border-[#5865F2]/30 flex items-center justify-between gap-3 mb-6 shadow-xl">
                  <div className="flex items-center gap-3.5">
                    <div className="relative">
                      <img
                        src={pendingDiscordUser.avatarUrl}
                        alt={pendingDiscordUser.globalName || pendingDiscordUser.username}
                        className="w-12 h-12 rounded-full ring-2 ring-[#5865F2] ring-offset-2 ring-offset-black object-cover shadow-[0_0_16px_rgba(88,101,242,0.4)]"
                      />
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-white border-2 border-black" />
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-300 font-semibold tracking-wide flex items-center gap-1.5 uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-pulse" />
                        Discord Authentifié
                      </span>
                      <strong className="text-base font-bold text-white block leading-tight mt-0.5">
                        {pendingDiscordUser.globalName || pendingDiscordUser.username}
                      </strong>
                      <span className="text-xs text-neutral-400 font-mono">
                        {pendingDiscordUser.tag}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={cancelPendingDiscord}
                    className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
                  >
                    Changer
                  </button>
                </div>

                <div className="mb-5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-white/10 text-neutral-300 border border-white/20 mb-2">
                    <User size={12} className="text-white" />
                    Création de Profil Citoyen
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                    Identité Citoyenne
                  </h2>
                  <p className="text-neutral-400 text-xs sm:text-[13px] leading-relaxed mt-1">
                    Renseignez vos coordonnées in-game. Elles seront rattachées à votre compte Discord et rechargées automatiquement à chaque visite.
                  </p>
                </div>

                {onboardError && (
                  <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2.5 mb-5 shadow-lg">
                    <AlertCircle size={16} className="shrink-0 text-red-400" />
                    <span>{onboardError}</span>
                  </div>
                )}

                <form onSubmit={handleFinishOnboarding} className="w-full flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                        <span>Prénom RP</span>
                        <span className="text-white text-[11px]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={25}
                        value={onboardFirst}
                        onChange={(e) => setOnboardFirst(e.target.value)}
                        placeholder="Ex: Dylan"
                        className="h-12 w-full rounded-xl bg-black/60 border border-white/15 text-white px-3.5 text-sm focus:outline-none focus:border-white focus:bg-neutral-900/90 focus:ring-1 focus:ring-white/40 transition-all placeholder:text-neutral-600"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                        <span>Nom RP</span>
                        <span className="text-white text-[11px]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={25}
                        value={onboardLast}
                        onChange={(e) => setOnboardLast(e.target.value)}
                        placeholder="Ex: Carter"
                        className="h-12 w-full rounded-xl bg-black/60 border border-white/15 text-white px-3.5 text-sm focus:outline-none focus:border-white focus:bg-neutral-900/90 focus:ring-1 focus:ring-white/40 transition-all placeholder:text-neutral-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                        <span>ID Citoyen</span>
                        <span className="text-white text-[11px]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={15}
                        value={onboardCitizenId}
                        onChange={(e) => setOnboardCitizenId(e.target.value)}
                        placeholder="Ex: 1042"
                        className="h-12 w-full rounded-xl bg-black/60 border border-white/15 text-white px-3.5 text-sm focus:outline-none focus:border-white focus:bg-neutral-900/90 focus:ring-1 focus:ring-white/40 transition-all font-mono placeholder:text-neutral-600"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                        <span>Téléphone In-Game</span>
                        <span className="text-neutral-500 text-[10px]">Optionnel</span>
                      </label>
                      <input
                        type="text"
                        maxLength={15}
                        value={onboardPhone}
                        onChange={(e) => setOnboardPhone(e.target.value)}
                        placeholder="555-0142"
                        className="h-12 w-full rounded-xl bg-black/60 border border-white/15 text-white px-3.5 text-sm focus:outline-none focus:border-white focus:bg-neutral-900/90 focus:ring-1 focus:ring-white/40 transition-all font-mono placeholder:text-neutral-600"
                      />
                    </div>
                  </div>

                  <label 
                    onClick={() => setRulesAccepted(!rulesAccepted)}
                    className="flex items-center gap-3 w-full p-3.5 bg-white/[0.03] border border-white/10 hover:border-white/25 rounded-xl cursor-pointer transition-all select-none"
                  >
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${rulesAccepted ? 'bg-white border-white text-black' : 'border-white/30 bg-black/40'}`}>
                      {rulesAccepted && <Check size={14} strokeWidth={3} />}
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-white block">J'accepte le règlement du Diamond Casino</span>
                      <span className="text-[11px] text-neutral-400">Fair-play in-game &amp; respect des règles du resort</span>
                    </div>
                  </label>

                  <button
                    type="submit"
                    disabled={onboardSubmitting}
                    className="w-full mt-1 py-3.5 px-6 rounded-xl bg-gradient-to-r from-white via-neutral-300 to-neutral-400 hover:brightness-110 active:scale-[0.99] text-black font-extrabold text-sm sm:text-[15px] flex items-center justify-center gap-2 cursor-pointer shadow-[0_4px_25px_rgba(255,255,255,0.35)] transition-all disabled:opacity-50"
                  >
                    <Check size={18} strokeWidth={2.5} />
                    <span>{onboardSubmitting ? 'Création de votre compte...' : 'Accéder à ma Console Citoyenne'}</span>
                  </button>
                </form>
              </motion.div>
            )}
          </div>
        </div>
      );
    }

  // =========================================================================
  // VIEW B : AUTHENTICATED CLIENT CONSOLE (FULL-WIDTH GRAND LUXURY CONSOLE)
  // =========================================================================
  return (
    <div className="w-full min-h-screen bg-[#050608] text-white flex flex-col font-sans select-none antialiased relative overflow-x-hidden pt-24 sm:pt-28 pb-16">
      
      {/* Ambient background glows matching index styling */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1400px] h-[550px] bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.07)_0%,rgba(45,65,105,0.04)_40%,transparent_70%)]" />
        <div className="absolute bottom-0 right-0 w-[650px] h-[650px] bg-[radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.03)_0%,transparent_60%)]" />
      </div>

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-24 right-4 sm:right-8 z-50 px-5 sm:px-6 py-3 rounded-2xl bg-white text-black font-semibold text-xs sm:text-sm shadow-[0_10px_40px_rgba(255,255,255,0.4)] flex items-center gap-2.5 border border-white/30 backdrop-blur-md"
          >
            <CheckCircle2 size={18} className="text-black shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================================================================== */}
      {/* MAIN CONSOLE CONTENT CONTAINER                                        */}
      {/* ===================================================================== */}
      <main className="relative z-10 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 flex flex-col gap-6 sm:gap-8 flex-1">
        
        {/* Console Navigation Capsule & Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {/* Segmented Control Capsule */}
          <div className="inline-flex items-center p-1.5 rounded-2xl bg-[#090a10]/90 backdrop-blur-xl border border-white/10 shadow-2xl overflow-x-auto no-scrollbar max-w-full">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'bg-white text-black shadow-lg shadow-white/10'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Activity size={15} />
              <span>Vue d'ensemble</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('lots')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'lots'
                  ? 'bg-white text-black shadow-lg shadow-white/10'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Car size={15} />
              <span>Mes lots</span>
              {user.rewards.some((r) => r.status === 'IN_INVENTORY') && (
                <span className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" aria-label="Lots à réclamer" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('vault')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'vault'
                  ? 'bg-white text-black shadow-lg shadow-white/10'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Coins size={15} />
              <span>Coffre &amp; Registre</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'profile'
                  ? 'bg-white text-black shadow-lg shadow-white/10'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <User size={15} />
              <span>Fiche Citoyenne</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('vip')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'vip'
                  ? 'bg-white text-black shadow-lg shadow-white/10'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Crown size={15} />
              <span>Avantages VIP</span>
            </button>
          </div>

          {/* Quick Actions (Admin + Déconnexion) */}
          <div className="flex items-center gap-2">
            {isOwnerOrAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-neutral-500/15 hover:bg-neutral-500/25 border border-neutral-500/30 text-neutral-300 text-xs font-bold transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)] cursor-pointer"
                title="Console Administration"
              >
                <span>Admin</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => setIsLogoutModalOpen(true)}
              className="px-3.5 py-2.5 rounded-xl bg-red-950/30 hover:bg-red-900/50 border border-red-500/30 text-red-300 flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer hover:scale-105"
              title="Se déconnecter de la console"
            >
              <LogOut size={14} />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>
        
        {/* =================================================================== */}
        {/* TAB 1: OVERVIEW (CONSOLE COCKPIT)                                   */}
        {/* =================================================================== */}
        {activeTab === 'overview' && (
          <motion.div
            key="tab-overview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-6 sm:gap-8"
          >
            {/* Executive Welcome Banner */}
            <div className="w-full relative overflow-hidden rounded-3xl p-6 sm:p-8 lg:p-10 bg-gradient-to-r from-[#12131b] via-[#0d0e14] to-[#07080c] border border-white/10 shadow-2xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-neutral-400/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wider uppercase bg-white/10 border border-white/25 text-neutral-300 inline-flex items-center gap-1.5">
                      <User size={12} className="text-white" />
                      CITOYEN RECONNU #{user.citizenId}
                    </span>

                    <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase inline-flex items-center gap-1.5 border ${
                      user.role === 'DÉVELOPPEUR'
                        ? 'bg-neutral-500/20 text-neutral-200 border-neutral-500/40 shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                        : user.vipTier === 'DIAMOND'
                        ? 'bg-neutral-500/20 text-neutral-200 border-neutral-500/40 shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                        : user.vipTier === 'GOLD'
                        ? 'bg-neutral-400/20 text-neutral-200 border-neutral-400/40 shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                        : 'bg-white/10 text-neutral-200 border-white/20'
                    }`}>
                      <Crown size={12} className={user.role === 'DÉVELOPPEUR' ? 'text-neutral-300' : 'text-white'} />
                      {user.vipTier ? `VIP ${user.vipTier}` : user.role}
                    </span>

                    <span className="px-3 py-1 rounded-full text-[11px] font-mono bg-white/[0.05] border border-white/10 text-neutral-300">
                      Discord: {user.discordTag || 'Citoyen'}
                    </span>
                  </div>

                  <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight mt-1 font-['Instrument_Serif'] font-normal">
                    Console de Suite Privée, <em className="italic text-white font-normal">{user.rpFirstName} {user.rpLastName}</em>
                  </h1>
                  <p className="text-neutral-400 text-xs sm:text-sm max-w-2xl leading-relaxed">
                    Votre terminal centralise vos jetons de casino réels, vos accès sécurisés et vos privilèges VIP du Resort.
                  </p>
                </div>

                {/* Quick Action Buttons */}
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to="/roue-de-la-fortune"
                    onClick={() => onNavigateToWheel?.()}
                    className="px-5 py-3 rounded-2xl bg-white text-black hover:bg-neutral-200 font-bold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-[0_0_25px_rgba(255,255,255,0.2)] hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    <Disc size={16} />
                    <span>Roue de la Fortune</span>
                  </Link>

                  <button
                    type="button"
                    onClick={handleOpenEditModal}
                    className="px-4 py-3 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-white font-medium text-xs sm:text-sm flex items-center gap-2 transition-all hover:scale-105 cursor-pointer"
                  >
                    <Edit3 size={15} />
                    <span>Modifier infos</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Overview Dual Grid: Holographic Citizen Card + Vault */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
              
              {/* Left Column (7 cols): The Vault & Quick Stats */}
              <div className="lg:col-span-7 flex flex-col gap-6 sm:gap-8">
                
                {/* CARD 1: SOLDE JETONS DE CASINO (GRAND PRESTIGE VAULT) */}
                <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-neutral-400/[0.14] via-[#14120c] to-[#07080a] border border-neutral-400/30 shadow-[0_10px_40px_rgba(255,255,255,0.12)]">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/15 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-neutral-600/10 rounded-full blur-2xl pointer-events-none" />

                  <div className="relative z-10 flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-neutral-300 shadow-md">
                          <Coins size={20} />
                        </div>
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-neutral-300 block">
                            Solde Jetons de Casino
                          </span>
                          <span className="text-[11px] text-neutral-400 font-mono">
                            Coffre Personnel Diamond Resort
                          </span>
                        </div>
                      </div>

                      <span className={`px-3 py-1 rounded-full text-xs font-mono font-semibold border ${
                        user.chips > 0 
                          ? 'bg-white/15 border-white/30 text-neutral-300' 
                          : 'bg-white/5 border-white/15 text-neutral-400'
                      }`}>
                        {user.chips > 0 ? '✓ Solde Approvisionné' : '0 Jeton • Nouveau Membre'}
                      </span>
                    </div>

                    {/* Chips Balance (Never Fake Cash) */}
                    <div className="flex items-baseline gap-3 my-1">
                      <span className="text-4xl sm:text-6xl font-black font-mono tracking-tight text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.35)]">
                        {user.chips.toLocaleString()}
                      </span>
                      <span className="text-xl sm:text-2xl font-black font-mono text-white tracking-wide">
                        ⛁ JETONS
                      </span>
                    </div>

                    <p className="text-xs sm:text-[13px] text-neutral-300/90 leading-relaxed max-w-xl">
                      {user.chips > 0 
                        ? 'Vos jetons sont certifiés et immédiatement utilisables aux tables de jeux, roulette, tournois et salons privés VIP.' 
                        : 'Votre solde débute à 0 jeton. Tournez la Roue de la Fortune quotidienne dans le hall du casino pour tenter de remporter des jetons ou un véhicule d\'exception.'}
                    </p>

                    {/* Quick Vault Action Hub */}
                    <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Link
                        to="/roue-de-la-fortune"
                        onClick={() => onNavigateToWheel?.()}
                        className="p-3 rounded-2xl bg-white text-black hover:bg-neutral-200 flex items-center justify-between text-xs font-bold transition-all hover:scale-[1.02] cursor-pointer shadow-md"
                      >
                        <div className="flex items-center gap-2">
                          <Disc size={15} className="text-black" />
                          <span>Lancer la Roue</span>
                        </div>
                        <ChevronRight size={14} className="text-neutral-600" />
                      </Link>

                      <button
                        type="button"
                        onClick={() => setActiveTab('vault')}
                        className="p-3 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 flex items-center justify-between text-xs font-semibold text-white transition-all hover:scale-[1.02] cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Coins size={15} className="text-white" />
                          <span>Mon Registre</span>
                        </div>
                        <ChevronRight size={14} className="text-neutral-500" />
                      </button>

                      <Link
                        to="/abonnements"
                        className="p-3 rounded-2xl bg-neutral-400/10 hover:bg-neutral-400/20 border border-neutral-400/25 flex items-center justify-between text-xs font-semibold text-neutral-300 transition-all hover:scale-[1.02] cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Crown size={15} className="text-white" />
                          <span>Pass VIP</span>
                        </div>
                        <ChevronRight size={14} className="text-white/60" />
                      </Link>
                    </div>
                  </div>
                </div>

                {/* CARD 2: ROUE DE LA FORTUNE & ATTRACTIONS DIRECT CTA */}
                <div className="rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-[#12131d] via-[#0b0c13] to-[#07080c] border border-white/10 flex flex-col gap-5 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-neutral-400/10 rounded-full blur-2xl pointer-events-none" />

                  <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/30 flex items-center justify-center text-neutral-300">
                        <Disc size={20} className={canSpinWheel ? 'animate-spin' : ''} style={{ animationDuration: '8s' }} />
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
                          Grande Roue de la Fortune
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                            canSpinWheel 
                              ? 'bg-white/15 border-white/30 text-neutral-300' 
                              : 'bg-white/5 border-white/10 text-neutral-400'
                          }`}>
                            {canSpinWheel ? '✓ DISPONIBLE' : timeUntilNextSpin || 'EN ATTENTE'}
                          </span>
                        </h3>
                        <p className="text-[11px] text-neutral-400">
                          {canSpinWheel 
                            ? 'Votre tour quotidien est prêt ! Tentez de décrocher le véhicule sur le podium ou le jackpot de 250 000 ⛁.' 
                            : `Prochain tirage disponible dans ${timeUntilNextSpin}. Retrouvez la roue dans le lobby central.`}
                        </p>
                      </div>
                    </div>

                    <Link
                      to="/roue-de-la-fortune"
                      onClick={() => onNavigateToWheel?.()}
                      className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 ${
                        canSpinWheel
                          ? 'bg-gradient-to-r from-white to-neutral-200 text-black hover:brightness-110 shadow-lg shadow-white/25 hover:scale-105'
                          : 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
                      }`}
                    >
                      <Disc size={14} className={canSpinWheel ? 'text-black' : 'text-white'} />
                      <span>{canSpinWheel ? 'Tourner la Roue' : 'Voir le Podium'}</span>
                    </Link>
                  </div>

                  {/* Resort Status Pill Bar */}
                  <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                    <div className="p-3 rounded-2xl bg-black/40 border border-white/8 flex flex-col gap-1">
                      <span className="text-[10px] text-neutral-400 uppercase font-semibold">Tirages Effectués</span>
                      <span className="font-mono font-bold text-white">
                        {user.totalSpins || 0} tour{(user.totalSpins || 0) > 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-black/40 border border-white/8 flex flex-col gap-1">
                      <span className="text-[10px] text-neutral-400 uppercase font-semibold">Total Jetons Gagnés</span>
                      <span className="font-mono font-bold text-neutral-300">
                        {(user.totalWon || 0).toLocaleString()} ⛁
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-black/40 border border-white/8 flex flex-col gap-1">
                      <span className="text-[10px] text-neutral-400 uppercase font-semibold">Cadence VIP</span>
                      <span className="font-mono font-bold text-neutral-300">
                        {user.vipTier === 'DIAMOND' 
                          ? '3 spins / 24h (8h cooldown)' 
                          : user.vipTier === 'GOLD' 
                          ? '2 spins / 24h (12h cooldown)' 
                          : '1 spin / 24h (24h cooldown)'}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column (5 cols): DIGITAL CITIZEN VIP CARD & QUICK PROFILE */}
              <div className="lg:col-span-5 flex flex-col gap-6 sm:gap-8">
                
                {/* HOLOGRAPHIC DIGITAL CITIZEN LUXURY CARD */}
                <div className="relative overflow-hidden rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-[#1c1a16] via-[#101116] to-[#07080a] border border-white/30 shadow-[0_15px_50px_rgba(0,0,0,0.9)] flex flex-col justify-between min-h-[260px]">
                  {/* Subtle holographic foil reflection */}
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15)_0%,transparent_60%)] pointer-events-none" />
                  
                  {/* Card Header */}
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img
                        src="/diamond_casino_logo.png"
                        alt="Diamond Casino"
                        className="h-7 w-auto object-contain drop-shadow"
                      />
                      <span className="text-[11px] font-mono tracking-widest text-neutral-300 font-bold uppercase">
                        DIAMOND CITIZEN CARD
                      </span>
                    </div>

                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white/20 text-neutral-300 border border-white/30">
                      {user.vipTier ? `VIP ${user.vipTier}` : user.role}
                    </span>
                  </div>

                  {/* EMV Gold Chip & Wireless Icon */}
                  <div className="relative z-10 my-4 flex items-center justify-between">
                    <div className="w-11 h-8 rounded-lg bg-gradient-to-tr from-neutral-500 via-white to-neutral-200 border border-neutral-300/60 shadow-md flex items-center justify-center">
                      <div className="w-7 h-5 border border-neutral-700/40 rounded flex items-center justify-center">
                        <div className="w-3 h-3 border-r border-neutral-700/40" />
                      </div>
                    </div>
                    <Wifi size={18} className="text-white/40 rotate-90" />
                  </div>

                  {/* Citizen Name & ID Number */}
                  <div className="relative z-10 flex flex-col gap-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-lg sm:text-xl font-bold tracking-wider text-white font-mono uppercase truncate">
                        {user.rpFirstName} {user.rpLastName}
                      </span>
                      <span className="font-mono text-xs text-white font-bold">
                        #{user.citizenId}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-1 border-t border-white/10">
                      <span>DISCORD: {user.discordId}</span>
                      <span className="text-neutral-300 font-bold">{user.chips.toLocaleString()} ⛁</span>
                    </div>
                  </div>
                </div>

                {/* RECENT TRANSACTIONS SNAPSHOT */}
                <div className="rounded-3xl p-6 sm:p-7 bg-[#090a0f] border border-white/10 flex flex-col gap-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History size={16} className="text-white" />
                      <h4 className="text-sm font-bold text-white tracking-tight">
                        Dernières Transactions
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('vault')}
                      className="text-xs text-white hover:text-neutral-300 font-semibold cursor-pointer"
                    >
                      Historique complet
                    </button>
                  </div>

                  <div className="space-y-2">
                    {user.transactions && user.transactions.length > 0 ? (
                      user.transactions.slice(0, 3).map((tx) => (
                        <div
                          key={tx.id}
                          className="p-3 rounded-2xl bg-black/40 border border-white/8 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-bold text-white block truncate text-[12px]">
                              {tx.label}
                            </span>
                            <span className="text-[10px] text-neutral-400 font-mono">
                              {new Date(tx.date).toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          {tx.amountChips !== 0 ? (
                            <span className={`font-mono font-bold text-xs shrink-0 ${tx.amountChips > 0 ? 'text-white' : 'text-red-400'}`}>
                              {tx.amountChips > 0 ? `+${tx.amountChips.toLocaleString()}` : tx.amountChips.toLocaleString()} ⛁
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[9px] font-mono uppercase bg-white/10 text-neutral-300 shrink-0">
                              {tx.category}
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="py-6 text-center text-xs text-neutral-500 font-mono">
                        Aucune transaction récente
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          </motion.div>
        )}

        {activeTab === 'lots' && (
          <motion.div key="tab-lots" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <MemberRewards showToast={showToast} />
          </motion.div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: COFFRE & REGISTRE                                            */}
        {/* =================================================================== */}
        {activeTab === 'vault' && (
          <motion.div
            key="tab-vault"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-6 sm:gap-8"
          >
            {/* Header */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-mono tracking-widest text-white uppercase font-bold flex items-center gap-1.5">
                <Coins size={14} />
                THE DIAMOND VAULT &amp; REGISTRE
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight font-['Instrument_Serif'] font-normal">
                Coffre &amp; Registre Financier des <em className="italic text-white font-normal">Jetons</em>
              </h2>
              <p className="text-neutral-400 text-xs sm:text-sm max-w-2xl leading-relaxed">
                Relevé certifié et transparent de vos gains de jeux, tirages de la Roue de la Fortune et souscriptions VIP.
              </p>
            </div>

            {/* Solde Jetons Card */}
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-neutral-400/[0.12] via-[#12110c] to-[#07080a] border border-neutral-400/30 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-bold">
                  Solde de Jetons Actuel
                </span>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl sm:text-6xl font-black font-mono tracking-tight text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.3)]">
                    {user.chips.toLocaleString()}
                  </span>
                  <span className="text-xl sm:text-2xl font-black font-mono text-white">
                    ⛁ JETONS
                  </span>
                </div>
                <p className="text-xs text-neutral-400">
                  Total gagné à la Roue : <strong className="text-white font-mono">{user.totalWon?.toLocaleString() || 0} ⛁</strong> • Tirages effectués : <strong className="text-white font-mono">{user.totalSpins || 0}</strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/roue-de-la-fortune"
                  onClick={() => onNavigateToWheel?.()}
                  className="px-5 py-3 rounded-2xl bg-white text-black font-bold text-xs sm:text-sm flex items-center gap-2 hover:bg-neutral-200 transition-all cursor-pointer shadow-lg"
                >
                  <Disc size={15} />
                  <span>Jouer à la Roue</span>
                </Link>
                <Link
                  to="/abonnements"
                  className="px-5 py-3 rounded-2xl bg-neutral-400/15 hover:bg-neutral-400/25 border border-neutral-400/30 text-neutral-300 font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Crown size={15} />
                  <span>Abonnements VIP</span>
                </Link>
              </div>
            </div>

            {/* Transaction Ledger Table with Search & Filter Tabs */}
            <div className="rounded-3xl p-6 sm:p-8 bg-[#090a0f] border border-white/10 flex flex-col gap-5 shadow-xl">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                
                {/* Search input */}
                <div className="relative w-full lg:w-72">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    value={txSearchQuery}
                    onChange={(e) => setTxSearchQuery(e.target.value)}
                    placeholder="Rechercher une transaction..."
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-black/60 border border-white/15 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-white transition-colors font-sans"
                  />
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1.5 p-1 bg-black/50 border border-white/10 rounded-xl text-xs overflow-x-auto no-scrollbar">
                  {(['ALL', 'WHEEL', 'VIP', 'GAMES'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTxFilter(key)}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        txFilter === key
                          ? 'bg-white text-black shadow-sm'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {key === 'ALL' ? 'Toutes' : key === 'WHEEL' ? 'Roue de la Fortune' : key === 'VIP' ? 'Pass VIP' : 'Jeux & Caisse'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transactions List */}
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                {filteredTransactions.length === 0 ? (
                  <div className="py-14 px-6 flex flex-col items-center justify-center text-center rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-neutral-500 mb-3">
                      <History size={22} />
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">
                      Aucune transaction enregistrée
                    </h4>
                    <p className="text-xs text-neutral-400 max-w-sm">
                      Vos gains à la Roue de la Fortune, vos dépôts en jeu et vos souscriptions VIP s'afficheront ici en temps réel.
                    </p>
                  </div>
                ) : (
                  filteredTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-3.5 rounded-2xl bg-black/40 border border-white/8 hover:border-white/15 flex items-center justify-between gap-3 text-xs transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
                          {tx.type === 'spin_reward' ? (
                            <Disc size={16} className="text-white" />
                          ) : tx.type === 'vip_subscription' ? (
                            <Crown size={16} className="text-neutral-300" />
                          ) : (
                            <Coins size={16} className="text-neutral-300" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate text-[13px]">
                            {tx.label}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-400 font-mono">
                            <span>{new Date(tx.date).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}</span>
                            <span>•</span>
                            <span className="text-neutral-500">{tx.category}</span>
                            <span>•</span>
                            <span className="text-neutral-600 truncate">ID: {tx.id.slice(0, 14)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        {tx.amountChips !== 0 ? (
                          <span className={`font-mono font-bold text-sm ${tx.amountChips > 0 ? 'text-white' : 'text-red-400'}`}>
                            {tx.amountChips > 0 ? `+${tx.amountChips.toLocaleString()}` : tx.amountChips.toLocaleString()} ⛁
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[9.5px] font-mono font-bold uppercase bg-white/10 text-neutral-300 border border-white/20">
                            {tx.type === 'vip_request' ? 'DEMANDE VIP' : 'LOT SPÉCIAL'}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded text-[9.5px] font-mono font-bold uppercase bg-white/10 text-neutral-300 border border-white/20">
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: CITIZEN RP PROFILE & FIVEM IDENTITY                          */}
        {/* =================================================================== */}
        {activeTab === 'profile' && (
          <motion.div
            key="tab-profile"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-6 sm:gap-8 max-w-4xl mx-auto w-full"
          >
            {/* Header */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-mono tracking-widest text-white uppercase font-bold flex items-center gap-1.5">
                <User size={14} />
                IDENTIFICATION RP OFFICIELLE
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight font-['Instrument_Serif'] font-normal">
                Fiche Citoyenne &amp; Discord
              </h2>
              <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed">
                Vos coordonnées Roleplay enregistrées sont sauvegardées dans notre base sécurisée et associées à votre compte Discord officiel.
              </p>
            </div>

            {/* Profile Card */}
            <div className="rounded-3xl p-6 sm:p-8 bg-[#090a0f] border border-white/10 flex flex-col gap-6 shadow-2xl">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <img
                      src={user.avatarUrl}
                      alt={user.rpFirstName}
                      className="w-16 h-16 rounded-full border-2 border-white/50 object-cover shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                    />
                    <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-white border-2 border-black" />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                      {user.rpFirstName} {user.rpLastName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-xs text-white font-bold">
                        #{user.citizenId}
                      </span>
                      <span className="text-neutral-500">•</span>
                      <span className="text-xs font-semibold text-neutral-300">
                        {user.vipTier ? `VIP ${user.vipTier}` : user.role}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenEditModal}
                  className="px-4 py-2.5 rounded-xl bg-white hover:bg-neutral-300 text-black font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-white/20 transition-all hover:scale-105"
                >
                  <Edit3 size={14} />
                  <span>Modifier mon profil</span>
                </button>
              </div>

              {/* Data Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-black/40 border border-white/6 flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold">Prénom &amp; Nom Roleplay</span>
                  <span className="font-bold text-white text-base">
                    {user.rpFirstName} {user.rpLastName}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-black/40 border border-white/6 flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold">Numéro / ID Citoyen</span>
                  <span className="font-mono font-bold text-white text-base">
                    #{user.citizenId}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-black/40 border border-white/6 flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold">Téléphone In-Game</span>
                  <span className="font-mono font-medium text-white text-base">
                    {user.phoneNumber || 'Non renseigné'}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-black/40 border border-white/6 flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold">Date d'enregistrement</span>
                  <span className="font-mono text-neutral-300 text-base">
                    {new Date(user.joinedAt || Date.now()).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              </div>

              {/* Linked Discord Account Card */}
              <div className="p-4 rounded-2xl bg-[#5865F2]/10 border border-[#5865F2]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      src={user.avatarUrl}
                      alt="Discord Avatar"
                      className="w-12 h-12 rounded-full border border-white/20 object-cover"
                    />
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-white border border-black" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                      {user.discordTag || 'Compte Discord Certifié'}
                      <span className="text-[10px] font-mono text-neutral-300 font-normal">● Synchro Live</span>
                    </span>
                    <span className="text-xs text-neutral-400 font-mono block mt-0.5">
                      Snowflake ID: {user.discordId || 'Non synchronisé'}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </motion.div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: VIP PRIVILEGES & RESORT BENEFITS                             */}
        {/* =================================================================== */}
        {activeTab === 'vip' && (
          <motion.div
            key="tab-vip"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-6 sm:gap-8"
          >
            {/* Header */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-mono tracking-widest text-white uppercase font-bold flex items-center gap-1.5">
                <Crown size={14} />
                SALONS &amp; PRIVILÈGES VIP
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight font-['Instrument_Serif'] font-normal">
                Privilèges &amp; Avantages <em className="italic text-white font-normal">Diamond Resort</em>
              </h2>
              <p className="text-neutral-400 text-xs sm:text-sm max-w-2xl leading-relaxed">
                Consultez les cadences de tirages de la Roue de la Fortune, vos accès exclusifs aux salons de jeux High Roller et vos services réservés.
              </p>
            </div>

            {/* Current VIP Status Card */}
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-neutral-400/[0.12] via-[#12110c] to-[#07080a] border border-neutral-400/30 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xl">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 border border-white/40 flex items-center justify-center text-neutral-300">
                  <Crown size={28} />
                </div>
                <div>
                  <span className="text-xs font-mono font-bold text-neutral-300 uppercase tracking-wider block">
                    Votre Rang Actuel
                  </span>
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mt-0.5">
                    {user.vipTier ? `VIP ${user.vipTier}` : user.role}
                  </h3>
                  <span className="text-xs text-neutral-400">
                    {user.vipTier 
                      ? 'Adhésion active avec tous les avantages de votre grade.' 
                      : 'Statut standard citoyen. Vous pouvez souscrire un pass VIP pour débloquer plus de tirages.'}
                  </span>
                </div>
              </div>

              <Link
                to="/abonnements"
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-white via-neutral-300 to-neutral-400 hover:brightness-110 text-black font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-white/20 transition-all hover:scale-105 cursor-pointer shrink-0"
              >
                <span>Découvrir les Pass VIP</span>
                <ChevronRight size={15} />
              </Link>
            </div>

            {/* Comparison Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              
              {/* Standard */}
              <div className="p-6 rounded-3xl bg-[#090a0f] border border-white/10 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-300 uppercase font-mono">Membre Standard</span>
                  <span className="text-xs text-neutral-500">Gratuit</span>
                </div>
                <div className="text-sm font-bold text-white">Citoyen Los Santos</div>
                <ul className="space-y-2.5 text-xs text-neutral-400">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-neutral-300 shrink-0" />
                    <span>1 tirage de Roue toutes les 24h</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-neutral-300 shrink-0" />
                    <span>Fiche citoyenne certifiée</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-neutral-300 shrink-0" />
                    <span>Accès aux tables publiques</span>
                  </li>
                </ul>
              </div>

              {/* VIP Gold */}
              <div className="p-6 rounded-3xl bg-gradient-to-b from-neutral-400/10 to-[#090a0f] border border-neutral-400/30 flex flex-col gap-4 shadow-lg shadow-neutral-400/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-300 uppercase font-mono">VIP Gold</span>
                  <span className="text-xs text-white font-mono font-bold">Populaire</span>
                </div>
                <div className="text-sm font-bold text-white">Privilège High Roller</div>
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
                    <span>Accès Salons Privés &amp; High Roller</span>
                  </li>
                </ul>
              </div>

              {/* VIP Diamond */}
              <div className="p-6 rounded-3xl bg-gradient-to-b from-neutral-500/10 to-[#090a0f] border border-neutral-400/30 flex flex-col gap-4 shadow-lg shadow-neutral-500/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-300 uppercase font-mono">Black Diamond</span>
                  <span className="text-xs text-neutral-300 font-mono font-bold">Élite Prestige</span>
                </div>
                <div className="text-sm font-bold text-white">Maître du Resort</div>
                <ul className="space-y-2.5 text-xs text-neutral-300">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-neutral-400 shrink-0" />
                    <span><strong>3 tirages / jour</strong> (Cooldown 8h)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-neutral-400 shrink-0" />
                    <span>+150 000 jetons offerts à l'adhésion</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-neutral-400 shrink-0" />
                    <span>Penthouse Rooftop, Piscine &amp; Héliport</span>
                  </li>
                </ul>
              </div>

            </div>
          </motion.div>
        )}

      </main>

      {/* ===================================================================== */}
      {/* 5. MODAL DE MODIFICATION DE PROFIL RP                                 */}
      {/* ===================================================================== */}
      <AnimatePresence>
        {isEditingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-lg rounded-3xl bg-[#0d0e14] border border-white/15 p-6 sm:p-8 shadow-2xl relative"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setIsEditingModalOpen(false)}
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>

              <div className="mb-6">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-bold tracking-wider uppercase bg-white/10 text-neutral-300 border border-white/20 mb-2">
                  <Edit3 size={11} className="text-white" />
                  Mise à Jour Citoyenne
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Modifier mes informations RP
                </h3>
                <p className="text-neutral-400 text-xs mt-1">
                  Vos informations seront sauvegardées et synchronisées dans notre base sécurisée.
                </p>
              </div>

              {editError && (
                <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2 mb-4">
                  <AlertCircle size={15} className="shrink-0 text-red-400" />
                  <span>{editError}</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                      <span>Prénom RP</span>
                    </label>
                    <input
                      type="text"
                      disabled
                      value={editFirstName}
                      title="Non modifiable"
                      className="h-11 w-full rounded-xl bg-white/5 border border-white/5 text-neutral-400 px-3 text-sm focus:outline-none cursor-not-allowed opacity-70"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                      <span>Nom RP</span>
                    </label>
                    <input
                      type="text"
                      disabled
                      value={editLastName}
                      title="Non modifiable"
                      className="h-11 w-full rounded-xl bg-white/5 border border-white/5 text-neutral-400 px-3 text-sm focus:outline-none cursor-not-allowed opacity-70"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                    <span>Numéro / ID Citoyen</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editCitizenId}
                    title="Non modifiable"
                    className="h-11 w-full rounded-xl bg-white/5 border border-white/5 text-neutral-400 px-3 text-sm font-mono focus:outline-none cursor-not-allowed opacity-70"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                    <span>Téléphone In-Game</span>
                    <span className="text-neutral-500 text-[10px]">Optionnel</span>
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="555-0142"
                    className="h-11 w-full rounded-xl bg-black/60 border border-white/15 text-white px-3 text-sm font-mono focus:outline-none focus:border-white transition-colors"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingModalOpen(false)}
                    className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium text-xs transition-colors cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-white via-neutral-300 to-neutral-400 hover:brightness-110 text-black font-extrabold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Check size={15} strokeWidth={2.5} />
                    <span>Enregistrer</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ===================================================================== */}
      {/* 6. MODAL DE CONFIRMATION DE DÉCONNEXION                               */}
      {/* ===================================================================== */}
      <AnimatePresence>
        {isLogoutModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md rounded-3xl bg-[#0e0f18] border border-white/15 p-6 sm:p-7 shadow-2xl relative"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 mb-4">
                <LogOut size={22} />
              </div>

              <h3 className="text-xl font-bold text-white tracking-tight mb-2">
                Fermeture de Session Console
              </h3>
              <p className="text-neutral-300 text-xs sm:text-sm leading-relaxed mb-6">
                Êtes-vous certain de vouloir quitter votre Suite Citoyenne ? Vos jetons ({user.chips.toLocaleString()} ⛁), vos gains et votre profil restent sauvegardés et synchronisés sur le Cloud.
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsLogoutModalOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  Rester dans ma Suite
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsLogoutModalOpen(false);
                    void logout();
                  }}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-xs shadow-lg shadow-red-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <LogOut size={14} />
                  <span>Confirmer la Déconnexion</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
