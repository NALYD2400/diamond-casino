/**
 * Espace Membre → « Ma collection » : les cartes véhicules obtenues dans les
 * boosters, dans le même visuel qu'à l'ouverture. Progression par booster,
 * doubles, cartes manquantes, filtres par rareté / booster.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Gem, Layers, Loader2, Lock, Package, Search, X } from 'lucide-react';
import {
  apiBoosterCatalog,
  apiMyBoosterCollection,
  type BoosterCatalog,
  type BoosterCardData,
  type BoosterCollection,
  type BoosterCollectionCard,
} from '../../lib/supabase';
import { BoosterCardFace } from '../boosters/BoosterCard';
import { fmtMoney, rarityMap, resolveCard, rgba } from '../boosters/boosterUtils';
import { formatRewardDate } from '../../lib/rewards';
import { useIncremental } from '../boosters/useIncremental';

type Show = 'all' | 'owned' | 'missing' | 'doubles';
type Sort = 'recent' | 'rarity' | 'value';

interface Entry {
  card: BoosterCardData;
  owned: BoosterCollectionCard | null;
}

const NEW_MS = 24 * 3600 * 1000;

const GAP = 20;

/** Grille pleine largeur : nombre de colonnes selon la place, cartes élargies pour remplir la ligne */
function useCardGrid() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  const min = width < 640 ? 140 : 175;
  const cols = Math.max(2, Math.floor((width + GAP) / (min + GAP)));
  const cardW = width ? Math.floor((width - GAP * (cols - 1)) / cols) : 0;
  return { ref: setEl, cols, cardW };
}

