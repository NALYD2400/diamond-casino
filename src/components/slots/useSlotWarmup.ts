import { useEffect } from 'react';
import { apiWarmSlotRound } from '../../lib/supabase';

/** Intervalle de préchauffage : la fonction Edge se met en veille après ~1 min d'inactivité */
const WARM_INTERVAL_MS = 45_000;

/**
 * Garde la fonction « slot-round » éveillée tant que le jeu est ouvert en mode
 * jetons et l'onglet visible, pour que le premier tour ne subisse pas le
 * démarrage à froid (jusqu'à plusieurs secondes).
 */
export function useSlotWarmup(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const ping = () => {
      if (document.visibilityState === 'visible') apiWarmSlotRound();
    };
    ping();
    const id = setInterval(ping, WARM_INTERVAL_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [enabled]);
}
