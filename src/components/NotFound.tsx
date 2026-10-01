import React from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Disc } from 'lucide-react';
import { Link } from '@tanstack/react-router';

interface NotFoundProps {
  onReturn?: () => void;
}

export const NotFound: React.FC<NotFoundProps> = ({ onReturn }) => {
  return (
    <motion.main
      key="404-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="relative w-full min-h-screen bg-black overflow-x-hidden font-['Geist_Mono'] flex items-center justify-center pt-20"
    >
      {/* Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover opacity-80 z-0 pointer-events-none"
        src="/hero_diamants.mp4"
      />

      {/* Dark vignette overlay */}
      <div className="absolute inset-0 bg-black/50 z-[1] pointer-events-none" />

      {/* Centered 404 Block */}
      <section className="relative z-10 flex flex-col items-center text-center max-w-[500px] px-6 gap-6 sm:gap-8">
        <h1
          className="m-0 p-0 leading-[1.0] font-bold text-center select-none text-transparent bg-clip-text text-[clamp(130px,36vw,220px)] tracking-[-0.08em]"
          style={{
            backgroundImage: `linear-gradient(247deg, rgb(255, 255, 255) 5%, rgba(255, 255, 255, 0.35) 95%)`
          }}
        >
          404
        </h1>

        <div className="w-full sm:w-[420px] h-[1px] bg-white/40 shrink-0" />

        <p className="m-0 text-white font-semibold text-center leading-snug text-lg sm:text-2xl tracking-tight">
          The path may be broken, but the journey isn't. Let's get you back.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mt-4 w-full justify-center">
          <Link
            to="/"
            onClick={onReturn}
            className="bg-white text-black font-semibold px-8 py-3.5 rounded-full hover:bg-neutral-200 transition-colors uppercase tracking-wider text-xs flex items-center justify-center gap-2"
          >
            <RefreshCw size={14} /> Return to Landing
          </Link>
          <Link
            to="/roue-de-la-fortune"
            onClick={onReturn}
            className="liquid-glass px-8 py-3.5 rounded-full text-white text-xs font-semibold uppercase tracking-wider hover:bg-white/10 transition-colors text-center flex items-center justify-center gap-2"
          >
            <Disc size={14} /> Explore Features
          </Link>
        </div>
      </section>
    </motion.main>
  );
};