export const MemberCollection: React.FC = () => {
  const [collection, setCollection] = useState<BoosterCollection | null>(null);
  const [catalog, setCatalog] = useState<BoosterCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<Show>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [rarity, setRarity] = useState('');
  const [packId, setPackId] = useState('');
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState<Entry | null>(null);
  const grid = useCardGrid();
  const cardW = grid.cardW;

  useEffect(() => {
    Promise.all([apiMyBoosterCollection(), apiBoosterCatalog(false)])
      .then(([col, cat]) => {
        setCollection(col);
        setCatalog(cat);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const rarities = useMemo(() => rarityMap(catalog?.rarities ?? []), [catalog]);
  const ownedById = useMemo(() => Object.fromEntries((collection?.cards ?? []).map((c) => [c.id, c])), [collection]);

  // Toutes les cartes connues : celles des boosters en vente + celles déjà obtenues
  const entries: Entry[] = useMemo(() => {
    const map = new Map<string, Entry>();
    for (const c of catalog?.cards ?? []) map.set(c.id, { card: c, owned: ownedById[c.id] ?? null });
    for (const c of collection?.cards ?? []) if (!map.has(c.id)) map.set(c.id, { card: c, owned: c });
    return [...map.values()];
  }, [catalog, collection, ownedById]);

  const packs = useMemo(
    () =>
      (catalog?.packs ?? [])
        .filter((p) => p.cards.length > 0)
        .map((p) => ({ pack: p, total: p.cards.length, owned: p.cards.filter((pc) => ownedById[pc.card_id]).length })),
    [catalog, ownedById],
  );
  const packCards = useMemo(() => {
    const p = catalog?.packs.find((x) => x.id === packId);
    return p ? new Set(p.cards.map((pc) => pc.card_id)) : null;
  }, [catalog, packId]);

  const stats = useMemo(() => {
    const owned = collection?.cards ?? [];
    return {
      distinct: owned.length,
      total: entries.length,
      copies: owned.reduce((a, c) => a + c.count, 0),
      doubles: owned.reduce((a, c) => a + Math.max(0, c.count - 1), 0),
      value: owned.reduce((a, c) => a + c.value * c.count, 0),
    };
  }, [collection, entries]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => (show === 'owned' ? e.owned : show === 'missing' ? !e.owned : show === 'doubles' ? (e.owned?.count ?? 0) > 1 : true))
      .filter((e) => !rarity || e.card.rarity === rarity)
      .filter((e) => !packCards || packCards.has(e.card.id))
      .filter((e) => !q || [e.card.title, e.card.vehicle_model, e.card.vehicle?.manufacturer].some((s) => s?.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (!!a.owned !== !!b.owned) return a.owned ? -1 : 1;
        const ra = rarities[a.card.rarity]?.sort ?? 0;
        const rb = rarities[b.card.rarity]?.sort ?? 0;
        if (sort === 'rarity') return rb - ra || b.card.value - a.card.value;
        if (sort === 'value') return b.card.value - a.card.value;
        return (b.owned?.last_at ?? '').localeCompare(a.owned?.last_at ?? '') || rb - ra;
      });
  }, [entries, show, rarity, packCards, query, sort, rarities]);

  const paged = useIncremental(list, 40, `${show}|${sort}|${rarity}|${packId}|${query}`);

  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!collection || !catalog) {
    return (
      <div className="py-16 flex items-center justify-center gap-2 text-neutral-400 text-sm">
        <Loader2 size={16} className="animate-spin" /> Chargement de votre collection…
      </div>
    );
  }

  if (collection.cards.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-10 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
          <Layers size={24} />
        </div>
        <div>
          <h3 className="font-semibold text-white">Votre collection est vide</h3>
          <p className="text-sm text-neutral-400 mt-1">Ouvrez un booster pour obtenir vos premières cartes véhicules.</p>
        </div>
        <Link to="/boosters" className="rounded-full px-6 py-3 text-xs font-bold uppercase tracking-wider bg-white hover:bg-neutral-200 text-black flex items-center gap-2 transition-colors">
          <Package size={15} /> Ouvrir un booster
        </Link>
      </div>
    );
  }

  const chip = (active: boolean) =>
    `h-8 px-3 rounded-full text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
      active ? 'bg-white text-black border-white' : 'text-neutral-300 border-white/15 hover:border-white/30'
    }`;

  return (
    <div className="flex flex-col gap-6">
      {/* Chiffres clés */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Cartes obtenues" value={`${stats.distinct} / ${stats.total}`} bar={stats.total ? stats.distinct / stats.total : 0} />
        <Stat label="Exemplaires" value={String(stats.copies)} hint={stats.doubles ? `dont ${stats.doubles} double${stats.doubles > 1 ? 's' : ''}` : 'aucun double'} />
        <Stat label="Valeur des véhicules" value={fmtMoney(stats.value)} hint="tous exemplaires confondus" />
        <Stat label="Boosters ouverts" value={String(collection.openings)} />
      </div>

      {/* Raretés */}
      <div className="flex flex-wrap gap-2">
        {catalog.rarities.map((r) => {
          const have = (collection.cards ?? []).filter((c) => c.rarity === r.key).length;
          const all = entries.filter((e) => e.card.rarity === r.key).length;
          if (!all) return null;
          const active = rarity === r.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setRarity(active ? '' : r.key)}
              className="h-9 px-3 rounded-full border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              style={active ? { background: r.color, borderColor: r.color, color: '#000' } : { color: r.color, borderColor: rgba(r.color, 0.35), background: rgba(r.color, 0.06) }}
            >
              <Gem size={12} /> {r.label}
              <span className="font-mono opacity-80">
                {have}/{all}
              </span>
            </button>
          );
        })}
      </div>

      {/* Progression par booster */}
      {packs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {packs.map(({ pack, total, owned }) => {
            const active = packId === pack.id;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => setPackId(active ? '' : pack.id)}
                className={`rounded-2xl border p-4 text-left transition-colors cursor-pointer ${active ? 'border-white/40 bg-white/[0.06]' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pack.accent_color, boxShadow: `0 0 8px ${pack.accent_color}` }} />
                    <span className="text-sm font-semibold text-white truncate">{pack.name}</span>
                  </span>
                  <span className="text-xs font-mono text-neutral-400 shrink-0">
                    {owned}/{total} · {Math.floor((owned / total) * 100)} %
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-3">
                  <div className="h-full rounded-full transition-all" style={{ width: `${(owned / total) * 100}%`, background: pack.accent_color }} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['all', 'Toutes'],
            ['owned', 'Obtenues'],
            ['missing', 'Manquantes'],
            ['doubles', 'Doubles'],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" className={chip(show === v)} onClick={() => setShow(v)}>
            {l}
          </button>
        ))}
        <div className="relative ml-auto min-w-[180px] flex-1 sm:flex-none">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            className="w-full sm:w-56 h-9 pl-9 pr-3 rounded-full bg-white/5 border border-white/10 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white/40"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-9 px-3 rounded-full bg-neutral-900 border border-white/10 text-xs text-neutral-300 focus:outline-none cursor-pointer"
          aria-label="Trier"
        >
          <option value="recent">Plus récentes</option>
          <option value="rarity">Plus rares</option>
          <option value="value">Plus chères</option>
        </select>
      </div>

      {/* Grille */}
      {list.length === 0 ? (
        <p className="text-sm text-neutral-500 py-10 text-center">Aucune carte pour ces filtres.</p>
      ) : (
        <div ref={grid.ref} className="grid pt-2" style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gap: GAP }}>
          {paged.visible.map((e) => {
            const rc = resolveCard(e.card, rarities);
            const isNew = e.owned && Date.now() - new Date(e.owned.first_at).getTime() < NEW_MS;
            return (
              <div key={e.card.id} className="relative" style={{ width: cardW, minHeight: cardW * 1.4 }}>
                {e.owned ? (
                  <button type="button" onClick={() => setZoom(e)} className="block cursor-pointer" aria-label={`Voir ${rc.title}`}>
                    <BoosterCardFace card={rc} width={cardW} lite />
                  </button>
                ) : (
                  <div className="relative" title="Carte pas encore obtenue">
                    <div className="opacity-[0.18] pointer-events-none">
                      <BoosterCardFace card={rc} width={cardW} interactive={false} lite />
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
                      <div className="w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center">
                        <Lock size={16} />
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.2em]">Non obtenue</span>
                    </div>
                  </div>
                )}
                {e.owned && e.owned.count > 1 && (
                  <span className="absolute -top-2.5 -right-2.5 z-10 min-w-7 h-7 px-2 rounded-full bg-white text-black text-xs font-black font-mono flex items-center justify-center shadow-lg">
                    ×{e.owned.count}
                  </span>
                )}
                {isNew && (
                  <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 z-10 h-5 px-2 rounded-full text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-lg whitespace-nowrap" style={{ background: rc.color, color: '#000' }}>
                    Nouveau
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
        {paged.hasMore && (
          <div ref={paged.sentinelRef} className="py-6 text-center text-xs text-neutral-500">
            Chargement de {Math.min(40, paged.remaining)} carte(s) de plus… ({paged.remaining} restante(s))
          </div>
        )}

      <p className="text-xs text-neutral-500">
        Chaque carte obtenue est aussi un véhicule dans <b className="text-neutral-300">Mes récompenses</b> : réclamez-le pour le recevoir en ville.
      </p>

      {zoom && zoom.owned && <CardZoom entry={zoom} rarities={rarities} onClose={() => setZoom(null)} />}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; hint?: string; bar?: number }> = ({ label, value, hint, bar }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 min-w-0">
    <div className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</div>
    <div className="text-xl font-bold font-mono text-white mt-1 truncate">{value}</div>
    {bar !== undefined && (
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-2">
        <div className="h-full rounded-full bg-white" style={{ width: `${bar * 100}%` }} />
      </div>
    )}
    {hint && <div className="text-[11px] text-neutral-500 mt-1">{hint}</div>}
  </div>
);

const CardZoom: React.FC<{ entry: Entry; rarities: ReturnType<typeof rarityMap>; onClose: () => void }> = ({ entry, rarities, onClose }) => {
  const rc = resolveCard(entry.card, rarities);
  const owned = entry.owned!;
  const w = typeof window !== 'undefined' ? Math.min(300, window.innerWidth - 64) : 300;
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative flex flex-col md:flex-row items-center gap-8 max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute -top-2 -right-2 md:top-0 md:right-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center" aria-label="Fermer">
          <X size={16} />
        </button>
        <div className="relative">
          <div className="absolute inset-[-15%] rounded-full blur-3xl" style={{ background: rgba(rc.color, 0.3) }} />
          <BoosterCardFace card={rc} width={w} className="relative" />
        </div>
        <div className="text-center md:text-left">
          <div className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: rc.color }}>
            {rc.rarity.label}
          </div>
          <h3 className="text-3xl font-bold text-white mt-1" style={{ fontFamily: 'var(--font-tight)' }}>
            {rc.brand} {rc.title}
          </h3>
          <p className="text-sm text-neutral-400 mt-1">{rc.vehicleClass}</p>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <dt className="text-neutral-500">Valeur</dt>
            <dd className="font-mono text-white">{fmtMoney(rc.value)}</dd>
            <dt className="text-neutral-500">Exemplaires</dt>
            <dd className="font-mono text-white">{owned.count}</dd>
            <dt className="text-neutral-500">Première fois</dt>
            <dd className="text-white">{formatRewardDate(owned.first_at)}</dd>
            {owned.count > 1 && (
              <>
                <dt className="text-neutral-500">Dernière fois</dt>
                <dd className="text-white">{formatRewardDate(owned.last_at)}</dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
};
