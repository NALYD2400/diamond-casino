import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { fadeUp } from '../constants/animations';

export const Discovery: React.FC = () => {
  return (
    <section id="resources" className="bg-black pt-24 sm:pt-36 pb-20 px-6 max-w-6xl mx-auto">
      <div className="text-center max-w-3xl mx-auto mb-20">
        <motion.span
          {...fadeUp(0.05)}
          className="text-xs font-['Geist_Mono'] tracking-[4px] uppercase text-neutral-400 block mb-3"
        >
          EVOLUTION OF DISCOVERY
        </motion.span>
        <motion.h2
          {...fadeUp(0.1)}
          className="text-4xl sm:text-6xl lg:text-7xl font-semibold text-white tracking-[-0.03em] mb-6"
        >
          Search has <span className="font-['Instrument_Serif'] font-normal italic">changed.</span> Have you?
        </motion.h2>
        <motion.p
          {...fadeUp(0.15)}
          className="text-neutral-400 text-base sm:text-lg leading-relaxed"
        >
          Traditional indexing is fading. Autonomous neural agents now answer queries directly. Be positioned at the heart of synthesis.
        </motion.p>
      </div>

      {/* 3 Engine Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        {/* ChatGPT Card */}
        <motion.div
          {...fadeUp(0.2)}
          className="liquid-glass rounded-2xl p-8 flex flex-col items-center text-center group hover:bg-white/[0.04] transition-colors"
        >
          <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
            <svg viewBox="0 0 24 24" className="w-12 h-12 fill-white" aria-label="ChatGPT">
              <path d="M12 2a10 10 0 0 0-3.16 19.49 1 1 0 0 0 1.16-.76l.32-1.42a1 1 0 0 0-.74-1.2A6.5 6.5 0 1 1 18.5 12a1 1 0 0 0 2 0A10 10 0 0 0 12 2Z" />
            </svg>
          </div>
          <h3 className="font-bold text-xl text-white mb-2">ChatGPT</h3>
          <p className="text-neutral-400 text-sm leading-relaxed mb-4">
            Conversational synthesis delivering direct conceptual summaries over fragmented links.
          </p>
          <span className="font-['Geist_Mono'] text-xs text-white/50 tracking-wider uppercase mt-auto">
            NODE 01 // SYNTHESIS
          </span>
        </motion.div>

        {/* Perplexity Card */}
        <motion.div
          {...fadeUp(0.3)}
          className="liquid-glass rounded-2xl p-8 flex flex-col items-center text-center group hover:bg-white/[0.04] transition-colors"
        >
          <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
            <svg viewBox="0 0 24 24" className="w-12 h-12 fill-none stroke-white stroke-2" aria-label="Perplexity">
              <rect x="4" y="4" width="16" height="16" rx="4" />
              <line x1="12" y1="4" x2="12" y2="20" />
              <line x1="4" y1="12" x2="20" y2="12" />
            </svg>
          </div>
          <h3 className="font-bold text-xl text-white mb-2">Perplexity</h3>
          <p className="text-neutral-400 text-sm leading-relaxed mb-4">
            Source-grounded retrieval engine prioritizing authority, live citations, and mathematical proofs.
          </p>
          <span className="font-['Geist_Mono'] text-xs text-white/50 tracking-wider uppercase mt-auto">
            NODE 02 // CITATION
          </span>
        </motion.div>

        {/* Google Gemini Card */}
        <motion.div
          {...fadeUp(0.4)}
          className="liquid-glass rounded-2xl p-8 flex flex-col items-center text-center group hover:bg-white/[0.04] transition-colors"
        >
          <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
            <svg viewBox="0 0 24 24" className="w-12 h-12 fill-none stroke-white stroke-2" aria-label="Google AI">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <h3 className="font-bold text-xl text-white mb-2">Gemini & Overviews</h3>
          <p className="text-neutral-400 text-sm leading-relaxed mb-4">
            Multimodal generative pipelines parsing vision, code, and live streams in real time.
          </p>
          <span className="font-['Geist_Mono'] text-xs text-white/50 tracking-wider uppercase mt-auto">
            NODE 03 // MULTIMODAL
          </span>
        </motion.div>
      </div>

      <div className="p-6 rounded-xl border border-white/15 bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <span className="text-neutral-300 font-['Geist_Mono'] text-sm">
          ⚡ STATUS: If your content is not engineered for reasoning engines, your reach is zero.
        </span>
        <a
          href="#contact"
          className="text-xs uppercase tracking-widest font-bold text-white hover:underline flex items-center gap-1 shrink-0"
        >
          Calibrate Feed <ArrowUpRight size={14} />
        </a>
      </div>
    </section>
  );
};
