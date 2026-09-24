import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import { 
  Crown, 
  Sparkles, 
  Coins, 
  Check, 
  Star, 
  ShieldCheck, 
  Disc, 
  CheckCircle2, 
  Building2, 
  Car, 
  User,
  ArrowRight,
  Flame,
  HelpCircle,
  Gem
} from 'lucide-react';
import { useCasinoUser } from '../context/CasinoUserContext';
import { Footer } from './Footer';

type TierData = {
  id: 'SILVER' | 'GOLD' | 'DIAMOND';
  name: string;
  badge: string;
  priceRP: string;
  priceReal: string;
  description: string;
  accentColor: string;
  borderStyle: string;
  chipsBonus: number;
  dailySpins: number;
  cashback: string;
  perks: string[];
};

const TIERS: TierData[] = [
  {
    id: 'SILVER',
    name: 'Carte Silver',
    badge: 'MEMBRE PRIVILÈGE',
    priceRP: '25 000 jetons / mois',
    priceReal: '10 € / mois',
    description: "L'accès privilégié aux commodités et tables du Diamond Casino.",
    accentColor: 'text-neutral-300',
    borderStyle: 'border-white/10 bg-neutral-950/40 hover:bg-neutral-900/60',
    chipsBonus: 15000,
    dailySpins: 1,
    cashback: 'Aucun',
    perks: [
      'Accès libre aux tables classiques',
      '1 tirage de Roue par jour',
      '15 000 jetons mensuels',
      'Accès aux bars et salons ouverts',
    ],
  },
  {
    id: 'GOLD',
    name: 'Carte Gold',
    badge: 'RECOMMANDÉ',
    priceRP: '75 000 jetons / mois',
    priceReal: '20 € / mois',
    description: "Pour les joueurs d'envergure souhaitant des privilèges VIP exclusifs.",
    accentColor: 'text-white',
    borderStyle: 'border-white/30 bg-neutral-950 shadow-[0_0_40px_rgba(255,255,255,0.05)]',
    chipsBonus: 60000,
    dailySpins: 2,
    cashback: '5 % remboursés / semaine',
    perks: [
      'Accès prioritaire au Salon VIP',
      '2 tirages de Roue par jour',
      '60 000 jetons mensuels',
      '5 % des pertes remboursés en jetons',
    ],
  },
  {
    id: 'DIAMOND',
    name: 'Black Diamond',
    badge: 'PRESTIGE',
    priceRP: '180 000 jetons / mois',
    priceReal: '35 € / mois',
    description: "Le statut d'élite absolu. Tous les accès déverrouillés.",
    accentColor: 'text-white',
    borderStyle: 'border-white/20 bg-black shadow-[0_0_50px_rgba(255,255,255,0.08)]',
    chipsBonus: 150000,
    dailySpins: 3,
    cashback: '10 % remboursés / semaine',
    perks: [
      'Accès illimité aux Salons High Roller',
      '3 tirages de Roue par jour',
      '150 000 jetons mensuels',
      '10 % des pertes remboursés en jetons',
    ],
  },
];

const FallingDiamonds = () => {
  const diamonds = Array.from({ length: 15 });
  return (
    <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none z-0">
      {diamonds.map((_, i) => {
        const duration = Math.random() * 4 + 4;
        const delay = Math.random() * -5;
        const scale = Math.random() * 0.8 + 0.4;
        return (
          <motion.div
            key={i}
            className="absolute text-white/20"
            style={{ filter: 'drop-shadow(0px 0px 8px rgba(255,255,255,0.8))' }}
            initial={{
              y: -50,
              x: Math.random() * 400 - 50,
              scale: scale,
              opacity: 0
            }}
            animate={{
              y: [null, 600],
              opacity: [0, 1, 1, 0]
            }}
            transition={{
              duration: duration,
              repeat: Infinity,
              ease: 'linear',
              delay: delay,
              opacity: { duration: duration, times: [0, 0.2, 0.8, 1], repeat: Infinity, delay: delay }
            }}
          >
            <Gem size={20} />
          </motion.div>
        );
      })}
    </div>
  );
};

const FallingBills = () => {
  const bills = Array.from({ length: 12 });
  return (
    <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none z-0">
      {bills.map((_, i) => {
        const duration = Math.random() * 5 + 5;
        const delay = Math.random() * -6;
        const scale = Math.random() * 0.7 + 0.6;
        return (
          <motion.div
            key={i}
            className="absolute text-white/10"
            style={{ filter: 'drop-shadow(0px 0px 4px rgba(255,255,255,0.4))' }}
            initial={{
              y: -50,
              x: Math.random() * 400 - 50,
              scale: scale,
              opacity: 0
            }}
            animate={{
              y: [null, 600],
              opacity: [0, 1, 1, 0]
            }}
            transition={{
              duration: duration,
              repeat: Infinity,
              ease: 'linear',
              delay: delay,
              opacity: { duration: duration, times: [0, 0.2, 0.8, 1], repeat: Infinity, delay: delay }
            }}
          >
            <Coins size={32} />
          </motion.div>
        );
      })}
    </div>
  );
};

