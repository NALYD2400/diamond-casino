/**
 * Album de collection (Espace Membre → Collections) : choix de l'album,
 * progression, récompense, cartes obtenues / manquantes, cartes secrètes et
 * revente des doublons.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Car, Coins, Shirt, Sparkles, Trophy } from 'lucide-react';
import { useCasinoUser } from '../../context/CasinoUserContext';
import { apiSellCollectionCards, type CollectionCatalog, type MyCollections } from '../../lib/supabase';
import { rgba } from '../boosters/boosterUtils';
import { BrandCardFace, BrandCardSlot } from './BrandCard';
import { fmtChips, rarityMap, resolveBrandCard, type BrandCard } from './collectionUtils';

type Filter = 'all' | 'owned' | 'missing' | 'doubles';

/** Album affiché par défaut (partagé avec la page Collections) */
export const COLLECTION_SET_KEY = 'collections_set';

export const setIcon = (id: string, size = 15) => (id === 'mode' ? <Shirt size={size} /> : <Car size={size} />);

export function readStoredSet(): string {
  try {
    return localStorage.getItem(COLLECTION_SET_KEY) || 'autos';
  } catch {
    return 'autos';
  }
}

export function storeSet(id: string) {
  try {
    localStorage.setItem(COLLECTION_SET_KEY, id);
  } catch {}
}

/** Largeur disponible d'un conteneur (grille de cartes) */
function useWidth() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w] as const;
}

