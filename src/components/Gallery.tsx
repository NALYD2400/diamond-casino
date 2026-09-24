import React from 'react';
import { motion } from 'framer-motion';
import { GALLERY_IMAGES } from '../constants/gallery';
import { fadeUp } from '../constants/animations';

export const Gallery: React.FC = () => {
  return (
    <section className="py-24 px-6 border-t border-white/10 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
        <div>
          <span className="text-xs font-['Geist_Mono'] tracking-[3px] uppercase text-neutral-400 block mb-1">
            THE DIAMOND // ARCHIVES
          </span>
          <h3 className="text-3xl sm:text-5xl font-semibold tracking-tight">
            Salons privés &amp; galerie
          </h3>
        </div>
        <p className="text-neutral-400 text-sm max-w-sm">
          Perspectives architecturales et coulisses des salons High Roller, en noir et blanc.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {GALLERY_IMAGES.map((imgUrl, i) => (
          <motion.div
            key={i}
            {...fadeUp(0.05 * i)}
            className="group relative aspect-[3/4] rounded-xl overflow-hidden border border-white/15 bg-neutral-900"
          >
            <img
              src={imgUrl}
              alt={`Archive du casino n°${i + 1}`}
              className="w-full h-full object-cover grayscale transition-transform duration-500 group-hover:scale-110 group-hover:grayscale-0"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
              <span className="font-['Geist_Mono'] text-xs text-white uppercase tracking-wider">
                REC // #{String(i + 1).padStart(3, '0')}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
