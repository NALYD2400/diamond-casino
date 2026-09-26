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
    <div
      role="status"
      className="relative z-40 w-full bg-rose-950/95 border-y border-rose-500/40 px-4 py-2.5 text-[13px] text-rose-100 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center"
    >
      <Lock size={14} className="shrink-0" />
      <span className="font-semibold">
        {state === 'maintenance' ? economy.maintenanceMessage || 'Le casino est en maintenance.' : 'Machine fermée par la direction'}
      </span>
      <span className="text-rose-300/60" aria-hidden>
        ·
      </span>
      <span className="text-rose-200/80">{demo ? 'Mises en jetons suspendues, mode démo disponible' : 'Tours suspendus'}</span>
    </div>
  );
};
