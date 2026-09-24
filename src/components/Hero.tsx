import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import { Disc, User, Sparkles } from 'lucide-react';
import { fadeUp } from '../constants/animations';

interface HeroProps {
  onNavigateToWheel?: () => void;
  onNavigateToMemberPortal?: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onNavigateToWheel, onNavigateToMemberPortal }) => {
  const [emailInput, setEmailInput] = useState<string>('');
  const [subscribed, setSubscribed] = useState<boolean>(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    setSubscribed(true);
    setTimeout(() => {
      setEmailInput('');
      setSubscribed(false);
    }, 4000);
  };

  return (
    <section id="home" className="relative w-full min-h-[100svh] flex flex-col justify-center items-center overflow-hidden pt-28 pb-16">
      {/* Background Video */}
      <video
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260325_120549_0cd82c36-56b3-4dd9-b190-069cfc3a623f.mp4"
        className="absolute inset-0 w-full h-full object-cover z-0 opacity-80"
        autoPlay
        loop
        muted
        playsInline
      />

      {/* Gradient Masking for smooth blend to black */}
      <div className="absolute bottom-0 left-0 right-0 h-48 sm:h-72 bg-gradient-to-t from-black via-black/70 to-transparent z-[1] pointer-events-none" />

      {/* Hero Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-5xl">


        {/* Hero Title with Instrument Serif accent */}
        <motion.h1
          {...fadeUp(0.2)}
          className="text-5xl sm:text-7xl lg:text-8xl xl:text-9xl text-white tracking-tight leading-tight mb-6 font-['Instrument_Serif'] font-normal"
        >
          The <em className="italic text-amber-400 font-normal">Diamond</em> Casino
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          {...fadeUp(0.3)}
          className="text-base sm:text-xl text-neutral-300 max-w-2xl leading-relaxed mb-8 font-normal"
        >
          Plongez au cœur du luxe de Los Santos. Jeux de table exclusifs, salons VIP de grand prestige et Roue de la Fortune quotidienne pour tous les citoyens.
        </motion.p>

        {/* Quick CTA Action Buttons */}
        <motion.div
          {...fadeUp(0.35)}
          className="flex flex-wrap items-center justify-center gap-4 mb-10"
        >
          <Link
            to="/roue-de-la-fortune"
            onClick={() => onNavigateToWheel?.()}
            className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs sm:text-sm tracking-wider uppercase rounded-full px-7 sm:px-9 py-4 transition-transform duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 shadow-[0_0_30px_rgba(245,158,11,0.35)] cursor-pointer"
          >
            <Disc size={17} />
            Tourner la Roue de la Fortune
          </Link>

          <Link
            to="/espace-membre"
            onClick={() => onNavigateToMemberPortal?.()}
            className="liquid-glass border border-white/20 hover:bg-white/10 text-white font-semibold text-xs sm:text-sm tracking-wide rounded-full px-7 sm:px-8 py-4 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.1)]"
          >
            <User size={16} />
            Espace Membre Discord
          </Link>
        </motion.div>

        {/* Email Subscription Bar */}
        <motion.form
          {...fadeUp(0.4)}
          onSubmit={handleSubscribe}
          className="liquid-glass rounded-full p-2 max-w-lg w-full flex items-center justify-between shadow-[0_0_40px_rgba(255,255,255,0.06)]"
        >
          <input
            type="email"
            required
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="Recevoir les alertes événements RP"
            className="bg-transparent border-none outline-none px-6 text-sm sm:text-base text-white placeholder:text-neutral-500 flex-1 font-['Inter_Tight']"
          />
          <button
            type="submit"
            className="bg-white text-black font-bold text-xs tracking-wider uppercase rounded-full px-6 sm:px-8 py-3.5 transition-transform duration-200 hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
          >
            {subscribed ? "ENVOYÉ" : "S'INSCRIRE"}
          </button>
        </motion.form>
      </div>
    </section>
  );
};
