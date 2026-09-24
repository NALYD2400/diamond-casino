import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

function WordSpan({
  word,
  progress,
  range,
  highlight,
}: {
  word: string;
  progress: any;
  range: [number, number];
  highlight: boolean;
}) {
  const opacity = useTransform(progress, range, [0.15, 1]);
  return (
    <motion.span
      style={{ opacity }}
      className={`inline-block mr-[0.25em] transition-colors duration-300 ${
        highlight ? 'text-white underline decoration-white/30 underline-offset-8' : 'text-neutral-400'
      }`}
    >
      {word}
    </motion.span>
  );
}

export const Mission: React.FC = () => {
  const missionSectionRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: missionSectionRef,
    offset: ['start 85%', 'end 25%']
  });

  const p1Text = "Nous bâtissons un sanctuaire où le frisson du jeu côtoie le raffinement le plus absolu — où chaque mise devient une légende, chaque soirée un triomphe, et chaque instant un souvenir inoubliable.";
  const p1Words = p1Text.split(' ');

  const p2Text = "Une oasis d'exception à Los Santos où l'élégance, la discrétion et le prestige se rencontrent — sans compromis, sans fausse note, avec une intensité sans pareille.";
  const p2Words = p2Text.split(' ');

  return (
    <section ref={missionSectionRef} className="py-28 sm:py-36 px-6 max-w-5xl mx-auto flex flex-col items-center border-t border-white/10">
      {/* Monolithic Video Display */}
      <div className="w-full max-w-[760px] aspect-square rounded-3xl overflow-hidden mb-16 border border-white/15 shadow-[0_20px_80px_rgba(0,0,0,0.8)]">
        <video
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260325_132944_a0d124bb-eaa1-4082-aa30-2310efb42b4b.mp4"
          className="w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
        />
      </div>

      {/* Scroll Driven Kinetic Typography */}
      <div className="text-center max-w-4xl mx-auto">
        <p className="text-2xl sm:text-4xl lg:text-5xl font-semibold tracking-[-0.03em] leading-snug">
          {p1Words.map((word, i) => {
            const start = (i / (p1Words.length + p2Words.length)) * 0.7;
            const end = start + 0.08;
            const isHighlight = ['sanctuaire', 'frisson', 'raffinement', 'légende', 'triomphe', 'inoubliable'].some(w =>
              word.toLowerCase().includes(w)
            );
            return (
              <WordSpan
                key={`p1-${i}`}
                word={word}
                progress={scrollYProgress}
                range={[start, end]}
                highlight={isHighlight}
              />
            );
          })}
        </p>

        <p className="text-xl sm:text-3xl font-medium mt-10 leading-snug text-neutral-400">
          {p2Words.map((word, i) => {
            const start = 0.45 + (i / p2Words.length) * 0.5;
            const end = start + 0.08;
            return (
              <WordSpan
                key={`p2-${i}`}
                word={word}
                progress={scrollYProgress}
                range={[start, end]}
                highlight={false}
              />
            );
          })}
        </p>
      </div>
    </section>
  );
};
