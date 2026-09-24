import React, { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Car, Disc, Gift, Loader2, PackageCheck } from 'lucide-react';
import { useCasinoUser } from '../../context/CasinoUserContext';
import { REWARD_STATUS, formatRewardDate } from '../../lib/rewards';

interface MemberRewardsProps {
  showToast: (msg: string) => void;
}

/** "Mes lots" tab of the member portal: won vehicles / items and their claim status */
export const MemberRewards: React.FC<MemberRewardsProps> = ({ showToast }) => {
  const { user, claimReward } = useCasinoUser();
  const [claimingId, setClaimingId] = useState<string | null>(null);

  if (!user) return null;
  const rewards = user.rewards;
  const toClaim = rewards.filter((r) => r.status === 'IN_INVENTORY').length;

  const handleClaim = async (id: string) => {
    setClaimingId(id);
    try {
      await claimReward(id);
      showToast('Réclamation envoyée : la direction vous remettra le lot en ville.');
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="text-xs font-mono tracking-widest text-white uppercase font-bold flex items-center gap-1.5">
            <Gift size={14} /> MES LOTS &amp; VÉHICULES
          </span>
          <p className="text-sm text-neutral-400 mt-2 max-w-2xl">
            Les véhicules et lots gagnés à la Roue arrivent ici. Cliquez sur <strong className="text-white">Réclamer</strong> :
            la direction est prévenue et vous remet le lot directement en jeu.
          </p>
        </div>
        {toClaim > 0 && (
          <span className="px-3 py-1.5 rounded-full text-xs font-bold border border-amber-400/30 bg-amber-500/10 text-amber-300 self-start sm:self-auto">
            {toClaim} lot{toClaim > 1 ? 's' : ''} à réclamer
          </span>
        )}
      </div>

      {rewards.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-10 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Gift size={24} />
          </div>
          <div>
            <h3 className="font-semibold text-white">Aucun lot pour le moment</h3>
            <p className="text-sm text-neutral-400 mt-1">Tentez votre chance à la Roue de la Fortune pour gagner un véhicule.</p>
          </div>
          <Link
            to="/roue-de-la-fortune"
            className="rounded-full px-6 py-3 text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-black flex items-center gap-2"
          >
            <Disc size={15} /> Tourner la roue
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {rewards.map((r) => {
            const status = REWARD_STATUS[r.status];
            const Icon = r.kind === 'vehicle' ? Car : Gift;
            return (
              <article key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden flex flex-col">
                <div className="relative aspect-[16/9] bg-neutral-900">
                  {r.image_url ? (
                    <img src={r.image_url} alt={r.label} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600">
                      <Icon size={40} />
                    </div>
                  )}
                  <span className={`absolute top-3 left-3 text-[11px] font-semibold px-2.5 py-1 rounded-full border backdrop-blur-md ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                <div className="p-5 flex flex-col gap-3 flex-1">
                  <div>
                    <span className="font-mono text-[10px] tracking-[2px] uppercase text-neutral-500 flex items-center gap-1.5">
                      <Icon size={11} /> {r.kind === 'vehicle' ? 'Véhicule' : 'Lot'} · {r.source === 'wheel' ? 'Roue de la Fortune' : 'Offert par la direction'}
                    </span>
                    <h3 className="font-semibold text-white text-lg mt-1">{r.label}</h3>
                    {r.vehicle_model && <p className="font-mono text-xs text-neutral-500">Modèle : {r.vehicle_model}</p>}
                  </div>
                  <p className="text-xs text-neutral-500">
                    Gagné le {formatRewardDate(r.created_at)}
                    {r.status === 'DELIVERED' && r.handled_at && <> · remis le {formatRewardDate(r.handled_at)}</>}
                  </p>
                  {r.note && <p className="text-xs text-neutral-400 italic">« {r.note} »</p>}
                  <div className="mt-auto pt-2">
                    {r.status === 'IN_INVENTORY' ? (
                      <button
                        type="button"
                        onClick={() => handleClaim(r.id)}
                        disabled={claimingId !== null}
                        className="w-full rounded-full py-3 text-xs font-bold uppercase tracking-wider bg-white text-black hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {claimingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
                        Réclamer en jeu
                      </button>
                    ) : r.status === 'CLAIMED' ? (
                      <p className="text-xs text-sky-300 text-center py-2">Demande envoyée — un membre de la direction va vous le remettre.</p>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
