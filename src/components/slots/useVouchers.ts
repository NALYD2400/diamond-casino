import { useCallback, useEffect, useState } from 'react';
import { useCasinoUser } from '../../context/CasinoUserContext';
import { dbFetchMyVouchers, type PlayerReward } from '../../lib/supabase';

/**
 * Bons de bonus offerts (roue, cadeaux) que le joueur peut utiliser sur cette machine.
 * Relus à l'ouverture du jeu et après chaque utilisation.
 */
export function useVouchers(game: 'doghouse' | 'wanted', enabled: boolean) {
  const { user } = useCasinoUser();
  const profileId = user?.id ?? null;
  const [vouchers, setVouchers] = useState<PlayerReward[]>([]);

  const reload = useCallback(async () => {
    if (!enabled || !profileId) {
      setVouchers([]);
      return;
    }
    try {
      setVouchers(await dbFetchMyVouchers(profileId, game));
    } catch {
      setVouchers([]);
    }
  }, [enabled, profileId, game]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { vouchers, reload };
}