export const CollectionAlbum: React.FC<{ catalog: CollectionCatalog; mine: MyCollections | null; onChanged: () => void }> = ({ catalog, mine, onChanged }) => {
  const { applyServerProfile, isAuthenticated } = useCasinoUser();
  const [setId, setSetId] = useState(readStoredSet);
  const [filter, setFilter] = useState<Filter>('all');
  const [selling, setSelling] = useState<string | null>(null);
  const [confirmSellAll, setConfirmSellAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gridRef, gridWidth] = useWidth();

  const rarities = useMemo(() => rarityMap(catalog.rarities), [catalog]);
  const sets = catalog.sets;
  const set = sets.find((s) => s.id === setId) ?? sets[0];
  const owned = useMemo(() => new Map((mine?.owned ?? []).map((o) => [o.card_id, o])), [mine]);
  const secretsFound = useMemo(() => new Map((mine?.secrets ?? []).map((c) => [c.id, c])), [mine]);

  const cards = useMemo(() => {
    if (!set) return [] as BrandCard[];
    return catalog.cards
      .filter((c) => c.set_id === set.id)
      .map((c) => resolveBrandCard(secretsFound.get(c.id) ?? c, rarities))
      .sort((a, b) => Number(a.secret) - Number(b.secret) || a.number - b.number);
  }, [catalog, set, rarities, secretsFound]);

  if (!set) return <p className="text-sm text-white/50 py-10 text-center">Aucune collection disponible pour le moment.</p>;

  const albumCards = cards.filter((c) => !c.secret);
  const secretCards = cards.filter((c) => c.secret);
  const setSize = albumCards.length;
  const ownedCount = albumCards.filter((c) => (owned.get(c.id)?.total_found ?? 0) > 0).length;
  const completion = mine?.completions.find((c) => c.set_id === set.id);
  const accent = set.accent_color;
  const pct = setSize ? (ownedCount / setSize) * 100 : 0;

  /** Seuls les doublons se revendent (secrètes comprises) : le premier exemplaire reste dans l'album */
  const sellable = (c: BrandCard) => Math.max(0, (owned.get(c.id)?.count ?? 0) - 1);
  const rate = mine?.sell_rate ?? catalog.config.sellRate;
  const priceOf = (c: BrandCard) => Math.floor((c.rarity.sell_value * rate) / 100);
  const doubles = cards.filter((c) => sellable(c) > 0);
  const doublesQty = doubles.reduce((a, c) => a + sellable(c), 0);
  const doublesValue = doubles.reduce((a, c) => a + sellable(c) * priceOf(c), 0);
  const bestBonus = Math.max(catalog.config.sellBonusGold, catalog.config.sellBonusDiamond);

  const visible = albumCards.filter((c) => {
    const n = owned.get(c.id)?.total_found ?? 0;
    if (filter === 'owned') return n > 0;
    if (filter === 'missing') return n === 0;
    if (filter === 'doubles') return sellable(c) > 0;
    return true;
  });

  // Colonnes : ~165 px par carte, au moins 2
  const gap = 16;
  const cols = Math.max(2, Math.floor((gridWidth + gap) / (165 + gap)));
  const cardW = gridWidth ? Math.min(190, Math.floor((gridWidth - gap * (cols - 1)) / cols)) : 0;

  const sell = async (items: { card_id: string; qty: number }[], key: string) => {
    if (!items.length || selling) return;
    setSelling(key);
    setError(null);
    setNotice(null);
    try {
      const res = await apiSellCollectionCards(items);
      applyServerProfile(res.profile);
      setNotice(`${res.sold} carte(s) revendue(s) : +${fmtChips(res.chips)}`);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSelling(null);
      setConfirmSellAll(false);
    }
  };

  const grid = (list: BrandCard[], withSize: boolean) => (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}>
      {cardW > 0 &&
        list.map((c) => (
          <AlbumCard
            key={c.id}
            card={c}
            width={cardW}
            setName={set.name}
            setSize={withSize ? setSize : undefined}
            count={owned.get(c.id)?.count ?? 0}
            found={owned.get(c.id)?.total_found ?? 0}
            sellable={isAuthenticated ? sellable(c) : 0}
            price={priceOf(c)}
            selling={selling === c.id}
            onSell={() => void sell([{ card_id: c.id, qty: 1 }], c.id)}
          />
        ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Choix de l'album */}
      <div className="inline-flex self-start rounded-full bg-black/70 border border-white/15 p-1 backdrop-blur-md max-w-full overflow-x-auto">
        {sets.map((s) => {
          const inAlbum = catalog.cards.filter((c) => c.set_id === s.id && rarities[c.rarity]?.in_collection !== false);
          const have = inAlbum.filter((c) => (owned.get(c.id)?.total_found ?? 0) > 0).length;
          const active = s.id === set.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSetId(s.id);
                storeSet(s.id);
                setFilter('all');
                setConfirmSellAll(false);
              }}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${active ? 'bg-white text-black' : 'text-white/70 hover:text-white'}`}
            >
              {setIcon(s.id)} {s.name}
              <span className={`font-mono text-[10px] rounded-full px-1.5 py-0.5 ${active ? 'bg-black/10' : 'bg-white/10'}`}>
                {have}/{inAlbum.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Progression, récompense, doublons */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-black/60 border border-white/10 backdrop-blur-md p-5">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.25em] font-semibold" style={{ color: accent }}>
                {set.subtitle || 'Album'}
              </div>
              <div className="text-xl font-bold text-white mt-0.5">{set.name}</div>
            </div>
            <span className="font-mono text-white text-lg font-bold">
              {ownedCount}
              <span className="text-white/40 text-sm"> / {setSize}</span>
            </span>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${rgba(accent, 0.7)}, ${accent})`, boxShadow: `0 0 14px ${rgba(accent, 0.6)}` }} />
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {catalog.rarities
              .filter((r) => r.in_collection)
              .map((r) => {
                const list = albumCards.filter((c) => c.rarity.key === r.key);
                if (!list.length) return null;
                const have = list.filter((c) => (owned.get(c.id)?.total_found ?? 0) > 0).length;
                return (
                  <div key={r.key} className="rounded-lg bg-white/[0.04] border border-white/10 px-1.5 py-1.5 text-center">
                    <div className="text-[9px] uppercase tracking-wider font-bold truncate" style={{ color: r.color }}>
                      {r.label}
                    </div>
                    <div className="font-mono text-xs text-white">
                      {have}/{list.length}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div
            className="rounded-2xl p-4 flex items-center gap-3 border backdrop-blur-md"
            style={{ borderColor: completion ? 'rgba(52,211,153,0.4)' : rgba(accent, 0.35), background: completion ? 'rgba(16,185,129,0.12)' : rgba(accent, 0.1) }}
          >
            <Trophy size={22} style={{ color: completion ? '#6ee7b7' : accent }} className="shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-white/50">{completion ? 'Album complété' : 'Album complet'}</div>
              <div className="text-lg font-bold font-mono text-white">
                {completion ? '+' : ''}
                {fmtChips(completion?.reward ?? set.reward)}
              </div>
              <div className="text-[11px] text-white/50">
                {completion ? `Le ${new Date(completion.completed_at).toLocaleDateString('fr-FR')} en ${completion.packs_opened} booster(s)` : `Encore ${setSize - ownedCount} carte(s)`}
              </div>
            </div>
          </div>
          {isAuthenticated && (
            <div className="rounded-2xl bg-black/60 border border-white/10 backdrop-blur-md p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-white font-semibold">Doublons</span>
                <span className="text-[11px] font-mono rounded-full bg-amber-300/15 text-amber-200 px-2 py-0.5">revente {rate} %</span>
              </div>
              <div className="text-xs text-white/50">{doublesQty > 0 ? `${doublesQty} carte(s) en trop · ${fmtChips(doublesValue)}` : 'Aucun doublon pour le moment.'}</div>
              {rate < catalog.config.sellRate + bestBonus && (
                <Link to="/abonnements" className="block mt-1 text-[11px] text-white/45 hover:text-white underline underline-offset-2">
                  Gold : {catalog.config.sellRate + catalog.config.sellBonusGold} % · Diamond : {catalog.config.sellRate + catalog.config.sellBonusDiamond} % de revente
                </Link>
              )}
              {doublesQty > 0 &&
                (confirmSellAll ? (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      disabled={!!selling}
                      onClick={() => void sell(doubles.map((c) => ({ card_id: c.id, qty: sellable(c) })), 'all')}
                      className="flex-1 rounded-full bg-amber-300 text-black font-bold text-xs px-3 py-2 disabled:opacity-50 cursor-pointer"
                    >
                      {selling === 'all' ? 'Revente…' : `Confirmer +${fmtChips(doublesValue)}`}
                    </button>
                    <button type="button" onClick={() => setConfirmSellAll(false)} className="rounded-full border border-white/20 text-white text-xs px-3 py-2 cursor-pointer">
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmSellAll(true)}
                    className="mt-3 w-full flex items-center justify-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 hover:bg-amber-300/20 text-amber-100 font-semibold text-xs px-4 py-2 cursor-pointer"
                  >
                    <Coins size={14} /> Tout revendre
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
      {(notice || error) && <p className={`text-sm ${error ? 'text-rose-300' : 'text-emerald-300'}`}>{error || notice}</p>}

      {/* Cartes */}
      <section ref={gridRef}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-base sm:text-lg font-bold text-white">Album · {set.name}</h3>
          <div className="flex rounded-full bg-black/70 border border-white/15 p-1 text-xs">
            {(
              [
                ['all', 'Toutes'],
                ['owned', 'Obtenues'],
                ['missing', 'Manquantes'],
                ['doubles', 'Doublons'],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full px-3 py-1.5 font-semibold cursor-pointer ${filter === k ? 'bg-white text-black' : 'text-white/70 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {visible.length === 0 ? <p className="text-center text-sm text-white/50 py-10">Aucune carte dans ce filtre.</p> : grid(visible, true)}

        {secretCards.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-teal-300" />
              <h3 className="text-base sm:text-lg font-bold text-white">Cartes secrètes</h3>
            </div>
            <p className="text-xs text-white/50 mb-4">
              En plus de l'album, si vous avez de la chance : pas nécessaires pour la récompense. Un doublon se revend{' '}
              {fmtChips(priceOf(secretCards[0]))}.
            </p>
            {grid(secretCards, false)}
          </div>
        )}
      </section>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Carte de l'album
// ---------------------------------------------------------------------------

const AlbumCard: React.FC<{
  card: BrandCard;
  width: number;
  setName: string;
  setSize?: number;
  count: number;
  found: number;
  sellable: number;
  price: number;
  selling: boolean;
  onSell: () => void;
}> = ({ card, width, setName, setSize, count, found, sellable, price, selling, onSell }) => (
  <div className="flex flex-col items-center gap-2">
    <div className="relative">
      {found === 0 ? (
        <BrandCardSlot card={card} width={width} setSize={setSize} />
      ) : (
        // Carte secrète revendue jusqu'au dernier exemplaire : reste « découverte », grisée
        <BrandCardFace card={card} width={width} lite setName={setName} setSize={setSize} className={count === 0 ? 'opacity-40 grayscale' : undefined} />
      )}
      {count > 1 && <span className="absolute -top-2 -right-2 z-10 rounded-full bg-white text-black text-[11px] font-extrabold px-2 py-0.5 shadow-lg">×{count}</span>}
    </div>
    {sellable > 0 && price > 0 ? (
      <button
        type="button"
        onClick={onSell}
        disabled={selling}
        className="flex items-center gap-1.5 rounded-full border border-amber-300/35 bg-amber-300/10 hover:bg-amber-300/20 text-amber-100 text-[11px] font-semibold px-3 py-1.5 disabled:opacity-50 cursor-pointer"
      >
        <Coins size={12} /> {selling ? 'Revente…' : `Vendre 1 doublon · +${fmtChips(price)}`}
      </button>
    ) : (
      <span className="h-[30px]" />
    )}
  </div>
);
