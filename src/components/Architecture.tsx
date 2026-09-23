import React from 'react';
import { motion } from 'framer-motion';
import { fadeUp } from '../constants/animations';

export const Architecture: React.FC = () => {
  return (
    <section id="benefits" className="py-28 sm:py-36 px-6 max-w-6xl mx-auto border-t border-white/10">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
        <div>
          <span className="text-xs font-['Geist_Mono'] tracking-[3px] uppercase text-neutral-400 block mb-2">
            CORE SYSTEM ARCHITECTURE
          </span>
          <h2 className="text-4xl sm:text-6xl font-semibold text-white tracking-[-0.03em]">
            The substrate for <span className="font-['Instrument_Serif'] font-normal italic">meaningful</span> depth
          </h2>
        </div>
        <div className="font-['Geist_Mono'] text-xs text-neutral-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white" />
          DIAMOND CLUB VIP // LEVEL 5
        </div>
      </div>

      {/* Wide 3:1 aspect ratio filmic video */}
      <div className="rounded-2xl overflow-hidden aspect-[3/1] w-full mb-16 border border-white/15">
        <video
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260325_125119_8e5ae31c-0021-4396-bc08-f7aebeb877a2.mp4"
          className="w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
        />
      </div>

      {/* 4 Feature Columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
        {[
          {
            num: "01",
            title: "Curated Neural Feed",
            desc: "Hand-picked intelligence streams engineered for high signal-to-noise ratio without algorithmic traps."
          },
          {
            num: "02",
            title: "Immaculate Typography",
            desc: "Precision optical kerning, instrument serif rhythm, and liquid glass HUD components built for clarity."
          },
          {
            num: "03",
            title: "Encrypted Syndication",
            desc: "Zero-knowledge cryptographic distribution directly feeding verified AI agents and citations."
          },
          {
            num: "04",
            title: "Autonomous 404 Recovery",
            desc: "Dynamic failover states with embedded cinematic backups ensuring continuity across all endpoints."
          },
        ].map((item, idx) => (
          <motion.div key={item.title} {...fadeUp(0.1 * idx)} className="flex flex-col border-l border-white/10 pl-5">
            <span className="font-['Geist_Mono'] text-xs text-neutral-500 mb-2">{item.num}</span>
            <h3 className="font-semibold text-lg text-white mb-2">{item.title}</h3>
            <p className="text-neutral-400 text-sm leading-relaxed">{item.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
