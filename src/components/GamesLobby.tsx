import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import { Clock, MapPin, Coins, Crown, ChevronRight, X, Sparkles, Users, ShieldCheck, Wine, Lock } from 'lucide-react';
import { useCasinoUser } from '../context/CasinoUserContext';
import { useCasinoAdmin } from '../context/CasinoAdminContext';
import { FortuneWheel } from './wheel/FortuneWheel';

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

type GameCategory = 'tables' | 'cartes' | 'machines' | 'evenements';
type GameArtKind = 'blackjack' | 'roulette' | 'poker' | 'slots' | 'racing' | 'highroller';

interface CasinoGame {
  id: string;
  name: string;
  tagline: string;
  category: GameCategory;
  art: GameArtKind;
  minBet: string;
  maxBet: string;
  location: string;
  hours: string;
  seats: string;
  status: 'open' | 'vip' | 'busy';
  rules: string[];
}

const CATEGORIES: { key: 'all' | GameCategory; label: string }[] = [
  { key: 'all', label: 'Tous les jeux' },
  { key: 'tables', label: 'Tables' },
  { key: 'cartes', label: 'Cartes' },
  { key: 'machines', label: 'Machines' },
  { key: 'evenements', label: 'Événements' },
];

const GAMES: CasinoGame[] = [
  {
    id: 'blackjack',
    name: 'Blackjack',
    tagline: 'Battez le croupier sans dépasser 21.',
    category: 'cartes',
    art: 'blackjack',
    minBet: '100',
    maxBet: '50 000',
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
    name: 'Roulette Européenne',
    tagline: 'Un seul zéro, trente-sept numéros, une bille.',
    category: 'tables',
    art: 'roulette',
    minBet: '50',
    maxBet: '100 000',
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
    name: 'Three Card Poker',
    tagline: 'Trois cartes, une main, face au croupier.',
    category: 'cartes',
    art: 'poker',
    minBet: '100',
    maxBet: '25 000',
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
    name: 'Machines à sous',
    tagline: 'Diamonds, Space Monkey, Twilight Knife et plus.',
    category: 'machines',
    art: 'slots',
    minBet: '5',
    maxBet: '2 500',
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
    name: 'Inside Track',
    tagline: 'Courses hippiques en direct sur écran géant.',
    category: 'evenements',
    art: 'racing',
    minBet: '100',
    maxBet: '10 000',
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
    name: 'Salon High Roller',
    tagline: 'Tables privées, limites relevées, service majordome.',
    category: 'tables',
    art: 'highroller',
    minBet: '10 000',
    maxBet: 'Sans plafond',
    location: 'Penthouse · Salon privé',
    hours: 'Sur réservation',
    seats: '6 invités',
    status: 'vip',
    rules: [
      'Accès réservé aux titulaires d’un pass Gold ou Diamond.',
      'Blackjack, roulette et poker à limites personnalisées.',
      'Service de bar et majordome dédié durant toute la session.',
      'Réservation auprès de la direction via l’Espace Membre.',
    ],
  },
];

