import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import {
  Bomb,
  Car,
  ChevronLeft,
  ChevronRight,
  Coins,
  Crown,
  Dices,
  Disc,
  Gem,
  Gift,
  History,
  Home,
  LayoutGrid,
  Lock,
  Menu,
  MessageCircle,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Spade,
  Star,
  TrendingUp,
  Trophy,
  User,
} from 'lucide-react';
import { useCasinoUser } from '../context/CasinoUserContext';
import { useCasinoAdmin } from '../context/CasinoAdminContext';
import { useMachineClosed } from './MachineClosedBanner';
import { GAME_LABELS, SLOT_RTP, formatRtp, type GamesConfig } from '../lib/gamesConfig';
import { apiRecentWheelWins, dbFetchBetsHistory, type SupabaseBetEntry, type WheelWin } from '../lib/supabase';
import { Wheel } from './wheel/Wheel';
import { BombArt, GemArt } from './mines/MinesArt';
import { DogSymbol } from './doghouse/DogSymbols';
import { WantedSymbol } from './wanted/WantedSymbols';

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

const WantedCover: React.FC = () => (
  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,#e8482a_0%,#b8231a_45%,#3a0a06_100%)]">
    <div className="absolute -left-6 top-[10%] w-24 h-24 rounded-full bg-[#f5d86a] opacity-90" />
    <div className="absolute inset-x-[18%] top-[16%] aspect-square drop-shadow-[0_6px_0_rgba(0,0,0,0.35)]">
      <WantedSymbol id="vs" />
    </div>
    <div className="absolute left-[5%] bottom-[22%] w-[34%] aspect-square -rotate-6">
      <WantedSymbol id="skull" />
    </div>
    <div className="absolute right-[5%] bottom-[22%] w-[34%] aspect-square rotate-6">
      <WantedSymbol id="wild" />
    </div>
    <div className="absolute inset-x-0 bottom-[5%] text-center font-['Rye'] text-[clamp(20px,2.4vw,30px)] leading-none text-[#e0b040] [-webkit-text-stroke:1.5px_#1c120c] drop-shadow-[0_3px_0_#1c120c]">
      WANTED
    </div>
  </div>
);

const MinesCover: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#3a2a6a,#1a1238_55%,#07050f)]">
    <div className="absolute inset-x-[14%] top-[10%] grid grid-cols-3 gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg border-[3px] border-[#140c22] bg-[linear-gradient(180deg,#8a5a2a,#4a2a12)]">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div
          key={i}
          className={`relative aspect-square rounded-[14%] border-2 border-[#140c22] flex items-center justify-center ${
            i === 4
              ? 'bg-[radial-gradient(circle,#ff6a3a,#8a1010_70%)]'
              : i === 0 || i === 5 || i === 7
                ? 'bg-[radial-gradient(circle,#1c5a7a,#0c1e3a_75%)]'
                : 'bg-[radial-gradient(circle_at_30%_25%,#8f7cb4,#5d4d80_42%,#372b55)] shadow-[inset_0_3px_0_rgba(255,255,255,0.2),inset_0_-4px_0_rgba(0,0,0,0.45)]'
          }`}
        >
          {i === 4 ? (
            <BombArt className="w-[70%]" />
          ) : i === 0 || i === 5 || i === 7 ? (
            <GemArt className="w-[72%] drop-shadow-[0_0_8px_rgba(94,232,255,0.8)]" />
          ) : null}
        </div>
      ))}
    </div>
    <div
      className="absolute inset-x-0 bottom-[5%] text-center font-['Luckiest_Guy'] text-[clamp(24px,2.8vw,36px)] leading-none"
      style={{
        background: 'linear-gradient(180deg, #ffffff 0%, #b8f6ff 30%, #3fd2f2 60%, #1470a8 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        WebkitTextStroke: '1.5px #140c22',
        filter: 'drop-shadow(0 3px 0 #140c22)',
      }}
    >
      MINES
    </div>
  </div>
);

