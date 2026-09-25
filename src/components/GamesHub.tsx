import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import {
  Bomb,
  ChevronRight,
  Coins,
  Dices,
  Disc,
  Gem,
  LayoutGrid,
  Lock,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Spade,
  TrendingUp,
} from 'lucide-react';
import { useCasinoUser } from '../context/CasinoUserContext';
import { DogSymbol } from './doghouse/DogSymbols';

type Category = 'all' | 'slots' | 'originals' | 'rewards';

interface GameTile {
  id: string;
  title: string;
  provider: string;
  category: Exclude<Category, 'all'>;
  link?: string;
  tag?: string;
  rtp?: string;
  cover: React.ReactNode;
}

const DogHouseCover: React.FC = () => (
  <div className="absolute inset-0 bg-[linear-gradient(180deg,#3fa9f5_0%,#8fd3ff_55%,#7ed957_55%,#2d7d27_100%)]">
    <div className="absolute top-[8%] right-[10%] w-10 h-10 rounded-full bg-[#ffe14a] shadow-[0_0_30px_10px_rgba(255,240,150,0.6)]" />
    <div className="absolute top-[14%] left-[6%] w-20 h-6 rounded-full bg-white/90" />
    <div className="absolute inset-x-[14%] top-[20%] bottom-[30%] drop-shadow-[0_8px_0_rgba(0,0,0,0.25)]">
      <DogSymbol id="wild" multiplier={3} />
    </div>
    <div className="absolute left-[4%] bottom-[20%] w-[34%] aspect-square -rotate-6">
      <DogSymbol id="shihtzu" />
    </div>
    <div className="absolute right-[4%] bottom-[20%] w-[34%] aspect-square rotate-6">
      <DogSymbol id="scatter" />
    </div>
    <div className="absolute inset-x-0 bottom-[5%] text-center dh-font-xl text-[clamp(18px,2.2vw,26px)] leading-none text-[#ffb300] [-webkit-text-stroke:1.5px_#3b1d0e] drop-shadow-[0_3px_0_#3b1d0e]">
      THE DOG HOUSE
    </div>
  </div>
);

const MinesCover: React.FC = () => (
  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,#1f4a6e,#0b1a2a_70%)]">
    <div className="absolute inset-x-[12%] top-[14%] grid grid-cols-3 gap-2">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div
          key={i}
          className={`aspect-square rounded-lg flex items-center justify-center shadow-[inset_0_-4px_0_rgba(0,0,0,0.35)] ${
            i === 4 ? 'bg-[#3a1020]' : i % 3 === 0 ? 'bg-[#0f3a2a]' : 'bg-[#2a4a66]'
          }`}
        >
          {i === 4 ? (
            <Bomb className="w-1/2 h-1/2 text-[#ff4f6a]" />
          ) : i % 3 === 0 ? (
            <Gem className="w-1/2 h-1/2 text-[#3dffb0] drop-shadow-[0_0_8px_rgba(61,255,176,0.8)]" />
          ) : null}
        </div>
      ))}
    </div>
    <div className="absolute inset-x-0 bottom-[7%] text-center font-black italic tracking-tight text-white text-[clamp(22px,2.6vw,32px)] drop-shadow-[0_3px_0_rgba(0,0,0,0.5)]">
      MINES
    </div>
  </div>
);

const WheelCover: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden bg-[#1a0f00]">
    <img src="/podium_supercar.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-55" />
    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
    <div
      className="absolute left-1/2 top-[14%] -translate-x-1/2 w-[70%] aspect-square rounded-full border-[5px] border-[#ffcf3f] shadow-[0_0_30px_rgba(255,190,40,0.55)]"
      style={{
        background:
          'repeating-conic-gradient(#b8860b 0deg 22.5deg, #111 22.5deg 45deg, #e0a526 45deg 67.5deg, #2a2a2a 67.5deg 90deg)',
      }}
    >
      <div className="absolute inset-[38%] rounded-full bg-[#ffcf3f] border-4 border-black" />
    </div>
    <div className="absolute inset-x-0 bottom-[7%] text-center font-black tracking-tight text-[#ffcf3f] text-[clamp(16px,2vw,24px)] leading-tight drop-shadow">
      ROUE DE LA
      <br />
      FORTUNE
    </div>
  </div>
);

const SoonCover: React.FC<{ icon: React.ReactNode; from: string; to: string; title: string }> = ({ icon, from, to, title }) => (
  <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}>
    <div className="absolute inset-0 flex items-center justify-center text-white/25 [&>svg]:w-1/2 [&>svg]:h-1/2">{icon}</div>
    <div className="absolute inset-x-0 bottom-[7%] text-center font-black tracking-tight text-white/80 text-[clamp(18px,2.2vw,26px)]">
      {title}
    </div>
  </div>
);

