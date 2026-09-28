/**
 * Espace Membre → « Inventaire » : un seul endroit pour tout ce que le joueur a
 * gagné (véhicules de la roue, cartes des boosters, lots offerts).
 * Chaque objet peut être revendu contre des jetons ou réclamé en jeu.
 * La vue « Album » montre la progression de la collection de cartes.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Check, Coins, Gift, Layers, Loader2, Package, PackageCheck, Play, Search, Sparkles } from 'lucide-react';
import { useCasinoUser } from '../../context/CasinoUserContext';
import { apiMyInventory, apiSellRewards, type BoosterRarity, type Inventory, type InventoryItem } from '../../lib/supabase';
import { REWARD_STATUS, formatRewardDate } from '../../lib/rewards';
import { apiBoosterCatalog } from '../../lib/supabase';
import { BoosterCardFace } from '../boosters/BoosterCard';
import { fmtChips, fmtMoney, modelName, rarityMap, resolveCard, type ResolvedCard } from '../boosters/boosterUtils';
import { useIncremental } from '../boosters/useIncremental';
import { MemberCollection } from './MemberCollection';

type View = 'items' | 'album';
type SourceFilter = 'all' | 'booster' | 'wheel' | 'admin';
type StatusFilter = 'available' | 'claimed' | 'history';
type Sort = 'recent' | 'value';

const WHEEL_RARITY: BoosterRarity = { key: 'ROUE', label: 'Roue de la Fortune', color: '#f5c542', effect: 'glow', sort: 2 };
const GIFT_RARITY: BoosterRarity = { key: 'CADEAU', label: 'Offert', color: '#22d3ee', effect: 'glow', sort: 1 };
const GAP = 20;

/** Visuel « carte » pour n'importe quel lot (carte de booster, véhicule de la roue, cadeau) */
function toCard(item: InventoryItem, rarities: Record<string, BoosterRarity>): ResolvedCard {
  if (item.card) return resolveCard({ ...item.card, value: item.value }, rarities);
  const v = item.vehicle;
  const brand = (v?.manufacturer || '').trim();
  return {
    title: v ? modelName(v.model) : item.label,
    brand: brand ? brand.charAt(0) + brand.slice(1).toLowerCase() : '',
    model: item.vehicle_model || item.label,
    vehicleClass: (v?.class || (item.kind === 'item' ? 'Objet' : '')).replace(/_/g, ' '),
    seats: v?.seats ?? null,
    image: item.image_url || v?.photo_full_url || v?.photo_url || null,
    value: item.value,
    rarity: item.source === 'wheel' ? WHEEL_RARITY : GIFT_RARITY,
    color: item.source === 'wheel' ? WHEEL_RARITY.color : GIFT_RARITY.color,
    holo: false,
    subtitle: item.label !== item.vehicle_model ? item.label : null,
  };
}

function useGrid() {
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
  return { ref: setEl, cols, cardW: width ? Math.floor((width - GAP * (cols - 1)) / cols) : 0 };
}

