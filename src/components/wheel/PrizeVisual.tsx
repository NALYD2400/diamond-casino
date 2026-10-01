/**
 * Visuel d'un lot de la roue : vrai paquet de l'album pour un booster offert,
 * couverture de la machine pour un bonus offert, image du lot sinon.
 */
import React, { useEffect, useState } from 'react';
import type { WheelSegmentConfig } from '../../context/CasinoAdminContext';
import { apiCollectionCatalog, type CollectionCatalog } from '../../lib/supabase';
import { BoosterPack } from '../boosters/BoosterPack';
import { PackFan, packFanCards, packLookFor } from '../collections/PackFan';
import { DogHouseCover, WantedCover } from '../slots/GameCovers';

// Catalogue des collections, chargé une seule fois pour toute la page
let catalogPromise: Promise<CollectionCatalog | null> | null = null;
function useCollectionCatalog() {
  const [catalog, setCatalog] = useState<CollectionCatalog | null>(null);
  useEffect(() => {
    let alive = true;
    catalogPromise ??= apiCollectionCatalog().catch(() => {
      catalogPromise = null;
      return null;
    });
    void catalogPromise.then((c) => alive && setCatalog(c));
    return () => {
      alive = false;
    };
  }, []);
  return catalog;
}

/** Habillage des cartes VIP */
const VIP_LOOK = {
  SILVER: { card: 'linear-gradient(135deg,#f1f5f9,#94a3b8 55%,#475569)', glow: 'rgba(203,213,225,0.45)', ink: '#0f172a', emoji: '🥈' },
  GOLD: { card: 'linear-gradient(135deg,#fff3b0,#e0a412 50%,#7a4b05)', glow: 'rgba(245,190,40,0.5)', ink: '#2a1600', emoji: '👑' },
  DIAMOND: { card: 'linear-gradient(135deg,#ecfeff,#67e8f9 45%,#0e7490 80%,#1e1b4b)', glow: 'rgba(103,232,249,0.5)', ink: '#082f49', emoji: '💎' },
} as const;

/** Contenu réduit d'un facteur `scale` (le visuel est dessiné en grand puis rétréci) */
const Scaled: React.FC<{ size: number; scale: number; children: React.ReactNode }> = ({ size, scale, children }) => (
  <div className="absolute left-1/2 top-1/2" style={{ width: size, height: size, transform: `translate(-50%, -50%) scale(${scale})` }}>
    {children}
  </div>
);

export const PrizeVisual: React.FC<{
  seg: WheelSegmentConfig;
  /** Image de repli (ou image du lot) */
  src: string;
  fallback: string;
  /** Hauteur du cadre en pixels (le visuel remplit son parent, positionné) */
  height: number;
  thumb?: boolean;
}> = ({ seg, src, fallback, height, thumb = false }) => {
  const catalog = useCollectionCatalog();

  if (seg.type === 'voucher') {
    const cover = seg.voucherGame === 'wanted' ? <WantedCover /> : <DogHouseCover />;
    // Les couvertures sont dessinées pour ~260 px : on les réduit pour la vignette
    return thumb ? <Scaled size={160} scale={height / 160}>{cover}</Scaled> : cover;
  }

  if (seg.type === 'vip') {
    const tier = seg.vipTier ?? 'SILVER';
    const look = VIP_LOOK[tier];
    if (thumb) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-[13px]" style={{ background: look.card }}>
          {look.emoji}
        </div>
      );
    }
    const w = Math.round(height * 1.05);
    return (
      <div className="absolute inset-0 flex items-start justify-center pt-4" style={{ background: `radial-gradient(circle at 50% 40%, ${look.glow}, #0b0716 70%)` }}>
        <div
          className="relative rounded-xl overflow-hidden border border-white/30 flex flex-col justify-between p-3 text-left"
          style={{ width: w, height: w * 0.63, background: look.card, boxShadow: `0 10px 30px rgba(0,0,0,0.6), 0 0 24px ${look.glow}`, transform: 'rotate(-6deg)' }}
        >
          <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.45)_45%,transparent_60%)]" />
          <div className="relative flex items-center justify-between">
            <span className="text-[9px] font-black tracking-[0.25em]" style={{ color: look.ink }}>THE DIAMOND</span>
            <span className="text-base">{look.emoji}</span>
          </div>
          <div className="relative">
            <div className="font-['Oswald'] font-bold text-xl leading-none tracking-wider" style={{ color: look.ink }}>
              {tier}
            </div>
            <div className="text-[8px] font-bold tracking-[0.2em] opacity-80" style={{ color: look.ink }}>
              CARTE VIP · CASINO & RESORT
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (seg.type === 'pack' && catalog) {
    const set = catalog.sets.find((s) => s.id === seg.packSet) ?? (seg.packSet ? undefined : catalog.sets[0]);
    if (set) {
      const drawW = thumb ? 60 : Math.round((height * 0.95) / 1.62);
      const pack = (
        <BoosterPack
          pack={{ ...packLookFor(set), cover: <PackFan cards={packFanCards(catalog, set.id)} width={drawW} setName={set.name} /> }}
          width={drawW}
          interactive={false}
        />
      );
      return (
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 45%, ${set.accent_color}55, #0b0716 70%)` }}>
          {thumb ? (
            <Scaled size={drawW * 1.62} scale={(height * 0.9) / (drawW * 1.62)}>
              <div className="flex justify-center">{pack}</div>
            </Scaled>
          ) : (
            <div className="absolute inset-0 flex items-start justify-center pt-2">{pack}</div>
          )}
        </div>
      );
    }
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="absolute inset-0 w-full h-full object-cover"
      onError={(e) => {
        e.currentTarget.src = fallback;
      }}
    />
  );
};
