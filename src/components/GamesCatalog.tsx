import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import {
  ArrowUpRight,
  Cherry,
  CircleDot,
  Clock,
  Crown,
  Disc,
  Layers,
  MapPin,
  ShieldCheck,
  Spade,
  Trophy,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { fadeUp } from '../constants/animations';
import { useCasinoUser } from '../context/CasinoUserContext';
import { useCasinoAdmin } from '../context/CasinoAdminContext';

type GameCategory = 'tables' | 'cartes' | 'machines' | 'evenements';

interface CasinoGame {
  id: string;
  code: string;
  name: string;
  tagline: string;
  category: GameCategory;
  icon: LucideIcon;
  minBet: number;
  maxBet: number | null;
  location: string;
  hours: string;
  seats: string;
  status: 'open' | 'vip' | 'busy';
  rules: string[];
}

const CATEGORIES: { key: 'all' | GameCategory; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'tables', label: 'Tables' },
  { key: 'cartes', label: 'Cartes' },
  { key: 'machines', label: 'Machines' },
  { key: 'evenements', label: 'Événements' },
];

const GAMES: CasinoGame[] = [
  {
    id: 'blackjack',
    code: 'TABLE 01',
    name: 'Blackjack',
    tagline: 'Battez le croupier sans dépasser 21.',
    category: 'cartes',
    icon: Spade,
    minBet: 100,
    maxBet: 50000,
    location: 'Salle principale · Tables 1 à 4',
    hours: '24h/24',
    seats: '4 places par table',
    status: 'open',
    rules: [
      'Le croupier tire jusqu’à 16 et reste à 17.',
      'Un Blackjack naturel paie 3 pour 2.',
      'Doublement autorisé sur les deux premières cartes, séparation des paires jusqu’à 3 mains.',
      'Assurance proposée lorsque le croupier montre un As.',
    ],
  },
  {
    id: 'roulette',
    code: 'TABLE 02',
    name: 'Roulette Européenne',
    tagline: 'Un seul zéro, trente-sept numéros, une bille.',
    category: 'tables',
    icon: CircleDot,
    minBet: 50,
    maxBet: 100000,
    location: 'Salle principale · Rotonde centrale',
    hours: '24h/24',
    seats: '6 places par table',
    status: 'busy',
    rules: [
      'Plein (un numéro) payé 35 contre 1.',
      'Chances simples (rouge/noir, pair/impair, manque/passe) payées 1 contre 1.',
      'Douzaines et colonnes payées 2 contre 1.',
      'Les mises sont closes à l’annonce « Rien ne va plus ».',
    ],
  },
  {
    id: 'three-card',
    code: 'TABLE 03',
    name: 'Three Card Poker',
    tagline: 'Trois cartes, une main, face au croupier.',
    category: 'cartes',
    icon: Layers,
    minBet: 100,
    maxBet: 25000,
    location: 'Salle principale · Tables 5 et 6',
    hours: '14h — 06h',
    seats: '4 places par table',
    status: 'open',
    rules: [
      'Misez Ante, recevez trois cartes, puis jouez ou couchez-vous.',
      'Le croupier se qualifie avec une Dame ou mieux.',
      'Bonus Pair Plus payé quelle que soit la main du croupier.',
      'Quinte flush : jusqu’à 40 contre 1.',
    ],
  },
  {
    id: 'slots',
    code: 'GALERIE 04',
    name: 'Machines à sous',
    tagline: 'Diamonds, Space Monkey, Twilight Knife et plus.',
    category: 'machines',
    icon: Cherry,
    minBet: 5,
    maxBet: 2500,
    location: 'Galerie des machines · Aile est',
    hours: '24h/24',
    seats: '40 machines',
    status: 'open',
    rules: [
      'Choisissez votre mise par ligne puis lancez les rouleaux.',
      'Trois symboles identiques sur la ligne gagnante paient selon la table affichée.',
      'Le symbole Diamant déclenche le jackpot progressif de la machine.',
      'Limite de session fixée par la direction pour un jeu responsable.',
    ],
  },
  {
    id: 'inside-track',
    code: 'SALLE 05',
    name: 'Inside Track',
    tagline: 'Courses hippiques en direct sur écran géant.',
    category: 'evenements',
    icon: Trophy,
    minBet: 100,
    maxBet: 10000,
    location: 'Salle Inside Track · Niveau 1',
    hours: 'Courses toutes les 15 min',
    seats: 'Places illimitées',
    status: 'open',
    rules: [
      'Choisissez un cheval parmi six partants et placez votre mise.',
      'Les cotes s’affichent avant le départ, de 1/1 à 30/1.',
      'Mode Main Event : pariez contre les autres joueurs du salon.',
      'Gains versés dès la ligne d’arrivée franchie.',
    ],
  },
  {
    id: 'high-roller',
    code: 'PENTHOUSE 06',
    name: 'Salon High Roller',
    tagline: 'Tables privées, limites relevées, service majordome.',
    category: 'tables',
    icon: Crown,
    minBet: 10000,
    maxBet: null,
    location: 'Penthouse · Salon privé',
    hours: 'Sur réservation',
    seats: '6 invités',
    status: 'vip',
    rules: [
      'Accès réservé aux titulaires d’une carte Gold ou Black Diamond.',
      'Blackjack, roulette et poker à limites personnalisées.',
      'Service de bar et majordome dédié durant toute la session.',
      'Réservation auprès de la direction via le Discord.',
    ],
  },
];

