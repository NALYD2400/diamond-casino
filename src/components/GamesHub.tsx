import React from 'react';
import { motion } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import {
  Bomb,
  Disc,
  Coins,
  ArrowUpRight,
  Flame,
  Play,
  ChevronRight,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { useCasinoUser } from '../context/CasinoUserContext';

interface GameItem {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeType: 'hot' | 'active';
  description: string;
  image: string;
  icon: React.ReactNode;
  link: string;
  metrics: { label: string; value: string }[];
  tagline: string;
}

export const GamesHub: React.FC = () => {
  const { user, isAuthenticated } = useCasinoUser();

  const games: GameItem[] = [
    {
      id: 'mines',
      title: 'Les Mines du Diamond',
      subtitle: 'Démineur Haute Volatilité · 5x5',
      badge: 'POPULAIRE · 98.5% RTP',
      badgeType: 'hot',
      description:
        'Parcourez une grille sécurisée de 25 cases. Évitez les explosifs, révélez les diamants précieux et encaissez vos jetons au bon moment avant la détonation.',
      image: '/diamond_chips_jackpot.jpg',
      icon: <Bomb className="w-8 h-8 text-amber-400" />,
      link: '/mines',
      metrics: [
        { label: 'Multiplicateur max', value: 'x5 000 000' },
        { label: 'Mise autorisée', value: '20 à 500k jetons' },
        { label: 'Format de jeu', value: 'Grille 5x5 (1 à 24 mines)' },
        { label: 'Algorithme', value: 'Provably Fair SHA-256' },
      ],
      tagline: 'JEU 01 // DÉMINEUR CRYPTOGRAPHIQUE CASINO',
    },
    {
      id: 'wheel',
      title: 'La Roue de la Fortune',
      subtitle: 'Tirage Quotidien · Podium de Los Santos',
      badge: 'SUPERCAR EN JEU',
      badgeType: 'active',
      description:
        'Chaque jour, faites tourner la Roue officielle du hall central. Remportez la Supercar du podium, des liasses de jetons, du cash RP direct ou des surprises du coffre mystère.',
      image: '/podium_supercar.jpg',
      icon: <Disc className="w-8 h-8 text-amber-400" />,
      link: '/roue-de-la-fortune',
      metrics: [
        { label: 'Fréquence', value: '1 tour offert / 24h' },
        { label: 'Gros lot vedette', value: 'Supercar du Podium' },
        { label: 'Récompenses', value: 'Cash, Jetons, Véhicules' },
        { label: 'Attribution', value: 'Instantanée en jeu' },
      ],
      tagline: 'JEU 02 // PODIUM SHOWROOM VINEWOOD',
    },
    {
      id: 'slots',
      title: 'Diamond Reels & Slots',
      subtitle: 'Machines à Sous Multilignes · 5x3 & 3x3',
      badge: 'NOUVEAU · JACKPOT 1.5M+',
      badgeType: 'hot',
      description:
        'Faites tourner les rouleaux haute vitesse de nos machines officielles. Alignez les Diamants, déclenchez les Multiplicateurs WILD et décrochez le Mega Jackpot progressif.',
      image: '/diamond_chips_jackpot.jpg',
      icon: <Sparkles className="w-8 h-8 text-amber-400" />,
      link: '/slots',
      metrics: [
        { label: 'Jackpot progressif', value: '1 500 000+ jetons' },
        { label: 'Lignes actives', value: 'Jusqu’à 20 lignes' },
        { label: 'Bonus en jeu', value: 'Free Spins & Wilds x5' },
        { label: 'Algorithme', value: 'Provably Fair SHA-256' },
      ],
      tagline: 'JEU 03 // MACHINE À SOUS OFFICIELLE DIAMOND',
    },
  ];

  return (
    <div className="relative min-h-screen bg-black text-white selection:bg-amber-400 selection:text-black">
      {/* Atmosphere Background Texture */}
      <div
        className="fixed inset-0 bg-cover bg-center opacity-10 grayscale pointer-events-none"
        style={{ backgroundImage: "url('/diamond_casino_hall.jpg')" }}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 bg-gradient-to-b from-black/80 via-black/95 to-black pointer-events-none"
        aria-hidden="true"
      />

      {/* Main Content Area */}
      <div className="relative z-10 pt-28 sm:pt-36 pb-24 px-4 sm:px-6 lg:px-12 max-w-6xl mx-auto">
        {/* Header Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl sm:text-6xl font-semibold tracking-[-0.03em] text-white mb-4"
          >
            Choisissez votre{' '}
            <span className="font-['Instrument_Serif'] font-normal italic text-amber-400">
              Jeu
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-neutral-400 text-base sm:text-lg leading-relaxed"
          >
            Misez vos jetons du Diamond Casino, affrontez la chance et décrochez des jackpots d'envergure.
            Chaque partie est instantanée et certifiée équitable.
          </motion.p>
        </div>

        {/* User Balance & VIP Status Banner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="mb-10 p-4 sm:p-5 rounded-2xl liquid-glass border border-white/10 bg-white/[0.02] flex flex-col md:flex-row items-center justify-between gap-4"
        >
          {isAuthenticated && user ? (
            <>
              <div className="flex items-center gap-3.5 text-left">
                <img
                  src={user.avatarUrl}
                  alt={user.rpFirstName}
                  className="w-11 h-11 rounded-full object-cover border-2 border-amber-400/80 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-base">
                      {user.rpFirstName} {user.rpLastName}
                    </span>
                    <span className="text-[10px] font-['Geist_Mono'] font-bold px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300">
                      ID {user.citizenId}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400">
                    Citoyen de Los Santos · Membre Officiel
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[10px] uppercase font-['Geist_Mono'] tracking-wider text-neutral-400">
                    Solde Jetons Casino
                  </div>
                  <div className="text-xl sm:text-2xl font-bold font-['Geist_Mono'] text-amber-400 flex items-center gap-1.5 justify-end">
                    <Coins size={20} className="text-amber-400" />
                    <span>{user.chips.toLocaleString('fr-FR')}</span>
                    <span className="text-xs text-neutral-400 font-normal">jetons</span>
                  </div>
                </div>

                <Link
                  to="/espace-membre"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all cursor-pointer shrink-0"
                >
                  Gérer mes Jetons
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Coins size={22} />
                </div>
                <div>
                  <div className="font-semibold text-white text-sm">
                    Jouez en mode Démo ou avec vos Jetons RP
                  </div>
                  <div className="text-xs text-neutral-400">
                    Connectez votre compte Discord pour accéder à vos jetons casino.
                  </div>
                </div>
              </div>

              <Link
                to="/espace-membre"
                className="px-5 py-2.5 rounded-full text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                <span>Connexion Espace Membre</span>
                <ChevronRight size={14} />
              </Link>
            </>
          )}
        </motion.div>

        {/* Games Grid (The 3 real casino games) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {games.map((game, index) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent backdrop-blur-xl overflow-hidden flex flex-col justify-between hover:border-amber-500/50 hover:shadow-[0_0_35px_rgba(245,158,11,0.25)] transition-all duration-300"
            >
              {/* Visual Backdrop with gradient mask */}
              <div className="absolute top-0 right-0 w-full sm:w-1/2 h-48 sm:h-full opacity-25 pointer-events-none overflow-hidden">
                <img
                  src={game.image}
                  alt={game.title}
                  className="w-full h-full object-cover object-center filter saturate-150 transition-transform duration-700 hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-black via-black/80 to-transparent" />
              </div>

              {/* Card Top & Details */}
              <div className="relative p-6 sm:p-8 z-10">
                {/* Top Bar: Icon + Badge */}
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                    {game.icon}
                  </div>

                  {game.badgeType === 'hot' && (
                    <span className="flex items-center gap-1 text-[11px] font-bold font-['Geist_Mono'] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                      <Flame size={12} className="text-amber-400" />
                      {game.badge}
                    </span>
                  )}
                  {game.badgeType === 'active' && (
                    <span className="flex items-center gap-1 text-[11px] font-bold font-['Geist_Mono'] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                      <CheckCircle2 size={12} className="text-emerald-400" />
                      {game.badge}
                    </span>
                  )}
                </div>

                {/* Title & Category */}
                <div className="mb-3">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    {game.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-amber-400/90 font-medium mt-1">
                    {game.subtitle}
                  </p>
                </div>

                {/* Description */}
                <p className="text-sm text-neutral-300 leading-relaxed mb-6">
                  {game.description}
                </p>

                {/* Technical & Gameplay Metrics */}
                <div className="grid grid-cols-2 gap-2.5 mb-6 bg-black/50 border border-white/5 rounded-2xl p-3.5 backdrop-blur-md">
                  {game.metrics.map((metric, i) => (
                    <div key={i} className="flex flex-col">
                      <span className="text-[10px] uppercase font-['Geist_Mono'] text-neutral-500 font-semibold">
                        {metric.label}
                      </span>
                      <span className="text-xs sm:text-sm font-semibold text-white truncate">
                        {metric.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card Action Footer */}
              <div className="relative p-6 sm:p-8 pt-0 z-10 flex items-center justify-between border-t border-white/5 mt-auto">
                <span className="font-['Geist_Mono'] text-[11px] text-neutral-500 tracking-wider">
                  {game.tagline}
                </span>

                <Link
                  to={game.link}
                  className="px-6 py-3 rounded-2xl font-bold text-sm bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black shadow-[0_0_20px_rgba(245,158,11,0.35)] transition-all hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <Play size={15} fill="currentColor" />
                  <span>Jouer</span>
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
