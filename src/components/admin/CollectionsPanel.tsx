/**
 * Console → Collections : albums de cartes « marques » (prix du booster,
 * récompense, chances par rareté), cartes, raretés (prix de revente) et
 * concession véhicules. Le serveur recalcule la rentabilité à chaque
 * enregistrement et refuse un album perdant pour le casino.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Gem, Layers, Pencil, Plus, RefreshCw, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import {
  apiAdminCollectionCatalog,
  apiAdminDeleteCollectionCard,
  apiAdminSaveCollectionCard,
  apiAdminSaveCollectionRarities,
  apiAdminSaveCollectionSet,
  type AdminCollectionCard,
  type AdminCollectionCatalog,
  type BoosterEffect,
  type CollectionFont,
  type CollectionRarity,
  type CollectionSetData,
} from '../../lib/supabase';
import { BrandCardFace } from '../collections/BrandCard';
import { FONT_LABELS, fmtPct, logoPath, rarityMap, resolveBrandCard, setOdds } from '../collections/collectionUtils';
import { DealershipSection } from './DealershipSection';
import { VehiclePicker } from './VehiclePicker';
import { vehicleDisplayName } from '../../lib/rewards';
import { Badge, Button, Card, EmptyState, Field, HelpBox, Modal, NumberInput, PageHeader, Segmented, Toggle, cx, fmt, fmtChips, inputClass } from './ui';

type Toast = (m: string, error?: boolean) => void;
type Section = 'sets' | 'cards' | 'rarities' | 'dealership';

const selectClass = inputClass.replace('w-full ', '') + ' w-auto bg-neutral-900 text-white cursor-pointer [color-scheme:dark]';

/**
 * Pastille de la liste des cartes : logo de la marque (URL saisie ou fichier
 * public/logos/<album>/<marque>.png), sinon monogramme aux couleurs de la marque.
 */
const LogoBadge: React.FC<{ card: AdminCollectionCard }> = ({ card }) => {
  const src = card.image_url?.trim() || (card.name ? logoPath(card.set_id, card.name) : null);
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src) {
    return (
      <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border border-white/10" style={{ background: card.color }}>
        <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className="max-w-[85%] max-h-[85%] object-contain" />
      </span>
    );
  }
  return (
    <span className="w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: card.color, color: card.color2 }}>
      {card.emblem || card.name?.charAt(0)}
    </span>
  );
};

const EFFECTS: { value: BoosterEffect; label: string }[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'glow', label: 'Lueur' },
  { value: 'holo', label: 'Holo' },
  { value: 'rays', label: 'Rayons' },
  { value: 'mythic', label: 'Mythique' },
];