const GAMES: GameTile[] = [
  {
    id: 'doghouse',
    title: 'The Dog House',
    provider: 'Diamond Slots',
    category: 'slots',
    link: '/slots',
    tag: 'NOUVEAU',
    rtp: '96,5 %',
    cover: <DogHouseCover />,
  },
  {
    id: 'mines',
    title: 'Mines',
    provider: 'Diamond Originals',
    category: 'originals',
    link: '/mines',
    tag: 'POPULAIRE',
    rtp: '98,5 %',
    cover: <MinesCover />,
  },
  {
    id: 'wheel',
    title: 'Roue de la Fortune',
    provider: 'Diamond Originals',
    category: 'rewards',
    link: '/roue-de-la-fortune',
    tag: 'GRATUIT / 24H',
    cover: <WheelCover />,
  },
  {
    id: 'blackjack',
    title: 'Blackjack',
    provider: 'Diamond Originals',
    category: 'originals',
    cover: <SoonCover icon={<Spade />} from="#1f5a3a" to="#0b2a1a" title="BLACKJACK" />,
  },
  {
    id: 'dice',
    title: 'Dice',
    provider: 'Diamond Originals',
    category: 'originals',
    cover: <SoonCover icon={<Dices />} from="#4a2a8a" to="#1a0f3a" title="DICE" />,
  },
  {
    id: 'crash',
    title: 'Crash',
    provider: 'Diamond Originals',
    category: 'originals',
    cover: <SoonCover icon={<TrendingUp />} from="#8a2a2a" to="#2a0b0b" title="CRASH" />,
  },
];

const CATEGORIES: { id: Category; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'Tous les jeux', icon: <LayoutGrid size={15} /> },
  { id: 'slots', label: 'Machines à sous', icon: <Sparkles size={15} /> },
  { id: 'originals', label: 'Originals', icon: <Gem size={15} /> },
  { id: 'rewards', label: 'Récompenses', icon: <Disc size={15} /> },
];

