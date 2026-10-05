import React from 'react';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import { formatRtp, slotSpinRtp } from '../../lib/gamesConfig';

/** RTP des tours normaux d'une machine, tel que réglé dans la console (ex. « 80 % ») */
export const SlotRtpText: React.FC<{ game: 'doghouse' | 'wanted' }> = ({ game }) => {
  const { gamesConfig } = useCasinoAdmin();
  return <>{formatRtp(slotSpinRtp(game, gamesConfig[game]))}</>;
};
