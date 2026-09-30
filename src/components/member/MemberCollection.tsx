/**
 * Espace Membre → « Mes collections » : progression des albums de marques
 * (autos & mode), récompenses obtenues, boosters offerts à ouvrir. Les cartes
 * se regardent et se revendent sur la page Collections.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Car, Gift, Loader2, Shirt, Sparkles, Trophy } from 'lucide-react';
import { apiCollectionCatalog, apiMyCollections, type CollectionCatalog, type MyCollections } from '../../lib/supabase';
import { rgba } from '../boosters/boosterUtils';
import { BrandCardFace, BrandCardSlot } from '../collections/BrandCard';
import { fmtChips, rarityMap, resolveBrandCard } from '../collections/collectionUtils';

export const MemberCollection: React.FC = () => {
  const [catalog, setCatalog] = useState<CollectionCatalog | null>(null);
  const [mine, setMine] = useState<MyCollections | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiCollectionCatalog(), apiMyCollections()])
      .then(([c, m]) => {
        setCatalog(c);
        setMine(m);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const rarities = useMemo(() => rarityMap(catalog?.rarities ?? []), [catalog]);
  const owned = useMemo(() => new Map((mine?.owned ?? []).map((o) => [o.card_id, o])), [mine]);
  const secrets = useMemo(() => new Map((mine?.secrets ?? []).map((c) => [c.id, c])), [mine]);

  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!catalog || !mine) {
    return (
      <div className="py-16 flex items-center justify-center gap-2 text-neutral-400 text-sm">
        <Loader2 size={16} className="animate-spin" /> Chargement des collections…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {mine.gifts.length > 0 && (
        <Link to="/collections" className="rounded-2xl border border-amber-300/40 bg-amber-300/10 hover:bg-amber-300/15 p-4 flex items-center gap-3 text-amber-100">
          <Gift size={20} />
          <span className="text-sm font-semibold">
            {mine.gifts.length} booster{mine.gifts.length > 1 ? 's' : ''} offert{mine.gifts.length > 1 ? 's' : ''} à ouvrir
          </span>
          <span className="ml-auto text-xs underline underline-offset-4">Ouvrir</span>
        </Link>
      )}
      {catalog.sets.map((set) => {
        const cards = catalog.cards.filter((c) => c.set_id === set.id).map((c) => resolveBrandCard(secrets.get(c.id) ?? c, rarities));
        const album = cards.filter((c) => !c.secret).sort((a, b) => a.number - b.number);
        const have = album.filter((c) => (owned.get(c.id)?.total_found ?? 0) > 0).length;
        const foundSecrets = cards.filter((c) => c.secret && (owned.get(c.id)?.total_found ?? 0) > 0).length;
        const done = mine.completions.find((x) => x.set_id === set.id);
        const pct = album.length ? (have / album.length) * 100 : 0;
        const best = cards
          .filter((c) => (owned.get(c.id)?.total_found ?? 0) > 0)
          .sort((a, b) => b.rarity.sort - a.rarity.sort || a.number - b.number)
          .slice(0, 5);
        return (
          <div key={set.id} className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: rgba(set.accent_color, 0.18), color: set.accent_color }}>
                  {set.id === 'mode' ? <Shirt size={18} /> : <Car size={18} />}
                </span>
                <div>
                  <div className="text-white font-bold">{set.name}</div>
                  <div className="text-xs text-neutral-500">
                    {have} / {album.length} cartes · {foundSecrets} secrète(s)
                  </div>
                </div>
              </div>
              {done ? (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-semibold px-3 py-1.5">
                  <Trophy size={13} /> Complété · +{fmtChips(done.reward)}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 text-neutral-300 text-xs font-semibold px-3 py-1.5">
                  <Trophy size={13} /> {fmtChips(set.reward)} à la clé
                </span>
              )}
            </div>
            <div className="mt-4 h-2.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: set.accent_color }} />
            </div>
            <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
              {best.length === 0
                ? album.slice(0, 5).map((c) => <BrandCardSlot key={c.id} card={c} width={120} />)
                : best.map((c) => <BrandCardFace key={c.id} card={c} width={120} lite interactive={false} setName={set.name} />)}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs">
              <span className="text-neutral-500 flex items-center gap-1.5">
                <Sparkles size={12} /> Vos plus belles cartes
              </span>
              <Link to="/collections" className="rounded-full bg-white text-black font-bold px-4 py-2 hover:bg-neutral-200">
                Voir l'album
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
};