export const CollectionsPanel: React.FC<{ showToast: Toast }> = ({ showToast }) => {
  const [section, setSection] = useState<Section>('sets');
  const [catalog, setCatalog] = useState<AdminCollectionCatalog | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setCatalog(await apiAdminCollectionCatalog());
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);
  useEffect(() => void reload(), [reload]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Collections"
        subtitle="Albums de cartes « marques » (autos & mode) : prix du booster, récompense d'album, chances, prix de revente des doublons. Plus la concession des véhicules."
        actions={
          <>
            <Segmented
              value={section}
              onChange={setSection}
              options={[
                { value: 'sets', label: 'Albums' },
                { value: 'cards', label: 'Cartes' },
                { value: 'rarities', label: 'Raretés' },
                { value: 'dealership', label: 'Concession' },
              ]}
            />
            <Button onClick={() => void reload()} loading={loading}>
              <RefreshCw size={13} /> Actualiser
            </Button>
          </>
        }
      />
      {section === 'dealership' ? (
        <DealershipSection showToast={showToast} />
      ) : !catalog ? (
        <EmptyState title="Chargement…" />
      ) : section === 'sets' ? (
        <SetsSection catalog={catalog} reload={reload} showToast={showToast} />
      ) : section === 'cards' ? (
        <CardsSection catalog={catalog} reload={reload} showToast={showToast} />
      ) : (
        <RaritiesSection catalog={catalog} reload={reload} showToast={showToast} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Albums
// ---------------------------------------------------------------------------

const SetsSection: React.FC<{ catalog: AdminCollectionCatalog; reload: () => Promise<void>; showToast: Toast }> = ({ catalog, reload, showToast }) => (
  <>
    <HelpBox title="Comment marche l'économie d'un album ?">
      <p>
        Chaque booster contient N cartes tirées au hasard selon les <b>chances par rareté</b> de l'album. Compléter l'album (toutes les cartes hors
        secrètes) rapporte la <b>récompense</b>, une seule fois par joueur. Les doublons se revendent au prix de leur rareté (onglet Raretés).
      </p>
      <p>
        Le serveur calcule exactement le <b>nombre moyen de boosters pour compléter</b> l'album. Il refuse un réglage où (récompense + reventes) dépasse{' '}
        {fmt(catalog.config.maxRtp)} % de ce que le joueur dépense en moyenne, ou si la revente moyenne d'un booster dépasse {fmt(catalog.config.packMaxRtp)} %
        de son prix (limites réglables dans Machines → Collections). Pour rendre un album plus dur : baissez les chances des cartes Mythiques / Légendaires.
      </p>
    </HelpBox>
    {catalog.sets.map((s) => (
      <SetEditor key={s.id} set={s} catalog={catalog} reload={reload} showToast={showToast} />
    ))}
    <NewSetCard catalog={catalog} reload={reload} showToast={showToast} />
  </>
);

/** « Super Voitures » → « super-voitures » (identifiant d'album) */
const slugify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

/**
 * Création d'un nouvel album. Il est créé caché : on y ajoute ses cartes
 * (onglet Cartes), puis on le met en vente depuis sa fiche ci-dessus.
 */
const NewSetCard: React.FC<{ catalog: AdminCollectionCatalog; reload: () => Promise<void>; showToast: Toast }> = ({ catalog, reload, showToast }) => {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const id = slugify(name);
  const taken = catalog.sets.some((s) => s.id === id);

  const create = async () => {
    if (id.length < 2) {
      showToast('Donnez un nom à l’album.', true);
      return;
    }
    if (taken) {
      showToast('Un album porte déjà ce nom.', true);
      return;
    }
    setBusy(true);
    try {
      await apiAdminSaveCollectionSet({
        id,
        name: name.trim().slice(0, 40),
        subtitle: null,
        description: null,
        accent_color: '#38bdf8',
        pack_price: 25000,
        cards_per_pack: 5,
        reward: 1000000,
        rarity_weights: { COMMUNE: 57, RARE: 27, EPIQUE: 10, LEGENDAIRE: 4.9, MYTHIQUE: 1, SECRETE: 0.1 },
        active: false,
        sort_order: catalog.sets.length,
      });
      showToast('Album créé (caché). Ajoutez ses cartes dans l’onglet Cartes, puis mettez-le en vente.');
      setName('');
      await reload();
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Nouvel album" icon={<Plus size={15} />}>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <Field label="Nom de l'album" className="flex-1" hint={id ? `Identifiant : ${id}${taken ? ' (déjà pris)' : ''}` : 'Ex. « Supercars », « Motos de Los Santos »…'}>
          <input className={inputClass} value={name} maxLength={40} placeholder="Supercars" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button variant="primary" loading={busy} disabled={id.length < 2 || taken} onClick={() => void create()}>
          <Plus size={13} /> Créer l'album
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-neutral-500 leading-relaxed">
        L'album est créé <b>caché</b>, avec les réglages par défaut (booster 25 000, 5 cartes, récompense 1 000 000). Ajoutez ensuite ses cartes dans{' '}
        <b>Cartes</b> — une marque, un véhicule du catalogue (photo comprise) ou n'importe quoi d'autre — au moins une par rareté utilisée, puis réglez
        les chances et cochez « Album en vente ». Le serveur refuse la mise en vente tant que l'album n'est pas complet et rentable.
      </p>
    </Card>
  );
};

const SetEditor: React.FC<{ set: CollectionSetData; catalog: AdminCollectionCatalog; reload: () => Promise<void>; showToast: Toast }> = ({ set, catalog, reload, showToast }) => {
  const [draft, setDraft] = useState(set);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(set), [set]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(set);
  const odds = setOdds(draft, catalog.cards, catalog.rarities);
  const st = set.stats ?? {};

  const save = async () => {
    setSaving(true);
    try {
      await apiAdminSaveCollectionSet({
        id: draft.id,
        name: draft.name,
        subtitle: draft.subtitle,
        description: draft.description,
        accent_color: draft.accent_color,
        pack_price: draft.pack_price,
        cards_per_pack: draft.cards_per_pack,
        reward: draft.reward,
        rarity_weights: draft.rarity_weights,
        active: draft.active,
        sort_order: draft.sort_order,
      });
      showToast('Album enregistré.');
      await reload();
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={draft.name}
      icon={<Layers size={15} />}
      right={
        <div className="flex items-center gap-2">
          {set.ok ? <Badge tone="good">En vente</Badge> : <Badge tone="bad">Caché aux joueurs</Badge>}
          <Badge>{fmt(set.players ?? 0)} joueurs</Badge>
          <Badge tone="gold">{fmt(set.completions ?? 0)} album(s) complété(s)</Badge>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Boosters moyens pour finir" value={st.expected_packs != null ? fmt(st.expected_packs, 1) : '—'} />
        <MiniStat label="Coût moyen pour finir" value={st.expected_cost != null ? fmtChips(st.expected_cost) : '—'} />
        <MiniStat
          label="Retour joueur (album complet)"
          value={st.completion_rtp != null ? `${fmt(st.completion_rtp, 1)} %` : '—'}
          bad={st.completion_rtp != null && st.completion_rtp > catalog.config.maxRtp}
        />
        <MiniStat label="Revente moyenne d'un booster" value={st.pack_rtp != null ? `${fmtChips(st.pack_resale_ev ?? 0)} · ${fmt(st.pack_rtp, 1)} %` : '—'} bad={(st.pack_rtp ?? 0) > catalog.config.packMaxRtp} />
      </div>
      {(st.unreachable ?? 0) > 0 && (
        <p className="mt-3 text-xs text-rose-300 flex items-center gap-1.5">
          <TriangleAlert size={13} /> {st.unreachable} carte(s) d'album ne peuvent pas sortir (rareté à 0 %) : album impossible à compléter.
        </p>
      )}
      <p className="mt-2 text-[11px] text-neutral-500">Statistiques du dernier enregistrement (calcul serveur). Enregistrez pour les mettre à jour.</p>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nom">
          <input className={inputClass} value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Sous-titre">
          <input className={inputClass} value={draft.subtitle ?? ''} maxLength={60} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} />
        </Field>
        <Field label="Description" className="md:col-span-2">
          <input className={inputClass} value={draft.description ?? ''} maxLength={300} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </Field>
        <Field label="Prix du booster">
          <NumberInput value={draft.pack_price} min={1} onChange={(v) => setDraft({ ...draft, pack_price: Math.max(1, Math.round(v)) })} suffix="⛁" />
        </Field>
        <Field label="Cartes par booster">
          <NumberInput value={draft.cards_per_pack} min={1} max={10} onChange={(v) => setDraft({ ...draft, cards_per_pack: Math.min(10, Math.max(1, Math.round(v))) })} />
        </Field>
        <Field label="Récompense de l'album complet" hint="Créditée automatiquement, une fois par joueur.">
          <NumberInput value={draft.reward} min={0} onChange={(v) => setDraft({ ...draft, reward: Math.max(0, Math.round(v)) })} suffix="⛁" />
        </Field>
        <Field label="Couleur du paquet">
          <input type="color" className="h-10 w-full rounded-xl bg-transparent border border-white/10 cursor-pointer" value={draft.accent_color} onChange={(e) => setDraft({ ...draft, accent_color: e.target.value })} />
        </Field>
      </div>

      <div className="mt-5">
        <p className="text-[11px] font-medium text-neutral-400 mb-2">Poids par rareté (chance de chaque carte tirée)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {catalog.rarities.map((r) => {
            const o = odds.find((x) => x.rarity.key === r.key);
            return (
              <Field key={r.key} label={r.label} hint={o ? `${fmtPct(o.pct)} · ${o.count} carte(s)` : 'Jamais tirée'}>
                <NumberInput
                  value={Number(draft.rarity_weights[r.key]) || 0}
                  min={0}
                  step={0.1}
                  onChange={(v) => setDraft({ ...draft, rarity_weights: { ...draft.rarity_weights, [r.key]: Math.max(0, v) } })}
                />
              </Field>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="w-64">
          <Toggle checked={draft.active !== false} onChange={(v) => setDraft({ ...draft, active: v })} label="Album en vente" />
        </div>
        <div className="flex gap-2">
          <Button variant="subtle" onClick={() => setDraft(set)} disabled={!dirty || saving}>
            Annuler
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!dirty}>
            Enregistrer
          </Button>
        </div>
      </div>
    </Card>
  );
};

const MiniStat: React.FC<{ label: string; value: React.ReactNode; bad?: boolean }> = ({ label, value, bad }) => (
  <div className={cx('rounded-xl border p-3', bad ? 'border-rose-400/30 bg-rose-500/5' : 'border-white/10 bg-white/[0.03]')}>
    <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
    <div className={cx('mt-1 font-mono font-bold text-sm', bad ? 'text-rose-300' : 'text-white')}>{value}</div>
  </div>
);

// ---------------------------------------------------------------------------
// Cartes
// ---------------------------------------------------------------------------

const CardsSection: React.FC<{ catalog: AdminCollectionCatalog; reload: () => Promise<void>; showToast: Toast }> = ({ catalog, reload, showToast }) => {
  const [setId, setSetId] = useState(catalog.sets[0]?.id ?? '');
  const [editing, setEditing] = useState<Partial<AdminCollectionCard> | null>(null);
  const rarities = useMemo(() => rarityMap(catalog.rarities), [catalog]);
  const set = catalog.sets.find((s) => s.id === setId);
  const cards = catalog.cards.filter((c) => c.set_id === setId);

  return (
    <>
      <HelpBox title="Logos des marques">
        <p>
          Sans logo, une carte affiche un logo typographique aux couleurs de la marque (police, couleurs et monogramme ci-dessous). Pour mettre le vrai logo :
          déposez un PNG transparent dans <code className="text-white">public/logos/{'<album>'}/{'<marque>'}.png</code> (ex.{' '}
          <code className="text-white">{logoPath('autos', 'Pegassi')}</code>), ou collez l'URL d'une image dans la carte.
        </p>
      </HelpBox>
      <Card
        padded={false}
        title={
          <select value={setId} onChange={(e) => setSetId(e.target.value)} className={selectClass}>
            {catalog.sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        }
        right={
          <Button variant="primary" size="sm" onClick={() => setEditing({ set_id: setId, rarity: 'COMMUNE', font: 'tight', color: '#d9b25f', color2: '#111111', active: true, weight: 1 })}>
            <Plus size={12} /> Nouvelle carte
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-[11px] text-neutral-500 text-left border-b border-white/10">
                <th className="px-5 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Marque</th>
                <th className="px-3 py-2.5 font-medium">Rareté</th>
                <th className="px-3 py-2.5 font-medium text-right">Poids</th>
                <th className="px-3 py-2.5 font-medium text-right">Joueurs</th>
                <th className="px-3 py-2.5 font-medium text-right">Tirées</th>
                <th className="px-5 py-2.5 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {cards.map((c) => {
                const r = rarities[c.rarity];
                return (
                  <tr key={c.id} className={cx(!c.active && 'opacity-45')}>
                    <td className="px-5 py-2 font-mono text-neutral-400">{String(c.number).padStart(2, '0')}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <LogoBadge card={c} />
                        <div className="min-w-0">
                          <div className="text-white font-medium truncate">{c.name}</div>
                          <div className="text-[11px] text-neutral-500 truncate">{c.tagline}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs font-semibold flex items-center gap-1" style={{ color: r?.color }}>
                        {r && !r.in_collection ? <Sparkles size={12} /> : <Gem size={12} />} {r?.label ?? c.rarity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-300">{c.weight}</td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-300">{fmt(c.owners)}</td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-300">{fmt(c.found)}</td>
                    <td className="px-5 py-2 text-right">
                      <Button size="sm" variant="subtle" onClick={() => setEditing(c)}>
                        <Pencil size={12} /> Modifier
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && set && (
        <CardEditor
          initial={editing}
          set={set}
          rarities={catalog.rarities}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
          showToast={showToast}
        />
      )}
    </>
  );
};

const CardEditor: React.FC<{
  initial: Partial<AdminCollectionCard>;
  set: CollectionSetData;
  rarities: CollectionRarity[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  showToast: Toast;
}> = ({ initial, set, rarities, onClose, onSaved, showToast }) => {
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickVehicle, setPickVehicle] = useState(false);
  const preview = resolveBrandCard(
    { id: d.id ?? 'preview', set_id: set.id, number: d.number ?? 0, rarity: d.rarity ?? 'COMMUNE', active: true, hidden: false, ...d, name: d.name || 'Marque' },
    rarityMap(rarities),
  );

  const save = async () => {
    if (!d.name?.trim()) {
      showToast('Indiquez le nom de la marque.', true);
      return;
    }
    setBusy('save');
    try {
      await apiAdminSaveCollectionCard({ ...d, set_id: set.id, name: d.name.trim(), rarity: d.rarity ?? 'COMMUNE' });
      showToast('Carte enregistrée.');
      await onSaved();
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!d.id) return;
    setBusy('delete');
    try {
      await apiAdminDeleteCollectionCard(d.id);
      showToast('Carte supprimée.');
      await onSaved();
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title={d.id ? `Modifier · ${initial.name}` : 'Nouvelle carte'} onClose={onClose} width="max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <button type="button" onClick={() => setPickVehicle((v) => !v)} className="text-xs text-sky-300 hover:text-sky-200 underline underline-offset-4 cursor-pointer">
              {pickVehicle ? 'Fermer le catalogue' : 'Remplir depuis un véhicule du catalogue (nom + photo)'}
            </button>
            {pickVehicle && (
              <div className="mt-2">
                <VehiclePicker
                  className="max-h-56"
                  onSelect={(v) => {
                    const brand = (v.manufacturer || '').trim();
                    const label = vehicleDisplayName(v.manufacturer, v.model.charAt(0).toUpperCase() + v.model.slice(1));
                    setD({
                      ...d,
                      name: label.slice(0, 40),
                      tagline: (v.class || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (x) => x.toUpperCase()) || d.tagline,
                      image_url: v.photo_full_url || v.photo_url || d.image_url,
                      emblem: (brand.charAt(0) || v.model.charAt(0)).toUpperCase(),
                    });
                    setPickVehicle(false);
                  }}
                />
              </div>
            )}
          </div>
          <Field label="Nom (marque, véhicule…)" className="col-span-2">
            <input className={inputClass} value={d.name ?? ''} maxLength={40} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </Field>
          <Field label="Slogan" className="col-span-2">
            <input className={inputClass} value={d.tagline ?? ''} maxLength={60} onChange={(e) => setD({ ...d, tagline: e.target.value })} />
          </Field>
          <Field label="Rareté">
            <select className={cx(selectClass, 'w-full')} value={d.rarity} onChange={(e) => setD({ ...d, rarity: e.target.value })}>
              {rarities.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                  {!r.in_collection ? ' (secrète, hors album)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Numéro dans l'album">
            <NumberInput value={d.number ?? 0} min={1} max={999} onChange={(v) => setD({ ...d, number: v > 0 ? Math.round(v) : undefined })} />
          </Field>
          <Field label="Couleur principale">
            <input type="color" className="h-10 w-full rounded-xl bg-transparent border border-white/10 cursor-pointer" value={d.color ?? '#d9b25f'} onChange={(e) => setD({ ...d, color: e.target.value })} />
          </Field>
          <Field label="Couleur du logo">
            <input type="color" className="h-10 w-full rounded-xl bg-transparent border border-white/10 cursor-pointer" value={d.color2 ?? '#111111'} onChange={(e) => setD({ ...d, color2: e.target.value })} />
          </Field>
          <Field label="Police du logo">
            <select className={cx(selectClass, 'w-full')} value={d.font ?? 'tight'} onChange={(e) => setD({ ...d, font: e.target.value as CollectionFont })}>
              {(Object.keys(FONT_LABELS) as CollectionFont[]).map((f) => (
                <option key={f} value={f}>
                  {FONT_LABELS[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Monogramme (1 à 3 lettres)">
            <input className={inputClass} value={d.emblem ?? ''} maxLength={3} onChange={(e) => setD({ ...d, emblem: e.target.value })} />
          </Field>
          <Field label="Logo (URL, facultatif)" className="col-span-2" hint={`Sinon : fichier ${logoPath(set.id, d.name || 'marque')} s'il existe.`}>
            <input className={inputClass} value={d.image_url ?? ''} maxLength={500} placeholder="https://… ou /logos/…" onChange={(e) => setD({ ...d, image_url: e.target.value })} />
          </Field>
          <Field label="Poids dans sa rareté" hint="1 = normal. 2 = sort deux fois plus souvent que les autres cartes de la même rareté.">
            <NumberInput value={d.weight ?? 1} min={1} max={1000} onChange={(v) => setD({ ...d, weight: Math.min(1000, Math.max(1, Math.round(v))) })} />
          </Field>
          <div className="flex items-end pb-2">
            <Toggle checked={d.active !== false} onChange={(v) => setD({ ...d, active: v })} label="Active" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <BrandCardFace card={preview} width={210} setName={set.name} />
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        {d.id ? (
          confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-300">Supprimer aussi les exemplaires des joueurs ?</span>
              <Button variant="danger" size="sm" loading={busy === 'delete'} onClick={() => void remove()}>
                Confirmer
              </Button>
              <Button variant="subtle" size="sm" onClick={() => setConfirmDelete(false)}>
                Non
              </Button>
            </div>
          ) : (
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={12} /> Supprimer
            </Button>
          )
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="subtle" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" loading={busy === 'save'} onClick={() => void save()}>
            Enregistrer
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Raretés
// ---------------------------------------------------------------------------

const RaritiesSection: React.FC<{ catalog: AdminCollectionCatalog; reload: () => Promise<void>; showToast: Toast }> = ({ catalog, reload, showToast }) => {
  const [draft, setDraft] = useState<CollectionRarity[]>(catalog.rarities);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(catalog.rarities), [catalog]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(catalog.rarities);
  const patch = (i: number, p: Partial<CollectionRarity>) => setDraft((l) => l.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const save = async () => {
    setSaving(true);
    try {
      await apiAdminSaveCollectionRarities(draft.map((r, i) => ({ ...r, sort: i })));
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
      <HelpBox title="Raretés et revente">
        <p>
          <b>Valeur</b> : valeur d'une carte. Un doublon se revend à {fmt(catalog.config.sellRate)} % de sa valeur ({fmt(catalog.config.sellRate + catalog.config.sellBonusGold)} % en Gold,{' '}
          {fmt(catalog.config.sellRate + catalog.config.sellBonusDiamond)} % en Diamond — taux réglables dans Machines → Collections). Seuls les doublons se
          revendent, cartes secrètes comprises : le premier exemplaire reste dans l'album. Les raretés <b>hors album</b> sont les cartes secrètes. Le serveur
          refuse un réglage qui rendrait un album perdant (calculé au meilleur taux VIP).
        </p>
      </HelpBox>
      <Card title="Niveaux de rareté" icon={<Gem size={15} />} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-[11px] text-neutral-500 text-left border-b border-white/10">
                <th className="px-5 py-2.5 font-medium">Clé</th>
                <th className="px-3 py-2.5 font-medium">Libellé</th>
                <th className="px-3 py-2.5 font-medium">Couleur</th>
                <th className="px-3 py-2.5 font-medium">Effet</th>
                <th className="px-3 py-2.5 font-medium">Valeur (revente {fmt(catalog.config.sellRate)} %)</th>
                <th className="px-5 py-2.5 font-medium">Compte dans l'album</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {draft.map((r, i) => (
                <tr key={r.key}>
                  <td className="px-5 py-2 font-mono text-xs text-neutral-400">{r.key}</td>
                  <td className="px-3 py-2">
                    <input className={inputClass} value={r.label} maxLength={30} onChange={(e) => patch(i, { label: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="color" className="h-10 w-16 rounded-xl bg-transparent border border-white/10 cursor-pointer" value={r.color} onChange={(e) => patch(i, { color: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    <select className={selectClass} value={r.effect} onChange={(e) => patch(i, { effect: e.target.value as BoosterEffect })}>
                      {EFFECTS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 w-40">
                    <NumberInput value={r.sell_value} min={0} onChange={(v) => patch(i, { sell_value: Math.max(0, Math.round(v)) })} suffix="⛁" />
                    <span className="block mt-1 text-[10px] font-mono text-neutral-500">
                      revendue {fmt(Math.floor((r.sell_value * catalog.config.sellRate) / 100))} · Diamond{' '}
                      {fmt(Math.floor((r.sell_value * (catalog.config.sellRate + catalog.config.sellBonusDiamond)) / 100))}
                    </span>
                  </td>
                  <td className="px-5 py-2 w-44">
                    <Toggle checked={r.in_collection} onChange={(v) => patch(i, { in_collection: v })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dirty && (
          <div className="flex justify-end gap-2 p-4 border-t border-white/10">
            <Button variant="subtle" onClick={() => setDraft(catalog.rarities)} disabled={saving}>
              Annuler
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              Enregistrer
            </Button>
          </div>
        )}
      </Card>
    </>
  );
};