const STATUS_STYLE: Record<CasinoGame['status'], { label: string; className: string }> = {
  open: { label: 'Ouvert', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' },
  busy: { label: 'Forte affluence', className: 'bg-amber-500/15 text-amber-200 border-amber-400/30' },
  vip: { label: 'Réservé VIP', className: 'bg-[#d9a93e]/15 text-[#fbe7a6] border-[#d9a93e]/50' },
};

/* ------------------------------------------------------------------ */
/* Illustrations (pure SVG, no external assets)                        */
/* ------------------------------------------------------------------ */

const PlayingCard: React.FC<{ x: number; y: number; rotate: number; rank: string; suit: string; red?: boolean }> = ({
  x,
  y,
  rotate,
  rank,
  suit,
  red,
}) => (
  <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
    <rect x={-32} y={-46} width={64} height={92} rx={6} fill="rgba(0,0,0,0.35)" transform="translate(3 4)" />
    <rect x={-32} y={-46} width={64} height={92} rx={6} fill="#fbf7ec" stroke="#d9a93e" strokeWidth={1} />
    <text x={-24} y={-28} fontFamily="Cinzel, serif" fontWeight={800} fontSize={16} fill={red ? '#b3162b' : '#111'}>
      {rank}
    </text>
    <text x={0} y={10} textAnchor="middle" fontSize={34} fill={red ? '#b3162b' : '#111'}>
      {suit}
    </text>
  </g>
);

const Chip: React.FC<{ x: number; y: number; color: string; r?: number }> = ({ x, y, color, r = 18 }) => (
  <g transform={`translate(${x} ${y})`}>
    <ellipse cx={0} cy={4} rx={r} ry={r * 0.45} fill="rgba(0,0,0,0.45)" />
    <circle r={r} fill={color} stroke="#fff4dc" strokeWidth={1.5} />
    <circle r={r * 0.78} fill="none" stroke="#fff4dc" strokeWidth={3} strokeDasharray={`${r * 0.5} ${r * 0.5}`} />
    <circle r={r * 0.5} fill={color} stroke="rgba(255,244,220,0.6)" strokeWidth={1} />
  </g>
);

const GameArt: React.FC<{ kind: GameArtKind }> = ({ kind }) => {
  switch (kind) {
    case 'blackjack':
      return (
        <svg viewBox="0 0 300 180" className="w-full h-full">
          <path d="M 20 170 Q 150 60 280 170" fill="none" stroke="#d9a93e" strokeOpacity={0.35} strokeWidth={1.5} />
          <text x={150} y={150} textAnchor="middle" fontFamily="Cinzel, serif" fontSize={10} letterSpacing="0.3em" fill="#d9a93e" opacity={0.6}>
            BLACKJACK PAYS 3 TO 2
          </text>
          <PlayingCard x={128} y={82} rotate={-10} rank="A" suit="♠" />
          <PlayingCard x={172} y={78} rotate={9} rank="K" suit="♥" red />
          <Chip x={66} y={120} color="#8e1424" />
          <Chip x={234} y={118} color="#0b6040" />
        </svg>
      );
    case 'roulette': {
      const pockets = 37;
      return (
        <svg viewBox="0 0 300 180" className="w-full h-full">
          <g transform="translate(150 92)">
            <circle r={78} fill="#2a1b04" stroke="#d9a93e" strokeWidth={4} />
            {Array.from({ length: pockets }).map((_, i) => {
              const a0 = (i / pockets) * Math.PI * 2;
              const a1 = ((i + 1) / pockets) * Math.PI * 2;
              const r0 = 44;
              const r1 = 70;
              const d = `M ${r0 * Math.cos(a0)} ${r0 * Math.sin(a0)} L ${r1 * Math.cos(a0)} ${r1 * Math.sin(a0)} A ${r1} ${r1} 0 0 1 ${r1 * Math.cos(a1)} ${r1 * Math.sin(a1)} L ${r0 * Math.cos(a1)} ${r0 * Math.sin(a1)} Z`;
              const fill = i === 0 ? '#0b6040' : i % 2 ? '#8e1424' : '#111';
              return <path key={i} d={d} fill={fill} stroke="#d9a93e" strokeWidth={0.5} />;
            })}
            <circle r={44} fill="#5a3a08" stroke="#d9a93e" strokeWidth={2} />
            <circle r={30} fill="#2a1b04" />
            <path d="M -22 0 L 22 0 M 0 -22 L 0 22" stroke="#e2b54e" strokeWidth={4} strokeLinecap="round" />
            <circle r={7} fill="#e2b54e" />
            <circle cx={50} cy={-38} r={5} fill="#fff" stroke="#bbb" />
          </g>
        </svg>
      );
    }
    case 'poker':
      return (
        <svg viewBox="0 0 300 180" className="w-full h-full">
          <PlayingCard x={105} y={88} rotate={-14} rank="Q" suit="♦" red />
          <PlayingCard x={150} y={80} rotate={0} rank="K" suit="♦" red />
          <PlayingCard x={195} y={88} rotate={14} rank="A" suit="♦" red />
          {[0, 1, 2, 3].map((i) => (
            <Chip key={i} x={250} y={150 - i * 7} color="#111" r={16} />
          ))}
          {[0, 1, 2].map((i) => (
            <Chip key={`r${i}`} x={50} y={150 - i * 7} color="#8e1424" r={16} />
          ))}
        </svg>
      );
    case 'slots':
      return (
        <svg viewBox="0 0 300 180" className="w-full h-full">
          <rect x={45} y={30} width={210} height={120} rx={14} fill="#2a1b04" stroke="#d9a93e" strokeWidth={3} />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${62 + i * 62} 44)`}>
              <rect width={52} height={92} rx={6} fill="#fbf7ec" />
              <rect width={52} height={92} rx={6} fill="url(#reelShade)" />
              <text x={26} y={56} textAnchor="middle" fontSize={34} fontFamily="Cinzel, serif" fontWeight={900} fill={i === 1 ? '#1f4fb8' : '#b3162b'}>
                {i === 1 ? '◆' : '7'}
              </text>
            </g>
          ))}
          <line x1={52} y1={90} x2={248} y2={90} stroke="#c42a3c" strokeWidth={2} strokeOpacity={0.8} />
          <defs>
            <linearGradient id="reelShade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0,0,0,0.45)" />
              <stop offset="30%" stopColor="rgba(0,0,0,0)" />
              <stop offset="70%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <circle key={i} cx={68 + i * 27.5} cy={22} r={4} fill="#f5d27a" className="bulb-idle" style={{ animationDelay: `${(i % 2) * 1.2}s` }} />
          ))}
        </svg>
      );
    case 'racing':
      return (
        <svg viewBox="0 0 300 180" className="w-full h-full">
          <rect x={20} y={36} width={260} height={112} rx={56} fill="none" stroke="#d9a93e" strokeOpacity={0.5} strokeWidth={2} />
          <rect x={48} y={62} width={204} height={60} rx={30} fill="none" stroke="#d9a93e" strokeOpacity={0.25} strokeWidth={1.5} />
          {['#c42a3c', '#1f4fb8', '#f5d27a', '#18925f', '#7446cf', '#fbf7ec'].map((c, i) => (
            <g key={c} transform={`translate(${70 + i * 30} ${50 + (i % 2) * 8})`}>
              <circle r={11} fill={c} stroke="#111" strokeWidth={1.5} />
              <text y={4} textAnchor="middle" fontFamily="Cinzel, serif" fontWeight={800} fontSize={11} fill={i === 2 || i === 5 ? '#111' : '#fff'}>
                {i + 1}
              </text>
            </g>
          ))}
          <line x1={150} y1={122} x2={150} y2={148} stroke="#fbf7ec" strokeWidth={3} strokeDasharray="3 3" />
          <text x={150} y={100} textAnchor="middle" fontFamily="Cinzel, serif" fontSize={13} letterSpacing="0.3em" fill="#e2b54e">
            INSIDE TRACK
          </text>
        </svg>
      );
    case 'highroller':
      return (
        <svg viewBox="0 0 300 180" className="w-full h-full">
          <g transform="translate(150 70)">
            <path d="M -46 22 L -52 -22 L -24 0 L 0 -34 L 24 0 L 52 -22 L 46 22 Z" fill="#e2b54e" stroke="#fbe7a6" strokeWidth={1.5} />
            <rect x={-46} y={22} width={92} height={12} rx={2} fill="#d9a93e" stroke="#fbe7a6" strokeWidth={1} />
            <circle cx={0} cy={-34} r={5} fill="#c42a3c" />
            <circle cx={-52} cy={-22} r={4} fill="#fbf7ec" />
            <circle cx={52} cy={-22} r={4} fill="#fbf7ec" />
          </g>
          {[0, 1, 2, 3, 4].map((i) => (
            <Chip key={i} x={110} y={156 - i * 7} color="#111" r={15} />
          ))}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Chip key={`g${i}`} x={150} y={160 - i * 7} color="#b8862a" r={15} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <Chip key={`p${i}`} x={190} y={156 - i * 7} color="#4a2296" r={15} />
          ))}
        </svg>
      );
  }
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export const GamesLobby: React.FC = () => {
  const { user, isAuthenticated, canSpinWheel, timeUntilNextSpin } = useCasinoUser();
  const { segments } = useCasinoAdmin();
  const [filter, setFilter] = useState<'all' | GameCategory>('all');
  const [selected, setSelected] = useState<CasinoGame | null>(null);

  const visibleGames = useMemo(() => (filter === 'all' ? GAMES : GAMES.filter((g) => g.category === filter)), [filter]);
  const hasVip = user?.vipTier === 'GOLD' || user?.vipTier === 'DIAMOND';

  return (
    <div className="relative min-h-screen bg-black text-white pt-24 sm:pt-28 pb-24 overflow-hidden">
      {/* Atmosphere */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute inset-x-0 top-0 h-[720px] bg-cover bg-center opacity-25" style={{ backgroundImage: `url('/diamond_casino_hall.jpg')` }} />
        <div className="absolute inset-x-0 top-0 h-[720px] bg-gradient-to-b from-black/60 via-black/80 to-black" />
        <div className="absolute inset-0 deco-pattern opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" />
        <div className="absolute top-40 -left-40 w-[520px] h-[520px] rounded-full bg-[#0b6040]/20 blur-[160px]" />
        <div className="absolute top-20 -right-40 w-[520px] h-[520px] rounded-full bg-[#d9a93e]/10 blur-[160px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8">
        {/* ---------- Header ---------- */}
        <header className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="h-px w-10 sm:w-20 bg-gradient-to-r from-transparent to-[#d9a93e]" />
            <span className="font-cinzel text-[10px] sm:text-xs tracking-[0.45em] text-[#e2b54e] uppercase">The Diamond Casino & Resort</span>
            <span className="h-px w-10 sm:w-20 bg-gradient-to-l from-transparent to-[#d9a93e]" />
          </div>
          <h1 className="font-cinzel font-black text-4xl sm:text-6xl lg:text-7xl tracking-wide">
            <span className="text-gold">Salons de Jeux</span>
          </h1>
          <p className="mt-4 text-neutral-400 text-sm sm:text-base max-w-2xl mx-auto">
            Tables de cartes, roulette, machines à sous et courses en direct. Asseyez-vous, le croupier vous attend.
          </p>

          <dl className="mt-8 mx-auto max-w-3xl grid grid-cols-2 sm:grid-cols-4 deco-panel rounded-2xl divide-x divide-[#d9a93e]/15">
            {[
              { label: 'Jeux', value: String(GAMES.length) },
              { label: 'Ouverture', value: '24h/24' },
              { label: 'Mise minimum', value: '5 jetons' },
              { label: 'Salon privé', value: 'VIP' },
            ].map((stat) => (
              <div key={stat.label} className="py-4 px-3">
                <dt className="text-[10px] font-['Geist_Mono'] uppercase tracking-wider text-neutral-500">{stat.label}</dt>
                <dd className="mt-1 font-cinzel font-bold text-xl text-[#fbe7a6]">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </header>

        {/* ---------- Featured: the wheel ---------- */}
        <section className="mt-14 relative overflow-hidden rounded-3xl deco-panel">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(217,169,62,0.18),transparent_60%)]" aria-hidden="true" />
          <div className="relative grid md:grid-cols-[1fr_auto] items-center gap-6 p-6 sm:p-10">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#d9a93e]/15 border border-[#d9a93e]/40 text-[10px] font-['Geist_Mono'] uppercase tracking-wider text-[#fbe7a6]">
                <Sparkles size={12} /> À la une · Gratuit
              </span>
              <h2 className="mt-4 font-cinzel font-black text-3xl sm:text-5xl text-white">
                Roue de la <span className="text-gold">Fortune</span>
              </h2>
              <p className="mt-3 text-neutral-300 max-w-md">
                Un tirage offert à chaque période, 100 % gagnant. La supercar du podium est en jeu.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  to="/roue-de-la-fortune"
                  className="btn-gold inline-flex items-center gap-2 px-6 py-3 rounded-full font-cinzel font-bold text-sm tracking-[0.2em] uppercase"
                >
                  Tourner la roue <ChevronRight size={16} />
                </Link>
                {isAuthenticated && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-['Geist_Mono'] text-neutral-400">
                    <Clock size={13} className="text-[#e2b54e]" />
                    {canSpinWheel ? 'Votre tirage est disponible' : `Disponible dans ${timeUntilNextSpin}`}
                  </span>
                )}
              </div>
            </div>
            <Link to="/roue-de-la-fortune" className="justify-self-center md:justify-self-end w-60 sm:w-72" aria-label="Aller à la Roue de la Fortune">
              <FortuneWheel segments={segments} rotation={-11.25} mode="idle" className="w-full drop-shadow-[0_25px_40px_rgba(0,0,0,0.9)]" />
            </Link>
          </div>
        </section>

        {/* ---------- Filters ---------- */}
        <div className="mt-16 flex flex-col sm:flex-row sm:items-end justify-between gap-5">
          <div>
            <span className="font-cinzel text-xs tracking-[0.4em] text-[#e2b54e]">LA SALLE</span>
            <h2 className="mt-1 font-cinzel font-bold text-3xl text-white">Choisissez votre table</h2>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0" role="tablist">
            {CATEGORIES.map((cat) => {
              const active = filter === cat.key;
              return (
                <button
                  key={cat.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(cat.key)}
                  className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#d9a93e] text-[#1d1303] border-[#d9a93e]'
                      : 'border-white/10 text-neutral-400 hover:text-white hover:border-[#d9a93e]/40'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ---------- Game grid ---------- */}
        <motion.div layout className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {visibleGames.map((game) => {
              const status = STATUS_STYLE[game.status];
              return (
                <motion.button
                  layout
                  key={game.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => setSelected(game)}
                  className="group text-left rounded-2xl overflow-hidden border border-[#d9a93e]/20 hover:border-[#d9a93e]/60 bg-neutral-950 transition-colors cursor-pointer shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)]"
                >
                  <div className={`relative h-44 ${game.art === 'highroller' ? 'bg-[radial-gradient(ellipse_at_center,#2e1a4f,#0c0716)]' : 'felt'}`}>
                    <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-105">
                      <GameArt kind={game.art} />
                    </div>
                    <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full border text-[10px] font-['Geist_Mono'] uppercase tracking-wider ${status.className}`}>
                      {status.label}
                    </span>
                    <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#d9a93e]/60 to-transparent" />
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-cinzel font-bold text-xl text-white">{game.name}</h3>
                      {game.status === 'vip' && <Crown size={18} className="text-[#e2b54e] shrink-0 mt-1" />}
                    </div>
                    <p className="mt-1 text-sm text-neutral-400">{game.tagline}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-['Geist_Mono']">
                      <div className="rounded-lg bg-black/60 border border-white/5 px-3 py-2">
                        <div className="text-neutral-500 uppercase text-[9px]">Mises</div>
                        <div className="text-[#fbe7a6] truncate">
                          {game.minBet} – {game.maxBet}
                        </div>
                      </div>
                      <div className="rounded-lg bg-black/60 border border-white/5 px-3 py-2">
                        <div className="text-neutral-500 uppercase text-[9px]">Horaires</div>
                        <div className="text-neutral-200 truncate">{game.hours}</div>
                      </div>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1 text-xs text-[#e2b54e] group-hover:gap-2 transition-all">
                      Règles & informations <ChevronRight size={13} />
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </motion.div>

        {/* ---------- House etiquette ---------- */}
        <section className="mt-20 grid md:grid-cols-3 gap-5">
          {[
            { icon: ShieldCheck, title: 'Jeu certifié', text: 'Chaque table est surveillée par la direction et les croupiers agréés du Diamond.' },
            { icon: Wine, title: 'Service en salle', text: 'Cocktails et champagne servis à table. Tenue correcte exigée dans les salons.' },
            { icon: Coins, title: 'Jetons officiels', text: 'Échangez votre cash à la caisse et retrouvez votre solde dans l’Espace Membre.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="deco-panel rounded-2xl p-6">
              <Icon size={22} className="text-[#e2b54e]" />
              <h3 className="mt-3 font-cinzel font-bold text-lg text-white">{title}</h3>
              <p className="mt-1.5 text-sm text-neutral-400 leading-relaxed">{text}</p>
            </div>
          ))}
        </section>

        {/* ---------- VIP CTA ---------- */}
        <section className="mt-10 rounded-3xl overflow-hidden border border-[#d9a93e]/40 bg-[radial-gradient(ellipse_at_top_left,#3a2608,#0c0803_70%)] p-8 sm:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <span className="font-cinzel text-xs tracking-[0.4em] text-[#e2b54e]">SALON HIGH ROLLER</span>
            <h2 className="mt-2 font-cinzel font-black text-3xl sm:text-4xl text-gold">Jouez sans plafond</h2>
            <p className="mt-2 text-neutral-300 max-w-lg">
              Tables privées au Penthouse, limites personnalisées et tirages de la roue plus fréquents avec les pass Gold et Diamond.
            </p>
          </div>
          <Link
            to="/abonnements"
            className="btn-gold shrink-0 inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-cinzel font-bold text-sm tracking-[0.2em] uppercase"
          >
            {hasVip ? 'Mon pass VIP' : 'Devenir VIP'} <ChevronRight size={16} />
          </Link>
        </section>
      </div>

      {/* ---------- Game detail modal ---------- */}
      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto deco-panel rounded-3xl"
            >
              <button
                onClick={() => setSelected(null)}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/60 hover:bg-black/90 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
              <div className={`h-52 ${selected.art === 'highroller' ? 'bg-[radial-gradient(ellipse_at_center,#2e1a4f,#0c0716)]' : 'felt'}`}>
                <GameArt kind={selected.art} />
              </div>
              <div className="p-6 sm:p-8">
                <span className={`inline-block px-2.5 py-1 rounded-full border text-[10px] font-['Geist_Mono'] uppercase tracking-wider ${STATUS_STYLE[selected.status].className}`}>
                  {STATUS_STYLE[selected.status].label}
                </span>
                <h2 className="mt-3 font-cinzel font-black text-3xl text-white">{selected.name}</h2>
                <p className="mt-1 text-neutral-400">{selected.tagline}</p>

                <dl className="mt-6 grid grid-cols-2 gap-3 text-xs">
                  {[
                    { icon: Coins, label: 'Mises (jetons)', value: `${selected.minBet} – ${selected.maxBet}` },
                    { icon: Clock, label: 'Horaires', value: selected.hours },
                    { icon: MapPin, label: 'Emplacement', value: selected.location },
                    { icon: Users, label: 'Capacité', value: selected.seats },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="rounded-xl bg-black/50 border border-white/5 p-3">
                      <dt className="flex items-center gap-1.5 text-[10px] text-neutral-500 font-['Geist_Mono'] uppercase">
                        <Icon size={11} className="text-[#e2b54e]" /> {label}
                      </dt>
                      <dd className="mt-1 text-neutral-100">{value}</dd>
                    </div>
                  ))}
                </dl>

                <h3 className="mt-7 font-cinzel text-sm tracking-[0.3em] text-[#e2b54e]">RÈGLES DE LA MAISON</h3>
                <ul className="mt-3 space-y-2">
                  {selected.rules.map((rule) => (
                    <li key={rule} className="flex gap-3 text-sm text-neutral-300">
                      <span className="text-[#d9a93e] mt-0.5">◆</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  {selected.status === 'vip' && !hasVip ? (
                    <Link
                      to="/abonnements"
                      className="flex-1 btn-gold inline-flex items-center justify-center gap-2 py-3 rounded-full font-cinzel font-bold text-sm tracking-[0.15em] uppercase"
                    >
                      <Lock size={15} /> Débloquer avec un pass VIP
                    </Link>
                  ) : (
                    <Link
                      to="/espace-membre"
                      className="flex-1 btn-gold inline-flex items-center justify-center gap-2 py-3 rounded-full font-cinzel font-bold text-sm tracking-[0.15em] uppercase"
                    >
                      {isAuthenticated ? 'Voir mon solde de jetons' : 'Se connecter pour jouer'}
                    </Link>
                  )}
                  <button
                    onClick={() => setSelected(null)}
                    className="py-3 px-6 rounded-full border border-[#d9a93e]/40 text-[#fbe7a6] hover:bg-[#d9a93e]/10 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Retour à la salle
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