export const MemberInventory: React.FC<{ showToast: (msg: string) => void }> = ({ showToast }) => {
  const { applyServerProfile, refreshProfile, claimReward } = useCasinoUser();
  const [view, setView] = useState<View>('items');
  const [inv, setInv] = useState<Inventory | null>(null);
  const [rarities, setRarities] = useState<Record<string, BoosterRarity>>({});
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<SourceFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('available');
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ ids: string[]; chips: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const grid = useGrid();

  const load = useCallback(async () => {
    try {
      const [i, cat] = await Promise.all([apiMyInventory(), apiBoosterCatalog(false).catch(() => null)]);
      setInv(i);
      if (cat) setRarities(rarityMap(cat.rarities));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => inv?.items ?? [], [inv]);
  const available = useMemo(() => items.filter((i) => i.status === 'IN_INVENTORY'), [items]);
  const sellable = useMemo(() => available.filter((i) => i.sell_value > 0), [available]);
  const stats = useMemo(
    () => ({
      available: available.length,
      value: available.filter((i) => i.kind !== 'voucher').reduce((a, i) => a + i.value, 0),
      resale: sellable.reduce((a, i) => a + i.sell_value, 0),
      claimed: items.filter((i) => i.status === 'CLAIMED').length,
    }),
    [items, available, sellable],
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => (status === 'available' ? i.status === 'IN_INVENTORY' : status === 'claimed' ? i.status === 'CLAIMED' : !['IN_INVENTORY', 'CLAIMED'].includes(i.status)))
      .filter((i) => source === 'all' || i.source === source)
      .filter((i) => !q || [i.label, i.vehicle_model, i.vehicle?.manufacturer].some((s) => s?.toLowerCase().includes(q)))
      .sort((a, b) => (sort === 'value' ? b.value - a.value : b.created_at.localeCompare(a.created_at)));
  }, [items, status, source, query, sort]);
  const paged = useIncremental(list, 40, `${status}|${source}|${query}|${sort}`);

  // La sélection ne garde que des objets encore revendables
  useEffect(() => {
    setSelected((s) => {
      const kept = [...s].filter((id) => sellable.some((i) => i.id === id));
      return kept.length === s.size ? s : new Set(kept);
    });
  }, [sellable]);
  const selectedChips = sellable.filter((i) => selected.has(i.id)).reduce((a, i) => a + i.sell_value, 0);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const sell = async (ids: string[]) => {
    setBusy('sell');
    try {
      const res = await apiSellRewards(ids);
      applyServerProfile(res.profile);
      showToast(`${res.sold} lot${res.sold > 1 ? 's' : ''} revendu${res.sold > 1 ? 's' : ''} : +${res.chips.toLocaleString('fr-FR')} jetons`);
      setSelected(new Set());
      await load();
      void refreshProfile().catch(() => {});
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const claim = async (id: string) => {
    setBusy(id);
    try {
      await claimReward(id);
      showToast('Réclamation envoyée : la direction vous remettra le véhicule en ville.');
      await load();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const askSell = (ids: string[]) => {
    const chips = sellable.filter((i) => ids.includes(i.id)).reduce((a, i) => a + i.sell_value, 0);
    if (chips > 0) setConfirm({ ids, chips });
  };

  const chip = (active: boolean) =>
    `h-8 px-3 rounded-full text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
      active ? 'bg-white text-black border-white' : 'text-neutral-300 border-white/15 hover:border-white/30'
    }`;

  return (
    <div className="flex flex-col gap-6">
      {/* Vue */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full bg-white/5 border border-white/10 p-1">
          {(
            [
              ['items', 'Mes objets', Package],
              ['album', 'Album des cartes', Layers],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`h-9 px-4 rounded-full text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${view === v ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Link to="/boosters" className="h-9 px-4 rounded-full border border-white/20 hover:bg-white/10 text-xs font-semibold text-white flex items-center">
            Ouvrir un booster
          </Link>
          <Link to="/roue-de-la-fortune" className="h-9 px-4 rounded-full border border-white/20 hover:bg-white/10 text-xs font-semibold text-white flex items-center">
            Tourner la roue
          </Link>
        </div>
      </div>

      {view === 'album' ? (
        <MemberCollection />
      ) : error ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : !inv ? (
        <div className="py-16 flex items-center justify-center gap-2 text-neutral-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> Chargement de l'inventaire…
        </div>
      ) : (
        <>
          {/* Chiffres clés */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Objets disponibles" value={String(stats.available)} />
            <Stat label="Valeur des véhicules" value={fmtMoney(stats.value)} />
            <Stat label={`Revente (${inv.sell_rate} %)`} value={fmtChips(stats.resale)} hint={inv.sell_rate > 0 ? 'si vous revendez tout' : 'revente désactivée'} />
            <Stat label="Réclamés en attente" value={String(stats.claimed)} hint="remise en ville par la direction" />
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['available', 'Disponibles'],
                ['claimed', 'Réclamés'],
                ['history', 'Historique'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" className={chip(status === v)} onClick={() => setStatus(v)}>
                {l}
              </button>
            ))}
            <span className="w-px h-6 bg-white/10 mx-1 hidden sm:block" />
            {(
              [
                ['all', 'Tout'],
                ['booster', 'Boosters'],
                ['wheel', 'Roue'],
                ['admin', 'Offerts'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" className={chip(source === v)} onClick={() => setSource(v)}>
                {l}
              </button>
            ))}
            <div className="relative ml-auto min-w-[160px] flex-1 sm:flex-none">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher…"
                className="w-full sm:w-48 h-9 pl-9 pr-3 rounded-full bg-white/5 border border-white/10 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white/40"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-9 px-3 rounded-full bg-neutral-900 border border-white/10 text-xs text-neutral-300 focus:outline-none cursor-pointer"
              aria-label="Trier"
            >
              <option value="recent">Plus récents</option>
              <option value="value">Plus chers</option>
            </select>
          </div>

          {/* Barre de revente */}
          {status === 'available' && inv.sell_rate > 0 && sellable.length > 0 && (
            <div className="sticky top-[132px] sm:top-[142px] z-20 rounded-2xl border border-white/15 bg-neutral-950/95 backdrop-blur-md px-4 py-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setSelected(selected.size === sellable.length ? new Set() : new Set(sellable.map((i) => i.id)))}
                className="text-xs font-semibold text-neutral-300 hover:text-white flex items-center gap-2 cursor-pointer"
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center ${selected.size === sellable.length ? 'bg-white border-white text-black' : 'border-white/30'}`}>
                  {selected.size === sellable.length && <Check size={11} />}
                </span>
                {selected.size ? `${selected.size} sélectionné${selected.size > 1 ? 's' : ''}` : 'Tout sélectionner'}
              </button>
              <div className="ml-auto flex flex-wrap gap-2">
                {selected.size > 0 && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => askSell([...selected])}
                    className="h-9 px-4 rounded-full bg-white text-black text-xs font-bold flex items-center gap-2 hover:bg-neutral-200 disabled:opacity-50 cursor-pointer"
                  >
                    <Coins size={14} /> Vendre la sélection · {fmtChips(selectedChips)}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => askSell(sellable.map((i) => i.id))}
                  className="h-9 px-4 rounded-full border border-white/20 text-white text-xs font-semibold hover:bg-white/10 disabled:opacity-50 cursor-pointer"
                >
                  Tout vendre · {fmtChips(stats.resale)}
                </button>
              </div>
            </div>
          )}

          {/* Grille */}
          {list.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-10 flex flex-col items-center text-center gap-3">
              <Gift size={28} className="text-white/60" />
              <p className="text-sm text-neutral-300">{status === 'available' ? 'Aucun objet disponible.' : 'Rien ici pour le moment.'}</p>
              <p className="text-xs text-neutral-500">Ouvrez un booster ou tournez la roue pour gagner des véhicules.</p>
            </div>
          ) : (
            <div ref={grid.ref} className="grid pt-2" style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gap: GAP }}>
              {paged.visible.map((item) => {
                const card = toCard(item, rarities);
                const st = REWARD_STATUS[item.status];
                const canSell = item.status === 'IN_INVENTORY' && item.sell_value > 0 && inv.sell_rate > 0;
                const isSel = selected.has(item.id);
                return (
                  <div key={item.id} className="flex flex-col gap-2" style={{ width: grid.cardW }}>
                    <div className={`relative ${item.status === 'IN_INVENTORY' ? '' : 'opacity-60'}`}>
                      {item.kind === 'vehicle' || item.card ? (
                        <BoosterCardFace card={card} width={grid.cardW} lite />
                      ) : item.kind === 'voucher' ? (
                        <div className="rounded-[14px] border border-emerald-400/40 bg-[#07100b] flex flex-col items-center justify-center gap-2 text-center p-4" style={{ width: grid.cardW, height: grid.cardW * 1.4 }}>
                          <Sparkles size={36} className="text-emerald-300" />
                          <span className="text-[11px] uppercase tracking-wider text-emerald-300/80 font-mono">Bonus offert</span>
                          <span className="text-sm font-semibold text-white">{item.voucher?.game === 'wanted' ? 'Wanted Dead or a Wild' : 'The Dog House'}</span>
                          <span className="text-lg font-bold text-white font-mono">{fmtChips(item.value)}</span>
                          <span className="text-[10px] text-neutral-400">Bonus gratuit, sans mise</span>
                        </div>
                      ) : (
                        <div className="rounded-[14px] border border-cyan-400/40 bg-[#0a0a0d] flex flex-col items-center justify-center gap-3 text-center p-4" style={{ width: grid.cardW, height: grid.cardW * 1.4 }}>
                          <Gift size={36} className="text-cyan-300" />
                          <span className="text-sm font-semibold text-white">{item.label}</span>
                        </div>
                      )}
                      {canSell && (
                        <button
                          type="button"
                          onClick={() => toggle(item.id)}
                          aria-label={isSel ? 'Désélectionner' : 'Sélectionner'}
                          className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-md border flex items-center justify-center cursor-pointer ${isSel ? 'bg-white border-white text-black' : 'bg-black/70 border-white/30 text-transparent hover:border-white/60'}`}
                        >
                          <Check size={14} />
                        </button>
                      )}
                      {item.status !== 'IN_INVENTORY' && (
                        <span className={`absolute top-2 left-1/2 -translate-x-1/2 z-10 text-[10px] font-semibold px-2 py-0.5 rounded-full border backdrop-blur-md whitespace-nowrap ${st.className}`}>
                          {st.label}
                          {item.status === 'SOLD' && item.sold_for ? ` · ${fmtChips(item.sold_for)}` : ''}
                        </span>
                      )}
                    </div>
                    {item.status === 'IN_INVENTORY' && item.kind === 'voucher' ? (
                      <Link
                        to={item.voucher?.game === 'wanted' ? '/wanted' : '/slots'}
                        title="Ouvrir la machine et utiliser le bonus"
                        className="h-8 rounded-full bg-white text-black text-[11px] font-bold hover:bg-neutral-200 flex items-center justify-center gap-1.5"
                      >
                        <Play size={12} fill="currentColor" /> Utiliser
                      </Link>
                    ) : item.status === 'IN_INVENTORY' ? (
                      <div className="flex gap-1.5">
                        {canSell && (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => askSell([item.id])}
                            title={`Revendre ${inv.sell_rate} % de la valeur`}
                            className="flex-1 min-w-0 h-8 rounded-full bg-white text-black text-[11px] font-bold hover:bg-neutral-200 disabled:opacity-50 cursor-pointer truncate px-2"
                          >
                            {fmtChips(item.sell_value)}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void claim(item.id)}
                          title="Recevoir le véhicule en ville"
                          className={`${canSell ? 'w-9 shrink-0' : 'flex-1'} h-8 rounded-full border border-white/20 text-white text-[11px] font-semibold hover:bg-white/10 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5`}
                        >
                          {busy === item.id ? <Loader2 size={13} className="animate-spin" /> : <PackageCheck size={13} />}
                          {!canSell && 'Réclamer'}
                        </button>
                      </div>
                    ) : (
                      <p className="text-[10px] text-neutral-500 text-center truncate">
                        {item.status === 'SOLD' ? `Revendu le ${formatRewardDate(item.sold_at)}` : `Gagné le ${formatRewardDate(item.created_at)}`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {paged.hasMore && (
            <div ref={paged.sentinelRef} className="py-6 text-center text-xs text-neutral-500">
              Chargement… ({paged.remaining} restant{paged.remaining > 1 ? 's' : ''})
            </div>
          )}
          <p className="text-xs text-neutral-500">
            <b className="text-neutral-300">Revendre</b> crédite immédiatement {inv.sell_rate} % de la valeur du véhicule en jetons.{' '}
            <b className="text-neutral-300">Réclamer</b> (<PackageCheck size={11} className="inline" />) prévient la direction qui vous remet le véhicule en ville.{' '}
            <b className="text-neutral-300">Utiliser</b> lance un bonus offert directement dans la machine.
          </p>
        </>
      )}

      {confirm && (
        <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => busy === null && setConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-neutral-950 border border-white/15 p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold text-lg">
              Revendre {confirm.ids.length} objet{confirm.ids.length > 1 ? 's' : ''} ?
            </h3>
            <p className="text-sm text-neutral-400">
              Vous recevez <b className="text-white font-mono">{fmtChips(confirm.chips)}</b> tout de suite. Les véhicules revendus ne pourront plus être
              réclamés en jeu.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} disabled={busy !== null} className="h-10 px-4 rounded-full text-sm text-neutral-300 hover:text-white cursor-pointer">
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void sell(confirm.ids)}
                disabled={busy !== null}
                className="h-10 px-5 rounded-full bg-white text-black text-sm font-bold hover:bg-neutral-200 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {busy === 'sell' ? <Loader2 size={15} className="animate-spin" /> : <Coins size={15} />} Revendre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 min-w-0">
    <div className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</div>
    <div className="text-xl font-bold font-mono text-white mt-1 truncate">{value}</div>
    {hint && <div className="text-[11px] text-neutral-500 mt-1">{hint}</div>}
  </div>
);
