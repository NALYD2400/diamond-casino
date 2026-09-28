import React from 'react';
import { motion } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import { Disc, User } from 'lucide-react';
import { fadeUp } from '../constants/animations';

export const Hero: React.FC = () => {
  return (
    <section id="home" className="relative w-full h-[100svh] flex flex-col justify-between items-center overflow-hidden pt-28 pb-10 sm:pb-14">
      {/* Background: vidéo animée de diamants */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <video
          src="/hero_diamants.mp4"
          className="w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
        />
      </div>

      {/* Gradient Masking for smooth blend to black at the bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-48 sm:h-72 bg-gradient-to-t from-black via-black/70 to-transparent z-[1] pointer-events-none" />

      {/* Logo par-dessus la vidéo */}
      <div className="relative z-10 flex-1 flex items-center justify-center w-full px-6">
        <motion.h1 {...fadeUp(0.1)} className="m-0">
          <img
            src="/hero_logo.png"
            alt="The Diamond Casino & Resort"
            className="w-[85vw] max-w-[640px] h-auto drop-shadow-[0_0_30px_rgba(0,0,0,0.6)]"
          />
        </motion.h1>
      </div>

      {/* Quick CTA Action Buttons placés sous 'CASINO & RESORT' */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-5xl mb-6 sm:mb-10">
        <motion.div
          {...fadeUp(0.25)}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <Link
            to="/roue-de-la-fortune"
            className="bg-white hover:bg-neutral-200 text-black font-bold text-xs sm:text-sm tracking-wider uppercase rounded-full px-7 sm:px-9 py-4 transition-transform duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.35)] cursor-pointer"
          >
            <Disc size={17} />
            Tourner la Roue de la Fortune
          </Link>

          <Link
            to="/espace-membre"
            className="liquid-glass border border-white/20 hover:bg-white/10 text-white font-semibold text-xs sm:text-sm tracking-wide rounded-full px-7 sm:px-8 py-4 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.1)]"
          >
            <User size={16} />
            Espace Membre
          </Link>
        </motion.div>
      </div>
    </section>
  );
};