const BoostersCover: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#2e1f08_0%,#130f06_45%,#050507_100%)] select-none">
    {/* Rayons dorés subtils en arrière-plan */}
    <div
      className="absolute left-1/2 top-[38%] w-[260%] aspect-square -translate-x-1/2 -translate-y-1/2 opacity-70 pointer-events-none transition-transform duration-1000 group-hover:rotate-12"
      style={{
        background: 'repeating-conic-gradient(from 0deg at 50% 50%, rgba(245, 158, 11, 0.07) 0deg 8deg, transparent 8deg 24deg)',
      }}
    />

    {/* Halo lumineux doré central */}
    <div className="absolute left-1/2 top-[38%] w-[85%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/20 blur-2xl pointer-events-none transition-opacity duration-500 group-hover:opacity-100 opacity-60" />

    {/* Éventail de 3 cartes 3D */}
    <div className="absolute left-1/2 top-[12%] w-[44%] aspect-[5/7] -translate-x-1/2">
      {/* Carte GAUCHE (Rare / Bleue Néon) */}
      <div
        className="absolute inset-0 rounded-[11px] border border-sky-400/60 transition-all duration-500 origin-bottom-center group-hover:-translate-x-[48%] group-hover:-rotate-[22deg] group-hover:scale-95 -translate-x-[36%] -rotate-[16deg] scale-90"
        style={{
          background: 'linear-gradient(145deg, #0b1528 0%, #060b14 100%)',
          boxShadow: '0 0 20px rgba(56, 189, 248, 0.45), 0 10px 25px rgba(0, 0, 0, 0.8)',
        }}
      >
        <div className="absolute inset-[2px] rounded-[9px] border border-sky-400/20 overflow-hidden p-1.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[7px] font-mono font-bold tracking-widest text-sky-300">RARE</span>
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]" />
          </div>
          <div className="flex flex-col items-center justify-center my-auto opacity-80">
            <Car size={22} className="text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
          </div>
          <div className="text-[6px] font-mono text-neutral-400 truncate">#SUPER-01</div>
        </div>
      </div>

      {/* Carte DROITE (Mythique / Violette Néon) */}
      <div
        className="absolute inset-0 rounded-[11px] border border-fuchsia-400/60 transition-all duration-500 origin-bottom-center group-hover:translate-x-[48%] group-hover:rotate-[22deg] group-hover:scale-95 translate-x-[36%] rotate-[16deg] scale-90"
        style={{
          background: 'linear-gradient(145deg, #240a2c 0%, #100414 100%)',
          boxShadow: '0 0 20px rgba(217, 70, 239, 0.45), 0 10px 25px rgba(0, 0, 0, 0.8)',
        }}
      >
        <div className="absolute inset-[2px] rounded-[9px] border border-fuchsia-400/20 overflow-hidden p-1.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[7px] font-mono font-bold tracking-widest text-fuchsia-300">MYTHIC</span>
            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_6px_#d946ef]" />
          </div>
          <div className="flex flex-col items-center justify-center my-auto opacity-80">
            <Gem size={20} className="text-fuchsia-300 drop-shadow-[0_0_8px_rgba(217,70,239,0.8)]" />
          </div>
          <div className="text-[6px] font-mono text-neutral-400 truncate">#DIAMOND-X</div>
        </div>
      </div>

      {/* Carte CENTRALE (Légendaire Dorée avec Supercar) */}
      <div
        className="absolute inset-0 z-10 rounded-[12px] p-[2px] transition-all duration-500 group-hover:-translate-y-2 group-hover:scale-105"
        style={{
          background: 'linear-gradient(135deg, #fef08a 0%, #f59e0b 35%, #78350f 70%, #fde047 100%)',
          boxShadow: '0 0 25px rgba(245, 158, 11, 0.55), 0 14px 30px rgba(0, 0, 0, 0.9)',
        }}
      >
        <div className="relative w-full h-full rounded-[10px] bg-[#0c0a0e] overflow-hidden flex flex-col justify-between p-1.5">
          {/* Header carte */}
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[8px] font-black tracking-widest text-amber-300 uppercase">PEGASSI</span>
            <span className="flex items-center gap-0.5 text-[7px] font-bold text-amber-200 bg-amber-500/20 border border-amber-400/30 px-1 py-0.2 rounded-full">
              <Sparkles size={7} className="text-amber-300" /> OR
            </span>
          </div>

          {/* Visuel Supercar */}
          <div className="relative my-0.5 flex-1 rounded-[6px] overflow-hidden border border-amber-400/30 bg-neutral-950">
            <img
              src="/podium_supercar.jpg"
              alt="Supercar"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/20" />
            <div className="absolute bottom-0.5 left-1 right-1 flex items-center justify-between text-[6.5px] font-mono font-bold text-white">
              <span className="truncate">TEZERACT</span>
              <span className="text-amber-300">$2.8M</span>
            </div>
          </div>

          {/* Footer carte */}
          <div className="flex items-center justify-between px-0.5 text-[6.5px] font-mono text-neutral-400">
            <span className="tracking-wider">THE DIAMOND</span>
            <span className="text-amber-400/80 font-bold">★★★★★</span>
          </div>

          {/* Reflet holographique animé au survol */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
            style={{
              background: 'linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.4) 45%, rgba(245,158,11,0.3) 55%, transparent 75%)',
            }}
          />
        </div>
      </div>
    </div>

    {/* Section Titre & Badge en bas */}
    <div className="absolute inset-x-0 bottom-[6%] flex flex-col items-center text-center px-2">
      <div className="flex items-center gap-1 text-[9px] font-mono tracking-[0.25em] text-amber-300/90 font-bold uppercase mb-0.5">
        <Sparkles size={10} className="text-amber-400" />
        CARTES VÉHICULES
      </div>
      <div
        className="font-['Oswald'] text-[clamp(24px,2.8vw,34px)] font-bold tracking-[0.06em] leading-none uppercase"
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #fff1c2 35%, #f5c24a 70%, #b77a10 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextStroke: '1px rgba(0,0,0,0.8)',
          filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 16px rgba(245, 158, 11, 0.4))',
        }}
      >
        BOOSTERS
      </div>
    </div>
  </div>
);

