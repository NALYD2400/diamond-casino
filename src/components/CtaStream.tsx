import React, { useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import Hls from 'hls.js';

interface CtaStreamProps {
  view404: boolean;
}

export const CtaStream: React.FC<CtaStreamProps> = ({ view404 }) => {
  const ctaVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (view404) return;
    const video = ctaVideoRef.current;
    if (!video) return;

    const src = 'https://stream.mux.com/8wrHPCX2dC3msyYU9ObwqNdm00u3ViXvOSHUMRYSEe5Q.m3u8';
    let hlsInstance: Hls | null = null;

    if (Hls.isSupported()) {
      hlsInstance = new Hls({ autoStartLoad: true });
      hlsInstance.loadSource(src);
      hlsInstance.attachMedia(video);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {});
      });
    }

    return () => {
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, [view404]);

  return (
    <section
      id="secure"
      className="relative py-36 sm:py-48 px-6 border-t border-white/10 overflow-hidden flex flex-col items-center justify-center text-center"
    >
      {/* Background HLS Video */}
      <video
        ref={ctaVideoRef}
        className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none opacity-60"
        muted
        loop
        playsInline
      />

      {/* Gradient & Overlay */}
      <div className="absolute inset-0 bg-black/60 z-[1] pointer-events-none" />

      {/* CTA Center Box */}
      <div className="relative z-10 flex flex-col items-center max-w-2xl mx-auto">
        {/* The Diamond Casino Logo badge */}
        <div className="flex items-center justify-center mb-6">
          <img
            src="/diamond_casino_logo.png"
            alt="The Diamond Casino & Resort"
            className="h-16 sm:h-20 w-auto object-contain drop-shadow-[0_0_25px_rgba(255,255,255,0.2)]"
          />
        </div>

        <h2 className="text-4xl sm:text-6xl md:text-7xl font-semibold text-white tracking-tight mb-4">
          Entrez dans l'univers <span className="font-['Instrument_Serif'] font-normal italic text-white">The Diamond</span>
        </h2>
        <p className="text-neutral-300 text-base sm:text-lg leading-relaxed mb-10 max-w-xl">
          Tables VIP de grand prestige, suites penthouse, Roue de la Fortune quotidienne et privilèges exclusifs réservés aux citoyens de Los Santos.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/espace-membre"
            className="bg-white text-black font-semibold rounded-full px-8 py-4 text-sm hover:bg-neutral-200 transition-transform active:scale-95 cursor-pointer shadow-[0_0_30px_rgba(255,255,255,0.3)] text-center"
          >
            Rejoindre l'Espace Membre
          </Link>
          <Link
            to="/roue-de-la-fortune"
            className="liquid-glass rounded-full px-8 py-4 text-white text-sm font-medium hover:bg-white/10 transition-transform active:scale-95 cursor-pointer flex items-center gap-2 border border-white/20 text-white text-center"
          >
            Tourner la Roue
          </Link>
          <a
            href="https://discord.gg/patvwjhNzK"
            target="_blank"
            rel="noopener noreferrer"
            className="liquid-glass rounded-full px-8 py-4 text-white text-sm font-medium hover:bg-white/10 transition-transform active:scale-95 cursor-pointer flex items-center gap-2"
          >
            Rejoindre le Discord
          </a>
        </div>
      </div>
    </section>
  );
};
