import { useEffect } from 'react';
import { apiWarmSlotRound } from '../../lib/supabase';

/** En dessous de cette absence, la fonction Edge est encore éveillée : pas besoin de la réveiller */
const REWARM_AFTER_HIDDEN_MS = 60_000;

/**
 * Réveille la fonction « slot-round » à l'ouverture du jeu en mode jetons, puis
 * au retour sur l'onglet après une longue absence, pour que le premier tour ne
 * subisse pas le démarrage à froid. Pendant le jeu, les tours la gardent
 * éveillée d'eux-mêmes : pas de ping périodique (chaque appel compte dans le
 * quota mensuel de fonctions Edge).
 */
export function useSlotWarmup(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    apiWarmSlotRound();
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > REWARM_AFTER_HIDDEN_MS) {
        apiWarmSlotRound();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled]);
}
