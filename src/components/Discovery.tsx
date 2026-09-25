import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Disc, Bomb, Crown } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { fadeUp } from '../constants/animations';

export const Discovery: React.FC = () => {
  return (
    <section id="resources" className="bg-black pt-24 sm:pt-36 pb-20 px-6 max-w-6xl mx-auto">
      <div className="text-center max-w-3xl mx-auto mb-20">
        <motion.span
          {...fadeUp(0.05)}
          className="text-xs font-['Geist_Mono'] tracking-[4px] uppercase text-neutral-400 block mb-3"
        >
          DIVERTISSEMENT &amp; PRESTIGE
        </motion.span>
        <motion.h2
          {...fadeUp(0.1)}
          className="text-4xl sm:text-6xl lg:text-7xl font-semibold text-white tracking-[-0.03em] mb-6"
        >
          L'art du jeu à son <span className="font-['Instrument_Serif'] font-normal italic text-white">apogée.</span>
        </motion.h2>
        <motion.p
          {...fadeUp(0.15)}
          className="text-neutral-400 text-base sm:text-lg leading-relaxed"
        >
          Des sensations authentiques, des croupiers expérimentés et des jackpots d'envergure chaque soir au cœur de Vinewood Los Santos.
        </motion.p>
      </div>

      {/* 3 Casino Attraction Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        {/* Card 1: Jeu des Mines VIP */}
        <Link
          to="/mines"
          className="liquid-glass rounded-2xl p-8 flex flex-col items-center text-center group hover:bg-white/[0.06] hover:border-white/30 transition-all duration-300 block"
        >
          <div className="w-24 h-24 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] transition-all duration-300 text-white">
            <Bomb size={38} />
          </div>
          <div className="flex items-center gap-1.5 mb-2">
            <h3 className="font-bold text-xl text-white group-hover:text-neutral-200 transition-colors">Jeu des Mines VIP</h3>
            <ArrowUpRight size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-neutral-400 text-sm leading-relaxed mb-4">
            Déminez la grille 5x5, révélez les diamants cachés et encaissez au bon moment. RTP 98.5% certifié.
          </p>
          <span className="font-['Geist_Mono'] text-xs text-neutral-400 tracking-wider uppercase mt-auto">
            JEU 01 // DÉMINEUR CASINO ➔
          </span>
        </Link>

        {/* Card 2: Roue de la fortune */}
        <Link
          to="/roue-de-la-fortune"
          className="liquid-glass rounded-2xl p-8 flex flex-col items-center text-center group hover:bg-white/[0.06] hover:border-white/30 transition-all duration-300 block"
        >
          <div className="w-24 h-24 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] transition-all duration-300 text-white">
            <Disc size={38} />
          </div>
          <div className="flex items-center gap-1.5 mb-2">
            <h3 className="font-bold text-xl text-white group-hover:text-neutral-200 transition-colors">Roue de la Fortune</h3>
            <ArrowUpRight size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-neutral-400 text-sm leading-relaxed mb-4">
            1 tirage quotidien gratuit offert à chaque citoyen. Remportez la Supercar exposée sur le podium central.
          </p>
          <span className="font-['Geist_Mono'] text-xs text-neutral-400 tracking-wider uppercase mt-auto">
            LOT 02 // VÉHICULE PODIUM ➔
          </span>
        </Link>

        {/* Card 3: Penthouse & Prestige */}
        <motion.div
          {...fadeUp(0.4)}
          className="liquid-glass rounded-2xl p-8 flex flex-col items-center text-center group hover:bg-white/[0.04] transition-colors"
        >
          <div className="w-24 h-24 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 text-white">
            <Crown size={38} />
          </div>
          <h3 className="font-bold text-xl text-white mb-2">Penthouse &amp; Rooftop</h3>
          <p className="text-neutral-400 text-sm leading-relaxed mb-4">
            Héliport réservé, champagne grand cru, piscine à débordement et vue panoramique imprenable sur Los Santos.
          </p>
          <span className="font-['Geist_Mono'] text-xs text-neutral-400 tracking-wider uppercase mt-auto">
            SUITE 03 // ROOFTOP VIP
          </span>
        </motion.div>
      </div>

      <div className="p-6 rounded-xl border border-white/15 bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <span className="text-neutral-300 font-['Geist_Mono'] text-sm">
          💎 STATUT : Salons de jeux et tables VIP ouverts 24/7 pour l'ensemble des citoyens.
        </span>
        <Link
          to="/abonnements"
          className="text-xs uppercase tracking-widest font-bold text-white hover:underline flex items-center gap-1 shrink-0"
        >
          Découvrir les cartes VIP <ArrowUpRight size={14} />
        </Link>
      </div>
    </section>
  );
};
