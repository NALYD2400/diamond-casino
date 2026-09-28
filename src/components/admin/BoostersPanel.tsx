/**
 * Console → Boosters : cartes véhicules, boosters (paquets) et raretés.
 * Tout est modifiable ; le serveur re-valide chaque enregistrement.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Car, CheckCircle2, Copy, FlaskConical, Gem, Layers, Package, Pencil, Plus, RefreshCw, Search, Trash2, TriangleAlert, Wand2 } from 'lucide-react';
import {
  apiAdminBulkCreateBoosterCards,
  apiAdminDeleteBoosterCards,
  apiAdminDeleteBoosterPack,
  apiAdminSaveBoosterCard,
  apiAdminSetVehicleDealership,
  apiAdminSaveBoosterPack,
  apiAdminSaveBoosterRarities,
  apiAdminSimulateBooster,
  apiBoosterCatalog,
  dbSearchVehicles,
  type BoosterCardData,
  type BoosterCatalog,
  type BoosterEffect,
  type BoosterPackData,
  type BoosterRarity,
  type BoosterSimulation,
  type VehicleCatalogEntry,
} from '../../lib/supabase';
import { BoosterCardBack, BoosterCardFace } from '../boosters/BoosterCard';
import { BoosterPack } from '../boosters/BoosterPack';
import { expectedRarityShares, fmtMoney, modelName, packExpectedValue, packOdds, packRtp, rarityMap, resolveCard, suggestPrice, tiltRarityWeights } from '../boosters/boosterUtils';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import { VehiclePicker } from './VehiclePicker';
import { useIncremental } from '../boosters/useIncremental';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  HelpBox,
  Modal,
  NumberInput,
  PageHeader,
  SaveBar,
  Segmented,
  Toggle,
  cx,
  fmt,
  fmtChips,
  inputClass,
} from './ui';

type Section = 'cards' | 'packs' | 'rarities' | 'dealership';
type Toast = (m: string, error?: boolean) => void;

const CLASSES = ['SUPER', 'SPORT', 'SPORT_CLASSIC', 'MUSCLE', 'COUPE', 'SEDAN', 'SUV', 'OFF_ROAD', 'COMPACT', 'MOTORCYCLE', 'VAN', 'COMMERCIAL', 'UTILITY', 'INDUSTRIAL', 'SERVICE', 'EMERGENCY', 'MILITARY', 'OPEN_WHEEL', 'HELICOPTER', 'PLANE', 'BOAT', 'CYCLE'];

const EFFECTS: { value: BoosterEffect; label: string; hint: string }[] = [
  { value: 'none', label: 'Aucun', hint: 'Carte simple' },
  { value: 'glow', label: 'Lueur', hint: 'Halo coloré à la révélation' },
  { value: 'holo', label: 'Holo', hint: 'Reflet holographique + particules' },
  { value: 'rays', label: 'Rayons', hint: 'Suspense, rayons de lumière, flash' },
  { value: 'mythic', label: 'Mythique', hint: 'Écran noir, cadre arc-en-ciel, explosion' },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Liste déroulante compacte (inputClass impose w-full) */
