import React from 'react';
import { Lock } from 'lucide-react';
import { useCasinoAdmin } from '../context/CasinoAdminContext';
import type { GamesConfig } from '../lib/gamesConfig';

export type MachineClosedState = 'maintenance' | 'closed' | null;

/**
 * État d'ouverture d'une machine, mis à jour en temps réel quand la direction
 * la ferme. Purement informatif : le serveur refuse de toute façon les mises
 * sur une machine fermée.
 */
export function useMachineClosed(id: keyof GamesConfig): MachineClosedState {
  const { economy, gamesConfig } = useCasinoAdmin();
  if (economy.maintenanceMode) return 'maintenance';
  return gamesConfig[id].enabled ? null : 'closed';
}

/** Bandeau affiché au-dessus d'une machine fermée (le mode démo reste jouable) */
export const MachineClosedBanner: React.FC<{ state: MachineClosedState; demo?: boolean }> = ({ state, demo = true }) => {
  const { economy } = useCasinoAdmin();
  if (!state) return null;
  return (
    // Superposé en haut de la machine (sous le menu) : ne décale pas la page
    <div className="pointer-events-none absolute inset-x-0 top-[152px] sm:top-[182px] lg:top-[98px] z-50 flex justify-center px-4 lg:px-60">
      <div
        role="status"
        className="pointer-events-auto max-w-full rounded-full bg-rose-950/95 border border-rose-500/50 shadow-[0_6px_24px_rgba(0,0,0,0.55)] backdrop-blur-sm px-4 py-1.5 text-[12px] sm:text-[13px] text-rose-100 flex items-center gap-2"
      >
        <Lock size={13} className="shrink-0" />
        <span className="font-semibold truncate">
          {state === 'maintenance' ? economy.maintenanceMessage || 'Le casino est en maintenance.' : 'Machine fermée par la direction'}
        </span>
        <span className="hidden xl:inline text-rose-300/60" aria-hidden>
          ·
        </span>
        <span className="hidden xl:inline text-rose-200/80 whitespace-nowrap">
          {demo ? 'Mises en jetons suspendues, mode démo disponible' : 'Tours suspendus'}
        </span>
      </div>
    </div>
  );
};
