/**
 * Espace Membre → « Collections » : albums de cartes marques (autos & mode),
 * progression, récompense, cartes secrètes et revente des doublons.
 * Les boosters s'achètent et s'ouvrent sur la page Collections.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Gift, Loader2 } from 'lucide-react';
import { apiCollectionCatalog, apiMyCollections, type CollectionCatalog, type MyCollections } from '../../lib/supabase';
import { CollectionAlbum } from '../collections/CollectionAlbum';

export const MemberCollection: React.FC = () => {
  const [catalog, setCatalog] = useState<CollectionCatalog | null>(null);
  const [mine, setMine] = useState<MyCollections | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMine = useCallback(() => {
    apiMyCollections()
      .then(setMine)
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    apiCollectionCatalog()
      .then(setCatalog)
      .catch((e) => setError((e as Error).message));
    loadMine();
  }, [loadMine]);

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
      <CollectionAlbum catalog={catalog} mine={mine} onChanged={loadMine} />
    </div>
  );
};