const WheelCover: React.FC = () => {
  const { segments } = useCasinoAdmin();
  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,#5a2a8a,#24104a_55%,#07030f)]">
      <div
        className="dh-rays absolute left-1/2 top-[42%] w-[260%] aspect-square -translate-x-1/2 -translate-y-1/2 opacity-70"
        style={{ background: 'repeating-conic-gradient(rgba(255,233,138,0.1) 0deg 8deg, transparent 8deg 20deg)' }}
      />
      <div className="absolute inset-x-0 top-0 h-[7%] flex items-center justify-around px-1 bg-[linear-gradient(180deg,#5a2a8a,#2a1048)] border-b-[3px] border-[#140c22]">
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className="wf-marquee w-[6px] h-[6px] rounded-full border border-[#140c22]"
            style={{ background: i % 2 ? '#fff4b0' : '#ffffff', animationDelay: `${(i % 2) * 0.45}s` }}
          />
        ))}
      </div>
      <div className="absolute left-1/2 top-[15%] w-[74%] -translate-x-1/2 transition-transform duration-700 group-hover:rotate-[30deg]">
        <Wheel segments={segments} className="w-full drop-shadow-[0_10px_18px_rgba(0,0,0,0.7)]" />
      </div>
      <div
        className="absolute inset-x-0 bottom-[5%] text-center font-['Luckiest_Guy'] text-[clamp(18px,2.1vw,27px)] leading-[0.95]"
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #fff4b0 40%, #ffd84a 70%, #d48a0c 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextStroke: '1.5px #140c22',
          filter: 'drop-shadow(0 3px 0 #140c22)',
        }}
      >
        ROUE DE LA FORTUNE
      </div>
    </div>
  );
};

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
    rtp: formatRtp(SLOT_RTP.doghouse),
    cover: <DogHouseCover />,
  },
  {
    id: 'wanted',
    title: 'Wanted Dead or a Wild',
    provider: 'Diamond Slots',
    category: 'slots',
    link: '/wanted',
    tag: 'NOUVEAU',
    rtp: formatRtp(SLOT_RTP.wanted),
    cover: <WantedCover />,
  },
  {
    id: 'mines',
    title: 'Mines',
    provider: 'Diamond Originals',
    category: 'originals',
    link: '/mines',
    tag: 'POPULAIRE',
    cover: <MinesCover />,
  },
  {
    id: 'wheel',
    title: 'Roue de la Fortune',
    provider: 'Diamond Originals',
    category: 'rewards',
    link: '/roue-de-la-fortune',
    tag: 'ILLIMITÉ',
    cover: <WheelCover />,
  },
  {
    id: 'boosters',
    title: 'Boosters Véhicules',
    provider: 'Diamond Originals',
    category: 'rewards',
    link: '/boosters',
    tag: 'NOUVEAU',
    cover: <BoostersCover />,
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
  { id: 'slots', label: 'Machines à sous', icon: <Dices size={15} /> },
  { id: 'originals', label: 'Originals', icon: <Gem size={15} /> },
  { id: 'rewards', label: 'Récompenses', icon: <Disc size={15} /> },
];

const MACHINE_IDS = ['doghouse', 'wanted', 'mines', 'wheel', 'boosters'] as const;
const isMachine = (id: string): id is keyof GamesConfig => (MACHINE_IDS as readonly string[]).includes(id);