const STATUS_STYLE: Record<CasinoGame['status'], { label: string; className: string }> = {
  open: { label: 'Ouvert', className: 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10' },
  busy: { label: 'Affluence', className: 'text-amber-200 border-amber-400/30 bg-amber-500/10' },
  vip: { label: 'Réservé VIP', className: 'text-amber-300 border-amber-400/40 bg-amber-500/10' },
};

const formatBet = (v: number | null) => (v === null ? 'Sans plafond' : v.toLocaleString('fr-FR'));

export const GamesCatalog: React.FC = () => {
  const { user, isAuthenticated, canSpinWheel, timeUntilNextSpin } = useCasinoUser();
  const { economy } = useCasinoAdmin();
  const [category, setCategory] = useState<'all' | GameCategory>('all');
  const [selected, setSelected] = useState<CasinoGame | null>(null);

  const games = useMemo(() => (category === 'all' ? GAMES : GAMES.filter((g) => g.category === category)), [category]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const hasHighRollerAccess = user?.vipTier === 'GOLD' || user?.vipTier === 'DIAMOND' || !!user?.isStaff;
  const wheelStatus = economy.maintenanceMode
    ? 'En maintenance'
    : !isAuthenticated
      ? '1 tirage gratuit par jour'
      : canSpinWheel
        ? 'Votre tirage est disponible'
        : `Prochain tirage dans ${timeUntilNextSpin}`;

  return (
    <div className="relative bg-black text-white">
      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}
      <section className="relative pt-36 sm:pt-44 pb-16 px-6 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-25 grayscale"
          style={{ backgroundImage: "url('/diamond_casino_hall.jpg')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black" aria-hidden="true" />

        <div className="relative max-w-4xl mx-auto text-center">
          <motion.span {...fadeUp(0.05)} className="text-xs font-['Geist_Mono'] tracking-[4px] uppercase text-neutral-400 block mb-4">
            SALLE DE JEUX // VINEWOOD, LOS SANTOS
          </motion.span>
          <motion.h1
            {...fadeUp(0.1)}
            className="text-5xl sm:text-7xl lg:text-8xl tracking-tight leading-[1.05] mb-6 font-['Instrument_Serif'] font-normal"
          >
            Les jeux du <em className="italic text-amber-400">Diamond</em>
          </motion.h1>
          <motion.p {...fadeUp(0.15)} className="text-base sm:text-lg text-neutral-300 max-w-2xl mx-auto leading-relaxed">
            Tables, machines et courses en direct : retrouvez toutes les attractions du casino, leurs limites de mise et
            leurs règles avant de vous installer en jeu.
          </motion.p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* CATALOGUE                                                        */}
      {/* ================================================================ */}
      <section className="px-6 pb-24 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-center gap-2 mb-12" role="tablist" aria-label="Catégories de jeux">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={category === c.key}
              onClick={() => setCategory(c.key)}
              className={`rounded-full px-5 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                category === c.key
                  ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                  : 'liquid-glass text-white/70 hover:text-white'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {games.map((game, idx) => {
              const Icon = game.icon;
              const status = STATUS_STYLE[game.status];
              return (
                <motion.button
                  key={game.id}
                  layout
                  type="button"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.35, delay: idx * 0.04 }}
                  onClick={() => setSelected(game)}
                  className="liquid-glass rounded-2xl p-7 text-left flex flex-col group hover:bg-white/[0.04] transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform duration-300">
                      <Icon size={28} />
                    </div>
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <h3 className="font-bold text-xl group-hover:text-amber-300 transition-colors">{game.name}</h3>
                    <ArrowUpRight size={17} className="text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-neutral-400 text-sm leading-relaxed mb-6">{game.tagline}</p>
                  <div className="mt-auto pt-5 border-t border-white/10 flex items-center justify-between font-['Geist_Mono'] text-xs">
                    <span className="text-amber-400/80 tracking-wider">{game.code}</span>
                    <span className="text-neutral-400">
                      {formatBet(game.minBet)} – {formatBet(game.maxBet)}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </section>

      {/* ================================================================ */}
      {/* WHEEL BAND                                                       */}
      {/* ================================================================ */}
      <section className="px-6 pb-24 max-w-6xl mx-auto">
        <motion.div
          {...fadeUp(0.05)}
          className="relative rounded-2xl overflow-hidden border border-white/15 grid grid-cols-1 md:grid-cols-[1.2fr_1fr]"
        >
          <div className="p-8 sm:p-12 flex flex-col justify-center bg-white/[0.02]">
            <span className="font-['Geist_Mono'] text-xs tracking-[3px] uppercase text-neutral-400">ROTONDE CENTRALE</span>
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em] mt-3 mb-4">
              La Roue de la <span className="font-['Instrument_Serif'] font-normal italic text-amber-400">Fortune</span>
            </h2>
            <p className="text-neutral-400 leading-relaxed mb-8 max-w-md">
              Un tirage gratuit pour chaque citoyen. Jetons, cash, lots d’exception et la supercar du podium.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/roue-de-la-fortune"
                className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-black font-bold text-xs sm:text-sm tracking-wider uppercase rounded-full px-7 py-4 transition-transform duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 shadow-[0_0_30px_rgba(245,158,11,0.35)]"
              >
                <Disc size={17} /> Tourner la roue
              </Link>
              <span className="font-['Geist_Mono'] text-xs text-neutral-400 flex items-center gap-2">
                <Clock size={13} /> {wheelStatus}
              </span>
            </div>
          </div>
          <div className="relative min-h-[260px]">
            <img src="/podium_supercar.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/10 to-transparent md:from-black/60" />
          </div>
        </motion.div>
      </section>

      {/* ================================================================ */}
      {/* RESPONSIBLE GAMING                                               */}
      {/* ================================================================ */}
      <section className="px-6 pb-24 max-w-6xl mx-auto">
        <div className="p-6 rounded-xl border border-white/15 bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <span className="text-neutral-300 font-['Geist_Mono'] text-sm flex items-center gap-3">
            <ShieldCheck size={18} className="text-amber-400 shrink-0" />
            Jeu responsable : les jeux se déroulent en ville, avec la monnaie du serveur RP uniquement.
          </span>
          <Link
            to="/abonnements"
            className="text-xs uppercase tracking-widest font-bold text-white hover:underline flex items-center gap-1 shrink-0"
          >
            Découvrir les cartes VIP <ArrowUpRight size={14} />
          </Link>
        </div>
      </section>

      {/* ================================================================ */}
      {/* GAME DETAIL MODAL                                                */}
      {/* ================================================================ */}
      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-detail-title"
          >
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="liquid-glass bg-black/80 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-white/15 p-7 sm:p-8 max-h-[90svh] overflow-y-auto"
            >
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                    <selected.icon size={24} />
                  </div>
                  <div>
                    <span className="font-['Geist_Mono'] text-xs tracking-[3px] uppercase text-amber-400/80">{selected.code}</span>
                    <h3 id="game-detail-title" className="text-2xl font-semibold">
                      {selected.name}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="w-9 h-9 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 shrink-0 cursor-pointer"
                  aria-label="Fermer"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-neutral-300 mb-6">{selected.tagline}</p>

              <dl className="grid grid-cols-2 gap-3 mb-7">
                {[
                  { icon: MapPin, label: 'Emplacement', value: selected.location },
                  { icon: Clock, label: 'Horaires', value: selected.hours },
                  { icon: Users, label: 'Capacité', value: selected.seats },
                  { icon: Crown, label: 'Mises', value: `${formatBet(selected.minBet)} – ${formatBet(selected.maxBet)}` },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <dt className="font-['Geist_Mono'] text-[10px] tracking-[2px] uppercase text-neutral-500 flex items-center gap-1.5">
                      <Icon size={11} /> {label}
                    </dt>
                    <dd className="text-sm mt-1">{value}</dd>
                  </div>
                ))}
              </dl>

              <span className="font-['Geist_Mono'] text-xs tracking-[3px] uppercase text-neutral-400">Règles</span>
              <ol className="mt-3 space-y-3 mb-8">
                {selected.rules.map((rule, i) => (
                  <li key={rule} className="flex gap-3 text-sm text-neutral-300 leading-relaxed">
                    <span className="font-['Geist_Mono'] text-xs text-amber-400/80 pt-0.5">{String(i + 1).padStart(2, '0')}</span>
                    {rule}
                  </li>
                ))}
              </ol>

              {selected.status === 'vip' && !hasHighRollerAccess ? (
                <Link
                  to="/abonnements"
                  className="w-full rounded-full py-3.5 text-sm font-semibold bg-white text-black flex items-center justify-center gap-2 hover:bg-neutral-200 transition-colors"
                >
                  <Crown size={15} /> Obtenir une carte Gold ou Black Diamond
                </Link>
              ) : (
                <a
                  href="https://discord.gg/patvwjhNzK"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full rounded-full py-3.5 text-sm font-semibold bg-white text-black flex items-center justify-center gap-2 hover:bg-neutral-200 transition-colors"
                >
                  Rejoindre le serveur pour jouer <ArrowUpRight size={15} />
                </a>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
