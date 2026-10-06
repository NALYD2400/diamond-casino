import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Gem } from 'lucide-react';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import { dismissJackpot, useCasinoLimits, useJackpotWon } from '../../lib/casinoLimits';

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

/**
 * Jackpot progressif des machines à sous : une part de chaque mise l'alimente, chaque tour a une chance
 * (proportionnelle à la mise) de le remporter. Affiche aussi le gain max actuel fixé par la caisse.
 */
export const JackpotTicker: React.FC<{ className?: string }> = ({ className = '' }) => {
  const limits = useCasinoLimits();
  const { gamesConfig } = useCasinoAdmin();
  const pct = String(gamesConfig.bank.jackpotPct).replace('.', ',');
  if (!limits || !(limits.jackpot > 0) || !(gamesConfig.bank.jackpotPct > 0)) return null;
  return (
    <div
      className={`pointer-events-auto inline-flex items-center gap-2.5 rounded-full border border-[#ffd84a]/40 bg-black/70 px-3.5 py-1.5 shadow-[0_0_24px_rgba(255,216,74,0.25)] backdrop-blur-md ${className}`}
      title={
        `Jackpot progressif : ${pct} % de chaque mise des machines à sous l'alimente, chaque tour peut le remporter.` +
        (limits.max_win > 0 ? `\nGain max par manche : ${fmt(limits.max_win)} jetons (caisse du casino).` : '') +
        (limits.jackpot_last_winner && limits.jackpot_last_amount
          ? `\nDernier gagnant : ${limits.jackpot_last_winner} (${fmt(limits.jackpot_last_amount)} jetons)`
          : '')
      }
    >
      <Gem size={14} className="text-[#ffd84a] shrink-0" />
      <span className="text-[10px] font-bold tracking-[0.18em] text-[#ffd84a]">JACKPOT</span>
      <span className="font-mono text-sm font-bold text-white tabular-nums">{fmt(limits.jackpot)}</span>
    </div>
  );
};

/** Célébration plein écran quand le joueur remporte le jackpot */
export const JackpotWinOverlay: React.FC = () => {
  const amount = useJackpotWon();
  return (
    <AnimatePresence>
      {amount !== null && (
        <motion.div
          key="jackpot-win"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismissJackpot}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer px-4"
          role="dialog"
          aria-label="Jackpot remporté"
        >
          <motion.div
            initial={{ scale: 0.6, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
            className="text-center"
          >
            <Gem size={56} className="mx-auto text-[#ffd84a] drop-shadow-[0_0_30px_rgba(255,216,74,0.8)]" />
            <div className="mt-4 font-['Luckiest_Guy'] text-5xl sm:text-7xl tracking-wide text-[#ffd84a] drop-shadow-[0_4px_0_rgba(0,0,0,0.6)]">
              JACKPOT !
            </div>
            <div className="mt-3 font-mono text-3xl sm:text-5xl font-bold text-white tabular-nums">{fmt(amount)}</div>
            <div className="mt-1 text-sm text-white/70">jetons crédités sur votre compte</div>
            <div className="mt-8 text-xs text-white/40">Touchez pour continuer</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/** Bandeau du lobby : jackpot progressif, dernier gagnant et gain max actuel */
export const JackpotBanner: React.FC = () => {
  const limits = useCasinoLimits();
  const { gamesConfig } = useCasinoAdmin();
  if (!limits || !(limits.jackpot > 0) || !(gamesConfig.bank.jackpotPct > 0)) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-2xl border border-[#ffd84a]/30 bg-[linear-gradient(90deg,rgba(255,216,74,0.12),rgba(255,216,74,0.02))] px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <Gem size={22} className="text-[#ffd84a] shrink-0" />
        <div className="min-w-0">
          <div className="text-[10px] font-bold tracking-[0.2em] text-[#ffd84a]">JACKPOT PROGRESSIF · MACHINES À SOUS</div>
          <div className="font-mono text-2xl font-bold text-white tabular-nums">{fmt(limits.jackpot)} jetons</div>
        </div>
      </div>
      <div className="text-[11px] text-neutral-400 leading-relaxed">
        {limits.jackpot_last_winner && limits.jackpot_last_amount ? (
          <div>
            Dernier gagnant : <span className="text-white font-semibold">{limits.jackpot_last_winner}</span> · {fmt(limits.jackpot_last_amount)} jetons
          </div>
        ) : (
          <div>Chaque tour de Dog House ou Wanted peut le remporter.</div>
        )}
        {limits.max_win > 0 && (
          <div>
            Gain max par manche : <span className="text-white font-semibold">{fmt(limits.max_win)}</span> jetons
          </div>
        )}
      </div>
    </div>
  );
};