/** Carte d'une machine : suit en temps réel son ouverture / fermeture par la direction */
const MachineTile: React.FC<{ game: GameTile & { id: keyof GamesConfig }; index: number }> = ({ game, index }) => {
  const closed = useMachineClosed(game.id);
  const { gamesConfig } = useCasinoAdmin();
  // Le RTP de Mines se règle dans la console : on affiche la valeur en vigueur
  const shown = game.id === 'mines' ? { ...game, rtp: formatRtp(gamesConfig.mines.rtp) } : game;
  return <Tile game={shown} index={index} closed={closed} />;
};

const Tile: React.FC<{ game: GameTile; index: number; closed?: ReturnType<typeof useMachineClosed> }> = ({ game, index, closed = null }) => {
  const available = !!game.link;
  const card = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`group relative ${available ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div
        className={`relative aspect-[3/4] overflow-hidden rounded-xl bg-neutral-900 border border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-all duration-200 ${
          available ? 'group-hover:-translate-y-1.5 group-hover:border-white/30' : ''
        }`}
      >
        {game.cover}
        {closed ? (
          <span className="absolute top-2 left-2 z-20 rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
            {closed === 'maintenance' ? 'MAINTENANCE' : 'FERMÉE'}
          </span>
        ) : (
          game.tag && (
            <span className="absolute top-2 left-2 z-10 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-extrabold text-black">
              {game.tag}
            </span>
          )
        )}
        {available && closed ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-black/65 backdrop-blur-[2px]">
            <Lock size={20} className="text-rose-300" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-200">
              {closed === 'maintenance' ? 'Maintenance' : 'Fermée'}
            </span>
            {game.id !== 'wheel' && <span className="text-[10px] text-white/60">Démo disponible</span>}
          </div>
        ) : available ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 opacity-0 transition-all group-hover:opacity-100 backdrop-blur-[2px]">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-[0_0_25px_rgba(255,255,255,0.6)]">
              <Play size={24} fill="currentColor" className="ml-1" />
            </span>
          </div>
        ) : (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-black/60 backdrop-blur-[2px]">
            <Lock size={20} className="text-white/70" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">Bientôt</span>
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <div className="truncate text-sm font-bold text-white">{game.title}</div>
        <div className="flex items-center justify-between text-[11px] text-neutral-400">
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

/** Rangée défilante horizontalement, avec flèches et « Voir tout » */
const GameRow: React.FC<{
  title: string;
  icon: React.ReactNode;
  games: GameTile[];
  onSeeAll?: () => void;
}> = ({ title, icon, games, onSeeAll }) => {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  if (games.length === 0) return null;
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base sm:text-lg font-bold text-white">
          <span className="text-neutral-200">{icon}</span>
          {title}
        </h3>
        <div className="flex items-center gap-1.5">
          {onSeeAll && (
            <button
              onClick={onSeeAll}
              className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              Voir tout
            </button>
          )}
          <button
            onClick={() => scroll(-1)}
            aria-label="Précédent"
            className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => scroll(1)}
            aria-label="Suivant"
            className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div ref={ref} className="-mx-1 flex gap-3 overflow-x-auto px-1 pt-2 pb-1 snap-x [scrollbar-width:none]">
        {games.map((g, i) => (
          <div key={g.id} className="w-[132px] sm:w-[160px] xl:w-[172px] shrink-0 snap-start">
            {isMachine(g.id) ? <MachineTile game={{ ...g, id: g.id }} index={i} /> : <Tile game={g} index={i} />}
          </div>
        ))}
      </div>
    </section>
  );
};

/** Carte promo sous la bannière (façon « Lucky Wheel / Bonus / Sport ») */
const PromoCard: React.FC<{
  to: string;
  title: string;
  subtitle: string;
  cta: string;
  icon: React.ReactNode;
  art: React.ReactNode;
  className: string;
}> = ({ to, title, subtitle, cta, icon, art, className }) => (
  <Link
    to={to}
    className={`group relative flex min-h-[132px] overflow-hidden rounded-2xl border border-white/10 p-4 shadow-lg shadow-black/40 transition-transform hover:-translate-y-0.5 ${className}`}
  >
    <div className="pointer-events-none absolute -right-5 -bottom-7 w-[50%] max-w-[160px] aspect-square transition-transform duration-500 group-hover:scale-105 group-hover:-rotate-3">
      {art}
    </div>
    <div className="relative z-10 flex flex-col">
      <div className="flex items-center gap-1.5 text-sm font-extrabold uppercase tracking-wide text-white">
        {icon}
        {title}
      </div>
      <p className="mt-1 max-w-[62%] text-xs text-white/70">{subtitle}</p>
      <span className="mt-auto pt-3">
        <span className="inline-block rounded-md bg-white px-3 py-1.5 text-[11px] font-extrabold uppercase text-black group-hover:bg-neutral-200 transition-colors">
          {cta}
        </span>
      </span>
    </div>
  </Link>
);

const PROVIDERS = [
  { name: 'Diamond Slots', icon: <Dices size={18} />, category: 'slots' as const },
  { name: 'Diamond Originals', icon: <Gem size={18} />, category: 'originals' as const },
  { name: 'Diamond Rewards', icon: <Disc size={18} />, category: 'rewards' as const },
];

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Fil des derniers gains de la roue (colonne de droite sur grand écran) */
const WinsFeed: React.FC = () => {
  const [wins, setWins] = useState<WheelWin[] | null>(null);
  useEffect(() => {
    let alive = true;
    apiRecentWheelWins(10)
      .then((w) => alive && setWins(w))
      .catch(() => alive && setWins([]));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-950/80 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-bold text-white">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Derniers gains
        </span>
        <Link to="/roue-de-la-fortune" className="text-[11px] font-semibold text-neutral-400 hover:text-white">
          Roue
        </Link>
      </div>
      <ul className="divide-y divide-white/5">
        {wins === null ? (
          Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="px-4 py-3">
              <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
              <div className="mt-2 h-3 w-36 animate-pulse rounded bg-white/5" />
            </li>
          ))
        ) : wins.length === 0 ? (
          <li className="px-4 py-8 text-center text-xs text-neutral-500">Aucun gain récent.</li>
        ) : (
          wins.map((w, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-neutral-200">
                <Trophy size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-bold text-white">{w.winner}</span>
                  <span className="shrink-0 text-[10px] text-neutral-500">{formatTime(w.won_at)}</span>
                </div>
                <div className="truncate text-[11px] text-neutral-400">
                  a gagné <span className="font-semibold text-neutral-200">{w.prize}</span>
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
};

/** Tableau des dernières parties du joueur connecté */
const MyBets: React.FC<{ profileId: string }> = ({ profileId }) => {
  const [bets, setBets] = useState<SupabaseBetEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    dbFetchBetsHistory(profileId, 8)
      .then((b) => alive && setBets(b))
      .catch(() => alive && setBets([]));
    return () => {
      alive = false;
    };
  }, [profileId]);

  return (
    <section className="mt-10">
      <h3 className="mb-3 flex items-center gap-2 text-base sm:text-lg font-bold text-white">
        <History size={17} className="text-neutral-200" />
        Mes dernières parties
      </h3>
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-neutral-950/80">
        <table className="w-full min-w-[520px] text-left text-xs sm:text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-neutral-500">
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 font-semibold">Jeu</th>
              <th className="px-4 py-3 font-semibold">Heure</th>
              <th className="px-4 py-3 font-semibold text-right">Mise</th>
              <th className="px-4 py-3 font-semibold text-right">Multi.</th>
              <th className="px-4 py-3 font-semibold text-right">Gain</th>
            </tr>
          </thead>
          <tbody>
            {bets === null ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">Chargement…</td>
              </tr>
            ) : bets.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">Aucune partie pour le moment.</td>
              </tr>
            ) : (
              bets.map((b) => {
                const won = b.win_amount > 0;
                const multi = b.multiplier ?? (b.bet_amount > 0 ? b.win_amount / b.bet_amount : 0);
                return (
                  <tr key={b.id} className="border-b border-white/5 last:border-0 odd:bg-white/[0.02]">
                    <td className="px-4 py-2.5 font-semibold text-white">{GAME_LABELS[b.game_id] ?? b.game_id}</td>
                    <td className="px-4 py-2.5 text-neutral-400">{formatTime(b.created_at)}</td>
                    <td className="px-4 py-2.5 text-right font-['Geist_Mono'] text-neutral-300">
                      {b.bet_amount.toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-2.5 text-right font-['Geist_Mono'] text-neutral-400">{multi.toFixed(2)}x</td>
                    <td
                      className={`px-4 py-2.5 text-right font-['Geist_Mono'] font-bold ${won ? 'text-emerald-400' : 'text-neutral-500'}`}
                    >
                      {won ? '+' : ''}
                      {b.win_amount.toLocaleString('fr-FR')}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

/** Menu latéral : catégories + raccourcis (sidebar desktop, tiroir mobile) */
const SideMenu: React.FC<{ category: Category; onCategory: (c: Category) => void }> = ({ category, onCategory }) => (
  <div className="flex flex-col gap-4">
    <div className="rounded-2xl border border-white/10 bg-neutral-950/80 p-2">
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          onClick={() => onCategory(c.id)}
          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
            category === c.id
              ? 'bg-white text-black'
              : 'text-neutral-400 hover:bg-white/5 hover:text-white'
          }`}
        >
          {c.icon}
          {c.label}
        </button>
      ))}
    </div>
    <div className="rounded-2xl border border-white/10 bg-neutral-950/80 p-2">
      {[
        { to: '/roue-de-la-fortune', label: 'Roue de la Fortune', icon: <Disc size={15} /> },
        { to: '/abonnements', label: 'Club VIP', icon: <Crown size={15} /> },
        { to: '/espace-membre', label: 'Espace membre', icon: <User size={15} /> },
      ].map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-400 hover:bg-white/5 hover:text-white transition-colors"
        >
          {l.icon}
          {l.label}
        </Link>
      ))}
    </div>
    <Link
      to="/abonnements"
      className="group relative overflow-hidden rounded-2xl border border-white/20 bg-[radial-gradient(ellipse_at_80%_20%,#3a3a3a_0%,#161616_50%,#050505_100%)] p-4"
    >
      <Crown size={40} strokeWidth={1.6} className="absolute right-4 bottom-4 rotate-12 text-white/80 drop-shadow-[0_0_12px_rgba(255,255,255,0.35)] transition-transform group-hover:rotate-6" />
      <div className="relative text-sm font-extrabold leading-tight text-white">
        Passez VIP,
        <br />
        recevez des jetons offerts.
      </div>
      <span className="relative mt-3 inline-block rounded-md bg-white px-2.5 py-1 text-[11px] font-extrabold uppercase text-black">
        Découvrir
      </span>
    </Link>
    <a
      href="https://discord.gg/patvwjhNzK"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#5865F2]/15 px-3 py-3 text-sm font-bold text-[#c7cbff] hover:bg-[#5865F2]/25 transition-colors"
    >
      <MessageCircle size={16} /> Rejoindre le Discord
    </a>
  </div>
);

