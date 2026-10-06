import React from 'react';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import { formatRtp, slotTotalRtp } from '../../lib/gamesConfig';

/** RTP d'une machine tel que réglé dans la console, jackpot progressif compris (ex. « 85 % ») */
export const SlotRtpText: React.FC<{ game: 'doghouse' | 'wanted' }> = ({ game }) => {
  const { gamesConfig } = useCasinoAdmin();
  return <>{formatRtp(slotTotalRtp(game, gamesConfig))}</>;
};