const Tile: React.FC<{ game: GameTile; index: number }> = ({ game, index }) => {
  const available = !!game.link;
  const card = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`group relative ${available ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div
        className={`relative aspect-[3/4] overflow-hidden rounded-xl bg-[#213743] shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-transform duration-200 ${
          available ? 'group-hover:-translate-y-1.5' : ''
        }`}
      >
        {game.cover}
        {game.tag && (
          <span className="absolute top-2 left-2 z-10 rounded-md bg-[#ffcf3f] px-1.5 py-0.5 text-[10px] font-extrabold text-[#1a1000]">
            {game.tag}
          </span>
        )}
        {available ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/45 group-hover:opacity-100">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ffcf3f] text-[#1a1000] shadow-[0_0_25px_rgba(255,207,63,0.6)]">
              <Play size={24} fill="currentColor" className="ml-1" />
            </span>
          </div>
        ) : (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-black/55">
            <Lock size={20} className="text-white/70" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">Bientôt</span>
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <div className="truncate text-sm font-bold text-white">{game.title}</div>
        <div className="flex items-center justify-between text-[11px] text-[#b1bad3]">
          <span className="truncate">{game.provider}</span>
          {game.rtp && <span className="shrink-0">RTP {game.rtp}</span>}
        </div>
      </div>
    </motion.div>
  );
  return available ? (
    <Link to={game.link} className="block">
      {card}
    </Link>
  ) : (
    card
  );
};

export const GamesHub: React.FC = () => {
  const { user, isAuthenticated } = useCasinoUser();
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GAMES.filter(
      (g) => (category === 'all' || g.category === category) && (!q || g.title.toLowerCase().includes(q)),
    );
  }, [category, query]);

  return (
    <div className="min-h-screen bg-[#0f1923] pt-[80px] sm:pt-[90px] text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Solde */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#1a2c38] px-4 py-3">
          {isAuthenticated && user ? (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">
                    {user.rpFirstName} {user.rpLastName}
                  </div>
                  <div className="text-[11px] text-[#b1bad3]">ID {user.citizenId}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg bg-[#0f1923] px-3 py-2">
                  <Coins size={16} className="text-[#ffcf3f]" />
                  <span className="font-['Geist_Mono'] text-sm font-bold">{user.chips.toLocaleString('fr-FR')}</span>
                </div>
                <Link
                  to="/espace-membre"
                  className="rounded-lg bg-[#ffcf3f] px-4 py-2 text-sm font-bold text-[#1a1000] hover:bg-[#ffd966] transition-colors"
                >
                  Portefeuille
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-[#b1bad3]">
                <span className="font-bold text-white">Mode démo disponible.</span> Connectez-vous pour jouer avec vos jetons.
              </div>
              <Link
                to="/espace-membre"
                className="flex items-center gap-1 rounded-lg bg-[#ffcf3f] px-4 py-2 text-sm font-bold text-[#1a1000] hover:bg-[#ffd966] transition-colors"
              >
                Connexion <ChevronRight size={15} />
              </Link>
            </>
          )}
        </div>

        {/* Bannières */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Link
            to="/slots"
            className="group relative col-span-1 lg:col-span-2 overflow-hidden rounded-2xl min-h-[220px] sm:min-h-[260px] bg-[linear-gradient(180deg,#3fa9f5_0%,#8fd3ff_62%,#7ed957_62%,#2d7d27_100%)]"
          >
            <div className="absolute right-[-4%] bottom-[-6%] w-[58%] sm:w-[44%] max-w-[360px] aspect-square transition-transform duration-300 group-hover:scale-105">
              <DogSymbol id="wild" multiplier={3} />
            </div>
            <div className="absolute right-[33%] bottom-[6%] w-[14%] max-w-[120px] aspect-square -rotate-6 hidden xl:block">
              <DogSymbol id="rottweiler" />
            </div>
            <div className="relative z-10 flex h-full max-w-[62%] sm:max-w-[52%] flex-col justify-center p-5 sm:p-8">
              <span className="mb-2 w-fit rounded-md bg-[#3b1d0e] px-2 py-0.5 text-[11px] font-extrabold text-[#ffcf3f]">
                NOUVELLE MACHINE
              </span>
              <h2 className="dh-font-xl text-3xl sm:text-5xl leading-none text-[#ffb300] [-webkit-text-stroke:2px_#3b1d0e] drop-shadow-[0_4px_0_#3b1d0e]">
                THE DOG HOUSE
              </h2>
              <p className="mt-3 text-sm font-semibold text-[#1b2a3a] max-w-sm">
                Wilds x2 et x3 additionnés, jusqu'à 27 tours gratuits avec wilds collants. Gain max 6 750x.
              </p>
              <span className="mt-4 flex w-fit items-center gap-2 rounded-lg bg-[#3b1d0e] px-5 py-2.5 text-sm font-bold text-white group-hover:bg-[#5a2c10] transition-colors">
                <Play size={15} fill="currentColor" /> Jouer maintenant
              </span>
            </div>
          </Link>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Link
              to="/roue-de-la-fortune"
              className="group relative overflow-hidden rounded-2xl min-h-[120px] bg-[#1a2c38]"
            >
              <img src="/podium_supercar.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-50 transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0f1923] via-[#0f1923]/70 to-transparent" />
              <div className="relative p-5">
                <div className="text-[11px] font-extrabold text-[#ffcf3f]">TOUS LES JOURS</div>
                <div className="text-xl font-extrabold">Roue de la Fortune</div>
                <div className="mt-1 text-xs text-[#b1bad3]">Un tour offert, la supercar du podium en jeu.</div>
              </div>
            </Link>
            <Link to="/mines" className="group relative overflow-hidden rounded-2xl min-h-[120px] bg-[radial-gradient(circle_at_80%_50%,#1f4a6e,#1a2c38_60%)]">
              <Gem className="absolute right-6 top-1/2 -translate-y-1/2 h-16 w-16 text-[#3dffb0] drop-shadow-[0_0_14px_rgba(61,255,176,0.7)] transition-transform group-hover:scale-110" />
              <div className="relative p-5">
                <div className="text-[11px] font-extrabold text-[#3dffb0]">ORIGINALS</div>
                <div className="text-xl font-extrabold">Mines</div>
                <div className="mt-1 text-xs text-[#b1bad3]">Révélez les diamants, encaissez avant la bombe.</div>
              </div>
            </Link>
          </div>
        </div>

        {/* Recherche + catégories */}
        <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#b1bad3]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un jeu"
              className="w-full rounded-full border-2 border-[#2f4553] bg-[#0f212e] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-[#7a8ba0] outline-none transition-colors focus:border-[#557086]"
            />
          </label>
          <div className="flex gap-1 overflow-x-auto rounded-full bg-[#0f212e] p-1 [scrollbar-width:none]">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  category === c.id ? 'bg-[#2f4553] text-white' : 'text-[#b1bad3] hover:text-white hover:bg-[#1a2c38]'
                }`}
              >
                {c.icon}
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grille */}
        <div className="mt-6 mb-3 flex items-center gap-2">
          <Sparkles size={18} className="text-[#ffcf3f]" />
          <h3 className="text-lg font-bold">{CATEGORIES.find((c) => c.id === category)?.label}</h3>
          <span className="text-sm text-[#b1bad3]">({filtered.length})</span>
        </div>
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
            {filtered.map((g, i) => (
              <Tile key={g.id} game={g} index={i} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-[#1a2c38] py-12 text-center text-sm text-[#b1bad3]">
            Aucun jeu ne correspond à « {query} ».
          </div>
        )}

        {/* Garanties */}
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {[
            { icon: <ShieldCheck size={18} />, t: 'Résultats équitables', d: 'Chaque tirage est aléatoire et vérifiable.' },
            { icon: <Coins size={18} />, t: 'Jetons instantanés', d: 'Vos gains sont crédités à la fin de chaque partie.' },
            { icon: <Play size={18} />, t: 'Mode démo', d: 'Essayez les jeux sans miser vos jetons.' },
          ].map((f) => (
            <div key={f.t} className="flex items-start gap-3 rounded-xl bg-[#1a2c38] p-4">
              <span className="mt-0.5 text-[#ffcf3f]">{f.icon}</span>
              <div>
                <div className="text-sm font-bold">{f.t}</div>
                <div className="text-xs text-[#b1bad3]">{f.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