export const GamesHub: React.FC = () => {
  const { user, isAuthenticated } = useCasinoUser();
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GAMES.filter(
      (g) => (category === 'all' || g.category === category) && (!q || g.title.toLowerCase().includes(q)),
    );
  }, [category, query]);

  // Vue « lobby » en rangées tant qu'aucun filtre n'est actif, sinon grille
  const lobby = category === 'all' && !query.trim();
  const available = GAMES.filter((g) => g.link);
  const soon = GAMES.filter((g) => !g.link);

  const pickCategory = (c: Category) => {
    setCategory(c);
    setMenuOpen(false);
    document.getElementById('catalogue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-black pt-[80px] sm:pt-[90px] text-white selection:bg-white/30 selection:text-white">
      {/* Halo d'ambiance */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.10),transparent_70%)]" />

      <div className="relative mx-auto flex max-w-[1600px] gap-6 px-4 sm:px-6 lg:px-6 py-6">
        {/* Sidebar */}
        <aside className="hidden lg:block w-[220px] shrink-0">
          <div className="sticky top-[110px] max-h-[calc(100vh-130px)] overflow-y-auto [scrollbar-width:none]">
            <SideMenu category={category} onCategory={pickCategory} />
          </div>
        </aside>

        {/* Colonne principale */}
        <main className="min-w-0 flex-1">
          {/* Solde */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-neutral-950/80 border border-white/10 px-4 py-3 backdrop-blur-md">
            {isAuthenticated && user ? (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover border border-white/20" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-white">
                      {user.rpFirstName} {user.rpLastName}
                    </div>
                    <div className="text-[11px] text-neutral-400">ID {user.citizenId}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-lg bg-neutral-900 border border-white/10 px-3 py-2">
                    <Coins size={16} className="text-white" />
                    <span className="font-['Geist_Mono'] text-sm font-bold text-white">{user.chips.toLocaleString('fr-FR')}</span>
                  </div>
                  <Link
                    to="/espace-membre"
                    className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-black hover:bg-neutral-200 transition-colors"
                  >
                    Portefeuille
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-neutral-400">
                  <span className="font-bold text-white">Mode démo disponible.</span> Connectez-vous pour jouer avec vos jetons.
                </div>
                <Link
                  to="/espace-membre"
                  className="flex items-center gap-1 rounded-lg bg-white px-4 py-2 text-sm font-bold text-black hover:bg-neutral-200 transition-colors"
                >
                  Connexion <ChevronRight size={15} />
                </Link>
              </>
            )}
          </div>

          {/* Bannière */}
          <Link
            to="/slots"
            className="group relative block overflow-hidden rounded-2xl min-h-[220px] sm:min-h-[260px] bg-[linear-gradient(180deg,#3fa9f5_0%,#8fd3ff_62%,#7ed957_62%,#2d7d27_100%)] shadow-lg shadow-black/50"
          >
            <div className="absolute right-4 sm:right-8 md:right-12 bottom-3 sm:bottom-4 h-[75%] sm:h-[82%] max-h-[210px] flex items-end gap-2 sm:gap-3 pointer-events-none">
              <div className="w-[70px] sm:w-[85px] aspect-square -rotate-6 hidden lg:block shrink-0 mb-1 drop-shadow-md">
                <DogSymbol id="rottweiler" />
              </div>
              <div className="h-full aspect-square shrink-0 transition-transform duration-300 group-hover:scale-105 origin-bottom-right drop-shadow-lg">
                <DogSymbol id="wild" multiplier={3} />
              </div>
            </div>
            <div className="relative z-10 flex h-full max-w-[62%] sm:max-w-[52%] flex-col justify-center p-5 sm:p-8">
              <span className="mb-2 w-fit rounded-md bg-[#3b1d0e] px-2 py-0.5 text-[11px] font-extrabold text-white">
                NOUVELLE MACHINE
              </span>
              <h2 className="dh-font-xl text-3xl sm:text-5xl leading-none text-[#ffb300] [-webkit-text-stroke:2px_#3b1d0e] drop-shadow-[0_4px_0_#3b1d0e]">
                THE DOG HOUSE
              </h2>
              <p className="mt-3 text-sm font-semibold text-[#1b2a3a] max-w-sm">
                Wilds x2 et x3 additionnés, jusqu'à 27 tours gratuits avec wilds collants. Gain max 6 750x.
              </p>
              <span className="mt-4 flex w-fit items-center gap-2 rounded-lg bg-[#3b1d0e] px-5 py-2.5 text-sm font-bold text-white group-hover:bg-[#5a2c10] transition-colors shadow-md">
                <Play size={15} fill="currentColor" /> Jouer maintenant
              </span>
            </div>
          </Link>

          {/* Cartes promo */}
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            <PromoCard
              to="/roue-de-la-fortune"
              title="Roue"
              subtitle="Tentez votre chance, lots et véhicules à gagner."
              cta="Tourner"
              icon={<Disc size={15} />}
              className="bg-[radial-gradient(ellipse_at_80%_80%,#3a3a3a,#181818_60%,#050505)]"
              art={<WheelArt />}
            />
            <PromoCard
              to="/abonnements"
              title="Bonus VIP"
              subtitle="Jetons offerts à l'activation de votre carte."
              cta="Réclamer"
              icon={<Gift size={15} />}
              className="bg-[radial-gradient(ellipse_at_80%_80%,#4a4a4a,#1c1c1c_55%,#050505)]"
              art={<div className="h-full w-full pr-6 pb-8"><Crown className="h-full w-full rotate-12 text-white drop-shadow-[0_0_24px_rgba(255,255,255,0.45)]" strokeWidth={1.4} /></div>}
            />
            <PromoCard
              to="/mines"
              title="Mines"
              subtitle="Évitez les bombes, encaissez quand vous voulez."
              cta="Jouer"
              icon={<Bomb size={15} />}
              className="col-span-2 md:col-span-1 bg-[radial-gradient(ellipse_at_80%_80%,#2e2e2e,#141414_60%,#050505)]"
              art={<div className="h-full w-full pr-6 pb-8"><GemArt className="h-full w-full drop-shadow-[0_0_24px_rgba(94,232,255,0.6)]" /></div>}
            />
          </div>

          {/* Recherche + catégories */}
          <div id="catalogue" className="mt-8 scroll-mt-[110px] flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un jeu"
                className="w-full rounded-full border border-white/10 bg-neutral-950/80 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-neutral-500 outline-none transition-colors focus:border-white/30 backdrop-blur-sm"
              />
            </label>
            <div className="flex gap-1 overflow-x-auto rounded-full bg-neutral-950/80 border border-white/10 p-1 [scrollbar-width:none] backdrop-blur-sm lg:hidden">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    category === c.id ? 'bg-white text-black' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                  }`}
                >
                  {c.icon}
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {lobby ? (
            <>
              <GameRow title="À la une" icon={<Star size={17} />} games={available} />
              <GameRow
                title="Machines à sous"
                icon={<Dices size={17} />}
                games={GAMES.filter((g) => g.category === 'slots')}
                onSeeAll={() => setCategory('slots')}
              />
              <GameRow
                title="Diamond Originals"
                icon={<Gem size={17} />}
                games={GAMES.filter((g) => g.category === 'originals' && g.link)}
                onSeeAll={() => setCategory('originals')}
              />
              <GameRow title="Bientôt disponibles" icon={<Lock size={17} />} games={soon} />
            </>
          ) : (
            <>
              <div className="mt-6 mb-3 flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">{CATEGORIES.find((c) => c.id === category)?.label}</h3>
                <span className="text-sm text-neutral-400">({filtered.length})</span>
                <button
                  onClick={() => {
                    setCategory('all');
                    setQuery('');
                  }}
                  className="ml-auto text-xs font-semibold text-neutral-400 hover:text-white"
                >
                  Retour au lobby
                </button>
              </div>
              {filtered.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 2xl:grid-cols-6">
                  {filtered.map((g, i) =>
                    isMachine(g.id) ? <MachineTile key={g.id} game={{ ...g, id: g.id }} index={i} /> : <Tile key={g.id} game={g} index={i} />,
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-neutral-950/80 border border-white/10 py-12 text-center text-sm text-neutral-400">
                  Aucun jeu ne correspond à « {query} ».
                </div>
              )}
            </>
          )}

          {/* Studios */}
          <section className="mt-10">
            <h3 className="mb-3 flex items-center gap-2 text-base sm:text-lg font-bold text-white">
              Studios
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {PROVIDERS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => pickCategory(p.category)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-neutral-950/80 px-4 py-4 text-sm font-extrabold uppercase tracking-widest text-neutral-300 hover:border-white/40 hover:text-white transition-colors"
                >
                  <span className="text-neutral-200">{p.icon}</span>
                  {p.name}
                </button>
              ))}
            </div>
          </section>

          {isAuthenticated && user && <MyBets profileId={user.id} />}

          {/* Fil des gains en bas sur écran moyen (colonne droite sur grand écran) */}
          <div className="mt-10 xl:hidden">
            <WinsFeed />
          </div>

          {/* Garanties */}
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              { icon: <ShieldCheck size={18} />, t: 'Résultats équitables', d: 'Chaque tirage est aléatoire et vérifiable.' },
              { icon: <Coins size={18} />, t: 'Jetons instantanés', d: 'Vos gains sont crédités à la fin de chaque partie.' },
              { icon: <Play size={18} />, t: 'Mode démo', d: 'Essayez les jeux sans miser vos jetons.' },
            ].map((f) => (
              <div key={f.t} className="flex items-start gap-3 rounded-xl bg-neutral-950/80 border border-white/10 p-4">
                <span className="mt-0.5 text-white">{f.icon}</span>
                <div>
                  <div className="text-sm font-bold text-white">{f.t}</div>
                  <div className="text-xs text-neutral-400">{f.d}</div>
                </div>
              </div>
            ))}
          </div>
        </main>

        {/* Colonne droite */}
        <aside className="hidden xl:block w-[280px] shrink-0">
          <div className="sticky top-[110px]">
            <WinsFeed />
          </div>
        </aside>
      </div>

      {/* Tiroir catégories (mobile) */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="menu-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          />
        )}
        {menuOpen && (
          <motion.div
            key="menu-drawer"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed inset-y-0 left-0 z-50 w-[270px] overflow-y-auto border-r border-white/10 bg-neutral-950 p-4 pb-24 lg:hidden"
          >
            <SideMenu category={category} onCategory={pickCategory} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barre de navigation mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-white/10 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <button onClick={() => setMenuOpen((o) => !o)} className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold text-neutral-400">
          <Menu size={19} /> Menu
        </button>
        <button onClick={() => pickCategory('slots')} className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold text-neutral-400">
          <Dices size={19} /> Slots
        </button>
        <button
          onClick={() => {
            setCategory('all');
            setQuery('');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold text-white"
        >
          <Home size={19} /> Lobby
        </button>
        <Link to="/roue-de-la-fortune" className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold text-neutral-400">
          <Disc size={19} /> Roue
        </Link>
        <Link to="/espace-membre" className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold text-neutral-400">
          <User size={19} /> Compte
        </Link>
      </nav>
    </div>
  );
};

/** Mini roue décorative pour la carte promo */
const WheelArt: React.FC = () => {
  const { segments } = useCasinoAdmin();
  return <Wheel segments={segments} className="h-full w-full drop-shadow-[0_8px_16px_rgba(0,0,0,0.7)]" />;
};