export const VipSubscriptions: React.FC = () => {
  const { user, isAuthenticated, requestVip, pendingVipTier } = useCasinoUser();
  const [submittingTier, setSubmittingTier] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // VIP cards are paid: the request is recorded and activated by the management after payment
  const handleSubscribe = async (tier: 'SILVER' | 'GOLD' | 'DIAMOND') => {
    if (!isAuthenticated) {
      showToast("Connectez votre profil Discord sur l'Espace Membre pour souscrire.");
      return;
    }
    setSubmittingTier(tier);
    try {
      await requestVip(tier);
      showToast(`Demande ${tier} envoyée. La direction l'activera après votre paiement.`);
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setSubmittingTier(null);
    }
  };

  return (
    <div className="relative min-h-screen bg-black text-white pt-28 sm:pt-36 pb-0 px-4 sm:px-8 overflow-hidden font-sans">
      {/* Ambient background glows */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-white/5 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute top-96 right-10 w-[400px] h-[400px] bg-white/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full bg-white text-black font-semibold text-sm shadow-[0_0_30px_rgba(255,255,255,0.4)] flex items-center gap-2"
          >
            <CheckCircle2 size={18} className="text-black" />
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Title Header */}
      <div className="max-w-4xl mx-auto text-center mb-14">
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-5">
          Cartes & Abonnements <span className="font-['Instrument_Serif'] font-normal italic text-white">VIP</span>
        </h1>

        <p className="text-neutral-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
          Rejoignez l'élite du Diamond Casino. Choisissez votre gamme d'adhésion mensuelle pour débloquer des tirages supplémentaires à la Roue, des allocations régulières de jetons et l'accès aux salons privés.
        </p>

        {/* Current Active Status Banner if user has a tier */}
        {isAuthenticated && user && (
          <div className="mt-10 inline-flex flex-col sm:flex-row items-center gap-6 p-4 px-8 rounded-full bg-white/[0.02] border border-white/[0.05] shadow-[0_0_30px_rgba(255,255,255,0.02)] backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                <Crown size={16} className="text-white" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold mb-0.5">Statut Actuel</span>
                <span className="text-sm font-bold text-white tracking-wide">
                  {user.vipTier ? `Carte VIP ${user.vipTier}` : 'Membre Standard'}
                </span>
              </div>
            </div>
            
            <div className="hidden sm:block w-px h-8 bg-white/10" />
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                <Coins size={16} className="text-white" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold mb-0.5">Solde en Banque</span>
                <span className="text-sm font-bold text-white tracking-wide font-['Geist_Mono']">
                  {user.chips.toLocaleString()} <span className="text-xs font-sans text-neutral-400 font-normal">Jetons</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3 VIP Membership Cards */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 mb-20 items-stretch">
        {TIERS.map((tier) => {
          const isCurrentTier = user?.vipTier === tier.id;
          const isPendingTier = pendingVipTier === tier.id;
          const isFeatured = tier.id === 'GOLD';

          return (
            <div
              key={tier.id}
              className={`rounded-3xl p-7 sm:p-8 border flex flex-col justify-between relative transition-all duration-300 hover:scale-[1.02] ${tier.borderStyle} ${
                isFeatured ? 'md:-translate-y-2' : ''
              }`}
            >
              {tier.id === 'DIAMOND' && <FallingDiamonds />}
              {tier.id === 'GOLD' && <FallingBills />}
              
              {/* Top Badge */}
              <div className="flex items-center justify-between mb-4 relative z-10">
                <span className={`text-[10px] font-['Geist_Mono'] uppercase tracking-widest px-3 py-1 rounded-full ${
                  tier.id === 'GOLD'
                    ? 'bg-white text-black font-bold shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                    : 'text-neutral-400 bg-white/5 border border-white/10'
                }`}>
                  {tier.badge}
                </span>
              </div>

              {/* Title & Description */}
              <div className="relative z-10">
                <h3 className={`text-2xl sm:text-3xl font-bold mb-2 ${tier.accentColor}`}>
                  {tier.name}
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed mb-6">
                  {tier.description}
                </p>

                {/* Price Display */}
                <div className="text-2xl sm:text-3xl font-bold mb-8 text-white">
                  {tier.priceRP}
                </div>

                {/* Perks Checklist */}
                <div className="space-y-3 mb-8">
                  <span className="text-[11px] font-['Geist_Mono'] uppercase tracking-wider text-neutral-400 block">
                    Avantages inclus :
                  </span>
                  {tier.perks.map((perk, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs text-neutral-300">
                      <div className="w-4 h-4 rounded-full bg-white/10 text-white flex items-center justify-center shrink-0 mt-0.5">
                        <Check size={11} />
                      </div>
                      <span className="leading-snug">{perk}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="relative z-10">
                <button
                  onClick={() => handleSubscribe(tier.id)}
                  disabled={isCurrentTier || isPendingTier || !!pendingVipTier || submittingTier !== null}
                  className={`w-full py-3.5 px-6 rounded-2xl font-semibold text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                    isCurrentTier || isPendingTier
                      ? 'bg-neutral-800 text-neutral-400 border border-white/10 cursor-default'
                      : pendingVipTier
                      ? 'bg-neutral-900 text-neutral-500 border border-white/10 cursor-not-allowed'
                      : tier.id === 'GOLD'
                      ? 'bg-neutral-900 border border-white/30 text-white hover:bg-neutral-800 active:scale-95'
                      : tier.id === 'DIAMOND'
                      ? 'bg-white text-black hover:bg-neutral-200 shadow-[0_0_30px_rgba(255,255,255,0.3)] active:scale-95'
                      : 'liquid-glass hover:bg-white/10 text-white border border-white/20 active:scale-95'
                  }`}
                >
                  {isCurrentTier ? (
                    <>
                      <Check size={14} />
                      Abonnement Actif
                    </>
                  ) : isPendingTier ? (
                    <>En attente de validation</>
                  ) : (
                    <>
                      <Crown size={14} />
                      {submittingTier === tier.id ? 'Envoi…' : `Demander ${tier.name}`}
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
};