const selectClass = inputClass.replace('w-full ', '') + ' w-auto bg-neutral-900 text-white cursor-pointer [color-scheme:dark]';
const URL_RE = /^(https:\/\/|\/)[^\s"'<>]{1,500}$/;

const vehicleOf = (v: VehicleCatalogEntry): BoosterCardData['vehicle'] => ({
  model: v.model,
  manufacturer: v.manufacturer,
  class: v.class,
  type: v.type,
  seats: v.seats,
  price: v.price,
  photo_url: v.photo_url,
  photo_full_url: v.photo_full_url,
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const BoostersPanel: React.FC<{ showToast: Toast }> = ({ showToast }) => {
  const [section, setSection] = useState<Section>('cards');
  const [catalog, setCatalog] = useState<BoosterCatalog | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCatalog(await apiBoosterCatalog(true));
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = catalog ? { cards: catalog.cards.length, packs: catalog.packs.length, rarities: catalog.rarities.length } : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Boosters"
        subtitle="Créez les cartes à partir du catalogue véhicules, réglez leur rareté et composez les boosters vendus aux joueurs. Chaque carte tirée est un véhicule livré dans l'inventaire du joueur."
        actions={
          <>
            <Segmented
              value={section}
              onChange={setSection}
              options={[
                { value: 'cards', label: `Cartes${counts ? ` (${counts.cards})` : ''}` },
                { value: 'packs', label: `Boosters${counts ? ` (${counts.packs})` : ''}` },
                { value: 'rarities', label: 'Raretés' },
                { value: 'dealership', label: 'Concession' },
              ]}
            />
            <Button onClick={() => void load()} loading={loading}>
              <RefreshCw size={13} /> Actualiser
            </Button>
          </>
        }
      />

      {!catalog ? (
        <EmptyState icon={<Layers size={32} />} title={loading ? 'Chargement…' : 'Catalogue indisponible'} />
      ) : section === 'cards' ? (
        <CardsSection catalog={catalog} reload={load} showToast={showToast} />
      ) : section === 'packs' ? (
        <PacksSection catalog={catalog} reload={load} showToast={showToast} />
      ) : section === 'rarities' ? (
        <RaritiesSection catalog={catalog} reload={load} showToast={showToast} />
      ) : (
        <DealershipSection reload={load} showToast={showToast} />
      )}
    </div>
  );
};

interface SectionProps {
  catalog: BoosterCatalog;
  reload: () => Promise<void>;
  showToast: Toast;
}

// ---------------------------------------------------------------------------
// Cartes
// ---------------------------------------------------------------------------

const CardsSection: React.FC<SectionProps> = ({ catalog, reload, showToast }) => {
  const rarities = useMemo(() => rarityMap(catalog.rarities), [catalog.rarities]);
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState('');
  const [vClass, setVClass] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive' | 'orphan'>('all');
  const [editing, setEditing] = useState<BoosterCardData | 'new' | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const packsOf = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const p of catalog.packs) for (const pc of p.cards) (m[pc.card_id] ??= []).push(p.name);
    return m;
  }, [catalog.packs]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.cards
      .filter((c) => !rarity || c.rarity === rarity)
      .filter((c) => !vClass || c.vehicle?.class === vClass)
      .filter((c) => (status === 'active' ? c.active : status === 'inactive' ? !c.active : status === 'orphan' ? !packsOf[c.id] : true))
      .filter((c) => !q || [c.title, c.vehicle_model, c.vehicle?.manufacturer, c.subtitle].some((s) => s?.toLowerCase().includes(q)))
      .sort((a, b) => (rarities[b.rarity]?.sort ?? 0) - (rarities[a.rarity]?.sort ?? 0) || b.value - a.value);
  }, [catalog.cards, query, rarity, vClass, status, rarities, packsOf]);

  const paged = useIncremental(list, 40, `${query}|${rarity}|${vClass}|${status}`);

  const perRarity = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of catalog.cards) m[c.rarity] = (m[c.rarity] ?? 0) + 1;
    return m;
  }, [catalog.cards]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const doDelete = async (ids: string[]) => {
    setBusy(true);
    try {
      const n = await apiAdminDeleteBoosterCards(ids);
      showToast(`${n} carte(s) supprimée(s).`);
      setSelected(new Set());
      await reload();
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setBusy(false);
      setConfirmDelete(null);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {catalog.rarities.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRarity((x) => (x === r.key ? '' : r.key))}
            className={cx('rounded-2xl border p-3 text-left transition-colors cursor-pointer', rarity === r.key ? 'bg-white/10 border-white/30' : 'bg-neutral-950 border-white/10 hover:border-white/20')}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: r.color }}>
              <Gem size={12} /> {r.label}
            </div>
            <div className="text-xl font-bold font-mono text-white mt-1">{fmt(perRarity[r.key] ?? 0)}</div>
          </button>
        ))}
        <div className="rounded-2xl border border-white/10 bg-neutral-950 p-3">
          <div className="text-[11px] font-semibold text-neutral-400">Total</div>
          <div className="text-xl font-bold font-mono text-white mt-1">{fmt(catalog.cards.length)}</div>
        </div>
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-white/10">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une carte, une marque…" className={cx(inputClass, 'pl-9')} />
          </div>
          <select value={rarity} onChange={(e) => setRarity(e.target.value)} className={selectClass}>
            <option value="">Toutes raretés</option>
            {catalog.rarities.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <select value={vClass} onChange={(e) => setVClass(e.target.value)} className={selectClass}>
            <option value="">Toutes classes</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'Toutes' },
              { value: 'active', label: 'Actives' },
              { value: 'inactive', label: 'Inactives' },
              { value: 'orphan', label: 'Hors booster' },
            ]}
          />
          <div className="flex gap-2 ml-auto">
            {selected.size > 0 && (
              <Button variant="danger" onClick={() => setConfirmDelete([...selected])}>
                <Trash2 size={13} /> Supprimer ({selected.size})
              </Button>
            )}
            <Button onClick={() => setBulkOpen(true)}>
              <Wand2 size={13} /> Création en masse
            </Button>
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={13} /> Nouvelle carte
            </Button>
          </div>
        </div>

        {list.length === 0 ? (
          <EmptyState
            icon={<Car size={32} />}
            title={catalog.cards.length ? 'Aucune carte pour ces filtres' : 'Aucune carte pour le moment'}
            hint={catalog.cards.length ? undefined : 'Créez une carte à partir d’un véhicule, ou utilisez la création en masse pour générer toute une classe d’un coup.'}
          />
        ) : (
          <div className="p-4 grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
            {paged.visible.map((c) => {
              const rc = resolveCard(c, rarities);
              const inPacks = packsOf[c.id] ?? [];
              return (
                <div key={c.id} className="group relative flex flex-col items-center gap-2">
                  <div className={cx('relative transition-opacity', !c.active && 'opacity-40')}>
                    <BoosterCardFace card={rc} width={170} lite />
                    <label className="absolute top-2 left-2 z-10 w-6 h-6 rounded-md bg-black/70 border border-white/25 flex items-center justify-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-white cursor-pointer" />
                    </label>
                    <div className="absolute inset-0 z-[5] rounded-[14px] bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button variant="primary" size="sm" onClick={() => setEditing(c)}>
                        <Pencil size={12} /> Modifier
                      </Button>
                      <Button variant="danger" size="sm" className="bg-black/60" onClick={() => setConfirmDelete([c.id])}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                  <div className="w-full flex flex-wrap items-center justify-center gap-1 text-[10px]">
                    {!c.active && <Badge tone="bad">Inactive</Badge>}
                    {inPacks.length ? (
                      <span className="text-neutral-500 truncate max-w-full" title={inPacks.join(', ')}>
                        {inPacks.length} booster{inPacks.length > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <Badge tone="warn">Hors booster</Badge>
                    )}
                  </div>
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
      </Card>

      <HelpBox title="Comment créer les cartes ?">
        <p>
          <b>Nouvelle carte</b> : choisissez un véhicule du catalogue ; la photo, la marque, la classe et la <b>valeur</b> (prix du catalogue) sont reprises
          automatiquement. Vous pouvez tout surcharger : nom affiché, sous-titre, image (URL), valeur, couleur du cadre, effet holo.
        </p>
        <p>
          <b>Création en masse</b> : générez les cartes de toute une classe ou d'une marque, la rareté étant attribuée selon le prix du véhicule (paliers
          réglables). Les cartes peuvent être ajoutées directement à un booster.
        </p>
        <p>Une carte <b>inactive</b> ne peut plus sortir d'aucun booster. Supprimer une carte n'enlève pas les véhicules déjà gagnés par les joueurs.</p>
      </HelpBox>

      {editing && (
        <CardEditor
          catalog={catalog}
          card={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null);
            showToast(msg);
            await reload();
          }}
          showToast={showToast}
        />
      )}
      {bulkOpen && (
        <BulkEditor
          catalog={catalog}
          onClose={() => setBulkOpen(false)}
          onDone={async (n) => {
            setBulkOpen(false);
            showToast(n ? `${n} carte(s) créée(s).` : 'Aucune nouvelle carte (déjà existantes ou aucun véhicule).');
            await reload();
          }}
          showToast={showToast}
        />
      )}
      {confirmDelete && (
        <Modal title="Supprimer des cartes ?" onClose={() => !busy && setConfirmDelete(null)}>
          <p className="text-[13px] text-neutral-300">
            {confirmDelete.length} carte(s) seront retirées de tous les boosters. Les véhicules déjà gagnés restent dans l'inventaire des joueurs.
            Pour les retirer temporairement, préférez les rendre <b>inactives</b>.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="subtle" onClick={() => setConfirmDelete(null)} disabled={busy}>
              Annuler
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void doDelete(confirmDelete)}>
              Supprimer
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Éditeur de carte (aperçu en direct)
// ---------------------------------------------------------------------------

const CardEditor: React.FC<{
  catalog: BoosterCatalog;
  card: BoosterCardData | null;
  onClose: () => void;
  onSaved: (msg: string) => Promise<void>;
  showToast: Toast;
}> = ({ catalog, card, onClose, onSaved, showToast }) => {
  const rarities = useMemo(() => rarityMap(catalog.rarities), [catalog.rarities]);
  const [vehicle, setVehicle] = useState<BoosterCardData['vehicle']>(card?.vehicle ?? null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    vehicle_model: card?.vehicle_model ?? '',
    rarity: card?.rarity ?? catalog.rarities[0]?.key ?? '',
    title: card?.title ?? '',
    subtitle: card?.subtitle ?? '',
    image_url: card?.image_url ?? '',
    value_override: card?.value_override ?? null,
    accent_color: card?.accent_color ?? '',
    holo: card?.holo ?? false,
    active: card?.active ?? true,
  });
  const initialPacks = useMemo(() => (card ? catalog.packs.filter((p) => p.cards.some((pc) => pc.card_id === card.id)).map((p) => p.id) : []), [catalog.packs, card]);
  const [packIds, setPackIds] = useState<string[]>(initialPacks);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...p }));

  const preview: BoosterCardData = {
    id: card?.id ?? 'preview',
    ...draft,
    title: draft.title || null,
    subtitle: draft.subtitle || null,
    image_url: URL_RE.test(draft.image_url) ? draft.image_url : null,
    accent_color: HEX.test(draft.accent_color) ? draft.accent_color : null,
    vehicle,
    value: draft.value_override ?? vehicle?.price ?? 0,
  };
  const rc = resolveCard(preview, rarities);

  const errors: string[] = [];
  if (!draft.vehicle_model) errors.push('Choisissez un véhicule.');
  if (!draft.rarity) errors.push('Choisissez une rareté.');
  if (draft.image_url && !URL_RE.test(draft.image_url)) errors.push('URL d’image invalide (https://… ou /chemin).');
  if (draft.title.length > 60) errors.push('Nom trop long (60 max).');
  if (draft.subtitle.length > 80) errors.push('Sous-titre trop long (80 max).');

  const save = async (asCopy = false) => {
    if (errors.length) return;
    setSaving(true);
    try {
      const saved = await apiAdminSaveBoosterCard({
        id: asCopy ? undefined : card?.id,
        ...draft,
        title: draft.title.trim() || null,
        subtitle: draft.subtitle.trim() || null,
        image_url: draft.image_url.trim() || null,
        accent_color: HEX.test(draft.accent_color) ? draft.accent_color : null,
      });
      // Boosters dont la composition change
      const touched = catalog.packs.filter((p) => {
        const had = !asCopy && p.cards.some((pc) => pc.card_id === saved.id);
        return had !== packIds.includes(p.id);
      });
      for (const p of touched) {
        const cards = packIds.includes(p.id)
          ? [...p.cards.filter((pc) => pc.card_id !== saved.id), { card_id: saved.id, weight: 1 }]
          : p.cards.filter((pc) => pc.card_id !== saved.id);
        const { id, ...rest } = p;
        await apiAdminSaveBoosterPack({ id, ...rest, cards });
      }
      await onSaved(card && !asCopy ? 'Carte mise à jour.' : 'Carte créée.');
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  const photoChoices = vehicle
    ? [
        { label: 'Photo HD', url: vehicle.photo_full_url },
        { label: 'Photo légère', url: vehicle.photo_url },
        { label: 'Capture', url: screenshot },
      ].filter((p) => p.url)
    : [];

  return (
    <Modal title={card ? `Modifier la carte · ${rc.title}` : 'Nouvelle carte'} onClose={() => !saving && onClose()} width="max-w-5xl">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="flex flex-col gap-5 min-w-0">
          <Field label="Véhicule" hint={vehicle ? `Sélectionné : ${vehicle.manufacturer ?? ''} ${vehicle.model} · prix concession ${fmtMoney(vehicle.price ?? 0)}` : 'Uniquement les véhicules vendus en concession (liste réglable dans « Concession »).'}>
            <VehiclePicker
              dealershipOnly
              selectedModel={draft.vehicle_model}
              className="max-h-56"
              onSelect={(v) => {
                setVehicle(vehicleOf(v));
                setScreenshot(v.screenshot_url);
                set({ vehicle_model: v.model });
              }}
            />
          </Field>

          <Field label="Rareté">
            <div className="flex flex-wrap gap-2">
              {catalog.rarities.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => set({ rarity: r.key })}
                  className={cx('h-8 px-3 rounded-full text-xs font-semibold border cursor-pointer flex items-center gap-1.5 transition-colors', draft.rarity === r.key ? 'text-black' : 'bg-white/[0.03]')}
                  style={draft.rarity === r.key ? { background: r.color, borderColor: r.color } : { color: r.color, borderColor: `${r.color}55` }}
                >
                  <Gem size={12} /> {r.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nom affiché" hint="Vide = nom du modèle.">
              <input value={draft.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} placeholder={modelName(draft.vehicle_model) || 'Nom du véhicule'} className={inputClass} />
            </Field>
            <Field label="Sous-titre" hint="Vide = identifiant du modèle.">
              <input value={draft.subtitle} maxLength={80} onChange={(e) => set({ subtitle: e.target.value })} placeholder="Ex. Édition limitée 2026" className={inputClass} />
            </Field>
          </div>

          <Field label="Image" hint="Vide = photo du catalogue (détourée). Collez une URL https://… ou un chemin /public.">
            <input value={draft.image_url} onChange={(e) => set({ image_url: e.target.value })} placeholder={vehicle?.photo_full_url ?? 'https://…'} className={inputClass} />
            {photoChoices.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                <Button size="sm" variant={!draft.image_url ? 'primary' : 'ghost'} onClick={() => set({ image_url: '' })}>
                  Auto
                </Button>
                {photoChoices.map((p) => (
                  <Button key={p.label} size="sm" variant={draft.image_url === p.url ? 'primary' : 'ghost'} onClick={() => set({ image_url: p.url! })}>
                    {p.label}
                  </Button>
                ))}
              </div>
            )}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Valeur affichée" hint={draft.value_override === null ? `Prix du catalogue : ${fmtMoney(vehicle?.price ?? 0)}` : 'Valeur personnalisée.'}>
              <div className="flex flex-col gap-2">
                <Toggle checked={draft.value_override === null} onChange={(v) => set({ value_override: v ? null : vehicle?.price ?? 0 })} label="Utiliser le prix du catalogue" />
                {draft.value_override !== null && <NumberInput value={draft.value_override} min={0} onChange={(v) => set({ value_override: Math.max(0, Math.round(v)) })} suffix="$" />}
              </div>
            </Field>
            <Field label="Couleur du cadre" hint="Vide = couleur de la rareté.">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={HEX.test(draft.accent_color) ? draft.accent_color : rarities[draft.rarity]?.color ?? '#ffffff'}
                  onChange={(e) => set({ accent_color: e.target.value })}
                  className="w-12 h-10 rounded-lg bg-transparent border border-white/10 cursor-pointer"
                />
                <input value={draft.accent_color} onChange={(e) => set({ accent_color: e.target.value })} placeholder="#rrggbb" className={cx(inputClass, 'font-mono')} />
                {draft.accent_color && (
                  <Button size="sm" variant="subtle" onClick={() => set({ accent_color: '' })}>
                    Auto
                  </Button>
                )}
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-white/10 p-4">
            <Toggle checked={draft.holo} onChange={(v) => set({ holo: v })} label="Effet holographique" hint="Forcé pour Épique et au-dessus." />
            <Toggle checked={draft.active} onChange={(v) => set({ active: v })} label="Carte active" hint="Inactive = ne sort plus des boosters." />
          </div>

          {catalog.packs.length > 0 && (
            <Field label="Présente dans les boosters">
              <div className="flex flex-wrap gap-2">
                {catalog.packs.map((p) => {
                  const on = packIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPackIds((ids) => (on ? ids.filter((i) => i !== p.id) : [...ids, p.id]))}
                      className={cx('h-8 px-3 rounded-full text-xs font-semibold border cursor-pointer flex items-center gap-1.5', on ? 'bg-white text-black border-white' : 'text-neutral-300 border-white/15 hover:border-white/30')}
                    >
                      <Package size={12} /> {p.name}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
        </div>

        <div className="flex flex-col items-center gap-4 lg:sticky lg:top-20 self-start">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500">Aperçu en direct (survolez)</span>
          <div className="rounded-2xl p-5 bg-[radial-gradient(circle_at_50%_30%,#1a1a22,#000)] border border-white/10">
            <BoosterCardFace card={rc} width={250} />
          </div>
          <div className="flex items-center gap-3 text-[11px] text-neutral-500">
            <BoosterCardBack width={60} />
            <span>Dos de carte commun à toute la collection.</span>
          </div>
        </div>
      </div>

      {errors.length > 0 && draft.vehicle_model && <p className="text-xs text-rose-300 mt-4">{errors.join(' ')}</p>}
      <div className="flex flex-wrap justify-end gap-2 mt-6 pt-4 border-t border-white/10">
        <Button variant="subtle" onClick={onClose} disabled={saving}>
          Annuler
        </Button>
        {card && (
          <Button onClick={() => void save(true)} disabled={saving || errors.length > 0}>
            <Copy size={13} /> Dupliquer
          </Button>
        )}
        <Button variant="primary" onClick={() => void save()} loading={saving} disabled={errors.length > 0}>
          {card ? 'Enregistrer' : 'Créer la carte'}
        </Button>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Création en masse
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLDS = [0, 10000, 40000, 150000, 1000000];

const BulkEditor: React.FC<{ catalog: BoosterCatalog; onClose: () => void; onDone: (n: number) => Promise<void>; showToast: Toast }> = ({ catalog, onClose, onDone, showToast }) => {
  const [classes, setClasses] = useState<string[]>(['SUPER']);
  const [makers, setMakers] = useState('');
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [thresholds, setThresholds] = useState(() => catalog.rarities.map((r, i) => ({ rarity: r.key, minPrice: DEFAULT_THRESHOLDS[i] ?? DEFAULT_THRESHOLDS[DEFAULT_THRESHOLDS.length - 1] * (i - 3) })));
  const [skip, setSkip] = useState(true);
  const [packId, setPackId] = useState('');
  const [busy, setBusy] = useState(false);
  const rarities = rarityMap(catalog.rarities);

  const run = async () => {
    setBusy(true);
    try {
      const n = await apiAdminBulkCreateBoosterCards({
        classes,
        manufacturers: makers.split(',').map((s) => s.trim()).filter(Boolean),
        minPrice,
        maxPrice,
        thresholds,
        skipExisting: skip,
        packId: packId || null,
      });
      await onDone(n);
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Création de cartes en masse" onClose={() => !busy && onClose()} width="max-w-3xl">
      <div className="flex flex-col gap-5">
        <Field label="Classes de véhicules" hint="Aucune classe = toutes (il faut alors indiquer au moins une marque).">
          <div className="flex flex-wrap gap-1.5">
            {CLASSES.map((c) => {
              const on = classes.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setClasses((l) => (on ? l.filter((x) => x !== c) : [...l, c]))}
                  className={cx('h-7 px-2.5 rounded-full text-[11px] font-semibold border cursor-pointer', on ? 'bg-white text-black border-white' : 'text-neutral-400 border-white/15 hover:text-white')}
                >
                  {c.replace(/_/g, ' ')}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Marques (optionnel)" hint="Séparées par des virgules : pegassi, grotti">
            <input value={makers} onChange={(e) => setMakers(e.target.value)} className={inputClass} placeholder="pegassi, truffade" />
          </Field>
          <Field label="Prix minimum">
            <NumberInput value={minPrice ?? 0} min={0} onChange={(v) => setMinPrice(v > 0 ? v : null)} suffix="$" />
          </Field>
          <Field label="Prix maximum" hint="0 = sans limite">
            <NumberInput value={maxPrice ?? 0} min={0} onChange={(v) => setMaxPrice(v > 0 ? v : null)} suffix="$" />
          </Field>
        </div>
        <Field label="Rareté selon le prix du véhicule" hint="Chaque véhicule reçoit la rareté du palier le plus haut qu'il atteint.">
          <div className="flex flex-col gap-2">
            {thresholds.map((t, i) => (
              <div key={t.rarity} className="grid grid-cols-[130px_1fr] items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: rarities[t.rarity]?.color }}>
                  <Gem size={12} /> {rarities[t.rarity]?.label ?? t.rarity}
                </span>
                <NumberInput value={t.minPrice} min={0} onChange={(v) => setThresholds((l) => l.map((x, j) => (j === i ? { ...x, minPrice: Math.max(0, v) } : x)))} suffix="$ et +" />
              </div>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <Toggle checked={skip} onChange={setSkip} label="Ignorer les véhicules qui ont déjà une carte" />
          <Field label="Ajouter directement au booster">
            <select value={packId} onChange={(e) => setPackId(e.target.value)} className={cx(inputClass, 'bg-neutral-900 cursor-pointer')}>
              <option value="">— Aucun —</option>
              {catalog.packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-[11px] text-neutral-500">Uniquement les véhicules en concession avec un vrai prix (≥ 500 $). 500 véhicules maximum par opération, du plus cher au moins cher.</p>
        <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
          <Button variant="subtle" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="primary" onClick={() => void run()} loading={busy} disabled={!classes.length && !makers.trim()}>
            <Wand2 size={13} /> Générer les cartes
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Boosters
// ---------------------------------------------------------------------------

const PacksSection: React.FC<SectionProps> = ({ catalog, reload, showToast }) => {
  const cardsById = useMemo(() => Object.fromEntries(catalog.cards.map((c) => [c.id, c])), [catalog.cards]);
  const [editing, setEditing] = useState<BoosterPackData | 'new' | null>(null);
  const [confirm, setConfirm] = useState<BoosterPackData | null>(null);
  const [testing, setTesting] = useState<BoosterPackData | null>(null);
  const { gamesConfig } = useCasinoAdmin();
  const maxRtp = catalog.max_rtp ?? gamesConfig.boosters.maxRtp;
  const [busy, setBusy] = useState(false);

  const remove = async (p: BoosterPackData) => {
    setBusy(true);
    try {
      await apiAdminDeleteBoosterPack(p.id);
      showToast('Booster supprimé.');
      await reload();
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <>
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus size={13} /> Nouveau booster
        </Button>
      </div>
      {catalog.packs.length === 0 ? (
        <Card>
          <EmptyState icon={<Package size={32} />} title="Aucun booster" hint="Créez un booster, choisissez son prix, ses chances par rareté et les cartes qu'il contient." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {catalog.packs.map((p) => {
            const odds = packOdds(p, cardsById, catalog.rarities);
            const ev = p.ev ?? packExpectedValue(p, cardsById, catalog.rarities);
            const rtp = p.rtp ?? packRtp(ev, p.price);
            const losing = rtp > maxRtp;
            return (
              <Card key={p.id}>
                <div className="flex gap-5">
                  <div className="shrink-0">
                    <BoosterPack pack={p} width={96} />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-white font-bold truncate">{p.name}</h3>
                          {p.active ? (losing ? <Badge tone="bad">Caché : perdant</Badge> : <Badge tone="good">En vente</Badge>) : <Badge tone="neutral">Masqué</Badge>}
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {fmtChips(p.price)} · {p.cards_per_pack} carte(s) · {p.cards.length} carte(s) possible(s)
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" onClick={() => setTesting(p)} disabled={!odds.length} title="Simuler des ouvertures pour vérifier les taux">
                          <FlaskConical size={12} /> Tester
                        </Button>
                        <Button size="sm" onClick={() => setEditing(p)}>
                          <Pencil size={12} /> Modifier
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setConfirm(p)}>
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>
                    {odds.length ? (
                      <div className="flex h-2.5 rounded-full overflow-hidden bg-white/5">
                        {odds.map((o) => (
                          <div key={o.rarity.key} title={`${o.rarity.label} ${o.pct.toFixed(2)} %`} style={{ width: `${o.pct}%`, background: o.rarity.color }} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-rose-300">Aucune carte jouable : ce booster ne peut pas être ouvert.</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-400">
                      {odds.map((o) => (
                        <span key={o.rarity.key}>
                          <span style={{ color: o.rarity.color }}>●</span> {o.rarity.label} {o.pct.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %
                        </span>
                      ))}
                    </div>
                    <div className={cx('rounded-lg border px-3 py-2 text-[11px] flex flex-wrap gap-x-4 gap-y-1', losing ? 'border-rose-400/30 bg-rose-500/[0.06]' : 'border-emerald-400/20 bg-emerald-500/[0.04]')}>
                      <span className="text-neutral-400">
                        Valeur moy. : <b className="text-white font-mono">{fmtMoney(ev)}</b>
                      </span>
                      <span className="text-neutral-400">
                        Retour joueur : <b className={cx('font-mono', losing ? 'text-rose-300' : 'text-white')}>{fmt(rtp, 1)} %</b>
                      </span>
                      <span className={losing ? 'text-rose-300 font-semibold' : 'text-emerald-300'}>
                        {losing ? `Perdant (max ${fmt(maxRtp)} %) : invisible pour les joueurs` : `Marge casino ${fmt(100 - rtp, 1)} %`}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <PackEditor
          catalog={catalog}
          pack={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null);
            showToast(msg);
            await reload();
          }}
          showToast={showToast}
        />
      )}
      {testing && <SimulationModal catalog={catalog} pack={testing} onClose={() => setTesting(null)} showToast={showToast} />}
      {confirm && (
        <Modal title={`Supprimer « ${confirm.name} » ?`} onClose={() => !busy && setConfirm(null)}>
          <p className="text-[13px] text-neutral-300">Le booster disparaît de la boutique. Les cartes restent disponibles pour les autres boosters et l'historique des ouvertures est conservé.</p>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="subtle" onClick={() => setConfirm(null)} disabled={busy}>
              Annuler
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void remove(confirm)}>
              Supprimer
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Testeur de taux
// ---------------------------------------------------------------------------

const SimulationModal: React.FC<{ catalog: BoosterCatalog; pack: BoosterPackData; onClose: () => void; showToast: Toast }> = ({ catalog, pack, onClose, showToast }) => {
  const rarities = useMemo(() => rarityMap(catalog.rarities), [catalog.rarities]);
  const cardsById = useMemo(() => Object.fromEntries(catalog.cards.map((c) => [c.id, c])), [catalog.cards]);
  const [count, setCount] = useState(5000);
  const [running, setRunning] = useState(false);
  const [sim, setSim] = useState<BoosterSimulation | null>(null);

  const expected = useMemo(() => expectedRarityShares(pack, cardsById, catalog.rarities), [pack, cardsById, catalog.rarities]);
  const odds = packOdds(pack, cardsById, catalog.rarities);

  const run = async () => {
    setRunning(true);
    try {
      setSim(await apiAdminSimulateBooster(pack.id, count));
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setRunning(false);
    }
  };

  // Comparaison par rareté : écart toléré = 3 écarts-types (hasard normal)
  const rows = sim
    ? odds.map((o) => {
        const exp = expected[o.rarity.key] ?? 0;
        const got = sim.rarities.find((r) => r.rarity === o.rarity.key)?.count ?? 0;
        const obs = sim.cards_drawn ? got / sim.cards_drawn : 0;
        const sigma = Math.sqrt((exp * (1 - exp)) / Math.max(1, sim.cards_drawn));
        const ok = Math.abs(obs - exp) <= 3 * sigma + 1e-9;
        return { rarity: o.rarity, exp, obs, got, ok, margin: 3 * sigma };
      })
    : [];
  const allOk = rows.every((r) => r.ok);

  // Cartes : attendu = part de la rareté × poids de la carte / poids total de la rareté
  const cardRows = useMemo(() => {
    if (!sim) return [];
    const wByRarity: Record<string, number> = {};
    for (const pc of pack.cards) {
      const c = cardsById[pc.card_id];
      if (c?.active) wByRarity[c.rarity] = (wByRarity[c.rarity] ?? 0) + pc.weight;
    }
    const got = Object.fromEntries(sim.cards.map((c) => [c.card_id, c.count]));
    return pack.cards
      .map((pc) => ({ pc, c: cardsById[pc.card_id] }))
      .filter((x) => x.c?.active && expected[x.c.rarity] !== undefined)
      .map(({ pc, c }) => ({
        id: c.id,
        card: resolveCard(c, rarities),
        exp: (expected[c.rarity] * pc.weight) / (wByRarity[c.rarity] || 1),
        count: got[c.id] ?? 0,
      }))
      .sort((a, b) => b.card.rarity.sort - a.card.rarity.sort || b.exp - a.exp);
  }, [sim, pack.cards, cardsById, expected, rarities]);
  const never = cardRows.filter((r) => r.count === 0).length;
  const pct = (x: number, d = 2) => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d })} %`;

  return (
    <Modal title={`Tester les taux · ${pack.name}`} onClose={() => !running && onClose()} width="max-w-4xl">
      <div className="flex flex-col gap-5">
        <p className="text-[13px] text-neutral-400">
          Le serveur ouvre des boosters « à blanc » avec <b className="text-white">exactement le même tirage que le jeu</b> : aucun jeton débité, aucun véhicule
          distribué. Les résultats sont comparés aux taux réglés (garantie comprise).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={count}
            onChange={setCount}
            options={[
              { value: 1000, label: '1 000 boosters' },
              { value: 5000, label: '5 000' },
              { value: 10000, label: '10 000' },
            ]}
          />
          <Button variant="primary" onClick={() => void run()} loading={running}>
            <FlaskConical size={13} /> {sim ? 'Relancer' : 'Lancer la simulation'}
          </Button>
          {running && <span className="text-xs text-neutral-500">Tirage de {fmt(count * pack.cards_per_pack)} cartes…</span>}
        </div>

        {sim && (
          <>
            <div className={cx('rounded-xl border px-4 py-3 flex items-start gap-3', allOk ? 'border-emerald-400/30 bg-emerald-500/[0.06]' : 'border-amber-400/30 bg-amber-500/[0.06]')}>
              {allOk ? <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" /> : <TriangleAlert size={18} className="text-amber-300 shrink-0 mt-0.5" />}
              <div className="text-[13px]">
                <div className={cx('font-semibold', allOk ? 'text-emerald-300' : 'text-amber-200')}>
                  {allOk ? 'Taux conformes : le tirage respecte vos réglages.' : 'Écart inhabituel sur au moins une rareté.'}
                </div>
                <div className="text-neutral-400 mt-0.5">
                  {fmt(sim.packs)} boosters · {fmt(sim.cards_drawn)} cartes · {fmt(sim.ms / 1000, 1)} s
                  {pack.guaranteed_rarity && <> · garantie forcée {fmt(sim.forced)} fois ({pct(sim.forced / sim.packs, 1)} des boosters)</>}
                  {!allOk && <> — relancez : un écart isolé peut arriver par hasard ; s'il revient à chaque fois, vérifiez les réglages.</>}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-[11px] text-neutral-500 text-left border-b border-white/10">
                    <th className="px-4 py-2.5 font-medium">Rareté</th>
                    <th className="px-3 py-2.5 font-medium text-right">Cartes</th>
                    <th className="px-3 py-2.5 font-medium text-right">Attendu</th>
                    <th className="px-3 py-2.5 font-medium text-right">Obtenu</th>
                    <th className="px-4 py-2.5 font-medium text-right">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rows.map((r) => (
                    <tr key={r.rarity.key}>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5 font-semibold" style={{ color: r.rarity.color }}>
                          <Gem size={12} /> {r.rarity.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-neutral-300">{fmt(r.got)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-neutral-400">{pct(r.exp)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-white">{pct(r.obs)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {r.ok ? <Badge tone="good">OK (± {pct(r.margin)})</Badge> : <Badge tone="warn">Écart {pct(r.obs - r.exp)}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {(
                [
                  ['Valeur moyenne', sim.value.avg],
                  ['Médiane', sim.value.p50],
                  ['1 booster sur 10 ≥', sim.value.p90],
                  ['1 sur 100 ≥', sim.value.p99],
                  ['Meilleur tirage', sim.value.max],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="rounded-xl bg-white/[0.03] border border-white/10 p-3 min-w-0">
                  <div className="text-[10px] text-neutral-500 truncate">{label}</div>
                  <div className="font-mono text-[14px] font-semibold text-white truncate">{fmtMoney(Number(v))}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-neutral-500 -mt-3">
              Valeur totale des véhicules d'un booster (prix : {fmtChips(pack.price)}). Retour joueur mesuré :{' '}
              <b className={cx('font-mono', packRtp(sim.value.avg, pack.price) > (catalog.max_rtp ?? 90) ? 'text-rose-300' : 'text-emerald-300')}>{fmt(packRtp(sim.value.avg, pack.price), 1)} %</b>
            </p>

            <div className="rounded-xl border border-white/10">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 text-[12px]">
                <span className="font-semibold text-white">Détail par carte</span>
                <span className="text-neutral-500">{never ? `${never} carte(s) jamais sortie(s) sur ce test` : 'Toutes les cartes sont sorties au moins une fois'}</span>
              </div>
              <div className="grid grid-cols-[1fr_70px_80px_80px] gap-3 px-4 py-2 border-b border-white/10 text-[10px] text-neutral-500">
                <span>Carte</span>
                <span className="text-right">Sorties</span>
                <span className="text-right">Attendu</span>
                <span className="text-right">Obtenu</span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-white/5">
                {cardRows.map((r) => (
                  <div key={r.id} className="grid grid-cols-[1fr_70px_80px_80px] items-center gap-3 px-4 py-2 text-[12px]">
                    <span className="truncate text-white">
                      <span style={{ color: r.card.rarity.color }}>●</span> {r.card.brand} {r.card.title}
                    </span>
                    <span className="text-right font-mono text-neutral-400">{fmt(r.count)}</span>
                    <span className="text-right font-mono text-neutral-500">{pct(r.exp, 3)}</span>
                    <span className="text-right font-mono text-white">{pct(sim.cards_drawn ? r.count / sim.cards_drawn : 0, 3)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

const PackEditor: React.FC<{
  catalog: BoosterCatalog;
  pack: BoosterPackData | null;
  onClose: () => void;
  onSaved: (msg: string) => Promise<void>;
  showToast: Toast;
}> = ({ catalog, pack, onClose, onSaved, showToast }) => {
  const rarities = useMemo(() => rarityMap(catalog.rarities), [catalog.rarities]);
  const cardsById = useMemo(() => Object.fromEntries(catalog.cards.map((c) => [c.id, c])), [catalog.cards]);
  const [draft, setDraft] = useState<Omit<BoosterPackData, 'id'>>(() =>
    pack
      ? { ...pack, description: pack.description ?? '', cover_image_url: pack.cover_image_url ?? '' }
      : {
          name: '',
          description: '',
          price: 25000,
          cards_per_pack: 5,
          rarity_weights: Object.fromEntries(catalog.rarities.map((r, i) => [r.key, [60, 25, 10, 4, 1][i] ?? 1])),
          guaranteed_rarity: catalog.rarities[1]?.key ?? null,
          cover_image_url: '',
          accent_color: '#c9a44c',
          active: true,
          sort_order: catalog.packs.length,
          cards: [],
        },
  );
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState('');
  const [onlyIncluded, setOnlyIncluded] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...p }));

  const included = useMemo(() => new Map(draft.cards.map((pc) => [pc.card_id, pc.weight])), [draft.cards]);
  const countByRarity = useMemo(() => {
    const m: Record<string, number> = {};
    for (const pc of draft.cards) {
      const c = cardsById[pc.card_id];
      if (c?.active) m[c.rarity] = (m[c.rarity] ?? 0) + 1;
    }
    return m;
  }, [draft.cards, cardsById]);
  const odds = packOdds(draft, cardsById, catalog.rarities);
  const oddsByKey = Object.fromEntries(odds.map((o) => [o.rarity.key, o.pct]));
  const ev = packExpectedValue(draft, cardsById, catalog.rarities);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.cards
      .filter((c) => !rarity || c.rarity === rarity)
      .filter((c) => !onlyIncluded || included.has(c.id))
      .filter((c) => !q || [c.title, c.vehicle_model, c.vehicle?.manufacturer, c.vehicle?.class].some((s) => s?.toLowerCase().includes(q)))
      .sort((a, b) => (rarities[b.rarity]?.sort ?? 0) - (rarities[a.rarity]?.sort ?? 0) || b.value - a.value);
  }, [catalog.cards, query, rarity, onlyIncluded, included, rarities]);

  const setCard = (id: string, weight: number | null) =>
    set({ cards: weight === null ? draft.cards.filter((pc) => pc.card_id !== id) : included.has(id) ? draft.cards.map((pc) => (pc.card_id === id ? { ...pc, weight } : pc)) : [...draft.cards, { card_id: id, weight }] });

  const addAll = () => set({ cards: [...draft.cards, ...filtered.filter((c) => !included.has(c.id)).map((c) => ({ card_id: c.id, weight: 1 }))] });
  const removeAll = () => {
    const ids = new Set(filtered.map((c) => c.id));
    set({ cards: draft.cards.filter((pc) => !ids.has(pc.card_id)) });
  };

  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('Donnez un nom au booster.');
  if (draft.name.length > 40) errors.push('Nom trop long (40 max).');
  if (!(draft.price >= 1)) errors.push('Prix invalide.');
  if (draft.cover_image_url && !URL_RE.test(draft.cover_image_url)) errors.push('URL de couverture invalide.');
  if (!HEX.test(draft.accent_color)) errors.push('Couleur invalide.');
  const warnings = catalog.rarities.filter((r) => (draft.rarity_weights[r.key] ?? 0) > 0 && !countByRarity[r.key]);

  // Rentabilité (1 jeton = 1 $) : le serveur refuse un booster en vente au-dessus du retour max
  const { gamesConfig } = useCasinoAdmin();
  const maxRtp = catalog.max_rtp ?? gamesConfig.boosters.maxRtp;
  const [targetRtp, setTargetRtp] = useState(() => Math.min(85, maxRtp));
  const [tiltError, setTiltError] = useState<string | null>(null);
  const rtp = packRtp(ev, draft.price);
  const losing = draft.cards.length > 0 && rtp > maxRtp;
  if (draft.active && losing) errors.push(`Booster perdant : retour joueur ${fmt(rtp, 1)} % (max ${fmt(maxRtp)} %). Ajustez le prix ou les chances.`);

  const adjustPrice = () => {
    setTiltError(null);
    set({ price: suggestPrice(ev, targetRtp) });
  };
  const adjustChances = () => {
    const w = tiltRarityWeights(draft, cardsById, catalog.rarities, (draft.price * targetRtp) / 100);
    if (!w) {
      const floor = packExpectedValue({ ...draft, rarity_weights: Object.fromEntries(Object.keys(draft.rarity_weights).map((k, i) => [k, i === 0 ? 1 : 0.0001])) }, cardsById, catalog.rarities);
      setTiltError(
        `Impossible avec ce prix : même en rendant les cartes chères quasi introuvables, un booster vaut au moins ~${fmtMoney(floor)}. ` +
          `Ajoutez des cartes moins chères, baissez le nombre de cartes, ou montez le prix (≥ ${fmtChips(suggestPrice(floor, targetRtp))}).`,
      );
      return;
    }
    setTiltError(null);
    set({ rarity_weights: { ...Object.fromEntries(Object.keys(draft.rarity_weights).map((k) => [k, 0])), ...w } });
  };

  const save = async () => {
    if (errors.length) return;
    setSaving(true);
    try {
      await apiAdminSaveBoosterPack({
        ...(pack ? { id: pack.id } : {}),
        ...draft,
        name: draft.name.trim(),
        cards_per_pack: Math.min(10, Math.max(1, Math.round(draft.cards_per_pack))),
        price: Math.round(draft.price),
      });
      await onSaved(pack ? 'Booster mis à jour.' : 'Booster créé.');
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  const coverChoices = draft.cards
    .map((pc) => cardsById[pc.card_id])
    .filter((c) => c?.vehicle?.photo_full_url)
    .sort((a, b) => (rarities[b.rarity]?.sort ?? 0) - (rarities[a.rarity]?.sort ?? 0) || b.value - a.value)
    .slice(0, 6);

  return (
    <Modal title={pack ? `Modifier · ${pack.name}` : 'Nouveau booster'} onClose={() => !saving && onClose()} width="max-w-6xl">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <div className="flex flex-col gap-6 min-w-0">
          {/* Général */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nom">
              <input value={draft.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} placeholder="Ex. Supercars Deluxe" className={inputClass} />
            </Field>
            <Field label="Description" hint="Affichée sous le booster (200 caractères max).">
              <input value={draft.description ?? ''} maxLength={200} onChange={(e) => set({ description: e.target.value })} placeholder="Les plus belles sportives de Los Santos" className={inputClass} />
            </Field>
            <Field label="Prix" hint="Débité en jetons à l'ouverture.">
              <NumberInput value={draft.price} min={1} onChange={(v) => set({ price: v })} suffix="⛁" />
            </Field>
            <Field label="Cartes par booster" hint="1 à 10.">
              <NumberInput value={draft.cards_per_pack} min={1} max={10} onChange={(v) => set({ cards_per_pack: v })} />
            </Field>
            <Field label="Couleur du paquet">
              <div className="flex items-center gap-2">
                <input type="color" value={HEX.test(draft.accent_color) ? draft.accent_color : '#ffffff'} onChange={(e) => set({ accent_color: e.target.value })} className="w-12 h-10 rounded-lg bg-transparent border border-white/10 cursor-pointer" />
                <input value={draft.accent_color} onChange={(e) => set({ accent_color: e.target.value })} className={cx(inputClass, 'font-mono')} />
              </div>
            </Field>
            <Field label="Ordre d'affichage" hint="Plus petit = en premier.">
              <NumberInput value={draft.sort_order} onChange={(v) => set({ sort_order: Math.round(v) })} />
            </Field>
          </div>
          <Field label="Image de couverture" hint="Vide = icône. URL https://… ou chemin /public, ou choisissez une voiture du booster.">
            <input value={draft.cover_image_url ?? ''} onChange={(e) => set({ cover_image_url: e.target.value })} placeholder="https://…" className={inputClass} />
            {coverChoices.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {coverChoices.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => set({ cover_image_url: c.vehicle!.photo_full_url! })}
                    className={cx('w-20 h-12 rounded-lg border bg-black/40 overflow-hidden cursor-pointer', draft.cover_image_url === c.vehicle!.photo_full_url ? 'border-white' : 'border-white/10 hover:border-white/30')}
                    title={resolveCard(c, rarities).title}
                  >
                    <img src={c.vehicle!.photo_url ?? c.vehicle!.photo_full_url!} alt="" className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </Field>
          <Toggle checked={draft.active} onChange={(v) => set({ active: v })} label="En vente" hint="Masqué = invisible pour les joueurs." />

          {/* Rentabilité */}
          <div className={cx('rounded-xl border p-4 flex flex-col gap-3', losing ? 'border-rose-400/40 bg-rose-500/[0.05]' : 'border-emerald-400/25 bg-emerald-500/[0.04]')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-white">Rentabilité pour le casino</span>
              {losing ? <Badge tone="bad">Perdant</Badge> : draft.cards.length ? <Badge tone="good">Gagnant</Badge> : <Badge>—</Badge>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
              <div>
                <div className="text-neutral-500">Prix</div>
                <div className="font-mono text-white">{fmtChips(draft.price)}</div>
              </div>
              <div>
                <div className="text-neutral-500">Valeur moy. véhicules</div>
                <div className="font-mono text-white">{fmtMoney(ev)}</div>
              </div>
              <div>
                <div className="text-neutral-500">Retour joueur</div>
                <div className={cx('font-mono', losing ? 'text-rose-300' : 'text-white')}>{fmt(rtp, 1)} %</div>
              </div>
              <div>
                <div className="text-neutral-500">Marge casino</div>
                <div className={cx('font-mono', losing ? 'text-rose-300' : 'text-emerald-300')}>{fmtChips(Math.round(draft.price - ev))}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-white/10">
              <Field label="Retour joueur visé" hint={`Max autorisé : ${fmt(maxRtp)} % (réglable dans Machines → Boosters).`} className="w-44">
                <NumberInput value={targetRtp} min={1} max={maxRtp} onChange={(v) => setTargetRtp(Math.min(maxRtp, Math.max(1, v)))} suffix="%" />
              </Field>
              <Button onClick={adjustPrice} disabled={!draft.cards.length} title="Garde les chances, calcule le prix">
                Ajuster le prix
              </Button>
              <Button onClick={adjustChances} disabled={!draft.cards.length} title="Garde le prix, rend les cartes chères plus rares">
                Ajuster les chances
              </Button>
            </div>
            {tiltError && <p className="text-[11px] text-amber-300">{tiltError}</p>}
            <p className="text-[11px] text-neutral-500">
              1 jeton = 1 $. Sur 100 jetons dépensés, le joueur récupère en moyenne {fmt(Math.min(rtp, 9999), 1)} $ de véhicules. Un booster en vente doit rester sous {fmt(maxRtp)} %.
            </p>
          </div>

          {/* Chances */}
          <div className="rounded-xl border border-white/10 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-white">Chances par rareté</span>
              <span className="text-[11px] text-neutral-500">Poids relatifs, convertis en % pour chaque carte tirée</span>
            </div>
            {catalog.rarities.map((r) => (
              <div key={r.key} className="grid grid-cols-[120px_110px_1fr_64px] items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: r.color }}>
                  <Gem size={12} /> {r.label}
                </span>
                <NumberInput value={draft.rarity_weights[r.key] ?? 0} min={0} step={0.1} onChange={(v) => set({ rarity_weights: { ...draft.rarity_weights, [r.key]: Math.max(0, v) } })} />
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${oddsByKey[r.key] ?? 0}%`, background: r.color }} />
                </div>
                <span className="text-right font-mono text-xs text-white">{oddsByKey[r.key] !== undefined ? `${oddsByKey[r.key].toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %` : '—'}</span>
              </div>
            ))}
            {warnings.length > 0 && (
              <p className="text-[11px] text-amber-300">
                Aucune carte {warnings.map((r) => r.label).join(', ')} dans ce booster : ces raretés sont ignorées au tirage.
              </p>
            )}
            <Field label="Rareté garantie" hint="Au moins une carte de ce niveau ou mieux par booster (forcée sur la dernière carte si besoin).">
              <select value={draft.guaranteed_rarity ?? ''} onChange={(e) => set({ guaranteed_rarity: e.target.value || null })} className={cx(inputClass, 'bg-neutral-900 cursor-pointer')}>
                <option value="">Aucune</option>
                {catalog.rarities.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label} ou mieux
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Cartes */}
          <div className="rounded-xl border border-white/10 flex flex-col">
            <div className="flex flex-wrap items-center gap-2 p-3 border-b border-white/10">
              <span className="text-[13px] font-semibold text-white mr-auto">
                Cartes incluses <span className="text-neutral-500 font-normal">({draft.cards.length})</span>
              </span>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrer…" className={cx(inputClass, 'h-8 pl-8 w-40 text-xs')} />
              </div>
              <select value={rarity} onChange={(e) => setRarity(e.target.value)} className={cx(selectClass, 'h-8 text-xs')}>
                <option value="">Toutes raretés</option>
                {catalog.rarities.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
              <Button size="sm" variant={onlyIncluded ? 'primary' : 'ghost'} onClick={() => setOnlyIncluded((v) => !v)}>
                Incluses seulement
              </Button>
              <Button size="sm" onClick={addAll}>
                <Plus size={12} /> Tout ajouter
              </Button>
              <Button size="sm" variant="subtle" onClick={removeAll}>
                Tout retirer
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
              {filtered.length === 0 ? (
                <p className="p-4 text-xs text-neutral-500">Aucune carte. Créez-en dans l'onglet Cartes.</p>
              ) : (
                filtered.map((c) => {
                  const rc = resolveCard(c, rarities);
                  const w = included.get(c.id);
                  const on = w !== undefined;
                  return (
                    <div key={c.id} className={cx('flex items-center gap-3 px-3 py-2', !c.active && 'opacity-50')}>
                      <input type="checkbox" checked={on} onChange={() => setCard(c.id, on ? null : 1)} className="accent-white w-4 h-4 cursor-pointer" />
                      <div className="w-14 h-9 rounded-md bg-black/50 border border-white/10 overflow-hidden shrink-0">{rc.image && <img src={c.vehicle?.photo_url ?? rc.image} alt="" className="w-full h-full object-contain" loading="lazy" />}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white font-medium truncate">
                          {rc.brand} {rc.title}
                        </div>
                        <div className="text-[11px] text-neutral-500 truncate">
                          <span style={{ color: rc.rarity.color }}>{rc.rarity.label}</span> · {rc.vehicleClass} · {fmtMoney(rc.value)}
                          {!c.active && ' · inactive'}
                        </div>
                      </div>
                      {on && (
                        <label className="flex items-center gap-1.5 text-[11px] text-neutral-400" title="Poids de la carte parmi celles de même rareté">
                          Poids
                          <input
                            type="number"
                            min={1}
                            max={1000}
                            value={w}
                            onChange={(e) => setCard(c.id, Math.min(1000, Math.max(1, Math.round(Number(e.target.value) || 1))))}
                            className="w-16 h-8 px-2 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-white font-mono"
                          />
                        </label>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Aperçu */}
        <div className="flex flex-col items-center gap-4 lg:sticky lg:top-20 self-start">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500">Aperçu</span>
          <div className="rounded-2xl px-6 py-8 bg-[radial-gradient(circle_at_50%_30%,#1a1a22,#000)] border border-white/10">
            <BoosterPack pack={{ id: pack?.id ?? 'new', name: draft.name || 'Nom du booster', cover_image_url: URL_RE.test(draft.cover_image_url ?? '') ? draft.cover_image_url : null, accent_color: HEX.test(draft.accent_color) ? draft.accent_color : '#ffffff', cards_per_pack: draft.cards_per_pack }} width={180} />
          </div>
          <div className="w-full rounded-xl border border-white/10 p-3 text-[12px] flex flex-col gap-1.5">
            <div className="flex justify-between">
              <span className="text-neutral-400">Prix</span>
              <span className="font-mono text-white">{fmtChips(draft.price)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Valeur moy. véhicules</span>
              <span className="font-mono text-white">{fmtMoney(ev)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Retour joueur</span>
              <span className={cx('font-mono', losing ? 'text-rose-300' : 'text-emerald-300')}>{fmt(rtp, 1)} %</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Cartes possibles</span>
              <span className="font-mono text-white">{draft.cards.length}</span>
            </div>
          </div>
        </div>
      </div>

      {errors.length > 0 && <p className="text-xs text-rose-300 mt-4">{errors.join(' ')}</p>}
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-white/10">
        <Button variant="subtle" onClick={onClose} disabled={saving}>
          Annuler
        </Button>
        <Button variant="primary" onClick={() => void save()} loading={saving} disabled={errors.length > 0}>
          {pack ? 'Enregistrer' : 'Créer le booster'}
        </Button>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Raretés
// ---------------------------------------------------------------------------

const RaritiesSection: React.FC<SectionProps> = ({ catalog, reload, showToast }) => {
  const [draft, setDraft] = useState<(BoosterRarity & { _new?: boolean })[]>(catalog.rarities);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(catalog.rarities), [catalog.rarities]);
  const clean = (l: (BoosterRarity & { _new?: boolean })[]) => l.map(({ _new, ...r }) => r);
  const dirty = JSON.stringify(clean(draft)) !== JSON.stringify(catalog.rarities);
  const used = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of catalog.cards) m[c.rarity] = (m[c.rarity] ?? 0) + 1;
    return m;
  }, [catalog.cards]);

  const sample = catalog.cards[0];
  const update = (i: number, p: Partial<BoosterRarity>) => setDraft((d) => d.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const n = [...d];
      const j = i + dir;
      if (j < 0 || j >= n.length) return d;
      [n[i], n[j]] = [n[j], n[i]];
      return n.map((r, k) => ({ ...r, sort: k }));
    });

  const errors: string[] = [];
  const keys = draft.map((r) => r.key);
  if (draft.some((r) => !/^[A-Z0-9_]{2,20}$/.test(r.key))) errors.push('Identifiant invalide (2 à 20 lettres majuscules, chiffres ou _).');
  if (new Set(keys).size !== keys.length) errors.push('Identifiants en double.');
  if (draft.some((r) => !r.label.trim() || r.label.length > 30)) errors.push('Nom manquant ou trop long.');
  if (draft.some((r) => !HEX.test(r.color))) errors.push('Couleur invalide.');

  const save = async () => {
    setSaving(true);
    try {
      await apiAdminSaveBoosterRarities(clean(draft).map((r, i) => ({ ...r, sort: i, label: r.label.trim() })));
      showToast('Raretés enregistrées.');
      await reload();
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SaveBar dirty={dirty && !errors.length} saving={saving} onSave={() => void save()} onReset={() => setDraft(catalog.rarities)} />
      {errors.length > 0 && <p className="text-xs text-rose-300">{errors.join(' ')}</p>}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        <Card title="Niveaux de rareté" icon={<Gem size={15} />} padded={false} right={<Button size="sm" onClick={() => setDraft((d) => [...d, { key: `NIVEAU_${d.length + 1}`, label: 'Nouveau', color: '#22d3ee', effect: 'glow', sort: d.length, _new: true }])} disabled={draft.length >= 12}><Plus size={12} /> Ajouter</Button>}>
          <div className="divide-y divide-white/5">
            {draft.map((r, i) => {
              const isNew = !!r._new;
              return (
                <div key={i} className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_130px_1fr_150px_150px_auto] items-center gap-3 px-4 py-3">
                  <div className="flex flex-col">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-neutral-500 hover:text-white disabled:opacity-20 cursor-pointer" aria-label="Monter">
                      <ArrowUp size={13} />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === draft.length - 1} className="text-neutral-500 hover:text-white disabled:opacity-20 cursor-pointer" aria-label="Descendre">
                      <ArrowDown size={13} />
                    </button>
                  </div>
                  <input
                    value={r.key}
                    disabled={!isNew}
                    onChange={(e) => update(i, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                    className={cx(inputClass, 'font-mono text-xs', !isNew && 'opacity-50')}
                    title={isNew ? 'Identifiant' : 'Identifiant (non modifiable)'}
                  />
                  <input value={r.label} maxLength={30} onChange={(e) => update(i, { label: e.target.value })} className={inputClass} placeholder="Nom affiché" />
                  <div className="flex items-center gap-2">
                    <input type="color" value={HEX.test(r.color) ? r.color : '#ffffff'} onChange={(e) => update(i, { color: e.target.value })} className="w-10 h-10 rounded-lg bg-transparent border border-white/10 cursor-pointer shrink-0" />
                    <input value={r.color} onChange={(e) => update(i, { color: e.target.value })} className={cx(inputClass, 'font-mono text-xs')} />
                  </div>
                  <select value={r.effect} onChange={(e) => update(i, { effect: e.target.value as BoosterEffect })} className={cx(inputClass, 'bg-neutral-900 text-white cursor-pointer [color-scheme:dark]')} title={EFFECTS.find((x) => x.value === r.effect)?.hint}>
                    {EFFECTS.map((x) => (
                      <option key={x.value} value={x.value} className="bg-neutral-900 text-white">
                        {x.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-[11px] text-neutral-500 whitespace-nowrap">{fmt(used[r.key] ?? 0)} carte(s)</span>
                    <Button size="sm" variant="danger" disabled={!!used[r.key] || draft.length <= 1} onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} title={used[r.key] ? 'Utilisée par des cartes' : 'Supprimer'}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <div className="flex flex-col items-center gap-4">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500">Aperçu par rareté</span>
          <div className="flex flex-wrap justify-center gap-3">
            {draft.map((r) => (
              <div key={r.key} className="flex flex-col items-center gap-1">
                <BoosterCardFace
                  lite
                  width={120}
                  card={resolveCard(
                    sample
                      ? { ...sample, rarity: r.key, accent_color: null, holo: false }
                      : { id: 'x', vehicle_model: 'vehicule', rarity: r.key, title: 'Véhicule', subtitle: null, image_url: null, value_override: null, accent_color: null, holo: false, active: true, vehicle: null, value: 0 },
                    { [r.key]: r },
                  )}
                />
                <span className="text-[10px] text-neutral-500">{EFFECTS.find((x) => x.value === r.effect)?.hint}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <HelpBox title="À quoi servent les raretés ?">
        <p>
          Chaque carte a une rareté. Dans chaque booster, vous réglez la chance de tirer chaque rareté ; puis une carte de cette rareté est choisie au
          hasard (selon son poids). L'<b>effet</b> règle la mise en scène à l'ouverture : de la simple carte à l'écran noir + explosion du mythique.
        </p>
        <p>L'ordre compte : plus bas dans la liste = plus rare (utilisé pour la rareté garantie).</p>
      </HelpBox>
    </>
  );
};

// ---------------------------------------------------------------------------
// Concession : véhicules autorisés dans les boosters
// ---------------------------------------------------------------------------

const DealershipSection: React.FC<{ reload: () => Promise<void>; showToast: Toast }> = ({ reload, showToast }) => {
  const [query, setQuery] = useState('');
  const [vClass, setVClass] = useState('');
  const [status, setStatus] = useState<'all' | 'in' | 'out'>('all');
  const [rows, setRows] = useState<VehicleCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await dbSearchVehicles(query, { vehicleClass: vClass || undefined, limit: 400 }));
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }, [query, vClass, showToast]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  const list = rows.filter((v) => (status === 'in' ? v.in_dealership : status === 'out' ? !v.in_dealership : true));

  const setMany = async (models: string[], value: boolean, key: string) => {
    if (!models.length) return;
    setBusy(key);
    try {
      const n = await apiAdminSetVehicleDealership(models, value);
      showToast(value ? `${n} véhicule(s) ajouté(s) à la concession.` : `${n} véhicule(s) retiré(s) : leurs cartes sont désactivées.`);
      setRows((l) => l.map((v) => (models.includes(v.model) ? { ...v, in_dealership: value } : v)));
      if (!value) await reload();
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <HelpBox title="À quoi sert la concession ?" defaultOpen>
        <p>
          Seuls les véhicules <b>vendus en concession</b> peuvent devenir des cartes de booster (création manuelle et création en masse). Le catalogue CTG ne
          l'indique pas : par défaut sont retenus les voitures, motos, vélos et quads avec un vrai prix (≥ 500 $), hors police, secours, service, militaire et
          industriel, et <b>sans les imports</b> (véhicules ajoutés par le serveur, DLC « CTG » et « gabz »). Corrigez ici si besoin.
        </p>
        <p>Retirer un véhicule de la concession désactive aussitôt ses cartes (elles ne sortent plus des boosters).</p>
      </HelpBox>
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-white/10">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Modèle ou marque…" className={cx(inputClass, 'pl-9')} />
          </div>
          <select value={vClass} onChange={(e) => setVClass(e.target.value)} className={selectClass}>
            <option value="">Toutes classes</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'in', label: 'En concession' },
              { value: 'out', label: 'Hors concession' },
            ]}
          />
          <div className="flex gap-2 ml-auto">
            <Button size="sm" loading={busy === 'all-in'} onClick={() => void setMany(list.filter((v) => !v.in_dealership).map((v) => v.model), true, 'all-in')}>
              Tout ajouter ({list.filter((v) => !v.in_dealership).length})
            </Button>
            <Button size="sm" variant="danger" loading={busy === 'all-out'} onClick={() => void setMany(list.filter((v) => v.in_dealership).map((v) => v.model), false, 'all-out')}>
              Tout retirer ({list.filter((v) => v.in_dealership).length})
            </Button>
          </div>
        </div>
        <div className="max-h-[560px] overflow-y-auto divide-y divide-white/5">
          {loading && !rows.length ? (
            <p className="p-4 text-xs text-neutral-500">Chargement…</p>
          ) : list.length === 0 ? (
            <p className="p-4 text-xs text-neutral-500">Aucun véhicule.</p>
          ) : (
            list.map((v) => (
              <div key={v.model} className="flex items-center gap-3 px-4 py-2">
                <div className="w-16 h-10 rounded-lg overflow-hidden bg-neutral-900 shrink-0 flex items-center justify-center text-neutral-600">
                  {v.photo_url ? <img src={v.photo_url} alt="" className="w-full h-full object-contain" loading="lazy" /> : <Car size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white font-medium truncate">
                    {v.manufacturer ? `${v.manufacturer.charAt(0)}${v.manufacturer.slice(1).toLowerCase()} ` : ''}
                    {v.model}
                  </div>
                  <div className="text-[11px] text-neutral-500 truncate">
                    {['ctg', 'gabz'].includes((v.dlc || '').toLowerCase()) && <span className="text-amber-300 font-semibold">Import · </span>}
                    {(v.class || '').replace(/_/g, ' ')} · {v.type} · {Number(v.price) >= 500 ? fmtMoney(Number(v.price)) : <span className="text-amber-300">prix non renseigné</span>}
                  </div>
                </div>
                <Toggle checked={!!v.in_dealership} disabled={busy !== null} onChange={(val) => void setMany([v.model], val, v.model)} />
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  );
};
